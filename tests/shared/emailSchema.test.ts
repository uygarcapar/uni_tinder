import i18n from '@/shared/i18n';
import { emailSchema, changeEmailSchema } from '@/shared/schemas/formSchemas';

const msgs = (r: any) => r.error.issues.map((i: any) => i.message);

describe('emailSchema (kayıt 1. adım)', () => {
  it('geçerli adresi normalize ederek geçirir (trim + lowercase)', () => {
    const r = emailSchema.safeParse({ email: '  Ali@Uni.EDU.tr ' });
    expect(r.success).toBe(true);
    expect((r as any).data.email).toBe('ali@uni.edu.tr');
  });

  it("Türkçe 'ı' içeren adresi DAHA 1. ADIMDA reddeder", () => {
    // Bug: 'ı'lı adres Step1'i geçip son adımda backend'den dönüyordu.
    const r = emailSchema.safeParse({ email: 'alı@uni.edu.tr' });
    expect(r.success).toBe(false);
    expect(msgs(r).join(' ')).toMatch(/Türkçe karakter/);
  });

  it('diğer Türkçe harfleri de reddeder (ş, ğ, ü, ö, ç)', () => {
    for (const email of ['aş@uni.edu.tr', 'ağ@uni.edu.tr', 'aü@uni.edu.tr', 'aö@uni.edu.tr', 'aç@uni.edu.tr']) {
      const r = emailSchema.safeParse({ email });
      expect(r.success).toBe(false);
    }
  });

  it("büyük 'İ' klavye tuzağını da yakalar (toLowerCase → i + birleşen nokta)", () => {
    // 'İ'.toLowerCase() === 'i̇' — gözle 'i' görünür ama ASCII değildir.
    const r = emailSchema.safeParse({ email: 'alİ@uni.edu.tr' });
    expect(r.success).toBe(false);
  });

  it('backend\'in kabul etmediği ASCII karakterleri de reddeder (!, #, %, &, \')', () => {
    // Backend (ASP.NET Identity) yalnız harf/rakam/-._@+ kabul ediyor; RFC'nin
    // izin verdiği diğer karakterler de son adımda patlıyordu.
    for (const email of [
      'ali!x@uni.edu.tr',
      'ali#x@uni.edu.tr',
      'ali%x@uni.edu.tr',
      'ali&x@uni.edu.tr',
      "ali'x@uni.edu.tr",
    ]) {
      const r = emailSchema.safeParse({ email });
      expect(r.success).toBe(false);
      expect(msgs(r).join(' ')).toMatch(/geçersiz karakter/i);
    }
  });

  it('izinli özel karakterleri geçirir (. _ - +)', () => {
    const r = emailSchema.safeParse({ email: 'ali.veli_x-1+test@uni-a.edu.tr' });
    expect(r.success).toBe(true);
  });

  it('@ veya nokta yoksa format mesajı verir', () => {
    const r = emailSchema.safeParse({ email: 'ali.uni.edu.tr' });
    expect(r.success).toBe(false);
    expect(msgs(r)).toContain('Geçerli bir e-posta adresi gir.');
  });

  it('boş alanda mevcut mesaj korunur', () => {
    const r = emailSchema.safeParse({ email: '' });
    expect(r.success).toBe(false);
    expect(msgs(r)).toContain('Lütfen üniversite email adresinizi girin');
  });
});

describe('changeEmailSchema (e-posta değiştirme)', () => {
  const t = i18n.t.bind(i18n);

  it("Türkçe 'ı' içeren yeni adresi reddeder", () => {
    const schema = changeEmailSchema(t);
    const r = schema.safeParse({ currentPassword: 'x', newEmail: 'alı@uni.edu.tr' });
    expect(r.success).toBe(false);
  });

  it('backend\'in kabul etmediği ASCII karakteri reddeder', () => {
    const schema = changeEmailSchema(t);
    const r = schema.safeParse({ currentPassword: 'x', newEmail: 'ali!x@uni.edu.tr' });
    expect(r.success).toBe(false);
  });

  it('geçerli adresi geçirir', () => {
    const schema = changeEmailSchema(t);
    const r = schema.safeParse({ currentPassword: 'x', newEmail: 'ali@uni.edu.tr' });
    expect(r.success).toBe(true);
  });
});
