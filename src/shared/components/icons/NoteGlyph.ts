// Custom Note glyph'i — yalnız geometri, renk kararı yok. Kaynak:
// assets/icons/app-icon-glyph--speech-bubble.svg (Recraft, 1024 viewBox).
// Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi: uzun kenar 20
// (iki yanda 2 optik pay) → 20.00×19.92 @ x=2.00 y=2.04.
// Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (`node scripts/bake-glyph.js assets/icons/app-icon-glyph--speech-bubble.svg --name Note`) — aksi halde
// grid hizası ve optik pay bozulur.
export const NOTE_VIEWBOX = "0 0 24 24";

export const NOTE_PATH =
  "M11.568 2.044C12.485 2.019 13.403 2.077 14.311 2.216C16.66 2.578 18.825 3.628 20.24 5.582C22.011 8.054 22.254 11.474 21.802 14.392C21.446 16.697 20.334 18.8 18.423 20.169C15.974 21.925 12.556 22.227 9.658 21.773C8.535 21.584 7.646 21.313 6.63 20.811C6.539 20.85 6.452 20.896 6.365 20.943C5.213 21.55 3.909 21.857 2.616 21.955C2.197 21.987 1.89 21.614 2.105 21.222C2.205 21.04 2.51 20.966 2.686 20.856C3.263 20.497 3.677 19.898 3.815 19.232C3.869 18.971 3.872 18.733 3.868 18.47C2.567 16.786 2.092 14.545 2.012 12.46C1.976 11.606 2.022 10.75 2.15 9.905C2.911 4.616 6.415 2.245 11.568 2.044ZM14.725 7.409C14.967 7.403 15.208 7.425 15.445 7.473C17.262 7.848 18.378 9.686 17.959 11.469C17.43 13.721 15.417 15.476 13.676 16.849C13.156 17.259 12.569 17.605 12.018 17.964C11.173 17.478 10.187 16.767 9.451 16.142C7.778 14.711 5.435 12.276 6.083 9.849C6.303 8.999 6.856 8.274 7.617 7.836C8.368 7.409 9.258 7.296 10.092 7.523C10.974 7.761 11.568 8.303 12.014 9.078C12.581 8.003 13.525 7.467 14.725 7.409Z";
