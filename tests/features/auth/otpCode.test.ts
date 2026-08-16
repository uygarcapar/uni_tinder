/**
 * Doğrulama kodunun yapıştırılabilmesi buna bağlı: OTP kütüphanesi ham metni
 * numeric regex'iyle komple reddettiği için, panodan/mail'den gelen metni
 * kütüphaneye vermeden önce burada 6 haneye indiriyoruz.
 */

import { extractOtp, OTP_LENGTH } from '@/features/auth/otpCode';

describe('extractOtp', () => {
  it('temiz kodu olduğu gibi döndürür', () => {
    expect(extractOtp('123456')).toBe('123456');
  });

  it('kopyalarken takılan boşluk/satır sonunu atar', () => {
    expect(extractOtp(' 123456\n')).toBe('123456');
  });

  it('mail metninin içindeki kodu bulur', () => {
    expect(extractOtp('Your code is 483920. It expires in 10 minutes.')).toBe('483920');
  });

  it('metindeki diğer sayılara takılmaz', () => {
    expect(extractOtp('Lit 2026 kodun: 123456')).toBe('123456');
  });

  it('parçalı yapıştırmada haneleri birleştirir', () => {
    expect(extractOtp('12 34 56')).toBe('123456');
  });

  it('yazım sırasındaki eksik kodu bozmadan geçirir', () => {
    expect(extractOtp('12')).toBe('12');
  });

  it('fazla haneyi kırpar', () => {
    expect(extractOtp('1234567')).toHaveLength(OTP_LENGTH);
  });

  it('rakam yoksa boş döner — kutular temiz kalır', () => {
    expect(extractOtp('kod gelmedi')).toBe('');
  });
});
