/**
 * 00 — AĞAÇ DÖKÜMÜ. Bu dosya e2e katmanının İLK dosyası ve bir ARAŞTIRMA
 * spec'i: plandaki altı belirsizliği ÖLÇÜYOR.
 *
 * KURAL: bu spec koşup `.artifacts/trees/findings.md` üretmeden tek bir Page
 * Object yazılmaz. Amaç "varsayımla 40 spec yazıp hepsini çöpe atmak" riskini
 * sıfırlamak.
 *
 * Ölçülen altı soru:
 *   1. SwiftUI cam butonlar (@expo/ui Host) XCUITest ağacında görünüyor mu ve
 *      `~<etiket>` ile BULUNABİLİYOR mu?  (instrumentation Tur 3'ü gerektirir mi)
 *   2. Native tab bar hangi eleman tipinde ve kaç çocuğu var?
 *   3. OTP'nin gizli TextInput'u ağaçta var mı, `enabled`/`visible` değerleri ne?
 *   4. PHPicker erişilebilir mi (ayrı process, remote view)?
 *   5. Alert ağaca nasıl düşüyor (başlık/gövde/buton yapısı)?
 *   6. Gerçek ağaç derinliği `snapshotMaxDepth: 60`a sığıyor mu?
 *
 * Bu spec iddia ETMEZ, RAPORLAR. Tek sert assertion'ı "uygulama ayakta ve
 * ağaç boş değil" — gerisi bulgu. Bu yüzden oturum durumuna (giriş yapılmış
 * mı) göre dallanıyor ve ulaşamadığı yüzeyi "ölçülemedi" diye kaydediyor.
 */
import { APP_STATE_FOREGROUND, appState } from '../../support/driver';
import { BUNDLE_ID, artifact } from '../../support/env';
import { Alerts } from '../../support/alerts';
import { enterApp, isDevLauncher } from '../../support/devClient';
import { els, tx } from '../../support/selectors';
import { Findings, dumpTree, formatStats } from '../../support/tree';
import { Nav } from '../../screens/nav';

const findings = new Findings();

/**
 * Bu ölçüm gerçek uygulama yüzeyinde mi yapılıyor?
 *
 * İlk koşuda tam da bu tuzağa düşüldü: dev-client başlatıcısı 80 elemanlı
 * dolu bir ağaç üretiyor, yani "ağaç boş mu" kontrolü onu yakalamıyor ve
 * ölçümler SESSİZCE yanlış yüzeyden geliyor ("cam butonlar ağaçta yok" —
 * tabii ki yok, Keşif hiç açılmamıştı).
 */
async function requireRealSurface(question: string): Promise<boolean> {
  if (await isDevLauncher()) {
    findings.record(question, 'ÖLÇÜLEMEDİ — dev-client başlatıcısındayız', 'enterApp() başarısız.');
    return false;
  }
  return true;
}

/** `~<değer>` ile bulunabiliyor mu? WDA'da `name` = identifier ?? label. */
async function findableByName(value: string): Promise<boolean> {
  return browser.$(`~${value}`).isExisting();
}

