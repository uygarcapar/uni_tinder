/**
 * `checkRegistrationToken` üç durumlu olmak ZORUNDA: ağ hatasını "geçersiz"
 * saymak, çevrimdışı açılan kullanıcının yarım kayıt taslağını (12 adımlık
 * cevaplar + fotoğraflar) silerdi. Bu testler o ayrımı kilitliyor.
 *
 * 429 dalı ayrıca kayıt akışının canını yakan gerçek bir hatanın regresyon
 * testi: uç `/api/auth/*` altında, yani 5 istek/dk limitinde. Rate limit
 * cevabını 'invalid' saymak, kullanıcıyı GEÇERLİ token'la fotoğraf adımından
 * atıyordu.
 */

import {
  checkRegistrationToken,
  resetRegistrationTokenCache,
} from '@/features/auth/registrationToken';

const mockFetch = (globalThis as any).fetch as jest.Mock;

const jsonOnce = (body: unknown, status = 200) =>
  mockFetch.mockResolvedValueOnce({ status, json: () => Promise.resolve(body) });

describe('checkRegistrationToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetRegistrationTokenCache();
  });

  it('isSuccess → valid', async () => {
    jsonOnce({ isSuccess: true });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('valid');
  });

  it('isSuccess false → invalid', async () => {
    jsonOnce({ isSuccess: false, message: 'expired' });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('invalid');
  });

  it('ağ hatası → unknown (taslak silinmesin)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('unknown');
  });

  it('bozuk JSON → unknown', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('unknown');
  });

  it('429 rate limit → unknown, gövde isSuccess:false olsa bile', async () => {
    jsonOnce({ isSuccess: false, message: 'Too many requests' }, 429);
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('unknown');
  });

  it('5xx → unknown (sunucu arızası token hakkında hüküm değil)', async () => {
    jsonOnce({ isSuccess: false }, 503);
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('unknown');
  });

  it('e-posta ya da token yoksa ağa hiç çıkmaz', async () => {
    await expect(checkRegistrationToken(null, 'tok')).resolves.toBe('invalid');
    await expect(checkRegistrationToken('a@uni.edu.tr', null)).resolves.toBe('invalid');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('aynı çift için olumlu cevap önbelleklenir — rate limit bütçesi yanmasın', async () => {
    jsonOnce({ isSuccess: true });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('valid');
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('valid');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('yeni token önbelleği ıskalar', async () => {
    jsonOnce({ isSuccess: true });
    await checkRegistrationToken('a@uni.edu.tr', 'tok');
    jsonOnce({ isSuccess: false });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok-2')).resolves.toBe('invalid');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('olumsuz cevap önbelleklenmez — yıkıcı karar hep taze sorulur', async () => {
    jsonOnce({ isSuccess: false });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('invalid');
    jsonOnce({ isSuccess: true });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('valid');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('eşzamanlı çağrılar tek istekte birleşir', async () => {
    jsonOnce({ isSuccess: true });
    const [a, b] = await Promise.all([
      checkRegistrationToken('a@uni.edu.tr', 'tok'),
      checkRegistrationToken('a@uni.edu.tr', 'tok'),
    ]);
    expect([a, b]).toEqual(['valid', 'valid']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
