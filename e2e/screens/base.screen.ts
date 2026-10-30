/**
 * Page Object tabanı.
 *
 * KATMAN KURALI: `screens/` içinde ASSERTION YOK — yalnız `get`/`is`/`tap`/
 * `type`. Beklemek serbest, doğrulamak değil; doğrulama `specs/`e ait.
 */
import { Alerts } from '../support/alerts';
import { Keyboard } from '../support/driver';
import { idOf, seeText, type I18nKey } from '../support/selectors';

export abstract class BaseScreen {
  /**
   * Ekranın KÖK işaretçisi — instrumentation turunda her ekrana eklenen
   * `*-screen` / `*-sheet` id'si.
   *
   * "Hangi ekrandayım" sorusunun TEK cevabı bu ve beyaz-ekran dedektörünün
   * (support/invariants.ts) temeli.
   */
  abstract readonly root: string;

  /** İnsan okur adı — hata mesajları, Allure adımları, maymun raporu. */
  abstract readonly name: string;

  el(id: string) {
    return idOf(id);
  }

  async isOpen(timeout = 1_000): Promise<boolean> {
    return this.el(this.root)
      .waitForDisplayed({ timeout })
      .then(
        () => true,
        () => false
      );
  }

  /**
   * Ekranın açılmasını bekler.
   *
   * Varsayılan 20 sn: bu uygulamada cold start'ta splash `DiscoverScreen`
   * mount olana kadar bekliyor ve sekme preload'ları ~4.4 sn sürüyor.
   * Keşif için çağıranlar 60 sn vermeli.
   */
  async waitUntilOpen(timeout = 20_000): Promise<this> {
    await this.el(this.root).waitForDisplayed({
      timeout,
      timeoutMsg: `${this.name} ${timeout} ms içinde açılmadı (kök: ${this.root})`,
    });
    await Alerts.expectNone(`${this.name} açılışı`);
    return this;
  }

  async waitUntilClosed(timeout = 15_000): Promise<void> {
    await this.el(this.root).waitForDisplayed({
      timeout,
      reverse: true,
      timeoutMsg: `${this.name} ${timeout} ms içinde kapanmadı (kök: ${this.root})`,
    });
  }

  async tap(id: string, { timeout = 15_000 } = {}): Promise<void> {
    const el = this.el(id);
    await el.waitForDisplayed({ timeout, timeoutMsg: `${this.name}: "${id}" görünmedi` });
    // `waitForEnabled` yut: bazı SwiftUI Host'ları `enabled` attribute'unu hiç
    // bildirmiyor ve beklemek boşa zaman aşımı üretiyor.
    await el.waitForEnabled({ timeout: 5_000 }).catch(() => {});
    await el.click();
  }

  /**
   * Metin yazar.
   *
   * `setValue` (→ WDA `typeText`) kullanılıyor, `addValue` DEĞİL: `addValue`
   * harf harf yazıyor ve her hanede `onChangeText` → `setState` zinciri
   * koşuyor (OTP'de 6 kat yavaş, hiçbir kazancı yok).
   */
  async type(
    id: string,
    text: string,
    { clear = true, hideKeyboard = true, timeout = 15_000 } = {}
  ): Promise<void> {
    const el = this.el(id);
    await el.waitForDisplayed({ timeout, timeoutMsg: `${this.name}: "${id}" görünmedi` });
    await el.click();
    if (clear) await el.clearValue().catch(() => {});
    await el.setValue(text);
    if (hideKeyboard) await Keyboard.dismissIfOpen();
  }

  /** Doğrulama kısayolu — spec'lerin okunabilirliği için burada duruyor. */
  see(key: I18nKey, vars?: Record<string, string | number>): Promise<void> {
    return seeText(key, vars);
  }
}
