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
  | 'PhotoAppealResolved';

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
