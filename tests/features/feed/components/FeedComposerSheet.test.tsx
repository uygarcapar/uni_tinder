/**
 * Akış gönderi composer'ı.
 *
 * Test edilen asıl şeyler:
 *  1. ANONİM KAPISI `/api/feed/me`den, premium tier'dan DEĞİL. Kadın kullanıcı
 *     free olduğu halde anonim paylaşabiliyor; tier'a bakan bir kapı onu
 *     yanlışlıkla kilitlerdi. Kilitliyken anahtar TEPKİSİZ ve dokunuş paywall'a
 *     gidiyor — yanlışlıkla açılıp UT-7305 yenmesin.
 *  2. `anonymousGate` "unknown" iken KİLİT ÇİZİLMEZ. /me henüz gelmemişken
 *     kilit göstermek kullanıcıya olmayan bir kısıt uydurur.
 *  3. Hata metni verildiğinde sheet AÇIK KALIR ve yazılan metin KORUNUR
 *     (UT-7306'da hak düşmüyor, kullanıcı metnini düzeltip tekrar gönderebilmeli).
 *  4. Karakter sayacı code point sayıyor — emoji 1.
 */

// Gerçek AppModal gorhom'un BottomSheetModal bağlamını istiyor; kod tabanının
// hazır mock'u (src/shared/components/__mocks__/AppModal.tsx) sheet'i düz bir
// View'a indiriyor — bu suite'in konusu sheet mekaniği değil, composer mantığı.
jest.mock('@/shared/components/AppModal');
// gorhom'un input'u da native sheet bağlamı istiyor; düz TextInput yeterli.
jest.mock('@gorhom/bottom-sheet', () => {
  const actual = jest.requireActual('@gorhom/bottom-sheet');
  const RN = require('react-native');
  return { ...actual, BottomSheetTextInput: RN.TextInput };
});
// Klavye takibi bu testin konusu değil; hook reanimated + keyboard-controller
// çekiyor, ikisi de bu suite'te gereksiz.
jest.mock('@/shared/hooks/useKeyboardAwareField', () => ({
  useKeyboardAwareField: () => ({
    anchorRef: { current: null },
    onFocus: jest.fn(),
    onBlur: jest.fn(),
  }),
}));

import { act, render, screen, fireEvent } from '@testing-library/react-native';
import FeedComposerSheet from '@/features/feed/components/FeedComposerSheet';
import type { AnonymousGate } from '@/features/feed/feedPolicy';
import tr from '@/shared/i18n/translations/tr';

const ALLOWED: AnonymousGate = { kind: 'allowed' };
const PAYWALL: AnonymousGate = { kind: 'paywall', paywallType: 'FEED_ANONYMOUS' };
const RESTRICTED: AnonymousGate = { kind: 'restricted' };
const UNKNOWN: AnonymousGate = { kind: 'unknown' };

const setup = (over: Partial<React.ComponentProps<typeof FeedComposerSheet>> = {}) => {
  const onSend = jest.fn();
  const onClose = jest.fn();
  const onAnonymousPaywall = jest.fn();
  const utils = render(
    <FeedComposerSheet
      visible
      onClose={onClose}
      onSend={onSend}
      maxLength={400}
      anonymousGate={ALLOWED}
      onAnonymousPaywall={onAnonymousPaywall}
      universityLabel="itu.edu.tr"
      {...over}
    />,
  );
  return { onSend, onClose, onAnonymousPaywall, ...utils };
};

const typeBody = (text: string) => {
  const input = screen.UNSAFE_getByProps({
    placeholder: tr.feed.composer.placeholder,
  });
  fireEvent.changeText(input, text);
  return input;
};

/**
 * Metni yaz ve gönder.
 *
 * ⚠️ Araya `act` BOŞALTMASI şart: RHF `mode:'onChange'` + zodResolver ile
 * doğrulamayı ASENKRON koşuyor ve gönder butonu `isValid` gelene kadar
 * `disabled`. Hemen basılırsa basış sessizce yutuluyor ve test "0 çağrı" görüyor
 * — üstelik bu gerçek davranış, bug değil.
 */
const typeAndSend = async (text: string) => {
  typeBody(text);
  await act(async () => {});
  fireEvent.press(screen.getByText(tr.feed.composer.send));
  await act(async () => {});
};

