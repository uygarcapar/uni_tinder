/**
 * Abonelik slice'ının "para alındı / hak verilmedi" davranışı.
 *
 * Semptom şuydu: premium alınıyor, UI premium'a dönüyor, uygulama yeniden
 * açılınca kullanıcı hiç satın almamış gibi free'ye düşüyordu — üstelik
 * "aktivasyon sürüyor" kartı bile çıkmadan. Buradaki testler o yolu kapatıyor.
 */

const mockMemoryStore = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockMemoryStore.get(k),
    set: (k: string, v: string) => mockMemoryStore.set(k, v),
    remove: (k: string) => mockMemoryStore.delete(k),
    getBoolean: () => undefined,
    getNumber: () => undefined,
    clearAll: () => mockMemoryStore.clear(),
  }),
}));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
}));

const mockSnapshot = jest.fn();
jest.mock('@/features/profile/subscriptionService', () => ({
  __esModule: true,
  getRevenueCatPremiumStatus: async () => ({ isPremium: false, expiresAt: null }),
  getRevenueCatSnapshot: () => mockSnapshot(),
}));

const mockCapture = jest.fn();
jest.mock('@/shared/services/analytics', () => ({
  analytics: { capture: (...a: any[]) => mockCapture(...a) },
}));

import { configureStore } from '@reduxjs/toolkit';
import subscriptionReducer, {
  applySubscriptionChanged,
  fetchSubscriptionStatus,
  hydrateSyncPending,
  markPremiumPurchasePending,
  reconcileIfMismatched,
  refreshEntitlementsForPaywall,
  resolvePendingPremiumSync,
  selectIsPremium,
  setPremium,
  syncSubscriptionWithRetry,
} from '@/features/profile/subscriptionSlice';
import {
  hasPendingPremiumSync,
  markPendingPremiumSync,
} from '@/features/profile/pendingPremiumSync';

const USER = { userId: 'user-1' };

const makeStore = () =>
  configureStore({
    reducer: {
      subscription: subscriptionReducer,
      auth: (state = { user: USER }) => state,
    },
  });

const activeStatus = {
  isActivelyPremium: true,
  premiumExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  status: 'Active',
  autoRenewEnabled: true,
};

/** Backend downgrade etti: RC'de artık aktif entitlement yok. */
const cancelledStatus = {
  isActivelyPremium: false,
  premiumExpiresAt: null,
  status: 'Expired',
  autoRenewEnabled: false,
};

beforeEach(() => {
  mockMemoryStore.clear();
  mockPost.mockReset();
  mockGet.mockReset();
  mockSnapshot.mockReset();
  mockCapture.mockReset();
});

describe('markPremiumPurchasePending', () => {
  it('persists the purchase so a reload can still recover it', async () => {
    const store = makeStore();
    await store.dispatch(
      markPremiumPurchasePending({ productId: 'premium_monthly' }) as any,
    );

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(mockCapture).toHaveBeenCalledWith('premium_sync_pending', {
      productId: 'premium_monthly',
    });
  });

  it('does not re-fire the alarm event for an already pending purchase', async () => {
    const store = makeStore();
    await store.dispatch(markPremiumPurchasePending({ productId: 'p' }) as any);
    await store.dispatch(markPremiumPurchasePending({ productId: 'p' }) as any);

    const pendingEvents = mockCapture.mock.calls.filter(
      (c) => c[0] === 'premium_sync_pending',
    );
    expect(pendingEvents).toHaveLength(1);
  });
});

describe('cold start recovery', () => {
  it('shows the pending card immediately from the persisted record', () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });

    // AppNavigator boot'ta MMKV'yi senkron okuyup bunu dispatch ediyor.
    store.dispatch(hydrateSyncPending(hasPendingPremiumSync('user-1')));

    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('skips the network entirely when there is no pending purchase', async () => {
    const store = makeStore();
    await store.dispatch(resolvePendingPremiumSync() as any);

    expect(mockPost).not.toHaveBeenCalled();
    expect(store.getState().subscription.syncPending).toBe(false);
  });

  it('recovers premium from the persisted record and clears it', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    mockPost.mockResolvedValue({
      result: { synced: true, source: 'rc_rest', reason: 'RC_REST_CONFIRMED', status: activeStatus },
    });

    await store.dispatch(resolvePendingPremiumSync() as any);

    expect(selectIsPremium(store.getState())).toBe(true);
    expect(hasPendingPremiumSync('user-1')).toBe(false);
    expect(store.getState().subscription.syncPending).toBe(false);
  });

  it('keeps the record and the pending card when the webhook still has not landed', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(resolvePendingPremiumSync({ maxAttempts: 1 }) as any);

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('keeps the record on a network error instead of dropping the purchase', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    store.dispatch(hydrateSyncPending(true));
    mockPost.mockRejectedValue(new Error('offline'));

    await store.dispatch(resolvePendingPremiumSync({ maxAttempts: 1 }) as any);

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });
});

