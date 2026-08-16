// FLAME_PATH'ten tab bar ikonlarını üretir: dolu (focused) + outline (idle).
// Outline elle çizilmedi, dolu siluetten mesafe alanıyla türetiliyor:
//   içeride VE kenara uzaklık <= STROKE_PT  → mürekkep
// Bu "inner stroke" — dış siluet korunur, yani iki varyantın bbox'ı birebir
// aynıdır ve sekme değişince ikon zıplamaz. Köşe birleşimleri doğal yuvarlak.
//
// PREVIEW=1 ile siyah-üstüne-beyaz opak önizleme basar (şekli gözle kontrol).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CANVAS_PT = 28; // ikon kutusu
const GLYPH_H_PT = 22; // alevin kutu içindeki yüksekliği
const STROKE_PT = 2; // outline kalınlığı (SF tab ikonlarına yakın)
const SS = 4; // pixel başına supersample (4×4)

const ROOT = path.resolve(__dirname, "..");
const PREVIEW = process.env.PREVIEW === "1";
const OUT_DIR = PREVIEW
  ? path.join(ROOT, ".icon-preview")
  : path.join(ROOT, "assets/icons");
const MUL = PREVIEW ? 3 : 1; // önizlemeyi büyüt (siyah/opak, gözle kontrol için)

const D = fs
  .readFileSync(
    path.join(ROOT, "src/shared/components/icons/FlameGlyph.ts"),
    "utf8",
  )
  .match(/FLAME_PATH\s*=\s*\n?\s*"([^"]+)"/)[1];

// --- parse (M / C / Z, absolute) ---------------------------------------
const tokens = D.match(/[MCZ]|-?\d*\.?\d+/gi);
const cubics = [];
let i = 0,
  cur = null,
  start = null;
while (i < tokens.length) {
  const t = tokens[i];
  if (t === "M") {
    cur = [+tokens[i + 1], +tokens[i + 2]];
    start = cur;
    i += 3;
  } else if (t === "C") {
    i += 1;
    while (i < tokens.length && !/[MCZ]/i.test(tokens[i])) {
      const p1 = [+tokens[i], +tokens[i + 1]];
      const p2 = [+tokens[i + 2], +tokens[i + 3]];
      const p3 = [+tokens[i + 4], +tokens[i + 5]];
      cubics.push([cur, p1, p2, p3]);
      cur = p3;
      i += 6;
    }
  } else {
    cur = start;
    i += 1;
  }
}

const STEPS = 48;
const poly = [];
for (const [p0, p1, p2, p3] of cubics) {
  for (let k = 1; k <= STEPS; k++) {
    const t = k / STEPS,
      u = 1 - t;
    poly.push([
      u * u * u * p0[0] +
        3 * u * u * t * p1[0] +
        3 * u * t * t * p2[0] +
        t * t * t * p3[0],
      u * u * u * p0[1] +
        3 * u * u * t * p1[1] +
        3 * u * t * t * p2[1] +
        t * t * t * p3[1],
    ]);
  }
}

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

// --- PNG ---------------------------------------------------------------
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let n = 0; n < b.length; n++) c = CRC_T[(c ^ b[n]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const writePNG = (file, w, h, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++)
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
};

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

for (const scale of [1, 2, 3]) {
  const px = CANVAS_PT * scale * MUL;
  const s = (GLYPH_H_PT * scale * MUL) / gh;
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
  writePNG(path.join(OUT_DIR, `flame-tab${sfx}.png`), px, px, fill);
  writePNG(path.join(OUT_DIR, `flame-tab-outline${sfx}.png`), px, px, line);
  console.log(`${scale}x → ${px}×${px}px, stroke ${strokePx.toFixed(2)}px`);
}
console.log(PREVIEW ? "önizleme: " + OUT_DIR : "yazıldı: " + OUT_DIR);
