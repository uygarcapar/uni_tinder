import { File, UploadType } from 'expo-file-system';
import api from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { normalizeUtcFields } from '@/shared/utils/dateUtc';

interface SendMessageArgs {
  conversationId: string;
  content: string;
  clientMessageId: string;
  replyToMessageId?: string;
  // Sayı (legacy) ya da PascalCase enum adı ("Voice") — bkz. api wire sözleşmesi.
  contentType?: number | string;
  mediaUrl?: string;
  /** Sesli mesajda ZORUNLU (1..60000): balon sesi indirmeden çubuğu çizemez. */
  durationMs?: number;
  /** Virgüllü 0-100 tamsayılar, en çok 64 nokta. Opsiyonel. */
  waveformPeaks?: string;
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
 *
 * Zaman damgaları: server `Z` soneki olmadan gönderebiliyor (kontrat §8.3) — HER
 * dönüş normalizeUtcFields'tan geçer, böylece store'a giren tek format Z'li UTC olur.
 * Optimistic mesajlar zaten `toISOString()` (Z'li) ürettiği için karışım bitiyor.
 */
export const chatService = {
  async getConversations() {
    const res = await api.get(API_ENDPOINTS.MESSAGES_CONVERSATIONS);
    return normalizeUtcFields((res as any).result || []);
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
    return normalizeUtcFields(
      (res as any).result || {
        conversationId,
        messages: [],
        nextCursor: null,
        hasMore: false,
        hasHiddenHistory: false,
      }
    );
  },

  async sendMessage({
    conversationId,
    content,
    clientMessageId,
    replyToMessageId,
    contentType,
    mediaUrl,
    durationMs,
    waveformPeaks,
  }: SendMessageArgs) {
    const body: Record<string, any> = { conversationId, content, clientMessageId };
    if (replyToMessageId) body.replyToMessageId = replyToMessageId;
    if (contentType !== undefined && contentType !== null) body.contentType = contentType;
    if (mediaUrl) body.mediaUrl = mediaUrl;
    if (durationMs != null) body.durationMs = durationMs;
    if (waveformPeaks) body.waveformPeaks = waveformPeaks;
    const res = await api.post(API_ENDPOINTS.MESSAGES_SEND, body);
    return normalizeUtcFields((res as any).result);
  },

  async markRead(conversationId: string) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_MARK_READ(conversationId));
    return normalizeUtcFields((res as any).result);
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

  /**
   * "Eşleşmeyi kaldır" (yumuşak ayrılık). Sohbet iki tarafta da kapanır ama
   * MESAJLAR SİLİNMEZ; 30 gün sonra çift tekrar eşleşebilir ve aynı sohbete
   * döner. Kalıcı ayrılık için engelleme/şikayet yolu vardır (moderationService).
   *
   * `restorableUntil` null dönebilir → geri alma penceresi YOK (rematch limiti
   * dolmuş, çift engellenmiş ya da hiç mesajlaşılmamış). Çağıran taraf "geri al"
   * butonunu bu alana göre gösterir; hardcode 24 saat varsaymaz.
   */
  async deactivateConversation(conversationId: string) {
    const res = await api.delete(API_ENDPOINTS.MESSAGES_DEACTIVATE_CONV(conversationId));
    const result = normalizeUtcFields((res as any).result) as any;
    return {
      ...(result || {}),
      restorableUntil: result?.restorableUntil ?? null,
      // Limit dolduğunda backend mesajı farklılaşıyor ("geri alabilirsin" yok).
      message: result?.message ?? (res as any).message ?? null,
    };
  },

  async restoreConversation(conversationId: string): Promise<boolean> {
    const res = await api.post(API_ENDPOINTS.MESSAGES_RESTORE_CONV(conversationId));
    return (res as any).isSuccess;
  },

  /**
   * Rematch sonrası gizli kalan eski mesajları açar. Geçmiş ORTAKTIR — bir taraf
   * açınca karşı tarafa da ConversationHistoryRevealed event'i gider.
   *
   * Ret gerekçeleri (`reason`): too_old (180 günden eski), no_history (açılacak
   * mesaj yok), not_found. Reddi ayırt edebilmek için HTTP hatası da yakalanır:
   * backend bunu 200+isSuccess:false ya da 4xx olarak dönebiliyor.
   */
  async revealHistory(
    conversationId: string
  ): Promise<{ isSuccess: boolean; revealedAt: string | null; reason: string | null }> {
    const read = (payload: any) => ({
      isSuccess: !!payload?.isSuccess,
      revealedAt: payload?.result?.revealedAt ?? null,
      reason: payload?.reason ?? payload?.result?.reason ?? payload?.errorCode ?? null,
    });
    try {
      const res = normalizeUtcFields(
        await api.post(API_ENDPOINTS.MESSAGES_REVEAL_HISTORY(conversationId))
      );
      return read(res);
    } catch (err: any) {
      const body = err?.response?.data;
      if (!body) throw err;
      return { ...read(body), isSuccess: false };
    }
  },

  async deleteMessage(messageId: string, forEveryone = false) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_DELETE(messageId)}?forEveryone=${forEveryone ? 'true' : 'false'}`
    );
    return normalizeUtcFields((res as any).result);
  },

  async addReaction(messageId: string, emoji: string) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_REACTIONS(messageId), { emoji });
    return normalizeUtcFields((res as any).result);
  },

  async removeReaction(messageId: string, emoji: string) {
    const res = await api.delete(
      `${API_ENDPOINTS.MESSAGES_REACTIONS(messageId)}?emoji=${encodeURIComponent(emoji)}`
    );
    return normalizeUtcFields((res as any).result);
  },

  async createUploadUrl({ conversationId, contentType, sizeBytes }: CreateUploadUrlArgs) {
    const res = await api.post(API_ENDPOINTS.MESSAGES_UPLOAD_URL, { conversationId, contentType, sizeBytes });
    return (res as any).result;
  },

  /**
   * Sesli mesajın imzalı OYNATMA linki. Kısa ömürlü (15 dk) — oynatmaya
   * basıldığında çağrılır, CACHE'LENMEZ; 403 alınırsa yeniden istenir.
   * Herkesten silinen mesajda UT-6606 döner.
   */
  async getMediaUrl(messageId: string): Promise<{
    url: string;
    expiresAt: string | null;
    durationMs: number | null;
  }> {
    const res = await api.get(API_ENDPOINTS.MESSAGES_MEDIA_URL(messageId));
    const result = (res as any).result || {};
    return {
      url: result.url,
      expiresAt: result.expiresAt ?? null,
      durationMs: result.durationMs ?? null,
    };
  },

  /**
   * Yerel dosyayı presigned URL'e ham gövde olarak PUT eder (native yükleme —
   * dosya JS'e okunmaz). `Content-Type` imzaya dahil: adım 1'de bildirilenle
   * BİREBİR aynı olmalı, farklıysa S3 403 döner. Authorization header'ı YOK.
   */
  async uploadFileToS3(uploadUrl: string, file: File, contentType: string) {
    const res = await file.upload(uploadUrl, {
      httpMethod: 'PUT',
      uploadType: UploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`S3 upload failed: ${res.status}`);
    }
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
};

export default chatService;
