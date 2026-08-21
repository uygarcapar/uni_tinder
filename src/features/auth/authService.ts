import api, { SKIP_429_RETRY, setCurrentAccessToken } from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import axios from 'axios';
import { API_BASE_URL } from '@/shared/constants/api';
import {
  getRefreshToken,
  clearAllTokens,
  saveAccessToken,
  saveRefreshToken,
} from '@/shared/utils/tokenStorage';
import {
  markSelfPasswordChange,
  clearSelfPasswordChangeMark,
} from '@/shared/utils/sessionGuard';
import { logoutRevenueCat } from '@/features/profile/subscriptionService';

export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post(API_ENDPOINTS.LOGIN, { email, password });
    return (response as any).result;
  },

  register: async (userData: Record<string, any>) => {
    const response = await api.post(API_ENDPOINTS.REGISTER, userData);
    return (response as any).result;
  },

  logout: async (): Promise<boolean> => {
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        await axios.post(`${API_BASE_URL}${API_ENDPOINTS.REVOKE_TOKEN}`, { refreshToken }).catch(() => {});
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // RC SDK kullanıcısını anonime düşür — aksi halde aynı cihazda yeni
      // hesap açılınca getCustomerInfo eski kullanıcının premium entitlement'ını
      // dönüp yeni hesabı yanlışlıkla premium gösteriyor.
      await logoutRevenueCat().catch(() => {});
      await clearAllTokens();
    }
    return true;
  },

  refreshToken: async (refreshToken: string) => {
    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
      { refreshToken }
    );
    return response.data.result;
  },

  validateToken: async (token: string) => {
    const response = await axios.get(`${API_BASE_URL}${API_ENDPOINTS.VALIDATE_TOKEN}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data.result;
  },

  /**
   * SignalR `ForceLogout` yaptırım sinyali geldiğinde çağrılır. Hub payload'ında
   * yalnız `reason` var — gerekçe metni ve bitiş tarihi yok. Bu uç aynı bilgiyi
   * 403 + dolu gövde ile döndürüyor; çıplak axios değil `api` üzerinden gider ki
   * interceptor yakalayıp ban ekranını açsın. Dönen değer kullanılmaz.
   */
  probeAccountStatus: async (): Promise<void> => {
    await api.get(API_ENDPOINTS.VALIDATE_TOKEN);
  },

  verifyEmailCode: async (email: string, verificationCode: string): Promise<any> => {
    return api.post(API_ENDPOINTS.VERIFY_EMAIL_CODE, { email, verificationCode });
  },

  resendVerification: async (email: string): Promise<any> => {
    return api.post(API_ENDPOINTS.RESEND_VERIFICATION, { email });
  },

  verifyEmail: async (userId: string, token: string) => {
    const response = await api.get(`${API_ENDPOINTS.VERIFY_EMAIL}?userId=${userId}&token=${token}`);
    return (response as any).result;
  },

  /**
   * Şifre sıfırlama kodu maili ister.
   *
   * Kullanıcı sayımını (enumeration) engellemek için backend, e-posta kayıtlı
   * OLMASA da isSuccess:true ve aynı mesajı döner — çağıran taraf "hesap var mı"
   * bilgisini buradan çıkaramaz, çıkarmaya da çalışmamalı.
   *
   * `result` null geldiği için zarfın tamamı dönüyor: akış isSuccess/message
   * alanlarına bakıyor.
   */
  forgotPassword: async (email: string) => {
    return api.post(API_ENDPOINTS.FORGOT_PASSWORD, { email }, SKIP_429_RETRY);
  },

  /**
   * Kod + yeni şifre TEK istekte gider; backend'de ayrı bir "sıfırlama kodunu
   * doğrula" ucu YOK. Doğrulama sırası ÖNCE KOD, sonra şifre: yanlış kod +
   * zayıf şifre gönderilirse UT-1010 değil UT-1006 döner. Yani UT-1010 ancak
   * kod doğruyken görülür ve o durumda kod YANMAZ — kullanıcı aynı kodla daha
   * güçlü bir şifre girebilmeli (bkz. parsePasswordError.keepCode).
   *
   * Başarıda backend tüm oturumları iptal eder ve — ChangePassword'ün aksine —
   * yeni token seti DÖNMEZ; çağıran taraf logout etmek zorunda.
   */
  resetPassword: async (email: string, resetCode: string, newPassword: string) => {
    return api.post(
      API_ENDPOINTS.RESET_PASSWORD,
      { email, resetCode, newPassword },
      SKIP_429_RETRY,
    );
  },

  /**
   * ADIM A1 — mevcut şifreyi doğrular ve maile 6 haneli onay kodu yollar.
   *
   * Şifre değiştirmenin iki faktörlü olmasının sebebi: şifresi sızmış bir
   * hesapta tek faktör saldırganın şifreyi değiştirip kullanıcıyı tamamen
   * kilitlemesine yeterdi. Mevcut şifre BURADA doğrulanıyor — yanlışsa
   * (UT-1003) kod hiç gönderilmez, yani bu uç kullanıcının mailini
   * spam'lemeye de yaramaz.
   */
  requestPasswordChangeCode: async (currentPassword: string) => {
    return api.post(
      API_ENDPOINTS.REQUEST_PASSWORD_CHANGE_CODE,
      { currentPassword },
      SKIP_429_RETRY,
    );
  },

  /**
   * ADIM A2 — onay kodu + yeni şifre. `userId` GÖNDERİLMEZ: backend token'dan
   * alıyor, gövdedekini yok sayıyor.
   *
   * Başarıda backend tüm oturumları iptal ediyor (mevcut refresh token'ımız
   * dahil) ve cevapta YENİ bir token seti veriyor. Bu set diske yazılmazsa
   * bir sonraki istek 401 alır, refresh de revoke edildiği için başarısız olur
   * → beklenmedik logout. Bu yüzden yazma işi çağırana bırakılmadı, burada
   * yapılıyor; Redux'ı tazelemek için `result.user` + token'lar dönülüyor.
   *
   * Damga isteğin ÖNCESİNDE atılıyor: ForceLogout push'u sunucu tarafında
   * cevap bize ulaşmadan çıkıyor, sonradan damgalamak yarışı kaybederdi.
   */
  changePassword: async (
    currentPassword: string,
    newPassword: string,
    confirmationCode: string,
  ) => {
    markSelfPasswordChange();
    try {
      // PUT — diğer üç şifre ucu POST.
      const response = await api.put(
        API_ENDPOINTS.CHANGE_PASSWORD,
        { currentPassword, newPassword, confirmationCode },
        SKIP_429_RETRY,
      );
      const result = (response as any)?.result;
      if (result?.accessToken) {
        setCurrentAccessToken(result.accessToken);
        await saveAccessToken(result.accessToken);
      }
      if (result?.refreshToken) {
        await saveRefreshToken(result.refreshToken);
      }
      // Pencereyi cevap anından yeniden başlat: istek 30sn'ye kadar sürebilir,
      // ForceLogout ise cevaptan sonra da gecikmeli gelebilir.
      markSelfPasswordChange();
      return response;
    } catch (error) {
      clearSelfPasswordChangeMark();
      throw error;
    }
  },

  getUserById: async (userId: string, token: string) => {
    const response = await api.get(`${API_ENDPOINTS.GET_USER}/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response;
  },
};
