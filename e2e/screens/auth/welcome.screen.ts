import { BaseScreen } from '../base.screen';
import { byText, tx } from '../../support/selectors';

export class WelcomeScreen extends BaseScreen {
  /** Tur 1'de WelcomeScreen.tsx'e eklenecek kök işaretçi. */
  readonly root = 'welcome-screen';
  readonly name = 'Karşılama';

  /**
   * GEÇİCİ METİN KÖPRÜSÜ.
   *
   * Kök `testID` henüz eklenmedi (instrumentation Tur 1). O yüzden ekranın
   * açıldığı, kayıt butonunun metninden anlaşılıyor. Tur 1 landing yapınca bu
   * override SİLİNİR ve BaseScreen'in `~welcome-screen` yolu devralır —
   * tek satırlık bir temizlik, çağıranlar değişmiyor.
   */
  override async waitUntilOpen(timeout = 30_000): Promise<this> {
    if (await super.isOpen(500)) return super.waitUntilOpen(timeout);
    await byText('auth.welcome.signupButton').waitForDisplayed({
      timeout,
      timeoutMsg:
        `${this.name} ${timeout} ms içinde açılmadı. ` +
        `Aranan metin: "${tx('auth.welcome.signupButton')}"`,
    });
    return this;
  }

  override async isOpen(timeout = 1_000): Promise<boolean> {
    if (await super.isOpen(timeout)) return true;
    return byText('auth.welcome.signupButton')
      .waitForDisplayed({ timeout })
      .then(
        () => true,
        () => false
      );
  }

  async startRegister(): Promise<void> {
    await byText('auth.welcome.signupButton').click();
  }

  async goToLogin(): Promise<void> {
    await byText('auth.welcome.loginButton').click();
  }

  termsLink() {
    return byText('auth.welcome.termsLink');
  }

  privacyLink() {
    return byText('auth.welcome.privacyLink');
  }
}

export const welcome = new WelcomeScreen();
