// Native açılış ekranının ALT ORTASINA 4ourstack imzasını koyar (iOS).
//
// NEDEN CONFIG PLUGIN: `ios/` prebuild ürünü ve .gitignore'da — storyboard'ı
// elle düzenlemek ilk `expo prebuild`de geri alınırdı. expo-splash-screen
// storyboard'ı `mods.ios.splashScreenStoryboard` üzerinden veriyor; biz de
// aynı boru hattına takılıyoruz.
//
// !!! app.json'da bu plugin "expo-splash-screen"DEN ÖNCE yazılmak ZORUNDA !!!
// @expo/config-plugins'te SON kaydedilen mod İLK çalışır (withMod, action'dan
// sonra nextMod'u çağırıyor). expo-splash-screen'in kendi mod'u ise
// `mainView.constraints[0].constraint = []` ve `resources[0].image = []` ile
// listeleri SIFIRLIYOR — biz ondan önce çalışırsak imzanın kısıtları ve
// resource kaydı silinir, imageView ekranda 0×0 kalırdı. Sırayı bozarsa
// config-plugins zaten INVALID_MOD_ORDER ile patlar (provider en sonda).
//
// Android YOK: Android 12+ splash API'si tek ortalanmış ikon dışında bir şey
// çizdirmiyor, ikinci bir görsel için kanca sunmuyor.
//
// Varlıklar `node scripts/gen-fourstack.js` ile üretiliyor. Ekrandaki boyut
// oradan geliyor: storyboard boyut kısıtı taşımıyor, imageView intrinsic
// content size kullanıyor (1x PNG'nin pt karşılığı).

const fs = require("fs");
const path = require("path");
const { withDangerousMod, withMod } = require("@expo/config-plugins");

const IMAGE_NAME = "SplashScreenFooter";
const VIEW_ID = "FOURSTACK-SplashFooter";
const CONTAINER_ID = "EXPO-ContainerView";

// İmzanın güvenli alanın altına olan mesafesi. Home indicator'ın 34pt'si
// ÜSTÜNE biniyor (safeArea referans alınıyor), yani ekran dibine toplam ~58pt.
const BOTTOM_PT = 24;

// assets/fourstack içindeki dosya adı → imageset içindeki ad.
const ASSET_SOURCE_DIR = path.join(__dirname, "..", "assets", "fourstack");
const ASSETS = [
  { src: "splash-footer-light.png", out: "image.png", scale: "1x" },
  { src: "splash-footer-light@2x.png", out: "image@2x.png", scale: "2x" },
  { src: "splash-footer-light@3x.png", out: "image@3x.png", scale: "3x" },
  { src: "splash-footer-dark.png", out: "dark_image.png", scale: "1x", dark: true },
  { src: "splash-footer-dark@2x.png", out: "dark_image@2x.png", scale: "2x", dark: true },
  { src: "splash-footer-dark@3x.png", out: "dark_image@3x.png", scale: "3x", dark: true },
];

