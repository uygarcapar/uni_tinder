/**
 * Davet kodu adımı — sihirbazın ilk ekranı.
 *
 * Suite'in koruduğu üç karar:
 *   1. Adım OPSİYONEL: kod boşken de "Devam" çalışıyor.
 *   2. Geçersiz kod akışı DURDURMUYOR (kırmızı satır + Devam hâlâ aktif).
 *   3. "Atla" kodu gerçekten TEMİZLİYOR — yarım kalmış bir kod sessizce
 *      register-and-complete'e sızmamalı.
 */

const mockDispatch = jest.fn();
jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (fn: any) =>
    fn({ auth: { registrationForm: { referralCode: null } } }),
}));

jest.mock('@/features/auth/components/RegisterProgressBar', () => 'RegisterProgressBar');
jest.mock('@/features/auth/components/RegisterBackButton', () => 'RegisterBackButton');

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import RegisterReferralScreen from '@/features/auth/screens/RegisterReferralScreen';
import tr from '@/shared/i18n/translations/tr';

const copy = tr.auth.referral;

const nav: any = { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };

const respondWith = (body: any, status = 200) =>
  (globalThis.fetch as jest.Mock).mockResolvedValue({
    status,
    json: async () => body,
  });

beforeEach(() => {
  mockDispatch.mockReset();
  nav.navigate.mockReset();
  nav.reset.mockReset();
  (globalThis.fetch as jest.Mock).mockReset();
  respondWith({ isSuccess: true, result: { valid: true } });
});

const setup = () =>
  render(<RegisterReferralScreen navigation={nav} route={{} as any} />);

/** Gizli input'a ham metin yaz + debounce'u ilerlet. */
const typeCode = async (tree: any, raw: string) => {
  fireEvent.changeText(tree.getByTestId('otp-input-hidden'), raw);
  await act(async () => {
    jest.advanceTimersByTime(400);
  });
};

describe('boş kod', () => {
  it('"Devam" kod girilmeden de ilerletiyor ve kodu null yazıyor', () => {
    const tree = setup();
    fireEvent.press(tree.getByTestId('referral-continue'));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { field: 'referralCode', value: null },
      }),
    );
    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep3');
  });

  it('hiçbir durum satırı çizmiyor — "kontrol edilmedi" söylenecek bir şey değil', () => {
    const tree = setup();
    expect(tree.queryByText(copy.valid)).toBeNull();
    expect(tree.queryByText(copy.invalid)).toBeNull();
    expect(tree.queryByText(copy.checking)).toBeNull();
  });

  it('kod tamamlanmadan doğrulama isteği ATMIYOR', async () => {
    jest.useFakeTimers();
    const tree = setup();
    await typeCode(tree, 'ak7');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('dolu kod', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('geçerli kodda yeşil satır çıkıyor ve kod normalize edilmiş gidiyor', async () => {
    const tree = setup();
    // Küçük harf + alfabe dışı karakter: normalize zinciri de bu testte.
    await typeCode(tree, 'ak-7m2');

    await waitFor(() => expect(tree.getByText(copy.valid)).toBeTruthy());
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/referral/validate?code=AK7M2'),
    );

    fireEvent.press(tree.getByTestId('referral-continue'));
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { field: 'referralCode', value: 'AK7M2' },
      }),
    );
  });

  it('geçersiz kod akışı DURDURMUYOR — kırmızı satır + Devam hâlâ çalışıyor', async () => {
    respondWith({ isSuccess: true, result: { valid: false } });
    const tree = setup();
    await typeCode(tree, 'AK7M2');

    await waitFor(() => expect(tree.getByText(copy.invalid)).toBeTruthy());

    fireEvent.press(tree.getByTestId('referral-continue'));
    // Kod yine GÖNDERİLİYOR: geçerlilik kaydın değil hediyenin koşulu, karar
    // sunucunun. Yanlış hatırlanan bir kod kullanıcıyı kayıt olamaz yapmamalı.
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { field: 'referralCode', value: 'AK7M2' },
      }),
    );
    expect(nav.navigate).toHaveBeenCalledWith('RegisterStep3');
  });

  it('ağ hatasını "geçersiz" SAYMIYOR', async () => {
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const tree = setup();
    await typeCode(tree, 'AK7M2');

    await waitFor(() => expect(tree.queryByText(copy.checking)).toBeNull());
    expect(tree.queryByText(copy.invalid)).toBeNull();
    expect(tree.queryByText(copy.valid)).toBeNull();
  });

  it('429/5xx de hüküm DEĞİL — rate limit kullanıcıya hata olarak yansımıyor', async () => {
    respondWith({ isSuccess: false }, 429);
    const tree = setup();
    await typeCode(tree, 'AK7M2');

    await waitFor(() => expect(tree.queryByText(copy.checking)).toBeNull());
    expect(tree.queryByText(copy.invalid)).toBeNull();
  });
});

describe('Atla', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('girilmiş kodu TEMİZLİYOR ve Step3\'e reset atıyor', async () => {
    const tree = setup();
    await typeCode(tree, 'AK7M2');
    mockDispatch.mockClear();

    fireEvent.press(tree.getByTestId('referral-skip'));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { field: 'referralCode', value: null },
      }),
    );
    // `reset`: geri yığınında dönülecek bir kod ekranı bırakmıyor.
    expect(nav.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'RegisterStep3' }],
    });
  });
});
