import axios from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { getRefreshToken, saveRefreshToken, saveAccessToken, clearAllTokens } from '../utils/tokenStorage';

// Global access token holder for interceptors
let currentAccessToken = null;

// Optional callback: called after a successful background token refresh
// Register from AppNavigator to keep Redux in sync without circular imports
let onTokenRefreshed = null;
export const setOnTokenRefreshed = (cb) => { onTokenRefreshed = cb; };

// Optional callback: called when refresh token fails / is missing → kullanıcı
// logout edilmeli. AppNavigator dispatch(logout())'u burada tetikler.
let onAuthLost = null;
export const setOnAuthLost = (cb) => { onAuthLost = cb; };

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

// Single-flight refresh — eşzamanlı çağrılar tek HTTP refresh isteğine konsolide edilir.
// realtimeService (SignalR) accessTokenFactory ve axios 401 interceptor'ı bunu paylaşır;
// aksi halde token refresh anında her ikisi de ayrı POST atar → bir taraf eski token ile
// 401 alır, sonsuz reconnect loop.
let inFlightRefresh = null;

/**
 * Refresh token ile yeni access token al. Başarısızsa null döner ve onAuthLost() tetiklenir.
 * SignalR accessTokenFactory ve axios 401 interceptor aynı promise'i paylaşır (single-flight).
 */
export const refreshAccessToken = async () => {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const rt = await getRefreshToken();
      if (!rt) {
        console.log('❌ Refresh token bulunamadı — Logout');
        await clearAllTokens();
        setCurrentAccessToken(null);
        if (onAuthLost) onAuthLost();
        return null;
      }

      const response = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
        { refreshToken: rt }
      );

      const { token: newAccessToken, refreshToken: newRefreshToken } = response.data.result;
      setCurrentAccessToken(newAccessToken);
      await saveAccessToken(newAccessToken);
      await saveRefreshToken(newRefreshToken);
      if (onTokenRefreshed) onTokenRefreshed(newAccessToken, newRefreshToken);
      console.log('✅ Token refresh başarılı (single-flight)');
      return newAccessToken;
    } catch (err) {
      console.log('❌ Token refresh başarısız:', err?.response?.status, err?.message);
      await clearAllTokens();
      setCurrentAccessToken(null);
      if (onAuthLost) onAuthLost();
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
};

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

      try {
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
          processQueue(error, null);
          return Promise.reject(error);
        }
        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
