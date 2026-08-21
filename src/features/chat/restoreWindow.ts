import { utcTime } from "@/shared/utils/dateUtc";

/**
 * Unmatch sonrası "geri al" penceresi.
 *
 * Pencerenin uzunluğu BACKEND KONFİGÜRASYONUNDA (Rematch section) — istemci
 * "24 saat" varsaymaz, tek doğru kaynak unmatch yanıtındaki `restorableUntil`
 * damgasıdır. `null` gelirse geri alma YOKTUR: rematch limiti dolmuş, çift
 * engellenmiş ya da hiç mesajlaşılmamıştır — bu durumda restore çağrısı her
 * hâlükârda reddedilir, buton GÖSTERİLMEZ.
 */

/**
 * "Geri al" sunulsun mu? ÜÇ durum var, ikisini karıştırmak bug üretiyor:
 *   • damga `undefined` → BİLİNMİYOR. Sohbet listesi DTO'su bu alanı taşımıyor
 *     olabilir (pencere yalnız unmatch YANITINDA kesin) — cold start'ta canlı bir
 *     geri alma penceresini gizlememek için buton GÖSTERİLİR; çağrı reddedilirse
 *     kullanıcıya "süre dolmuş olabilir" denir.
 *   • damga `null` → pencere KESİN yok (limit dolmuş / engellenmiş / karşı taraf
 *     unmatch etti) → gösterilmez.
 *   • damga dolu → yalnız gelecekteyse gösterilir.
 */
export function shouldOfferRestore(restorableUntil?: string | null, now: number = Date.now()): boolean {
  if (restorableUntil === undefined) return true;
  if (restorableUntil === null) return false;
  return canRestore(restorableUntil, now);
}

/** Pencere hâlâ açık mı? null/geçersiz/geçmiş damga → false. */
export function canRestore(restorableUntil?: string | null, now: number = Date.now()): boolean {
  if (!restorableUntil) return false;
  const ts = utcTime(restorableUntil);
  return Number.isFinite(ts) && ts > now;
}

/**
 * Kalan süreyi okunur metne çevirir ("23 saat" / "45 dakika"). Pencere kapalıysa
 * null döner — çağıran taraf "kalıcı kapandı" metnine düşer.
 *
 * Saat sayısı AŞAĞI yuvarlanır: "24 saatin var" deyip 23:59'da kapanan bir
 * pencere vaat etmemek için. 1 saatin altında dakikaya iner.
 */
export function formatRestoreWindow(
  restorableUntil: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
  now: number = Date.now(),
): string | null {
  if (!canRestore(restorableUntil, now)) return null;
  const remainingMs = utcTime(restorableUntil!) - now;
  const hours = Math.floor(remainingMs / 3_600_000);
  if (hours >= 1) return t("chat.unmatch.windowHours", { h: hours });
  const minutes = Math.max(1, Math.floor(remainingMs / 60_000));
  return t("chat.unmatch.windowMinutes", { m: minutes });
}
