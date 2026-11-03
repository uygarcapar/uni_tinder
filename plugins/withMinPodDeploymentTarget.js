// Pod'ların IPHONEOS_DEPLOYMENT_TARGET'ını RN tabanına (15.1) ÇEKER (iOS).
//
// NEDEN: Üçüncü parti podspec'ler kendi (çoğu zaman yıllanmış) deployment
// target'larını beyan ediyor — bu projede 9.0/11.0/12.x/13.x diyen pod'lar var
// (Firebase bağımlılıkları vb.). CocoaPods bu değerleri OLDUĞU GİBİ Pods
// projesine yazıyor; Xcode 27 ise 15.0 altını desteklemiyor ve her birine
// "deployment target ... is set to 13.4, but the range of supported
// deployment target versions is 15.0 to 27.2" üretiyor.
//
// 15.1 SEÇİMİ: React Native 0.85'in kendi tabanı — Pods projesindeki RN
// pod'larının tamamı zaten 15.1. Uygulamanın kendisi 16.4 (Podfile platform)
// ama pod'ları 16.4'e çekmek gerekmiyor; amaç Xcode'un kabul ettiği aralığa
// girmek, davranış değiştirmek değil. 15.1 ÜSTÜNDEKİ beyanlara DOKUNULMUYOR.
//
// ⚠️ `ios/` gitignore'da ve prebuild'de yeniden üretiliyor — bu yüzden düzeltme
// Podfile'a elle değil bu plugin'le giriyor (withoutBackgroundFetch kalıbı).
// Podfile metnine, Expo şablonundaki `post_install do |installer|` satırının
// hemen altına bir Ruby bloğu enjekte ediyor. Şablon o satırı değiştirirse
// aşağıdaki uyarı basılır ve plugin SESSİZCE etkisiz kalmaz.

const { withPodfile } = require("@expo/config-plugins");

const MIN_IOS = "15.1";
const MARKER = "withMinPodDeploymentTarget";
const ANCHOR = /^([ \t]*)post_install do \|installer\|[ \t]*$/m;

const SNIPPET = (indent) =>
  [
    `${indent}  # ${MARKER}: Xcode'un desteklemediği eski pod hedeflerini tabana çek.`,
    `${indent}  bump_deployment_target = lambda do |config|`,
    `${indent}    current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']`,
    `${indent}    if current && Gem::Version.new(current.to_s) < Gem::Version.new('${MIN_IOS}')`,
    `${indent}      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'`,
    `${indent}    end`,
    `${indent}  end`,
    `${indent}  installer.pods_project.build_configurations.each(&bump_deployment_target)`,
    `${indent}  installer.pods_project.targets.each do |target|`,
    `${indent}    target.build_configurations.each(&bump_deployment_target)`,
    `${indent}  end`,
  ].join("\n");

const withMinPodDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;

    // İdempotent: prebuild aynı Podfile üstünde iki kez koşabiliyor.
    if (contents.includes(MARKER)) return cfg;

    const match = contents.match(ANCHOR);
    if (!match) {
      console.warn(
        `[${MARKER}] Podfile'da "post_install do |installer|" bulunamadı; ` +
          "Expo şablonu değişmiş olabilir. Pod deployment target'ları " +
          "ÇEKİLMEDİ — Xcode 15.0 altı hedefler için hata üretecek.",
      );
      return cfg;
    }

    cfg.modResults.contents = contents.replace(
      ANCHOR,
      `${match[0]}\n${SNIPPET(match[1])}`,
    );
    return cfg;
  });

module.exports = withMinPodDeploymentTarget;
