// Custom SuperLike kalbi — yalnız geometri, renk kararı yok. Kaynak:
// assets/icons/extremely-minimalist-heart-icon--single-solid-blac.svg (Recraft,
// 1024 viewBox). Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi: büyük
// kenar (genişlik) 20 → her yanda 2 optik pay, dikeyde ortalı → 20×18.87 @
// y=2.56. Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak 1024'lük SVG'yi
// yeniden bakele — aksi halde grid hizası ve optik pay bozulur (bkz. FlameGlyph).
export const HEART_VIEWBOX = "0 0 24 24";

export const HEART_PATH =
  "M15.872 2.568C15.941 2.559 16.128 2.566 16.206 2.569C16.808 2.597 17.403 2.713 17.971 2.915C19.496 3.464 20.739 4.599 21.425 6.067C22.167 7.654 22.171 9.194 21.55 10.834C20.982 12.334 20.154 13.592 19.165 14.848C17.611 16.82 15.769 18.415 13.722 19.855C13.215 20.216 12.694 20.56 12.162 20.884C11.92 21.029 11.667 21.182 11.411 21.299C11.187 21.395 11 21.496 10.758 21.394C10.038 21.092 10.289 20.477 10.498 19.928C10.566 19.752 10.635 19.51 10.669 19.325C10.78 18.712 10.677 18.061 10.422 17.495C9.847 16.269 8.611 15.523 7.48 14.875C7.02 14.61 6.558 14.351 6.092 14.097C4.815 13.401 3.66 12.796 2.84 11.538C2.028 10.294 1.829 8.852 2.138 7.408C2.485 5.804 3.45 4.403 4.824 3.506C6.092 2.671 7.643 2.382 9.127 2.706C10.325 2.969 11.367 3.702 12.02 4.74C12.161 4.482 12.343 4.242 12.544 4.026C13.428 3.082 14.595 2.618 15.872 2.568Z";
