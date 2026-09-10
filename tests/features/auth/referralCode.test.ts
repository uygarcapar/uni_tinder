/**
 * Davet kodunun normalize/ayıklama kuralları.
 *
 * Kritik gerekçe: `otpCode.extractOtp` RAKAM-ONLY. Aynı yardımcıyı burada
 * kullanmak "AK7M2"yi "72"ye indirirdi — bu suite o hatanın geri dönmesini
 * engelliyor.
 */

import {
  REFERRAL_ALPHABET,
  REFERRAL_CODE_LENGTH,
  extractReferralCode,
  normalizeReferralCode,
} from '@/features/auth/referralCode';

describe('REFERRAL_ALPHABET', () => {
  it('5 karakterlik kod, backend alfabesiyle aynı', () => {
    expect(REFERRAL_CODE_LENGTH).toBe(5);
    expect(REFERRAL_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  });

  it('karışan karakterleri (I, L, O, 0, 1) İÇERMİYOR', () => {
    // Kod sesli ve yazılı paylaşılıyor; bu beşi ayırt etmek mümkün değil.
    for (const ch of ['I', 'L', 'O', '0', '1']) {
      expect(REFERRAL_ALPHABET).not.toContain(ch);
    }
  });
});

describe('normalizeReferralCode', () => {
  it('büyük harfe alır ve boşlukları atar', () => {
    expect(normalizeReferralCode('ak7m2 ')).toBe('AK7M2');
    expect(normalizeReferralCode(' ak7m2')).toBe('AK7M2');
  });

  it('alfabe dışı karakterleri eler', () => {
    expect(normalizeReferralCode('AK-7M2')).toBe('AK7M2');
    expect(normalizeReferralCode('A.K 7/M2')).toBe('AK7M2');
    // I, L, O, 0, 1 alfabede yok → düşüyorlar.
    expect(normalizeReferralCode('AIK7LM2')).toBe('AK7M2');
  });

  it('5 karakterden uzun girdiyi kırpar', () => {
    expect(normalizeReferralCode('AK7M2XYZ')).toBe('AK7M2');
  });

  it('yarım kodu OLDUĞU GİBİ döndürür — kullanıcı hâlâ yazıyor olabilir', () => {
    expect(normalizeReferralCode('AK7')).toBe('AK7');
  });

  it('boş/null girdide boş string', () => {
    expect(normalizeReferralCode('')).toBe('');
    expect(normalizeReferralCode(null)).toBe('');
    expect(normalizeReferralCode(undefined)).toBe('');
    // Tamamı alfabe dışı.
    expect(normalizeReferralCode('101-oil')).toBe('');
  });
});

describe('extractReferralCode', () => {
  it('paylaşım mesajının içinden kodu bulur', () => {
    // Ham normalize edilseydi cümlenin tüm harfleri koda yapışırdı.
    const message = "Lit'e katıl, kayıt olurken kodumu gir: AK7M2\nhttps://lit.4ourstack.com/app";
    expect(extractReferralCode(message)).toBe('AK7M2');
  });

  it('küçük harfle yapıştırılan kodu da bulur', () => {
    expect(extractReferralCode('kodum ak7m2')).toBe('AK7M2');
  });

  it('tek başına duran kodu doğrudan döndürür', () => {
    expect(extractReferralCode('AK7M2')).toBe('AK7M2');
  });

  it('blok yoksa normalize\'a düşer (tire ile yazılmış kod)', () => {
    expect(extractReferralCode('AK-7M2')).toBe('AK7M2');
  });

  it('blok bulunamazsa normalize\'a düşer — yazım yolu bunu gerektiriyor', () => {
    // İki çağıran var: pano ve native input'un HAM metni. İkincisinde girdi
    // zaten kodun kendisi (yarım da olabilir), o yüzden "5'lik blok yok" boş
    // dönmek değil normalize etmek demek — aksi halde kullanıcı kodu elle
    // yazarken kutular hiç dolmazdı.
    expect(extractReferralCode('merhaba')).toBe('MERHA');
    expect(extractReferralCode('')).toBe('');
    expect(extractReferralCode(null)).toBe('');
  });

  it('extractOtp DEĞİL — harfler korunuyor', () => {
    // Regresyon kilidi: rakam-only bir ayıklayıcı burada "72" döndürürdü.
    expect(extractReferralCode('AK7M2')).not.toBe('72');
  });
});
