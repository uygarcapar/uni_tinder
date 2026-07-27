import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import {
  getRevenueCatPremiumStatus,
  getRevenueCatSnapshot,
} from "@/features/profile/subscriptionService";
import type {
  SubscriptionState,
  SubscriptionStatusSnapshot,
  SyncReason,
  SyncSource,
} from "@/shared/types";

// Backend SubscriptionStatusDto → FE snapshot. `isActivelyPremium` TEK gating
// alanı; geri kalanı UI state machine'i için (Cancelled / BillingIssue / trial).
const normalizeStatus = (raw: any): SubscriptionStatusSnapshot => {
  if (!raw) {
    return {
      isPremium: false,
      expiresAt: null,
      status: null,
      productId: null,
      autoRenewEnabled: false,
      isTrial: false,
      trialEndsAt: null,
      gracePeriodEndsAt: null,
      cancelledAt: null,
      provider: null,
    };
  }
  return {
    isPremium: raw.isActivelyPremium ?? raw.isPremium ?? false,
    expiresAt: raw.premiumExpiresAt ?? raw.expiresAt ?? null,
    status: raw.status ?? null,
    productId: raw.productId ?? null,
    autoRenewEnabled: raw.autoRenewEnabled ?? false,
    isTrial: raw.isTrial ?? false,
    trialEndsAt: raw.trialEndsAt ?? null,
    gracePeriodEndsAt: raw.gracePeriodEndsAt ?? null,
    cancelledAt: raw.cancelledAt ?? null,
    provider: raw.provider ?? null,
  };
};

export const fetchSubscriptionStatus = createAsyncThunk(
  "subscription/fetchStatus",
  async (_, { rejectWithValue }) => {
    try {
      const backendRes = await api.get(API_ENDPOINTS.SUBSCRIPTION_STATUS) as any;
      return normalizeStatus(backendRes.result);
    } catch (e: any) {
      // RC SDK fallback SADECE backend hata verdiğinde. Success path'ine
      // eklenmesi cross-user premium leak yaratmıştı — oraya taşıma.
      const rcStatus = await getRevenueCatPremiumStatus().catch(
        () => ({ isPremium: false, expiresAt: null } as const)
      );
      if (rcStatus.isPremium) {
        return { ...normalizeStatus(null), isPremium: true, expiresAt: rcStatus.expiresAt };
      }
      return rejectWithValue(e.message);
    }
  },
  {
    // In-flight dedupe: boot'ta RC init effect'i ile addCustomerInfoListener'ın
    // kayıt anındaki ilk tetiklemesi aynı anda iki /status isteği atıyordu
    // (Sentry trace kanıtlı) — uçuşta istek varken ikincisi düşer. Sonuç aynı
    // backend-canonical cevaptan geleceği için veri kaybı yok.
    condition: (_, { getState }) => !(getState() as any).subscription?.loading,
  }
);

// Backend `/sync` semantiği: önce local DB, aktif premium yoksa RevenueCat
// REST v1 fallback + persist. `synced:false` iken bile `isSuccess:true` döner
// → sadece `synced`e bak.
//
// RETRY ARALIĞI ≥ 10 SN OLMALI: `NOT_FOUND_IN_RC` sonrası backend aynı kullanıcı
// için 10 sn negative cache tutuyor, daha sık deneme RC'ye hiç gitmeden aynı
// cevabı döndürür (eski 4×1.5sn politikası bu yüzden pratikte tek deneme
// değerindeydi). Ayrıca SubscriptionController 60 istek/60 sn paylaşımlı limitte.
const SYNC_BACKOFF_MS = [2000, 5000, 10000, 20000, 40000];

interface SyncThunkResult extends SubscriptionStatusSnapshot {
  synced: boolean;
  reason: SyncReason | null;
  source: SyncSource | null;
  attempts: number;
}

export const syncSubscriptionWithRetry = createAsyncThunk<
  SyncThunkResult,
  { maxAttempts?: number } | void
