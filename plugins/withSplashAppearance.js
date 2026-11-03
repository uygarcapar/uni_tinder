// Native açılış ekranının TEMASINI uygulamanın tema tercihine bağlar (iOS).
//
// SORUN: SplashScreen.storyboard açık/koyu varyantlarını asset catalog'un
// `luminosity` trait'inden çözüyor (SplashScreenBackground.colorset,
// SplashScreenLogo/SplashScreenFooter.imageset). Trait ise pencerenin görünümü;
// biz onu JS'te `Appearance.setColorScheme` ile bastırana kadar SİSTEM görünümü.
// Sonuç: cihazı koyu olup uygulamada "Açık" seçmiş kullanıcı splash'i koyu
// görüyor, JS boot'ta (bkz. src/shared/theme/themeMode.ts modül gövdesi) açığa
// atlıyordu. "Sistem"/"Koyu" tercihlerinde zıplama yok — zaten aynı tema.
//
// ÇÖZÜM: tercih NSUserDefaults'a aynalanıyor (themeMode.ts → RN `Settings`,
// RCTSettingsManager standardUserDefaults'a yazıyor), burada da RN
// BAŞLAMADAN pencereye `overrideUserInterfaceStyle` basıyoruz.
//
// ── SCENE YAŞAM DÖNGÜSÜ (SDK 57+ / iOS 27) ────────────────────────────────
// Pencereyi artık AppDelegate KURMUYOR: `ExpoAppSceneDelegate` sceneConnect'te
// `UIWindow(windowScene:)` yaratıp `provider.window = window` ile AppDelegate'e
// AYNALIYOR ve ancak ondan sonra `startReactNative(in: window)` çağırıyor
// (node_modules/expo/ios/AppDelegates/ExpoAppSceneDelegate.swift). Yani
// didFinishLaunching'te `window` hep nil — override oraya yazılırsa ÖLÜ KOD
// olur (SDK 57 geçişinde birebir yaşandı). Bu yüzden enjeksiyon artık `var
// window` tanımının KENDİSİNE `didSet` olarak basılıyor: ayna yazıldığı anda,
// RN root view (ve expo-splash-screen'in storyboard kopyası) pencereye
// eklenmeden önce koşuyor.
//
// KAPSAM DIŞI: pre-main sistem launch ekranı. Onu SpringBoard, bizim hiçbir
// kodumuz çalışmadan önce çiziyor; görünümünü değiştirmenin tek yolu Info.plist
// UIUserInterfaceStyle'ı sabitlemek ki o da "Sistem" tercihini imkânsız
// kılardı. Kalan uyumsuzluk bu yüzden splash'in TAMAMI değil yalnız ilk ~200ms'si.
//
// Android YOK: oradaki splash teması values/ + values-night/ styles.xml'den
// geliyor ve gece modunu super.onCreate'den önce AppCompatDelegate ile
// zorlamak gerekir — ayrı iş.
//
// NEDEN CONFIG PLUGIN: `ios/` prebuild ürünü ve .gitignore'da; AppDelegate'i
// elle düzenlemek ilk `expo prebuild`de geri alınırdı.

const fs = require("fs");
const { withAppDelegate } = require("@expo/config-plugins");

// themeMode.ts ile AYNI anahtar. Değerler: "light" | "dark" | "system".
const DEFAULTS_KEY = "litThemeMode";

const BEGIN = "// @generated begin lit-splash-appearance";
const END = "// @generated end lit-splash-appearance";

// Şablondaki pencere TANIMI — blok bu satırın YERİNE geçiyor.
const ANCHOR = /^([ \t]*)var window: UIWindow\?$/m;

function snippet(indent) {
  const lines = [
    `${BEGIN} - DO NOT EDIT (plugins/withSplashAppearance.js)`,
    `// Splash temasını JS boot'tan ÖNCE bas: themeMode.ts tercihi NSUserDefaults'a`,
    `// aynalıyor. Pencereyi scene delegate kuruyor ve startReactNative'den ÖNCE`,
    `// buraya aynalıyor — didSet tam o anda, RN içeriği eklenmeden koşuyor.`,
    `// "system" → .unspecified: override basılmıyor, görünüm sistemden miras.`,
    `//`,
    `// ANAHTAR YOKSA .light: taze kurulumda ayna henüz yazılmamış oluyor ve`,
    `// themeMode.ts readPersisted() de seçim yapılmamış kullanıcıyı AÇIK`,
    `// kabul ediyor — iki varsayılan ayrışırsa ilk açılış yine flash eder.`,
    `var window: UIWindow? {`,
    `  didSet {`,
    `    guard let window else { return }`,
    `    switch UserDefaults.standard.string(forKey: "${DEFAULTS_KEY}") {`,
    `    case "dark": window.overrideUserInterfaceStyle = .dark`,
    `    case "system": window.overrideUserInterfaceStyle = .unspecified`,
    `    default: window.overrideUserInterfaceStyle = .light`,
    `    }`,
    `  }`,
    `}`,
    END,
  ];
  return lines.map((l) => `${indent}${l}`).join("\n");
}

/** AppDelegate.swift içeriğine override'ı ekler. Idempotent. */
function applyToAppDelegate(contents) {
  // Önceki bloğu (eski didFinishLaunching-içi biçim DAHİL) sök; blok pencere
  // tanımını yutmuşsa yerine sade tanımı koy ki aşağıdaki çapa yine bulunsun.
  if (contents.includes(BEGIN)) {
    const start = contents.indexOf(BEGIN);
    const lineStart = contents.lastIndexOf("\n", start) + 1;
    const indent = contents.slice(lineStart, start);
    const endIdx = contents.indexOf(END, start);
    if (endIdx === -1) {
      throw new Error(
        "AppDelegate'te lit-splash-appearance bloğu yarım kalmış — elle temizle",
      );
    }
    const endLineEnd = contents.indexOf("\n", endIdx);
    const block = contents.slice(lineStart, endIdx);
    const replacement = block.includes("var window")
      ? `${indent}var window: UIWindow?\n`
      : "";
    contents =
      contents.slice(0, lineStart) +
      replacement +
      contents.slice(endLineEnd + 1);
  }

  const m = contents.match(ANCHOR);
  if (!m) {
    throw new Error(
      "AppDelegate'te `var window: UIWindow?` bulunamadı — " +
        "Expo şablonu değişmiş, withSplashAppearance'ın çapasını güncelle",
    );
  }
  return contents.replace(ANCHOR, snippet(m[1]));
}

const withSplashAppearance = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error(
        `withSplashAppearance yalnız Swift AppDelegate destekliyor (bulundu: ${cfg.modResults.language})`,
      );
    }
    cfg.modResults.contents = applyToAppDelegate(cfg.modResults.contents);
    return cfg;
  });

module.exports = withSplashAppearance;
module.exports.applyToAppDelegate = applyToAppDelegate;
module.exports.DEFAULTS_KEY = DEFAULTS_KEY;

// Prebuild ÇALIŞTIRMADAN mevcut ios/ ağacına uygula (pod'lar yerindeyken sadece
// AppDelegate'i yamalamak için):
//   node plugins/withSplashAppearance.js ios/Lit/AppDelegate.swift
if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    throw new Error(
      "kullanım: node plugins/withSplashAppearance.js <ios/ProjeAdı/AppDelegate.swift>",
    );
  }
  fs.writeFileSync(file, applyToAppDelegate(fs.readFileSync(file, "utf8")));
  console.log(`güncellendi: ${file}`);
}
