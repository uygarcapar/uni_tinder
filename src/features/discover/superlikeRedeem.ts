import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { appPrefs } from "@/shared/utils/appPrefs";
import { queryClient } from "@/shared/queries/queryClient";
import { swipeKeys } from "@/features/discover/swipeKeys";
import { getRecentSuperlikeTransactions } from "@/features/profile/subscriptionService";
import { analytics } from "@/shared/services/analytics";
import {
  REDEEM_CODES,
  isPermanentRedeemCode,
  resolveCode,
} from "@/shared/constants/responseCodes";
import { iapLog } from "@/features/profile/purchaseDiagnostics";

/**
 * SuperLike paketi (consumable) → kredi dönüşümü.
 *
 * Consumable satın alma entitlement üretmediği için bakiye YALNIZCA backend'in
 * `POST /api/swipe/SuperLike/Redeem` çağrısıyla yazılıyor. Bu çağrı RevenueCat
 * webhook'u ile YARIŞIYOR: webhook backend'e inmeden redeem edersek gerçek bir
 * HTTP 402 alıyoruz ("birkaç saniye sonra tekrar dene").
 *
 * Buradaki tek sözleşme şu: **parası alınmış bir satın alma asla düşmez.**
 * 402/404/5xx/ağ hatası kalıcı sayılmaz — transaction MMKV kuyruğuna yazılır ve
 * bir sonraki açılışta tekrar denenir. Endpoint `transactionId` bazında
 * idempotent olduğu için kaç kez denenirse denensin kredi bir kez eklenir.
 */

const RETRY_DELAY_MS = 3000;
/** Kuyruk boyutu — kalıcı biriken bir kayıt açılışları yavaşlatmasın. */
const MAX_QUEUE = 20;
/**
 * Bir kaydın kuyrukta kalabileceği SÜRE — deneme sayısı değil.
 *
 * Önceki politika 8 denemeydi ve "bu satın alma bu hesaba ait değil" durumu da
 * 402 ile geldiği içindi. Backend o durumu artık 400 + `UT-6103` ile ayırıyor
 * (yukarıdaki `permanent` dalı), yani sayaç artık gerçek bir kalıcı hatayı
 * yakalamıyor; yalnızca 402'nin sebebi backend tarafı bir arıza olduğunda
 * (webhook inmiyor) parası alınmış satın almaları 8 AÇILIŞTA çöpe atıyordu —
 * kullanıcı uygulamayı sık açtığı için bu birkaç dakika bile sürebiliyor.
 *
 * Süre tabanlı sınır `pendingPremiumSync`teki ile aynı gerekçe ve aynı pencere:
 * webhook saatler içinde iner; bir hafta inmediyse sorun retry ile çözülmez.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Redeem edilmiş/kapanmış transaction id'leri — RC geçmişinden tekrar üretilmesin. */
const MAX_HANDLED = 50;

const queueKey = (userId: string) => `superlikePendingRedeems:${userId}`;
const handledKey = (userId: string) => `superlikeHandledTx:${userId}`;

/**
 * Kuyruk anahtarı hesap bazlı: A hesabının bekleyen redeem'i B oturumundayken
 * denenmemeli (backend zaten reddeder, ama gereksiz istek + kafa karıştıran
 * toast üretir). Backend bazı yanıtlarda `userId`, bazılarında `id` döndüğü
 * için (AppNavigator'daki çözümün aynısı) tek yerden çözülüyor — iki çağıranın
 * farklı anahtar üretmesi kuyruğu görünmez kılardı.
 */
export function redeemUserKey(user: any): string | null {
  const uid = user?.userId ?? user?.id;
  return uid ? String(uid) : null;
}

export interface SuperlikeRedeemResult {
  creditsAdded: number;
  purchasedSuperLikes: number | null;
  superLikesRemaining: number | null;
  alreadyRedeemed: boolean;
}

