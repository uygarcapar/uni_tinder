import { API_BASE_URL, API_ENDPOINTS } from '@/shared/constants/api';
import { devLog } from '@/shared/utils/devLog';

/**
 * `emailVerifiedToken`'ın hâlâ geçerli olup olmadığı.
 *
 * Üç durumlu olması şart: ağ hatasını "geçersiz" saymak, çevrimdışı açılan
 * kullanıcının yarım kaydını silerdi. 'unknown' = "bilmiyoruz, veriye dokunma".
 */
export type RegistrationTokenCheck = 'valid' | 'invalid' | 'unknown';

/**
 * check-registration-token — üç çağıran var (soğuk açılış resume'si, Step1'in
 * "token zaten var" kısayolu, Step15'in gönderim öncesi kontrolü) ve üçü de
 * aynı endpoint'i farklı şekillerde yorumluyordu. Tek yerden.
 *
 * Auth header YOK: bu uç, henüz hesabı olmayan kullanıcı için çalışıyor.
 */
export async function checkRegistrationToken(
  email?: string | null,
  emailVerifiedToken?: string | null,
): Promise<RegistrationTokenCheck> {
  if (!email || !emailVerifiedToken) return 'invalid';
  try {
    const response = await fetch(
      `${API_BASE_URL}${API_ENDPOINTS.CHECK_REGISTRATION_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, emailVerifiedToken }),
      },
    );
    const data = await response.json();
    return data?.isSuccess ? 'valid' : 'invalid';
  } catch (error) {
    devLog('⚠️ [checkRegistrationToken] network error:', error);
    return 'unknown';
  }
}
