// Glyph sabitlerinden tab bar ikonlarını üretir: dolu (focused) + outline (idle).
// Outline elle çizilmedi, dolu siluetten mesafe alanıyla türetiliyor:
//   içeride VE kenara uzaklık <= STROKE_PT  → mürekkep
// Bu "inner stroke" — dış siluet korunur, yani iki varyantın bbox'ı birebir
// aynıdır ve sekme değişince ikon zıplamaz. Köşe birleşimleri doğal yuvarlak.
//
// PREVIEW=1 ile siyah-üstüne-beyaz opak önizleme basar (şekli gözle kontrol).

const fs = require("fs");
const path = require("path");
const { parsePath, flatten } = require("./lib/glyphPath");
const { writePNG } = require("./lib/png");

const CANVAS_PT = 28; // ikon kutusu
const GLYPH_PT = 22; // glyph'in UZUN kenarı (alevde yükseklik, kalpte genişlik)
const STROKE_PT = 2; // outline kalınlığı (SF tab ikonlarına yakın)
const SS = 4; // pixel başına supersample (4×4)

const ROOT = path.resolve(__dirname, "..");
const PREVIEW = process.env.PREVIEW === "1";
const OUT_DIR = PREVIEW
  ? path.join(ROOT, ".icon-preview")
  : path.join(ROOT, "assets/icons");
const MUL = PREVIEW ? 3 : 1; // önizlemeyi büyüt (siyah/opak, gözle kontrol için)

// Sekmesi native tab bar'da özel glyph kullanan ekranlar. Her ikisi de TEK
// kapalı alt-path olmak zorunda (aşağıdaki `(e+1)%N` sarmalı tek halka
// varsayıyor) — delikli bir glyph (ör. NoteGlyph'in oyulmuş kalbi) buradan
// GEÇMEZ, deliği dolu çizer.
const GLYPHS = [
  { file: "FlameGlyph.ts", constName: "FLAME_PATH", out: "flame-tab" },
  { file: "HeartGlyph.ts", constName: "HEART_PATH", out: "heart-tab" },
];

const segDist2 = (px, py, x0, y0, x1, y1) => {
  const dx = x1 - x0,
    dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ax = px - (x0 + t * dx),
    ay = py - (y0 + t * dy);
  return ax * ax + ay * ay;
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const glyph of GLYPHS) {
  const D = fs
    .readFileSync(
      path.join(ROOT, "src/shared/components/icons", glyph.file),
      "utf8",
    )
    .match(new RegExp(`${glyph.constName}\\s*=\\s*\\n?\\s*"([^"]+)"`))[1];

  const poly = flatten(parsePath(D), 48)[0];

  // bbox bilerek düzleştirilmiş halkadan alınıyor, analitik pathBBox'tan değil:
  // committed tab PNG'leri bu değerlerle üretildi, analitik bbox birkaç binde
  // birlik büyür ve ikonlar görünmez biçimde kayardı.
  let gx0 = Infinity,
    gx1 = -Infinity,
    gy0 = Infinity,
    gy1 = -Infinity;
  for (const [x, y] of poly) {
    gx0 = Math.min(gx0, x);
    gx1 = Math.max(gx1, x);
    gy0 = Math.min(gy0, y);
    gy1 = Math.max(gy1, y);
  }
  const gw = gx1 - gx0,
    gh = gy1 - gy0;
  // Ölçek UZUN kenardan: alev dikey (gh), kalp yatay (gw). Yükseklikten
  // ölçeklemek kalbi 26pt genişliğe taşırıp 28'lik kutuya sıvardı. Alev için
  // uzun kenar zaten gh, yani mevcut PNG'ler birebir aynı çıkıyor.
  const glyphLong = Math.max(gw, gh);

  for (const scale of [1, 2, 3]) {
    const px = CANVAS_PT * scale * MUL;
    const s = (GLYPH_PT * scale * MUL) / glyphLong;
    const ox = (px - gw * s) / 2 - gx0 * s;
    const oy = (px - gh * s) / 2 - gy0 * s;
    const strokePx = STROKE_PT * scale * MUL;
    const stroke2 = strokePx * strokePx;

    const P = poly.map(([x, y]) => [x * s + ox, y * s + oy]);
    const N = P.length;

    const fill = Buffer.alloc(px * px * 4);
    const line = Buffer.alloc(px * px * 4);

    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        let hitFill = 0,
          hitLine = 0;
        for (let sy = 0; sy < SS; sy++) {
          const py = y + (sy + 0.5) / SS;
          for (let sx = 0; sx < SS; sx++) {
            const pxs = x + (sx + 0.5) / SS;
            let wind = 0;
            for (let e = 0; e < N; e++) {
              const [x0, y0] = P[e],
                [x1, y1] = P[(e + 1) % N];
              const cr = (x1 - x0) * (py - y0) - (pxs - x0) * (y1 - y0);
              if (y0 <= py) {
                if (y1 > py && cr > 0) wind++;
              } else if (y1 <= py && cr < 0) wind--;
            }
            if (wind === 0) continue;
            hitFill++;
            // içerideyiz — kenara uzaklık stroke'tan küçükse outline'a da gir
            let best = Infinity;
            for (let e = 0; e < N; e++) {
              const [x0, y0] = P[e],
                [x1, y1] = P[(e + 1) % N];
              const d2 = segDist2(pxs, py, x0, y0, x1, y1);
              if (d2 < best) {
                best = d2;
                if (best <= stroke2) break;
              }
            }
            if (best <= stroke2) hitLine++;
          }
        }
        const o = (y * px + x) * 4;
        const put = (buf, hits) => {
          const a = Math.round((hits / (SS * SS)) * 255);
          if (PREVIEW) {
            buf[o] = 255 - a;
            buf[o + 1] = 255 - a;
            buf[o + 2] = 255 - a;
            buf[o + 3] = 255;
          } else {
            buf[o] = 255;
            buf[o + 1] = 255;
            buf[o + 2] = 255;
            buf[o + 3] = a;
          }
        };
        put(fill, hitFill);
        put(line, hitLine);
      }
    }

    const sfx = scale === 1 ? "" : `@${scale}x`;
    writePNG(path.join(OUT_DIR, `${glyph.out}${sfx}.png`), px, px, fill);
    writePNG(
      path.join(OUT_DIR, `${glyph.out}-outline${sfx}.png`),
      px,
      px,
      line,
    );
    console.log(
      `${glyph.out} ${scale}x → ${px}×${px}px, stroke ${strokePx.toFixed(2)}px`,
    );
  }
}
console.log(PREVIEW ? "önizleme: " + OUT_DIR : "yazıldı: " + OUT_DIR);
