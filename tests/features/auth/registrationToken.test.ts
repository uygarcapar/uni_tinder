/**
 * `checkRegistrationToken` üç durumlu olmak ZORUNDA: ağ hatasını "geçersiz"
 * saymak, çevrimdışı açılan kullanıcının yarım kayıt taslağını (12 adımlık
 * cevaplar + fotoğraflar) silerdi. Bu testler o ayrımı kilitliyor.
 */

import { checkRegistrationToken } from '@/features/auth/registrationToken';

const mockFetch = (globalThis as any).fetch as jest.Mock;

const jsonOnce = (body: unknown) =>
  mockFetch.mockResolvedValueOnce({ json: () => Promise.resolve(body) });

describe('checkRegistrationToken', () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
      json: () => Promise.reject(new SyntaxError('Unexpected token <')),
    });
    await expect(checkRegistrationToken('a@uni.edu.tr', 'tok')).resolves.toBe('unknown');
  });

  it('e-posta ya da token yoksa ağa hiç çıkmaz', async () => {
    await expect(checkRegistrationToken(null, 'tok')).resolves.toBe('invalid');
    await expect(checkRegistrationToken('a@uni.edu.tr', null)).resolves.toBe('invalid');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
