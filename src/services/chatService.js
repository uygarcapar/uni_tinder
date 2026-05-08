import api from './api';
import { API_ENDPOINTS } from '../constants/api';

/**
 * Backend ChatDtos.cs ile birebir uyumlu REST wrapper.
 * Tüm metotlar `result` (ResponseDto.Result) içeriğini direkt döner; isSuccess=false durumunda
 * axios interceptor zaten exception fırlatır.
 *
 * Real-time (SignalR) yolu için realtimeService.js — HTTP burada offline-tolerant fallback +
 * geçmiş çekme + idempotent action'lar (edit/delete/search vb.) için kullanılır.
 */
export const chatService = {
  // GET /api/messages/conversations
  async getConversations() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_CONVERSATIONS);
    return res.result || [];
  },

  // GET /api/messages/conversations/{id}/history-cursor?cursor=base64&pageSize=30
  // Cursor opaque string — client parse etmemeli; sadece "received cursor → next request" akışı.
  async getMessageHistory(conversationId, { cursor = null, pageSize = 30 } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.append('cursor', cursor);
    params.append('pageSize', String(pageSize));
    const url = `${API_ENDPOINTS.MESSAGES_HISTORY_CURSOR(conversationId)}?${params.toString()}`;
    const res = await api.get(url);
    return res.result || { conversationId, messages: [], nextCursor: null, hasMore: false };
  },

  // POST /api/messages/send
  // Mobile: clientMessageId zorunlu (idempotency). UI optimistic insert için bunu kullanır.
  async sendMessage({ conversationId, content, clientMessageId, replyToMessageId, contentType, mediaUrl }) {
    const body = { conversationId, content, clientMessageId };
    if (replyToMessageId) body.replyToMessageId = replyToMessageId;
    if (contentType !== undefined && contentType !== null) body.contentType = contentType;
    if (mediaUrl) body.mediaUrl = mediaUrl;
    const res = await api.post(API_ENDPOINTS.MESSAGES_SEND, body);
    return res.result;
  },

  // POST /api/messages/conversations/{id}/mark-read
  async markRead(conversationId) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_MARK_READ(conversationId));
    return res.result; // { messagesMarkedRead, lastReadMessageId, lastReadSentAt }
  },

  // POST /api/messages/{id}/delivered  (idempotent)
  async markDelivered(messageId) {
    try {
      await api.post(API_ENDPOINTS.MESSAGES_DELIVERED(messageId));
    } catch (_) {
      // Idempotent — sessizce tolere et.
    }
  },

  // GET /api/messages/unread-count
  async getUnreadCount() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_UNREAD_COUNT);
    return res.result?.unreadCount ?? 0;
  },

  // GET /api/messages/unread-per-conversation
  async getUnreadPerConversation() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_UNREAD_PER_CONV);
    return res.result || [];
  },

  // DELETE /api/messages/conversations/{id} (soft unmatch — 24h grace açar)
  async deactivateConversation(conversationId) {
    const res = await api.delete(API_ENDPOINTS.MESSAGES_DEACTIVATE_CONV(conversationId));
    return res.result; // { restorableUntil }
  },

  // POST /api/messages/conversations/{id}/restore (24h içinde)
  async restoreConversation(conversationId) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_RESTORE_CONV(conversationId));
    return res.isSuccess;
  },

  // PATCH /api/messages/{id} (15 dk pencere, sadece kendi text mesajı)
  async editMessage(messageId, content) {
    const res = await api.patch(API_ENDPOINTS.MESSAGES_EDIT(messageId), { content });
    return res.result;
  },

  // DELETE /api/messages/{id}?forEveryone=true|false
  async deleteMessage(messageId, forEveryone = false) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_DELETE(messageId)}?forEveryone=${forEveryone ? 'true' : 'false'}`
    );
    return res.result;
  },

  // POST /api/messages/{id}/reactions  body: { emoji }
  async addReaction(messageId, emoji) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_REACTIONS(messageId), { emoji });
    return res.result; // güncel reactions[]
  },

  // DELETE /api/messages/{id}/reactions?emoji=...
  async removeReaction(messageId, emoji) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_REACTIONS(messageId)}?emoji=${encodeURIComponent(emoji)}`
    );
    return res.result;
  },

  // GET /api/messages/conversations/{id}/search?q=...&limit=50
  async searchMessages(conversationId, query, limit = 50) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const url = `${API_ENDPOINTS.MESSAGES_SEARCH(conversationId)}?${params.toString()}`;
    const res = await api.get(url);
    return res.result;
  },

  // POST /api/messages/upload-url  body: { conversationId, contentType, sizeBytes }
  // Returns { uploadUrl, mediaUrl, expiresAt } — client direkt S3'e PUT eder.
  async createUploadUrl({ conversationId, contentType, sizeBytes }) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_UPLOAD_URL, {
      conversationId,
      contentType,
      sizeBytes,
    });
    return res.result;
  },

  // S3 doğrudan PUT — auth header YOK (presigned URL bunu tolere etmez).
  // axios kullanmıyoruz çünkü interceptor Authorization basacak; native fetch kullanıyoruz.
  async uploadToS3(uploadUrl, fileUri, contentType) {
    // RN dosya URI'sinden blob üretmek için fetch -> blob round-trip.
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

  // Notification preferences (read receipt opt-out toggle dahil)
  async getNotificationPreferences() {
    const res = await api.get(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES);
    return res.result;
  },

  async updateNotificationPreferences(prefs) {
    await api.put(API_ENDPOINTS.NOTIFICATIONS_PREFERENCES, prefs);
  },
};

export default chatService;
