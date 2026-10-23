/**
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok (`tsconfig.types`
 * yalnız `["jest"]`). `require` jest ortamında çalışıyor.
 */
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

import { TextInput, TouchableOpacity } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import SheetSearchInput from '@/shared/components/SheetSearchInput';

/**
 * SEÇİCİ SHEET'LERİNİN ARAMA KAPSÜLÜ (şehir / dil / kampüs / bölüm / prompt —
 * beşi de bu bileşen).
 *
 * ── Testin asıl işi: KLAVYE AÇILMASI ───────────────────────────────────────
 * Kapsül bir zamanlar `TouchableOpacity`ydi ve odağı `onPress` içinde
 * `inputRef.current?.focus()` ile veriyordu. Input'a basınca HİÇBİR ŞEY
 * olmuyordu: `BottomSheetTextInput`in gövdesinde RNGH'nin native sarmalı var ve
 * bir RN Touchable'ın içinde dokunuş iki tarafın arasında kalıyor.
 *
 * Native odak jest'te doğrulanamıyor (klavye yok), o yüzden kural KAYNAK
 * ÜZERİNDEN çivileniyor — `campusDevLocation`ın release güvenliği testindeki
 * aynı yaklaşım. Davranış tarafında ise değer/temizleme kablolaması gerçekten
 * koşuyor.
 */

jest.mock('@gorhom/bottom-sheet', () => {
  // Gerçek bileşen `useBottomSheetInternal()` çağırıyor ve bir sheet'in dışında
  // patlıyor; burada tek ilgilendiğimiz şey kapsülün YERLEŞİMİ ve kablolaması.
  const { TextInput } = require('react-native');
  return { __esModule: true, BottomSheetTextInput: TextInput };
});

describe('SheetSearchInput — kablolama', () => {
  it('yazılan metin çağırana gidiyor', () => {
    const onChangeText = jest.fn();
    render(<SheetSearchInput value="" onChangeText={onChangeText} />);
    fireEvent.changeText(screen.UNSAFE_getByType(TextInput), 'boğ');
    expect(onChangeText).toHaveBeenCalledWith('boğ');
  });

  it('temizle çipi YALNIZ yazı varken çiziliyor ve sıfırlıyor', () => {
    const onChangeText = jest.fn();
    const { rerender } = render(
      <SheetSearchInput value="" onChangeText={onChangeText} />,
    );
    /**
     * ⚠️ DOKUNULABİLİR SAYISI ÖLÇÜLÜYOR, bir etiket değil: kapsülün kendisi
     * artık Touchable DEĞİL (bkz. aşağıdaki kural), yani boş hâlde ağaçta
     * dokunulabilir HİÇ olmamalı. Çip gelince tam bir tane oluyor. Bu sayım
     * kapsül tekrar Touchable'a çevrilirse de düşüyor.
     */
    expect(screen.UNSAFE_queryAllByType(TouchableOpacity)).toHaveLength(0);

    rerender(<SheetSearchInput value="boun" onChangeText={onChangeText} />);
    const touchables = screen.UNSAFE_queryAllByType(TouchableOpacity);
    expect(touchables).toHaveLength(1);
    fireEvent.press(touchables[0]);
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

// ── Kaynak kuralları: dokunuşu input'un KENDİSİ almalı ─────────────────────

describe('SheetSearchInput — klavye kuralları', () => {
  const SOURCE = readFileSync(
    'src/shared/components/SheetSearchInput.tsx',
    'utf8',
  );
  /** Kapsülün kendisi — temizle çipinin Touchable'ı bunun dışında kalsın. */
  const CAPSULE = SOURCE.slice(0, SOURCE.indexOf('{hasText &&'));

  it('🔴 kapsül bir TOUCHABLE DEĞİL — RN touch, RNGH input\'un dokunuşunu yutuyor', () => {
    expect(CAPSULE).not.toMatch(/<TouchableOpacity/);
    expect(CAPSULE).not.toMatch(/<Pressable/);
  });

  it('odak REF ÜZERİNDEN verilmiyor', () => {
    // gorhom'un `useImperativeHandle`ı boş bağımlılıkla kurulu ve RNGH
    // sarmalından `null` dönebiliyor; odağı ona bağlamak sessizce çalışmayan
    // bir input demek. Ref yalnız `clear()` için duruyor.
    expect(SOURCE).not.toMatch(/\.focus\(\)/);
    expect(SOURCE).toMatch(/inputRef\.current\?\.clear\(\)/);
  });

  it('büyüteç DOKUNUŞ ALMIYOR ve input kapsülü DOLDURUYOR', () => {
    // İkisi birlikte olmak zorunda: ikon dokunuş alırsa solda odaklamayan ölü
    // bir şerit kalıyor, input gerilmezse yazı ikonun altına kaçıyor (bir tur
    // tam olarak bu yaşandı).
    expect(CAPSULE).toMatch(/pointerEvents="none"/);
    expect(CAPSULE).toMatch(/alignSelf: "stretch"/);
    // Dikey dolgu/yükseklik hizayı geri bozuyor.
    expect(CAPSULE).toMatch(/padding: 0/);
  });
});
