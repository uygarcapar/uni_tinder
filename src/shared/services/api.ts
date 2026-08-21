import axios, { AxiosRequestConfig } from 'axios';
import { API_BASE_URL, API_ENDPOINTS } from '@/shared/constants/api';
import { getRefreshToken, saveRefreshToken, saveAccessToken, clearAllTokens } from '@/shared/utils/tokenStorage';
import { recordRequest } from '@/shared/debug/netTally';
import { isSelfInflictedForceLogout, isSelfInflictedPasswordChange } from '@/shared/utils/sessionGuard';
import { extractAccountBlock, emitAccountBlocked } from '@/shared/utils/accountBlock';
import { devLog } from '@/shared/utils/devLog';
import { getCurrentRouteName } from '@/shared/services/currentRoute';
import { shortNetError } from '@/shared/utils/netError';

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
//
// `refresh_expired` / `token_reuse` / `session_logout`: backend 2026-08-19'dan
// beri `code` (UT-xxxx) ile ayırt edilebilir gerekçe döndürüyor (bkz.
// TERMINAL_REFRESH_REASONS). Öncesinde üçü de isimsiz 401'di ve hepsi
// `session_expired`e düşüyordu — eski/bilinmeyen gövdeler için o dal duruyor.
export type AuthLostReason =
  | 'new_login_elsewhere'
  | 'password_changed'
  | 'session_expired'
  | 'refresh_expired'
  | 'token_reuse'
  | 'session_logout';
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

const REQUEST_TIMEOUT_MS = 30000;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: REQUEST_TIMEOUT_MS,
});

// Timeout'lar hangi EKRANDA yaşandığı bilinmeden teşhis edilemiyor (aynı
// endpoint Discover'da sorunsuz, Chat'te patlıyor olabilir). İstek anındaki
// aktif route'u config'e mühürleriz — cevap geldiğinde kullanıcı başka ekrana
// geçmiş olabilir, o yüzden "şu an neredeyiz" değil "istek nereden atıldı"
// kaydedilir.
type TimedConfig = AxiosRequestConfig & {
  __startedAt?: number;
  __route?: string;
  __skip429Retry?: boolean;
};

/**
 * 429'da otomatik retry'ı kapatan istek config'i. Rate limit'i kullanıcıya
 * gösterip geri sayım yaptıran ekranlar (şifre uçları) bunu geçirir — bkz.
 * response interceptor'daki 429 dalı.
 */
export const SKIP_429_RETRY = { __skip429Retry: true } as AxiosRequestConfig;

