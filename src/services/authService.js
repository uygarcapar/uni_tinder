import api from './api';
import { API_ENDPOINTS } from '../constants/api';
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import { getRefreshToken, clearAllTokens } from '../utils/tokenStorage';

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
    try {
      const refreshToken = await getRefreshToken();
      if (refreshToken) {
        // Call revoke token endpoint (fire & forget)
        await axios.post(`${API_BASE_URL}${API_ENDPOINTS.REVOKE_TOKEN}`, {
          refreshToken,
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always clear tokens locally
      await clearAllTokens();
    }
    return true;
  },

  // Refresh Token
  refreshToken: async (refreshToken) => {
    const response = await axios.post(
      `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
      { refreshToken }
    );
    return response.data.result;
  },

  // Validate Token
  validateToken: async (token) => {
    const response = await axios.get(
      `${API_BASE_URL}${API_ENDPOINTS.VALIDATE_TOKEN}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data.result;
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

  // Get User by ID
  getUserById: async (userId, token) => {
    const response = await api.get(`${API_ENDPOINTS.GET_USER}/${userId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response;
  },
};
