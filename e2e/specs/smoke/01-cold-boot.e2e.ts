/**
 * 01 — SOĞUK AÇILIŞ.
 *
 * Doğruladığı:
 *   • Bakir kurulumda splash → Karşılama ekranı (oturum yok, taslak yok)
 *   • Uygulama ön planda ve ağaç dolu
 *   • Hiçbir beklenmeyen alert yok
 *   • Log'da ölümcül kayıt yok (crashLogger kanalı + native sinyaller)
 *   • Test koşucusunun hedeflediği backend GERÇEKTEN ayakta
 *
 * Henüz doğrulanAMAYAN (Faz 1'e ait, oturum gerektiriyor):
 *   • Ayarlar'ın altındaki "LIT · dev" satırı (yani `__DEV__` build olduğu)
 *   • `authDiagnostics` → `storeDegraded === false` (şifreli MMKV sağlığı)
 *   Bu ikisi kayıt akışı yeşilleştiğinde buraya assertion olarak giriyor.
 */
import { API_BASE_URL } from '../../support/env';
import { APP_STATE_FOREGROUND, appState } from '../../support/driver';
import { Alerts } from '../../support/alerts';
import { enterApp } from '../../support/devClient';
import { assertNoFatals, logTail } from '../../support/logstream';
import { dumpTree, formatStats } from '../../support/tree';
import { welcome } from '../../screens/auth/welcome.screen';

describe('01 · soğuk açılış', () => {
  before(async () => {
    // Taze kurulumda uygulama dev-client BAŞLATICISINDA açılıyor; son
    // kullanılan Metro adresi konteynerde yaşıyor ve kurulum onu siliyor.
    await enterApp();
  });

  it('backend ayakta', async () => {
    // Uygulamadan DEĞİL, koşucudan sorulan bir soru: `.env.e2e`de yazan
    // adres gerçekten cevap veriyor mu? Vermiyorsa bütün akış spec'leri
    // "ekran açılmadı" diye kırılır ve sebebi görünmez olur.
    const started = Date.now();
    try {
      const res = await fetch(`${API_BASE_URL}/api/common/genders`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      expect(res.ok).toBe(true);
    } catch (err) {
      const code = (err as { cause?: { code?: string } })?.cause?.code ?? (err as Error).name;
      throw new Error(
        `Backend'e ulaşılamadı: ${API_BASE_URL} (${code}, ${Date.now() - started} ms)\n` +
          `  • Adres doğru mu? e2e/.env.e2e → EXPO_PUBLIC_API_BASE_URL\n` +
          `  • Makineden erişiliyor mu? curl -sS ${API_BASE_URL}/api/common/genders\n` +
          `  • VPN / ağ kısıtı? Bu kontrol koşucudan yapılıyor, simülatörden değil.`
      );
    }
  });

  it('splash geçiliyor ve Karşılama ekranı açılıyor', async () => {
    // 60 sn: cold start'ta splash ilk ekran mount olana kadar bekletiliyor ve
    // Debug build'de JS bundle Metro'dan geliyor.
    await welcome.waitUntilOpen(60_000);

    const stats = await dumpTree('cold-boot-welcome');
    process.stdout.write(`${formatStats('welcome', stats)}\n`);
    expect(stats.elementCount).toBeGreaterThan(10);
  });

  it('uygulama ön planda', async () => {
    expect(await appState()).toBe(APP_STATE_FOREGROUND);
  });

  it('beklenmeyen alert yok', async () => {
    await Alerts.expectNone('soğuk açılış');
  });

  it('Karşılama ekranının yasal linkleri yerinde', async () => {
    await expect(welcome.termsLink()).toBeDisplayed();
    await expect(welcome.privacyLink()).toBeDisplayed();
  });

  it("log'da ölümcül kayıt yok", () => {
    try {
      assertNoFatals();
    } catch (err) {
      // Log kuyruğunu hata mesajına ekle: `[fatal]` satırının tek başına
      // anlamı yok, onu üreten zincir bir önceki birkaç satırda.
      throw new Error(`${(err as Error).message}\n\n--- log kuyruğu ---\n${logTail(40)}`);
    }
  });
});
