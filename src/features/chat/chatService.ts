import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';

interface SendMessageArgs {
  conversationId: string;
  content: string;
  clientMessageId: string;
  replyToMessageId?: string;
  contentType?: number;
  mediaUrl?: string;
}

interface CreateUploadUrlArgs {
  conversationId: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Backend ChatDtos.cs ile birebir uyumlu REST wrapper.
 * Real-time (SignalR) yolu için realtimeService.ts — HTTP burada offline-tolerant fallback +
 * geçmiş çekme + idempotent action'lar (edit/delete/search vb.) için kullanılır.
 */
export const chatService = {
  async getConversations() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_CONVERSATIONS);
    return (res as any).result || [];
  },

  async getMessageHistory(
    conversationId: string,
    { cursor, pageSize = 30 }: { cursor?: string | null; pageSize?: number } = {}
  ) {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    params.append('pageSize', String(pageSize));
    const url = `${API_ENDPOINTS.MESSAGES_HISTORY_CURSOR(conversationId)}?${params.toString()}`;
    const res = await api.get(url);
    return (res as any).result || { conversationId, messages: [], nextCursor: null, hasMore: false };
  },

  async sendMessage({ conversationId, content, clientMessageId, replyToMessageId, contentType, mediaUrl }: SendMessageArgs) {
    const body: Record<string, any> = { conversationId, content, clientMessageId };
    if (replyToMessageId) body.replyToMessageId = replyToMessageId;
    if (contentType !== undefined && contentType !== null) body.contentType = contentType;
    if (mediaUrl) body.mediaUrl = mediaUrl;
    const res = await api.post(API_ENDPOINTS.MESSAGES_SEND, body);
    return (res as any).result;
  },

  async markRead(conversationId: string) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_MARK_READ(conversationId));
    return (res as any).result;
  },

  async markDelivered(messageId: string) {
    try {
      await api.post(API_ENDPOINTS.MESSAGES_DELIVERED(messageId));
    } catch (_) {
      // Idempotent — sessizce tolere et.
    }
  },

  async getUnreadCount(): Promise<number> {
    const res = await api.get(API_ENDPOINTS.MESSAGES_UNREAD_COUNT);
    return (res as any).result?.unreadCount ?? 0;
  },

  async getUnreadPerConversation() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_UNREAD_PER_CONV);
    return (res as any).result || [];
  },

  async deactivateConversation(conversationId: string) {
    const res = await api.delete(API_ENDPOINTS.MESSAGES_DEACTIVATE_CONV(conversationId));
    return (res as any).result;
  },

  async restoreConversation(conversationId: string): Promise<boolean> {
    const res = await api.post(API_ENDPOINTS.MESSAGES_RESTORE_CONV(conversationId));
    return (res as any).isSuccess;
  },

  async editMessage(messageId: string, content: string) {
    const res = await api.patch(API_ENDPOINTS.MESSAGES_EDIT(messageId), { content });
    return (res as any).result;
  },

  async deleteMessage(messageId: string, forEveryone = false) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_DELETE(messageId)}?forEveryone=${forEveryone ? 'true' : 'false'}`
    );
    return (res as any).result;
  },

  async addReaction(messageId: string, emoji: string) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_REACTIONS(messageId), { emoji });
    return (res as any).result;
  },

  async removeReaction(messageId: string, emoji: string) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_REACTIONS(messageId)}?emoji=${encodeURIComponent(emoji)}`
    );
    return (res as any).result;
  },

  async searchMessages(conversationId: string, query: string, limit = 50) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const url = `${API_ENDPOINTS.MESSAGES_SEARCH(conversationId)}?${params.toString()}`;
    const res = await api.get(url);
    return (res as any).result;
  },

  async createUploadUrl({ conversationId, contentType, sizeBytes }: CreateUploadUrlArgs) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_UPLOAD_URL, { conversationId, contentType, sizeBytes });
    return (res as any).result;
  },

  // S3 doğrudan PUT — auth header YOK (presigned URL bunu tolere etmez).
  async uploadToS3(uploadUrl: string, fileUri: string, contentType: string) {
    const fileResp = await fetch(fileUri);
    const blob = await fileResp.blob();
    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!putResp.ok) {
      throw new Error(`S3 upload failed: ${putResp.status}`);
    }
  },

  async getNotificationPreferences() {
    const res = await api.get(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES);
    return (res as any).result;
  },

  async updateNotificationPreferences(prefs: Record<string, any>) {
    await api.put(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES, prefs);
  },

  async getQuota(conversationId: string) {
    const res = await api.get(API_ENDPOINTS.MESSAGES_QUOTA(conversationId));
    return (res as any).result;
  },

  async unlockChat(conversationId: string, transactionId: string) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_UNLOCK(conversationId), { transactionId });
    return (res as any).result;
  },
};

export default chatService;