describe('fetchSubscriptionStatus', () => {
  it('closes the recovery record once the backend confirms premium', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    mockGet.mockResolvedValue({ result: activeStatus });

    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(hasPendingPremiumSync('user-1')).toBe(false);
    expect(store.getState().subscription.syncPending).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith(
      'premium_activated',
      expect.objectContaining({ source: 'status' }),
    );
  });
});

describe('reconcileIfMismatched', () => {
  it('keeps retrying when RC says paid but the backend does not — silently', async () => {
    // Kurtarma kaydı yazılır (bir sonraki açılış yeniden dener) ama KART
    // çıkmaz: RC snapshot'ı cache'lenmiş bir görüş, ödemenin kanıtı değil.
    // Kart çıkarsa, hiç satın alma yapmamış kullanıcı "aktivasyon sürüyor"
    // görüyor — sahada olan buydu.
    const store = makeStore();
    mockSnapshot.mockResolvedValue({
      isPremium: true,
      expiresAt: null,
      entitlements: ['premium'],
      productId: 'premium_monthly',
      originalPurchaseDate: '2026-08-11T10:00:00Z',
      latestPurchaseDate: '2026-08-11T10:00:00Z',
    });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(reconcileIfMismatched() as any);

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(false);
  });

  it('does show the card when the unresolved purchase is one we witnessed', async () => {
    const store = makeStore();
    await store.dispatch(
      markPremiumPurchasePending({ productId: 'premium_monthly' }) as any,
    );
    mockSnapshot.mockResolvedValue({
      isPremium: true,
      expiresAt: null,
      entitlements: ['premium'],
      productId: 'premium_monthly',
      originalPurchaseDate: '2026-08-11T10:00:00Z',
      latestPurchaseDate: '2026-08-11T10:00:00Z',
    });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(reconcileIfMismatched() as any);

    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('sends null transaction ids rather than purchase dates', async () => {
    const store = makeStore();
    mockSnapshot.mockResolvedValue({
      isPremium: true,
      expiresAt: null,
      entitlements: ['premium'],
      productId: 'premium_monthly',
      originalPurchaseDate: '2026-08-11T10:00:00Z',
      latestPurchaseDate: '2026-08-11T10:00:00Z',
    });
    mockPost.mockResolvedValue({ result: { synced: false, reason: 'NOT_FOUND_IN_RC' } });

    await store.dispatch(reconcileIfMismatched() as any);

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      rcLatestTransactionId: null,
      rcOriginalTransactionId: null,
      rcEntitlements: ['premium'],
    });
  });

  it('stays quiet when RC and the backend already agree', async () => {
    const store = makeStore();
    mockSnapshot.mockResolvedValue({
      isPremium: false,
      expiresAt: null,
      entitlements: [],
      productId: null,
      originalPurchaseDate: null,
      latestPurchaseDate: null,
    });

    await store.dispatch(reconcileIfMismatched() as any);

    expect(mockPost).not.toHaveBeenCalled();
    expect(hasPendingPremiumSync('user-1')).toBe(false);
  });
});

/**
 * "Aktivasyon sürüyor" kartı, hiç satın alma yapmamış kullanıcıya çıkıyordu.
 *
 * Zincir: RC'nin cache'lediği `entitlements.active` bitmiş aboneliği bir süre
 * daha taşıyor → reconcile bunu "ödedi ama backend görmedi" sanıp KALICI
 * kurtarma kaydı yazıyor → kayıt yalnız premium gerçekten inince siliniyor,
 * inmeyeceği için 7 günlük yaş sınırına kadar duruyor. Kullanıcı bu süre
 * boyunca "Yenile" butonlu kartla ve her açılışta boş `/sync` turlarıyla
 * baş başa kalıyordu.
 */
