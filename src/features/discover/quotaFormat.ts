import { UNLIMITED } from "@/shared/constants/limits";
import { parseBackendDate } from "@/shared/utils/backendDate";

/**
 * Bu ufkun ötesindeki `nextXResetAt` gerçek bir tarih değil, backend'in
 * "asla resetlenmez" sentinel'idir (`9999-12-31`). 10 yıl, gerçek bir kota
 * döngüsünün yanında fazlasıyla güvenli bir eşik: döngü 2026-08-22'den beri
 * tier'a bağlı ve en uzunu 365 gün (yıllık abonelik).
 */
const SENTINEL_HORIZON_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Swipe/SuperLike kotalarının "ne zaman yenilenir" metinleri. DiscoverScreen'in
 * limit toast'ı ile ProfileScreen'deki kalan hak kartı aynı sözleşmeyi
 * kullansın diye ortak modülde.
 */

/**
 * Kalan hak sıfırlanana kadar geçecek süreyi okunur metne çevirir.
 *
 * UNLIMITED (-1) = "asla resetlenmez" (free kullanıcının lifetime SuperLike
 * hakkı bitti) — geri sayım GÖSTERİLMEZ, null döner ve çağıran taraf kendi
 * mesajına düşer. `sec <= 0` dalı bunu "şu anda yenilenebilir" sanıyordu.
 *
 * 24 saatten uzun geri sayımlar GÜN olarak yazılır: premium'un döngüsü (tier'a
 * göre 7/30/365 gün) "170 sa 12 dk" gibi okunamayan bir sayı üretiyordu. Gün
 * sayısı yukarı yuvarlanır — 25 saate "1 gün" demek olduğundan erken bir vaat
 * olur.
 */
export const formatResetTime = (
  sec: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null => {
  if (sec === UNLIMITED) return null;
  if (!sec || sec <= 0) return t("discover.swipe.resetNow");
  if (sec > 24 * 3600) {
    return t("discover.swipe.resetDays", { d: Math.ceil(sec / (24 * 3600)) });
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t("discover.swipe.resetHoursMinutes", { h, m });
  if (m > 0) return t("discover.swipe.resetMinutes", { m });
  return t("discover.swipe.resetSeconds", { sec });
};

/**
 * Süreyi ÇIPLAK yazar ("3 gün" / "2 sa 5 dk" / "30d") — kendi başına bir cümle
 * değil, `{{time}}` alan bir mesajın içine gömülmek için.
 *
 * formatResetTime'ın döndürdüğü metin zaten bitmiş bir cümle ("Resets in 30d" /
 * "30 gün sonra yenilenir"); onu "{{time}} sonra yenilenir" kalıbına gömünce
 * fiil iki kez yazılıyordu ("Renews in Resets in 30d").
 *
 * null = gösterilecek geri sayım yok: UNLIMITED sentinel'i ("asla
 * resetlenmez"), süre bilinmiyor ya da çoktan dolmuş. Son iki durumda ne
 * yazılacağına çağıran taraf karar verir.
 */
export const formatResetDuration = (
  sec: number | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null => {
  if (sec === UNLIMITED) return null;
  if (!sec || sec <= 0) return null;
  if (sec > 24 * 3600) {
    return t("discover.swipe.durationDays", { d: Math.ceil(sec / (24 * 3600)) });
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t("discover.swipe.durationHoursMinutes", { h, m });
  if (m > 0) return t("discover.swipe.durationMinutes", { m });
  return t("discover.swipe.durationSeconds", { sec });
};

/**
 * Geri sayımı ŞU ANA göre çözer.
 *
 * `*ResetInSeconds` fetch anına göre hesaplanmış bir sayı; stats query'si
 * `staleTime: Infinity` ile tek sefer çekildiği için saatler önce alınmış
 * olabilir (o zaman "3 sa sonra yenilenir" yazısı olduğu yerde donar). Bu
 * yüzden:
 *   1. Mutlak `nextXResetAt` varsa doğrudan ondan hesaplanır,
 *   2. yoksa saniye değeri, verinin cache'e yazıldığı ana (`fetchedAt`,
 *      react-query `dataUpdatedAt`) demirlenip aradan geçen süre düşülür.
 *
 * UNLIMITED (-1) sentinel'i olduğu gibi geçer — formatResetTime ayırt ediyor.
 */
export function resolveResetSeconds({
  absoluteAt,
  seconds,
  fetchedAt,
  now,
}: {
  absoluteAt?: string | null;
  seconds?: number | null;
  fetchedAt?: number | null;
  now: number;
}): number | null {
  if (seconds === UNLIMITED) return UNLIMITED;
  if (absoluteAt) {
    // Damga `parseBackendDate` üzerinden: backend 2026-08-22'den beri her
    // tarihi `Z` ile yolluyor, yardımcı da offset varsa dokunmuyor — yani
    // burada no-op. Ham `new Date` yerine tutulmasının sebebi, geri sayımın
    // sessiz 3 saatlik kaymaya en pahalı açık olan yer olması.
    const ts = parseBackendDate(absoluteAt)?.getTime() ?? NaN;
    // Backend "asla resetlenmez" durumunda `nextXResetAt`i sentinel bir tarihle
    // dolduruyor (`9999-12-31T23:59:59Z`). Normalde yanında `seconds: -1` de
    // geldiği için yukarıdaki dal yakalıyor; alan hiç gelmezse buradan sızıp
    // ekrana "70 milyon saat sonra" yazardı. Sentinel'i UNLIMITED'a çeviriyoruz.
    if (!Number.isNaN(ts)) {
      if (ts - now > SENTINEL_HORIZON_MS) return UNLIMITED;
      return Math.max(0, Math.round((ts - now) / 1000));
    }
  }
  if (seconds == null) return null;
  if (!fetchedAt) return seconds;
  const elapsed = Math.max(0, Math.round((now - fetchedAt) / 1000));
  return Math.max(0, seconds - elapsed);
}
