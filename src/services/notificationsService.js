import api from './api';
import { API_ENDPOINTS } from '../constants/api';

/**
 * Backend NotificationsController wrapper — in-app feed.
 * Hub NewNotification event'i bu feed'i invalidate eder.
 */
const notificationsService = {
  async getFeed({ page = 1, pageSize = 30 } = {}) {
    const res = await api.get(`${API_ENDPOINTS.NOTIFICATIONS_FEED}?page=${page}&pageSize=${pageSize}`);
    return res.result || { items: [], totalCount: 0, page, pageSize, hasMore: false };
  },
  async getUnreadCount() {
    const res = await api.get(API_ENDPOINTS.NOTIFICATIONS_UNREAD_COUNT);
    return res.result?.unreadCount ?? 0;
  },
  async markRead(id) {
    await api.put(API_ENDPOINTS.NOTIFICATIONS_READ_ONE(id));
  },
  async markAllRead() {
    const res = await api.put(API_ENDPOINTS.NOTIFICATIONS_READ_ALL);
    return res.result?.markedRead ?? 0;
  },
};

export default notificationsService;
