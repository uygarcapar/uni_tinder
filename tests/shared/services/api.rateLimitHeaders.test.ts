/**
 * api.ts response interceptor'ının HATA dalında da rate limit header'ı
 * okuduğunu doğrular (Task 2'nin deliği, Task 4 review'ında bulundu).
 *
 * Önceden yalnız BAŞARI dalı `recordRateLimitHeaders` çağırıyordu. 429'un
 * gövdesi de aynı header'ı taşıyor ama hata dalı okumadığı için bir 429'dan
 * sonra defter son başarılı yanıtın (muhtemelen bol) değerinde donup
 * kalıyordu — backfill'in "429 gördüm, dur" kararı doğru çalışsa da, bir
 * SONRAKİ tetikleyici (delta-sync, outbox) kalan kotayı hâlâ "bol" sanıp
 * aynı duvara kontrolsüz bir istek daha atabiliyordu.
 */

// jest.mock factory'leri import'ların üstüne hoist edilir — aynı kalıp
// api.accountBlock.test.ts'te.
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
import '@/shared/services/api'; // interceptor'ı KURMAK için — handler'a doğrudan erişiyoruz.
import {
  remainingNow,
  recordRateLimitHeaders,
  __resetRateLimitBudgetForTests,
} from '@/shared/services/rateLimitBudget';

const instance = (axios as any).create.mock.results[0].value;
const onResponseError: (error: any) => Promise<any> =
  instance.interceptors.response.use.mock.calls[0][1];

// Retry merdivenini devreye SOKMAMAK için `__skip429Retry` — bu test sadece
// header okumayı doğruluyor, retry/backoff ayrı ve dokunulmuyor (kurucunun
// isteği).
const rateLimited = (headers: Record<string, string>) => ({
  config: { url: '/api/messages/x', method: 'get', headers: {}, __skip429Retry: true },
  response: { status: 429, data: {}, headers },
});

beforeEach(() => {
  __resetRateLimitBudgetForTests();
});

describe('hata dalında da rate limit header okunuyor', () => {
  it('429 gövdesindeki kalan kotayı deftere yazıyor', async () => {
    await expect(
      onResponseError(rateLimited({ 'x-ratelimit-remaining': '3' })),
    ).rejects.toBeDefined();

    expect(remainingNow()).toBe(3);
  });

  it('response YOKSA (ağ hatası) defter "bilinmiyor"a döner, eski değerde donmaz', async () => {
    // Önceki başarılı yanıt bol kota bırakmış olabilir — ağ hatası bu
    // bilgiyi GEÇERSİZ kılmalı, aksi hâlde backfill "bol var" sanıp devam
    // eder.
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '150' });
    expect(remainingNow()).toBe(150);

    await expect(
      onResponseError({ config: { url: '/api/messages/x', method: 'get', headers: {} }, message: 'Network Error' }),
    ).rejects.toBeDefined();

    expect(remainingNow()).toBeNull();
  });
});
