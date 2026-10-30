/**
 * 02 — OTURUMLU AĞAÇ DÖKÜMÜ.
 *
 * `00-tree-dump` oturumsuz koştuğu için beş soruyu "ÖLÇÜLEMEDİ" bırakmıştı.
 * Bu spec onları kapatıyor: tohumlanmış bir bot hesabıyla UI'dan GİRİŞ yapıp
 * her yüzeyin ağacını döküyor.
 *
 * Neden girişle, kayıtla değil: kayıt fotoğraf istiyor, fotoğraf moderasyondan
 * geçmiyor (backend_e2e_preconditions §1). Bot ise HTTP ile yaratılıyor ve
 * PHPicker'a hiç uğramıyor — ölçüm kilidini kıran şey bu.
 *
 * ÖN KOŞUL: `npm run e2e:seed -- --bots 1` koşmuş olmalı.
 */
import { readFileSync, existsSync } from 'node:fs';
import { artifact } from '../../support/env';
import { els, tx } from '../../support/selectors';
import { Findings, dumpTree, formatStats } from '../../support/tree';
import { loginViaUi } from '../../flows/loginAsBot';
import { Nav } from '../../screens/nav';

const findings = new Findings();

interface LedgerEntry {
  email: string;
  password: string;
  deletedAt?: string;
}

function firstBotAccount(): LedgerEntry {
  const path = artifact('ledger.json');
  if (!existsSync(path)) {
    throw new Error(
      'Hesap defteri yok. Önce bot tohumla:\n  npm run e2e:seed -- --bots 1'
    );
  }
  const entries = JSON.parse(readFileSync(path, 'utf8')) as LedgerEntry[];
  const usable = entries.find((e) => !e.deletedAt);
  if (!usable) throw new Error('Defterde kullanılabilir hesap yok (hepsi silinmiş).');
  return usable;
}

async function findableByName(value: string): Promise<boolean> {
  return browser.$(`~${value}`).isExisting();
}

