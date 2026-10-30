import { BaseScreen } from '../base.screen';
import { DEV_OTP } from '../../support/env';

/**
 * Kayıt doğrulama kodu ekranı (RegisterStep2).
 *
 * İKİ ÖNEMLİ DAVRANIŞ:
 *
 * 1. **"Doğrula" butonuna BASILMIYOR.** `OtpInput` 6 hane dolunca `onFilled`
 *    ile doğrulamayı KENDİSİ başlatıyor. Butona basmak `submittingRef`
 *    korumasına takılıp ikinci isteği yutar; üstelik ürünün gerçek yolu
 *    otomatik olan.
 *
 * 2. **Gizli tek TextInput.** Kütüphane 6 kutuyu çiziyor ama giriş tek ve
 *    görünmez olabilir → `click()` YOK, `waitForExist` + `setValue`.
 *    `setValue` 6 haneyi tek seferde veriyor; `addValue` harf harf yazıp her
 *    hanede `onTextChange` zincirini koşturur (6 kat yavaş, kazancı yok).
 */
export class OtpScreen extends BaseScreen {
  readonly root = 'reg-step2-screen';
  readonly name = 'Kayıt · Doğrulama kodu';

  async enterCode(code: string = DEV_OTP): Promise<void> {
    const input = this.el('reg-otp-input');
    await input.waitForExist({
      timeout: 15_000,
      timeoutMsg: 'reg-otp-input ağaçta yok (OtpInput textInputProps.testID düştü mü?)',
    });
    await input.setValue(code);
  }

  /** Kod eksikken pasif olmalı — doğrulama spec'i için. */
  verifyButton() {
    return this.el('reg-step2-verify');
  }

  async tapResend(): Promise<void> {
    await this.tap('reg-step2-resend');
  }

  async changeEmail(): Promise<void> {
    await this.tap('reg-step2-change-email');
  }
}

export const otp = new OtpScreen();