describe('bekleyen kayıt — çıkış yolu', () => {
  const noEntitlement = {
    isPremium: false,
    expiresAt: null,
    entitlements: [],
    productId: null,
    originalPurchaseDate: null,
    latestPurchaseDate: null,
  };

  it('drops a stale recovery record once RC agrees there is no entitlement', async () => {
    const store = makeStore();
    // 20 dakika önce yazılmış kayıt (yaş eşiğinin ötesinde).
    markPendingPremiumSync('user-1', { productId: 'premium_weekly', source: 'purchase' });
    const raw = JSON.parse(mockMemoryStore.get('pendingPremiumSync:user-1')!);
    mockMemoryStore.set(
      'pendingPremiumSync:user-1',
      JSON.stringify({ ...raw, at: Date.now() - 20 * 60_000 }),
    );
    store.dispatch(hydrateSyncPending(true));
    mockSnapshot.mockResolvedValue(noEntitlement);

    await store.dispatch(reconcileIfMismatched() as any);

    expect(hasPendingPremiumSync('user-1')).toBe(false);
    expect(store.getState().subscription.syncPending).toBe(false);
    // Karar tamamen yerel: kimseye istek atılmadı.
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('keeps a fresh record — RC entitlement may still be propagating', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_weekly', source: 'purchase' });
    store.dispatch(hydrateSyncPending(true));
    mockSnapshot.mockResolvedValue(noEntitlement);

    await store.dispatch(reconcileIfMismatched() as any);

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });
});

/**
 * Sahadan gelen teşhis raporunun kanıtladığı hata: `/status` "isPremium: true"
 * derken uygulamanın premium'a bakan her yeri "hayır" diyordu. Tek fark
 * `expiresAt` karşılaştırmasıydı — backend damgayı offset'siz yolluyor
 * (`"2026-08-21T12:06:16"`), JS onu YEREL saat sayıyor ve UTC+3'te aktif
 * abonelik 3 saat geçmiş okunuyordu.
 */
describe('offset taşımayan expiresAt', () => {
  it('stores the backend timestamp as UTC instead of local time', async () => {
    const store = makeStore();
    mockGet.mockResolvedValue({
      result: { isActivelyPremium: true, premiumExpiresAt: '2026-08-21T12:06:16' },
    });

    await store.dispatch(fetchSubscriptionStatus() as any);

    // Cihazın saat dilimi ne olursa olsun aynı an — testin kendisi de
    // TZ'den bağımsız kalsın diye string üzerinden doğruluyoruz.
    expect((store.getState() as any).subscription.expiresAt).toBe(
      '2026-08-21T12:06:16Z',
    );
  });

  it('keeps premium active for an offsetless expiry that is still in the future', async () => {
    const store = makeStore();
    const inOneHour = new Date(Date.now() + 3_600_000)
      .toISOString()
      .replace(/\.\d+Z$/, ''); // backend'in gönderdiği biçim: offset YOK
    mockGet.mockResolvedValue({
      result: { isActivelyPremium: true, premiumExpiresAt: inOneHour },
    });

    await store.dispatch(fetchSubscriptionStatus() as any);

    // UTC+3'te ham `new Date()` ile bu 2 saat GEÇMİŞ görünüyordu → premium kapanıyordu.
    expect(selectIsPremium(store.getState())).toBe(true);
  });

  it('still closes premium once the offsetless expiry is genuinely past', async () => {
    const store = makeStore();
    const anHourAgo = new Date(Date.now() - 3_600_000)
      .toISOString()
      .replace(/\.\d+Z$/, '');
    mockGet.mockResolvedValue({
      result: { isActivelyPremium: true, premiumExpiresAt: anHourAgo },
    });

    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(false);
  });
});

describe('optimistic premium grace', () => {
  it('ignores a stale backend "false" that lands right after the purchase', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));
    mockGet.mockResolvedValue({ result: { isActivelyPremium: false } });

    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(true);
  });
});

