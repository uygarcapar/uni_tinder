import i18n from '@/shared/i18n';

// Fotoğraf moderasyonu — backend her fotoğrafı AYRI değerlendiriyor. Bir foto
// düşse bile istek 200 döner, temiz olanlar kaydedilir. Tek istisna ana
// fotoğraf: orada kural sert (tam 1 kişi) ve ihlali isteği 400'e düşürür.
//
// Kural özeti (kullanıcıya da anlatılmalı):
//   ana fotoğraf → tam 1 kişi zorunlu
//   diğerleri    → serbest (grup, manzara, hobi, evcil hayvan)

export type PhotoModerationStatus = 'Approved' | 'Rejected' | 'Review' | 'Pending';

// Rozet tonu. Review/Pending HATA DEĞİL — kullanıcının yapması gereken bir şey
// yok, sadece beklemesi yeterli. Kırmızı/uyarı tonuyla gösterilmemeli.
export type PhotoModerationTone = 'ok' | 'error' | 'info';

export const PHOTO_MODERATION_REASON_CODES = [
  'main_photo_multiple_faces',
  'main_photo_no_face',
  'explicit_content',
  'violence',
  'hate_symbols',
  'face_mismatch',
  'face_compare_unavailable',
  'under_review',
  'provider_error',
] as const;

export type PhotoModerationReasonCode =
  (typeof PHOTO_MODERATION_REASON_CODES)[number];

// Profil oluşturmayı/güncellemeyi tamamen engelleyen kodlar. Diğer her kod
// "foto gizli kalır ama akış devam eder" anlamına gelir.
const FATAL_REASON_CODES: ReadonlySet<string> = new Set<string>([
  'main_photo_multiple_faces',
  'main_photo_no_face',
]);

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<string>(
  PHOTO_MODERATION_REASON_CODES,
);

const KNOWN_STATUSES: ReadonlySet<string> = new Set<string>([
  'Approved',
  'Rejected',
  'Review',
  'Pending',
]);

/** Bir fotoğrafın moderasyon durumu — iki farklı backend şeklinden normalize edilmiş hali. */
export interface PhotoModeration {
  photoId: number | string | null;
  order: number | null;
  status: PhotoModerationStatus;
  reasonCode: PhotoModerationReasonCode | string | null;
  /** Backend'in TR sabiti. YALNIZCA log/analitik için — UI metnini reasonCode'dan üret. */
  rawReasonText: string | null;
  isVisibleToOthers: boolean;
}

/**
 * İki ayrı backend şeklini tek tipe indirger:
 *   - CompleteProfile / UpdateProfile / register-and-complete → `photos[]`
 *     (`status`, `reasonCode`, `reasonText`)
 *   - GetMyPhotos / photosList → (`moderationStatus`, `rejectionReasonCode`,
 *     `rejectionReasonText`, `isVisibleToOthers`)
 *
 * `imageStatus` BİLEREK okunmuyor: legacy alan Review ile Pending'i ikisini de
 * "pending" yapıyor, ayırt edilemiyor.
 */
export function normalizePhotoModeration(raw: any): PhotoModeration {
  const rawStatus = raw?.status ?? raw?.moderationStatus;
  const status: PhotoModerationStatus = KNOWN_STATUSES.has(rawStatus)
    ? rawStatus
    : // Alan hiç gelmediyse eski backend'le konuşuyoruz demektir; fotoğrafı
      // yayında say ki rozet çizilmesin.
      'Approved';

  const reasonCode = raw?.reasonCode ?? raw?.rejectionReasonCode ?? null;
  const reasonText = raw?.reasonText ?? raw?.rejectionReasonText ?? null;

  return {
    photoId: raw?.photoId ?? null,
    order: raw?.order ?? null,
    status,
    reasonCode: reasonCode || null,
    rawReasonText: reasonText || null,
    isVisibleToOthers:
      typeof raw?.isVisibleToOthers === 'boolean'
        ? raw.isVisibleToOthers
        : status === 'Approved',
  };
}

export function getModerationTone(status: PhotoModerationStatus): PhotoModerationTone {
  if (status === 'Rejected') return 'error';
  if (status === 'Approved') return 'ok';
  return 'info';
}

export function isFatalReasonCode(code: string | null | undefined): boolean {
  return !!code && FATAL_REASON_CODES.has(code);
}

/** Kullanıcının bir şey yapması gerekiyor mu — yalnızca Rejected'ta "Değiştir" göster. */
export function requiresUserAction(status: PhotoModerationStatus): boolean {
  return status === 'Rejected';
}

/**
 * Yanıt zarfını çöz. CompleteProfile ve (foto gönderilen) UpdateProfile artık
 * `result: { profile, photos }` dönüyor; foto gönderilmeyen UpdateProfile hâlâ
 * düz profileDto dönüyor. İkisini de karşılar.
 */
export function unwrapProfileResult<T = any>(result: any): T {
  return (result?.profile ?? result) as T;
}

export function extractModerationPhotos(result: any): PhotoModeration[] {
  const raw = result?.photos;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePhotoModeration);
}

// ── i18n ────────────────────────────────────────────────────────────────────
// Backend'in `reasonText`'i Türkçe sabit (resx'te değil). Çok dilli uygulama
// kendi metnini ÜRETMELİ: kodlar sabit ve kararlı, metinler değişebilir.

export function moderationStatusLabel(status: PhotoModerationStatus): string {
  return i18n.t(`profile.photoModeration.status.${status}`);
}

/**
 * Kullanıcıya gösterilecek açıklama. Her zaman `reasonCode` üzerinden çözülür;
 * bilinmeyen kod gelirse duruma göre nötr bir metne düşer.
 */
export function moderationReasonText(
  status: PhotoModerationStatus,
  reasonCode: string | null | undefined,
): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    return i18n.t(`profile.photoModeration.reason.${reasonCode}`);
  }
  return i18n.t(`profile.photoModeration.reason.fallback.${status}`);
}

/** Fatal hatalar için Alert başlığı. */
export function moderationReasonTitle(
  status: PhotoModerationStatus,
  reasonCode: string | null | undefined,
): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    const key = `profile.photoModeration.title.${reasonCode}`;
    const translated = i18n.t(key);
    if (translated !== key) return translated;
  }
  return i18n.t(`profile.photoModeration.title.fallback.${status}`);
}

/**
 * Yükleme sonrası özet — kaç foto yayında, kaç tanesi inceleniyor/reddedildi.
 * Hiç dikkat çekecek bir şey yoksa null döner (sessiz başarı).
 */
export function summarizeModeration(photos: PhotoModeration[]): {
  title: string;
  message: string;
  hasRejected: boolean;
} | null {
  const pending = photos.filter(
    (p) => p.status === 'Review' || p.status === 'Pending',
  );
  const rejected = photos.filter((p) => p.status === 'Rejected');
  if (pending.length === 0 && rejected.length === 0) return null;

  const parts: string[] = [];
  if (rejected.length > 0) {
    parts.push(
      i18n.t('profile.photoModeration.summary.rejected', { count: rejected.length }),
    );
  }
  if (pending.length > 0) {
    parts.push(
      i18n.t('profile.photoModeration.summary.pending', { count: pending.length }),
    );
  }

  return {
    title: i18n.t(
      rejected.length > 0
        ? 'profile.photoModeration.summary.titleRejected'
        : 'profile.photoModeration.summary.titlePending',
    ),
    message: parts.join('\n\n'),
    hasRejected: rejected.length > 0,
  };
}
