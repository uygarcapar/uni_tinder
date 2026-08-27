// Custom Heart glyph'i — yalnız geometri, renk kararı yok. Kaynak:
// assets/icons/app-icon-glyph--heart.svg (Recraft, 1024 viewBox).
// Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi: uzun kenar 20
// (iki yanda 2 optik pay) → 20.00×16.95 @ x=2.00 y=3.52.
// Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (`node scripts/bake-glyph.js assets/icons/app-icon-glyph--heart.svg --name Heart`) — aksi halde
// grid hizası ve optik pay bozulur.
export const HEART_VIEWBOX = "0 0 24 24";

export const HEART_PATH =
  "M11.977 5.115C12.033 5.06 12.09 5.006 12.148 4.954C13.258 3.962 14.841 3.451 16.319 3.539C17.982 3.638 19.41 4.439 20.503 5.674C21.549 6.865 22.083 8.421 21.99 10.003C21.935 10.76 21.735 11.499 21.401 12.18C20.411 14.238 17.704 16.91 15.965 18.418C14.927 19.305 13.785 20.309 12.365 20.46C10.748 20.632 9.262 19.417 8.081 18.384C6.24 16.774 3.679 14.391 2.607 12.185C2.277 11.521 2.077 10.801 2.017 10.063C1.897 8.475 2.413 6.904 3.451 5.697C4.561 4.403 5.967 3.679 7.661 3.548C9.201 3.382 10.853 4.096 11.977 5.115Z";
