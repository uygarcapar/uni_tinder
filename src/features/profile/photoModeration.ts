import i18n from '@/shared/i18n';

// Fotoğraf moderasyonu — backend her fotoğrafı AYRI değerlendiriyor. Bir foto
// düşse bile istek 200 döner, temiz olanlar kaydedilir. Tek istisna ana
// fotoğraf: orada kural sert (tam 1 kişi) ve ihlali isteği 400'e düşürür.
//
// Kural özeti (kullanıcıya da anlatılmalı):
//   ana fotoğraf → tam 1 kişi zorunlu
//   diğerleri    → serbest (grup, manzara, hobi, evcil hayvan)
//
// 2026-08-24 sözleşmesi: foto dönen HER uç (GetMyProfile.photosList[],
// GetPhoto, CompleteProfile/UpdateProfile/register-and-complete .photos[])
// aynı kanonik `moderation` bloğunu taşıyor. Blok ASLA null gelmez;
// değerlendirilmemiş foto `Pending`'dir.

export type PhotoModerationStatus = 'Approved' | 'Rejected' | 'Review' | 'Pending';

/**
 * Kararın ne kadar ağır olduğu. Hangi red kodunun akışı durduracağını artık
 * SUNUCU söylüyor — istemcide kod listesi tutulmuyor (eski `FATAL_REASON_CODES`
 * kaldırıldı). Kod kataloğu backend'de değiştiğinde istemci kendiliğinden
 * doğru davranır.
 *
 *   Blocking      → ana fotoğraf kuralı ihlali; akış durur, kullanıcı aksiyon almalı
 *   Hidden        → foto gizli; akış devam eder, rozet + karartma
 *   Informational → foto yayında; aksiyon yok
 */
export type PhotoModerationSeverity = 'Blocking' | 'Hidden' | 'Informational';

export type PhotoAppealState = 'None' | 'Pending' | 'Accepted' | 'Rejected';

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

const KNOWN_REASON_CODES: ReadonlySet<string> = new Set<string>(
  PHOTO_MODERATION_REASON_CODES,
);

const KNOWN_STATUSES: ReadonlySet<string> = new Set<string>([
  'Approved',
  'Rejected',
  'Review',
  'Pending',
]);

const KNOWN_SEVERITIES: ReadonlySet<string> = new Set<string>([
  'Blocking',
  'Hidden',
  'Informational',
]);

const KNOWN_APPEAL_STATES: ReadonlySet<string> = new Set<string>([
  'None',
  'Pending',
  'Accepted',
  'Rejected',
]);

// SADECE geriye uyumluluk yolu için. Kanonik `moderation` bloğu geldiğinde bu
// liste HİÇ okunmaz — severity sunucudan gelir. Backend deploy edilene kadar
// düz legacy alanlarla (`moderationStatus`, `rejectionReasonCode`) konuşan
// yanıtlarda akışı durduracak kodu tespit edebilmek için duruyor; blok her
// yerde canlıya çıktığında silinecek.
const LEGACY_BLOCKING_CODES: ReadonlySet<string> = new Set<string>([
  'main_photo_multiple_faces',
  'main_photo_no_face',
]);

/** Bir fotoğrafın moderasyon durumu — kanonik bloktan normalize edilmiş hali. */
export interface PhotoModeration {
  photoId: number | string | null;
  order: number | null;
  status: PhotoModerationStatus;
  reasonCode: PhotoModerationReasonCode | string | null;
  /**
   * Backend'in metni. 2026-08-24'ten beri resx'ten geliyor ve `Accept-Language`'a
   * göre tr/en dönüyor — yani gösterilebilir. Yine de switch HER ZAMAN
   * `reasonCode` üzerinden yapılır; bu metin yalnız bilinmeyen kodda devreye
   * giriyor (bkz. moderationReasonText).
   */
  reasonText: string | null;
  severity: PhotoModerationSeverity;
  /** Sunucu söylüyor — `status === 'Approved'` ile TÜRETME (bkz. sözleşme §2.3). */
  isVisibleToOthers: boolean;
  isAppealable: boolean;
  appealState: PhotoAppealState;
  /** Terminal değilse null. */
  decidedAt: string | null;
  policyVersion: number | null;
}

/**
 * Kanonik `moderation` bloğunu okur. Blok yoksa (backend deploy edilmeden önceki
 * pencere) düz legacy alanlara düşer: `moderationStatus`, `rejectionReasonCode`,
 * `rejectionReasonText`, `isVisibleToOthers`.
 *
 * `imageStatus` BİLEREK okunmuyor: legacy alan Review ile Pending'i ikisini de
 * "pending" yapıyor, ayırt edilemiyor.
 */
