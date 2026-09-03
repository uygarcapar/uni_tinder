import i18n from '@/shared/i18n';

/**
 * Selfie doğrulama — kullanıcı ön kameradan sunucunun SEÇTİĞİ 2 hareketi yapar,
 * hareket başına TEK kare gönderilir, backend kareleri ana fotoğrafla
 * karşılaştırıp `isSelfieVerified` rozetini verir.
 *
 * 🔴 BU BİR KİMLİK DOĞRULAMASI DEĞİL. Çözdüğü şey "başkasının fotoğraflarıyla
 * profil açan kişi"; kararlı bir saldırgan hedefin videosunu kameraya tutarak
 * geçebilir. Bu ayrım metinlere de yansıyor: her yerde "Fotoğraf Doğrulandı",
 * hiçbir yerde "Kimlik Doğrulandı" — bkz. i18n `profile.selfie.*`.
 *
 * Sözleşme kuralları photoModeration.ts ile aynı:
 *   • alan gelmediyse `null` = BİLİNMİYOR, `false` DEĞİL
 *   • metin HER ZAMAN koddan üretilir; sunucu metni yalnız bilinmeyen kodda
 *   • durum TÜRETİLMEZ, sunucudan okunur
 */

// ── Hareketler ───────────────────────────────────────────────────────────────
// Hangi hareketlerin isteneceğini SUNUCU seçer ve saklar; istemci bunu
// değiştiremez. `code` yalnız ikon/animasyon seçmek için — ekranda gösterilen
// metin sunucudan gelen `instruction`'dır (zaten Accept-Language'e göre
// yerelleşmiş).
export const SELFIE_CHALLENGE_CODES = [
  'TurnRight',
  'TurnLeft',
  'LookUp',
  'LookDown',
  'TiltHead',
  'Smile',
  'Neutral',
  'MouthOpen',
  'EyesClosed',
] as const;

export type SelfieChallengeCode = (typeof SELFIE_CHALLENGE_CODES)[number];

export interface SelfieChallenge {
  /** Bilinmeyen kod gelebilir (backend yeni hareket ekleyebilir) — string kalıyor. */
  code: SelfieChallengeCode | string;
  /** Sunucudan yerelleştirilmiş gelir. DOĞRUDAN gösterilir, kendi tablomuz yok. */
  instruction: string;
}

export interface SelfieAttempt {
  attemptId: string;
  challenges: SelfieChallenge[];
  /** ISO, ~5 dk. Geçmişse submit `attempt_expired` döner → yeni /start. */
  expiresAt: string | null;
}

// ── Sonuç ────────────────────────────────────────────────────────────────────

export const SELFIE_REASON_CODES = [
  'challenge_not_met',
  'no_face',
  'multiple_faces',
  'face_occluded',
  'low_quality',
  'face_mismatch',
  'attempt_expired',
  'analysis_failed',
] as const;

export type SelfieReasonCode = (typeof SELFIE_REASON_CODES)[number];

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<string>(
  SELFIE_REASON_CODES,
);

export interface SelfieResult {
  verified: boolean;
  verifiedAt: string | null;
  reasonCode: SelfieReasonCode | string | null;
  canRetry: boolean;
  /** 1 tabanlı adım numarası; null olabilir. */
  failedAtStep: number | null;
  /**
   * Sunucunun yerelleştirilmiş metni. Gösterilebilir ama switch HER ZAMAN
   * `reasonCode` üzerinden yapılır — bu yalnız bilinmeyen kodda devreye girer
   * (bkz. selfieReasonText).
   */
  message: string | null;
}

/**
 * `/start` yanıtını okur. Şekil beklenenden farklıysa (challenge yok, id yok)
 * `null` döner — çağıran taraf akışı başlatmamalı, uydurmamalı.
 */
