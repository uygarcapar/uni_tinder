/**
 * Kod onaylı hesap uçlarının hata gövdelerini tek bir şekle indirger.
 *
 * Dört şifre ucu (RequestPasswordChangeCode / ChangePassword / ForgotPassword /
 * ResetPasswordWithCode) ve iki e-posta değiştirme ucu (RequestEmailChangeCode /
 * ConfirmEmailChange) buradan geçiyor. E-posta akışı ayrı bir modüle
 * bölünmedi çünkü sözleşmenin tamamını paylaşıyor: aynı iki adımlı desen, aynı
 * UT-1003 (mevcut şifre) / UT-1006 (kod) / UT-1012 (kod yandı) kodları, aynı
 * 429/401/403 gövde şekilleri. Yalnızca adrese özgü üç kod (UT-1017/1018/1019)
 * fazladan.
 *
 * Bu uçlar hatayı ÜÇ FARKLI gövde şekliyle bildiriyor:
 *
 *   400  → ResponseDto: { code: "UT-1006", message, action }
 *   403  → yaptırım gövdesi: `code` YOK, `errorCode` var (ban/askı/silme)
 *   429  → rate limit gövdesi: { errorCode: "RATE_LIMIT_EXCEEDED", retryAfterSeconds }
 *   401  → GÖVDE BOŞ (JWT middleware controller'a hiç girmiyor)
 *
 * Ekranların bu ayrımı tek tek yeniden keşfetmesi yerine hepsi buradan geçiyor.
 * `statusCode` alanı KULLANILMIYOR: gövdede string ("BadRequest") geliyor ve
 * 429'da sayı — güvenilir olan tek şey HTTP status'ü.
 */

/** Hatanın hangi input'u işaret ettiği; null → forma değil genel satıra yaz. */
export type PasswordErrorField =
  | "currentPassword"
  | "newPassword"
  | "code"
  | "newEmail";

export type PasswordFailure = {
  /** `UT-1006` gibi yapılandırılmış kod; bilinmiyorsa null. */
  code: string | null;
  field: PasswordErrorField | null;
  /** Backend'in Türkçe metni — bilinmeyen kodlarda son çare olarak gösterilir. */
  serverMessage: string | null;
  /**
   * Kod hâlâ geçerli → kod alanını TEMİZLEME. Reddedilen şifreydi; kullanıcı
   * aynı kodla tekrar denemeli, yoksa boşuna yeni kod istemeye zorlanır.
   */
  keepCode: boolean;
  /** UT-1012: 5 hatalı deneme, kod iptal edildi → yeni kod şart. */
  codeBurned: boolean;
  /** UT-1006: bir deneme hakkı yandı (5'ten geriye sayan sayaç için). */
  codeAttemptSpent: boolean;
  /** 429 → butonu bu kadar saniye kilitle. */
  retryAfterSeconds: number | null;
  /** 401 → oturum düştü; interceptor logout'u çoktan tetikledi. */
  sessionLost: boolean;
  /** 403 + errorCode → hesap yaptırımı; ban ekranını interceptor açtı. */
  accountBlocked: boolean;
};

const BASE: PasswordFailure = {
  code: null,
  field: null,
  serverMessage: null,
  keepCode: false,
  codeBurned: false,
  codeAttemptSpent: false,
  retryAfterSeconds: null,
  sessionLost: false,
  accountBlocked: false,
};

/** 429 gövdesi ResponseDto değil; header da geliyor, ikisi de kaçarsa 60sn. */
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const readRetryAfterSeconds = (error: any): number => {
  const fromBody = error?.response?.data?.retryAfterSeconds;
  const fromHeader = error?.response?.headers?.["retry-after"];
  for (const raw of [fromBody, fromHeader]) {
    const seconds = typeof raw === "string" ? Number(raw) : raw;
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
      return Math.ceil(seconds);
    }
  }
  return DEFAULT_RETRY_AFTER_SECONDS;
};

