import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import {
  getRevenueCatPremiumStatus,
  getRevenueCatSnapshot,
} from "@/features/profile/subscriptionService";
import {
  bumpPendingPremiumSyncAttempt,
  clearPendingPremiumSync,
  hasPendingPremiumSync,
  markPendingPremiumSync,
  premiumSyncUserKey,
  readPendingPremiumSync,
} from "@/features/profile/pendingPremiumSync";
import { analytics } from "@/shared/services/analytics";
import { iapLog } from "@/features/profile/purchaseDiagnostics";
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

/** Kalıcı pending kaydının anahtarı — auth slice'ındaki aktif kullanıcı. */
const userKeyOf = (state: any): string | null =>
  premiumSyncUserKey(state?.auth?.user);

/**
 * Premium onaylandı → "ödedi ama backend görmüyor" kaydı düşer. Kayıt gerçekten
 * varken silindiyse bu, para/hak açığının KAPANDIĞI andır: §15'teki alarm
 * hunisinin (`premium_sync_pending` → `premium_activated`) kapanış eventi.
 */
const resolvePendingRecord = (state: any, source: string) => {
  const uid = userKeyOf(state);
  if (!uid) return;
  const pending = readPendingPremiumSync(uid);
  if (!pending) return;
  clearPendingPremiumSync(uid);
  analytics.capture("premium_activated", {
    source,
    productId: pending.productId,
    attempts: pending.attempts,
    waitedMs: Date.now() - pending.at,
  });
};

