// On iki burcun kendi sembolünün (♈–♓) çizim yolları.
//
// Neden elle çizilmiş path: burç sembolü NE SF Symbols'ta NE de lucide'da var.
// Unicode glifleri (♈️♉️) emoji sunumuna düşüyor, yani renk almıyor ve
// monokrom ikon setinin içinde yamalı duruyordu — bu dosya o emojilerin yerini
// aldı (bkz. filterEnumIcons → ZODIAC_ICONS).
//
// Ölçü sözleşmesi lucide ile BİREBİR: 24×24 viewBox, dolgu yok, yalnız kontur,
// uçlar/köşeler yuvarlak. Böylece aynı satırdaki lucide ikonlarıyla (ör. sigara)
// aynı strokeWidth verildiğinde aynı ağırlıkta görünüyorlar.
//
// Her burç bir veya birden çok alt-yol: hepsi AYNI kontur ayarlarıyla çizilir,
// alt-yollar arasında dolgu/kesişim ilişkisi yok.
export const ZODIAC_GLYPH_VIEWBOX = "0 0 24 24";

export const ZODIAC_GLYPH_PATHS: Record<string, readonly string[]> = {
  // Koç — iki boynuz, ortada gövde.
  Aries: [
    "M12 20.5V9.2",
    "M12 9.2C12 5.9 9.8 3.5 6.9 3.5C4.6 3.5 3 5.2 3 7.4",
    "M12 9.2C12 5.9 14.2 3.5 17.1 3.5C19.4 3.5 21 5.2 21 7.4",
  ],
  // Boğa — daire + üstünde boynuz hilali.
  Taurus: [
    "M16.8 16.2A4.8 4.8 0 1 1 7.2 16.2A4.8 4.8 0 1 1 16.8 16.2",
    "M5.8 3.5C5.8 7.5 8.6 10.6 12 10.6C15.4 10.6 18.2 7.5 18.2 3.5",
  ],
  // İkizler — Roma rakamı II, alt/üst çubukları hafif kavisli.
  Gemini: [
    "M6 4.2C9.7 2.6 14.3 2.6 18 4.2",
    "M6 19.8C9.7 21.4 14.3 21.4 18 19.8",
    "M9.2 3.5V20.5",
    "M14.8 3.5V20.5",
  ],
  // Yengeç — birbirine bakan iki kıskaç (yatık "69").
  Cancer: [
    "M3 10.2C4.8 7.2 8.3 5.4 12 5.7C13.9 5.9 15.5 6.5 16.9 7.5",
    "M21.2 9.5A2.6 2.6 0 1 1 16 9.5A2.6 2.6 0 1 1 21.2 9.5",
    "M21 13.8C19.2 16.8 15.7 18.6 12 18.3C10.1 18.1 8.5 17.5 7.1 16.5",
    "M8 14.5A2.6 2.6 0 1 1 2.8 14.5A2.6 2.6 0 1 1 8 14.5",
  ],
  // Aslan — daire + yukarı kıvrılan yele/kuyruk.
  Leo: [
    "M12.4 16.3A4 4 0 1 1 4.4 16.3A4 4 0 1 1 12.4 16.3",
    "M12.4 16.3C12.4 13.6 10.4 11.6 10.4 8.8C10.4 6 12.3 4 15 4C17.7 4 19.6 6 19.6 8.7C19.6 10.6 18.8 12 18.8 13.3C18.8 14.6 19.7 15.5 21 15.3",
  ],
  // Başak — iki tepeli "m" + içe kapanan ilmek.
  Virgo: [
    "M3.4 19.5V8.6C3.4 7 4.5 6 5.8 6C7.1 6 8.2 7 8.2 8.6V19.5",
    "M8.2 8.6C8.2 7 9.3 6 10.6 6C11.9 6 13 7 13 8.6V14.5",
    "M13 12.8C13.6 11.2 15.4 10.4 17.2 10.9C19.3 11.5 20.5 13.7 19.9 16C19.2 18.6 16.6 20.1 14 19.4C12.4 19 11.2 17.9 10.6 16.5",
  ],
  // Terazi — alt çizgi + üstünde tam yarım daire.
  Libra: [
    "M3 20.5H21",
    "M3 15.5H7.6",
    "M16.4 15.5H21",
    "M7.6 15.5A4.4 4.4 0 0 1 16.4 15.5",
  ],
  // Akrep — Başak'ın "m"i, son bacak yukarı sağa bakan iğneyle bitiyor.
  Scorpio: [
    "M2.8 19.5V8.6C2.8 7 3.9 6 5.2 6C6.5 6 7.6 7 7.6 8.6V19.5",
    "M7.6 8.6C7.6 7 8.7 6 10 6C11.3 6 12.4 7 12.4 8.6V19.5",
    "M12.4 8.6C12.4 7 13.5 6 14.8 6C16.1 6 17.2 7 17.2 8.6V18.2L21.4 14",
    "M18.8 14H21.4V16.6",
  ],
  // Yay — çapraz ok + gövdesini kesen çubuk.
  Sagittarius: [
    "M3.5 20.5L19.5 4.5",
    "M13.9 4.5H19.5V10.1",
    "M8.6 9.6L14.4 15.4",
  ],
  // Oğlak — keçi boynuzundan balık kuyruğuna geçen tek kesintisiz çizgi.
  Capricorn: [
    "M3.2 9.6C2.8 6.8 4.4 5.1 6.2 6.1C7.4 6.8 8.2 8.5 8.8 10.7C9.4 13 10.2 15.4 11.5 16.8C12.4 17.9 13.6 18.3 14.7 17.8C15.7 17.3 16.2 16.2 16.2 14.8V10.6C16.2 8.7 17.5 7.3 19.1 7.3C20.7 7.3 21.8 8.6 21.8 10.3C21.8 12 20.5 13.4 18.8 13.4C17.6 13.4 16.7 12.9 16.2 12.1",
  ],
  // Kova — iki su dalgası.
  Aquarius: [
    "M3.5 10.8L6.9 7.8L10.3 10.8L13.7 7.8L17.1 10.8L20.5 7.8",
    "M3.5 16.2L6.9 13.2L10.3 16.2L13.7 13.2L17.1 16.2L20.5 13.2",
  ],
  // Balık — sırt sırta iki hilal, ortada bağ.
  Pisces: [
    "M7.2 3.4C4 6.5 4 17.5 7.2 20.6",
    "M16.8 3.4C20 6.5 20 17.5 16.8 20.6",
    "M3.6 12H20.4",
  ],
};