/**
 * Restore semptomu: premium anlık geliyor, saniyeler içinde kullanıcı hiç
 * satın almamış gibi geri düşüyor.
 *
 * Sebep bir YARIŞ. Restore aynı anda iki şey tetikliyor: `syncThenRefetch`
 * (PurchaseModal) ve RC `customerInfo` dinleyicisinin `/status`'u. `/status`
 * ÖNCE yola çıkıp SONRA iniyor; aradaki `sync` premium'u onayladığı için
 * optimistic grace penceresi kapanmış oluyor ve bayat `false` cevabı hiçbir
 * korumaya takılmadan premium'u siliyor.
 *
 * Mevcut bayatlık kontrolü yalnız hub event'lerini (`lastEventAt`) kolluyordu;
 * kural aslında kaynaktan bağımsız: istek yola çıktıktan SONRA yazılmış her
 * kanonik değer, uçuştaki cevaptan daha tazedir.
 */
describe('/status yarışı', () => {
  it('drops a /status answer that was issued before a sync confirmed premium', async () => {
    const store = makeStore();
    // Restore: optimistic premium.
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));

    // RC dinleyicisinin `/status`'u yola çıktı — cevabı henüz inmedi.
    let landStatus: (v: any) => void = () => {};
    mockGet.mockImplementation(
      () => new Promise((resolve) => { landStatus = resolve; }),
    );
    const statusRound = store.dispatch(fetchSubscriptionStatus() as any);

    // Bu arada `/sync` backend'i premium'a çevirdi: grace penceresi KAPANIR,
    // çünkü artık optimistic değil doğrulanmış bir premium var.
    mockPost.mockResolvedValue({ result: { synced: true, status: activeStatus } });
    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);
    expect(selectIsPremium(store.getState())).toBe(true);

    // Bayat cevap şimdi iniyor.
    landStatus({ result: cancelledStatus });
    await statusRound;

    expect(selectIsPremium(store.getState())).toBe(true);
  });

  it('drops a /status answer that was issued before the purchase', async () => {
    const store = makeStore();
    let landStatus: (v: any) => void = () => {};
    mockGet.mockImplementation(
      () => new Promise((resolve) => { landStatus = resolve; }),
    );
    const statusRound = store.dispatch(fetchSubscriptionStatus() as any);

    store.dispatch(setPremium({ isPremium: true, optimistic: true }));
    landStatus({ result: cancelledStatus });
    await statusRound;

    expect(selectIsPremium(store.getState())).toBe(true);
  });

  it('still applies a /status answer when nothing was written mid-flight', async () => {
    const store = makeStore();
    mockGet.mockResolvedValue({ result: activeStatus });

    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(true);

    // Ve sonraki tur downgrade'i uygulayabilmeli — koruma kalıcı bir kilit değil.
    mockGet.mockResolvedValue({ result: cancelledStatus });
    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(false);
  });
});

