import i18n from '@/shared/i18n';
import { dobSchema } from '@/shared/schemas/formSchemas';

const msgs = (r: any) => r.error.issues.map((i: any) => i.message);

describe('dobSchema mesajları', () => {
  it('boş alanda Zod İNGİLİZCE varsayılanına düşmez', () => {
    const r = dobSchema.safeParse({ day: '06', month: '04', year: '' });
    expect(r.success).toBe(false);
    for (const m of msgs(r)) {
      expect(m).not.toMatch(/Too small|expected string/i);
    }
    expect(msgs(r)).toContain('Geçerli bir doğum tarihi gir.');
  });

  it('18 yaş altında yaş mesajı verir', () => {
    const y = new Date().getFullYear() - 10;
    const r = dobSchema.safeParse({ day: '06', month: '04', year: String(y) });
    expect(msgs(r)[0]).toContain('18');
  });

  it('🔴 dil değişince mesaj da değişir (modül seviyesinde donmuyor)', async () => {
    await i18n.changeLanguage('en');
    const r = dobSchema.safeParse({ day: '', month: '', year: '' });
    expect(msgs(r)).toContain('Enter a valid date of birth.');
    await i18n.changeLanguage('tr');
    const r2 = dobSchema.safeParse({ day: '', month: '', year: '' });
    expect(msgs(r2)).toContain('Geçerli bir doğum tarihi gir.');
  });

  it('geçerli tarih kabul edilir', () => {
    expect(dobSchema.safeParse({ day: '06', month: '04', year: '1999' }).success).toBe(true);
  });
});
