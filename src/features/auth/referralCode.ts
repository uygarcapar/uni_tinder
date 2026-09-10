/**
 * Davet kodu (referral) — uzunluk, alfabe ve ham metinden ayıklama.
 *
 * `otpCode.ts`teki `extractOtp` NEDEN YENİDEN KULLANILMIYOR: o yardımcı
 * RAKAM-ONLY (`raw.replace(/\D/g, "")`). Davet kodu 5 karakterli ve harf
 * içeriyor; extractOtp'tan geçirilen "AK7M2" geriye yalnız "72" bırakırdı.
 */

/** Kodun karakter sayısı — backend `[StringLength(5)]` ile aynı. */
export const REFERRAL_CODE_LENGTH = 5;

/**
 * Kodun alfabesi — backend'deki `ReferralCode.Alphabet` ile BİREBİR aynı.
 * I, L, O, 0 ve 1 bilerek YOK: kod sesli/yazılı paylaşılıyor ve bu beşi
 * birbirine karışıyor.
 */
export const REFERRAL_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Alfabe dışı her karakteri eleyen sınıf — tek yerden türetiliyor. */
const OUTSIDE_ALPHABET = new RegExp(`[^${REFERRAL_ALPHABET}]`, "g");
/** Metnin içinde tek başına duran kod bloğu. */
const STANDALONE = new RegExp(
  `\\b[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_LENGTH}}\\b`,
);

/**
 * Kullanıcının yazdığı/yapıştırdığı değeri koda çevirir: büyük harfe alır,
 * alfabe dışını atar, 5 karaktere kırpar.
 *
 * "ak7m2 " → "AK7M2", "AK-7M2" → "AK7M2", "ak7m2x" → "AK7M2".
 */
export function normalizeReferralCode(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(OUTSIDE_ALPHABET, "")
    .slice(0, REFERRAL_CODE_LENGTH);
}

/**
 * Pano metninden kodu ayıklar.
 *
 * Paylaşım mesajı bir CÜMLE ("Lit'e katıl, kayıt olurken kodumu gir: AK7M2"),
 * yani ham normalize etmek cümlenin tüm harflerini koda yapıştırırdı. Önce tek
 * başına duran 5'lik blok aranıyor; bulunamazsa (kullanıcı kodu elle yazıyor,
 * ya da araya tire koymuş) normalize'a düşülüyor.
 */
export function extractReferralCode(raw?: string | null): string {
  if (!raw) return "";
  const standalone = raw.toUpperCase().match(STANDALONE);
  if (standalone) return standalone[0];
  return normalizeReferralCode(raw);
}

/**
 * Kod alanının form şekli — `otpCode.ts`teki `CodeForm` ile aynı gerekçe:
 * kod react-hook-form'da duruyor, ekran state'inde değil.
 */
export type ReferralCodeForm = { code: string };
