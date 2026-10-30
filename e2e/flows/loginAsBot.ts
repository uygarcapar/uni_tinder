/**
 * UI'dan giriş — ÖLÇÜM KİLİDİNİ KIRAN yol.
 *
 * Kısır döngü şuydu: oturum olmadan Keşif/tab bar/PHPicker ölçülemiyor,
 * oturum açmak için kayıt gerekiyor, kayıt fotoğraf istiyor, fotoğraf
 * moderasyondan geçmiyor.
 *
 * Döngüyü kıran şey: bot HTTP ile yaratılıyor (PHPicker yok), sonra aynı
 * hesapla UI'dan GİRİŞ yapılıyor. Bir kez oturum açıldığında ölçüm
 * sorularının hepsi cevaplanabiliyor ve Step15'in Page Object'i ondan SONRA
 * yazılabiliyor — planın "ölçmeden yazma" kuralı korunuyor.
 */
import { Alerts } from '../support/alerts';
import { enterApp } from '../support/devClient';
import { welcome } from '../screens/auth/welcome.screen';
import { login } from '../screens/auth/login.screen';
import { gates } from './gates';

export interface LoginResult {
  email: string;
  /** Girişten sonra hangi kapılardan geçildi — ölçüm raporuna giriyor. */
  gatesPassed: string[];
}

export async function loginViaUi(email: string, password: string): Promise<LoginResult> {
  await enterApp();

  await welcome.waitUntilOpen(60_000);
  await welcome.goToLogin();

  await login.waitUntilOpen();
  await login.enterCredentials(email, password);
  await login.submit();

  // Yanlış şifre / askıya alınmış hesap burada alert olarak çıkıyor; sessizce
  // yutulmuyor çünkü "giriş yapamadık" ile "ekran açılmadı" farklı hatalar.
  await Alerts.expectNone('giriş sonrası');

  const gatesPassed = await gates.settleAfterLogin();
  return { email, gatesPassed };
}
