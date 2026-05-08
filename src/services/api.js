import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { getRefreshToken, saveRefreshToken, saveAccessToken, clearAllTokens } from '../utils/tokenStorage';

// Global access token holder for interceptors
let currentAccessToken = null;

// Optional callback: called after a successful background token refresh
// Register from AppNavigator to keep Redux in sync without circular imports
let onTokenRefreshed = null;
export const setOnTokenRefreshed = (cb) => { onTokenRefreshed = cb; };

export const setCurrentAccessToken = (token) => {
  currentAccessToken = token;
};

export const getCurrentAccessToken = () => {
  return currentAccessToken;
};

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - Add access token to all requests
api.interceptors.request.use(
  (config) => {
    if (currentAccessToken) {
      config.headers.Authorization = `Bearer ${currentAccessToken}`;
      // Log only first 20 chars of token for debugging
      const tokenPreview = currentAccessToken.substring(0, 20) + '...';
      console.log(`🔐 Request: ${config.method?.toUpperCase()} ${config.url} - Token: ${tokenPreview}`);
    } else {
      console.log(`⚠️ Request: ${config.method?.toUpperCase()} ${config.url} - Token YOK!`);
    }
    // FormData gönderilirken Content-Type'ı sil —
    // React Native'in native kodu doğru multipart/form-data boundary'yi otomatik ekler.
    // axios'un default 'application/json' header'ı bırakılırsa boundary kaybolur.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle 401 and auto-refresh token
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;

    // 429 Too Many Requests — exponential backoff (max 3 deneme)
    if (error.response?.status === 429) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      if (originalRequest._retryCount <= 3) {
        const retryAfter = error.response.headers?.['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 1000 * Math.pow(2, originalRequest._retryCount - 1);
        console.log(`⏳ 429 alındı, ${delay}ms bekleyip tekrar denenecek (deneme ${originalRequest._retryCount}/3)`);
        await sleep(delay);
        return api(originalRequest);
      }
    }

    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Another refresh is in progress, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = await getRefreshToken();
      console.log('🔄 Token refresh başlatılıyor - Refresh token:', refreshToken ? 'Mevcut' : 'YOK');

      if (!refreshToken) {
        // No refresh token available - clear tokens and reject
        console.log('❌ Refresh token bulunamadı - Logout yapılıyor');
        isRefreshing = false;
        await clearAllTokens();
        setCurrentAccessToken(null);
        // Trigger logout in Redux (will be handled by App.js)
        return Promise.reject(error);
      }

      try {
        // Request new access token using refresh token
        console.log('🔄 Refresh token endpoint\'ine istek gönderiliyor...');
        const response = await axios.post(
          `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
          { refreshToken }
        );

        console.log('✅ Token refresh başarılı');
        const { token: newAccessToken, refreshToken: newRefreshToken } = response.data.result;

        // Save new tokens
        setCurrentAccessToken(newAccessToken);
        await saveAccessToken(newAccessToken);
        await saveRefreshToken(newRefreshToken);

        // Notify listeners (e.g. Redux store) of the new token
        if (onTokenRefreshed) onTokenRefreshed(newAccessToken, newRefreshToken);

        // Process queued requests with new token
        processQueue(null, newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token is invalid or expired
        console.log('❌ Token refresh başarısız:', refreshError?.response?.status, refreshError?.response?.data || refreshError?.message);
        processQueue(refreshError, null);
        await clearAllTokens();
        setCurrentAccessToken(null);
        // Trigger logout in Redux (will be handled by App.js)
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