export function normalizeSelfieAttempt(raw: any): SelfieAttempt | null {
  const attemptId = raw?.attemptId;
  if (!attemptId || typeof attemptId !== 'string') return null;

  const rawChallenges = Array.isArray(raw?.challenges) ? raw.challenges : [];
  const challenges: SelfieChallenge[] = rawChallenges
    .map((c: any) => ({
      code: typeof c?.code === 'string' ? c.code : '',
      instruction: typeof c?.instruction === 'string' ? c.instruction : '',
    }))
    // Talimatsız bir hareket gösterilemez; kullanıcı ne yapacağını bilemez.
    .filter((c: SelfieChallenge) => c.instruction.length > 0);

  if (challenges.length === 0) return null;

  return {
    attemptId,
    challenges,
    expiresAt: typeof raw?.expiresAt === 'string' ? raw.expiresAt : null,
  };
}

/**
 * `/submit` yanıtını okur.
 *
 * 🔴 `verified: false` HATA DEĞİL — istek `200 + isSuccess: true` döner.
 * Bu fonksiyon da bu yüzden asla fırlatmaz; çağıran taraf sonucu `catch`
 * bloğunda değil normal akışta ele alır.
 */
export function normalizeSelfieResult(raw: any, message?: unknown): SelfieResult {
  const verified = raw?.verified === true;
  return {
    verified,
    verifiedAt: typeof raw?.verifiedAt === 'string' ? raw.verifiedAt : null,
    reasonCode: typeof raw?.reasonCode === 'string' ? raw.reasonCode : null,
    // Alan gelmezse: başarıda tekrar denemenin anlamı yok, başarısızlıkta var.
    canRetry: typeof raw?.canRetry === 'boolean' ? raw.canRetry : !verified,
    failedAtStep:
      typeof raw?.failedAtStep === 'number' ? raw.failedAtStep : null,
    message: typeof message === 'string' && message ? message : null,
  };
}

/**
 * `isSelfieVerified` — UserDto / GetMyProfile alanı.
 *
 * `null` = alan hiç gelmedi, yani backend'in bu sürümü YOK. Çağıran taraf
 * `false` sanmamalı: rozeti çizmemek ile "doğrulanmamış" göstermek farklı
 * şeyler, ikincisi henüz var olmayan bir özelliğe davet eder.
 *
 * ⚠️ Bu alan `isVerified`'a DAHİL DEĞİL ve olmayacak — ayrı rozet.
 */
export function resolveSelfieVerified(raw: any): boolean | null {
  const value = raw?.isSelfieVerified;
  return typeof value === 'boolean' ? value : null;
}

// ── i18n ─────────────────────────────────────────────────────────────────────

/**
 * Başarısızlık metni. Sıra: bilinen kod → sunucunun yerelleştirilmiş metni →
 * jenerik. (photoModeration.moderationReasonText ile aynı desen.)
 *
 * `analysis_failed` BİZİM hatamız — metni kullanıcıyı suçlamaz.
 */
export function selfieReasonText(
  reasonCode: string | null | undefined,
  serverMessage?: string | null,
): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    return i18n.t(`profile.selfie.reason.${reasonCode}`);
  }
  if (serverMessage) return serverMessage;
  return i18n.t('profile.selfie.reason.fallback');
}

/** Sonuç ekranının başlığı. Bilinmeyen kodda jenerik başlığa düşer. */
export function selfieReasonTitle(reasonCode: string | null | undefined): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    const key = `profile.selfie.reasonTitle.${reasonCode}`;
    const translated = i18n.t(key);
    if (translated !== key) return translated;
  }
  return i18n.t('profile.selfie.reasonTitle.fallback');
}

/**
 * Kullanıcıya sormadan yeni bir `/start` alınmalı mı?
 *
 * Yalnız `attempt_expired`: kullanıcı bir şey yanlış yapmadı, süre doldu —
 * "tekrar dene" butonu göstermek gereksiz bir tık. Diğer tüm kodlarda karar
 * kullanıcınındır (her yeniden deneme saatlik 5 haktan birini yakıyor).
 */
export function isSelfieRetryAuto(reasonCode: string | null | undefined): boolean {
  return reasonCode === 'attempt_expired';
}

/** `expiresAt` geçti mi. Alan yoksa `false` — sunucu nihai söz sahibi. */
export function isAttemptExpired(attempt: SelfieAttempt | null): boolean {
  if (!attempt?.expiresAt) return false;
  const at = Date.parse(attempt.expiresAt);
  return Number.isFinite(at) && at <= Date.now();
}
