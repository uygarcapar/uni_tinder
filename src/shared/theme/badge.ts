import { colors, isLight } from "./colors";

/**
 * Bir olayın YUVARLAK İŞARETİ — dolgu ve üstündeki glif rengi.
 *
 * TEK KAYNAK: aynı olay uygulamada iki ayrı yerde daire içinde çiziliyor —
 * Bildirimler listesindeki tip rozeti (fotoğrafın sağ altındaki küçük disk) ve
 * toast'ın solundaki simge. İkisi farklı renk taşıdığında aynı olay iki ayrı
 * şeymiş gibi okunuyordu (aynı Fire bildirimi listede kırmızı, toast'ta
 * siyahtı). Kanonik olan Bildirimler ekranı; toast onu takip ediyor.
 *
 * Kural iki kova:
 *   • nötr  → `badgeNeutralFill()` — renk taşımayan olaylar (beğeni, not,
 *             kaçırılan eşleşme, kota uyarıları — mesaj hakkı dahil)
 *   • Fire  → `colors.errorStrong`
 *
 * Bildirimler'deki Message rozetinin yeşili (`colors.success`) burada DEĞİL,
 * orada yerel: tek kullanıcısı o liste. Toast'taki mesaj simgesi gelen mesajı
 * değil mesaj hakkını anlatıyor ve nötr kovada (bkz. toastIcons.tsx).
 *
 * Glif HER ZAMAN `BADGE_FG` beyazı: `colors.text` açık modda koyuya dönüp
 * renkli/siyah diskin üstünde kayboluyordu.
 *
 * ⚠️ Değerler render anında okunmalı (palet tema değişiminde mutasyona uğruyor,
 * bkz. colors.ts) — bu yüzden nötr dolgu sabit değil FONKSİYON.
 */

/** Diskin üstündeki işaret — iki temada da beyaz. */
export const BADGE_FG = "#FFFFFF";

/**
 * Renk taşımayan diskin dolgusu.
 *
 * Açık modda tam siyah. Koyuda #3A3A3C: tam siyah, #121212 liste zemininin ve
 * koyu cam toast'ın üstünde kayboluyordu — nötr gri ikisinden de ayrışıyor,
 * üstündeki beyaz işaretle kontrastı da rahat.
 */
export const badgeNeutralFill = (): string => (isLight() ? "#000000" : "#3A3A3C");

/** Fire — Bildirimler'deki Fire rozetiyle aynı kırmızı. */
export const badgeFireFill = (): string => colors.errorStrong;
