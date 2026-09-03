// Custom Message glyph'i — yalnız geometri, renk kararı yok.
//
// ⚠️ YENİ BİR ŞEKİL DEĞİL: NoteGlyph'in DIŞ halkasının birebir aynısı, içindeki
// kalp oyuğu olmadan (bkz. NoteGlyph > NOTE_PATH, ikinci alt-path). İkisi aynı
// kaynak SVG'den geliyor (assets/icons/app-icon-glyph--speech-bubble.svg,
// Recraft, 1024 viewBox) ve aynı 24×24 grid'ine bakelenmiş: uzun kenar 20 (iki
// yanda 2 optik pay) → 20.00×19.92 @ x=2.00 y=2.04.
//
// Ayrı bir dosya olmasının sebebi TÜKETİCİSİ: bu path tab bar ikonuna
// rasterize ediliyor (gen-tab-icons.js) ve o script TEK kapalı alt-path
// varsayıyor — delikli NOTE_PATH oradan geçse deliği dolu çizerdi. İkisi tek
// dosyada durursa "hangisi tab'a gidiyor" sorusu her seferinde yeniden
// sorulur.
//
// ⚠️ Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (`node scripts/bake-glyph.js assets/icons/app-icon-glyph--speech-bubble.svg --name Message`)
// ve buradan yine yalnız İLK alt-path'i al — aksi halde grid hizası ve optik
// pay bozulur, üstelik Note ile Message aynı bakelden çıkmadığı için üst üste
// binmeyen iki bubble olur.
export const MESSAGE_VIEWBOX = "0 0 24 24";

export const MESSAGE_PATH =
  "M11.568 2.044C12.485 2.019 13.403 2.077 14.311 2.216C16.66 2.578 18.825 3.628 20.24 5.582C22.011 8.054 22.254 11.474 21.802 14.392C21.446 16.697 20.334 18.8 18.423 20.169C15.974 21.925 12.556 22.227 9.658 21.773C8.535 21.584 7.646 21.313 6.63 20.811C6.539 20.85 6.452 20.896 6.365 20.943C5.213 21.55 3.909 21.857 2.616 21.955C2.197 21.987 1.89 21.614 2.105 21.222C2.205 21.04 2.51 20.966 2.686 20.856C3.263 20.497 3.677 19.898 3.815 19.232C3.869 18.971 3.872 18.733 3.868 18.47C2.567 16.786 2.092 14.545 2.012 12.46C1.976 11.606 2.022 10.75 2.15 9.905C2.911 4.616 6.415 2.245 11.568 2.044Z";
