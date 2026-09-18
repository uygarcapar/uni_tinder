import type { MessageDto, MessageReactionDto, ReplyPreviewDto } from '@/shared/types';

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

/** `sync_state` satırı — sohbetin yerel geçmişinin sınırları. */
export interface SyncStateRow {
  conversation_id: string;
  oldest_loaded_sent_at_ms: number | null;
  next_cursor: string | null;
  has_more: number;
  has_hidden_history: number;
  last_synced_at_ms: number | null;
}