>(
  "subscription/syncWithRetry",
  async (arg, { rejectWithValue }) => {
    const maxAttempts =
      (arg as { maxAttempts?: number } | undefined)?.maxAttempts ??
      SYNC_BACKOFF_MS.length + 1;
    let lastStatus: any = null;
    let lastReason: SyncReason | null = null;
    let lastSource: SyncSource | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        const delay =
          SYNC_BACKOFF_MS[Math.min(attempt - 2, SYNC_BACKOFF_MS.length - 1)];
        await new Promise((r) => setTimeout(r, delay));
      }
      try {
        const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_SYNC) as any;
        const result = res.result ?? {};
        lastStatus = result.status;
        lastReason = result.reason ?? null;
        lastSource = result.source ?? null;

        // WEBHOOK_LANDED (db) | RC_REST_CONFIRMED (rc_rest) → bitti.
        const synced =
          result.synced === true || result.status?.isActivelyPremium === true;
        if (synced) {
          return {
            ...normalizeStatus(result.status),
            synced: true,
            reason: lastReason,
            source: lastSource,
            attempts: attempt,
          };
        }

        // REST fallback konfigüre değil → tekrar denemenin faydası yok, webhook
        // düşene kadar beklenecek. Döngüyü kır, çağıran "pending" UI'ı göstersin.
        if (lastReason === "RC_REST_UNAVAILABLE") break;
      } catch (e: any) {
        if (attempt === maxAttempts) {
          return rejectWithValue(e.message || "Sync failed");
        }
      }
    }

    return {
      ...normalizeStatus(lastStatus),
      synced: false,
      reason: lastReason,
      source: lastSource,
      attempts: maxAttempts,
    };
  }
);

/**
 * RC SDK "premium" derken backend demiyorsa (veya tersi) çağrılır. Backend
 * `/reconcile` aynı flow'u `/sync` ile çalıştırır, ek olarak RC bilgilerini
 * audit log'a yazar. Çelişki yoksa hiç istek atılmaz — 60/dk rate limit'i
 * gereksiz yere yemesin.
 */
export const reconcileIfMismatched = createAsyncThunk(
  "subscription/reconcileIfMismatched",
  async (_, { getState, rejectWithValue }) => {
    const snapshot = await getRevenueCatSnapshot();
    // RC konfigüre değil / customerInfo alınamadı → yapılacak bir şey yok.
    if (!snapshot) return { skipped: true as const };

    const backendPremium = selectIsPremium(getState());
    if (snapshot.isPremium === backendPremium) return { skipped: true as const };

    try {
      const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_RECONCILE, {
        rcLatestTransactionId: snapshot.latestPurchaseDate,
        rcOriginalTransactionId: snapshot.originalPurchaseDate,
        rcEntitlements: snapshot.entitlements,
      }) as any;
      const result = res.result ?? {};
      return {
        skipped: false as const,
        ...normalizeStatus(result.status),
        synced: result.synced === true,
        reason: (result.reason ?? null) as SyncReason | null,
        source: (result.source ?? null) as SyncSource | null,
      };
    } catch (e: any) {
      return rejectWithValue(e.message || "Reconcile failed");
    }
  }
);

// RC satın alma/restore anında yazılan optimistic premium'un korunma süresi.
// StoreKit sheet kapanınca AppState background→active geçtiği için AppNavigator
// `fetchSubscriptionStatus` atıyor ve bu istek satın almadan HEMEN ÖNCE yola
// çıkmış oluyor — cevabı geldiğinde (webhook henüz inmediği için `false`)
// optimistic `setPremium(true)`'yu eziyordu. Görünen semptom: LikesScreen'de
// blur + CTA geri gelir, app reload edilince düzelir.
//
// Pencere boyunca backend'in `false`'ı yok sayılır; `true` geldiği an bayrak
// temizlenir. Pencere dolduğunda backend yine canonical olur — webhook hiç
// inmediyse (sandbox filtresi vb.) UI free'ye döner, kalıcı yalan premium yok.
const OPTIMISTIC_PREMIUM_GRACE_MS = 10 * 60 * 1000;

const isWithinOptimisticGrace = (state: SubscriptionState): boolean =>
  state.optimisticPremiumAt != null &&
  Date.now() - state.optimisticPremiumAt < OPTIMISTIC_PREMIUM_GRACE_MS;

const applyStatus = (state: SubscriptionState, s: SubscriptionStatusSnapshot) => {
  state.isPremium = s.isPremium;
  state.expiresAt = s.expiresAt;
  state.status = s.status;
  state.productId = s.productId;
  state.autoRenewEnabled = s.autoRenewEnabled;
  state.isTrial = s.isTrial;
  state.trialEndsAt = s.trialEndsAt;
  state.gracePeriodEndsAt = s.gracePeriodEndsAt;
  state.cancelledAt = s.cancelledAt;
  state.provider = s.provider;
  if (s.isPremium) state.optimisticPremiumAt = null;
};

const initialState: SubscriptionState = {
  isPremium: false,
  expiresAt: null,
  status: null,
  productId: null,
  autoRenewEnabled: false,
  isTrial: false,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
  cancelledAt: null,
  provider: null,
  loading: false,
  syncing: false,
  lastSyncedAt: null,
  lastSyncReason: null,
  syncPending: false,
  optimisticPremiumAt: null,
};