describe('temel akış', () => {
  it('başlık, placeholder ve gönder butonu çizilir', () => {
    setup();
    expect(screen.getByText(tr.feed.composer.title)).toBeTruthy();
    expect(screen.getByText(tr.feed.composer.send)).toBeTruthy();
  });

  // ⚠️ `await waitFor`: RHF + zodResolver doğrulaması ASENKRON ve `handleSubmit`
  // de öyle. Senkron assert, doğrulama oturmadan koşup "0 çağrı" görüyor.
  it('metin yazılıp gönderilince onSend(body, isAnonymous) çağrılır', async () => {
    const { onSend } = setup();
    await typeAndSend('  Kütüphane kaçta açılıyor?  ');
    // Baştaki/sondaki boşluk kırpılıyor (sunucu da normalize ediyor).
    expect(onSend).toHaveBeenCalledWith('Kütüphane kaçta açılıyor?', false);
  });

  it('boş metinle gönderilemez', async () => {
    const { onSend } = setup();
    await act(async () => {});
    fireEvent.press(screen.getByText(tr.feed.composer.send));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('yalnız boşluktan oluşan metinle gönderilemez', async () => {
    const { onSend } = setup();
    await typeAndSend('     ');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('gönderim sürerken tekrar basmak ikinci istek atmaz', async () => {
    const { onSend } = setup({ sending: true });
    await typeAndSend('merhaba');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('anonim kapısı', () => {
  it('allowed → anahtar açılabilir ve isAnonymous true gider', async () => {
    const { onSend } = setup({ anonymousGate: ALLOWED });
    expect(screen.getByText(tr.feed.composer.anonymousHint)).toBeTruthy();

    const sw = screen.UNSAFE_getByType(require('react-native').Switch);
    fireEvent(sw, 'valueChange', true);
    await typeAndSend('anonim gönderi');
    expect(onSend).toHaveBeenCalledWith('anonim gönderi', true);
  });

  it('paywall → kilit metni çizilir ve gönderi ANONİM OLMADAN gider', async () => {
    const { onSend } = setup({ anonymousGate: PAYWALL });
    expect(screen.getByText(tr.feed.composer.anonymousLocked)).toBeTruthy();

    const sw = screen.UNSAFE_getByType(require('react-native').Switch);
    expect(sw.props.value).toBe(false);

    // Kilitli Switch `pointerEvents:"none"` katmanının altında — valueChange'i
    // elle ateşlesek bile state değişmemeli (gerçekte dokunuş zaten ona
    // ulaşmıyor, üstteki TouchableOpacity paywall'a gidiyor).
    fireEvent(sw, 'valueChange', true);
    await typeAndSend('deneme');
    // UT-7305 yenmesin diye gönderi NORMAL gidiyor.
    expect(onSend).toHaveBeenCalledWith('deneme', false);
  });

  it('restricted → kısıt metni, anahtar devre dışı', () => {
    setup({ anonymousGate: RESTRICTED });
    expect(screen.getByText(tr.feed.composer.anonymousRestricted)).toBeTruthy();
    const sw = screen.UNSAFE_getByType(require('react-native').Switch);
    expect(sw.props.disabled).toBe(true);
  });

  it('unknown → KİLİT METNİ YOK, normal ipucu çizilir', () => {
    // /me gelmemişken kilit göstermek olmayan bir kısıt uydururdu.
    setup({ anonymousGate: UNKNOWN });
    expect(screen.getByText(tr.feed.composer.anonymousHint)).toBeTruthy();
    expect(screen.queryByText(tr.feed.composer.anonymousLocked)).toBeNull();
    expect(screen.queryByText(tr.feed.composer.anonymousRestricted)).toBeNull();
  });
});

describe('hata yolu — sheet AÇIK kalır', () => {
  it('errorText çizilir ve yazılan metin KORUNUR', () => {
    const { rerender, onClose } = setup();
    typeBody('kurallara aykırı bir şey');

    rerender(
      <FeedComposerSheet
        visible
        onClose={onClose}
        onSend={jest.fn()}
        maxLength={400}
        anonymousGate={ALLOWED}
        onAnonymousPaywall={jest.fn()}
        errorText="Cinsel içerik paylaşılamaz."
      />,
    );

    expect(screen.getByText('Cinsel içerik paylaşılamaz.')).toBeTruthy();
    const input = screen.UNSAFE_getByProps({
      placeholder: tr.feed.composer.placeholder,
    });
    expect(input.props.value).toBe('kurallara aykırı bir şey');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('karakter sayacı ve kırpma', () => {
  it('sayaç code point sayar — emoji 1', () => {
    setup({ maxLength: 400 });
    typeBody('😀😀');
    expect(screen.getByText('2/400')).toBeTruthy();
  });

  it('metin sunucu tavanına kırpılır', () => {
    setup({ maxLength: 5 });
    const input = typeBody('abcdefghij');
    expect(input.props.value).toBe('abcde');
  });

  it('sunucu tavanı gelmezse istemci tavanı (400) kullanılır', () => {
    setup({ maxLength: null });
    typeBody('abc');
    expect(screen.getByText('3/400')).toBeTruthy();
  });

  it('sunucu tavanı istemci tavanından BÜYÜKSE istemci kazanır', () => {
    setup({ maxLength: 1000 });
    typeBody('abc');
    expect(screen.getByText('3/400')).toBeTruthy();
  });
});

describe('üniversite ipucu', () => {
  it('normal modda hangi akışta görüneceği yazar', () => {
    setup({ universityLabel: 'itu.edu.tr' });
    expect(
      screen.getByText(
        tr.feed.composer.universityHint.replace('{{university}}', 'itu.edu.tr'),
      ),
    ).toBeTruthy();
  });

  it('anonim modda ipucu ÇİZİLMEZ (kimlik görünür izlenimi vermesin)', () => {
    setup({ universityLabel: 'itu.edu.tr', anonymousGate: ALLOWED });
    const sw = screen.UNSAFE_getByType(require('react-native').Switch);
    fireEvent(sw, 'valueChange', true);
    expect(
      screen.queryByText(
        tr.feed.composer.universityHint.replace('{{university}}', 'itu.edu.tr'),
      ),
    ).toBeNull();
  });
});
