// e2e fotoğraf fixture'larını üretir: `npm run e2e:fixtures`.
//
// Neden üretiliyor, repoda tutulmuyor: binary dosya commit'lemeden kaçınmak
// ve ölçüyü tek yerden değiştirebilmek için. Çıktı e2e/fixtures/ (gitignore'da
// değil ama .jpg'ler üretilebilir olduğu için takip edilmiyorlar).
//
// ÖLÇÜ KARARI: 900×1200 (3:4) — kırpıcının çıktı ölçüsüyle aynı. Kayıt Step15
// min 2 / max 6 fotoğraf istiyor (formSchemas.ts:311), o yüzden 6 tane
// üretiliyor; ayrıca botlar için 6 tane daha (bot-*.jpg).
//
// Her kare DÜZ RENK + büyük bir numara taşıyor: başarısız koşunun ekran
// görüntüsünde hangi fotoğrafın/hangi botun kartı olduğu GÖZLE okunabilsin.
// Numara basit bir 7-segment ızgarasıyla çiziliyor; font bağımlılığı yok.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { writePNG } = require('./lib/png');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'e2e', 'fixtures');

const W = 900;
const H = 1200;

// Ayırt edici ve birbirine karışmayan renkler (koyu zemin + beyaz mürekkep).
const USER_COLORS = [
  [38, 70, 83],
  [42, 157, 143],
  [138, 177, 125],
  [233, 196, 106],
  [244, 162, 97],
  [231, 111, 81],
];
const BOT_COLORS = [
  [69, 56, 100],
  [100, 56, 90],
  [56, 72, 100],
  [100, 84, 56],
  [56, 100, 78],
  [92, 64, 64],
];

// 7-segment: her hane için hangi segmentler yanık.
// Segment sırası: üst, sol-üst, sağ-üst, orta, sol-alt, sağ-alt, alt.
const SEGMENTS = {
  0: [1, 1, 1, 0, 1, 1, 1],
  1: [0, 0, 1, 0, 0, 1, 0],
  2: [1, 0, 1, 1, 1, 0, 1],
  3: [1, 0, 1, 1, 0, 1, 1],
  4: [0, 1, 1, 1, 0, 1, 0],
  5: [1, 1, 0, 1, 0, 1, 1],
  6: [1, 1, 0, 1, 1, 1, 1],
  7: [1, 0, 1, 0, 0, 1, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};

function fillRect(rgba, x0, y0, w, h, [r, g, b]) {
  for (let y = y0; y < y0 + h; y += 1) {
    if (y < 0 || y >= H) continue;
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= W) continue;
      const i = (y * W + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
}

/** Haneyi 7-segment olarak çizer. */
function drawDigit(rgba, digit, cx, cy, size, ink) {
  const on = SEGMENTS[digit];
  if (!on) return;
  const t = Math.round(size * 0.16); // çizgi kalınlığı
  const w = size;
  const h = size * 1.8;
  const left = Math.round(cx - w / 2);
  const top = Math.round(cy - h / 2);
  const mid = Math.round(top + h / 2 - t / 2);
  const bottom = Math.round(top + h - t);

  if (on[0]) fillRect(rgba, left, top, w, t, ink);
  if (on[1]) fillRect(rgba, left, top, t, Math.round(h / 2), ink);
  if (on[2]) fillRect(rgba, left + w - t, top, t, Math.round(h / 2), ink);
  if (on[3]) fillRect(rgba, left, mid, w, t, ink);
  if (on[4]) fillRect(rgba, left, mid, t, Math.round(h / 2), ink);
  if (on[5]) fillRect(rgba, left + w - t, mid, t, Math.round(h / 2), ink);
  if (on[6]) fillRect(rgba, left, bottom, w, t, ink);
}

function makeFrame(label, color) {
  const rgba = Buffer.alloc(W * H * 4);
  fillRect(rgba, 0, 0, W, H, color);

  const ink = [255, 255, 255];
  // Kenar çerçevesi: kırpıcının pencereyi nereye oturttuğu gözle görülsün.
  const b = 10;
  fillRect(rgba, 0, 0, W, b, ink);
  fillRect(rgba, 0, H - b, W, b, ink);
  fillRect(rgba, 0, 0, b, H, ink);
  fillRect(rgba, W - b, 0, b, H, ink);

  // Etiket hanelerini ortala.
  const digits = String(label).split('').map(Number);
  const size = 220;
  const gap = Math.round(size * 0.45);
  const totalW = digits.length * size + (digits.length - 1) * gap;
  let x = Math.round(W / 2 - totalW / 2 + size / 2);
  for (const d of digits) {
    drawDigit(rgba, d, x, Math.round(H / 2), size, ink);
    x += size + gap;
  }
  return rgba;
}

/**
 * PNG → JPEG. `sips` macOS'ta yerleşik; e2e'ye bir görüntü kütüphanesi
 * bağımlılığı eklemiyoruz. Galeri tohumlaması (`simctl addmedia`) PNG de kabul
 * ediyor ama kayıt akışı JPEG üretiyor, fixture'lar da ona benzemeli.
 */
function toJpeg(pngPath, jpgPath) {
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', pngPath, '--out', jpgPath], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  fs.unlinkSync(pngPath);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const made = [];
for (let i = 0; i < USER_COLORS.length; i += 1) {
  const png = path.join(OUT_DIR, `photo-${i + 1}.png`);
  const jpg = path.join(OUT_DIR, `photo-${i + 1}.jpg`);
  writePNG(png, W, H, makeFrame(i + 1, USER_COLORS[i]));
  toJpeg(png, jpg);
  made.push(jpg);
}
for (let i = 0; i < BOT_COLORS.length; i += 1) {
  const png = path.join(OUT_DIR, `bot-${i + 1}.png`);
  const jpg = path.join(OUT_DIR, `bot-${i + 1}.jpg`);
  writePNG(png, W, H, makeFrame(i + 1, BOT_COLORS[i]));
  toJpeg(png, jpg);
  made.push(jpg);
}

const totalKb = made.reduce((s, f) => s + fs.statSync(f).size, 0) / 1024;
console.log(
  `[fixtures] ${made.length} dosya, ${W}×${H}, toplam ${totalKb.toFixed(0)} KB → ${path.relative(ROOT, OUT_DIR)}`
);
console.log('[fixtures] galeriye yüklemek için: npm run e2e:boot');
