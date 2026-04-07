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

api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;

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
      if (!refreshToken) {
        // No refresh token available - clear tokens and reject
        isRefreshing = false;
        await clearAllTokens();
        setCurrentAccessToken(null);
        // Trigger logout in Redux (will be handled by App.js)
        return Promise.reject(error);
      }

      try {
        // Request new access token using refresh token
        const response = await axios.post(
          `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
          { refreshToken }
        );

        const { token: newAccessToken, refreshToken: newRefreshToken } = response.data.result;

        // Save new tokens
        setCurrentAccessToken(newAccessToken);
        await saveAccessToken(newAccessToken);
        await saveRefreshToken(newRefreshToken);

        // Notify listeners (e.g. Redux store) of the new token
        if (onTokenRefreshed) onTokenRefreshed(newAccessToken);

        // Process queued requests with new token
        processQueue(null, newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token is invalid or expired
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
