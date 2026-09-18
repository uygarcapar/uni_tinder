// Kartın YANAN Fire alevini (bkz. flameBurn.ts) cihaza gitmeden basar:
// satırlar ısı, sütunlar titreşim kareleri. Silüet ancak hareket halinde ya da
// yan yana görülünce değerlendirilebiliyor; tek tek simülatörde bakmak her
// sabit denemesi için bir build demekti.
//
//   node scripts/preview-flame-burn.js                 # varsayılan ızgara
//   HEATS=0.55,1 CELL=46 node scripts/preview-flame-burn.js
//
// Çıktı: .flame-preview/burn.svg (macOS'ta `qlmanage -t -s 1400 -o . burn.svg`
// ile PNG'ye çevrilebilir).
//
// GEOMETRİYİ YENİDEN YAZMIYOR: flameBurn.ts babel'den geçirilip aynı
// `burnPolygon` çağrılıyor. Dalga alanı burada elle kopyalansaydı önizleme ile
// uygulama kaçınılmaz olarak ayrışırdı (aynı gerekçe flameWavePath'in adaptörlü
// yazılmasında).
//
// Ayrıca BURN_PAD_RATIO'nun tavanını ölçüyor: WAVES ya da BURN_SCALE
// oynatıldığında canvas kutusunun hâlâ yetip yetmediğini söyleyen sayı
// "gereken pad oranı" satırı.
//
//   node scripts/preview-flame-burn.js --nodes   # düğümler + yay uzunlukları
//
// `--nodes` dalganın penceresini (WAVE_FROM / WAVE_TO) yeniden ölçmek için:
// glyph yeniden bakelenirse o iki sayı bu çıktıdan güncellenir.

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const { parsePath, flatten } = require("./lib/glyphPath");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, ".flame-preview");

const GLYPH_SRC = path.join(ROOT, "src/shared/components/icons/FlameGlyph.ts");
const BURN_SRC = path.join(
  ROOT,
  "src/features/discover/components/flameBurn.ts",
);

const glyphSrc = fs.readFileSync(GLYPH_SRC, "utf8");
const FLAME_PATH = glyphSrc.match(/FLAME_PATH\s*=\s*\n?\s*"([^"]+)"/)[1];
// Metrikler de glyph dosyasından okunuyor (elle yazılsa bayatlardı).
const FLAME_GLYPH = Object.fromEntries(
  [...glyphSrc.matchAll(/^\s{2}(\w+):\s*([\d.]+),/gm)].map(([, k, v]) => [
    k,
    Number(v),
  ]),
);

// flameBurn.ts → CJS. Tek bağımlılığı (glyph metrikleri) stub'lanıyor; babel
// TypeScript'i söküyor, `"worklet"` direktifi düz string olarak kalıyor.
const code = babel.transformFileSync(BURN_SRC, {
  configFile: false,
  babelrc: false,
  presets: [require.resolve("@babel/preset-typescript")],
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
}).code;

const mod = { exports: {} };
new Function("module", "exports", "require", code)(mod, mod.exports, (id) => {
  if (id.endsWith("icons/FlameGlyph")) return { FLAME_GLYPH };
  throw new Error("flameBurn beklenmeyen bir modül import ediyor: " + id);
});
const {
  buildBurnContour,
  burnPolygon,
  BURN_CONTOUR_POINTS,
  BURN_FLICKER_FRAMES,
  BURN_PAD_RATIO,
} = mod.exports;

// Halka: bezier BURADA düzleştiriliyor (uygulamada Skia'nın ContourMeasureIter'ı
// yapıyor). İkisi de yaklaşık eşit aralıklı örnek verdiği için silüet aynı.
// `flatten` kübik başına sabit sayıda adım atıyor, o yüzden istenen nokta
// sayısına yeniden örnekliyoruz — yoksa uzun kübikler seyrek kalır.
function resample(ring, n) {
  const seg = [];
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(d);
    total += d;
  }
  const out = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + seg[i] < target && i < ring.length - 1) {
      acc += seg[i];
      i++;
    }
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

