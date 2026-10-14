/**
 * Akış kampüs seçici — PLUS KAPISI.
 *
 * Test edilen asıl şey kapının YERİ: free kullanıcıya sheet AÇILIYOR (eskiden
 * hiç açılmıyordu, pill doğrudan Plus'a gidiyordu) ve kilit SATIR BAZINDA
 * çiziliyor. Üç kural:
 *   1. Başka kampüs satırları kilitli — kutu yerine kilit glifi, dokunuş sheet'i
 *      KAPATIP Plus'a götürüyor ve TASLAĞA DOKUNMUYOR.
 *   2. KENDİ kampüsü (ilk satır) HER ZAMAN açık: kapı "başka kampüsü görebilir
 *      mi" sorusu, kendi akışı free kullanıcının zaten gördüğü şey. Kilitlenirse
 *      geri dönüş yolu kapanır.
 *   3. `gate: "unknown"` (/me gelmedi) KİLİT ÇİZMİYOR — kullanıcıya olmayan bir
 *      kısıt uydurmaktansa açık varsaymak doğru taraf.
 */

jest.mock('@/shared/components/AppModal');
jest.mock('@gorhom/bottom-sheet', () => {
  const actual = jest.requireActual('@gorhom/bottom-sheet');
  const RN = require('react-native');
  return { ...actual, BottomSheetTextInput: RN.TextInput };
});
// Liste ağdan değil testten geliyor; sheet'in konusu kapı, veri çekme değil.
jest.mock('@/shared/queries/commonQueries', () => {
  const actual = jest.requireActual('@/shared/queries/commonQueries');
  return {
    ...actual,
    useUniversities: () => ({
      data: [
        { domain: 'itu.edu.tr', name: 'İTÜ', display: { tr: 'İTÜ', en: 'ITU' } },
        { domain: 'boun.edu.tr', name: 'Boğaziçi', display: { tr: 'Boğaziçi', en: 'Bogazici' } },
      ],
    }),
  };
});

import { render, screen, fireEvent } from '@testing-library/react-native';
import FeedUniversitySheet from '@/features/feed/components/FeedUniversitySheet';
import type { FilterGate } from '@/features/feed/feedPolicy';
import tr from '@/shared/i18n/translations/tr';

const setup = (gate: FilterGate, over: Record<string, unknown> = {}) => {
  const onClose = jest.fn();
  const onSelect = jest.fn();
  const onPaywall = jest.fn();
  const utils = render(
    <FeedUniversitySheet
      visible
      onClose={onClose}
      onSelect={onSelect}
      onPaywall={onPaywall}
      value={null}
      gate={gate}
      ownDomain="itu.edu.tr"
      ownUniversityName="İTÜ"
      {...over}
    />,
  );
  return { onClose, onSelect, onPaywall, ...utils };
};

/** Header'daki tik — taslağı uygulayan tek şey. */
const pressDone = () => fireEvent.press(screen.getByLabelText(tr.common.done));

describe('free kullanıcı (paywall)', () => {
  it('sheet AÇILIYOR — liste ve kendi kampüsü görünüyor', () => {
    setup('paywall');
    expect(screen.getByText('İTÜ')).toBeTruthy();
    expect(screen.getByText('Boğaziçi')).toBeTruthy();
  });

  it('başka kampüse dokunuş → sheet KAPANIR, Plus açılır, SEÇİM OLMAZ', () => {
    const { onClose, onPaywall, onSelect } = setup('paywall');
    fireEvent.press(screen.getByText('Boğaziçi'));
    expect(onClose).toHaveBeenCalled();
    expect(onPaywall).toHaveBeenCalled();
    // Taslağa dokunulmadı: kilitli satır satın almaya götürür, seçim yapmaz.
    expect(onSelect).not.toHaveBeenCalled();
  });

  // ⚠️ EN KRİTİK SINIR: kilitli satıra dokunup sonra tike basmak o kampüsü
  // UYGULAMAMALI. Dokunuş taslağı değiştirmediği için tik yine kendi kampüsünü
  // (null) uyguluyor.
  it('kilitli satıra dokunup tike basmak o kampüsü UYGULAMAZ', () => {
    const { onSelect } = setup('paywall');
    fireEvent.press(screen.getByText('Boğaziçi'));
    pressDone();
    // Taslak değişmediği için tik hâlâ KENDİ kampüsünü (null) uyguluyor.
    // İkinci assert şart: ilki tek başına "hiç çağrılmadı" halini de geçirirdi.
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onSelect).not.toHaveBeenCalledWith('boun.edu.tr');
  });

  it('KENDİ kampüsü kilitli DEĞİL — seçilip uygulanabiliyor', () => {
    const { onSelect, onPaywall } = setup('paywall', { value: 'boun.edu.tr' });
    fireEvent.press(screen.getByText('İTÜ'));
    pressDone();
    expect(onPaywall).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe('kapı açık / bilinmiyor', () => {
  it('allowed → başka kampüs seçilebiliyor, Plus açılmıyor', () => {
    const { onSelect, onPaywall } = setup('allowed');
    fireEvent.press(screen.getByText('Boğaziçi'));
    pressDone();
    expect(onPaywall).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('boun.edu.tr');
  });

  // /me gelmemişken kilit çizmek ödemiş kullanıcıya olmayan bir kısıt gösterir.
  it('unknown → kilit YOK, seçim çalışıyor', () => {
    const { onSelect, onPaywall } = setup('unknown');
    fireEvent.press(screen.getByText('Boğaziçi'));
    pressDone();
    expect(onPaywall).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('boun.edu.tr');
  });
});