describe('refreshEntitlementsForPaywall', () => {
  // Throttle modül seviyesinde tutuluyor (UI guard'ı, redux state'i değil):
  // testler arasında sıfırlamak için modülü yeniden yüklüyoruz.
  const freshSlice = () => {
    let mod: any;
    jest.isolateModules(() => {
      mod = require('@/features/profile/subscriptionSlice');
    });
    const store = configureStore({
      reducer: {
        subscription: mod.default,
        auth: (state = { user: USER }) => state,
      },
    });
    return { mod, store };
  };

  it('reports premium without hitting the network when redux already knows', async () => {
    const { mod, store } = freshSlice();
    store.dispatch(mod.setPremium({ isPremium: true, expiresAt: null }));

    const premium = await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();

    expect(premium).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('catches a purchase made on another device before opening the paywall', async () => {
    const { mod, store } = freshSlice();
    mockGet.mockResolvedValue({ result: activeStatus });

    const premium = await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(premium).toBe(true);
  });

  it('lets the paywall open for a genuinely free user', async () => {
    const { mod, store } = freshSlice();
    mockGet.mockResolvedValue({ result: { isActivelyPremium: false } });

    const premium = await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();

    expect(premium).toBe(false);
  });

  it('throttles repeat triggers so a stuck quota cannot spam /status', async () => {
    const { mod, store } = freshSlice();
    mockGet.mockResolvedValue({ result: { isActivelyPremium: false } });

    await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();
    await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();
    await store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();

    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('resolves to the last known value instead of hanging when the network stalls', async () => {
    jest.useFakeTimers();
    const { mod, store } = freshSlice();
    // Hiç cevap vermeyen istek — sheet buna asılı kalmamalı.
    mockGet.mockImplementation(() => new Promise(() => {}));

    const pending = store.dispatch(mod.refreshEntitlementsForPaywall()).unwrap();
    await jest.advanceTimersByTimeAsync(2000);

    await expect(pending).resolves.toBe(false);
    jest.useRealTimers();
  });
});

/**
 * Retry politikası (backend teyidi 2026-08-18): 4 deneme, ve aralık `reason`a
 * göre değişiyor.
 *
 * Kritik olan: `NOT_FOUND_IN_RC` sonrası backend aynı kullanıcı için **10 sn
 * negative cache** tutuyor — o pencerede atılan istek RC'ye HİÇ GİTMEZ,
 * cache'ten aynı cevabı döner. Yani pencere içine düşen bir deneme "deneme"
 * değil, sadece harcanmış bir rate-limit hakkı. 18 Ağustos dokümanının önerdiği
 * 1.5/3/5/8 sn'lik merdiven tam da bu hataya düşüyordu (backend notun
 * dokümandan düştüğünü doğruladı).
 *
 * `RC_REST_ERROR` ve `RC_REST_UNAVAILABLE` cache'lenMİYOR → onlarda daha sık
 * denemek serbest. İki merdivenin ayrı kalması bu testlerin asıl konusu.
 */
describe('syncSubscriptionWithRetry — retry politikası', () => {
  const runRound = async (store: ReturnType<typeof makeStore>) => {
    jest.useFakeTimers();
    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  };

  it('keeps retrying NOT_FOUND_IN_RC through the whole budget', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await runRound(store);

    expect(mockPost).toHaveBeenCalledTimes(4);
    // Tur boşa çıktı ama kayıt DURUYOR — kurtarma bir sonraki açılışa devrediyor.
    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('keeps retrying RC_REST_UNAVAILABLE — a backend config gap is no verdict on the user', async () => {
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'RC_REST_UNAVAILABLE', status: null },
    });

    await runRound(store);

    expect(mockPost).toHaveBeenCalledTimes(4);
  });

  it('does not cap RC_REST_ERROR at three attempts', async () => {
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'db', reason: 'RC_REST_ERROR', status: null },
    });

    await runRound(store);

    expect(mockPost).toHaveBeenCalledTimes(4);
  });

  // Politikanın tek kırılgan yeri burası: aralık 10 sn'nin altına inerse
  // denemeler sessizce cache'e çarpar ve tur, "RC'ye 4 kez sorduk" gibi
  // görünürken aslında bir kez sormuş olur.
  it('never fires a retry inside the 10s negative-cache window', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    await jest.advanceTimersByTimeAsync(10_999);
    expect(mockPost).toHaveBeenCalledTimes(1);
    // Denemeler t=0 / 11 / 22 / 34 sn.
    await jest.advanceTimersByTimeAsync(1);
    expect(mockPost).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(11_000);
    expect(mockPost).toHaveBeenCalledTimes(3);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });

  // Cache'lenmeyen `reason`larda beklemek saf gecikme: RC'ye gerçekten
  // gidiliyor, 10 sn kuralı geçerli değil.
  it('retries the uncached reasons faster than the cached ladder', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'db', reason: 'RC_REST_ERROR', status: null },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    await jest.advanceTimersByTimeAsync(2_000);
    expect(mockPost).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });

  // 19 Ağustos sözleşmesi: pencereyi backend `retryAfterSeconds` ile bildiriyor.
  // Buradaki üç test, 11 sn'nin BİZDE sabit olmadığını kilitliyor — backend TTL'i
  // düşürdüğünde tur kendiliğinden hızlanmalı, biz kod değiştirmeden.
  it('derives the gap from retryAfterSeconds instead of the hard-coded ladder', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: {
        synced: false,
        source: 'rc_rest',
        reason: 'NOT_FOUND_IN_RC',
        retryAfterSeconds: 3,
        status: null,
      },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    // 3 sn pencere + 1 sn sınır payı = 4 sn. Eski merdiven 11 sn beklerdi.
    await jest.advanceTimersByTimeAsync(3_999);
    expect(mockPost).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockPost).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });

  // Alanın YOKLUĞU ile `0` aynı şey değil. Eski sürüm alanı hiç göndermiyor ve o
  // sürümde 10 sn'lik pencere hâlâ var — merdiveni silersek sessizce cache'e
  // çarpmaya döneriz.
  it('falls back to the 11s ladder when the backend omits retryAfterSeconds', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'rc_rest', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    await jest.advanceTimersByTimeAsync(10_999);
    expect(mockPost).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });

  // `retryAfterSeconds: 0` = "bu reason cache'lenmiyor". Pencere yok diye
  // beklemesiz denemeye kalkmak sunucuyu 60/dk limitine doğru iterdi; kendi
  // kısa merdivenimiz taban olarak duruyor.
  it('keeps the short ladder as a floor when retryAfterSeconds is 0', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: {
        synced: false,
        source: 'db',
        reason: 'RC_REST_ERROR',
        retryAfterSeconds: 0,
        status: null,
      },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    await jest.advanceTimersByTimeAsync(1_999);
    expect(mockPost).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(mockPost).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });

  // Doküman §3: "`status`'u her zaman state'e yazın, 'sadece true ise güncelle'
  // yapmayın." Turun sonunu beklemek, iptal edilmiş bir aboneliğin 17 sn daha
  // premium görünmesi demekti.
  it('writes the status on every turn, not only when the round ends', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, expiresAt: null }));
    mockPost.mockResolvedValue({
      result: {
        synced: false,
        source: 'rc_rest',
        reason: 'NOT_FOUND_IN_RC',
        status: cancelledStatus,
      },
    });

    const round = store.dispatch(syncSubscriptionWithRetry() as any);
    // İlk deneme beklemesiz: tur daha bitmeden cevabı state'te olmalı.
    await jest.advanceTimersByTimeAsync(0);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(selectIsPremium(store.getState())).toBe(false);

    await jest.advanceTimersByTimeAsync(120_000);
    await round;
    jest.useRealTimers();
  });
});