const RING = resample(flatten(parsePath(FLAME_PATH), 48)[0], BURN_CONTOUR_POINTS);
const CONTOUR = buildBurnContour(RING);

// `--nodes`: glyph'in düğümlerini yay uzunluğu oranıyla basar. WAVE_FROM /
// WAVE_TO bu çıktıdan okunuyor; glyph yeniden bakelenirse buradan güncellenir.
if (process.argv.includes("--nodes")) {
  const sp = parsePath(FLAME_PATH)[0];
  const lens = sp.cubics.map(([p0, p1, p2, p3]) => {
    let L = 0;
    let prev = p0;
    for (let k = 1; k <= 64; k++) {
      const t = k / 64;
      const u = 1 - t;
      const X =
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const Y =
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      L += Math.hypot(X - prev[0], Y - prev[1]);
      prev = [X, Y];
    }
    return L;
  });
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  console.log(`çevre: ${total.toFixed(2)} birim`);
  sp.cubics.forEach(([, , , p3], i) => {
    acc += lens[i];
    console.log(
      `düğüm ${String(i).padStart(2)}  s=${(acc / total).toFixed(3)}  ` +
        `(${p3[0].toFixed(2)}, ${p3[1].toFixed(2)})`,
    );
  });
  process.exit(0);
}

const HEATS = (process.env.HEATS || "0,0.35,0.7,1").split(",").map(Number);
const CELL = Number(process.env.CELL || 30);
const COLS = BURN_FLICKER_FRAMES;

const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
let cells = "";

HEATS.forEach((heat, r) => {
  for (let c = 0; c < COLS; c++) {
    // `grow` MANDALLI: jest başlar başlamaz 1, bitince 0 (bkz. SwipeCard >
    // burnGrow). Isıyla orantılı geçirilirse pay hesabı ikonun en büyük hâlini
    // hiç görmez ve "kutu yeterli" der.
    const poly = burnPolygon(
      CONTOUR,
      c / BURN_FLICKER_FRAMES,
      heat,
      heat > 0 ? 1 : 0,
    );
    for (const { x, y } of poly) {
      bounds.x0 = Math.min(bounds.x0, x);
      bounds.x1 = Math.max(bounds.x1, x);
      bounds.y0 = Math.min(bounds.y0, y);
      bounds.y1 = Math.max(bounds.y1, y);
    }
    // Uygulamadaki gibi POLİGON (Skia `addPoly`): önizlemede eğriye
    // yumuşatılsaydı cihazda görülecek fasetalar burada saklanırdı.
    const d =
      poly
        .map(({ x, y }, i) => `${i ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`)
        .join("") + "Z";
    cells +=
      `<g transform="translate(${c * CELL + 3},${r * CELL + 3})">` +
      `<rect width="24" height="24" fill="none" stroke="#2a2a2a" stroke-width="0.25"/>` +
      `<path d="${d}" fill="#ff3b20"/>` +
      `</g>`;
  }
});

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(OUT_DIR, "burn.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="${COLS * CELL * 4}" height="${HEATS.length * CELL * 4}" viewBox="0 0 ${COLS * CELL} ${HEATS.length * CELL}">` +
    `<rect width="100%" height="100%" fill="#111"/>${cells}</svg>`,
);

const over = {
  üst: -bounds.y0,
  sol: -bounds.x0,
  sağ: bounds.x1 - 24,
  alt: bounds.y1 - 24,
};
const worst = Math.max(...Object.values(over));
const needed = worst / 24;
console.log(`yazıldı: ${path.relative(ROOT, path.join(OUT_DIR, "burn.svg"))}`);
console.log(
  "silüet taşması (24'lük grid, eksi = içeride): " +
    Object.entries(over)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(" · "),
);
console.log(
  `gereken pad oranı ≥ ${needed.toFixed(3)} · mevcut BURN_PAD_RATIO = ${BURN_PAD_RATIO}`,
);
if (needed >= BURN_PAD_RATIO) {
  console.error("UYARI: canvas kutusu dar — dalganın tepesi kırpılır.");
  process.exitCode = 1;
}
