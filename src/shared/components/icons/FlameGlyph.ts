// Custom alev glyph'i — yalnız geometri, renk kararı yok. Recraft'ta üretilen
// 1024 viewBox'lı SVG, gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi:
// yükseklik 20 (üstten/alttan 2 optik pay), yatayda ortalı → 13.95×20 @ x=5.03.
// Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak 1024'lük SVG'yi
// yeniden bakele — aksi halde grid hizası ve optik pay bozulur.
export const FLAME_VIEWBOX = "0 0 24 24";

export const FLAME_PATH =
  "M10.605 2.004C11.023 1.95 11.646 2.477 11.992 2.713C14.804 4.635 17.248 7.224 18.355 10.502C19.584 14.14 19.126 18.673 15.663 20.917C13.729 22.17 11.546 22.194 9.363 21.701C8.549 21.563 7.35 20.987 6.74 20.432C5.643 19.433 5.1 18.208 5.037 16.729C4.904 14.3 6.054 12.118 7.662 10.373C7.942 10.069 8.385 9.921 8.729 10.249C9.139 10.641 8.75 11.135 8.775 11.623C8.801 12.13 9.065 12.45 9.612 12.429C10.114 12.399 10.607 12.06 10.922 11.68C11.526 10.952 11.659 10.06 11.667 9.156C11.681 7.591 11.256 6.073 10.627 4.652C10.485 4.331 10.301 4.01 10.141 3.696C10.06 3.538 9.927 3.384 9.854 3.218C9.616 2.628 9.979 2.046 10.605 2.004Z";
