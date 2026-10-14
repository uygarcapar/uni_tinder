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
// BAŞLAMADAN pencereye `overrideUserInterfaceStyle` basıyoruz. expo-splash-screen
// storyboard'ı RN root view'ının `loadingView`'ı olarak yeniden instantiate
// ediyor (SplashScreenManager.swift) — yani o kopya pencerenin trait'ini miras
// alıyor ve artık ilk frame'inden itibaren doğru temada çiziliyor.
//
// KAPSAM DIŞI: pre-main sistem launch ekranı. Onu SpringBoard, bizim hiçbir
// kodumuz çalışmadan önce çiziyor; görünümünü değiştirmenin tek yolu Info.plist
// UIUserInterfaceStyle'ı sabitlemek ki o da "Sistem" tercihini imkânsız
// kılardı (override basılıyken gerçek sistem görünümü okunamıyor). Kalan
// uyumsuzluk bu yüzden splash'in TAMAMI değil yalnız ilk ~200ms'si.
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

// Pencerenin yaratıldığı satır — enjeksiyon tam buradan SONRA olmak zorunda:
// öncesinde `window` nil, sonrasında `factory.startReactNative(... in: window)`
// çağrılıp storyboard kopyası ekleniyor.
const ANCHOR = /^([ \t]*)window = UIWindow\(frame: UIScreen\.main\.bounds\)$/m;

function snippet(indent) {
  const lines = [
    `${BEGIN} - DO NOT EDIT (plugins/withSplashAppearance.js)`,
    `// Splash temasını JS boot'tan ÖNCE bas: themeMode.ts tercihi`,
    `// NSUserDefaults'a aynalıyor. "system" → .unspecified, yani override`,
    `// basılmıyor ve pencere görünümü sistemden miras kalıyor.`,
    `//`,
    `// ANAHTAR YOKSA .light: taze kurulumda ayna henüz yazılmamış oluyor ve`,
    `// themeMode.ts readPersisted() de seçim yapılmamış kullanıcıyı AÇIK`,
    `// kabul ediyor — iki varsayılan ayrışırsa ilk açılış yine flash eder.`,
    `switch UserDefaults.standard.string(forKey: "${DEFAULTS_KEY}") {`,
    `case "dark": window?.overrideUserInterfaceStyle = .dark`,
    `case "system": window?.overrideUserInterfaceStyle = .unspecified`,
    `default: window?.overrideUserInterfaceStyle = .light`,
    `}`,
    END,
  ];
  return lines.map((l) => `${indent}${l}`).join("\n");
}

/** AppDelegate.swift içeriğine override'ı ekler. Idempotent. */
function applyToAppDelegate(contents) {
  // Daha önce basılmışsa bloğu yerinde tazele (sabitler değişmiş olabilir).
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
    return (
      contents.slice(0, lineStart) +
      snippet(indent) +
      contents.slice(endIdx + END.length)
    );
  }

  const m = contents.match(ANCHOR);
  if (!m) {
    throw new Error(
      "AppDelegate'te `window = UIWindow(frame: UIScreen.main.bounds)` bulunamadı — " +
        "Expo şablonu değişmiş, withSplashAppearance'ın çapasını güncelle",
    );
  }
  return contents.replace(ANCHOR, `${m[0]}\n${snippet(m[1])}`);
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
