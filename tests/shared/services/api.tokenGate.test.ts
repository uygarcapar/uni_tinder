/**
 * İstek interceptor'ındaki TOKEN KAPISI.
 *
 * Regresyon hedefi: bayat access token'la yola çıkıp 401 yemek. Cold start'ta
 * bu, tek seferde ~7 paralel 401 ve rotasyonun açılışın en kırılgan anına
 * denk gelmesi demekti — rotasyon tek kullanımlık olduğu için cevabı kaybolan
 * refresh, grace penceresi kapandıktan sonra oturumu bitiriyor.
 *
 * Kapının sözleşmesi:
 *   • Token bayatsa istek DURUR, önce tek bir refresh yapılır, istek YENİ
 *     token'la çıkar.
 *   • Token tazeyse hiçbir ek istek çıkmaz.
 *   • Login/register/refresh/revoke uçları kapıdan MUAF.
 *   • FAIL-OPEN: refresh düşerse istek yine de gider (401 yolu yerinde).
 */

jest.mock('axios', () => {
  const instance: any = jest.fn(() => Promise.resolve({}));
  instance.interceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  };
  const axiosMock: any = jest.fn(() => Promise.resolve({}));
  axiosMock.create = jest.fn(() => instance);
  axiosMock.post = jest.fn();
  axiosMock.get = jest.fn();
  return { __esModule: true, default: axiosMock };
});

jest.mock('@/shared/utils/tokenStorage', () => ({
  clearAllTokens: jest.fn(async () => {}),
  getRefreshToken: jest.fn(async () => 'refresh-token'),
  saveRefreshToken: jest.fn(async () => {}),
  saveAccessToken: jest.fn(async () => {}),
  isTokenStoreDegraded: jest.fn(() => false),
}));

import axios from 'axios';
import { setCurrentAccessToken, setOnAuthLost } from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

const axiosPost = (axios as any).post as jest.Mock;
const instance = (axios as any).create.mock.results[0].value;
/** api.ts modül yüklenirken kaydettiği request interceptor'ı. */
const requestInterceptor = instance.interceptors.request.use.mock.calls[0][0] as (
  config: any,
) => Promise<any>;

/** İmzası doğrulanmıyor (bkz. jwt.ts) — payload'ın base64'ü yeterli. */
const makeJwt = (expInSeconds: number): string => {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expInSeconds }),
  ).toString('base64url');
  return `header.${payload}.signature`;
};

const STALE = makeJwt(-60); // 1 dk önce ölmüş
const FRESH = makeJwt(3600); // 1 saat ömrü kalmış

beforeEach(() => {
  jest.clearAllMocks();
  setOnAuthLost(() => {});
  axiosPost.mockResolvedValue({
    data: { result: { token: 'yeni-access', refreshToken: 'yeni-refresh' } },
  });
});

test('bayat token: istek ÖNCE yenilenir, Authorization yeni token ile gider', async () => {
  setCurrentAccessToken(STALE);

  const config = await requestInterceptor({ url: '/api/user/me', headers: {} });

  expect(axiosPost).toHaveBeenCalledTimes(1);
  expect(axiosPost.mock.calls[0][0]).toContain(API_ENDPOINTS.REFRESH_TOKEN);
  expect(config.headers.Authorization).toBe('Bearer yeni-access');
});

test('taze token: hiçbir ek istek çıkmaz', async () => {
  setCurrentAccessToken(FRESH);

  const config = await requestInterceptor({ url: '/api/user/me', headers: {} });

  expect(axiosPost).not.toHaveBeenCalled();
  expect(config.headers.Authorization).toBe(`Bearer ${FRESH}`);
});

test('muaf uçlar: login bayat token taşısa da kapıdan geçmez', async () => {
  setCurrentAccessToken(STALE);

  await requestInterceptor({ url: API_ENDPOINTS.LOGIN, headers: {} });

  expect(axiosPost).not.toHaveBeenCalled();
});

test('token yokken kapı hiç açılmaz (login öncesi anonim istekler)', async () => {
  setCurrentAccessToken(null);

  const config = await requestInterceptor({ url: '/api/common/universities', headers: {} });

  expect(axiosPost).not.toHaveBeenCalled();
  expect(config.headers.Authorization).toBeUndefined();
});

test('FAIL-OPEN: refresh düşerse istek eski token ile yine de çıkar', async () => {
  setCurrentAccessToken(STALE);
  // Sunucuya ulaşılamadı: geçici hata → oturum düşmez, kapı da isteği öldürmez.
  axiosPost.mockRejectedValue({ message: 'Network Error' });

  const config = await requestInterceptor({ url: '/api/user/me', headers: {} });

  expect(config.headers.Authorization).toBe(`Bearer ${STALE}`);
});
