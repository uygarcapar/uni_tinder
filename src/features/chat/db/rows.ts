import type {
  ConversationListItemDto,
  MessageDto,
  MessageReactionDto,
  ReplyPreviewDto,
} from '@/shared/types';

/** `messages` tablosunun satır şekli — SQLite'ın döndürdüğü ham hâli. */
export interface MessageRow {
  id: string;
  conversation_id: string;
  client_message_id: string | null;
  sender_id: string | null;
  content: string;
  content_type: number;
  sent_at: string;
  sent_at_ms: number;
  read_at: string | null;
  delivered_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  deleted_for_everyone: number;
  media_url: string | null;
  duration_ms: number | null;
  waveform_peaks: string | null;
  reply_to_message_id: string | null;
  reply_to_json: string | null;
  reactions_json: string | null;
  is_system_message: number;
  is_sender_deleted: number;
  localization_key: string | null;
  send_state: SendState;
  local_uri: string | null;
  row_version: number;
}

export type SendState = 'sent' | 'pending' | 'failed';

/**
 * Bozuk/eski JSON bir sohbeti açılamaz hâle GETİRMEMELİ — blob kaybı kozmetik
 * (reaction çipi ya da alıntı kartı çizilmez), sunucudan bir sonraki reconcile
 * zaten tazeliyor.
 */
function parseJson<T>(raw: string | null): T | undefined {
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Satır → MessageDto.
 *
 * ── Sabit anahtar sırası ────────────────────────────────────────────────────
 * Nesne literali kasten tek parça ve sıra sabit: aynı gizli sınıf (hidden class)
 * altında kalmak, projeksiyonun her satır için çalıştığı sıcak yolda ölçülebilir
 * fark yaratıyor.
 *
 * ── `_pending` / `_failed` HER ZAMAN açık boolean ───────────────────────────
 * messageContentEqual `a._pending === b._pending` diyor, yani `undefined` ile
 * `false` EŞİT DEĞİL. Projeksiyonun kendi içinde tutarlı olması (aynı satır →
 * aynı sonuç) tek gereksinim; bu yüzden ikisi de her zaman yazılıyor. Redux'ta
 * doğan mesajlarla karşılaştırırken (Faz 2 dual-write assertion'ı) iki tarafı da
 * `!!` ile normalize et — orada `undefined` görülebilir.
 */
export function rowToMessage(row: MessageRow): MessageDto {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? '',
    content: row.content,
    contentType: row.content_type,
    sentAt: row.sent_at,
    readAt: row.read_at,
    deliveredAt: row.delivered_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    deletedForEveryone: row.deleted_for_everyone === 1,
    clientMessageId: row.client_message_id ?? undefined,
    reactions: parseJson<MessageReactionDto[]>(row.reactions_json),
    isSystemMessage: row.is_system_message === 1,
    isSenderDeleted: row.is_sender_deleted === 1,
    localizationKey: row.localization_key ?? undefined,
    mediaUrl: row.media_url,
    durationMs: row.duration_ms,
    waveformPeaks: row.waveform_peaks,
    replyToMessageId: row.reply_to_message_id,
    replyTo: parseJson<ReplyPreviewDto>(row.reply_to_json) ?? null,
    _pending: row.send_state === 'pending',
    _failed: row.send_state === 'failed',
    _localUri: row.local_uri,
  };
}

/** `conversations` tablosunun satır şekli. */
export interface ConversationRow {
  conversation_id: string;
  match_id: string | null;
  partner_user_id: string;
  partner_display_name: string | null;
  partner_profile_image_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_at_ms: number | null;
  last_message_content_type: number | null;
  unread_count: number;
  is_active: number;
  is_unlimited: number | null;
  remaining_messages: number | null;
  requires_premium: number | null;
  restorable_until: string | null;
  restorable_until_known: number;
  deactivated_by_me: number | null;
  sort_order: number;
  closed_by_me: number | null;
  closed_reason: string | null;
}

/**
 * Satır → ConversationListItemDto.
 *
 * ── ÜÇ DURUMLU alanlar (en kolay bozulan yer) ───────────────────────────────
 * `isUnlimited`, `requiresPremium`, `closedByMe`, `deactivatedByMe` ve
 * `restorableUntil` için `undefined` ("bilmiyoruz") ile `false`/`null`
 * ("hayır") AYRI anlamlar — üçü de ekranda farklı davranıyor:
 *   • isUnlimited undefined → "Sınırlı" rozeti ÇİZİLMEZ (MessagesScreen)
 *   • closedByMe/deactivatedByMe undefined → yerel tahmine düşülür
 *     (restoreWindow.resolveClosedByMe)
 *   • restorableUntil undefined → "alan gelmedi", null → "pencere YOK"
 *     (shouldOfferRestore)
 * Bu yüzden nullable kolonlar `?? undefined` ile, `restorable_until` ise
 * `restorable_until_known` bayrağına bakılarak çözülüyor — o bayrak zaten tam
 * bu ayrımı diskte temsil etmek için var (bkz. upsertConversations kural 3).
 *
 * `partnerIsOnline` HER ZAMAN false: presence realtime veri, şemada kolonu
 * bile yok. Diskten "online" doğurmak, hub bağlanana kadar herkesi sahte
 * çevrimiçi gösterirdi.
 */
export function rowToConversation(row: ConversationRow): ConversationListItemDto {
  return {
    conversationId: row.conversation_id,
    matchId: row.match_id ?? undefined,
    partnerUserId: row.partner_user_id,
    partnerDisplayName: row.partner_display_name ?? '',
    partnerProfileImageUrl: row.partner_profile_image_url ?? undefined,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    lastMessageContentType: row.last_message_content_type ?? undefined,
    unreadCount: row.unread_count ?? 0,
    isActive: row.is_active === 1,
    partnerIsOnline: false,
    isUnlimited: row.is_unlimited == null ? undefined : row.is_unlimited === 1,
    remainingMessages: row.remaining_messages ?? null,
    requiresPremium: row.requires_premium == null ? undefined : row.requires_premium === 1,
    restorableUntil: row.restorable_until_known === 1 ? row.restorable_until : undefined,
    closedByMe: row.closed_by_me == null ? undefined : row.closed_by_me === 1,
    closedReason: row.closed_reason ?? undefined,
    deactivatedByMe: row.deactivated_by_me == null ? undefined : row.deactivated_by_me === 1,
  };
}

/** `sync_state` satırı — sohbetin yerel geçmişinin sınırları. */
export interface SyncStateRow {
  conversation_id: string;
  oldest_loaded_sent_at_ms: number | null;
  next_cursor: string | null;
  has_more: number;
  has_hidden_history: number;
  last_synced_at_ms: number | null;
}