const subscriptionSlice = createSlice({
  name: "subscription",
  initialState,
  reducers: {
    // `optimistic: true` → değer RC SDK'dan geliyor, backend henüz doğrulamadı.
    // Grace penceresi başlar; backend'in stale `false`'ı bu süre boyunca bunu
    // ezemez. Logout/user switch'te gelen `isPremium: false` bayrağı temizler.
    setPremium: (
      state,
      action: PayloadAction<{ isPremium: boolean; expiresAt?: string | null; optimistic?: boolean }>
    ) => {
      state.isPremium = action.payload.isPremium ?? false;
      state.expiresAt = action.payload.expiresAt ?? null;
      state.optimisticPremiumAt =
        action.payload.isPremium && action.payload.optimistic ? Date.now() : null;
      if (!action.payload.isPremium) {
        state.status = null;
        state.productId = null;
        state.isTrial = false;
        state.trialEndsAt = null;
        state.gracePeriodEndsAt = null;
        state.cancelledAt = null;
        state.syncPending = false;
        state.lastSyncReason = null;
      }
    },
    // "Aktivasyon sürüyor" kartındaki manuel "Yenile" akışı bunu temizler.
    clearSyncPending: (state) => {
      state.syncPending = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubscriptionStatus.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSubscriptionStatus.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return;
        // Satın alma penceresi içindeki `false` = "backend webhook'u henüz
        // görmedi", downgrade değil. Bkz. OPTIMISTIC_PREMIUM_GRACE_MS.
        if (!action.payload.isPremium && isWithinOptimisticGrace(state)) return;
        applyStatus(state, action.payload);
        // Backend premium'u onayladı → "aktivasyon sürüyor" kartı kapansın.
        if (action.payload.isPremium) state.syncPending = false;
      })
      .addCase(fetchSubscriptionStatus.rejected, (state) => {
        state.loading = false;
      })
      .addCase(syncSubscriptionWithRetry.pending, (state) => {
        state.syncing = true;
      })
      .addCase(syncSubscriptionWithRetry.fulfilled, (state, action) => {
        state.syncing = false;
        state.lastSyncedAt = Date.now();
        const payload = action.payload;
        if (!payload) return;
        state.lastSyncReason = payload.reason;
        // `synced:false` = denemeler bitti ama backend hâlâ premium görmüyor
        // (RC REST fallback da bulamadı ya da konfigüre değil). Bu bir DOWNGRADE
        // DEĞİL — satın alma anındaki optimistic setPremium'u ezmemeli. Kullanıcıya
        // "aktivasyon sürüyor" göster; gerçek downgrade zaten fetchSubscriptionStatus
        // ve foreground invalidate'inden gelir.
        if (!payload.synced) {
          state.syncPending = state.isPremium || isWithinOptimisticGrace(state);
          return;
        }
        state.syncPending = false;
        applyStatus(state, payload);
      })
      .addCase(syncSubscriptionWithRetry.rejected, (state) => {
        state.syncing = false;
        // Ağ hatası: premium'u düşürme, pending göster.
        state.syncPending = state.isPremium || isWithinOptimisticGrace(state);
      })
      .addCase(reconcileIfMismatched.fulfilled, (state, action) => {
        const payload: any = action.payload;
        if (!payload || payload.skipped) return;
        state.lastSyncedAt = Date.now();
        state.lastSyncReason = payload.reason ?? null;
        // Reconcile backend'i canonical kabul eder; ancak grace penceresi
        // içindeki `false`'a yine güvenmiyoruz (aynı webhook yarışı).
        if (!payload.isPremium && isWithinOptimisticGrace(state)) return;
        applyStatus(state, payload);
        if (payload.isPremium) state.syncPending = false;
      });
  },
});

export const { setPremium, clearSyncPending } = subscriptionSlice.actions;

// Backend `isPremium` flag'i webhook/cache gecikmesinde stale kalabildiği için
// `expiresAt`'i client-side de doğrula. `expiresAt === null` ise (RC fallback
// veya henüz hiç sync olmamış) boolean'a güveniyoruz.
//
// NOT: `Cancelled` ve `BillingIssue` durumlarında backend `isActivelyPremium`
// true dönmeye devam eder (dönem sonu / grace bitişine kadar) — erişimi burada
// kapatma, UI yalnızca uyarı/CTA göstersin.
export const selectIsPremium = (state: any): boolean => {
  const sub = state?.subscription;
  if (!sub?.isPremium) return false;
  if (!sub.expiresAt) return true;
  return new Date(sub.expiresAt).getTime() > Date.now();
};

export const selectSubscription = (state: any): SubscriptionState => state?.subscription;
export const selectSyncPending = (state: any): boolean =>
  !!state?.subscription?.syncPending;

export default subscriptionSlice.reducer;
