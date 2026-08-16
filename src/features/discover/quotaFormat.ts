import { UNLIMITED } from "@/shared/constants/limits";

/**
 * Bu ufkun ötesindeki `nextXResetAt` gerçek bir tarih değil, backend'in
 * "asla resetlenmez" sentinel'idir. 10 yıl, gerçek bir kota döngüsünün
 * (en uzunu 7 gün) yanında fazlasıyla güvenli bir eşik.
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
 * 24 saatten uzun geri sayımlar GÜN olarak yazılır: premium'un 7 günlük
 * döngüsü "170 sa 12 dk" gibi okunamayan bir sayı üretiyordu. Gün sayısı
 * yukarı yuvarlanır — 25 saate "1 gün" demek olduğundan erken bir vaat olur.
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
    const ts = new Date(absoluteAt).getTime();
    // Backend "asla resetlenmez" durumunda `nextXResetAt`i sentinel bir tarihle
    // dolduruyor (`9999-12-31T23:59:59`). Normalde yanında `seconds: -1` de
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
