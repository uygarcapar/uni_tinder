// Açılış ekranının alt ortasındaki 4ourstack imzasını üretir: açık tema için
// koyu mürekkepli, koyu tema için beyaz mürekkepli PNG'ler (1x/2x/3x).
//
// Kaynak assets/fourstack/logo-{black,white}.svg. İki dosyanın path verisi
// birebir aynı olmak ZORUNDA (aşağıda doğrulanıyor) — biri elle düzeltilip
// diğeri unutulursa tema değişiminde imza zıplardı; sessizce yanlış çıktı
// vermektense yüksek sesle patlıyoruz.
//
// Neden PNG: native splash bir storyboard, yani vektör çizemiyor; asset
// catalog'a 1x/2x/3x raster koymak zorundayız. Rasterleştirici burada, çünkü
// repoda görüntü kütüphanesi yok (bkz. scripts/lib/png.js) ve bu iş için
// tarama-satırı doldurucu yeterli.
//
//   node scripts/gen-fourstack.js
//
// Çıktıyı native splash'e bağlayan parça: plugins/withSplashFooter.js

const fs = require("fs");
const path = require("path");
const { parsePath, flatten } = require("./lib/glyphPath");
const { writePNG } = require("./lib/png");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "assets", "fourstack");

// Ekrandaki genişlik. "lit" logosu 180pt (app.json > expo-splash-screen
// imageWidth); imza onun ~%31'i — okunur ama açıkça ikincil. Yükseklik
// verilmiyor, glyph'in kendi en-boy oranından türüyor: storyboard'daki
// imageView boyut kısıtı taşımıyor, intrinsic content size'ı kullanıyor, yani
// burayı değiştirmek tek başına yeterli.
const WIDTH_PT = 56;

const SS_Y = 16; // dikey süper-örnekleme (yatayda örtüşme analitik hesaplanıyor)
const FLATTEN_STEPS = 48; // kübik başına poligon adımı — gen-tab-icons ile aynı

const VARIANTS = [
  // Açık temada (zemin #FFFFFF) siyah, koyu temada (#121212) beyaz mürekkep.
  // Renkler SVG'lerin KENDİ fill'inden okunuyor, palete kopyalanmıyor: imza
  // bizim değil, olduğu gibi taşınmalı.
  { src: "logo-black.svg", out: "splash-footer-light" },
  { src: "logo-white.svg", out: "splash-footer-dark" },
];

/** SVG'den tek path'in `fill` + `d` çiftini çıkarır. */
function readSvg(file) {
  const svg = fs.readFileSync(path.join(DIR, file), "utf8");
  const m = svg.match(/<path[^>]*\sfill="([^"]+)"[^>]*\sd="([^"]+)"/);
  if (!m) throw new Error(`${file}: tek fill+d taşıyan <path> bulunamadı`);
  const hex = m[1].replace("#", "");
  if (hex.length !== 6) throw new Error(`${file}: beklenmeyen fill "${m[1]}"`);
  return {
    ink: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
    d: m[2],
  };
}

/**
 * Halkaları (poligonlar) RGBA tamponuna doldurur — nonzero sarım kuralı, yani
 * ters yönde sarılmış alt-path'ler delik açar ("4"ün sayacı).
 *
 * Yatayda kapsama ANALİTİK (parçanın piksele düşen uzunluğu), dikeyde SS_Y
 * örnek: kenar yumuşatması 4×4 süper-örneklemeden belirgin temiz çıkıyor ve
 * 56pt'lik bir imzada fark görünür.
 */
function rasterize(rings, w, h, ink) {
  const edges = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      if (y0 !== y1) edges.push([x0, y0, x1, y1]); // yatay kenar hiç kesişmez
    }
  }

  // Mürekkep rengi ŞEFFAF piksellere de yazılıyor ("color bleed") — gerekçe
  // gen-splash.js ile aynı: alfayı ağırlık saymayan bir ölçekleyici şeffaf
  // alanın RGB'sini kenara karıştırdığında logo etrafında kir halkası olmasın.
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i << 2] = ink[0];
    buf[(i << 2) + 1] = ink[1];
    buf[(i << 2) + 2] = ink[2];
  }

  const cov = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    cov.fill(0);
    for (let s = 0; s < SS_Y; s++) {
      const py = y + (s + 0.5) / SS_Y;
      const hits = [];
      for (const [x0, y0, x1, y1] of edges) {
        if (y0 <= py === y1 <= py) continue;
        hits.push([x0 + ((py - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
      }
      if (hits.length < 2) continue;
      hits.sort((a, b) => a[0] - b[0]);
      let wind = 0;
      let from = 0;
      for (const [x, dir] of hits) {
        const prev = wind;
        wind += dir;
        if (prev === 0 && wind !== 0) from = x;
        else if (prev !== 0 && wind === 0) {
          const a = Math.max(0, from);
          const b = Math.min(w, x);
          for (let i = Math.floor(a); i < b; i++) {
            cov[i] += Math.min(b, i + 1) - Math.max(a, i);
          }
        }
      }
    }
    for (let x = 0; x < w; x++) {
      buf[((y * w + x) << 2) + 3] = Math.round(
        Math.min(1, cov[x] / SS_Y) * 255,
      );
    }
  }
  return buf;
}

const svgs = VARIANTS.map((v) => ({ ...v, ...readSvg(v.src) }));
if (svgs[0].d !== svgs[1].d) {
  throw new Error(
    "logo-black.svg ve logo-white.svg farklı path taşıyor — ikisi aynı " +
      "kaynaktan güncellenmeli, yoksa tema değişiminde imza zıplar",
  );
}

// bbox düzleştirilmiş halkalardan alınıyor, analitik pathBBox'tan değil:
// dolgu da bu halkalardan yapılıyor, ikisi ayrışırsa mürekkep tuvale
// binde birlik taşar ve kenar kırpılır.
const rings = flatten(parsePath(svgs[0].d), FLATTEN_STEPS);
let gx0 = Infinity;
let gx1 = -Infinity;
let gy0 = Infinity;
let gy1 = -Infinity;
for (const ring of rings) {
  for (const [x, y] of ring) {
    if (x < gx0) gx0 = x;
    if (x > gx1) gx1 = x;
    if (y < gy0) gy0 = y;
    if (y > gy1) gy1 = y;
  }
}
const gw = gx1 - gx0;
const gh = gy1 - gy0;
const HEIGHT_PT = WIDTH_PT * (gh / gw);

for (const { out, ink } of svgs) {
  for (const scale of [1, 2, 3]) {
    // Tuval mürekkebin TAM kutusu (şeffaf pay yok): storyboard boyut kısıtı
    // taşımadığı için ekrandaki kutu = intrinsic content size = bu piksellerin
    // pt karşılığı. Payı olsaydı imza görünürde küçülür ve alt boşluk şişerdi.
    const w = WIDTH_PT * scale;
    const h = Math.round(HEIGHT_PT * scale);
    const s = w / gw;
    const rows = rings.map((ring) =>
      ring.map(([x, y]) => [
        (x - gx0) * s,
        (y - gy0) * s + (h - gh * s) / 2,
      ]),
    );
    const sfx = scale === 1 ? "" : `@${scale}x`;
    writePNG(path.join(DIR, `${out}${sfx}.png`), w, h, rasterize(rows, w, h, ink));
    console.log(`${out}${sfx}.png  ${w}×${h}px`);
  }
}
console.log(
  `yazıldı: assets/fourstack (${WIDTH_PT}×${HEIGHT_PT.toFixed(2)}pt)`,
);
