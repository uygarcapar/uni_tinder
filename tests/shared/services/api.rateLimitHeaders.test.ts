/**
 * api.ts response interceptor'ının rate limit defterini NEREDEN beslediğini
 * doğrular — iki handler, iki kural:
 *
 *  • HER İKİ dal da okuyor. 429'un gövdesi de aynı header'ı taşıyor; hata dalı
 *    okumadığı sürece bir 429'dan sonra defter son başarılı yanıtın (muhtemelen
 *    bol) değerinde donup kalıyordu ve bir SONRAKİ tetikleyici (delta-sync,
 *    outbox) aynı duvara kontrolsüz çarpıyordu. Başarı dalı ise defterin tek
 *    sağlıklı-yol kaynağı.
 *  • YALNIZ `/api/messages/` istekleri yazıyor. `X-RateLimit-Remaining` kova
 *    başına bir sayı, defter ise tek sayı — alakasız bir yanıttan yazmak ya
 *    başka kovanın bolluğunu messaging kovası sanmak ya da defteri
 *    "bilinmiyor"a çevirmek demek.
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
const onResponseSuccess: (response: any) => any =
  instance.interceptors.response.use.mock.calls[0][0];
const onResponseError: (error: any) => Promise<any> =
  instance.interceptors.response.use.mock.calls[0][1];

const ok = (url: string, headers: Record<string, string>) => ({
  config: { url, method: 'get', headers: {} },
  status: 200,
  data: { result: 'gövde' },
  headers,
});

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

  it('messages dışı bir HATA yanıtı defteri "bilinmiyor"a ÇEVİRMİYOR', async () => {
    // Defter messaging kovasına ait; feed'in ağ hatası o kova hakkında hiçbir
    // şey söylemiyor. Null'lamak mid-round ölümcül: tur sayfalar arasında 1 sn
    // bekliyor ve o pencerede araya giren TEK alakasız yanıt defteri null'larsa
    // prob kuralı (`attempts >= 1`) turu kapatıyor.
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '120' });

    await expect(
      onResponseError({
        config: { url: '/api/feed/discover', method: 'get', headers: {} },
        message: 'Network Error',
      }),
    ).rejects.toBeDefined();

    expect(remainingNow()).toBe(120);
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

describe('BAŞARI dalı da defteri besliyor', () => {
  it('200 yanıtının kalan kotasını yazıyor ve response.data\'yı AYNEN döndürüyor', () => {
    // Bu dal defterin TEK sağlıklı-yol kaynağı: backfill'in rezerv kapısı da,
    // prob kuralı da buradan dolan sayıya bakıyor. Suite'in geri kalanı yalnız
    // HATA handler'ını (`calls[0][1]`) tutuyordu, yani başarı dalındaki tek
    // satır silinse hiçbir test kızarmıyordu.
    const out = onResponseSuccess(
      ok('/api/messages/conversations/conv-1/history-cursor?pageSize=50', {
        'x-ratelimit-remaining': '42',
      }),
    );

    expect(remainingNow()).toBe(42);
    // Yan kanalın şartı: dönüş şekli DEĞİŞMİYOR (onlarca çağrı yeri
    // `response.data` bekliyor).
    expect(out).toEqual({ result: 'gövde' });
  });

  it('messages dışı bir 200 yanıtı defteri BOZMUYOR', () => {
    // Kullanıcı kendi sohbetini sayfalamış, messaging kovası 10'a inmiş.
    recordRateLimitHeaders({ 'x-ratelimit-remaining': '10' });

    onResponseSuccess(ok('/api/feed/discover', { 'x-ratelimit-remaining': '480' }));

    // Feed'in kendi kovasındaki 480, messaging kovası hakkında hiçbir şey
    // söylemiyor; yazılsaydı backfill rezervi aşıldığını göremez ve
    // kullanıcıyı 429'a sokardı — tasarımın güvensiz olmaması gereken yönü.
    expect(remainingNow()).toBe(10);
  });
});
