/**
 * ALERT YÖNETİMİ — `autoAcceptAlerts` KAPALI olduğu için açık mekanizma.
 *
 * Neden kapalı (tartışma değil, gerekçe):
 *
 * 1. İzin diyalogları ÜRÜNÜN PARÇASI ve testin konusu. `LocationAccessGate`
 *    izin verilene kadar kapatılamıyor, kayıt Step9 izin olmadan ilerlemiyor,
 *    mikrofon izni ilk basılı tutuşta soruluyor. Otomatik kabul, "kapı
 *    gerçekten kapatıyor mu" sorusunu test edilemez yapar.
 *
 * 2. Daha ağır sebep: XCUITest'in alert monitörü SİSTEM diyaloğunu uygulamanın
 *    `UIAlertController`ından AYIRT ETMİYOR. Bu kod tabanında `Alert.alert`
 *    çok yoğun — tek başına SettingsScreen'de 20'den fazla çağrı (gizli DEV
 *    menüsü, kampüs simülasyon menüsü, çıkış onayı, hesap silme onayı), ayrıca
 *    DiscoverScreen rewind hatası ve RegisterStep1'in ACCOUNT_EXISTS
 *    dallanması. `autoAcceptAlerts: true` bunların İLK butonuna basar:
 *    DEV menüsünde "Toast galerisi"ne, ACCOUNT_EXISTS'te yanlış dala, çıkış
 *    onayında "Çıkış"a. Testler sessizce yanlış yolda koşar.
 */
import { els, esc } from './selectors';

const ALERT = '-ios class chain:**/XCUIElementTypeAlert';

/** iOS izin diyaloğu buton metinleri — OS dilinden geliyor, iki dil birlikte. */
const PERMISSION_LABELS = {
  'allow-while-using': [
    'Allow While Using App',
    'Uygulamayı Kullanırken İzin Ver',
    'Uygulamayı Kullanırken',
  ],
  'allow-once': ['Allow Once', 'Bir Kez İzin Ver'],
  allow: ['Allow', 'İzin Ver', 'OK', 'Tamam'],
  'allow-always': ['Change to Always Allow', 'Her Zaman İzin Ver', 'Always Allow'],
  deny: ["Don't Allow", 'İzin Verme', 'Vermeyin'],
} as const;

export type PermissionDecision = keyof typeof PERMISSION_LABELS;

export class UnexpectedAlertError extends Error {}

export const Alerts = {
  async present(): Promise<boolean> {
    return browser.$(ALERT).isExisting();
  },

  /** Diyaloğun başlığı (ilk StaticText). Yoksa boş string. */
  async title(): Promise<string> {
    const el = browser.$(`${ALERT}/XCUIElementTypeStaticText[1]`);
    return (await el.isExisting()) ? ((await el.getText()) ?? '') : '';
  },

  /** Gövde (ikinci StaticText) — DEV menüsü raporları buradan okunuyor. */
  async body(): Promise<string> {
    const el = browser.$(`${ALERT}/XCUIElementTypeStaticText[2]`);
    return (await el.isExisting()) ? ((await el.getText()) ?? '') : '';
  },

  async buttonLabels(): Promise<string[]> {
    const buttons = await els(`${ALERT}/**/XCUIElementTypeButton`);
    const out: string[] = [];
    for (const el of buttons) out.push((await el.getText()) ?? '');
    return out.filter((s) => s.length > 0);
  },

  async waitForPresent(timeout = 10_000): Promise<void> {
    await browser.$(ALERT).waitForExist({
      timeout,
      timeoutMsg: `Alert ${timeout} ms içinde çıkmadı`,
    });
  },

  async waitForGone(timeout = 10_000): Promise<void> {
    await browser.$(ALERT).waitForExist({
      timeout,
      reverse: true,
      timeoutMsg: `Alert ${timeout} ms içinde kapanmadı: ${await this.title()}`,
    });
  },

  /**
   * Butonu GÖRÜNEN METNİYLE basar. İndeksle basmak yasak: hangi diyaloğa
   * bastığımız hata mesajında ve log'da okunabilir kalmak zorunda.
   */
  async tap(match: string | RegExp, { timeout = 10_000 } = {}): Promise<string> {
    await this.waitForPresent(timeout);
    const labels = await this.buttonLabels();
    const hit = labels.find((l) => (typeof match === 'string' ? l === match : match.test(l)));
    if (!hit) {
      throw new Error(
        `Alert butonu bulunamadı: ${String(match)}\n` +
          `  başlık: ${await this.title()}\n` +
          `  butonlar: ${labels.join(' | ')}`
      );
    }
    await browser.$(`${ALERT}/**/XCUIElementTypeButton[\`label == '${esc(hit)}'\`]`).click();
    return hit;
  },

  /** Verilen metinlerden HANGİSİ varsa ona basar; sırayla dener. */
  async tapAny(matches: readonly string[], { timeout = 10_000 } = {}): Promise<string> {
    await this.waitForPresent(timeout);
    const labels = await this.buttonLabels();
    for (const candidate of matches) {
      if (labels.includes(candidate)) return this.tap(candidate, { timeout: 1_000 });
    }
    throw new Error(
      `Alert'te beklenen butonların hiçbiri yok.\n` +
        `  beklenen: ${matches.join(' | ')}\n` +
        `  başlık: ${await this.title()}\n` +
        `  butonlar: ${labels.join(' | ')}`
    );
  },

  /** iOS izin diyaloğunu karara göre kapatır. */
  async permission(decision: PermissionDecision, { timeout = 15_000 } = {}): Promise<string> {
    return this.tapAny(PERMISSION_LABELS[decision], { timeout });
  },

  /** İzin diyaloğu VARSA kapatır, yoksa sessizce geçer (profil `granted` ise çıkmıyor). */
  async permissionIfPresent(
    decision: PermissionDecision,
    { timeout = 3_000 } = {}
  ): Promise<boolean> {
    try {
      await this.waitForPresent(timeout);
    } catch {
      return false;
    }
    await this.permission(decision, { timeout: 2_000 });
    return true;
  },

  /**
   * DEĞİŞMEZ KOŞUL: beklenmeyen alert bir HATADIR.
   *
   * Her ekran açılışının ve her maymun eyleminin sonunda çağrılıyor. Bir akış
   * alert BEKLİYORSA onu açıkça `tap` etmek zorunda — sessizce üstünden
   * atlamak yok.
   */
  async expectNone(context: string): Promise<void> {
    if (!(await this.present())) return;
    throw new UnexpectedAlertError(
      `Beklenmeyen alert (${context}): "${await this.title()}"\n` +
        `  gövde: ${await this.body()}\n` +
        `  butonlar: ${(await this.buttonLabels()).join(' | ')}`
    );
  },
};
