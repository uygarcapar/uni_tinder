import axios, { AxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '@/shared/constants/api';
import { getRefreshToken, saveRefreshToken, saveAccessToken, clearAllTokens } from '@/shared/utils/tokenStorage';
import { recordRequest } from '@/shared/debug/netTally';
import { isSelfInflictedForceLogout } from '@/shared/utils/sessionGuard';
import { reportError } from '@/shared/services/sentry';
import { devLog } from '@/shared/utils/devLog';

let currentAccessToken: string | null = null;
let currentLanguage: 'tr' | 'en' = 'tr';

export const setCurrentLanguage = (lang: 'tr' | 'en') => {
  currentLanguage = lang;
};

// Optional callback: called after a successful background token refresh
// Register from AppNavigator to keep Redux in sync without circular imports
let onTokenRefreshed: ((token: string, refreshToken: string) => void) | null = null;
export const setOnTokenRefreshed = (cb: (token: string, refreshToken: string) => void) => {
  onTokenRefreshed = cb;
};

// Optional callback: called when refresh token fails / is missing → kullanıcı
// logout edilmeli. AppNavigator dispatch(logout())'u burada tetikler.
// reason ile "başka cihazdan giriş" vs "session expired" ayrılır — birinci
// durumda kullanıcıya toast gösterilir, ikincisinde sessiz logout.
export type AuthLostReason = 'new_login_elsewhere' | 'session_expired';
let onAuthLost: ((reason: AuthLostReason) => void) | null = null;
export const setOnAuthLost = (cb: (reason: AuthLostReason) => void) => {
  onAuthLost = cb;
};

export const setCurrentAccessToken = (token: string | null) => {
  currentAccessToken = token;
};

export const getCurrentAccessToken = (): string | null => {
  return currentAccessToken;
};

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.request.use(
  (config) => {
    recordRequest(config.method || 'GET', config.url || '');
    if (currentAccessToken) {
      config.headers.Authorization = `Bearer ${currentAccessToken}`;
      const tokenPreview = currentAccessToken.substring(0, 20) + '...';
      devLog(`🔐 Request: ${config.method?.toUpperCase()} ${config.url} - Token: ${tokenPreview}`);
    } else {
      devLog(`⚠️ Request: ${config.method?.toUpperCase()} ${config.url} - Token YOK!`);
    }
    config.headers['Accept-Language'] = currentLanguage;
    // FormData gönderilirken Content-Type'ı sil —
    // React Native'in native kodu doğru multipart/form-data boundary'yi otomatik ekler.
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Single-flight refresh — eşzamanlı çağrılar tek HTTP refresh isteğine konsolide edilir.
// realtimeService (SignalR) accessTokenFactory ve axios 401 interceptor'ı bunu paylaşır;
// aksi halde token refresh anında her ikisi de ayrı POST atar → bir taraf eski token ile
// 401 alır, sonsuz reconnect loop.
let inFlightRefresh: Promise<string | null> | null = null;

export const refreshAccessToken = async (): Promise<string | null> => {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const rt = await getRefreshToken();
      if (!rt) {
        devLog('❌ Refresh token bulunamadı — Logout');
        await clearAllTokens();
        setCurrentAccessToken(null);
        if (onAuthLost) onAuthLost('session_expired');
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
      devLog('✅ Token refresh başarılı (single-flight)');
      return newAccessToken as string;
    } catch (err: any) {
      devLog('❌ Token refresh başarısız:', err?.response?.status, err?.message);
      // Backend revoke sinyali: başka cihazdan giriş yapıldıysa reason'ı taşı ki
      // AppNavigator "başka cihazdan giriş" toast'ını gösterebilsin. Diğer refresh
      // fail'leri (normal expiry, network, rotate edilmiş token'ın tekrar
      // gönderilmesi → REFRESH_TOKEN_INVALID + reason:null) sessiz logout ile
      // ilerler. Ayrım errorCode'a değil doğrudan reason'a bakıyor — backend
      // revoke edilmiş token için errorCode'u değiştirse de sınıflandırma tutar.
      const data = err?.response?.data;
      const reason: AuthLostReason =
        data?.reason === 'new_login_elsewhere' ? 'new_login_elsewhere' : 'session_expired';

      // Kendi login'imizin penceresindeysek bu, önceki oturumdan kalmış bir
      // isteğin revoke edilmiş eski refresh token'la denemesi. Token'ları
      // temizlemek login'in az önce yazdığı TAZE refresh token'ı silerdi;
      // logout dispatch etmek de yeni oturumu düşürürdü. İsteği başarısız
      // bırakıp çık.
      if (isSelfInflictedForceLogout()) {
        devLog('↩️ Refresh fail yok sayıldı — kendi login penceremiz, eski token');
        return null;
      }

      await clearAllTokens();
      setCurrentAccessToken(null);
      if (onAuthLost) onAuthLost(reason);
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
};

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest: AxiosRequestConfig & { _retry?: boolean; _retryCount?: number } = error.config;

    // 429 Too Many Requests — exponential backoff (max 3 deneme)
    if (error.response?.status === 429) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      if (originalRequest._retryCount <= 3) {
        const retryAfter = error.response.headers?.['retry-after'];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : 1000 * Math.pow(2, originalRequest._retryCount - 1);
        devLog(`⏳ 429 alındı, ${delay}ms bekleyip tekrar denenecek (deneme ${originalRequest._retryCount}/3)`);
        await sleep(delay);
        return api(originalRequest);
      }
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            (originalRequest as any).headers.Authorization = `Bearer ${token}`;
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
        (originalRequest as any).headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Sunucu hatalarını (5xx) raporla; 4xx beklenen akış (validasyon, quota,
    // 401-refresh) olduğu için gürültü yaratmasın. Ağ hataları (response yok)
    // offline'da çok sık — onlar da raporlanmaz. DSN yoksa no-op.
    if (error.response?.status >= 500) {
      reportError(error, {
        url: originalRequest?.url,
        method: originalRequest?.method,
        status: error.response.status,
      });
    }

    return Promise.reject(error);
  }
);

// Response interceptor (yukarıda) tüm başarılı çağrılarda `response.data` döner —
// yani çağıranlar AxiosResponse değil, doğrudan backend payload'ını alır. Default
// axios tipleri bunu bilmediği için her call site'ta `.result` / `.isSuccess` gibi
// alanlar TS hatası veriyordu. Burada wrapper tipiyle bu unwrap'i compile-time'a
// taşıyoruz.
type ApiClient = {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T>;
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T>;
  interceptors: typeof api.interceptors;
};

export default api as unknown as ApiClient;
