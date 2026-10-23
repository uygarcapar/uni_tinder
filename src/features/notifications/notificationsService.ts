import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

export type NotificationType =
  | 'Match'
  | 'Like'
  | 'SuperLike'
  // Yorumlu, hedefli beğeni (2026-08-26). Push da atılıyor; `extraData.isNote`
  // = "true" geliyor. Kimlik gizleme kuralı Not'ta GEÇERSİZ — gönderenin adı
  // free alıcıya da açık.
  | 'Note'
  | 'MissedMatch'
  | 'Message'
  | 'System'
  | 'TrialEndingSoon'
  | 'PremiumExpiringSoon'
  // ── Fotoğraf moderasyonu (2026-08-24) ─────────────────────────────────────
  // Push davranışı backend'de sabit: PhotoApproved push ATMAZ (iyi haber için
  // push gürültü), diğer üçü atar. `relatedEntityId` = photoId.
  | 'PhotoRejected'
  | 'PhotoApproved'
  // `photoModerationAlerts` tercihinden MUAF — hesap durumu bildirimi.
  | 'ProfileHiddenInsufficientPhotos'
  | 'PhotoAppealResolved'
  // ── Davet programı (referral) ─────────────────────────────────────────────
  // Beşi de `SystemAlerts` tercihine bağlı (yeni tercih kolonu yok). Push
  // `data.type` bu adları taşıyor; yönlendirme AppNavigator'daki
  // `routeFromNotification` switch'inde.
  | 'ReferralJoined'
  | 'ReferralRewardGranted'
  | 'ReferralWelcomeGift'
  | 'VisibilityGrantExpiring'
  | 'VisibilityGrantExpired'
  // ── Lit Akışı ─────────────────────────────────────────────────────────────
  // Hepsi `feedAlerts` tercihine bağlı — MODERASYON/KISIT hariç: onlar "sistem
  // bildirimleri"nde (kullanıcı akış bildirimlerini kapatsa da bir kaldırma
  // kararını duymalı).
  //
  // Push metinlerinde İSİM ve İÇERİK YOK: kimin yanıt verdiği ve ne yazdığı
  // push'ta görünmüyor (sözleşme §11.2).
  //
  // `relatedEntityId` KULLANILMIYOR; ek alanlar `postId` / `replyId` /
  // `scope`. Bu yüzden routeFromNotification'ın dedupe anahtarına da bu ikisi
  // eklendi — yoksa pencere içindeki ikinci akış push'u yutuluyordu.
  | 'FeedReply'
  | 'FeedLikeMilestone'
  | 'FeedPostModerated'
  | 'FeedRestricted'
  // ⚠️ Bu ikisi YALNIZ push: backend in-app bildirim satırı YAZMIYOR, yani
  // NotificationsScreen listesinde hiç görünmüyorlar. Tip yine de burada,
  // çünkü push yönlendirmesi onları tanımak zorunda.
  | 'FeedDailyRefill'
  | 'FeedDailyUnused'
  /**
   * Kampüs Anları — kullanıcı kendi kampüsünün sınırına girdiğinde.
   *
   * ⚠️ `relatedEntityId` KULLANILMIYOR; ek alan `campusDomain` (KANONİK
   * yazım). Dedupe anahtarına da o eklendi — akış push'larındaki kazanın
   * aynısı olurdu: aynı pencerede iki farklı kampüs bildirimi gelirse ikincisi
   * yutulurdu.
   *
   * Kampüs başına GÜNDE BİR KEZ atılıyor. Tek tip, İKİ GEREKÇE — ek alan
   * `data.intent` hangisi olduğunu söylüyor:
   *   • `"Nearby"` → o gün paylaşılmış an var ("bugün N an paylaşıldı").
   *   • `"Prompt"` → yüzey boş ve kullanıcı bugün paylaşmamış ("ilki senden
   *     gelsin"). Eski kapı yalnız an VARKEN açıldığı için kampüse ilk varan
   *     kişi hiç bildirim almıyordu; yüzeyin boş kalmasının sebebi buydu.
   *
   * ⚠️ `intent` OKUNMASI GEREKMİYOR: yönlendirme ikisinde de aynı ekrana
   * gidiyor ve günlük hak iki gerekçe arasında PAYLAŞILIYOR (aynı gün ikinci
   * bildirim yok), yani dedupe anahtarına da girmemeli.
   *
   * Metinler sunucudan, alıcının dilinde geliyor — istemci `title`/`body`yi
   * ham basıyor.
   */
  | 'CampusMomentsNearby'
  /**
   * Kampüs anın kaldırıldı (moderasyon/admin). `relatedEntityId` = momentId.
   *
   * ⚠️ `campusAlerts` tercihinden MUAF — sunucuda `SystemAlerts`a bağlı.
   * Kullanıcı kampüs davetlerini kapatsa da fotosunun düştüğünü duymak
   * zorunda (`photoModerationAlerts`taki aynı özen).
   */
  | 'CampusMomentModerated';