export function normalizePhotoModeration(raw: any): PhotoModeration {
  const m = raw?.moderation ?? null;

  const rawStatus = m?.status ?? raw?.status ?? raw?.moderationStatus;
  const status: PhotoModerationStatus = KNOWN_STATUSES.has(rawStatus)
    ? rawStatus
    : // Alan hiç gelmediyse eski backend'le konuşuyoruz demektir; fotoğrafı
      // yayında say ki rozet çizilmesin.
      'Approved';

  const reasonCode =
    m?.reasonCode ?? raw?.reasonCode ?? raw?.rejectionReasonCode ?? null;
  const reasonText =
    m?.reasonText ?? raw?.reasonText ?? raw?.rejectionReasonText ?? null;

  const rawSeverity = m?.severity;
  const severity: PhotoModerationSeverity = KNOWN_SEVERITIES.has(rawSeverity)
    ? rawSeverity
    : legacySeverity(status, reasonCode);

  const rawAppealState = m?.appealState;

  const visible = m?.isVisibleToOthers ?? raw?.isVisibleToOthers;

  return {
    photoId: raw?.photoId ?? null,
    order: raw?.order ?? null,
    status,
    reasonCode: reasonCode || null,
    reasonText: reasonText || null,
    severity,
    isVisibleToOthers:
      typeof visible === 'boolean' ? visible : status === 'Approved',
    // Legacy yanıtta itiraz ucu YOK — bloğu göndermeyen backend itirazı da
    // kabul etmiyor demektir, butonu göstermek 404 üretirdi.
    isAppealable: m?.isAppealable === true,
    appealState: KNOWN_APPEAL_STATES.has(rawAppealState) ? rawAppealState : 'None',
    decidedAt: m?.decidedAt ?? null,
    policyVersion: typeof m?.policyVersion === 'number' ? m.policyVersion : null,
  };
}

function legacySeverity(
  status: PhotoModerationStatus,
  reasonCode: string | null,
): PhotoModerationSeverity {
  if (reasonCode && LEGACY_BLOCKING_CODES.has(reasonCode)) return 'Blocking';
  return status === 'Approved' ? 'Informational' : 'Hidden';
}

export function getModerationTone(status: PhotoModerationStatus): PhotoModerationTone {
  if (status === 'Rejected') return 'error';
  if (status === 'Approved') return 'ok';
  return 'info';
}

/** Profil oluşturmayı/güncellemeyi tamamen engelleyen karar mı. */
export function isBlockingPhoto(photo: PhotoModeration | null | undefined): boolean {
  return photo?.severity === 'Blocking';
}

/** Kullanıcının bir şey yapması gerekiyor mu — yalnızca Rejected'ta "Değiştir" göster. */
export function requiresUserAction(status: PhotoModerationStatus): boolean {
  return status === 'Rejected';
}

export function extractModerationPhotos(result: any): PhotoModeration[] {
  const raw = result?.photos;
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePhotoModeration);
}

/**
 * Yanıtta incelemeyi BEKLEYEN fotoğraf var mı (`Review` / `Pending`)?
 *
 * `null` = yanıt hiç fotoğraf listesi taşımıyor, yani BİLİNMİYOR — çağıran
 * taraf mevcut bilgisini korumalı, `false` sanmamalı (`PhotoModerationChanged`
 * gövdesi yalnız değişen fotoyu taşıyabilir).
 *
 * Görünürlük kapısı bunu "beklenecek durum mu" ayrımı için kullanıyor:
 * inceleme sürerken kullanıcının yapabileceği bir şey yok — eklediği yeni
 * fotoğraf da incelemeye girer — dolayısıyla engelleyici akış anlamsız.
 * Ayrım STATE ADINA değil bu veriye bağlı: iki foto da incelemedeyken sunucu
 * `HiddenUnderReview` de `HiddenInsufficientPhotos` da (görünür foto 0 olduğu
 * için) gönderebilir, ikisinde de kullanıcı yalnızca bekliyor.
 */
export function hasPhotosAwaitingReview(result: any): boolean | null {
  const raw = Array.isArray(result?.photosList)
    ? result.photosList
    : Array.isArray(result?.photos)
      ? result.photos
      : null;
  if (!raw) return null;
  return raw.some((photo: any) => {
    const { status } = normalizePhotoModeration(photo);
    return status === 'Review' || status === 'Pending';
  });
}

/**
 * Yanıttaki İNCELEMEDEKİ fotoğraf sayısı (`Review` / `Pending`). Kaynak ve
 * `null` sözleşmesi `hasPhotosAwaitingReview` ile aynı — o boolean'ın sayısal
 * karşılığı; şerit metni sayıyı cümlenin başında yazıyor.
 */
