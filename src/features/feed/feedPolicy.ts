import { PAYWALL_TYPES } from "@/shared/constants/responseCodes";
import { parseUtc } from "@/shared/utils/dateUtc";
import type {
  FeedAuthorCategory,
  FeedMeDto,
  FeedPostDto,
  FeedPostStatus,
} from "./feedTypes";

/**
 * Akış kararları — saf, React yok, unit test edilebilir.
 *
 * Bu dosyanın tek kuralı: **istemci sunucunun verdiği kararı yeniden
 * hesaplamaz**, yalnız görünüme eşler. Rehber §0 bunu açıkça yazıyor
 * ("Buton/kilit kararlarını kendiniz hesaplamayın"), çünkü:
 *  - `reply.state` anonim gönderide kimlik koruması için eşleşmiş kullanıcıya
 *    bile `Ok` dönüyor — istemci "eşleştik mi?" diye bakarsa kimliği sızdırır;
 *  - tercih/kampüs/kısıt kuralları sunucuda yaşıyor ve değişiyor.
 */

// `replyActionFor` ve `ReplyAction` KALDIRILDI (iki modlu yapı): yanıt butonu
// üründen çıktı, yedi durumlu tablo da onunla birlikte. Sunucu `post.reply`
// alanını göndermeye devam ediyor (eski istemciler için) ve bu sürüm onu
// SESSİZCE YOK SAYIYOR.

/**
 * Gönderinin nasıl çizileceği. Yalnız "Gönderilerim" için anlamlı — akışta
 * sunucu zaten sadece `Published` döndürüyor.
 *
 * `expired`, `status`tan DEĞİL `expiresAt`ten türüyor: backend süresi dolmuş
 * gönderiyi `Published` olarak döndürmeye devam ediyor (sözleşme §6.4) ve
 * sadece akıştan düşürüyor.
 */
export type PostPresentation =
  | "normal"
  | "expired"
  | "pending"
  | "support"
  | "hidden"
  | "removed";

export function postPresentation(
  post: Pick<FeedPostDto, "status" | "expiresAt">,
  now: number = Date.now(),
): PostPresentation {
  switch (post.status as FeedPostStatus) {
    case "PendingReview":
      return "pending";
    case "SupportHold":
      return "support";
    case "HiddenByReports":
      return "hidden";
    case "Rejected":
    case "RemovedByAdmin":
      return "removed";
    case "Published":
    default: {
      const ts = parseUtc(post.expiresAt).getTime();
      // Geçersiz tarihte "normal" — sunucu damgası okunamadı diye kullanıcının
      // gönderisini "süresi doldu" diye işaretlemek, yanlış tarafa hata yapmak.
      if (Number.isFinite(ts) && ts <= now) return "expired";
      return "normal";
    }
  }
}

/**
 * FAB / composer kapısı.
 *
 * ⚠️ `me` yoksa `unknown` — kilit ÇİZİLMEZ. `usePremiumTier().resolved`
 * kuralının aynısı: "bilinmiyor" ile "hakkı yok" aynı şey değil ve kısa
 * yükleme penceresinde kilit göstermek kullanıcıya olmayan bir kısıt uydurur.
 */
export type ComposeGate =
  | { kind: "unknown" }
  | { kind: "open" }
  | { kind: "quotaExhausted"; nextResetAt: string | null }
  | { kind: "restricted"; until: string | null; isPermanent: boolean };

export function composeGate(me: FeedMeDto | undefined | null): ComposeGate {
  if (!me) return { kind: "unknown" };
  // Kısıt kotadan ÖNCE: kısıtlı kullanıcıya "hakkın yarın yenilenir" demek
  // yanlış bir söz olurdu, yenilenince de paylaşamayacak.
  if (me.isPermanentlyRestricted) {
    return { kind: "restricted", until: null, isPermanent: true };
  }
  if (me.restrictedUntil) {
    return {
      kind: "restricted",
      until: me.restrictedUntil,
      isPermanent: false,
    };
  }
  if ((me.quota?.postsRemaining ?? 0) <= 0) {
    return {
      kind: "quotaExhausted",
      nextResetAt: me.quota?.nextResetAt ?? null,
    };
  }
  return { kind: "open" };
}

// `replyGate` KALDIRILDI: tek çağıranı yanıt composer'ının kota kapısıydı.

/** Composer'daki anonim anahtarı. */
export type AnonymousGate =
  | { kind: "unknown" }
  | { kind: "allowed" }
  | { kind: "paywall"; paywallType: typeof PAYWALL_TYPES.FEED_ANONYMOUS }
  | { kind: "restricted" };

/**
 * ⚠️ `canPostAnonymously` OTORİTE, `anonymousLockReason` yalnız SEBEP.
 * `usePremiumTier()`'e bakılmaz: kadın kullanıcı free olduğu halde anonim
 * paylaşabiliyor, yani premium durumu bu kapının cevabı değil.
 */
export function anonymousGate(me: FeedMeDto | undefined | null): AnonymousGate {
  if (!me) return { kind: "unknown" };
  if (me.canPostAnonymously) return { kind: "allowed" };
  if (me.anonymousLockReason === "restricted") return { kind: "restricted" };
  if (me.anonymousLockReason === "requiresPlus") {
    return { kind: "paywall", paywallType: PAYWALL_TYPES.FEED_ANONYMOUS };
  }
  // Hak yok ama sebep de yok: sunucu yeni bir sebep ekledi. Güvenli taraf
  // paywall DEĞİL "restricted" — olmayan bir satın alma teklif etmemek için.
  return { kind: "restricted" };
}

export type FilterGate = "unknown" | "allowed" | "paywall";

export function universityPickerGate(me?: FeedMeDto | null): FilterGate {
  if (!me) return "unknown";
  return me.canPickUniversity ? "allowed" : "paywall";
}

export function kindFilterGate(me?: FeedMeDto | null): FilterGate {
  if (!me) return "unknown";
  return me.canUseKindFilter ? "allowed" : "paywall";
}

/**
 * Anonim gönderinin başlık etiketi anahtarı: "Anonim · Kadın".
 * `authorCategory` null ise sadece "Anonim".
 */
export function anonymousLabelKey(
  category: FeedAuthorCategory | null | undefined,
): string {
  switch (category) {
    case "Men":
    case "Women":
    case "NonBinary":
      return `feed.anonymous.${category}`;
    default:
      return "feed.anonymous.plain";
  }
}

/**
 * Id'ye göre tekilleştirme — İLK görülen kazanır.
 *
 * ⚠️ sort=popular|top sayfalar arasında aynı gönderiyi tekrar döndürebiliyor
 * (skor kayıyor; backend bunu bilinçli kabul ediyor, sözleşme §6.1).
 * SONRADAN geleni tercih etmek satırı listede yukarı zıplatır ve
 * `itemLayoutAnimation` bu zıplamayı animasyonlayarak glitch gibi gösterir.
 */
export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
