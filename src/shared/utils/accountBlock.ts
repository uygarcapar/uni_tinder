/**
 * Hesap yaptırımı (ban / askı / silme süreci) — tespit + tek noktadan dağıtım.
 *
 * Backend artık yaptırımlı hesabı SUNUCU tarafında kesiyor: Login,
 * refresh-token, validate-token ve global filtre üzerinden her yetkili uç
 * `403 + errorCode` döner. Önceden yaptırım yalnızca DB'ye yazılıyor, hiçbir
 * giriş kapısında okunmuyordu — banlanan kullanıcı hesabını kullanmaya devam
 * ediyordu. İstemcinin tek görevi bu 403'ü yakalayıp oturumu düşürmek ve
 * gerekçeyi göstermek.
 *
 * SignalR `ForceLogout` yalnızca "hızlı düşürme": uygulama kapalıyken gelmez,
 * gönderimi best-effort. Tek güvenilir kaynak 403 gövdesidir — bu modül de
 * kararını her zaman `errorCode`'a bakarak verir.
 *
 * NOT: 403 kontrolü api.ts'te 401→refresh dalından ÖNCE çalışmalı. Yaptırımlı
 * hesapta refresh de 403 döner; sıra ters olursa sonsuz refresh döngüsü olur.
 */

export const ACCOUNT_BLOCK_CODES = {
  BANNED: 'UT-1007',
  SUSPENDED: 'UT-1008',
  PENDING_DELETION: 'UT-1009',
} as const;

export type AccountBlockReason = 'banned' | 'suspended' | 'account_deleted';

export interface AccountBlockPayload {
  errorCode: string;
  reason: AccountBlockReason;
  /** Backend'in admin gerekçesiyle zenginleştirdiği metin — ekranda BU gösterilir. */
  message: string;
  /** Opsiyonel buton etiketi (örn. "Destek'e Yaz"); yoksa i18n fallback'i kullanılır. */
  action: string | null;
  /** Askıda askı bitişi, silme sürecinde kalıcı silinme tarihi (ISO 8601). */
  expiresAt: string | null;
}

// reason alanı gövdede eksik/bilinmedik gelirse ekran başlığı çözümsüz kalırdı.
// Kararı zaten errorCode ile veriyoruz; reason'ı da ondan türetiyoruz.
const REASON_BY_CODE: Record<string, AccountBlockReason> = {
  [ACCOUNT_BLOCK_CODES.BANNED]: 'banned',
  [ACCOUNT_BLOCK_CODES.SUSPENDED]: 'suspended',
  [ACCOUNT_BLOCK_CODES.PENDING_DELETION]: 'account_deleted',
};

const BLOCK_REASONS: ReadonlySet<string> = new Set(Object.values(REASON_BY_CODE));

/** SignalR ForceLogout `reason`'ı yaptırım mı, yoksa normal oturum kapanışı mı? */
export const isAccountBlockReason = (reason: unknown): reason is AccountBlockReason =>
  typeof reason === 'string' && BLOCK_REASONS.has(reason);

/** Yanıt gövdesi hesap yaptırımı mı? */
export const isAccountBlockBody = (data: unknown): boolean => {
  if (!data || typeof data !== 'object') return false;
  const code = (data as { errorCode?: unknown }).errorCode;
  return typeof code === 'string' && code in REASON_BY_CODE;
};

/**
 * Axios hatasından normalize edilmiş yaptırım payload'ı çıkarır; yaptırım
 * değilse null. Gövde şekli `REFRESH_TOKEN_REVOKED` sözleşmesiyle aynı —
 * alanlar kökte, ResponseDto sarmalayıcısı yok.
 */
export const extractAccountBlock = (error: any): AccountBlockPayload | null => {
  if (error?.response?.status !== 403) return null;
  const data = error.response.data;
  if (!isAccountBlockBody(data)) return null;
  const errorCode = data.errorCode as string;
  return {
    errorCode,
    reason: REASON_BY_CODE[errorCode],
    message: typeof data.message === 'string' ? data.message : '',
    action: typeof data.action === 'string' && data.action ? data.action : null,
    expiresAt: typeof data.expiresAt === 'string' && data.expiresAt ? data.expiresAt : null,
  };
};

// ─── Dağıtım ────────────────────────────────────────────────────────────────
// api.ts Redux'a erişemez (döngüsel import), o yüzden mevcut setOnAuthLost /
// setOnTokenRefreshed kalıbı: AppNavigator handler'ı register eder.

let handler: ((payload: AccountBlockPayload) => void) | null = null;
let pending: AccountBlockPayload | null = null;
let latched = false;

export const setOnAccountBlocked = (cb: (payload: AccountBlockPayload) => void): void => {
  handler = cb;
  // Boot yarışı: handler register olmadan önce gelen 403 kaybolmasın, yoksa
  // kullanıcı token'sız ama ekransız bir limbo'da kalır.
  if (pending) {
    const payload = pending;
    pending = null;
    cb(payload);
  }
};

/**
 * Yaptırımı UI'a bildirir. Açılışta paralel 5-6 istek birden 403 alır; latch
 * olmadan aynı geçiş defalarca tetiklenir. Latch, ekran kapatılana kadar açık
 * kalır (doc'taki try/finally bayrağının aksine) — sonraki 403'ler yutulur.
 *
 * @returns bu çağrının gerçekten bir geçiş başlatıp başlatmadığı
 */
export const emitAccountBlocked = (payload: AccountBlockPayload): boolean => {
  if (latched) return false;
  latched = true;
  if (handler) handler(payload);
  else pending = payload;
  return true;
};

/**
 * Latch'i açar. Ekran kapandığında (askı → "giriş ekranına dön") çağrılır;
 * aksi halde aynı kullanıcı tekrar giriş denediğinde ikinci 403 yutulur ve
 * ekran hiç açılmaz.
 */
export const resetAccountBlockLatch = (): void => {
  latched = false;
  pending = null;
};

/** Test/teşhis için — geçiş hâlihazırda işlendi mi. */
export const isAccountBlockLatched = (): boolean => latched;
