import { parseUtc } from "@/shared/utils/dateUtc";

/**
 * "Ne kadar kaldı" metni — 24 saatlik anlar için.
 *
 * `feedText.formatExpiresIn`in kardeşi, kopyası değil: akışta gönderi 15 GÜN
 * yaşıyor ve metin "3 gün sonra siliniyor" gibi bir cümle; burada ömür 24 saat
 * ve metin kartın köşesine sığan bir ROZET ("18 sa", "41 dk"). Aynı fonksiyona
 * iki biçim sığdırmak çağıranın bilmediği bir bayrak eklemek olurdu.
 *
 * ⚠️ `now` PARAMETRE, `Date.now()` içeride okunmuyor: liste dakikada bir TEK
 * yerden tazeleniyor (kart başına zamanlayıcı yok) ve test de saati enjekte
 * edebiliyor.
 *
 * Çözülemeyen tarihte `null` — rozet hiç çizilmiyor. Uydurma bir süre yazmak,
 * hiç yazmamaktan kötü.
 */
export function campusCountdownText(
  expiresAt: string | null | undefined,
  nowMs: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const end = parseUtc(expiresAt)?.getTime();
  if (!end || Number.isNaN(end)) return null;

  const remainingMs = end - nowMs;
  if (remainingMs <= 0) return null;

  const minutes = Math.floor(remainingMs / 60_000);
  if (minutes < 1) return t("campus.expiresSoon");

  const hours = Math.floor(minutes / 60);
  // 1 saatin altında DAKİKA: "0 sa" demek kalan süreyi yok sayardı.
  if (hours < 1) return t("campus.expiresInMinutes", { count: minutes });
  return t("campus.expiresInHours", { count: hours });
}

/**
 * ⚠️ `momentLifeRemaining` KALDIRILDI (2026-10-30): kalan ömrü 0–1 arası bir
 * ORAN olarak veriyordu ve tek müşterisi kartın görsel göstergesiydi (önce
 * köşedeki halka, sonra kartın kenarını saran renkli şerit). İkisi de
 * kaldırıldı; kalan süre yine METİN olarak yazılıyor (yukarıdaki üreteç),
 * yani orana ihtiyaç kalmadı. Geri gerekirse payda SABİT 24 SAAT DEĞİL
 * `expiresAt - createdAt` olmalı: kuralı sunucu uyguluyor ve iki alan
 * ayrışabiliyor.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════
 * "3 SAAT ÖNCE" — paylaşımın üstünden GEÇEN süre (istek).
 * ══════════════════════════════════════════════════════════════════════════
 * Kartın altındaki etiket kalan süreyi söylüyordu ("18 sa"); istek üzerine
 * geçen süreye döndü. İkisi aynı bilgiyi iki yönden söylüyor ama okunuşları
 * farklı: "18 sa" bir SAYAÇ (yüzey bir geri sayım gibi okunuyor), "3 saat
 * önce" bir ZAMAN DAMGASI — akıştaki ve sohbetteki satırlarla aynı dil.
 *
 * ⚠️ GÜN DALI YOK ve olmamalı: an 24 saat yaşıyor, "1 gün önce" ancak süresi
 * dolmuş bir anda çıkardı ve o kart zaten listede değil.
 *
 * ⚠️ `formatRelativeTime` KULLANILMIYOR: o bugünü SAAT olarak yazıyor
 * ("14:32", Mesajlar reçetesi) — bu yüzeyde istenen "ne kadar önce"ydi.
 *
 * ⚠️ GELECEK BİR DAMGA (cihaz saati geri) `postedJustNow`a düşüyor: negatif
 * bir "önce" yazmaktansa "az önce" demek doğru taraf.
 */
export function campusPostedAgoText(
  createdAt: string | null | undefined,
  nowMs: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  const start = parseUtc(createdAt)?.getTime();
  if (!start || Number.isNaN(start)) return null;

  const minutes = Math.floor((nowMs - start) / 60_000);
  if (minutes < 1) return t("campus.postedJustNow");
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return t("campus.postedAgoMinutes", { count: minutes });
  return t("campus.postedAgoHours", { count: hours });
}

/** An hâlâ yayında mı — liste süzmesi ve kart çizimi aynı kuralı kullanıyor. */
export function isMomentLive(
  expiresAt: string | null | undefined,
  nowMs: number,
): boolean {
  const end = parseUtc(expiresAt)?.getTime();
  // Tarih çözülemiyorsa YAYINDA sayılıyor: sunucu zaten süresi dolanı
  // döndürmüyor, bozuk bir tarih yüzünden sağlam bir anı gizlemek daha kötü.
  if (!end || Number.isNaN(end)) return true;
  return end > nowMs;
}
