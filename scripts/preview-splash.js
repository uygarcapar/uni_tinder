// Native splash'i BUILD ALMADAN önizler: storyboard'daki kısıtları birebir
// kopyalayan bir HTML üretip tarayıcıda açar (açık + koyu yan yana).
//
// Neden HTML: önizlemenin tek zor parçası "developed by" — repoda font
// rasterleştirici yok, PNG'ye çizemiyoruz. Tarayıcı `-apple-system` ile aynı SF
// fontunu aynı punto'da diziyor, yani metin de dahil her şey gerçek boyutunda
// görünüyor. CSS px = pt (1x), ölçüler storyboard'la aynı sayılar.
//
// UYARI: bu bir SİMÜLASYON, storyboard'ın kendisi değil. Ölçü/renk/konum
// doğrulaması için güvenilir; kesin sonuç yine cihazdaki launch screen.
//
//   node scripts/preview-splash.js
//
// Kaynak boyutlar: app.json > expo-splash-screen imageWidth (ortadaki logo) ve
// scripts/gen-fourstack.js > WIDTH_PT (alttaki imza). Değiştirince önce
// gen-fourstack.js'i çalıştır, sonra burayı.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".splash-preview.html");

const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
const splash = app.expo.plugins.find(
  (p) => Array.isArray(p) && p[0] === "expo-splash-screen",
)[1];

// Yerleşim sayıları storyboard'ı yazan plugin'den okunuyor — kopyalasaydık
// önizleme ile gerçek splash sessizce ayrışırdı.
const {
  SAFE_BOTTOM_PT,
  BOTTOM_PT,
  LOGO_RISE_PT,
  LABEL_TEXT,
  LABEL_SIZE_PT,
  LABEL_GAP_PT,
  LABEL_INK: INK,
} = require(path.join(ROOT, "plugins/withSplashLayout.js")).LAYOUT;
const LABEL_INK = `rgb(${INK.join(",")})`;

const dataUri = (rel) =>
  `data:image/png;base64,${fs.readFileSync(path.join(ROOT, rel)).toString("base64")}`;

/** 1x PNG'nin piksel boyutu = ekrandaki pt boyutu (intrinsic content size). */
const pngSize = (rel) => {
  const b = Buffer.alloc(24);
  const fd = fs.openSync(path.join(ROOT, rel), "r");
  fs.readSync(fd, b, 0, 24, 0);
  fs.closeSync(fd);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const mark = pngSize("assets/fourstack/splash-footer-light.png");
const THEMES = [
  {
    name: "light",
    bg: splash.backgroundColor,
    logo: splash.image,
    footer: "assets/fourstack/splash-footer-light@3x.png",
  },
  {
    name: "dark",
    bg: splash.dark.backgroundColor,
    logo: splash.dark.image,
    footer: "assets/fourstack/splash-footer-dark@3x.png",
  },
];

const screen = (t) => `
  <figure>
    <div class="screen" style="background:${t.bg}">
      <img class="logo" src="${dataUri(t.logo)}" alt="">
      <div class="footer">
        <span class="cap">${LABEL_TEXT}</span>
        <img class="mark" src="${dataUri(t.footer)}" alt="">
      </div>
      <div class="home" style="background:${t.name === "dark" ? "#FFF" : "#000"}"></div>
    </div>
    <figcaption>${t.name} — logo ${splash.imageWidth}pt · imza ${mark.w}×${mark.h}pt</figcaption>
  </figure>`;

fs.writeFileSync(
  OUT,
  `<!doctype html><meta charset="utf-8"><title>splash önizleme</title>
<style>
  body{margin:0;padding:40px;display:flex;gap:40px;justify-content:center;
       background:#6b6b70;font:13px -apple-system,system-ui,sans-serif}
  figure{margin:0}
  figcaption{margin-top:12px;text-align:center;color:#fff;opacity:.8}
  /* 393×852 = iPhone 15/16 pt ölçüsü; CSS px = pt (1x). */
  .screen{position:relative;width:393px;height:852px;border-radius:47px;
          overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35)}
  /* imageWidth kutusu ortalanmış, ${LOGO_RISE_PT}pt optik kaydırmayla —
     storyboard: centerX + centerY(constant ${-LOGO_RISE_PT}) */
  .logo{position:absolute;left:50%;top:50%;
        transform:translate(-50%,calc(-50% - ${LOGO_RISE_PT}px));
        width:${splash.imageWidth}px}
  /* imza bloğu: markanın ALTI güvenli alanın ${BOTTOM_PT}pt üstünde */
  .footer{position:absolute;left:0;right:0;bottom:${SAFE_BOTTOM_PT + BOTTOM_PT}px;
          display:flex;flex-direction:column;align-items:center;gap:${LABEL_GAP_PT}px}
  .cap{font-size:${LABEL_SIZE_PT}px;line-height:1;color:${LABEL_INK}}
  .mark{width:${mark.w}px;height:${mark.h}px}
  .home{position:absolute;left:50%;transform:translateX(-50%);bottom:8px;
        width:139px;height:5px;border-radius:3px;opacity:.85}
</style>
${THEMES.map(screen).join("")}
`,
);

console.log(`yazıldı: ${path.relative(ROOT, OUT)}`);
try {
  execFileSync("open", [OUT]);
} catch {
  console.log("tarayıcıda aç: " + OUT);
}
