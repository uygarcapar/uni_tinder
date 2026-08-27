// Recraft'tan gelen 1024'lük SVG'yi 24×24 glyph sabitine "bakeler".
//
//   node scripts/bake-glyph.js assets/icons/foo.svg --name SuperLike
//   PREVIEW=1 node scripts/bake-glyph.js assets/icons/foo.svg
//
// PREVIEW=1 dosya YAZMAZ; .icon-preview/ altına 24/48/72px PNG basar ve
// teşhis satırlarını döker. Recraft varyasyonlarını ayıklamak için bu yol.
//
// Ölçü kuralı (mevcut FlameGlyph/HeartGlyph ile aynı): gerçek bezier bbox'ının
// UZUN kenarı 20 birime ölçeklenir → 24 grid'inde her yanda 2 optik pay kalır,
// kısa eksende ortalanır. Dönüşüm path verisinin içine gömülür, `transform`
// kullanılmaz.

const fs = require("fs");
const path = require("path");
const { parsePath, flatten, signedArea, bake } = require("./lib/glyphPath");
const { writePNG } = require("./lib/png");

const ROOT = path.resolve(__dirname, "..");
const PREVIEW = process.env.PREVIEW === "1";
const GRID = 24;
const LONG = 20; // uzun kenar → 2pt optik pay
const SS = 4; // önizlemede piksel başına 4×4 supersample

// --- argümanlar --------------------------------------------------------
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const flag = (name) => flags[name];
const src = positional[0];

if (!src) {
  console.error(
    "kullanım: node scripts/bake-glyph.js <svg> [--name SuperLike] [--const SUPER_LIKE]\n" +
      "          PREVIEW=1 ile yalnız önizleme basar",
  );
  process.exit(1);
}

const srcPath = path.resolve(ROOT, src);
if (!fs.existsSync(srcPath)) {
  console.error(`bulunamadı: ${srcPath}`);
  process.exit(1);
}

// Dosya adından makul bir varsayılan üret: "minimalist-flame-icon--..." → Flame
const baseName = path.basename(srcPath, ".svg");
const name =
  flag("name") ||
  baseName
    .replace(/[^a-zA-Z]+/g, " ")
    .trim()
    .split(/\s+/)[0];
const CONST =
  flag("const") ||
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();

// --- SVG'den path verisi ------------------------------------------------
const svg = fs.readFileSync(srcPath, "utf8");
const ds = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
if (ds.length === 0) {
  console.error('SVG içinde <path d="…"> yok');
  process.exit(1);
}
if (ds.length > 1) {
  console.warn(
    `⚠︎  ${ds.length} ayrı <path> bulundu — hepsi tek glyph'in alt-path'leri\n` +
      "   sayılacak. Şekil parçalıysa (ör. gövdeden kopmuş alev dili) bu\n" +
      "   YANLIŞ; kaynağı tek kapalı siluet olarak yeniden üret.",
  );
}

let subpaths;
try {
  subpaths = ds.flatMap((d) => parsePath(d));
} catch (e) {
  console.error(`path çözümlenemedi: ${e.message}`);
  process.exit(1);
}

const baked = bake(subpaths, { grid: GRID, long: LONG });

// --- teşhis -------------------------------------------------------------
const rings = flatten(subpaths);
const areas = rings.map(signedArea);
const dirs = areas.map((a) => (a > 0 ? "saat yönü" : "saat tersi"));
const mixedWinding = new Set(dirs).size > 1;

console.log(`kaynak    : ${path.relative(ROOT, srcPath)}`);
console.log(
  `bbox      : ${baked.source.w.toFixed(1)} × ${baked.source.h.toFixed(1)} ` +
    `(kaynak birimi)`,
);
console.log(
  `24 grid   : ${baked.width.toFixed(2)} × ${baked.height.toFixed(2)} ` +
    `@ x=${baked.x.toFixed(2)} y=${baked.y.toFixed(2)}`,
);
console.log(`alt-path  : ${subpaths.length} (${dirs.join(", ")})`);
console.log(
  `kapalı    : ${subpaths.every((s) => s.closed) ? "evet" : "HAYIR ⚠︎"}`,
);

if (subpaths.length > 1) {
  console.log(
    mixedWinding
      ? "delik     : sarım yönleri ters → nonzero ile delik AÇIK,\n" +
          "            react-native-svg varsayılanı yeterli (fillRule gerekmez)"
      : "delik     : sarım yönleri AYNI → nonzero'da delik KAPANIR,\n" +
          '            <Path fillRule="evenodd" /> ŞART',
  );
}

