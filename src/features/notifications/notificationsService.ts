import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

interface NotificationFeedResult {
  items: any[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const notificationsService = {
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