export const fetchSubscriptionStatus = createAsyncThunk(
  "subscription/fetchStatus",
  async (_, { getState, rejectWithValue }) => {
    try {
      const backendRes = await api.get(API_ENDPOINTS.SUBSCRIPTION_STATUS) as any;
      const status = normalizeStatus(backendRes.result);
      // Backend'in canonical cevabı — "reload'da premium gitti" semptomunda
      // suçlanan tek satır bu. Ham alan adları da yazılıyor: `isActivelyPremium`
      // yerine başka bir ad dönüyorsa normalize sessizce `false` üretir ve
      // dışarıdan "backend premium demiyor" ile ayırt edilemez.
      iapLog("status", {
        isPremium: status.isPremium,
        ham_isActivelyPremium: backendRes?.result?.isActivelyPremium ?? null,
        status: status.status,
        ürün: status.productId,
        bitiş: status.expiresAt,
        provider: status.provider,
      });
      if (status.isPremium) resolvePendingRecord(getState(), "status");
      return status;
    } catch (e: any) {
      iapLog("status-hata", {
        http: e?.response?.status ?? null,
        code: e?.response?.data?.code ?? null,
        hata: e?.response?.data?.message ?? e?.message ?? null,
      });
      // RC SDK fallback SADECE backend hata verdiğinde. Success path'ine
      // eklenmesi cross-user premium leak yaratmıştı — oraya taşıma.
      const rcStatus = await getRevenueCatPremiumStatus().catch(
        () => ({ isPremium: false, expiresAt: null } as const)
      );
      if (rcStatus.isPremium) {
        iapLog("status-rc-fallback", { isPremium: true, bitiş: rcStatus.expiresAt });
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

/** `RC_REST_ERROR` geçici bir arıza — doküman §3.3 en fazla 3 deneme diyor. */
const RC_REST_ERROR_MAX_ATTEMPTS = 3;

interface SyncThunkResult extends SubscriptionStatusSnapshot {
  synced: boolean;
  reason: SyncReason | null;
  source: SyncSource | null;
  attempts: number;
  /** Denemeler bittikten SONRA kalıcı "ödedi ama görünmüyor" kaydı duruyor mu. */
  pending: boolean;
}

export const syncSubscriptionWithRetry = createAsyncThunk<
  SyncThunkResult,
  { maxAttempts?: number } | void
>(
  "subscription/syncWithRetry",
  async (arg, { getState, rejectWithValue }) => {
    const uid = userKeyOf(getState());
    const maxAttempts =
      (arg as { maxAttempts?: number } | undefined)?.maxAttempts ??
      SYNC_BACKOFF_MS.length + 1;
    let lastStatus: any = null;
    let lastReason: SyncReason | null = null;
    let lastSource: SyncSource | null = null;
    // GERÇEKTEN atılan istek sayısı. `maxAttempts` artık tavan: döngü çoğu
    // `reason`'da erken kırılıyor, teşhis satırında tavanı yazmak yanıltıcıydı.
    let usedAttempts = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      usedAttempts = attempt;
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
        // HER deneme yazılıyor, yalnız son durum değil: `reason` denemeler
        // arasında değişiyorsa (RC_REST_ERROR → NOT_FOUND_IN_RC) sorun geçici
        // bir RC arızası değil, kalıcı bir eşleşme sorunudur.
        iapLog("sync", {
          deneme: `${attempt}/${maxAttempts}`,
          synced,
          reason: lastReason,
          source: lastSource,
          isActivelyPremium: result.status?.isActivelyPremium ?? null,
          ürün: result.status?.productId ?? null,
        });
        if (synced) {
          resolvePendingRecord(getState(), "sync");
          return {
            ...normalizeStatus(result.status),
            synced: true,
            reason: lastReason,
            source: lastSource,
            attempts: attempt,
            pending: false,
          };
        }

        // Bu turda ısrar etmenin faydasının olmadığı `reason`'lar. Döngüyü
        // kırıyoruz ama kalıcı kaydı DÜŞÜRMÜYORUZ: kurtarma bir sonraki cold
        // start / foreground turunda devam eder (webhook o zamana kadar inmiş
        // olabilir).
        //
        //   RC_REST_UNAVAILABLE → backend'de RC REST anahtarı yok; yalnız
        //                         webhook'a bağlıyız, beklemekten başka yol yok.
        //   NOT_FOUND_IN_RC     → RC'de de aktif abonelik görünmüyor. Backend bu
        //                         cevabın ardından 10 sn negative cache tutuyor,
        //                         yani kısa aralıklı retry RC'ye hiç gitmeden
        //                         aynı cevabı döndürür (eski 6 denemenin ilk
        //                         ikisi tam da bu pencereye düşüyordu).
        if (
          lastReason === "RC_REST_UNAVAILABLE" ||
          lastReason === "NOT_FOUND_IN_RC"
        ) {
          break;
        }
        // RC REST'e ulaşılamadı — geçici. Doküman §3.3: en fazla 3 deneme.
        if (lastReason === "RC_REST_ERROR" && attempt >= RC_REST_ERROR_MAX_ATTEMPTS) {
          break;
        }
      } catch (e: any) {
        // Ağ/HTTP hatası eskiden TAMAMEN sessizdi: `/sync` 401 (token) ya da
        // 429 (60/dk limit) dönüyorsa dışarıdan "webhook inmedi"den ayırt
        // edilemiyordu — ikisi tamamen farklı düzeltme gerektiriyor.
        iapLog("sync-hata", {
          deneme: `${attempt}/${maxAttempts}`,
          http: e?.response?.status ?? null,
          code: e?.response?.data?.code ?? null,
          hata: e?.response?.data?.message ?? e?.message ?? null,
        });
        if (attempt === maxAttempts) {
          // Ağ hatası kaydı DÜŞÜRMEZ: kuyruk bir sonraki açılışta yeniden dener.
          bumpPendingPremiumSyncAttempt(uid);
          return rejectWithValue(e.message || "Sync failed");
        }
      }
    }

    // Denemeler bitti, backend hâlâ premium görmüyor. Kayıt varsa duruyor —
    // cold start / foreground kurtarma turu onu tekrar deneyecek.
    //
    // Release'de de yazılıyor (superlike redeem'deki gibi): "premium aldım ama
    // gelmedi" şikâyetinde cihazdan alınabilecek TEK somut delil bu satır.
    // `reason` sorunun hangi tarafta olduğunu söylüyor:
    //   NOT_FOUND_IN_RC      → RC'de bu kullanıcıya ait aktif abonelik YOK
    //                          (webhook inmedi + REST de göremedi; çoğu zaman
    //                          appUserID uyuşmazlığı ya da sandbox filtresi)
    //   RC_REST_UNAVAILABLE  → backend'de RC REST anahtarı konfigüre değil
    //   RC_REST_ERROR        → RC REST'e ulaşılamadı
    iapLog("sync-başarısız", {
      reason: lastReason,
      source: lastSource,
      deneme: usedAttempts,
      anlam:
        lastReason === "NOT_FOUND_IN_RC"
          ? "RC'de bu app_user_id için aktif abonelik yok (kimlik uyuşmazlığı ya da sandbox filtresi)"
          : lastReason === "RC_REST_UNAVAILABLE"
            ? "backend'de RC REST anahtarı yok — yalnız webhook'a bağlıyız"
            : lastReason === "RC_REST_ERROR"
              ? "backend RC REST'e ulaşamadı (geçici)"
              : "backend reason döndürmedi",
    });
    bumpPendingPremiumSyncAttempt(uid);
    return {
      ...normalizeStatus(lastStatus),
      synced: false,
      reason: lastReason,
      source: lastSource,
      attempts: usedAttempts,
      pending: hasPendingPremiumSync(uid),
    };
  }
);

/**
 * Satın alma/restore anında çağrılır: para alındı, backend henüz doğrulamadı.
 * Kayıt KALICI (MMKV) — reload bunu silmiyor, `resolvePendingPremiumSync`
 * her açılışta ve foreground'da yeniden deniyor.
 */
export const markPremiumPurchasePending = createAsyncThunk(
  "subscription/markPurchasePending",
  async (arg: { productId?: string | null } | void, { getState }) => {
    const uid = userKeyOf(getState());
    if (!uid) return { pending: false };
    const productId =
      (arg as { productId?: string | null } | undefined)?.productId ?? null;
    const alreadyPending = hasPendingPremiumSync(uid);
    markPendingPremiumSync(uid, { productId });
    // "Para alındı, hak verilmedi" penceresinin AÇILDIĞI an — raporda premium
    // olaylarının başlangıç çizgisi.
    iapLog("premium-bekliyor", { productId, zatenVardı: alreadyPending });
    if (!alreadyPending) {
      // §15: "para alındı / hak verilmedi" anı. Oranı izlenmeli — %1'i geçerse
      // backend webhook'unda sorun var demektir.
      analytics.capture("premium_sync_pending", { productId });
    }
    return { pending: true };
  }
);

/**
 * Cold start + foreground kurtarma turu. Kalıcı kayıt yoksa HİÇ istek atmaz
 * (rate limit 60/60 sn paylaşımlı). Kayıt varsa kısa turlu `/sync` dener;
 * çözülmezse kayıt yerinde kalır ve bir sonraki turda yeniden denenir.
 */
export const resolvePendingPremiumSync = createAsyncThunk(
  "subscription/resolvePending",
  async (arg: { maxAttempts?: number } | void, { getState, dispatch }) => {
    const uid = userKeyOf(getState());
    const pending = readPendingPremiumSync(uid);
    if (!pending) return { pending: false as const };
    // Reload sonrası hâlâ bekleyen bir ödeme var: kaydın YAŞI ve deneme sayısı,
    // "webhook birazdan iner" ile "günlerdir inmiyor"u ayıran tek veri.
    iapLog("premium-bekleyen-kayıt", {
      productId: pending.productId,
      denemeler: pending.attempts,
      yaşDk: Math.round((Date.now() - pending.at) / 60000),
    });
    // Backend zaten premium diyorsa kaydı burada kapat — `/sync` atmaya gerek yok.
    if (selectIsPremium(getState())) {
      resolvePendingRecord(getState(), "resolve");
      return { pending: false as const };
    }
    await dispatch(
      syncSubscriptionWithRetry({
        maxAttempts:
          (arg as { maxAttempts?: number } | undefined)?.maxAttempts ?? 3,
      }),
    );
    return { pending: hasPendingPremiumSync(uid) };
  },
);

/**
 * Paywall açılmadan ÖNCE canonical state'i tazeler (§11). Kullanıcı başka bir
 * cihazda premium olmuş olabilir; bayat redux değeriyle modal açmak "zaten
 * aldım, hâlâ para istiyor" şikâyetinin kaynağı.
 *
 * `true` döner → premium, modal AÇILMAMALI.
 *
 * İki emniyet var: aynı soruyu saniyede bir sormamak için throttle (paywall
 * tetikleyicileri seri gelebiliyor — kota dolduğunda her swipe denemesi) ve
 * ağ takılırsa sheet'i bekletmemek için tavan süre. Tavana takılırsa elimizdeki
 * son bilinen değerle devam ediyoruz: paywall'ı geciktirmek, göstermemekten
 * daha kötü.
 */
const PAYWALL_REFRESH_THROTTLE_MS = 30_000;
const PAYWALL_REFRESH_TIMEOUT_MS = 1500;
let lastPaywallRefreshAt = 0;

export const refreshEntitlementsForPaywall = createAsyncThunk<boolean>(
  "subscription/refreshForPaywall",
  async (_, { dispatch, getState }) => {
    if (selectIsPremium(getState())) return true;
    if (Date.now() - lastPaywallRefreshAt < PAYWALL_REFRESH_THROTTLE_MS) {
      // Yukarıda premium olmadığını zaten gördük; taze istek atmadan aynı cevap.
      return false;
    }
    lastPaywallRefreshAt = Date.now();
    await Promise.race([
      dispatch(fetchSubscriptionStatus()),
      new Promise((resolve) => setTimeout(resolve, PAYWALL_REFRESH_TIMEOUT_MS)),
    ]);
    return selectIsPremium(getState());
  },
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
    if (snapshot.isPremium === backendPremium) {
      // Uyuşma da bilgi: RC ve backend'in İKİSİ de "premium değil" diyorsa
      // reconcile hiç istek atmaz ve raporda hiçbir iz kalmazdı — "reconcile
      // çalıştı mı" sorusu cevapsız kalıyordu.
      iapLog("reconcile-atlandı", { rc: snapshot.isPremium, backend: backendPremium });
      return { skipped: true as const };
    }
    iapLog("reconcile-uyuşmazlık", {
      rc: snapshot.isPremium,
      backend: backendPremium,
      entitlements: snapshot.entitlements,
      ürün: snapshot.productId,
    });

    const uid = userKeyOf(getState());
    // RC "ödendi" diyor, backend görmüyor: satın alma kaydı kaybolmuş olabilir
    // (satın alma başka cihazda yapıldı ya da uygulama kuyruğa yazmadan
    // öldürüldü). Kurtarma kaydını BURADA da kur — reconcile başarısız olsa
    // bile sonraki açılış tekrar denesin.
    if (snapshot.isPremium && !backendPremium) {
      const alreadyPending = hasPendingPremiumSync(uid);
      markPendingPremiumSync(uid, { productId: snapshot.productId });
      if (!alreadyPending) {
        analytics.capture("premium_sync_pending", {
          productId: snapshot.productId,
          source: "reconcile",
        });
      }
    }

    try {
      const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_RECONCILE, {
        // RC `CustomerInfo` abonelikler için transaction id EXPOSE ETMİYOR
        // (yalnız `nonSubscriptionTransactions` taşıyor). Buraya purchase date
        // yazmak backend'in audit log'unu transaction id sanılan tarihlerle
        // dolduruyordu — alan opsiyonel, bilmiyorsak `null` gönderiyoruz.
        // Eşleştirme zaten `app_user_id` üzerinden yapılıyor.
        rcLatestTransactionId: null,
        rcOriginalTransactionId: null,
        rcEntitlements: snapshot.entitlements,
      }) as any;
      const result = res.result ?? {};
      const status = normalizeStatus(result.status);
      iapLog("reconcile", {
        synced: result.synced === true,
        reason: result.reason ?? null,
        source: result.source ?? null,
        isPremium: status.isPremium,
      });
      if (status.isPremium) resolvePendingRecord(getState(), "reconcile");
      return {
        skipped: false as const,
        ...status,
        synced: result.synced === true,
        reason: (result.reason ?? null) as SyncReason | null,
        source: (result.source ?? null) as SyncSource | null,
        rcPremium: snapshot.isPremium,
        pending: hasPendingPremiumSync(uid),
      };
    } catch (e: any) {
      iapLog("reconcile-hata", {
        http: e?.response?.status ?? null,
        hata: e?.response?.data?.message ?? e?.message ?? null,
      });
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
    // Boot'ta MMKV'deki kalıcı kayıttan besleniyor: reload premium'u
    // sıfırlıyordu ve kullanıcı "aktivasyon sürüyor" kartını bile göremiyordu.
    hydrateSyncPending: (state, action: PayloadAction<boolean>) => {
      state.syncPending = action.payload;
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
          // Kalıcı kayıt (satın alma anında yazılıyor) tek doğru sinyal:
          // reload sonrası optimistic bayrak da `isPremium` de sıfır olduğu için
          // eski ifade daima `false` üretiyordu ve kart hiç görünmüyordu.
          state.syncPending =
            payload.pending === true ||
            state.isPremium ||
            isWithinOptimisticGrace(state);
          return;
        }
        state.syncPending = false;
        applyStatus(state, payload);
      })
      .addCase(syncSubscriptionWithRetry.rejected, (state) => {
        state.syncing = false;
        // Ağ hatası: premium'u düşürme, pending göster. `state.syncPending`
        // korunuyor — boot'ta kalıcı kayıttan hidrate edilmiş olabilir ve
        // reducer'dan MMKV okumak (saf olmayan) doğru değil.
        state.syncPending =
          state.syncPending || state.isPremium || isWithinOptimisticGrace(state);
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
        if (payload.isPremium) {
          state.syncPending = false;
          return;
        }
        // RC "ödendi" derken backend hâlâ göremiyorsa bu bir downgrade DEĞİL,
        // webhook yarışı. Eskiden burada sessizce free'ye düşülüyordu:
        // `applyStatus` premium'u kapatıyor, `syncPending` set edilmediği için
        // "aktivasyon sürüyor" kartı da çıkmıyordu — reload sonrası kullanıcının
        // gördüğü tam olarak buydu.
        state.syncPending = payload.pending === true || payload.rcPremium === true;
      })
      .addCase(resolvePendingPremiumSync.fulfilled, (state, action) => {
        state.syncPending = action.payload?.pending === true;
      });
  },
});

export const { setPremium, clearSyncPending, hydrateSyncPending } =
  subscriptionSlice.actions;

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
