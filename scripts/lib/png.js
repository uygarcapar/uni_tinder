// Bağımlılıksız minimal PNG yazıcı/okuyucu (RGBA8, tek IDAT).
// gen-tab-icons.js'ten çıkarıldı; artık bake-glyph.js ve gen-splash.js de
// kullanıyor. Bir görüntü kütüphanesi eklememek bilinçli: repo'da sharp/canvas
// yok ve bu iş için zlib yeterli.

const fs = require("fs");
const zlib = require("zlib");

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

/** @param rgba w*h*4 baytlık RGBA tamponu */
function writePNG(file, w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 6; // renk tipi: RGBA
  const raw = Buffer.alloc(h * (1 + w * 4)); // her satır başına filtre baytı (0)
  for (let y = 0; y < h; y++) {
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/**
 * Minimal PNG okuyucu — 8 bit, interlace'siz, renk tipi 2 (RGB) veya 6 (RGBA).
 * Repo'daki kaynak görseller (Figma/`sips` çıktısı) hep bu ikisinden biri;
 * palet/gri/16-bit gelirse sessizce yanlış çizmek yerine patlıyor.
 *
 * @returns {{ w: number, h: number, rgba: Buffer }} straight (premultiplied
 * OLMAYAN) alfa — kanal ayırıp mürekkep rengini değiştirmek bu yüzden güvenli.
 */
function readPNG(file) {
  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const depth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (depth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `${file}: desteklenmeyen PNG (depth=${depth} colorType=${colorType} interlace=${interlace})`,
    );
  }

  // IDAT tek parça olmak zorunda değil; kodlayıcılar 16 KB'lik dilimlere böler.
  const idat = [];
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));

  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const cur = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  const rgba = Buffer.alloc(w * h * 4);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    // PNG satır filtreleri (spec §9.2). Sol komşu bpp bayt geride.
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) {
        throw new Error(`${file}: bilinmeyen satır filtresi ${filter}`);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp;
      const d = (y * w + x) << 2;
      rgba[d] = cur[s];
      rgba[d + 1] = cur[s + 1];
      rgba[d + 2] = cur[s + 2];
      rgba[d + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    cur.copy(prev);
  }

  return { w, h, rgba };
}

module.exports = { writePNG, readPNG };