export interface PendingRedeem {
  transactionId: string;
  productId: string | null;
  attempts: number;
  /**
   * Kuyruğa ilk girdiği an (epoch ms). Yaş sınırı bunun üzerinden işliyor.
   * Eski sürümden kalan kayıtlarda YOK — okunduğu ilk turda damgalanır, yani
   * o kayıtlar tam pencereyi baştan alır (parası alınmış satın almayı sürüm
   * geçişi yüzünden düşürmemek için bilinçli).
   */
  firstSeenAt?: number;
}

/**
 * Hata sınıfı `Error` alt sınıfı DEĞİL: Hermes/babel karışımında `instanceof`
 * transpile edilmiş sınıflarda güvenilmez. Çağıranlar `isPendingRedeemError`
 * ile ayırt ediyor.
 */
type TaggedError = Error & { redeemCode?: "PENDING_WEBHOOK" | "PERMANENT" };

function taggedError(
  message: string,
  code: "PENDING_WEBHOOK" | "PERMANENT",
): TaggedError {
  const err = new Error(message) as TaggedError;
  err.redeemCode = code;
  return err;
}

/** 402/ağ hatası sonrası kuyruğa alındı — kullanıcıya "birazdan yansıyacak" denir. */
export function isPendingRedeemError(e: any): boolean {
  return e?.redeemCode === "PENDING_WEBHOOK";
}