describe('02 · oturumlu ağaç dökümü', () => {
  let account: LedgerEntry;

  before(async () => {
    account = firstBotAccount();
    const result = await loginViaUi(account.email, account.password);
    findings.record(
      'Girişten sonra hangi kapılar çıkıyor?',
      result.gatesPassed.length === 0 ? 'Hiçbiri' : result.gatesPassed.join(' → '),
      `hesap: ${account.email}`
    );
  });

  after(() => {
    findings.write();
    process.stdout.write(`\n[tree] bulgular: ${artifact('trees', 'findings.md')}\n`);
  });

  it('Soru 2 — native tab bar tipi ve çocuk sayısı', async () => {
    await Nav.goToDiscover();
    const bars = await els('-ios class chain:**/XCUIElementTypeTabBar');
    const count = await Nav.tabButtonCount();

    findings.record(
      'Native tab bar XCUIElementTypeTabBar mı?',
      bars.length > 0 ? `EVET — ${count} buton` : 'HAYIR — başka bir eleman tipi',
      bars.length === 0
        ? 'iOS 26 createNativeBottomTabNavigator TabView kullanıyor olabilir; ' +
          'Nav.tabButton class chain\'i güncellenmeli. Ağaç: trees/discover.xml'
        : count === 5
          ? 'Akış sekmesi çizili (Discover·Likes·Feed·Messages·Profile)'
          : count === 4
            ? 'Akış sekmesi YOK → Nav.tabOrder() bunu zaten biliyor'
            : `Beklenmeyen sayı: ${count}`
    );
    expect(bars.length + count).toBeGreaterThan(0);
  });

  it('Soru 1 — SwiftUI cam butonlar ağaçta ve `~id` ile bulunabiliyor mu', async () => {
    await Nav.goToDiscover();
    const stats = await dumpTree('discover');
    process.stdout.write(`${formatStats('discover', stats)}\n`);

    // Tur 3'ten SONRA beklenen yol: accessibilityIdentifier.
    const byId = {
      like: await findableByName('discover-btn-like'),
      pass: await findableByName('discover-btn-pass'),
      fire: await findableByName('discover-btn-fire'),
    };
    // Tur 3 ÖNCESİ köprü: etiket (WDA `name` = identifier ?? label).
    const byLabel = {
      like: await findableByName(tx('likes.likeButton')),
      pass: await findableByName(tx('likes.passButton')),
    };

    const anyById = Object.values(byId).some(Boolean);
    findings.record(
      'SwiftUI cam butonlar `~id` ile bulunabiliyor mu?',
      anyById
        ? 'EVET — accessibilityIdentifier modifier\'ı ağaca düşüyor'
        : 'HAYIR — modifier ağaca düşmüyor, etiket köprüsüne dönülmeli',
      `id ile: like=${byId.like} pass=${byId.pass} fire=${byId.fire} · ` +
        `etiket ile: like=${byLabel.like} pass=${byLabel.pass}`
    );
  });

  it('Soru 3 — sohbet composer ve balonlar', async () => {
    await Nav.goToMessages();
    const rows = await els("-ios predicate string: name BEGINSWITH 'msgs-row-'");
    findings.record(
      'Sohbet listesi satırları adreslenebilir mi?',
      rows.length > 0 ? `EVET — ${rows.length} satır` : 'Liste boş (eşleşme yok)',
      rows.length === 0 ? 'Eşleşme tohumlandıktan sonra tekrar koş.' : undefined
    );
    if (rows.length === 0) return;

    await rows[0]?.click();
    const stats = await dumpTree('chat');
    process.stdout.write(`${formatStats('chat', stats)}\n`);
    findings.record(
      'Sohbet composer adreslenebilir mi?',
      (await findableByName('chat-input-text')) ? 'EVET' : 'HAYIR',
      `balon sayısı: ${(await els("-ios predicate string: name BEGINSWITH 'chat-bubble-'")).length}`
    );
  });

  it('Soru 4 — PHPicker XCUITest ağacında görünüyor mu', async () => {
    await Nav.goToProfile();
    await dumpTree('profile');

    const addButton = browser.$('~profile-btn-add-photo');
    if (!(await addButton.isExisting())) {
      findings.record(
        'PHPicker XCUITest ağacında görünüyor mu?',
        'ÖLÇÜLEMEDİ — profilde "foto ekle" seçicisi yok',
        'Tur 4b: ProfileScreen foto ızgarasına `profile-btn-add-photo` eklenmeli.'
      );
      return;
    }

    await addButton.click();
    // PhotoSourceSheet → Galeri
    const gallery = browser.$('~sheet-photo-gallery');
    await gallery.waitForDisplayed({ timeout: 10_000 });
    await gallery.click();

    // PHPicker AYRI BİR PROCESS (PhotosUIService) ve remote view — iOS 14-16'da
    // ağaçta boş `Other` olarak görünüyordu, 17+ ve 26'da iyileşti. Varsayım
    // YOK, ölçüm var.
    // Sabit bekleme YOK (ESLint çiti doğru yakaladı): PHPicker ayrı bir
    // process ve açılış süresi makineye göre değişiyor. Ağacın BÜYÜMESİNİ
    // bekliyoruz — bu hem hızlı makinede beklemiyor hem yavaşta yetişiyor.
    await browser
      .waitUntil(
        async () => {
          const cells = await els('-ios class chain:**/XCUIElementTypeCell');
          const imgs = await els('-ios class chain:**/XCUIElementTypeImage');
          return cells.length > 0 || imgs.length > 3;
        },
        { timeout: 15_000, interval: 1_000 }
      )
      // Zaman aşımı HATA DEĞİL: "PHPicker ağaçta görünmüyor" da bir ÖLÇÜM
      // sonucu. Aşağıdaki kayıt onu raporluyor.
      .catch(() => {});

    const stats = await dumpTree('phpicker');
    const cells = await els('-ios class chain:**/XCUIElementTypeCell');
    const images = await els('-ios class chain:**/XCUIElementTypeImage');

    findings.record(
      'PHPicker XCUITest ağacında görünüyor mu?',
      cells.length > 0
        ? `EVET — ${cells.length} hücre seçilebilir`
        : images.length > 0
          ? `KISMİ — hücre yok ama ${images.length} görsel var`
          : 'HAYIR — koordinat tabanlı seçime düşülmeli',
      `ağaç: ${stats.elementCount} eleman, derinlik ${stats.maxDepth}. ` +
        `Yedek sıra: includeNonModalElements + snapshotMaxDepth:100 → koordinat ` +
        `(ızgara deterministik, simctl addmedia sırası bizde).`
    );
  });

  it('Soru 5 — Alert yapısı (gizli DEV menüsü üzerinden)', async () => {
    await Nav.goToProfile();
    const settings = browser.$('~profile-btn-settings');
    if (!(await settings.isExisting())) {
      findings.record('Alert yapısı', 'ÖLÇÜLEMEDİ — Ayarlar butonu bulunamadı');
      return;
    }
    await settings.click();

    const envRow = browser.$('~settings-env-row');
    await envRow.waitForDisplayed({ timeout: 10_000 });
    const { longPress } = await import('../../support/driver');
    // 1200 ms eşik + pay. Altında kalırsa NORMAL basış olur (DEV'de Toast
    // galerisini açar) — yani yanlış dal.
    await longPress(envRow, 1_700);

    const { Alerts } = await import('../../support/alerts');
    const present = await Alerts.present();
    findings.record(
      'Gizli DEV menüsü (1200 ms uzun basış) açılıyor mu?',
      present ? 'EVET' : 'HAYIR',
      present
        ? `başlık="${await Alerts.title()}" butonlar=[${(await Alerts.buttonLabels()).join(', ')}]`
        : 'Uzun basış süresi ya da seçici gözden geçirilmeli.'
    );
    if (present) await Alerts.tapAny(['Kapat', 'İptal', 'Tamam', 'Cancel']);
  });
});
