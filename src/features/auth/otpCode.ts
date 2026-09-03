/** E-posta doğrulama kodunun hane sayısı. */
export const OTP_LENGTH = 6;

/**
 * Kod alanının form şekli — kodu tutan DÖRT ekranın ortak tipi (kayıt
 * doğrulama, şifre sıfırlama, şifre değiştirme, e-posta değiştirme).
 *
 * Kod hepsinde react-hook-form'da duruyor, ekran state'inde değil: her hane
 * ekran state'ini güncellediğinde 140px ikonu, başlığı, OTP kutularını ve
 * tekrar-gönder satırını birden yeniden render ediyordu. Forma yalnızca gerçekten
 * kodun uzunluğunu bilmesi gereken bileşen abone oluyor (bkz. RegisterStep2'deki
 * VerifyButton); geri kalan ekranlarda hiçbir abone yok.
 */
export type CodeForm = { code: string };

/**
 * Ham metinden (pano, iOS autofill, elle yazım) 6 haneli kodu ayıklar.
 *
 * react-native-otp-entry gelen değeri `type="numeric"` regex'iyle komple
 * reddediyor: mail'den kopyalanan kodun sonundaki boşluk/satır sonu ya da
 * "Kodunuz: 123456" gibi bir metin yapıştırıldığında hiçbir hane girilmiyordu.
 * Ayrıca kütüphanenin maxLength'i uzun yapıştırmayı ilk 6 karaktere kırpıp
 * kodu tamamen bozuyordu. Bu yüzden native input'un maxLength'i kaldırılıp
 * ham metin buradan geçiriliyor.
 */
export function extractOtp(raw: string): string {
  // Önce tek başına duran 6 haneli blok ("Lit 2026 kodun: 123456" → 123456).
  const standalone = raw.match(/\b\d{6}\b/);
  if (standalone) return standalone[0];
  // Kod parçalıysa ("12 34 56") ya da kullanıcı yazıyorsa (henüz 6 hane yok)
  // tüm haneleri topla.
  return raw.replace(/\D/g, "").slice(0, OTP_LENGTH);
}