export function countPhotosAwaitingReview(result: any): number | null {
  const raw = Array.isArray(result?.photosList)
    ? result.photosList
    : Array.isArray(result?.photos)
      ? result.photos
      : null;
  if (!raw) return null;
  return raw.filter((photo: any) => {
    const { status } = normalizePhotoModeration(photo);
    return status === 'Review' || status === 'Pending';
  }).length;
}

/**
 * Yanıttaki REDDEDİLMİŞ fotoğraf sayısı. Kaynak ve `null` sözleşmesi
 * `hasPhotosAwaitingReview` ile aynı: liste hiç gelmediyse "bilinmiyor", 0
 * DEĞİL.
 *
 * Görünürlük şeridi bunu ayrı bir uyarı satırı için kullanıyor: red, inceleme
 * beklemekten farklı bir durum — kullanıcının yapacağı bir iş VAR (fotoğrafı
 * değiştir) ve profil keşifte görünürken de olabilir.
 */
export function countRejectedPhotos(result: any): number | null {
  const raw = Array.isArray(result?.photosList)
    ? result.photosList
    : Array.isArray(result?.photos)
      ? result.photos
      : null;
  if (!raw) return null;
  return raw.filter(
    (photo: any) => normalizePhotoModeration(photo).status === 'Rejected',
  ).length;
}

// ── Profil görünürlüğü ──────────────────────────────────────────────────────
// GetMyProfile / CompleteProfile / UpdateProfile yanıtlarında (KENDİ profilin)
// ve `PhotoModerationChanged` hub event'inde aynı blok geliyor.

export type ProfileVisibilityState =
  | 'Visible'
  | 'HiddenInsufficientPhotos'
  | 'HiddenUnderReview'
  | 'Suspended';

export interface ProfileVisibility {
  state: ProfileVisibilityState;
  visiblePhotoCount: number | null;
  /** Keşifte görünmek için gereken YAYINDA foto sayısı. Kural sunucuda değişebilir. */
  requiredPhotoCount: number | null;
  reasonCode: string | null;
}

const KNOWN_VISIBILITY_STATES: ReadonlySet<string> = new Set<string>([
  'Visible',
  'HiddenInsufficientPhotos',
  'HiddenUnderReview',
  'Suspended',
]);

/**
 * Alan hiç gelmediyse `null` döner — bilinmiyor demek, "gizli" demek DEĞİL.
 * Çağıran taraf null'da kapıyı AÇMAMALI: backend deploy edilmeden önce her
 * kullanıcıyı engelleyici akışa sokardı.
 */
export function normalizeProfileVisibility(raw: any): ProfileVisibility | null {
  const v = raw?.profileVisibility;
  if (!v || !KNOWN_VISIBILITY_STATES.has(v.state)) return null;
  return {
    state: v.state,
    visiblePhotoCount:
      typeof v.visiblePhotoCount === 'number' ? v.visiblePhotoCount : null,
    requiredPhotoCount:
      typeof v.requiredPhotoCount === 'number' ? v.requiredPhotoCount : null,
    reasonCode: v.reasonCode || null,
  };
}

export function isProfileHidden(
  visibility: ProfileVisibility | null | undefined,
): boolean {
  return !!visibility && visibility.state !== 'Visible';
}

/**
 * Silme kapısının tabanı. Kaynak SUNUCU (`requiredPhotoCount`) — eski
 * `MIN_PROFILE_PHOTOS` sabiti kaldırıldı. Alan gelmediğinde (deploy öncesi
 * pencere) bugünkü sunucu kuralına düşülüyor; yanlış tarafa düşmek yerine
 * backend'in `UT-6204`'ü nihai söz sahibi.
 */
export function resolveRequiredPhotoCount(
  visibility: ProfileVisibility | null | undefined,
): number {
  return visibility?.requiredPhotoCount ?? 2;
}

// ── i18n ────────────────────────────────────────────────────────────────────
// Metin HER ZAMAN `reasonCode`'dan üretilir: kodlar sabit ve kararlı, backend
// metni dile göre değişiyor. Bilinmeyen kodda önce backend'in yerelleştirilmiş
// metnine, o da yoksa duruma göre nötr bir metne düşülür (sözleşme §7/B5).

export function moderationStatusLabel(status: PhotoModerationStatus): string {
  return i18n.t(`profile.photoModeration.status.${status}`);
}

export function moderationReasonText(
  status: PhotoModerationStatus,
  reasonCode: string | null | undefined,
  serverText?: string | null,
): string {
  if (reasonCode && KNOWN_REASON_CODES.has(reasonCode)) {
    return i18n.t(`profile.photoModeration.reason.${reasonCode}`);
  }
  if (serverText) return serverText;
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
