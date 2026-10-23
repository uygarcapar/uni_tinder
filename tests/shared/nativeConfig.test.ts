/**
 * ⚠️ `fs` TİP TANIMI OLMADAN: projede `@types/node` yok (`tsconfig.types`
 * yalnız `["jest"]`). `require` jest ortamında çalışıyor.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readFileSync } = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
};

/**
 * NATIVE BEYANLAR — App Store 2.5.4 nöbeti.
 *
 * Bu projede 1.0(36) sürümü **tam olarak bu maddeden** reddedildi: kullanılmayan
 * bir arka plan modu beyan edilmişti (`expo-audio`nun
 * `enableBackgroundPlayback` varsayılanı). İkinci kopyası kampüs geofence'i
 * eklenirken geldi: `expo-task-manager`ın config plugin'i `UIBackgroundModes`e
 * **"fetch"i koşulsuz** ekliyor, hangi görev tipini kullandığımıza bakmadan.
 *
 * ── Neden bu test var ─────────────────────────────────────────────────────
 * Beyanı `app.json`a bakarak denetlemek YETMİYOR ve bu denetimin sinsi tarafı:
 * `app.json` `["remote-notification"]` yazarken derlenen Info.plist
 * `["remote-notification", "fetch"]` çıkıyordu. Fark yalnız `expo config
 * --type introspect` ile ya da `ios/` içindeki üretilmiş plist'e bakarak
 * görülüyor — `ios/` ise .gitignore'da, yani CI'da yok.
 *
 * O yüzden burada KAYNAK ZİNCİRİ denetleniyor: app.json'daki beyan + söküm
 * plugin'inin varlığı + SIRASI. Üçü doğruysa derlenen plist de doğru.
 *
 * ⚠️ Region monitoring (geofencing) iOS'ta hiçbir arka plan modu İSTEMİYOR:
 * bölge olayında işletim sistemi uygulamayı konum çatısı üzerinden kendisi
 * uyandırıyor. Yani "geofence çalışmıyor" diye arka plan modu eklemek YANLIŞ
 * teşhis — bu test o refleksin önünde duruyor.
 */

const APP_JSON = JSON.parse(readFileSync('app.json', 'utf8')) as {
  expo: {
    ios?: { infoPlist?: Record<string, unknown> };
    plugins: (string | [string, Record<string, unknown>])[];
  };
};

const pluginName = (p: string | [string, Record<string, unknown>]): string =>
  Array.isArray(p) ? p[0] : p;

const PLUGIN_NAMES = APP_JSON.expo.plugins.map(pluginName);

/** Plugin'in ayar nesnesi — dizi biçiminde yazılmadıysa `null`. */
const pluginConfig = (name: string): Record<string, unknown> | null => {
  const entry = APP_JSON.expo.plugins.find((p) => pluginName(p) === name);
  return Array.isArray(entry) ? entry[1] : null;
};

describe('iOS arka plan modları', () => {
  it('app.json YALNIZ remote-notification beyan ediyor', () => {
    expect(APP_JSON.expo.ios?.infoPlist?.UIBackgroundModes).toEqual([
      'remote-notification',
    ]);
  });

  it('"location" arka plan modu YOK', () => {
    // Geofence için gerekmiyor (region monitoring) ve eklemek 2.5.4'ü yeniden
    // açar. `isIosBackgroundLocationEnabled: false` da bunu koruyor.
    const modes = APP_JSON.expo.ios?.infoPlist?.UIBackgroundModes as string[];
    expect(modes).not.toContain('location');
  });

  it('expo-task-manager\'ın eklediği "fetch" SÖKÜLÜYOR', () => {
    expect(PLUGIN_NAMES).toContain('./plugins/withoutBackgroundFetch');
  });

  it('söküm plugin\'i expo-task-manager\'dan ÖNCE kayıtlı', () => {
    // ⚠️ TERS GELEN KURAL: @expo/config-plugins'te SON kaydedilen mod İLK
    // çalışır, yani listede ÖNCE yazılan SONRA koşuyor. Sökmek için
    // eklemeden sonra çalışmak gerekiyor → listede ondan önce durmak gerekiyor.
    // Sıra bozulursa plugin SESSİZCE etkisiz kalır ve beyan plist'te kalır.
    const strip = PLUGIN_NAMES.indexOf('./plugins/withoutBackgroundFetch');
    const task = PLUGIN_NAMES.indexOf('expo-task-manager');
    expect(task).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(task);
  });
});

describe('expo-location plugin kapıları', () => {
  const cfg = pluginConfig('expo-location') ?? {};

  it('iOS arka plan konumu KAPALI', () => {
    // `true` yapmak UIBackgroundModes'a "location" ekliyor — gerekmiyor
    // (region monitoring) ve 2.5.4 riski.
    expect(cfg.isIosBackgroundLocationEnabled).toBe(false);
  });

  it('Android arka plan konumu AÇIK', () => {
    // Android 10+ `ACCESS_BACKGROUND_LOCATION` olmadan geofence vermiyor.
    expect(cfg.isAndroidBackgroundLocationEnabled).toBe(true);
  });

  it('Android foreground service AÇIKÇA kapalı', () => {
    // Varsayılanı background'a eşitleniyor ve kullanmadığımız
    // FOREGROUND_SERVICE izinlerini ekliyor.
    expect(cfg.isAndroidForegroundServiceEnabled).toBe(false);
  });

  it('Always izin metni ÖZELLİĞİN ADINI söylüyor', () => {
    // Jenerik bir purpose string 2.5.4/5.1.1 incelemesinde doğrudan ret
    // sebebi; metin ne zaman ve neden okunduğunu söylemek zorunda.
    const always = String(cfg.locationAlwaysAndWhenInUsePermission ?? '');
    expect(always.toLowerCase()).toContain('campus');
    expect(always.length).toBeGreaterThan(60);
  });
});