/**
 * Akış bildirimleri — geldiklerinde akış listeleri ve/veya kota bayat oluyor.
 * `REFERRAL_NOTIFICATION_TYPES` ile aynı rol: tek liste, iki tüketici
 * (yönlendirme ve cache invalidation).
 */
export const CAMPUS_NOTIFICATION_TYPES = [
  'CampusMomentsNearby',
  'CampusMomentModerated',
] as const;

export const FEED_NOTIFICATION_TYPES = [
  'FeedReply',
  'FeedLikeMilestone',
  'FeedPostModerated',
  'FeedRestricted',
  'FeedDailyRefill',
  'FeedDailyUnused',
] as const;

/**
 * Davet/görünürlük bildirimleri — geldiklerinde davet özeti, swipe bakiyesi ve
 * profil BAYAT oluyor (ödül tam da bu üçünü değiştiriyor). Tek liste, iki
 * tüketici: yönlendirme ve cache invalidation.
 */
export const REFERRAL_NOTIFICATION_TYPES = [
  'ReferralJoined',
  'ReferralRewardGranted',
  'ReferralWelcomeGift',
  'VisibilityGrantExpiring',
  'VisibilityGrantExpired',
] as const;

export interface NotificationItem {
  id: string;
  title: string;
  body?: string | null;
  type: NotificationType | string;
  relatedEntityId?: string | null;
  /** Bildirimi tetikleyen kullanıcı — System/Trial/Premium tiplerinde null. */
  senderUserId?: string | null;
  /** Tetikleyenin profil fotoğrafı. Kullanıcının fotoğrafı yoksa da null gelebilir. */
  senderPhotoUrl?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

interface NotificationFeedResult {
  items: NotificationItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Ekran stack'te push ediliyor: geri basınca unmount oluyor, state sıfırlanıyor
// ve her yeni girişte liste boştan başlıyordu — yani her seferinde iskelet.
// Burası bir TTL cache DEĞİL, stale-while-revalidate snapshot'ı: ilk sayfa
// bellekte tutuluyor, ekran onunla ANINDA çiziliyor, tazeleme yine her açılışta
// arka planda yapılıyor. Sadece bellekte (diske yazılmıyor) ve kişisel veri
// olduğu için logout choke-point'inde siliniyor.
let feedSnapshot: NotificationItem[] | null = null;

const notificationsService = {
  /** İlk sayfanın son bilinen hâli — yoksa null. */
  getFeedSnapshot(): NotificationItem[] | null {
    return feedSnapshot;
  },
  setFeedSnapshot(items: NotificationItem[]): void {
    feedSnapshot = items;
  },
  /**
   * Elde tutulan sayfayı okundu'ya çeker. Ekrandan ÇIKARKEN çağrılıyor (bkz.
   * NotificationsScreen): `markAllRead()` açılışta sunucuya gidiyor ama satırlar
   * ekranda bilerek unread kalıyor — kullanıcı hangilerinin yeni olduğunu
   * görsün. Snapshot da unread kalınca ekrana ikinci girişte noktalar bir kare
   * çizilip arkadan gelen taze (okunmuş) sayfayla sönüyordu.
   */
  markSnapshotRead(): void {
    if (!feedSnapshot) return;
    feedSnapshot = feedSnapshot.map((n) => (n.isRead ? n : { ...n, isRead: true }));
  },
  /** Logout / hesap değişimi — bkz. AppNavigator'daki clearChatCache komşuluğu. */
  clearFeedSnapshot(): void {
    feedSnapshot = null;
  },
  async getFeed({ page = 1, pageSize = 30 }: { page?: number; pageSize?: number } = {}): Promise<NotificationFeedResult> {
    const res = await api.get(`${API_ENDPOINTS.NOTIFICATIONS_FEED}?page=${page}&pageSize=${pageSize}`);
    return (res as any).result || { items: [], totalCount: 0, page, pageSize, hasMore: false };
  },
  async getUnreadCount(): Promise<number> {
    const res = await api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD_COUNT);
    return (res as any).result?.unreadCount ?? 0;
  },
  async markRead(id: string): Promise<void> {
    await api.put(API_ENDPOINTS.NOTIFICATIONS_READ_ONE(id));
  },
  async markAllRead(): Promise<number> {
    const res = await api.put(API_ENDPOINTS.NOTIFICATIONS_READ_ALL);
    return (res as any).result?.markedRead ?? 0;
  },
};

export default notificationsService;