describe('syncSubscriptionWithRetry', () => {
  it('does not invent a pending card for a user who never purchased', async () => {
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);

    expect(store.getState().subscription.syncPending).toBe(false);
  });
});

/**
 * `sync` premium'u KAPATABİLİR (backend sözleşmesi 2026-08-18): RC kullanıcıyı
 * tanıyıp aktif entitlement göremezse backend downgrade eder ve `status`
 * `isActivelyPremium: false` döner. İptal/iade en geç ~1 saat içinde buradan
 * yansıyor.
 *
 * Tuzak şu: bu cevap "webhook henüz inmedi" ile AYNI gövdeye sahip
 * (`synced:false` + `NOT_FOUND_IN_RC`). Ayıran tek şey koruma penceresi —
 * kalıcı satın alma kaydı ya da optimistic grace. Aşağıdaki dört test o
 * ayrımın iki yönünü de kilitliyor: downgrade uygulanmazsa iade edilmiş
 * kullanıcı premium kalır, fazla uygulanırsa parasını yeni ödemiş kullanıcının
 * hakkı elinden alınır.
 */
describe('syncSubscriptionWithRetry — downgrade', () => {
  const mockDowngradeResponse = () =>
    mockPost.mockResolvedValue({
      result: {
        synced: false,
        source: 'rc_rest',
        reason: 'NOT_FOUND_IN_RC',
        status: cancelledStatus,
      },
    });

  it('closes premium when RC no longer has the entitlement', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, expiresAt: null }));
    mockDowngradeResponse();

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);

    expect(selectIsPremium(store.getState())).toBe(false);
    // Downgrade "aktivasyon sürüyor" DEĞİL — kart çıkarsa kullanıcı beklemesi
    // gereken bir şey olduğunu sanır.
    expect(store.getState().subscription.syncPending).toBe(false);
    expect(store.getState().subscription.status).toBe('Expired');
  });

  it('does not touch premium inside the optimistic window right after a purchase', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));
    mockDowngradeResponse();

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);

    expect(selectIsPremium(store.getState())).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('does not touch premium while a paid purchase is still unresolved', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });
    store.dispatch(setPremium({ isPremium: true, expiresAt: null }));
    mockDowngradeResponse();

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);

    expect(selectIsPremium(store.getState())).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('keeps premium when the backend sends no status object at all', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, expiresAt: null }));
    // Gövdesi boş yanıt (eski sürüm / hata) — `normalizeStatus(null)` da
    // `isPremium:false` üretir, downgrade'den ayırt edilemez.
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'RC_REST_ERROR', status: null },
    });

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }) as any);

    expect(selectIsPremium(store.getState())).toBe(true);
  });
});