/** PNG başlığındaki IHDR'den piksel boyutu — kütüphane açmaya değmez. */
function pngSize(file) {
  const fd = fs.openSync(file, "r");
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

/** İmzayı asset catalog'a yazar (açık/koyu varyantlı imageset). */
function writeFooterImageSet(projectDir) {
  const dir = path.join(
    projectDir,
    "Images.xcassets",
    `${IMAGE_NAME}.imageset`,
  );
  fs.mkdirSync(dir, { recursive: true });
  for (const a of ASSETS) {
    const src = path.join(ASSET_SOURCE_DIR, a.src);
    if (!fs.existsSync(src)) {
      throw new Error(
        `${a.src} yok — önce \`node scripts/gen-fourstack.js\` çalıştır`,
      );
    }
    fs.copyFileSync(src, path.join(dir, a.out));
  }
  fs.writeFileSync(
    path.join(dir, "Contents.json"),
    `${JSON.stringify(
      {
        images: ASSETS.map((a) => ({
          idiom: "universal",
          // Koyu varyant `luminosity` trait'iyle seçiliyor — SplashScreenLogo
          // ile AYNI mekanizma, yani imza logo ile hep aynı temada.
          ...(a.dark
            ? { appearances: [{ appearance: "luminosity", value: "dark" }] }
            : null),
          filename: a.out,
          scale: a.scale,
        })),
        info: { version: 1, author: "expo" },
      },
      null,
      2,
    )}\n`,
  );
}

/** Aynı id'li düğümü değiştirerek ekler (IB'de id benzersiz olmak zorunda). */
function upsert(array, item) {
  const i = array.findIndex((e) => e.$ && e.$.id === item.$.id);
  if (i > -1) array.splice(i, 1, item);
  else array.push(item);
}

/** Parse edilmiş storyboard XML'ine imzayı ekler. */
function applyFooterToStoryboard(xml, size) {
  const mainView =
    xml.document.scenes[0].scene[0].objects[0].viewController[0].view[0];

  // Güvenli alan kılavuzu şablondan geliyor; yoksa kendimiz açıyoruz (id
  // sabit, çalıştırmalar arası kısıtlar oynamasın).
  if (!mainView.viewLayoutGuide) mainView.viewLayoutGuide = [];
  let safeArea = mainView.viewLayoutGuide.find(
    (g) => g.$ && g.$.key === "safeArea",
  );
  if (!safeArea) {
    safeArea = { $: { key: "safeArea", id: `${VIEW_ID}-safeArea` } };
    mainView.viewLayoutGuide.push(safeArea);
  }

  const frame = mainView.rect && mainView.rect[0];
  const canvasW = frame ? Number(frame.$.width) : 393;
  const canvasH = frame ? Number(frame.$.height) : 852;

  mainView.subviews = mainView.subviews || [{}];
  mainView.subviews[0].imageView = mainView.subviews[0].imageView || [];
  upsert(mainView.subviews[0].imageView, {
    $: {
      id: VIEW_ID,
      userLabel: IMAGE_NAME,
      image: IMAGE_NAME,
      contentMode: "scaleAspectFit",
      clipsSubviews: true,
      userInteractionEnabled: false,
      translatesAutoresizingMaskIntoConstraints: false,
    },
    // Yalnız IB'nin tuval önizlemesi için; çalışma zamanında kısıtlar +
    // intrinsic content size belirliyor. 34 = home indicator payı.
    rect: [
      {
        $: {
          key: "frame",
          x: (canvasW - size.width) / 2,
          y: canvasH - 34 - BOTTOM_PT - size.height,
          width: size.width,
          height: size.height,
        },
      },
    ],
  });

  // Boyut kısıtı BİLEREK yok: imageView intrinsic content size'ıyla yerleşiyor,
  // yani gen-fourstack.js'te WIDTH_PT'yi değiştirmek tek başına yetiyor.
  mainView.constraints = mainView.constraints || [{}];
  mainView.constraints[0].constraint = mainView.constraints[0].constraint || [];
  upsert(mainView.constraints[0].constraint, {
    $: {
      firstItem: VIEW_ID,
      firstAttribute: "centerX",
      secondItem: CONTAINER_ID,
      secondAttribute: "centerX",
      id: `${VIEW_ID}-centerX`,
    },
  });
  upsert(mainView.constraints[0].constraint, {
    $: {
      firstItem: VIEW_ID,
      firstAttribute: "bottom",
      secondItem: safeArea.$.id,
      secondAttribute: "bottom",
      constant: -BOTTOM_PT,
      id: `${VIEW_ID}-bottom`,
    },
  });

  const resources = xml.document.resources && xml.document.resources[0];
  if (resources) {
    resources.image = resources.image || [];
    const i = resources.image.findIndex((r) => r.$ && r.$.name === IMAGE_NAME);
    const entry = {
      $: { name: IMAGE_NAME, width: size.width, height: size.height },
    };
    if (i > -1) resources.image.splice(i, 1, entry);
    else resources.image.push(entry);
  }

  return xml;
}

/** 1x varlıktan ekrandaki pt boyutu (1pt = 1px @1x). */
function footerSize() {
  return pngSize(path.join(ASSET_SOURCE_DIR, "splash-footer-light.png"));
}

const withSplashFooter = (config) => {
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      writeFooterImageSet(
        path.join(
          cfg.modRequest.platformProjectRoot,
          cfg.modRequest.projectName,
        ),
      );
      return cfg;
    },
  ]);
  return withMod(config, {
    platform: "ios",
    mod: "splashScreenStoryboard",
    action(cfg) {
      cfg.modResults = applyFooterToStoryboard(cfg.modResults, footerSize());
      return cfg;
    },
  });
};

module.exports = withSplashFooter;
module.exports.writeFooterImageSet = writeFooterImageSet;
module.exports.applyFooterToStoryboard = applyFooterToStoryboard;

// Prebuild ÇALIŞTIRMADAN mevcut ios/ ağacına uygula — pod'lar yerindeyken
// sadece splash'i tazelemek için:
//   node plugins/withSplashFooter.js ios/Lit
if (require.main === module) {
  const projectDir = process.argv[2];
  if (!projectDir) throw new Error("kullanım: node plugins/withSplashFooter.js <ios/ProjeAdı>");
  const { Parser, Builder } = require("xml2js");
  const storyboard = path.join(projectDir, "SplashScreen.storyboard");
  writeFooterImageSet(projectDir);
  new Parser()
    .parseStringPromise(fs.readFileSync(storyboard, "utf8"))
    .then((xml) => {
      const out = new Builder({
        preserveChildrenOrder: true,
        xmldec: { version: "1.0", encoding: "UTF-8" },
        renderOpts: { pretty: true, indent: "    " },
      }).buildObject(applyFooterToStoryboard(xml, footerSize()));
      fs.writeFileSync(storyboard, out);
      console.log(`güncellendi: ${storyboard}`);
    });
}
