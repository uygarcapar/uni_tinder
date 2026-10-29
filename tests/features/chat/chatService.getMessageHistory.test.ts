/**
 * `getMessageHistory`'nin 429-retry opt-out'u.
 *
 * `api.ts`'in response interceptor'ı 429'u varsayılan olarak 3 kez daha
 * dener (backoff'lu) — `__skip429Retry` taşımayan her istek için. Ekranın
 * kullanıcı tetikli sayfalaması (fetchHistory thunk'ı) bunu İSTER: sayfa er
 * ya da geç yüklenir. Backfill'in round-cap'i ise bu retry'ı GÖREMEZ (3
 * ekstra deneme interceptor'ın İÇİNDE olur) — bu yüzden kendi isteklerinde
 * `skip429Retry: true` geçiyor (bkz. chatBackfill.ts).
 *
 * Bu dosya `api`'yi `chatService` seviyesinde mock'luyor, interceptor'ı HİÇ
 * görmüyor — yani burada doğrulanan "backfill opt-out BAYRAĞINI gerçekten
 * geçiyor mu", "o bayrak interceptor'da retry'ı gerçekten durduruyor mu"
 * DEĞİL (o taraf `SKIP_429_RETRY`'nin kendi sözleşmesi, `api.ts`'te — bu
 * dosyanın görebileceği bir şey değil, iki katmanı birleştiren gerçek bir
 * entegrasyon testi ayrı bir maliyet gerektirirdi).
 */

const mockGet = jest.fn();
const SKIP_429_RETRY = { __skip429Retry: true };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...args: any[]) => mockGet(...args) },
  SKIP_429_RETRY,
}));

import chatService from '@/features/chat/chatService';

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    result: { conversationId: 'c1', messages: [], nextCursor: null, hasMore: false },
  });
});

describe('getMessageHistory — 429 retry opt-out', () => {
  it('varsayılanda (ekranın sayfalaması) SKIP_429_RETRY GEÇMEZ — retry istenen davranış', async () => {
    await chatService.getMessageHistory('c1', { cursor: 'c-1' });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]).toBeUndefined();
  });

  it('skip429Retry:true verilince SKIP_429_RETRY config olarak geçiyor', async () => {
    await chatService.getMessageHistory('c1', { cursor: 'c-1', skip429Retry: true });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0][1]).toBe(SKIP_429_RETRY);
  });
});
