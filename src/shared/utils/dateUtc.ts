/**
 * UTC timestamp normalizasyonu.
 *
 * Backend tüm zaman damgalarını `DateTime.UtcNow`'dan üretiyor, ancak
 * System.Text.Json bunları `Z` soneki OLMADAN serialize edebiliyor
 * ("2026-08-14T21:03:45.123"). ECMAScript spec'ine göre offset taşımayan bir
 * date-time YEREL saat sayılır → TR'de (UTC+03) her damga 3 saat geriye kayar:
 *
 *   • "3 saat önce" / yanlış saat etiketleri (00:03 → 21:03)
 *   • gün ayracının "Bugün" yerine "Dün" demesi (gece yarısı sonrası mesajlar)
 *   • 15 dk'lık düzenleme penceresinin daha ilk anda dolmuş görünmesi
 *   • optimistic mesaj (yerel `toISOString()` → Z'li, doğru) ile server kopyasının
 *     farklı günlere düşüp aynı listede iki ayrı ayraç grubu üretmesi
 *
 * (Backend kontratı: frontend_chat_full_flow.md §8.3)
 *
 * Tüm yardımcılar IDEMPOTENT'tir: Z/offset taşıyan string'e dokunmazlar.
 *
 * DURUM (2026-08-22): backend `Z` eklemeye BAŞLADI (tüm `DateTime` alanları),
 * yani bu katman artık no-op — öngörüldüğü gibi sessizce devre dışı kaldı.
 * Silmedik: sözleşme dışı/eski damgalara karşı ucuz bir emniyet. Koşulsuz hâle
 * getirmek (her string'e `Z` eklemek) kaymayı ters yöne çevirir — yapma.
 * Kardeşi: shared/utils/backendDate.ts (aynı iş, abonelik/kota tarafı).
 */

const HAS_OFFSET = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

/**
 * Offset'siz ISO string'e `Z` ekler. Salt tarih ("2026-08-14") ve zaten
 * offset'li değerler olduğu gibi döner; string olmayan/boş girdi de aynen geçer.
 */
export function toUtcIso<T extends string | null | undefined>(value: T): T {
  if (typeof value !== 'string' || value.length === 0) return value;
  // "T" yoksa salt tarihtir — Z eklemek negatif offset'li saat dilimlerinde
  // günü bir geri kaydırırdı.
  if (!value.includes('T')) return value;
  return (HAS_OFFSET.test(value) ? value : `${value}Z`) as T;
}

/** Server ISO string'ini UTC olarak parse eder. Geçersiz girdide Invalid Date. */
export function parseUtc(value?: string | null): Date {
  const normalized = toUtcIso(value);
  return new Date(normalized == null || normalized === '' ? NaN : normalized);
}

/** `parseUtc(x).getTime()` kısayolu — geçersizde NaN. */
export function utcTime(value?: string | null): number {
  return parseUtc(value).getTime();
}

/**
 * Chat DTO'larındaki zaman alanları. Değer kümesi bilinçli olarak dar tutuldu:
 * salt-tarih alanları (ör. birthDate) buraya GİRMEMELİ — onlara Z eklemek
 * negatif offset'li saat dilimlerinde günü kaydırır.
 */
const TIMESTAMP_KEYS = new Set([
  'sentAt',
  'readAt',
  'deliveredAt',
  'editedAt',
  'deletedAt',
  'reactedAt',
  'lastMessageAt',
  'lastReadSentAt',
  'lastSeen',
  'connectedAt',
  'matchedAt',
  'likedAt',
  'createdAt',
  'restorableUntil',
  'revealedAt',
  'expiresAt',
]);

/**
 * Payload içindeki bilinen zaman alanlarını UTC'ye normalize eder (REST result'ı
 * veya hub event argümanı). Hiçbir alan değişmediyse GİRDİ REFERANSI korunur —
 * chatSlice'ın reconcile merge'i ve LegendList referans eşitliği buna dayanıyor.
 */
export function normalizeUtcFields<T>(input: T, depth = 4): T {
  if (input == null || typeof input !== 'object' || depth < 0) return input;

  if (Array.isArray(input)) {
    let changed = false;
    const out = input.map((item) => {
      const next = normalizeUtcFields(item, depth - 1);
      if (next !== item) changed = true;
      return next;
    });
    return (changed ? out : input) as T;
  }

  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    let next: unknown = value;
    if (typeof value === 'string') {
      if (TIMESTAMP_KEYS.has(key)) next = toUtcIso(value);
    } else if (value && typeof value === 'object') {
      next = normalizeUtcFields(value, depth - 1);
    }
    if (next !== value) changed = true;
    out[key] = next;
  }
  return (changed ? (out as T) : input);
}

export default parseUtc;