// --- yaz ya da önizle ---------------------------------------------------
if (!PREVIEW) {
  const outFile = path.join(
    ROOT,
    "src/shared/components/icons",
    `${name}Glyph.ts`,
  );
  const rel = path.relative(ROOT, srcPath);
  const body = `// Custom ${name} glyph'i — yalnız geometri, renk kararı yok. Kaynak:
// ${rel} (Recraft, ${/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? "?"} viewBox).
// Gerçek bezier bbox'ına göre 24×24 grid'ine bakelendi: uzun kenar ${LONG}
// (iki yanda 2 optik pay) → ${baked.width.toFixed(2)}×${baked.height.toFixed(2)} @ x=${baked.x.toFixed(2)} y=${baked.y.toFixed(2)}.
// Ölçek/öteleme path'in içine gömülü, \`transform\` yok.
//
// Ölçüyü değiştirmek istersen path'i elle oynama; kaynak SVG'yi yeniden
// bakele (\`node scripts/bake-glyph.js ${rel} --name ${name}\`) — aksi halde
// grid hizası ve optik pay bozulur.
export const ${CONST}_VIEWBOX = "0 0 ${GRID} ${GRID}";

export const ${CONST}_PATH =
  "${baked.d}";
`;
  fs.writeFileSync(outFile, body);
  console.log(`\nyazıldı   : ${path.relative(ROOT, outFile)}`);
  console.log(`export    : ${CONST}_PATH, ${CONST}_VIEWBOX`);
} else {
  const OUT_DIR = path.join(ROOT, ".icon-preview");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 24 grid'indeki path'i yeniden düzleştir (bakelenmiş koordinatlarla)
  const bakedRings = flatten(parsePath(baked.d));

  for (const px of [24, 48, 72]) {
    const k = px / GRID;
    const P = bakedRings.map((r) => r.map(([x, y]) => [x * k, y * k]));

    const rgba = Buffer.alloc(px * px * 4);
    let inkPx = 0;
    let holePx = 0;

    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        let hits = 0;
        let outerHits = 0;
        for (let sy = 0; sy < SS; sy++) {
          const py = y + (sy + 0.5) / SS;
          for (let sx = 0; sx < SS; sx++) {
            const pxs = x + (sx + 0.5) / SS;
            let wind = 0;
            let cross = 0;
            for (const ring of P) {
              const N = ring.length;
              for (let e = 0; e < N; e++) {
                const [x0, y0] = ring[e];
                const [x1, y1] = ring[(e + 1) % N];
                if (y0 <= py ? y1 > py : y1 <= py) {
                  const t = (py - y0) / (y1 - y0);
                  if (pxs < x0 + t * (x1 - x0)) {
                    cross++;
                    wind += y1 > y0 ? 1 : -1;
                  }
                }
              }
            }
            const inside = mixedWinding ? wind !== 0 : cross % 2 === 1;
            if (inside) hits++;
            // "dış halka içinde mi" — delik ölçmek için yalnız ilk halka
            if (P.length > 1) {
              const ring = P[0];
              let c0 = 0;
              for (let e = 0; e < ring.length; e++) {
                const [x0, y0] = ring[e];
                const [x1, y1] = ring[(e + 1) % ring.length];
                if (y0 <= py ? y1 > py : y1 <= py) {
                  const t = (py - y0) / (y1 - y0);
                  if (pxs < x0 + t * (x1 - x0)) c0++;
                }
              }
              if (c0 % 2 === 1) outerHits++;
            }
          }
        }
        const a = Math.round((hits / (SS * SS)) * 255);
        inkPx += hits / (SS * SS);
        if (P.length > 1) holePx += (outerHits - hits) / (SS * SS);
        const o = (y * px + x) * 4;
        // Opak siyah-üstüne-beyaz: şekli gözle kontrol etmek için
        rgba[o] = a;
        rgba[o + 1] = a;
        rgba[o + 2] = a;
        rgba[o + 3] = 255;
      }
    }

    writePNG(path.join(OUT_DIR, `${name}-${px}.png`), px, px, rgba);
    const holeNote =
      P.length > 1
        ? `, delik ${holePx.toFixed(1)}px²${holePx < 1 ? " ⚠︎ KAPANDI" : ""}`
        : "";
    console.log(`${px}px → mürekkep ${inkPx.toFixed(1)}px²${holeNote}`);
  }
  console.log(`\nönizleme  : ${path.relative(ROOT, OUT_DIR)}/`);
  console.log(
    "dosya YAZILMADI (PREVIEW=1). Şekil tamamsa PREVIEW'sız çalıştır.",
  );
}