describe('00 · ağaç dökümü (araştırma)', () => {
  after(() => {
    findings.write();
    process.stdout.write(`\n[tree] bulgular: ${artifact('trees', 'findings.md')}\n`);
  });

  it('dev-client başlatıcısı aşılıyor ve uygulamaya giriliyor', async () => {
    await browser.waitUntil(
      async () => {
        const stats = await dumpTree('boot-probe');
        return stats.elementCount > 10;
      },
      { timeout: 90_000, interval: 2_000, timeoutMsg: 'Uygulama 90 sn içinde bir ağaç üretmedi' }
    );

    const passedThrough = await enterApp();
    findings.record(
      'Taze kurulumda uygulama nerede açılıyor?',
      passedThrough
        ? 'dev-client BAŞLATICISINDA — deep link ile Metro\'ya bağlanmak ŞART'
        : 'Doğrudan uygulamada (son sunucu hatırlanmış)',
      passedThrough
        ? 'lit://expo-development-client/?url=<metro> — her @fresh spec bunu yapmak zorunda.'
        : undefined
    );
    expect(await isDevLauncher()).toBe(false);
  });

  it('uygulama ön planda ve ağaç dolu', async () => {
    // Cold start'ta splash, ilk ekran mount olana kadar bekletiliyor ve sekme
    // preload'ları ~4.4 sn sürüyor → ağacı erken okumak boş döndürür.
    expect(await appState()).toBe(APP_STATE_FOREGROUND);

    const stats = await dumpTree('first-surface');
    process.stdout.write(`${formatStats('ilk yüzey', stats)}\n`);

    // ── Soru 6: ağaç derinliği ───────────────────────────────────────────
    findings.record(
      'Ağaç derinliği snapshotMaxDepth=60 için yeterli mi?',
      stats.maxDepth < 55 ? `EVET (ölçülen ${stats.maxDepth})` : `RİSKLİ (ölçülen ${stats.maxDepth})`,
      stats.maxDepth >= 55
        ? 'Derin elemanlar SESSİZCE bulunamaz → wdio.conf.ts içinde 80e çıkar (maliyet: her sorgu yavaşlar).'
        : `${stats.elementCount} eleman, ${(stats.bytes / 1024).toFixed(0)} KB`
    );

    // Hangi yüzeydeyiz? Welcome ekranının kayıt butonu metniyle tespit.
    const atWelcome = await findableByName(tx('auth.welcome.signupButton'));
    findings.record(
      'Açılışta hangi yüzey?',
      atWelcome ? 'Welcome (oturum YOK)' : 'Welcome değil (oturum var ya da bir kapı açık)',
      atWelcome ? undefined : `isimli elemanlardan ilk 12: ${stats.names.slice(0, 12).join(' | ')}`
    );
  });

  it('Soru 2 — native tab bar tipi ve çocuk sayısı', async () => {
    if (!(await requireRealSurface('Native tab bar XCUIElementTypeTabBar mı?'))) return;
    const tabBars = await els('-ios class chain:**/XCUIElementTypeTabBar');
    const tabBarButtons = await Nav.tabButtonCount();
    if (tabBars.length === 0 || tabBarButtons === 0) {
      findings.record(
        'Native tab bar XCUIElementTypeTabBar mı?',
        'ÖLÇÜLEMEDİ — tab bar ekranda yok',
        'Oturum açık değil. Faz 1 (kayıt yeşil) sonrası bu testi tekrar koş.'
      );
      return;
    }
    const count = tabBarButtons;
    findings.record(
      'Native tab bar XCUIElementTypeTabBar mı?',
      `EVET — ${count} buton`,
      count === 5
        ? 'Akış sekmesi çizili (Discover·Likes·Feed·Messages·Profile)'
        : count === 4
          ? 'Akış sekmesi YOK (Discover·Likes·Messages·Profile) → Nav.tabIndex buna göre'
          : `Beklenmeyen sayı: ${count}. Nav.tabOrder() haritası güncellenmeli.`
    );

    // Etiketler gerçekten boş mu? (TabNavigator.tsx:192 iddiası)
    const labels: string[] = [];
    for (let i = 1; i <= count; i += 1) {
      const el = browser.$(
        `-ios class chain:**/XCUIElementTypeTabBar/XCUIElementTypeButton[${i}]`
      );
      labels.push((await el.getAttribute('name').catch(() => null)) ?? '');
    }
    const allEmpty = labels.every((l) => l.length === 0);
    findings.record(
      'Tab bar butonları `~` ile adreslenebilir mi?',
      allEmpty ? 'HAYIR — hepsi etiketsiz, deep link ŞART' : 'EVET — etiketler dolu!',
      `name değerleri: [${labels.map((l) => `"${l}"`).join(', ')}]`
    );
  });

  it('Soru 1 — SwiftUI cam butonlar ağaçta görünüyor mu', async () => {
    if (!(await requireRealSurface('SwiftUI cam butonlar XCUITest ağacında mı?'))) return;
    await Nav.goToDiscover();
    // Keşif'e varmak oturum gerektiriyor; yoksa deep link sessizce yutulur.
    const stats = await dumpTree('discover');
    process.stdout.write(`${formatStats('discover', stats)}\n`);

    // Instrumentation ÖNCESİ köprü: cam butonlar bugün yalnız
    // `accessibilityLabel as a11yLabel` geçiyor ve WDA `name` boş
    // identifier'da `label`a düşüyor → `~Beğen` çalışmalı.
    const probes: Array<{ what: string; value: string }> = [
      { what: 'Beğen', value: tx('likes.likeButton') },
      { what: 'Geç', value: tx('likes.passButton') },
    ];

    const results: string[] = [];
    let anyFound = false;
    for (const probe of probes) {
      const inXml = stats.names.includes(probe.value);
      const findable = inXml ? await findableByName(probe.value) : false;
      anyFound = anyFound || findable;
      results.push(`${probe.what}="${probe.value}" ağaçta:${inXml} ~ile:${findable}`);
    }

    // Keşif gerçekten açıldı mı? Kartın karar butonları yoksa (ya da ekran
    // Karşılama'daysa) ölçüm GEÇERSİZ — "cam buton yok" cevabı yanıltıcı olur.
    const onWelcome = await findableByName(tx('auth.welcome.signupButton'));
    const hasTabBar = (await Nav.tabButtonCount()) > 0;
    if (onWelcome || !hasTabBar) {
      findings.record(
        'SwiftUI cam butonlar XCUITest ağacında mı?',
        'ÖLÇÜLEMEDİ — Keşif açılmadı (oturum yok)',
        'Faz 1 sonrası tekrar koş. O ana kadar Tur 3 instrumentation kararı ASKIDA.'
      );
      return;
    }

    findings.record(
      'SwiftUI cam butonlar XCUITest ağacında mı?',
      anyFound
        ? 'EVET — `~<etiket>` köprüsü çalışıyor'
        : 'HAYIR — Tur 3 instrumentation (accessibilityIdentifier modifier) ZORUNLU',
      results.join(' · ')
    );
  });

  it('Soru 5 — Alert ağaca nasıl düşüyor', async () => {
    // Beklenmeyen bir alert varsa onu ölç; yoksa yapıyı ölçemeyiz ve bunu
    // kaydet. Alert'i KASITLI tetiklemek oturum gerektiriyor (DEV menüsü),
    // bu yüzden Faz 1'e bırakılıyor.
    if (!(await Alerts.present())) {
      findings.record(
        'Alert yapısı (başlık/gövde/buton)',
        'ÖLÇÜLEMEDİ — şu an açık alert yok',
        'Faz 1: Ayarlar → gizli DEV menüsü (1200 ms uzun basış) ile ölçülecek.'
      );
      return;
    }
    const stats = await dumpTree('alert');
    findings.record(
      'Alert yapısı (başlık/gövde/buton)',
      `başlık="${await Alerts.title()}"`,
      `gövde="${await Alerts.body()}" butonlar=[${(await Alerts.buttonLabels()).join(', ')}] ` +
        `(ağaç: ${stats.elementCount} eleman)`
    );
  });

  it('Soru 3 — OTP gizli TextInput ağaçta mı', async () => {
    const fields = await els('-ios class chain:**/XCUIElementTypeTextField');
    const secure = await els('-ios class chain:**/XCUIElementTypeSecureTextField');
    findings.record(
      'OTP girişi (react-native-otp-entry) ağaçta mı?',
      fields.length + secure.length > 0
        ? `Bu yüzeyde ${fields.length} TextField + ${secure.length} SecureTextField var`
        : 'ÖLÇÜLEMEDİ — bu yüzeyde metin alanı yok',
      'Kesin cevap Faz 1: RegisterStep2 ekranında `reg-otp-input` eklendikten sonra ' +
        '`waitForExist` + `setValue` (click YOK — input opacity:0 olabilir).'
    );
  });

  it('Soru 4 — PHPicker erişilebilirliği', async () => {
    // PHPicker ayrı bir process (PhotosUIService) ve remote view. Açmak
    // kayıt Step15 ya da Profil → foto ekle gerektiriyor → oturum şart.
    findings.record(
      'PHPicker XCUITest ağacında görünüyor mu?',
      'ÖLÇÜLEMEDİ — açmak oturum + Step15 gerektiriyor',
      'Faz 1: galeri açıldığında bu testi tekrar koş. Yedek sıra: ' +
        'class chain Cell → includeNonModalElements+snapshotMaxDepth:100 → koordinat ' +
        '(ızgara deterministik, simctl addmedia sırası bizde).'
    );
  });

  it('cihaz/oturum künyesi', async () => {
    const size = await browser.getWindowSize();
    findings.record(
      'Cihaz künyesi',
      `${size.width}×${size.height} pt`,
      `bundleId=${BUNDLE_ID} appState=${await appState()}`
    );
  });
});
