import api from './api';
import { API_ENDPOINTS } from '../constants/api';

export const authService = {
  // Login
  login: async (email, password) => {
    const response = await api.post(API_ENDPOINTS.LOGIN, {
      email,
      password,
    });
    return response.result;
  },

  // Register
  register: async (userData) => {
    const response = await api.post(API_ENDPOINTS.REGISTER, userData);
    return response.result;
  },

  // Logout
  logout: async () => {
    // Clear local storage or async storage
    return true;
  },

  // Verify Email with Code
  verifyEmailCode: async (email, verificationCode) => {
    const response = await api.post(API_ENDPOINTS.VERIFY_EMAIL_CODE, {
      email,
      verificationCode,
    });
    return response;
  },

  // Resend Verification Code
  resendVerification: async (email) => {
    const response = await api.post(API_ENDPOINTS.RESEND_VERIFICATION, {
      email,
    });
    return response;
  },

  // Verify Email (old method with userId and token)
  verifyEmail: async (userId, token) => {
    const response = await api.get(
      `${API_ENDPOINTS.VERIFY_EMAIL}?userId=${userId}&token=${token}`
    );
    return response.result;
  },

  // Forgot Password
  forgotPassword: async (email) => {
    const response = await api.post(API_ENDPOINTS.FORGOT_PASSWORD, { email });
    return response.result;
  },

  // Reset Password
  resetPassword: async (email, resetCode, newPassword) => {
    const response = await api.post(API_ENDPOINTS.RESET_PASSWORD, {
      email,
      resetCode,
      newPassword,
    });
    return response.result;
  },
};
