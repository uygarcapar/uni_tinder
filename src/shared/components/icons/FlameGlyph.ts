// Custom alev glyph'i — yalnız geometri, renk kararı yok. Kaynak:
// assets/icons/minimalist-flame-icon--single-solid-white-silhouet.svg (Recraft,
// 1024 viewBox). Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi:
// yükseklik 20 (üstten/alttan 2 optik pay), yatayda ortalı → 15.04×20 @ x=4.48.
// Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak 1024'lük SVG'yi
// yeniden bakele — aksi halde grid hizası ve optik pay bozulur.
export const FLAME_VIEWBOX = "0 0 24 24";

export const FLAME_PATH =
  "M12.522 2.01C13.277 1.912 14.418 2.571 14.986 3.045C16.928 4.664 18.768 7.34 17.797 9.947C17.689 10.234 17.553 10.51 17.39 10.77C16.891 11.571 15.983 12.563 16.106 13.569C16.138 13.828 16.31 14.189 16.521 14.343C16.773 14.525 17.225 14.592 17.494 14.433C17.751 14.281 17.832 14.135 18.169 14.091C18.462 14.053 18.758 14.138 18.987 14.325C19.315 14.59 19.469 15.105 19.506 15.507C19.627 16.852 18.964 18.289 18.133 19.311C16.903 20.824 15.125 21.73 13.2 21.937C12.579 22.007 12.02 22.01 11.396 21.988C9.675 21.926 7.881 21.575 6.479 20.519C5.402 19.708 4.671 18.545 4.516 17.197C4.412 16.287 4.539 15.45 4.82 14.585C5.332 13.01 6.411 11.786 7.691 10.767C8.909 9.798 9.954 9.184 10.928 7.901C11.759 6.807 12.291 5.622 11.724 4.24C11.576 3.878 11.316 3.703 11.277 3.29C11.202 2.495 11.804 2.082 12.522 2.01Z";
