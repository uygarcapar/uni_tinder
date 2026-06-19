import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import axios from 'axios';
import { API_BASE_URL } from '@/shared/constants/api';
import { getRefreshToken, clearAllTokens } from '@/shared/utils/tokenStorage';
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

  forgotPassword: async (email: string) => {
    const response = await api.post(API_ENDPOINTS.FORGOT_PASSWORD, { email });
    return (response as any).result;
  },

  resetPassword: async (email: string, resetCode: string, newPassword: string) => {
    const response = await api.post(API_ENDPOINTS.RESET_PASSWORD, { email, resetCode, newPassword });
    return (response as any).result;
  },

  getUserById: async (userId: string, token: string) => {
    const response = await api.get(`${API_ENDPOINTS.GET_USER}/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response;
  },
};