api.interceptors.request.use(
  (config) => {
    recordRequest(config.method || 'GET', config.url || '');
    // Retry'larda (429/401) interceptor tekrar koşar → süre son denemeyi ölçer.
    (config as TimedConfig).__startedAt = Date.now();
    (config as TimedConfig).__route = getCurrentRouteName();
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

/**
 * Yaptırımlı hesap (ban/askı/silme) tespit edildiğinde ortak kapanış: oturumu
 * yerelde tamamen düşür ve UI'ı bilgilendir. `revoke-token` ÇAĞRILMAZ — token
 * backend'de zaten iptal edildi ve o uç da 403 döner.
 */
const handleBlockedResponse = async (error: any): Promise<boolean> => {
  const blocked = extractAccountBlock(error);
  if (!blocked) return false;
  devLog(`⛔ Hesap yaptırımı: ${blocked.errorCode} (${blocked.reason})`);
  await clearAllTokens();
  setCurrentAccessToken(null);
  emitAccountBlocked(blocked);
  return true;
};

/**
 * Refresh POST'unun kendi timeout'u — genel 30 sn DEĞİL.
 *
 * Gövde iki alanlık; 10 sn'de dönmediyse ağ zaten sağlıklı değil. Kısa tutmanın
 * asıl sebebi aşağıdaki retry: üç deneme 30 sn'lik timeout'la kuyruğu 90+ sn
 * askıda bırakırdı. 10 sn × 3 + backoff ≈ 33 sn, yani en kötü hâl eski TEK
 * denemeninkiyle aynı kalıyor ama üç şansımız oluyor.
 */
const REFRESH_TIMEOUT_MS = 10_000;
const REFRESH_MAX_ATTEMPTS = 3;
/** 1. → 2. deneme arası, 2. → 3. deneme arası. */
const REFRESH_RETRY_BACKOFF_MS = [1_000, 2_000];

/**
 * Sunucu refresh token hakkında HÜKÜM VERMEDEN düşen istek → aynı token'la
 * tekrar denenebilir.
 *
 * 2026-08-19'a kadar tekrar denemek TEHLİKELİYDİ: rotasyon tek kullanımlıktı,
 * cevabı kaybolan bir refresh'i tekrarlamak "ölü token" 401'i getiriyordu.
 * Backend artık 60 sn'lik grace penceresi tutuyor — pencere içinde aynı token
 * ya birebir aynı çifti ya da yeni bir çift döndürüyor, iki hâlde de oturum
 * ayakta kalıyor. Bu fonksiyon o pencerenin istemci tarafındaki karşılığı.
 *
 * `isTransientRefreshFailure`'dan farkı 429: sunucu CEVAP VERDİ ve "yavaşla"
 * dedi, 1 sn sonra tekrar denemek tam da yasakladığı şey. Oturumu düşürmüyoruz
 * (o hâlâ geçici bir hata) ama turu da uzatmıyoruz — sonraki istek yeniden
 * dener.
 *
 * ⚠️ Grace penceresi sunucuda kapatılabiliyor (`Auth__RefreshGraceSeconds=0`).
 * Bu yüzden deneme sayısı SINIRLI: pencere kapalıyken davranış eskisine döner
 * (ilk deneme cevabı kaybolduysa ikincisi 401 yer), sonsuz retry ise oturumu
 * kurtarmadığı gibi kullanıcıyı dakikalarca bekletirdi.
 */
const isRetriableRefreshFailure = (error: any): boolean => {
  const status = error?.response?.status;
  if (status === undefined || status === null) return true;
  return status >= 500 || status === 408;
};

/**
 * `/refresh-token` 401 gövdesindeki ayırt edici kod → oturum kapanış gerekçesi.
 * Gövde TOP-LEVEL (ResponseDto sarmalayıcısı yok): `data.code`.
 *
 *   UT-1014 refresh_expired → token'ın 30 günü doldu (normal, endişe verici değil)
 *   UT-1015 token_reuse / token_unknown → ölü token grace DIŞINDA kullanıldı
 *   UT-1016 session_logout → bu ya da başka bir cihazda çıkış yapılmış
 *   UT-1005 token_missing → istek boş token'la gitti (istemci bug'ı) → SESSİZ
 *
 * `reason` alanı UT-1015'in iki hâlini (`token_reuse` / `token_unknown`)
 * ayırıyor; kullanıcı açısından ikisi aynı, ayrım yalnız teşhis için.
 */
const TERMINAL_REFRESH_REASONS: Record<string, AuthLostReason> = {
  'UT-1014': 'refresh_expired',
  'UT-1015': 'token_reuse',
  'UT-1016': 'session_logout',
  'UT-1005': 'session_expired',
};

/**
 * Gövdedeki UT kodu. Yeni sözleşme `code`, eski yanıtlar aynı kodu `errorCode`
 * alanında taşıyabiliyor (yaptırım gövdeleri hâlâ öyle) — ikisi de okunuyor.
 */
const refreshErrorCodeOf = (data: any): string | null => {
  for (const raw of [data?.code, data?.errorCode]) {
    if (typeof raw === 'string' && raw.startsWith('UT-')) return raw;
  }
  return null;
};

/**
 * Retry turu bittikten sonra elde kalan hata → oturum kararı. `null` döndürür:
 * çağıran zaten "token alamadım" diyor, oturumun düşüp düşmediği state'ten
 * okunuyor.
 */
const handleRefreshFailure = async (err: any, attempts: number): Promise<null> => {
  devLog('❌ Token refresh başarısız:', err?.response?.status, err?.message);
  if (isTimeoutError(err)) {
    logNetworkFailure(
      'TIMEOUT',
      { method: 'POST', url: API_ENDPOINTS.REFRESH_TOKEN, __route: getCurrentRouteName() },
      `${REFRESH_TIMEOUT_MS}ms limiti aşıldı (token refresh, ${attempts} deneme)`,
    );
  }
  // Yaptırım kontrolü hem self-login penceresinden hem de onAuthLost
  // sınıflandırmasından ÖNCE: gerçek bir ban kendi login penceremize denk
  // gelirse "yok say" dalına düşüp sessizce kaybolurdu.
  if (await handleBlockedResponse(err)) return null;

  // GEÇİCİ HATA ≠ OTURUM İPTALİ. Sunucu token'ı reddetmedikçe token'lara
  // DOKUNMA: ağ hatası, timeout, 5xx ve 429'da yalnız isteği düşür.
  //
  // Eskiden her catch dalı clearAllTokens + logout işletiyordu. En sık
  // tetikleyici arka plandan dönüş: AppState 'active' bloğu tek seferde
  // ~7 istek atıyor, arka planda expire olmuş access token hepsini 401'e
  // düşürüyor ve refresh tam radyo oturmadan (wifi↔LTE devri, uyandırma)
  // uçuyordu. Ulaşamadığı için düşen tek bir istek kullanıcıyı oturumdan
  // atıyordu. iOS refresh POST'u uçarken uygulamayı askıya alırsa da
  // axios'un timeout sayacı donuyor, dönüşte istek network error olarak
  // düşüyor — aynı dal.
  //
  // Oturum ayakta bırakıldığında akış kendi kendini onarıyor: access token
  // hâlâ bayat olduğu için sonraki istek yine 401 alıp refresh'i tekrar
  // deniyor, ağ geldiğinde ilk deneme tutuyor. Refresh token'ı GERÇEKTEN
  // ölmüşse sunucu cevap verir vermez aşağıdaki kesin dal işliyor.
  if (isTransientRefreshFailure(err)) {
    devLog(
      `🔌 Refresh geçici hatayla düştü (${attempts} deneme) — oturum korunuyor, sonraki istekte yeniden denenecek`,
    );
    return null;
  }

  // Buradan aşağısı: SUNUCU CEVAP VERDİ ve token'ı reddetti (4xx).
  //
  // Karar hâlâ "4xx ⇒ oturum bitti"; `code` yalnız GEREKÇEYİ (dolayısıyla
  // kullanıcıya gösterilecek metni) seçiyor. Entegrasyon dokümanının önerdiği
  // "yalnız bilinen terminal kodlarda logout" kuralı BİLEREK alınmadı: kod
  // taşımayan bir 401 (eski sürüm, çıplak 401 = 30 gün doldu, araya giren
  // proxy) o kuralla oturumu ölü token'la ayakta bırakır ve kullanıcı her
  // istekte üç kez denenip düşen bir zombi oturumda kalırdı.
  //
  // /refresh-token 401'inin ÜÇ ŞEKLİ (2026-08-19 öncesi backend):
  //   1. reason dolu → RevokedReason yazılmış: login (new_login_elsewhere) ve
  //      şifre akışları bu alanı dolduruyor. `code`tan ÖNCE bakılır: bu iki
  //      akışın kendi UI'ı var.
  //   2. REFRESH_TOKEN_INVALID + reason NULL → token IsRevoked, gerekçe yok.
  //   3. errorCode'suz, reason'suz düz 401 → 30 gün doldu.
  // Yeni `code` alanı 2 ve 3'ü ayırıyor; gelmediğinde ikisi de session_expired
  // (sessiz logout) olarak kalıyor. Aşağıdaki log gövdenin ŞEKLİNİ de yazıyor
  // ki sahada hangi sürümle konuştuğumuz tartışmasız görülsün.
  const data = err?.response?.data;
  const code = refreshErrorCodeOf(data);
  const shape = code
    ? `kodlu(${code})`
    : data?.reason
      ? 'reason-dolu'
      : data?.errorCode
        ? `kodlu-reasonsuz(${String(data.errorCode)})`
        : 'ciplak-401(muhtemelen-30gun-doldu)';
  const reason: AuthLostReason =
    data?.reason === 'new_login_elsewhere'
      ? 'new_login_elsewhere'
      : data?.reason === 'password_changed' || data?.reason === 'password_reset'
        ? 'password_changed'
        : (code && TERMINAL_REFRESH_REASONS[code]) || 'session_expired';

  // Kendi login'imizin penceresindeysek bu, önceki oturumdan kalmış bir
  // isteğin revoke edilmiş eski refresh token'la denemesi. Token'ları
  // temizlemek login'in az önce yazdığı TAZE refresh token'ı silerdi;
  // logout dispatch etmek de yeni oturumu düşürürdü. İsteği başarısız
  // bırakıp çık.
  //
  // Aynısı kendi şifre değişikliğimiz için de geçerli: backend eski refresh
  // token'ı iptal etti, ChangePassword cevabındaki yeni set daha yazılmadı.
  // Pencerede uçan istekler düşer ama oturum ayakta kalır.
  if (isSelfInflictedForceLogout() || isSelfInflictedPasswordChange()) {
    devLog('↩️ Refresh fail yok sayıldı — kendi login/şifre penceremiz, eski token');
    return null;
  }

  // console.warn (devLog değil): oturumun neden düştüğü release/TestFlight
  // build'de de görünmeli. "Beni durduk yere attı" şikayetlerinde tek ayırt
  // edici veri bu satır — sunucunun gönderdiği HAM reason'ı yazıyoruz ki
  // istemci sınıflandırmasının mı yoksa backend gerekçesinin mi yanlış
  // olduğu tartışmasız görülsün.
  console.warn(
    `[auth] Oturum düşürüldü — status ${err?.response?.status}, şekil ${shape}, ` +
      `errorCode ${String(data?.errorCode)}, reason ${String(data?.reason)}, ` +
      `deneme ${attempts} → ${reason}`,
  );
  await clearAllTokens();
  setCurrentAccessToken(null);
  if (onAuthLost) onAuthLost(reason);
  return null;
};

export const refreshAccessToken = async (): Promise<string | null> => {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    // Retry turunun dışında: aşağıdaki catch beklenmedik bir hatayı
    // sınıflandırırken kaçıncı denemede olduğumuzu da yazabilsin.
    let attempts = 0;
    try {
      const rt = await getRefreshToken();
      if (!rt) {
        devLog('❌ Refresh token bulunamadı — Logout');
        await clearAllTokens();
        setCurrentAccessToken(null);
        if (onAuthLost) onAuthLost('session_expired');
        return null;
      }

      // AYNI token'la sınırlı retry. Grace penceresi (backend 60 sn) tam olarak
      // bunu güvenli kılmak için var: cevabı kaybolan refresh artık oturumu
      // öldürmüyor. Kazandığımız senaryo mobilde en sık olan — istek uçarken
      // iOS uygulamayı donduruyor, cevap işlenemiyor.
      let response: any = null;
      let lastError: any = null;

      for (let attempt = 1; attempt <= REFRESH_MAX_ATTEMPTS; attempt++) {
        attempts = attempt;
        if (attempt > 1) await sleep(REFRESH_RETRY_BACKOFF_MS[attempt - 2]);
        try {
          // Bu çağrı `api` instance'ını KULLANMAZ (401 interceptor'ına düşerse
          // sonsuz döngü olur) — bu yüzden timeout'u, dil başlığını ve log'u
          // elle veriyoruz; aksi halde refresh takılırsa tüm kuyruk sessizce donar.
          response = await axios.post(
            `${API_BASE_URL}${API_ENDPOINTS.REFRESH_TOKEN}`,
            { refreshToken: rt },
            {
              timeout: REFRESH_TIMEOUT_MS,
              headers: { 'Accept-Language': currentLanguage },
            },
          );
          break;
        } catch (err: any) {
          lastError = err;
          // Sunucu konuştu (4xx) → tekrar denemek aynı cevabı getirir.
          if (!isRetriableRefreshFailure(err)) break;
          if (attempt < REFRESH_MAX_ATTEMPTS) {
            devLog(
              `🔁 Refresh ${attempt}/${REFRESH_MAX_ATTEMPTS} düştü (${shortNetError(err)}) — aynı token'la tekrar denenecek`,
            );
          }
        }
      }

      if (!response) return await handleRefreshFailure(lastError, attempts);

      const { token: newAccessToken, refreshToken: newRefreshToken } = response.data.result;
      // SIRA ÖNEMLİ: önce refresh token diske. Rotasyon tek kullanımlık —
      // eski token cevap üretilir üretilmez IsRevoked oluyor; 60 sn'lik grace
      // penceresi bunu YUMUŞATIYOR ama kaldırmıyor. Cevap geldiği an ile yeni
      // token'ın diske indiği an arasında uygulama askıya alınır/öldürülürse
      // elimizde eski token kalır: pencere içinde açılırsak kurtuluruz, 60 sn
      // sonra açılırsak oturum gider. Access token o pencerede kaybolsa
      // zararsız — refresh token'dan yeniden üretilebilir; tersi mümkün değil.
      // Bu yüzden kurtarılamaz olan önce yazılır.
      await saveRefreshToken(newRefreshToken);
      setCurrentAccessToken(newAccessToken);
      await saveAccessToken(newAccessToken);
      if (onTokenRefreshed) onTokenRefreshed(newAccessToken, newRefreshToken);
      devLog(`✅ Token refresh başarılı (single-flight, ${attempts}. deneme)`);
      return newAccessToken as string;
    } catch (err: any) {
      // Beklenmedik hata: gövde şekli bozuk (`result` yok), disk yazımı patladı,
      // token okunamadı… Sınıflandırmadan geçiriyoruz — `response` taşımadığı
      // için geçici sayılır ve oturum ayakta kalır. BU DAL ŞART: burada
      // reject etmek çağıranları (SignalR accessTokenFactory, foreground turu)
      // yakalanmamış promise hatasıyla bırakırdı.
      return await handleRefreshFailure(err, attempts);
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
};

// axios timeout'u ECONNABORTED (bazı RN/iOS yollarında ETIMEDOUT) ile döner;
// mesaj kontrolü ikisini de kaçıran sürümler için emniyet.
const isTimeoutError = (error: any): boolean =>
  error?.code === 'ECONNABORTED' ||
  error?.code === 'ETIMEDOUT' ||
  /timeout/i.test(error?.message || '');

/**
 * Refresh hatası "sunucu oturumu iptal etti" mi, yoksa "istek sunucuya
 * ulaşamadı / sunucu o an patladı" mı?
 *
 * Yalnız İKİNCİSİ geçici sayılır ve oturumu düşürmez:
 *   • `response` yok        → ağ kopuk, DNS, TLS, iptal, askıya alınmış istek
 *   • 5xx                   → sunucu tarafı arıza, token hakkında hüküm değil
 *   • 429                   → rate limit; refresh'in kendi retry'ı yok, bekle
 *   • 408                   → sunucu isteği zaman aşımına uğrattı
 *
 * 400/401/403 ise sunucu refresh token'ı GÖRÜP reddetmiştir — oturum gerçekten
 * bitmiştir, aşağıdaki kesin dal işler. Yaptırım (403 + UT-100x) buraya hiç
 * gelmez, handleBlockedResponse önce yakalar.
 */
const isTransientRefreshFailure = (error: any): boolean => {
  const status = error?.response?.status;
  if (status === undefined || status === null) return true;
  return status >= 500 || status === 429 || status === 408;
};

const logNetworkFailure = (kind: 'TIMEOUT' | 'NETWORK' | 'SERVER', config: TimedConfig | undefined, detail: string) => {
  const method = (config?.method || 'GET').toUpperCase();
  const url = config?.url || '?';
  const elapsed = config?.__startedAt ? Date.now() - config.__startedAt : undefined;
  const route = config?.__route || 'unknown';
  console.warn(
    `[net] ⏱ ${kind} — ${method} ${url} | ekran: ${route}` +
      (elapsed !== undefined ? ` | ${elapsed}ms` : '') +
      ` | ${detail}`,
  );
};

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest: TimedConfig & { _retry?: boolean; _retryCount?: number } = error.config;

    // Timeout teşhisi: hangi istek, hangi ekrandan atıldı, kaç ms sonra düştü.
    // console.warn (devLog değil) — release/TestFlight build'de de görünsün,
    // timeout'lar cihazda tekrar üretiliyor. Ağ tamamen kopuksa ayrı satır:
    // "timeout" ile "network yok" karışırsa yanlış yerde bug aranıyor.
    if (isTimeoutError(error)) {
      logNetworkFailure('TIMEOUT', originalRequest, `${REQUEST_TIMEOUT_MS}ms limiti aşıldı`);
    } else if (!error.response) {
      logNetworkFailure('NETWORK', originalRequest, error?.message || 'yanıt yok');
    } else if (error.response.status >= 500) {
      // 5xx sunucu tarafı — hangi endpoint hangi ekranda patlıyor görünsün.
      // Gövde HTML hata sayfasıysa (IIS 500.34 vb.) tek satıra indirilir.
      const body = error.response.data;
      logNetworkFailure(
        'SERVER',
        originalRequest,
        `status ${error.response.status}` +
          (typeof body === 'string' ? ` — ${shortNetError(body)}` : ''),
      );
    }

    // ── Hesap yaptırımı (ban / askı / silme) — 401 refresh dalından ÖNCE ──
    // Yaptırımlı hesapta refresh de 403 döner; sıra ters olsa sonsuz döngü.
    // Login 403'ü de buradan geçer: henüz oturum yok, temizlik no-op kalır ama
    // ekranı açan tek yol yine bu — ayrı bir karşılama koduna gerek kalmıyor.
    if (await handleBlockedResponse(error)) {
      return Promise.reject(error);
    }

    // 429 Too Many Requests — exponential backoff (max 3 deneme).
    // SKIP_429_RETRY veren uçlar hariç: `auth` politikasındaki 5 istek/dk'lık
    // uçlarda sunucu Retry-After: 60 dönüyor, üç deneme kullanıcıyı 3 dakika
    // dönen spinner'da bırakırdı. Orada doğru davranış hatayı hemen gösterip
    // butonu geri sayımla kilitlemek.
    if (error.response?.status === 429 && !(originalRequest as any)?.__skip429Retry) {
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
