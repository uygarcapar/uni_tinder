import { parseUtc } from "@/shared/utils/dateUtc";

/**
 * Akış metin sınırları ve zaman metinleri — saf, React yok.
 *
 * ⚠️ `noteTarget.ts`'teki noteLength/clampNoteText ile BİLEREK aynı kod. Ortak
 * bir `shared/utils/textLength.ts`'e çıkarmak düşünüldü ve vazgeçildi: iki
 * yaprak saf modülü birbirine bağlamanın tek kazancı 4 satır tasarrufu, bedeli
 * ise notların karakter sayımını değiştirmenin akışı da sessizce etkilemesi.
 */

/**
 * Gönderi / yanıt karakter tavanları.
 *
 * İKİ İŞ birden: `/api/feed/me` gelmediğindeki varsayılan VE sunucu daha büyük
 * bir sayı gönderse bile aşılmayan istemci tavanı (bkz. resolve*MaxLength).
 * Sözleşme §0: gönderi 400, yanıt 150.
 *
 * ⚠️ Tavanı AŞAĞI çekmek güvenli (kullanıcı erken kesilir, 400 üretmez).
 * YUKARI çıkarmak sunucuyla BİRLİKTE yapılmalı.
 */
export const FEED_POST_MAX_LENGTH = 400;
export const FEED_REPLY_MAX_LENGTH = 150;

/** Sayaç bu eşikten sonra uyarı rengine geçer (kalan karakter). */
export const FEED_COUNTER_WARN_REMAINING = 40;

/**
 * Metnin UZUNLUĞU — **code point** cinsinden, `str.length` DEĞİL.
 *
 * Sunucu rune sayıyor (sözleşme §0: "emoji 1 karakter sayılır — [...text].length").
 * JS'in `.length`i UTF-16 birimi sayar: astral bir emoji (😀) orada 2, sunucuda 1.
 * İki taraf farklı saydığında sayaç ya kullanıcıyı erken keser ya da sunucunun
 * saymadığı bir taşma gösterir.
 */
export const feedTextLength = (text: string): number => [...text].length;

/**
 * Metni code point sınırına kırp — TextInput'un UTF-16 `maxLength`i YERİNE.
 * `maxLength` surrogate pair'i ortadan bölüp bozuk karakter bırakabiliyor.
 */
export const clampFeedText = (text: string, limit: number): string =>
  feedTextLength(text) <= limit ? text : [...text].slice(0, limit).join("");

const resolveLimit = (
  serverValue: number | null | undefined,
  ceiling: number,
): number =>
  typeof serverValue === "number" && serverValue > 0
    ? Math.min(serverValue, ceiling)
    : ceiling;

/** Sunucu tavanı + istemci tavanı → yürürlükteki sınır. Kazanan KÜÇÜK olan. */
export const resolveFeedPostMaxLength = (serverValue?: number | null): number =>
  resolveLimit(serverValue, FEED_POST_MAX_LENGTH);

export const resolveFeedReplyMaxLength = (serverValue?: number | null): number =>
  resolveLimit(serverValue, FEED_REPLY_MAX_LENGTH);

type Translate = (key: string, options?: Record<string, unknown>) => string;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "3 gün sonra siliniyor" — gönderinin kalan ömrü.
 *
 * ⚠️ `formatRelativeTime` kullanılamaz: o GEÇMİŞ içindir ("2 saat önce"), bu
 * ileri yön. Geçmiş bir `expiresAt` → "süresi doldu" anahtarı.
 *
 * `now` parametre olarak alınıyor; `Date.now()` çağırmıyor ki test saat
 * enjekte edebilsin (deckProgress.ts'in gün damgası testlerindeki aynı gerekçe).
 */
export function formatExpiresIn(
  iso: string | null | undefined,
  t: Translate,
  now: number = Date.now(),
): string | null {
  const ts = parseUtc(iso).getTime();
  if (!Number.isFinite(ts)) return null;

  const remaining = ts - now;
  if (remaining <= 0) return t("feed.mine.expired");

  if (remaining >= DAY_MS) {
    return t("feed.mine.expiresInDays", {
      count: Math.floor(remaining / DAY_MS),
    });
  }
  if (remaining >= HOUR_MS) {
    return t("feed.mine.expiresInHours", {
      count: Math.floor(remaining / HOUR_MS),
    });
  }
  return t("feed.mine.expiresInMinutes", {
    count: Math.max(1, Math.floor(remaining / MINUTE_MS)),
  });
}

/**
 * "Hakların 20:30'da yenilenir" — kota sıfırlanma metni.
 *
 * ⚠️ `nextResetAt` null ise null döner; "20:30" SABİT YAZILMAZ. Sunucu saati
 * İstanbul'a göre hesaplıyor, istemcinin cihaz saat dilimi başka olabilir ve
 * uydurulmuş bir saat yanlış bekleme yaratır.
 */
export function formatQuotaReset(
  iso: string | null | undefined,
  t: Translate,
): string | null {
  const date = parseUtc(iso);
  if (!Number.isFinite(date.getTime())) return null;
  // Cihaz saat dilimine çevrilmiş saat:dakika (sözleşme §1.2: "gösterirken
  // cihaz saatine çevirin"). 24 saatlik, formatRelativeTime'daki gibi tr-TR.
  const time = date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return t("feed.quota.reset", { time });
}