/**
 * Hub `SubscriptionChanged` — admin panelden kapatılan premium'un ANINDA
 * yansıması. Event `/status` ile aynı gövdeyi taşıyor, bu yüzden ek fetch yok;
 * buradaki testler o kısayolun mevcut korumaları delmediğini sabitliyor.
 */
describe('SubscriptionChanged (hub)', () => {
  const revokeEvent = {
    isActivelyPremium: false,
    premiumExpiresAt: '2026-08-19T14:03:11.482Z',
    status: 'Expired',
    autoRenewEnabled: false,
    provider: 'AppStore',
    reason: 'admin_revoke',
    at: '2026-08-19T14:03:11.482Z',
  };

  it('applies the payload without a second /status round trip', async () => {
    const store = makeStore();

    await store.dispatch(
      applySubscriptionChanged({
        ...activeStatus,
        reason: 'admin_grant',
        at: new Date().toISOString(),
      } as any) as any,
    );

    expect(selectIsPremium(store.getState())).toBe(true);
    expect(store.getState().subscription.lastChangeReason).toBe('admin_grant');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('closes the recovery record when the event grants premium', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly', source: 'purchase' });

    await store.dispatch(
      applySubscriptionChanged({ ...activeStatus, reason: 'store_purchase' } as any) as any,
    );

    expect(hasPendingPremiumSync('user-1')).toBe(false);
    expect(store.getState().subscription.syncPending).toBe(false);
    expect(mockCapture).toHaveBeenCalledWith(
      'premium_activated',
      expect.objectContaining({ source: 'hub' }),
    );
  });

  it('revokes premium even inside the optimistic purchase window', async () => {
    // Pencerenin gerekçesi "webhook henüz inmedi" yarışı; admin iptalinde böyle
    // bir yarış yok. Aksi halde kullanıcı "aboneliğin sonlandırıldı" toast'ını
    // görür ama premium UI 10 dk daha açık kalırdı.
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));

    await store.dispatch(applySubscriptionChanged(revokeEvent as any) as any);

    expect(selectIsPremium(store.getState())).toBe(false);
    expect(store.getState().subscription.optimisticPremiumAt).toBeNull();
  });

  it('does not let a store downgrade undo a purchase that is still landing', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));

    await store.dispatch(
      applySubscriptionChanged({ ...revokeEvent, reason: 'sync_downgrade' } as any) as any,
    );

    expect(selectIsPremium(store.getState())).toBe(true);
  });

  it('ignores a payload that carries no gating field', async () => {
    // Sözleşme dışı gövde: `normalizeStatus` bunu da `isPremium:false`'a
    // çevirirdi ve premium sebepsiz kapanırdı.
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, expiresAt: null }));

    const res: any = await store
      .dispatch(applySubscriptionChanged({ reason: 'admin_revoke' } as any) as any)
      .unwrap();

    expect(res.applied).toBe(false);
    expect(selectIsPremium(store.getState())).toBe(true);
  });

  it('does not let an in-flight /status resurrect the revoked subscription', async () => {
    // Admin iptal ediyor, event 50 ms sonra düşüyor, ama saniyenin başında
    // atılmış `/status` cevabı sonra geliyor ve "premium: true" diyor.
    const store = makeStore();
    let resolveGet: (v: any) => void = () => {};
    mockGet.mockImplementation(
      () => new Promise((resolve) => { resolveGet = resolve; }),
    );

    const inFlight = store.dispatch(fetchSubscriptionStatus() as any);
    await store.dispatch(applySubscriptionChanged(revokeEvent as any) as any);
    resolveGet({ result: activeStatus });
    await inFlight;

    expect(selectIsPremium(store.getState())).toBe(false);
  });

  it('still applies a /status answer requested after the event', async () => {
    const store = makeStore();
    await store.dispatch(applySubscriptionChanged(revokeEvent as any) as any);
    mockGet.mockResolvedValue({ result: activeStatus });

    // Yeniden bağlanma turu: event'ten SONRA yola çıkan cevap canonical.
    await new Promise((r) => setTimeout(r, 2));
    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(true);
  });
});
