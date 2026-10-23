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
