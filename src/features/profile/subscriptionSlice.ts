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
  hasWitnessedPurchase,
  markPendingPremiumSync,
  premiumSyncUserKey,
  readPendingPremiumSync,
} from "@/features/profile/pendingPremiumSync";
import { analytics } from "@/shared/services/analytics";
import { iapLog } from "@/features/profile/purchaseDiagnostics";
import { normalizeBackendIso, parseBackendDate } from "@/shared/utils/backendDate";
import type {
  SubscriptionChangedEvent,
  SubscriptionChangeReason,
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
  // TÜM tarihler `normalizeBackendIso`'dan geçer. Backend bu DTO'da offset
  // GÖNDERMİYOR (`"2026-08-21T12:06:16"`) ve JS offset'siz damgayı yerel saat
  // sayıyor → UTC+3'te değer 3 saat geçmişte okunuyordu. `selectIsPremium`
  // aktif aboneliği "süresi dolmuş" sanıp premium'u kapatıyordu; slice'a
  // yazarken düzeltiyoruz ki aşağı akıştaki HER okuyucu (selector, tarih
  // biçimlendirme) aynı doğru değeri görsün.
  return {
    isPremium: raw.isActivelyPremium ?? raw.isPremium ?? false,
    expiresAt: normalizeBackendIso(raw.premiumExpiresAt ?? raw.expiresAt),
    status: raw.status ?? null,
    productId: raw.productId ?? null,
    autoRenewEnabled: raw.autoRenewEnabled ?? false,
    isTrial: raw.isTrial ?? false,
    trialEndsAt: normalizeBackendIso(raw.trialEndsAt),
    gracePeriodEndsAt: normalizeBackendIso(raw.gracePeriodEndsAt),
    cancelledAt: normalizeBackendIso(raw.cancelledAt),
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

/**
 * Aktivasyonunu beklediğimiz satın almanın ÇIPASI — elimizdeki EN GEÇ satın alma
 * sinyali. İki kaynak var ve ikisi de aynı soruyu farklı ömürle cevaplıyor:
 * kalıcı kurtarma kaydı (`at`, reload'u atlatır ama re-mark'ta TAZELENMEZ) ve
 * optimistic damga (her satın almada yenilenir, reload'da kaybolur).
 *
 * `Math.max` bilinçli: kayıt eski bir satın almadan kalmış olabilir, elimizde
 * daha yeni bir satın alma varsa "backend bunu gördü mü" sorusu YENİ olana
 * sorulmalı. `min` alsaydık, bir önceki aboneliğin bitmiş kaydı yeni satın
 * almayı kapatılmış sayardı.
 */
const purchaseAnchorOf = (
  rootState: any,
  pendingAt: number | null,
): number | null => {
  const stamps = [
    rootState?.subscription?.optimisticPremiumAt ?? null,
    pendingAt,
  ].filter((v): v is number => typeof v === "number");
  return stamps.length ? Math.max(...stamps) : null;
};

/**
 * "Backend bu satın almayı GÖRDÜ ve abonelik BİTTİ" mi?
 *
 * `syncPending` kartının ("aktivasyon sürüyor" + Yenile) tek gerekçesi
 * *backend henüz satın almamı görmedi*. Bu varsayımı yanlışlayan tek yol
 * buraya kadar yoktu: kaydı yalnız `isPremium === true` kapatıyordu. Abonelik
 * aktive olup SONRA bitmişse (sandbox'ta `premium_weekly` 3 dakika, prod'da
 * iade/hızlı iptal) backend `Expired` diyor, RC'de aktif entitlement olmadığı
 * için `/sync` sonsuza kadar `NOT_FOUND_IN_RC` dönüyor ve kart hiç kapanmıyordu
 * — kullanıcı çözülemeyecek bir şeyi tekrar tekrar deniyor.
 *
 * Ayırt edici: backend'in bildiği kaydın BİTİŞİ, beklediğimiz satın almadan
 * SONRA mı. Sonraysa o kayıt bizim satın almamızı kapsıyor → görüldü, bitti.
 * Öncesindeyse bu bir ÖNCEKİ aboneliğin kalıntısıdır ve yeni satın almanın
 * webhook'u hâlâ yolda olabilir → kayıt yerinde kalmalı.
 *
 * `expiresAt` yoksa hüküm YOK (`Expired` + boş tarih ayırt edilemez) — temkinli
 * taraf kaydı korumak.
 */
const settlePendingPurchase = (
  rootState: any,
  s: SubscriptionStatusSnapshot,
  source: string,
): boolean => {
  if (s.isPremium || !s.status) return false;
  const expiry = parseBackendDate(s.expiresAt);
  if (!expiry) return false;
  const uid = userKeyOf(rootState);
  const pending = readPendingPremiumSync(uid);
  const anchor = purchaseAnchorOf(rootState, pending?.at ?? null);
  if (anchor == null) return false;
  if (expiry.getTime() <= anchor) return false;
  iapLog("bekleyen-kayıt-kapandı", {
    kaynak: source,
    durum: s.status,
    ürün: s.productId,
    bitiş: s.expiresAt,
    kayıtYaşDk: pending ? Math.round((Date.now() - pending.at) / 60000) : null,
  });
  if (pending) {
    clearPendingPremiumSync(uid);
    analytics.capture("premium_sync_settled", {
      source,
      productId: pending.productId ?? s.productId,
      status: s.status,
      attempts: pending.attempts,
      waitedMs: Date.now() - pending.at,
    });
  }
  return true;
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
      if (status.isPremium) {
        resolvePendingRecord(getState(), "status");
        return { ...status, settled: false };
      }
      // Backend "bu aboneliği biliyorum, bitti" diyorsa bekleyen kurtarma kaydı
      // dayanaksız kalır — `settled` aşağı akışta hem kartı hem grace
      // penceresini kapatıyor (bkz. settlePendingPurchase).
      return { ...status, settled: settlePendingPurchase(getState(), status, "status") };
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
        return {
          ...normalizeStatus(null),
          isPremium: true,
          expiresAt: rcStatus.expiresAt,
          settled: false,
        };
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

/**
 * Hub `SubscriptionChanged` → state. EK BİR `/status` TURU YOK: event gövdesi
 * `/status` ile birebir aynı alanları taşıyor (backend ikisini de tek
 * projeksiyondan üretiyor), bu yüzden fetch atmak yalnızca gereksiz bir HTTP
 * turu ve 60/dk paylaşımlı limitten bir ısırık olurdu.
 *
 * Event TEK DOĞRULUK KAYNAĞI DEĞİL — SignalR teslimi kalıcı değil, kullanıcı
 * offline'ken atılan event kaybolur ve kimse yeniden göndermez. Telafi iki
 * yerde: açılış `/status`'u ve RE-connect'teki `/status` (bkz. AppNavigator
 * `__connectionStateChanged`). O ikisi olmadan "metroda premium iptal edildi,
 * yüzeye çıkınca hâlâ premium görünüyor" senaryosu kırık kalır.
 */
export const applySubscriptionChanged = createAsyncThunk(
  "subscription/hubChanged",
  async (
    payload: SubscriptionChangedEvent | null | undefined,
    { getState, dispatch },
  ) => {
    const raw = (payload ?? {}) as Record<string, any>;
    const reason = (raw.reason ?? null) as SubscriptionChangeReason | null;
    // Gating alanı yoksa bu event'ten DURUM ÇIKARILAMAZ: `normalizeStatus` boş
    // gövdeyi de `isPremium:false`'a çeviriyor, yani sözleşme dışı bir payload'ı
    // uygulamak premium'u sebepsiz kapatırdı. `/sync`'teki `statusReceived`
    // korumasının aynısı.
    const hasGatingField =
      typeof raw.isActivelyPremium === "boolean" ||
      typeof raw.isPremium === "boolean";
    if (!hasGatingField) {
      iapLog("hub-abonelik-geçersiz", {
        reason,
        alanlar: Object.keys(raw).join(",") || "-",
      });
      return { applied: false as const };
    }

    const status = normalizeStatus(raw);
    // Release'de de yazılıyor: "premium bir anda gitti" şikâyetinde cihazdan
    // çıkacak tek somut delil, hangi `reason` ile kapandığı.
    iapLog("hub-abonelik", {
      reason,
      isPremium: status.isPremium,
      status: status.status,
      ürün: status.productId,
      bitiş: status.expiresAt,
      at: raw.at ?? null,
    });
    // `store_expired` bu daldan geliyor: event'in kendisi "backend gördü ve
    // bitti" demek. Kaydı BURADA da kapatmazsak kullanıcı, biten aboneliğinin
    // hemen ardından "aktivasyon sürüyor" kartıyla karşılaşırdı.
    const settled = status.isPremium
      ? false
      : settlePendingPurchase(getState(), status, "hub");
    dispatch(subscriptionChanged({ ...status, reason, settled }));
    if (status.isPremium) resolvePendingRecord(getState(), "hub");
    return { applied: true as const, isPremium: status.isPremium, reason };
  },
);

// Backend `/sync` semantiği: önce local DB, aktif premium yoksa RevenueCat
// REST v1 fallback + persist. `synced:false` iken bile `isSuccess:true` döner
// → sadece `synced`e bak.
//
// BACKOFF ARALIĞI `reason`A GÖRE DEĞİŞİR — tek bir merdiven doğru değil, çünkü
// üç `reason`ın yalnız BİRİ cache'leniyor (backend teyidi 2026-08-18):
//
//   NOT_FOUND_IN_RC      → 10 sn negative cache. Bu pencerede tekrar çağırmak
//                          RC'ye HİÇ GİTMEZ, cache'ten aynı cevabı döndürür.
//                          Aralık ≥ 10 sn olmak ZORUNDA, yoksa deneme sayılır
//                          ama hiçbir şey sorgulanmaz (60/dk limiti de boşa).
//   RC_REST_ERROR        → cache YOK, daha sık denemek serbest.
//   RC_REST_UNAVAILABLE  → cache YOK. Backend'de RC anahtarı yapılandırılmamış
//                          demek; RC'ye hiç sorulmadı, yani kullanıcının
//                          aboneliği hakkında HÜKÜM DEĞİL — "abonelik yok" diye
//                          yorumlamayın, görülürse backend'e bildirin.
//
// TARİHÇE: 18 Ağustos dokümanı cache notunu içermiyordu ve `[0, 1500, 3000,
// 5000, 8000]` öneriyordu; o merdivende 2-4. denemeler cache penceresine
// düşüyordu. Backend "not dokümandan düştü, davranış duruyor" diye teyit etti ve
// aşağıdaki aralıkları verdi. Erken `break` BİLEREK yok: geç inen webhook'ta
// dört deneme boyunca beklemek doğru davranış.
//
// 19 AĞUSTOS: pencere artık cevabın parçası (`retryAfterSeconds`), yani 11 sn
// bizde sabit DEĞİL. Alan geldiyse merdiven ondan türüyor; backend TTL'i
// düşürdüğünde biz de hızlanıyoruz ve burada iş çıkmıyor. Aşağıdaki merdivenler
// alanı GÖNDERMEYEN sürümler için duruyor — silinemezler.
const CACHED_BACKOFF_MS = [11_000, 11_000, 12_000];
const UNCACHED_BACKOFF_MS = [2_000, 4_000, 6_000];
const MAX_SYNC_ATTEMPTS = CACHED_BACKOFF_MS.length + 1;

/**
 * Cache penceresinin bittiği ANDA değil, bir saniye SONRA deniyoruz. Backend
 * kalan süreyi tam saniyeye yuvarlıyor (taban 1) ve ağ gecikmesi bu farkı iki
 * yöne de esnetebiliyor; tam sınırda atılan istek pencerenin son milisaniyesine
 * çarparsa deneme sayılır ama RC'ye hiç gitmez.
 */
const CACHE_EXIT_MARGIN_MS = 1_000;

/**
 * `retryAfterSeconds` için üst sınır. Bozuk/absürt bir değer (saat cinsinden bir
 * TTL, negatif, `"10"` gibi string) turu dakikalarca askıda bırakabilirdi.
 */
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Cevaptaki `retryAfterSeconds` → ms. Alan YOKSA `null` döner; `0` ile `null`
 * aynı şey DEĞİL:
 *   0    → alan var, "bu `reason` cache'lenmiyor, beklemene gerek yok"
 *   null → eski sürüm, pencereyi bilmiyoruz → kendi merdivenimize düşeceğiz
 */
const retryAfterMsOf = (raw: unknown): number | null => {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.min(raw * 1000, MAX_RETRY_AFTER_MS);
};

/**
 * Bir sonraki denemeden önceki bekleme.
 *
 * Alan geldiyse pencere sunucudan geliyor, kendi merdivenimiz yalnız "üst üste
 * binme" tabanı olarak kalıyor (backend'in önerdiği `max(retryAfter, backoff)`).
 * Alan gelmediyse 18 Ağustos politikası aynen: `reason` bilinmiyorsa cache'li
 * merdiven — yanılırsak kaybımız birkaç saniye, tersi yanılgıda deneme tamamen
 * boşa gider.
 */
const syncDelayFor = (
  reason: SyncReason | null,
  attempt: number,
  retryAfterMs: number | null,
): number => {
  const step = Math.min(attempt - 2, CACHED_BACKOFF_MS.length - 1);
  if (retryAfterMs === null) {
    const ladder =
      reason === "RC_REST_ERROR" || reason === "RC_REST_UNAVAILABLE"
        ? UNCACHED_BACKOFF_MS
        : CACHED_BACKOFF_MS;
    return ladder[step];
  }
  return Math.max(retryAfterMs + CACHE_EXIT_MARGIN_MS, UNCACHED_BACKOFF_MS[step]);
};

interface SyncThunkResult extends SubscriptionStatusSnapshot {
  synced: boolean;
  reason: SyncReason | null;
  source: SyncSource | null;
  attempts: number;
  /** Denemeler bittikten SONRA kalıcı "ödedi ama görünmüyor" kaydı duruyor mu. */
  pending: boolean;
  /**
   * Backend gerçekten bir `status` objesi döndü mü.
   *
   * `synced:false` dalında downgrade uygulanabilmesi için ŞART: `normalizeStatus(null)`
   * da `isPremium:false` üretiyor, yani gövdesi boş bir yanıt ile "RC artık
   * entitlement görmüyor" cevabı ayırt edilemezdi ve ilkini downgrade sanıp
   * premium'u kapatırdık.
   */
  statusReceived: boolean;
  /**
   * Backend beklediğimiz satın almayı görmüş ve abonelik bitmiş mi
   * (bkz. `settlePendingPurchase`). `pending`/grace korumalarını DELER: ikisi de
   * "backend henüz görmedi" varsayımına dayanıyor, bu alan o varsayımı
   * yanlışlıyor.
   */
  settled: boolean;
}

export const syncSubscriptionWithRetry = createAsyncThunk<
  SyncThunkResult,
  { maxAttempts?: number } | void
>(
  "subscription/syncWithRetry",
  async (arg, { getState, dispatch, rejectWithValue }) => {
    const uid = userKeyOf(getState());
    const maxAttempts =
      (arg as { maxAttempts?: number } | undefined)?.maxAttempts ??
      MAX_SYNC_ATTEMPTS;
    let lastStatus: any = null;
    let lastReason: SyncReason | null = null;
    let lastSource: SyncSource | null = null;
    // Backend'in bildirdiği cache penceresi. Her turda YENİDEN okunuyor: cache
    // hit'te backend TAM TTL'i değil KALAN süreyi dönüyor, yani bu değer tur
    // ilerledikçe küçülüyor. Sakladığımız ilk değeri yeniden kullansaydık her
    // denemede pencereyi baştan başlatmış olurduk.
    let lastRetryAfterMs: number | null = null;
    // GERÇEKTEN atılan istek sayısı — teşhis satırında tavanı yazmak yanıltıcı
    // olurdu (tur `synced` gelince erken dönüyor, ağ hatasında reject ediyor).
    let usedAttempts = 0;
    // Kayıt tur içinde kapandıysa turun SONUNDAKİ dönüş de bunu taşımalı;
    // `settlePendingPurchase`i orada yeniden çağırmak (kayıt çoktan silindiği
    // için `false` dönerdi) ikinci bir log satırı yazıp kararı geri alırdı.
    let lastSettled = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      usedAttempts = attempt;
      if (attempt > 1) {
        // Bekleme, ÖNCEKİ turun cevabına göre: pencereyi backend bildiriyorsa
        // ondan, bildirmiyorsa `reason`ın merdiveninden.
        await new Promise((r) =>
          setTimeout(r, syncDelayFor(lastReason, attempt, lastRetryAfterMs)),
        );
      }
      try {
        const res = await api.post(API_ENDPOINTS.SUBSCRIPTION_SYNC) as any;
        const result = res.result ?? {};
        lastStatus = result.status;
        lastReason = result.reason ?? null;
        lastSource = result.source ?? null;
        lastRetryAfterMs = retryAfterMsOf(result.retryAfterSeconds);

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
          // `-` = alan gelmedi (eski backend) → merdivene düştük. Sahadaki
          // "4 kez denedik ama hep aynı cevap" raporunda ayırt edici.
          retryAfter: lastRetryAfterMs === null ? "-" : lastRetryAfterMs / 1000,
          isActivelyPremium: result.status?.isActivelyPremium ?? null,
          ürün: result.status?.productId ?? null,
        });
        // Doküman §3: "`sync` yanıtındaki `status`'u HER ZAMAN state'e yazın,
        // 'sadece true ise güncelle' yapmayın" — turun sonunu beklemiyoruz.
        // Aynı korumalardan geçiyor (bkz. applySyncOutcome): downgrade
        // uygulanır, parası alınmış ama backend'e ulaşmamış satın alma korunur.
        const snapshot = normalizeStatus(result.status);
        // Kaydı ÖNCE kapat, `pending`i SONRA oku: ikisi aynı kayda bakıyor ve
        // ters sırada, az önce dayanaksız kaldığını tespit ettiğimiz kayıt
        // yüzünden kart bir tur daha ayakta kalırdı.
        if (!synced) {
          lastSettled = settlePendingPurchase(getState(), snapshot, "sync");
        }
        dispatch(
          syncStatusReceived({
            ...snapshot,
            synced,
            reason: lastReason,
            source: lastSource,
            attempts: attempt,
            pending: hasWitnessedPurchase(uid),
            statusReceived: result.status != null,
            settled: lastSettled,
          }),
        );

        if (synced) {
          resolvePendingRecord(getState(), "sync");
          return {
            ...snapshot,
            synced: true,
            reason: lastReason,
            source: lastSource,
            attempts: attempt,
            pending: false,
            statusReceived: result.status != null,
            settled: false,
          };
        }

        // ERKEN BREAK YOK. Doküman §3 karar tablosu üç `reason` için de
        // "retry'a devam" diyor:
        //   NOT_FOUND_IN_RC     → tükenirse §4 (pending ekranı)
        //   RC_REST_ERROR       → geçici
        //   RC_REST_UNAVAILABLE → backend config eksiği; kullanıcı hakkında
        //                         hüküm DEĞİL, tükenirse §4 + backend'e bildir
        // Kalıcı kayıt her hâlükârda duruyor: tur boşa çıksa bile cold start /
        // foreground kurtarması yeniden deniyor.
      } catch (e: any) {
        // Ağ/HTTP hatası eskiden TAMAMEN sessizdi: `/sync` 401 (token) ya da
        // 429 (60/dk limit) dönüyorsa dışarıdan "webhook inmedi"den ayırt
        // edilemiyordu — ikisi tamamen farklı düzeltme gerektiriyor.
        // Hata turunda pencere bilinmiyor: 429/401'de gövde yok, elimizdeki
        // değer bir ÖNCEKİ turdan kalma ve o pencere çoktan kaymış olabilir.
        // `null`'a çekip `reason` merdivenine düşüyoruz — temkinli taraf.
        lastRetryAfterMs = null;
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
      // Kartı ayakta tutan şeyin ne olduğu log'dan okunamıyordu: aynı üç satır
      // hem "kurtarma kaydı var" hem "kayıt yok, kart da yok" durumunda
      // yazılıyor ve fark yalnız state'te görünüyordu.
      bekleyenKayıt: hasWitnessedPurchase(uid),
      kapandı: lastSettled,
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
      pending: hasWitnessedPurchase(uid),
      statusReceived: lastStatus != null,
      settled: lastSettled,
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
    markPendingPremiumSync(uid, { productId, source: "purchase" });
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
    return { pending: hasWitnessedPurchase(uid) };
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
/**
 * Kurtarma kaydını "bu satın alma yok" diye kapatmadan önce beklenen en az
 * süre. Webhook normalde saniyeler içinde iniyor; bu pencere RC entitlement'ı
 * yayılmadan verilecek erken kararı engelliyor.
 */
const PENDING_RESOLUTION_MIN_AGE_MS = 10 * 60 * 1000;

export const reconcileIfMismatched = createAsyncThunk(
  "subscription/reconcileIfMismatched",
  async (_, { getState, dispatch, rejectWithValue }) => {
    const snapshot = await getRevenueCatSnapshot();
    // RC konfigüre değil / customerInfo alınamadı → yapılacak bir şey yok.
    if (!snapshot) return { skipped: true as const };

    const backendPremium = selectIsPremium(getState());
    if (snapshot.isPremium === backendPremium) {
      // Uyuşma da bilgi: RC ve backend'in İKİSİ de "premium değil" diyorsa
      // reconcile hiç istek atmaz ve raporda hiçbir iz kalmazdı — "reconcile
      // çalıştı mı" sorusu cevapsız kalıyordu.
      iapLog("reconcile-atlandı", { rc: snapshot.isPremium, backend: backendPremium });
      // İKİSİ DE "premium yok" diyorken elde hâlâ kurtarma kaydı varsa,
      // aktivasyonunu beklediğimiz bir satın alma YOK demektir: RC bu hesapta
      // hak görmüyor, dolayısıyla backend'in `/sync`te RC REST'e sorup
      // bulabileceği bir şey de yok. Kaydı burada kapatmazsak 7 günlük yaş
      // sınırına kadar her açılışta boş `/sync` turu atılır ve kullanıcıya
      // "aktivasyon sürüyor" kartı gösterilir — sahada tam olarak bu oldu:
      // hiç premium'u olmayan kullanıcı "Yenile" butonlu kartla karşılaştı.
      //
      // Yaş eşiği ŞART: satın almanın hemen ardından RC entitlement'ı henüz
      // yayılmamış olabiliyor ve iki taraf da "yok" derken kayıt tam da o
      // yüzden duruyor. O pencerede silmek, kurtarma mekanizmasını satın alma
      // anında kendi eliyle bozmak olurdu.
      if (!backendPremium && !snapshot.isPremium) {
        const uid = userKeyOf(getState());
        const pending = readPendingPremiumSync(uid);
        if (pending && Date.now() - pending.at > PENDING_RESOLUTION_MIN_AGE_MS) {
          iapLog("bekleyen-kayıt-düşürüldü", {
            neden: "rc-de-hak-yok",
            ürün: pending.productId,
            yaşDk: Math.round((Date.now() - pending.at) / 60000),
            denemeler: pending.attempts,
          });
          clearPendingPremiumSync(uid);
          analytics.capture("premium_sync_abandoned", {
            productId: pending.productId,
            attempts: pending.attempts,
            waitedMs: Date.now() - pending.at,
          });
          dispatch(clearSyncPending());
        }
      }
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
      markPendingPremiumSync(uid, {
        productId: snapshot.productId,
        source: "reconcile",
      });
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
        pending: hasWitnessedPurchase(uid),
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
  // Buraya gelen her yol (status / hub / sync / reconcile) backend'in kanonik
  // cevabıdır: bundan sonra "premium mi" sorusunun tek muhatabı bu slice.
  state.statusResolvedAt = Date.now();
  state.writeSeq += 1;
};

/**
 * `/sync` yanıtının state'e uygulanması. Retry turunun HER adımı (doküman §3:
 * "status'u her zaman yazın") ve turun sonundaki `fulfilled` aynı buradan
 * geçiyor — iki yol ayrışırsa tur içindeki yazımla son yazım çelişirdi.
 *
 * `synced:false` İKİ TAMAMEN FARKLI durumu aynı gövdeyle anlatıyor ve `reason`
 * ikisini ayırt ETMİYOR (ikisi de `NOT_FOUND_IN_RC`):
 *
 *   (a) Satın alma alındı, webhook henüz inmedi → premium'u kapatmak,
 *       kullanıcının parasını aldıktan sonra hakkını geri almak demek.
 *   (b) Abonelik iptal/iade edildi, backend RC revalidasyonunda downgrade etti
 *       (§0.3: `sync` premium'u KAPATABİLİR) → burada kapatmak ŞART.
 *
 * Ayıran tek sinyal koruma penceresi: kalıcı "ödedi ama görünmüyor" kaydı
 * (satın alma/restore anında yazılıyor) ya da optimistic grace. Pencere
 * içindeysek (a), değilsek backend canonical → (b).
 */
const applySyncOutcome = (state: SubscriptionState, o: SyncThunkResult) => {
  if (o.synced) {
    state.syncPending = false;
    applyStatus(state, o);
    return;
  }
  // `settled` iki korumayı da deler — ikisi de "backend satın almayı henüz
  // görmedi" varsayımına dayanıyor, `settled` tam olarak onu yanlışlıyor:
  // backend gördü, abonelik bitti. Delmezsek (a) kart, çözebileceği bir şey
  // olmayan bir "Yenile" butonuyla ayakta kalır, (b) grace penceresi boyunca
  // gerçekten bitmiş abonelik premium görünmeye devam eder.
  if (!o.settled && (o.pending === true || isWithinOptimisticGrace(state))) {
    state.syncPending = true;
    return;
  }
  // Backend status objesi döndürmediyse elimizde downgrade'i doğrulayan bir şey
  // yok — mevcut değeri koru.
  if (!o.statusReceived) {
    state.syncPending = state.isPremium;
    return;
  }
  if (o.settled) state.optimisticPremiumAt = null;
  applyStatus(state, o);
  state.syncPending = false;
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
  lastChangeReason: null,
  lastEventAt: null,
  statusRequestAt: null,
  statusResolvedAt: null,
  writeSeq: 0,
  statusRequestSeq: null,
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
      // Satın alma anındaki optimistic `true` de bağlayıcıdır — UI bunun
      // üstüne profil bayrağıyla ikinci bir fikir aramamalı.
      if (action.payload.isPremium) state.statusResolvedAt = Date.now();
      // Yerel de olsa bir yazım: uçuşta bekleyen `/status` cevabı artık bayat
      // (satın alma/oturum değişimi ondan sonra oldu).
      state.writeSeq += 1;
      if (!action.payload.isPremium) {
        state.status = null;
        state.productId = null;
        state.isTrial = false;
        state.trialEndsAt = null;
        state.gracePeriodEndsAt = null;
        state.cancelledAt = null;
        state.syncPending = false;
        state.lastSyncReason = null;
        // Logout/user switch de bu daldan geçiyor: bir sonraki hesap önceki
        // kullanıcının hub gerekçesini ve event damgasını devralmasın (damga
        // devralınırsa yeni hesabın ilk `/status` cevabı "bayat" sayılabilirdi).
        state.lastChangeReason = null;
        state.lastEventAt = null;
        state.statusRequestAt = null;
        // Bu dal kullanıcı değişimi/logout: yeni hesap hakkında HİÇBİR ŞEY
        // bilmiyoruz. `false` değil "bilinmiyor"a dönüyoruz, yoksa yeni
        // kullanıcı ilk `/status`ı gelene kadar kesin free sayılırdı.
        state.statusResolvedAt = null;
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
    // Retry turunun ARA adımları. Thunk döngüsünden her yanıtta dispatch
    // ediliyor; turun sonunu beklemeden state güncel kalıyor (doküman §3).
    syncStatusReceived: (state, action: PayloadAction<SyncThunkResult>) => {
      state.lastSyncReason = action.payload.reason;
      applySyncOutcome(state, action.payload);
    },
    /**
     * Hub `SubscriptionChanged`. Kaynak `/status` ile aynı projeksiyon olduğu
     * için kural da aynı: backend canonical, tek istisna satın alma penceresi.
     *
     * `admin_revoke` o pencereyi de deler. Gerekçe: pencerenin varlık sebebi
     * "webhook henüz inmedi" yarışı, admin iptalinde böyle bir yarış yok — hak
     * açıkça geri alındı. Üstelik kullanıcıya "aboneliğin sonlandırıldı" toast'ı
     * gösterip premium UI'ı 10 dakika daha açık bırakmak olurdu.
     */
    subscriptionChanged: (
      state,
      action: PayloadAction<
        SubscriptionStatusSnapshot & {
          reason: SubscriptionChangeReason | null;
          settled?: boolean;
        }
      >,
    ) => {
      const { reason, settled, ...status } = action.payload;
      state.lastChangeReason = reason;
      // Uçuştaki `/status` bu event'ten ÖNCE yola çıktıysa cevabı bayat kalır.
      // Sayaç event UYGULANMASA BİLE artıyor: bir sonraki adımda premium'u aynı
      // yönde ezecek bayat cevap yine engellenmeli.
      state.lastEventAt = Date.now();
      state.writeSeq += 1;
      if (
        !status.isPremium &&
        reason !== "admin_revoke" &&
        !settled &&
        isWithinOptimisticGrace(state)
      ) {
        return;
      }
      if (!status.isPremium) state.optimisticPremiumAt = null;
      applyStatus(state, status);
      // Backend premium'u onayladı → "aktivasyon sürüyor" kartı kapansın.
      // Downgrade'de karta DOKUNMUYORUZ (`/status` ile aynı davranış): kalıcı
      // "ödedi ama görünmüyor" kaydı varsa kurtarma turu onu sürdürmeli —
      // TEK istisna `settled`, çünkü orada sürdürülecek bir kayıt kalmıyor.
      if (status.isPremium || settled) state.syncPending = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSubscriptionStatus.pending, (state) => {
        state.loading = true;
        state.statusRequestAt = Date.now();
        state.statusRequestSeq = state.writeSeq;
      })
      .addCase(fetchSubscriptionStatus.fulfilled, (state, action) => {
        state.loading = false;
        if (!action.payload) return;
        // İSTEK YOLA ÇIKTIKTAN SONRA yazılmış her kanonik değer, uçuştaki bu
        // cevaptan tazedir → cevap bayat, uygulamak o yazımı geri alır.
        //
        // Kaynak fark etmez, iki somut yol:
        //   • hub event'i — admin premium'u iptal eder, event 50 ms sonra düşer,
        //     saniyenin başında atılmış `/status` "premium: true" ile gelip
        //     iptali siler. (`lastEventAt`, uygulanmayan event'lerde de damgalanır;
        //     bu yüzden `statusResolvedAt`e ek olarak duruyor.)
        //   • `/sync` — RESTORE SEMPTOMUNUN SEBEBİ. Restore aynı anda hem
        //     `syncThenRefetch`i hem RC `customerInfo` dinleyicisinin
        //     `/status`'unu tetikliyor. `sync` premium'u ONAYLAYINCA optimistic
        //     grace penceresi kapanıyor ve arkadan inen bayat `false` hiçbir
        //     korumaya takılmadan premium'u siliyordu: kullanıcı premium'u anlık
        //     görüp saniyeler içinde free'ye düşüyordu.
        if (
          state.statusRequestSeq != null &&
          state.writeSeq !== state.statusRequestSeq
        ) {
          return;
        }
        // Satın alma penceresi içindeki `false` = "backend webhook'u henüz
        // görmedi", downgrade değil. Bkz. OPTIMISTIC_PREMIUM_GRACE_MS.
        // `settled` bunun istisnası: backend satın almayı görmüş ve abonelik
        // bitmiş, yani beklenecek bir webhook yok (bkz. settlePendingPurchase).
        const settled = (action.payload as any).settled === true;
        if (!action.payload.isPremium && !settled && isWithinOptimisticGrace(state)) {
          return;
        }
        if (settled) state.optimisticPremiumAt = null;
        applyStatus(state, action.payload);
        // Backend premium'u onayladı → "aktivasyon sürüyor" kartı kapansın.
        if (action.payload.isPremium || settled) state.syncPending = false;
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
        // Turun son adımı — ara adımlarla aynı kurallardan geçiyor (bkz.
        // applySyncOutcome). Tekrar uygulanması idempotent.
        applySyncOutcome(state, payload);
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
        // RC "ödendi" derken backend hâlâ göremiyorsa kurtarma turu koşmaya
        // devam eder (kayıt yukarıda yazıldı) ama KART yalnız gördüğümüz bir
        // satın alma varsa çıkar — `payload.pending` artık provenance'lı
        // (bkz. pendingPremiumSync `hasWitnessedPurchase`).
        //
        // `|| payload.rcPremium === true` BİLEREK KALDIRILDI: RC snapshot'ı tek
        // başına bir ödemenin kanıtı değil, cache'lenmiş bir görüş. Sahada tam
        // olarak bunu ödedi: hiç satın alma yapmamış kullanıcıya "aktivasyon
        // sürüyor" + "Yenile" kartı çıkıyor, tema değişiminde bile geri
        // geliyordu (AppNavigator remount'ta kaydı diskten yeniden okuyor).
        state.syncPending = payload.pending === true;
      })
      .addCase(resolvePendingPremiumSync.fulfilled, (state, action) => {
        state.syncPending = action.payload?.pending === true;
      });
  },
});

export const {
  setPremium,
  clearSyncPending,
  hydrateSyncPending,
  syncStatusReceived,
  subscriptionChanged,
} = subscriptionSlice.actions;

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
  // `parseBackendDate`: damga offset'siz gelmiş olabilir (bkz. normalizeStatus).
  // Ham `new Date()` UTC+3'te aktif aboneliği 3 saat geçmiş okuyup premium'u
  // kapatıyordu. Ayrıştırılamayan değerde bayrağa güveniyoruz — bozuk bir
  // tarih yüzünden hakkı geri almak, en kötü yönde yanılmak olurdu.
  const expiry = parseBackendDate(sub.expiresAt);
  if (!expiry) return true;
  return expiry.getTime() > Date.now();
};

/**
 * Backend premium hakkında EN AZ BİR KEZ konuştu mu (`/status`, hub event'i,
 * `/sync` ya da satın almadaki optimistic yazım). `selectIsPremium`in `false`'ı
 * bununla birlikte okunur: "hayır" mı, "henüz bilmiyoruz" mu.
 */
export const selectPremiumResolved = (state: any): boolean =>
  state?.subscription?.statusResolvedAt != null;

export const selectSubscription = (state: any): SubscriptionState => state?.subscription;
export const selectSyncPending = (state: any): boolean =>
  !!state?.subscription?.syncPending;

export default subscriptionSlice.reducer;
