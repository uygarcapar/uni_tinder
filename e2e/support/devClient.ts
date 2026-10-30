/**
 * expo-dev-client BAŞLATICISI.
 *
 * Bu, ilk koşuda ölçülen ve plana GİRMEMİŞ bir gerçek: `appium:app` ile taze
 * kurulan dev-client build'i uygulamayı değil, **geliştirme sunucusu seçme
 * ekranını** açıyor ("DEVELOPMENT SERVERS" / "Development Build" / Metro
 * adresi). Son kullanılan sunucu bilgisi uygulama konteynerinde yaşıyor ve
 * kurulum onu siliyor — yani `@fresh` etiketli HER spec buraya düşüyor.
 *
 * O yüzden her oturumun ilk işi "uygulamanın İÇİNE gir". Ekrandaki sunucu
 * satırına dokunmak yerine dev-client'ın kendi deep link'i kullanılıyor:
 * adres listede görünmese de (LAN IP ile 127.0.0.1 farkı) çalışıyor ve
 * ekranın düzenine bağımlı değil.
 */
import { BUNDLE_ID, METRO_URL } from './env';
import { els } from './selectors';

/** Başlatıcıyı ayırt eden metinler — i18n'den geçmiyor, dev-client'ın kendi İngilizcesi. */
const LAUNCHER_MARKERS = ['DEVELOPMENT SERVERS', 'Development Build', 'Enter URL manually'];

export async function isDevLauncher(): Promise<boolean> {
  for (const marker of LAUNCHER_MARKERS) {
    const hits = await els(`-ios predicate string: name == '${marker}' OR label == '${marker}'`);
    if (hits.length > 0) return true;
  }
  return false;
}

/**
 * Başlatıcıdaysa Metro'ya bağlanıp uygulamaya girer. Zaten içerideyse no-op.
 *
 * @returns başlatıcıdan geçilmek zorunda kalındı mı
 */
export async function enterApp({ timeout = 120_000 } = {}): Promise<boolean> {
  if (!(await isDevLauncher())) return false;

  const url = `lit://expo-development-client/?url=${encodeURIComponent(METRO_URL)}`;
  await browser.execute('mobile: deepLink', { url, bundleId: BUNDLE_ID });

  // Bundle Metro'dan indiriliyor: `e2e:metro` ön-ısıtma yaptıysa hızlı, yoksa
  // 60-90 sn. Başlatıcının KAYBOLMASI bekleniyor — hangi ekranın geleceğini
  // (Karşılama mı, kapı mı, Keşif mi) bu katman bilmiyor ve bilmemeli.
  await browser.waitUntil(async () => !(await isDevLauncher()), {
    timeout,
    interval: 2_000,
    timeoutMsg:
      `dev-client başlatıcısı ${timeout} ms içinde kapanmadı.\n` +
      `  Metro ayakta mı? ${METRO_URL}/status\n` +
      `  (npm run e2e:metro — bundle'ı ÖN-ISITIR, ilk indirme testin içinde ödenmesin)`,
  });
  return true;
}

/**
 * Uygulamayı yeniden başlatıp içine girer — `@session` etiketinin karşılığı.
 * Cold start yolunu gerçekten koşturuyor (splash + boot zinciri).
 */
export async function relaunchIntoApp(): Promise<void> {
  await browser.terminateApp(BUNDLE_ID);
  await browser.activateApp(BUNDLE_ID);
  await enterApp();
}
