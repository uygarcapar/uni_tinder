// Açılış ekranının (native splash) logo varlıklarını üretir: açık tema için
// koyu mürekkepli, koyu tema için beyaz mürekkepli "lit" yazısı.
//
// İkisi de TEK kaynaktan (assets/lit_name_black.png) türetiliyor — elde iki ayrı
// dosya tutulsaydı (repo'da duran lit_name_white.png gibi) çözünürlükleri ve
// kırpma payları tutmuyor, tema değişince logo zıplıyordu. Burada yalnız RGB
// kanalı değiştiriliyor, alfa aynen taşınıyor: kenar yumuşatması her iki
// mürekkep renginde de doğru kalıyor (kaynak straight alfa, premultiplied değil).
//
// Çıktı KARE ve mürekkep tam kenara oturuyor: expo-splash-screen görseli
// `imageWidth` kutusuna "contain" ediyor, yani kare kenarı = ekrandaki logo
// genişliği. Kaynaktaki asimetrik şeffaf payı kırpmasak logo görsel olarak
// merkezden kayardı.
//
//   node scripts/gen-splash.js

const path = require("path");
const { readPNG, writePNG } = require("./lib/png");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets", "lit_name_black.png");

// Mürekkep renkleri palet ile birebir (src/shared/theme/colors.ts): açıkta
// `text` #0B0B0C, koyuda #FFFFFF. Splash zeminleri de app.json'da `bg` ile aynı
// (#FFFFFF / #121212) — splash kalkarken görünür bir dikiş izi olmuyor.
const VARIANTS = [
  { out: "splash-icon-light.png", ink: [0x0b, 0x0b, 0x0c] },
  { out: "splash-icon-dark.png", ink: [0xff, 0xff, 0xff] },
];

const ALPHA_FLOOR = 8; // bu değerin altındaki alfa "boş" sayılır (JPEG artığı payı)

const src = readPNG(SRC);

let minX = src.w;
let minY = src.h;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < src.h; y++) {
  for (let x = 0; x < src.w; x++) {
    if (src.rgba[((y * src.w + x) << 2) + 3] <= ALPHA_FLOOR) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}
if (maxX < 0) throw new Error(`${SRC}: tamamen şeffaf`);

const inkW = maxX - minX + 1;
const inkH = maxY - minY + 1;
const side = Math.max(inkW, inkH);
const offX = ((side - inkW) / 2) | 0;
const offY = ((side - inkH) / 2) | 0;

for (const { out, ink } of VARIANTS) {
  // Mürekkep rengi ŞEFFAF piksellere de yazılıyor ("color bleed"): alfa maskeli
  // bir master'ı doğru yazma biçimi bu — alfayı ağırlık olarak kullanmayan bir
  // ölçekleyici şeffaf alanın RGB'sini kenarlara karıştırdığında logonun
  // etrafında kir halkası oluşmuyor.
  //
  // NOT: expo'nun kendi hattı (@expo/image-utils) 1x/2x/3x çıktısını zaten
  // premultiplied yazıyor (şeffaf zemine "over" kompozit), yani bu satırlar
  // ios/…/SplashScreenLogo.imageset içeriğini bugün DEĞİŞTİRMİYOR. Ölçülen
  // sapma 180pt'lik logoda gözle görünmüyor; hattın davranışı değişirse ya da
  // master başka bir yerde kullanılırsa bedava sigorta olarak duruyor.
  const dst = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) {
    dst[i << 2] = ink[0];
    dst[(i << 2) + 1] = ink[1];
    dst[(i << 2) + 2] = ink[2];
  }
  for (let y = 0; y < inkH; y++) {
    for (let x = 0; x < inkW; x++) {
      const s = (((minY + y) * src.w + (minX + x)) << 2) + 3;
      dst[((((offY + y) * side + (offX + x)) << 2) + 3)] = src.rgba[s];
    }
  }
  const file = path.join(ROOT, "assets", out);
  writePNG(file, side, side, dst);
  console.log(`${out}  ${side}×${side}  (mürekkep ${inkW}×${inkH})`);
}
