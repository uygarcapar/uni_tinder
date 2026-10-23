// `UIBackgroundModes`ten "fetch"i SÖKER (iOS).
//
// NEDEN: `expo-task-manager`ın kendi config plugin'i onu KOŞULSUZ ekliyor
// (node_modules/expo-task-manager/plugin/build/withTaskManager.js — dizide
// yoksa push ediyor, hangi görev tipini kullandığımıza bakmıyor). Biz
// TaskManager'ı YALNIZ geofencing için kullanıyoruz ve iOS'ta region
// monitoring hiçbir arka plan modu İSTEMİYOR: bölge olayında işletim sistemi
// uygulamayı konum çatısı üzerinden kendisi uyandırıyor. Background Fetch
// görevimiz yok, `expo-background-fetch` kurulu da değil.
//
// !!! BU YÜZDEN ÖNEMLİ: App Store yönergesi 2.5.4 — kullanılmayan bir arka
// plan modu beyan etmek. Bu projede 1.0(36) tam bu maddeden reddedildi
// (`expo-audio`nun `enableBackgroundPlayback` varsayılanı bir arka plan modu
// ekliyordu). "fetch" aynı hatanın ikinci kopyasıydı: app.json'da
// `UIBackgroundModes: ["remote-notification"]` yazarken derlenen Info.plist'te
// `["remote-notification", "fetch"]` çıkıyordu — yani beyanı app.json'a
// bakarak denetlemek YETMİYOR.
//
// !!! app.json'da bu plugin "expo-task-manager"DAN ÖNCE yazılmak ZORUNDA !!!
// Ters geliyor ve ilk denemede ters yazıp doğruladım: @expo/config-plugins'te
// SON kaydedilen mod İLK çalışır (withMod, action'dan sonra nextMod'u
// çağırıyor). Yani listede ÖNCE yazılan SONRA koşuyor — sökmek için
// expo-task-manager'ın eklemesinden sonra çalışmamız gerekiyor, dolayısıyla
// listede ondan önce durmamız gerekiyor. Aynı kural withSplashLayout'ta da
// yazılı.
//
// Sıra bozulursa plugin SESSİZCE etkisiz kalır (dizide "fetch" henüz yoktur,
// filtre hiçbir şey çıkarmaz) — o yüzden aşağıda uyarı basıyor.
//
// Android YOK: orada karşılığı bir izin (`FOREGROUND_SERVICE`) ve o
// `isAndroidForegroundServiceEnabled: false` ile zaten kapalı.
//
// Background Fetch gerçekten gerekirse: bu plugin'i app.json'dan çıkar,
// gerekçesini de App Review notuna yaz.

const { withInfoPlist } = require("@expo/config-plugins");

const MODE = "fetch";

const withoutBackgroundFetch = (config) =>
  withInfoPlist(config, (cfg) => {
    const modes = cfg.modResults.UIBackgroundModes;
    if (!Array.isArray(modes)) return cfg;

    const next = modes.filter((m) => m !== MODE);
    if (next.length === modes.length) {
      // Hiçbir şey sökülmedi. İki olasılık var ve ikisi de bilinmeye değer:
      // (a) expo-task-manager plugin'i artık eklemiyor → bu plugin gereksiz,
      // (b) SIRA BOZULDU ve biz ondan önce koştuk → beyan Info.plist'te kalıyor
      //     ve bu plugin SESSİZCE etkisiz. Sessiz kalmasın.
      console.warn(
        '[withoutBackgroundFetch] UIBackgroundModes içinde "fetch" bulunamadı. ' +
          "Bu plugin app.json'da expo-task-manager'dan SONRA yazılmalı " +
          "(son yazılan mod ilk koşar). Değilse beyan Info.plist'te kalır.",
      );
      return cfg;
    }

    cfg.modResults.UIBackgroundModes = next;
    return cfg;
  });

module.exports = withoutBackgroundFetch;