export function parsePasswordError(error: any): PasswordFailure {
  const status = error?.response?.status;
  const body = error?.response?.data;
  const serverMessage =
    typeof body?.message === "string" && body.message ? body.message : null;

  if (status === 429) {
    return { ...BASE, retryAfterSeconds: readRetryAfterSeconds(error), serverMessage };
  }

  // Gövde boş gelir — `body.code` okumaya çalışmak undefined döner.
  if (status === 401) {
    return { ...BASE, sessionLost: true };
  }

  if (status === 403) {
    // Yaptırım gövdesini `code` değil `errorCode` alanı ayırt ediyor. Ban
    // ekranını api.ts interceptor'ı zaten açtı; ekran sessizce kapanmalı.
    if (body?.errorCode) return { ...BASE, accountBlocked: true, serverMessage };
    // Diğer 403: e-posta doğrulanmamış hesap (`code` null gelir).
    return { ...BASE, serverMessage };
  }

  const code = typeof body?.code === "string" ? body.code : null;

  switch (code) {
    // Kod iptal edildi — doğrusu girilse bile artık çalışmaz.
    case "UT-1012":
      return { ...BASE, code, field: "code", codeBurned: true, serverMessage };
    // Yanlış/süresi dolmuş kod. Deneme hakkı yandı ama kod hâlâ denenebilir.
    case "UT-1006":
      return { ...BASE, code, field: "code", codeAttemptSpent: true, serverMessage };
    // Mevcut şifre yanlış — A1'de kod hiç gönderilmedi, A2'de kod korunur.
    case "UT-1003":
      return { ...BASE, code, field: "currentPassword", keepCode: true, serverMessage };
    // Yeni şifre politikaya uymuyor / eskisiyle aynı. İkisinde de kod doğruydu.
    case "UT-1010":
    case "UT-1011":
      return { ...BASE, code, field: "newPassword", keepCode: true, serverMessage };
    // E-posta değiştirme akışının adres redleri: kullanımda / mevcutla aynı /
    // desteklenmeyen üniversite domain'i. Üçü de ADRESİ işaret ediyor, kodu
    // değil — `keepCode` bu yüzden true: 2. adımda dönerlerse (kod 15 dakika
    // geçerli, arada adresi başkası kapmış olabilir) girilmiş kodu silmek
    // kullanıcıya hiçbir şey kazandırmaz, sadece yazdığını kaybettirir.
    case "UT-1017":
    case "UT-1018":
    case "UT-1019":
      return { ...BASE, code, field: "newEmail", keepCode: true, serverMessage };
    default:
      return { ...BASE, code, serverMessage };
  }
}

/**
 * Kullanıcıya gösterilecek metin. Bilinen kodlar i18n'den çözülür — backend
 * metinleri yalnız Türkçe, uygulama iki dilli. Bilinmeyen kod → backend metni,
 * o da yoksa jenerik satır.
 */
export function passwordErrorMessage(
  failure: PasswordFailure,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (failure.retryAfterSeconds != null) {
    return t("auth.password.errors.rateLimited", { seconds: failure.retryAfterSeconds });
  }
  if (failure.sessionLost) return t("auth.password.errors.sessionLost");

  const key = MESSAGE_KEYS[failure.code ?? ""];
  if (key) return t(key);
  return failure.serverMessage ?? t("auth.password.errors.generic");
}

const MESSAGE_KEYS: Record<string, string> = {
  "UT-1003": "auth.password.errors.currentPasswordWrong",
  "UT-1006": "auth.password.errors.codeInvalid",
  "UT-1010": "auth.password.errors.policy",
  "UT-1011": "auth.password.errors.sameAsCurrent",
  "UT-1012": "auth.password.errors.codeBurned",
  "UT-1005": "auth.password.errors.sessionLost",
  "UT-1017": "auth.email.errors.inUse",
  "UT-1018": "auth.email.errors.sameAsCurrent",
  "UT-1019": "auth.email.errors.unsupportedDomain",
};

/** Kod ekranındaki geri sayımların kaynağı — backend sözleşmesiyle aynı. */
export const CODE_TTL_SECONDS = 15 * 60;
/** 5. hatalı denemede kod yanıyor (UT-1012). */
export const CODE_MAX_ATTEMPTS = 5;
/** Uçlar dakikada 5 istekle sınırlı; "tekrar gönder" bu aralıkla kilitlenir. */
export const RESEND_COOLDOWN_SECONDS = 60;
