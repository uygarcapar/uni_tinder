// Custom Flame glyph'i — yalnız geometri, renk kararı yok.
//
// İKİ AYRI SİLÜET VAR ve bu kasıtlı (istek, 2026-11-01: "sadece ikonu
// değiştir, banner animasyonunu değiştirme"):
//
//   FLAME_PATH       → İKON. Font Awesome Free 6.7.2 `fire` (CC BY 4.0,
//                      https://fontawesome.com/license/free), kaynak
//                      assets/icons/fa-fire.svg (448×512). Bakeleme:
//                      uzun kenar 20 → 17.50×20.00 @ x=3.25 y=2.00.
//   FLAME_SWEEP_PATH → ANİMASYON (flame sweep + burn). Eski Recraft silüeti,
//                      kaynak assets/icons/minimalist-flame-icon--single-
//                      solid-white-silhouet.svg (1024). 15.04×20 @ x=4.48.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (`node scripts/bake-glyph.js <svg> --name Flame`) — aksi halde
// grid hizası ve optik pay bozulur.
export const FLAME_VIEWBOX = "0 0 24 24";

/**
 * İKON path'i — FireGlyph, PremiumFlame ve ikon çizen herkes bunu kullanır.
 *
 * İKİ alt-path: dış gövde + iç alev DELİĞİ (sarım yönleri ters → nonzero'da
 * delik açık, react-native-svg varsayılanıyla fillRule gerekmez).
 * ANİMASYONDA KULLANMA: damgalamada delik, dillerin içinde zemini gösteren
 * boşluklar açar — oraya FLAME_SWEEP_PATH.
 */
export const FLAME_PATH =
  "M9.473 2.212C9.777 1.927 10.25 1.931 10.555 2.216C11.633 3.227 12.644 4.317 13.59 5.497C14.019 4.934 14.508 4.321 15.035 3.821C15.344 3.532 15.82 3.532 16.129 3.825C17.48 5.114 18.625 6.817 19.429 8.434C20.222 10.028 20.75 11.657 20.75 12.805C20.75 17.789 16.851 22 12 22C7.094 22 3.25 17.785 3.25 12.801C3.25 11.301 3.946 9.469 5.024 7.657C6.114 5.817 7.653 3.899 9.473 2.212ZM12.066 18.25C13.055 18.25 13.93 17.977 14.754 17.43C16.398 16.282 16.84 13.985 15.851 12.18C15.676 11.829 15.226 11.805 14.973 12.102C14.644 12.484 14.316 12.865 13.988 13.247C13.73 13.543 13.266 13.536 13.023 13.227C12.379 12.407 11.227 10.942 10.57 10.11C10.324 9.797 9.856 9.794 9.606 10.106C8.285 11.766 7.621 12.813 7.621 13.989C7.625 16.664 9.602 18.25 12.066 18.25Z";

/**
 * ANİMASYON silüeti — flame sweep (FireFlameCanvas) ve burn (FireBurnCanvas)
 * glifi damgalayıp deforme ederken BUNU kullanır. Tek kapalı kontur, delik
 * yok; FLAME_GLYPH metrikleri de BU path'i tarif eder.
 */
export const FLAME_SWEEP_PATH =
  "M12.522 2.01C13.277 1.912 14.418 2.571 14.986 3.045C16.928 4.664 18.768 7.34 17.797 9.947C17.689 10.234 17.553 10.51 17.39 10.77C16.891 11.571 15.983 12.563 16.106 13.569C16.138 13.828 16.31 14.189 16.521 14.343C16.773 14.525 17.225 14.592 17.494 14.433C17.751 14.281 17.832 14.135 18.169 14.091C18.462 14.053 18.758 14.138 18.987 14.325C19.315 14.59 19.469 15.105 19.506 15.507C19.627 16.852 18.964 18.289 18.133 19.311C16.903 20.824 15.125 21.73 13.2 21.937C12.579 22.007 12.02 22.01 11.396 21.988C9.675 21.926 7.881 21.575 6.479 20.519C5.402 19.708 4.671 18.545 4.516 17.197C4.412 16.287 4.539 15.45 4.82 14.585C5.332 13.01 6.411 11.786 7.691 10.767C8.909 9.798 9.954 9.184 10.928 7.901C11.759 6.807 12.291 5.622 11.724 4.24C11.576 3.878 11.316 3.703 11.277 3.29C11.202 2.495 11.804 2.082 12.522 2.01Z";

/**
 * FLAME_SWEEP_PATH'in bakeleme SAYILARI — path'i kendi ekseninde ölçeklemek,
 * yatırmak ya da dış hattını dalgalandırmak isteyen her yer buradan okuyor
 * (bkz. flameWavePath > addTongue, flameBurn > buildBurnContour). İkonun
 * (FLAME_PATH) metrikleri DEĞİL: ikon FA'ya geçti, animasyon eski silüette.
 */
export const FLAME_GLYPH = {
  /** Alevin yatay merkezi — grid'in ortası, glyph ortalı bakelendi. */
  cx: 12,
  /** Tabanın y'si: alevin oturduğu çizgi. Ölçek/yatırma pivotu. */
  bottom: 22,
  /** Ucun y'si. */
  top: 2,
  /** Görünür alevin boyu (bottom - top). */
  height: 20,
  /** Görünür alevin en geniş yeri. */
  width: 15.04,
} as const;
