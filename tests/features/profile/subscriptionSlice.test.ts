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
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });

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
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });
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
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(resolvePendingPremiumSync({ maxAttempts: 1 }) as any);

    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('keeps the record on a network error instead of dropping the purchase', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });
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
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });
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
  it('does not silently downgrade to free when RC says paid but the backend does not', async () => {
    // Reload sonrası tam olarak bu oluyordu: reconcile `synced:false` dönüyor,
    // premium kapanıyor ve `syncPending` set edilmediği için kart da çıkmıyordu.
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

    expect(store.getState().subscription.syncPending).toBe(true);
    // Ve kayıt diskte: bir sonraki açılış yeniden deneyecek.
    expect(hasPendingPremiumSync('user-1')).toBe(true);
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

describe('optimistic premium grace', () => {
  it('ignores a stale backend "false" that lands right after the purchase', async () => {
    const store = makeStore();
    store.dispatch(setPremium({ isPremium: true, optimistic: true }));
    mockGet.mockResolvedValue({ result: { isActivelyPremium: false } });

    await store.dispatch(fetchSubscriptionStatus() as any);

    expect(selectIsPremium(store.getState())).toBe(true);
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

describe('syncSubscriptionWithRetry — stop conditions', () => {
  // Doküman §3.3: NOT_FOUND_IN_RC sonrası backend 10 sn negative cache tutuyor,
  // kısa aralıklı retry RC'ye hiç gitmeden aynı cevabı döndürüyor. Sıkı döngüyü
  // kırmak güvenli çünkü kalıcı kayıt bir sonraki açılışta yeniden deniyor.
  it('stops retrying on NOT_FOUND_IN_RC instead of burning the negative cache', async () => {
    const store = makeStore();
    markPendingPremiumSync('user-1', { productId: 'premium_monthly' });
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'NOT_FOUND_IN_RC', status: null },
    });

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 6 }) as any);

    expect(mockPost).toHaveBeenCalledTimes(1);
    // Kayıt DURUYOR — kurtarma bir sonraki tura devrediyor.
    expect(hasPendingPremiumSync('user-1')).toBe(true);
    expect(store.getState().subscription.syncPending).toBe(true);
  });

  it('stops on RC_REST_UNAVAILABLE — only the webhook can resolve it', async () => {
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'none', reason: 'RC_REST_UNAVAILABLE', status: null },
    });

    await store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 6 }) as any);

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('retries RC_REST_ERROR but caps it at 3 attempts', async () => {
    jest.useFakeTimers();
    const store = makeStore();
    mockPost.mockResolvedValue({
      result: { synced: false, source: 'db', reason: 'RC_REST_ERROR', status: null },
    });

    const pending = store.dispatch(syncSubscriptionWithRetry({ maxAttempts: 6 }) as any);
    await jest.advanceTimersByTimeAsync(120_000);
    await pending;

    expect(mockPost).toHaveBeenCalledTimes(3);
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