// ─── MMKV kuyruğu ────────────────────────────────────────────────────────────

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = appPrefs.getString(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readPendingRedeems(userId: string): PendingRedeem[] {
  return readJsonArray<PendingRedeem>(queueKey(userId));
}

function writeQueue(userId: string, list: PendingRedeem[]) {
  appPrefs.set(queueKey(userId), JSON.stringify(list.slice(-MAX_QUEUE)));
}

function enqueue(
  userId: string,
  entry: Omit<PendingRedeem, "attempts" | "firstSeenAt">,
) {
  const list = readPendingRedeems(userId);
  if (list.some((p) => p.transactionId === entry.transactionId)) return;
  writeQueue(userId, [
    ...list,
    { ...entry, attempts: 0, firstSeenAt: Date.now() },
  ]);
}

function dequeue(userId: string, transactionId: string) {
  const list = readPendingRedeems(userId);
  const next = list.filter((p) => p.transactionId !== transactionId);
  if (next.length !== list.length) writeQueue(userId, next);
}

function isHandled(userId: string, transactionId: string): boolean {
  return readJsonArray<string>(handledKey(userId)).includes(transactionId);
}

function markHandled(userId: string, transactionId: string) {
  const list = readJsonArray<string>(handledKey(userId));
  if (list.includes(transactionId)) return;
  appPrefs.set(
    handledKey(userId),
    JSON.stringify([...list, transactionId].slice(-MAX_HANDLED)),
  );
}

// ─── Tek redeem çağrısı ──────────────────────────────────────────────────────

/**
 * Bakiye üç yerden (Stats / SuperLike / Redeem) aynı semantikle geliyor:
 * `superLikesRemaining` = tier kotası + satın alınan kredi, tabanı 0. Yani
 * cache'i doğrudan yanıttan besleyebiliyoruz, ayrıca fetch şart değil.
 */
function patchStatsBalance(result: SuperlikeRedeemResult) {
  let patched = false;
  queryClient.setQueryData(swipeKeys.stats, (prev: any) => {
    if (!prev) return prev;
    const next = { ...prev };
    if (typeof result.superLikesRemaining === "number") {
      next.superLikesRemaining = result.superLikesRemaining;
      patched = true;
    }
    if (typeof result.purchasedSuperLikes === "number") {
      next.purchasedSuperLikes = result.purchasedSuperLikes;
      patched = true;
    }
    return next;
  });
  // Yanıt bakiyeyi taşımadıysa (backend alanları göndermiyor ya da gövde
  // beklenen zarfta değil) patch no-op kalır. Stats `staleTime: Infinity` +
  // `refetchOnMount: false` ile kendiliğinden HİÇ tazelenmediği için sayı
  // oturum boyunca eski kalırdı: kredi backend'de var, ekranda yok.
  // `type: "all"` — ekran o an mount değilse bile cache doğru kalsın.
  if (!patched) {
    queryClient
      .refetchQueries({ queryKey: swipeKeys.stats, type: "all" })
      .catch(() => {});
  }
}

function normalizeResult(node: any): SuperlikeRedeemResult {
  return {
    creditsAdded: typeof node?.creditsAdded === "number" ? node.creditsAdded : 0,
    purchasedSuperLikes:
      typeof node?.purchasedSuperLikes === "number"
        ? node.purchasedSuperLikes
        : null,
    superLikesRemaining:
      typeof node?.superLikesRemaining === "number"
        ? node.superLikesRemaining
        : null,
    alreadyRedeemed: node?.alreadyRedeemed === true,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Attempt =
  | { kind: "ok"; result: SuperlikeRedeemResult }
  | { kind: "retry"; message: string | null }
  | { kind: "permanent"; code?: string | null; message: string | null };

async function attemptRedeem(
  transactionId: string,
  productId: string | null,
): Promise<Attempt> {
  try {
    // api instance'ı interceptor'da `response.data` döndürüyor → elimizdeki
    // nesne HTTP zarfı değil, backend gövdesi. Status'e yalnızca hata dalında
    // (axios error) bakılabiliyor.
    const res: any = await api.post(API_ENDPOINTS.SWIPE_SUPER_LIKE_REDEEM, {
      transactionId,
      productId,
    });
    if (res?.isSuccess === false) {
      // Sözleşmede yok (402 gerçek HTTP status olarak geliyor). Yine de
      // kalıcı saymıyoruz: parası alınmış bir satın almayı belirsiz bir
      // gövde yüzünden düşürmek, kredi kaybı demek.
      iapLog("redeem-200-isSuccess-false", {
        tx: transactionId,
        productId,
        code: res?.code ?? null,
        mesaj: res?.message ?? null,
      });
      return { kind: "retry", message: res?.message ?? null };
    }
    const result = normalizeResult(res?.result);
    if (result.creditsAdded === 0 && result.superLikesRemaining == null) {
      // 200 geldi ama gövdede ne kredi ne bakiye var. İki ayrı dünya bu:
      // gerçekten idempotent tekrar (kredi zaten yazılmış) VEYA gövde beklenen
      // `{ isSuccess, result }` zarfında değil (kredi hiç yazılmamış olabilir).
      // Kullanıcıya ikisinde de "bakiyen güncel" diyoruz; cihaz logunda ham
      // gövde olmadan ayırt etmek imkânsızdı.
      iapLog("redeem-200-boş-gövde", {
        tx: transactionId,
        productId,
        ham: JSON.stringify(res)?.slice(0, 300) ?? null,
      });
    } else {
      iapLog("redeem-ok", {
        tx: transactionId,
        productId,
        eklenen: result.creditsAdded,
        bakiye: result.superLikesRemaining,
        satınAlınan: result.purchasedSuperLikes,
        zatenİşlenmiş: result.alreadyRedeemed,
      });
    }
    return { kind: "ok", result };
  } catch (e: any) {
    const status = e?.response?.status;
    const message = e?.response?.data?.message ?? null;
    const code = e?.response?.data?.code ?? null;
    // api.ts interceptor'ı yalnız 5xx/timeout/ağ hatasını logluyor; 402 ve 404
    // sessizce geçiyordu ve cihazda "neden kredi gelmedi" sorusunun cevabı
    // görünmüyordu. 402 = webhook inmedi, 404 = endpoint deploy edilmedi.
    // `transactionId` de yazılıyor: 402'de backend'e verilebilecek tek somut
    // delil bu — onsuz sunucu logunda hangi satın almanın aranacağı belli değil.
    iapLog("redeem-hata", {
      http: status ?? null,
      code: code ?? null,
      tx: transactionId,
      productId,
      mesaj: message ?? e?.message ?? null,
      anlam:
        code === REDEEM_CODES.PENDING_WEBHOOK || status === 402
          ? "webhook backend'e inmedi (sandbox filtresi ya da webhook config)"
          : status === 404
            ? "endpoint deploy edilmemiş"
            : status === 400
              ? "kalıcı: ürün tanımsız ya da transaction başka hesapta"
              : "geçici sayıldı, kuyrukta kalıyor",
    });
    // Karar ÖNCE `code`'dan (backend sözleşmesi): UT-6102 ürün tanımsız,
    // UT-6103 transaction başka hesaba ait — ikisi de retry ile çözülmez.
    // UT-6101 webhook yarışıdır, kuyrukta kalır.
    if (isPermanentRedeemCode(code)) return { kind: "permanent", code, message };
    if (code === REDEEM_CODES.PENDING_WEBHOOK) return { kind: "retry", message };
    // `code` yoksa (eski backend sürümü) status'a düş. 400 = transactionId boş
    // ya da tanınmayan ürün → retry çözmez.
    if (status === 400) return { kind: "permanent", code, message };
    // 402 (webhook inmedi), 404 (endpoint henüz deploy edilmedi), 401, 5xx,
    // timeout, ağ yok — hepsi zamanla düzelebilir → kuyrukta kalsın.
    return { kind: "retry", message };
  }
}

/**
 * Satın alma sonrası çağrılır: 402 gelirse 3 sn bekleyip BİR kez daha dener,
 * yine olmazsa transaction'ı kuyruğa alıp `PENDING_WEBHOOK` fırlatır.
 */
export async function redeemSuperlikePack({
  userId,
  transactionId,
  productId,
}: {
  userId: string;
  transactionId: string;
  productId: string | null;
}): Promise<SuperlikeRedeemResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await attemptRedeem(transactionId, productId);

    if (outcome.kind === "ok") {
      markHandled(userId, transactionId);
      dequeue(userId, transactionId);
      patchStatsBalance(outcome.result);
      analytics.capture("superlike_redeem_succeeded", {
        productId,
        creditsAdded: outcome.result.creditsAdded,
        alreadyRedeemed: outcome.result.alreadyRedeemed,
      });
      return outcome.result;
    }

    if (outcome.kind === "permanent") {
      markHandled(userId, transactionId);
      dequeue(userId, transactionId);
      analytics.capture("superlike_redeem_failed", {
        productId,
        transactionId,
        code: outcome.code ?? null,
        message: outcome.message,
      });
      // Metin önce `code`'dan (UT-6102 "paket tanımlı değil" / UT-6103 "bu
      // satın alma bu hesaba ait değil"), backend message'ı yalnız fallback.
      const entry = resolveCode(outcome.code);
      throw taggedError(
        entry?.title ?? outcome.message ?? "Satın alma işlenemedi.",
        "PERMANENT",
      );
    }

    if (attempt === 0) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    // İkinci 402: kuyruğa al, açılışta tekrar denenecek.
    enqueue(userId, { transactionId, productId });
    iapLog("redeem-kuyruğa-alındı", { tx: transactionId, productId });
    analytics.capture("superlike_redeem_queued", { productId, transactionId });
    throw taggedError(
      outcome.message ?? "Satın alma henüz doğrulanmadı.",
      "PENDING_WEBHOOK",
    );
  }
  // Erişilmez — döngü her dalda return/throw ediyor.
  throw taggedError("Satın alma henüz doğrulanmadı.", "PENDING_WEBHOOK");
}

// ─── Açılışta kurtarma ───────────────────────────────────────────────────────

/**
 * Uygulama satın alma ile kuyruğa yazma arasında öldürülürse kayıt yalnızca
 * RC'nin cihazdaki geçmişinde kalır. Oradaki taze superlike transaction'larını
 * kuyruğa taşı — daha önce sonuçlandırılmış (`handled`) olanlar hariç.
 */
async function syncStoreTransactionsIntoQueue(userId: string) {
  const txs = await getRecentSuperlikeTransactions().catch(() => []);
  if (txs.length) {
    // Cihazdaki HER satın alma, transaction id'si ve durumuyla. `handled`
    // görünen ama krediye dönmemiş bir kayıt = elle telafi gereken satın alma;
    // id'si olmadan backend sunucu logunda hangisini arayacağını bilemiyor.
    const queued = new Set(readPendingRedeems(userId).map((p) => p.transactionId));
    iapLog("sl-cihaz-durumu", {
      kayıtlar: txs.map(
        (tx) =>
          `${tx.productId}#${tx.transactionId}:${
            queued.has(tx.transactionId)
              ? "kuyrukta"
              : isHandled(userId, tx.transactionId)
                ? "kapatılmış"
                : "yeni"
          }`,
      ),
    });
  }
  for (const tx of txs) {
    if (isHandled(userId, tx.transactionId)) continue;
    enqueue(userId, {
      transactionId: tx.transactionId,
      productId: tx.productId,
    });
  }
}

/**
 * Açılışta kuyruğu boşalt. Her kayıt için TEK deneme yapılır (satın alma
 * anındaki 3 sn'lik retry burada yok — kullanıcı bekleyen bir akışta değil).
 * Başarılıysa bakiye cache'i güncellenir.
 */
export async function flushPendingSuperlikeRedeems(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const uid = String(userId);

  await syncStoreTransactionsIntoQueue(uid);

  const queue = readPendingRedeems(uid);
  if (queue.length === 0) return;
  // Kuyruğun İÇERİĞİ de yazılıyor: aynı transaction'ın açılış açılış aynı
  // hatayı alması ("attempts" büyüyor, tx sabit) ile her açılışta yeni
  // transaction eklenmesi tamamen farklı iki arıza.
  iapLog("redeem-kuyruk-boşaltılıyor", {
    adet: queue.length,
    kayıtlar: queue.map((q) => `${q.productId}#${q.transactionId}@${q.attempts ?? 0}`),
  });

  for (const entry of queue) {
    const outcome = await attemptRedeem(entry.transactionId, entry.productId);

    if (outcome.kind === "ok") {
      markHandled(uid, entry.transactionId);
      dequeue(uid, entry.transactionId);
      patchStatsBalance(outcome.result);
      analytics.capture("superlike_redeem_recovered", {
        productId: entry.productId,
        creditsAdded: outcome.result.creditsAdded,
      });
      continue;
    }

    if (outcome.kind === "permanent") {
      markHandled(uid, entry.transactionId);
      dequeue(uid, entry.transactionId);
      analytics.capture("superlike_redeem_failed", {
        productId: entry.productId,
        transactionId: entry.transactionId,
        code: outcome.code ?? null,
        message: outcome.message,
      });
      continue;
    }

    const attempts = (entry.attempts ?? 0) + 1;
    // Damgası olmayan (eski sürümden kalma) kayıt bu turda damgalanır; yaş
    // guard'ı ondan sonra işlemeye başlar.
    const firstSeenAt = entry.firstSeenAt ?? Date.now();
    const ageMs = Date.now() - firstSeenAt;
    if (ageMs >= MAX_AGE_MS) {
      // Bir haftadır webhook inmedi — retry ile çözülmüyor. Kuyrukta süresiz
      // tutmak her açılışa istek ekler; düşürüp iz bırakıyoruz.
      markHandled(uid, entry.transactionId);
      dequeue(uid, entry.transactionId);
      // Para alınmış, kredi hiç yazılamamış ve artık denemiyoruz — elle telafi
      // gerektiren tek durum. Raporda mutlaka görünmeli.
      iapLog("redeem-terk-edildi", {
        tx: entry.transactionId,
        productId: entry.productId,
        denemeler: attempts,
        yaşGün: Math.round(ageMs / 86_400_000),
      });
      analytics.capture("superlike_redeem_abandoned", {
        productId: entry.productId,
        transactionId: entry.transactionId,
        attempts,
        ageMs,
      });
      continue;
    }
    writeQueue(
      uid,
      readPendingRedeems(uid).map((p) =>
        p.transactionId === entry.transactionId
          ? { ...p, attempts, firstSeenAt }
          : p,
      ),
    );
  }
}
