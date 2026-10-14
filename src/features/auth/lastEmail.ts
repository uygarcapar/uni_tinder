import { appPrefs } from "@/shared/utils/appPrefs";

/**
 * Son başarılı girişin e-posta adresi — login ekranı önden dolsun diye.
 *
 * `app-prefs` içinde duruyor; logout'ta BİLEREK silinmiyor (zaten amacı
 * çıkıştan sonra hatırlamak). Token deposuyla alakası yok: burada parola yok,
 * yalnız adres var, bu yüzden şifreli depoya gerek de yok.
 *
 * Anahtar userId ile scope'lu DEĞİL — ekran daha kimse giriş yapmamışken
 * okunuyor, o anda userId diye bir şey yok.
 *
 * Yazma noktaları yalnız iki tane: başarılı `login` ve e-posta değişiminin
 * onayı (`confirmEmailChange`). İkincisi kritik — adres değişimi oturumu
 * kapatıyor (bkz. authService.confirmEmailChange), eski adres diskte kalsa
 * kullanıcı kendi kapattığı adresle giriş denerdi.
 */

const KEY = "lastLoginEmail";

/** Diskteki adres. Yoksa/bozuksa boş string — form defaultValue'suna uygun. */
export function loadLastLoginEmail(): string {
  try {
    return appPrefs.getString(KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function saveLastLoginEmail(email: string | null | undefined): void {
  const trimmed = email?.trim();
  if (!trimmed) return;
  try {
    appPrefs.set(KEY, trimmed);
  } catch {
    // Yazılamadıysa bir dahaki girişte alan boş gelir — kozmetik.
  }
}

export function clearLastLoginEmail(): void {
  try {
    appPrefs.remove(KEY);
  } catch {
    // yoksay
  }
}
