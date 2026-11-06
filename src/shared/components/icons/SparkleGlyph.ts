// Custom Sparkle glyph'i — yalnız geometri, renk kararı yok. Kaynak:
// assets/icons/lucide-sparkle.svg = Lucide `sparkle` (ISC, https://lucide.dev),
// lucide-react-native v1.46.0 > icons/sparkle.mjs içindeki tek path.
//
// LUCIDE'I DOLGU OLARAK ÇİZİYORUZ, stroke olarak değil: Lucide ikonları
// stroke-width 2 ile çizilir ama bu path KAPALI bir kontur, yani doldurulunca
// dört köşeli yıldızın kendisi çıkıyor. Fire ailesinin geri kalanı (FLAME_PATH,
// NoteGlyph) dolu siluet; Spark da aynı ailede durmak zorunda, çizgi glif
// onların yanında bambaşka bir ikon dili olurdu.
//
// Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi: uzun kenar 20
// (iki yanda 2 optik pay) → 20.00×20.00 @ x=2.00 y=2.00. Lucide'ın kendi
// gridi zaten bu kurala uyuyordu, yani sayılar kaynakla birebir aynı çıktı.
// Ölçek/öteleme path'in içine gömülü, `transform` yok.
//
// ⚠️ ARKADAŞ MODUNUN İKONU, ANİMASYONU DEĞİL (istek, 2026-11-06: "yok sadece
// ikonu değiştir şimdilik"). Alev dalgası ve kartta yanma her iki modda da
// FLAME_SWEEP_PATH üstünde duruyor — oranın geometrisi (flameWavePath,
// flameBurn) alevin kıvrımlarına göre yazılmış ve bu glyph'i tanımıyor.
//
// ⚠️ OPTİK AĞIRLIK ALEVDEN HAFİF: aynı 20'lik kutuda yıldızın mürekkebi
// alevin ~%56'sı (24px'te 117px² / 207px²) — kolları içbükey. Kutu kuralı
// bilerek bozulmadı; iki glif aynı `size`ta aynı yüksekliği doldursun.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (`node scripts/bake-glyph.js assets/icons/lucide-sparkle.svg --name Sparkle`)
// — aksi halde grid hizası ve optik pay bozulur.
export const SPARKLE_VIEWBOX = "0 0 24 24";

export const SPARKLE_PATH =
  "M11.017 2.816C11.106 2.343 11.519 2 12 2C12.481 2 12.894 2.343 12.983 2.816C13.333 4.668 13.683 6.521 14.034 8.373C14.186 9.181 14.819 9.814 15.627 9.966C17.479 10.317 19.332 10.667 21.184 11.017C21.657 11.106 22 11.519 22 12C22 12.481 21.657 12.894 21.184 12.983C19.332 13.333 17.479 13.683 15.627 14.034C14.819 14.186 14.186 14.819 14.034 15.627C13.683 17.479 13.333 19.332 12.983 21.184C12.894 21.657 12.481 22 12 22C11.519 22 11.106 21.657 11.017 21.184C10.667 19.332 10.317 17.479 9.966 15.627C9.814 14.819 9.181 14.186 8.373 14.034C6.521 13.683 4.668 13.333 2.816 12.983C2.343 12.894 2 12.481 2 12C2 11.519 2.343 11.106 2.816 11.017C4.668 10.667 6.521 10.317 8.373 9.966C9.181 9.814 9.814 9.181 9.966 8.373C10.317 6.521 10.667 4.668 11.017 2.816Z";
