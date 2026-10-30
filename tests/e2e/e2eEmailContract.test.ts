/**
 * E2E ADRES SÖZLEŞMESİ ÇİTİ.
 *
 * Backend'in izolasyon tasarımı (`2026-10-29-e2e-hesap-izolasyonu-design.md`)
 * şunu söylüyor ve "kod tarafında test edilemez" diye not düşüyor:
 *
 * > UI'dan açılan hesap da desene uymak zorunda. Yüklem simetrik olduğu için
 * > desene uymayan elle açılmış bir test hesabı hiçbir botu göremez; koşu hata
 * > vermez, **sessizce boş desteyle geçer — yeşil ama anlamsız.**
 *
 * SUNUCU tarafında test edilemez; İSTEMCİ tarafında edilebilir, ve yeri
 * burasıdır. Üretilen her adresin desene uyduğunu burada çivilemezsek,
 * bozulduğu gün hiçbir şey kırmızıya dönmez.
 *
 * Bu dosya `e2e/seed/emailFormat.ts`i import ediyor — SAF modül, `.env.e2e`
 * gerektirmiyor, yani CI'da Linux'ta simülatörsüz koşuyor.
 */
import {
  E2E_EMAIL_PATTERN,
  E2E_LOCAL_PREFIX,
  buildDisplayName,
  buildEmail,
  buildInstallationId,
  buildPassword,
  matchesPattern,
} from '../../e2e/seed/emailFormat';

const DOMAIN = 'bilgiedu.net';

describe('e2e adres sözleşmesi', () => {
  it('üretilen her adres yapılandırılacak desene uyuyor', () => {
    const mismatched: string[] = [];
    for (let seed = 0; seed < 50; seed += 1) {
      for (let slot = 0; slot < 8; slot += 1) {
        const email = buildEmail(DOMAIN, `run-${seed}`, seed * 7919, slot);
        if (!matchesPattern(email, E2E_EMAIL_PATTERN)) mismatched.push(email);
      }
    }
    expect(
      mismatched.length === 0
        ? ''
        : `Şu adresler "${E2E_EMAIL_PATTERN}" desenine UYMUYOR:\n` +
          `${mismatched.slice(0, 5).join('\n')}\n\n` +
          'Sonuç: hesap IsE2EAccount=false doğar, simetrik yüklem yüzünden hiçbir\n' +
          'botu göremez ve koşu HATA VERMEDEN boş desteyle geçer.'
    ).toBe('');
  });

  it('backend guard kuralına uyuyor: local-part harfi harfine önekle başlıyor', () => {
    // Guard "yalnız `*`" ya da "`*@domain`" gibi desenleri reddediyor; bizim
    // desenin güvenli sayılması bu öneke bağlı.
    expect(E2E_EMAIL_PATTERN.startsWith(E2E_LOCAL_PREFIX)).toBe(true);
    expect(E2E_LOCAL_PREFIX.length).toBeGreaterThan(0);
    // Domain kısmında joker olamaz.
    const domainPart = E2E_EMAIL_PATTERN.split('@')[1] ?? '';
    expect(domainPart).not.toContain('*');
    expect(buildEmail(DOMAIN, 'r', 1, 0).startsWith(E2E_LOCAL_PREFIX)).toBe(true);
  });

  it('gerçek kullanıcı adresleri desene YAKALANMIYOR', () => {
    // Ters yön: desen fazla geniş olsaydı gerçek kullanıcılar sessizce izole
    // olurdu ("uygulama bana kimseyi göstermiyor"). Tasarımın tek tehlikeli
    // hata modu bu.
    for (const real of [
      'ogrenci@bilgiedu.net',
      'ahmet.yilmaz@bilgiedu.net',
      'e2@bilgiedu.net',
      'test@bilgiedu.net',
      'e2e@bilgiedu.net', // nokta YOK — önek `e2e.`
    ]) {
      expect(matchesPattern(real, E2E_EMAIL_PATTERN)).toBe(false);
    }
  });

  it('eşleme büyük/küçük harf duyarsız', () => {
    expect(matchesPattern('E2E.ABCDEF0123@BilgiEdu.net', E2E_EMAIL_PATTERN)).toBe(true);
  });

  it('aynı girdi aynı adresi, farklı girdi farklı adresi üretiyor', () => {
    expect(buildEmail(DOMAIN, 'r1', 42, 0)).toBe(buildEmail(DOMAIN, 'r1', 42, 0));
    const distinct = new Set<string>();
    for (let slot = 0; slot < 50; slot += 1) distinct.add(buildEmail(DOMAIN, 'r1', 42, slot));
    expect(distinct.size).toBe(50);
  });

  it('yardımcı alanlar da benzersiz ve biçimli', () => {
    const names = new Set<string>();
    const installs = new Set<string>();
    for (let slot = 0; slot < 30; slot += 1) {
      names.add(buildDisplayName('r1', 7, slot));
      installs.add(buildInstallationId('r1', 7, slot));
    }
    expect(names.size).toBe(30);
    expect(installs.size).toBe(30);
    // Kayıt şeması en az 8 karakter istiyor (formSchemas).
    expect(buildPassword(1, 0).length).toBeGreaterThanOrEqual(8);
  });
});
