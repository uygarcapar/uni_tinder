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
  /** v11 — dolu ise `local_uri` İNDİRİLMİŞ bir önbellek kopyası (bkz. rowToMessage). */
  media_cached_at_ms: number | null;
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
 *
 * ── `_localUri` YALNIZ KENDİ KAYDIMIZ (Faz 5 review, Kritik 1) ──────────────
 * v11 ile `local_uri` kolonunun anlamı genişledi: artık GELEN bir medyanın
 * indirilmiş önbellek kopyasını da tutabiliyor. DTO alanı `_localUri` ise
 * genişlemedi — tüm tüketicileri (outboxPolicy'nin yükleme kararı,
 * messageEquality, optimistic balon ve VoiceBubble'ın `localUri` prop'u)
 * "bu bizim kendi kaydımızın dosyası" varsayımıyla yazıldı.
 *
 * Önbellek kopyasını da buradan sızdırmak, oynatma yolunu
 * `mediaCache.ensureCachedMedia`'nın TAMAMEN DIŞINA çıkarıyordu
 * (voicePlayback.ts: `localUri || ensureCachedMedia(...)`): dosya yoksa
 * (yeniden kurulum, konteyner taşıması, tahliye) oynatıcı ÖLÜ bir yol alıyor
 * ve her yeniden deneme AYNI ölü yola gidiyordu — mesaj KALICI olarak
 * çalınamaz hâle geliyordu. Üstelik `touchMediaCache` hiç çağrılmadığı için
 * LRU "en son kullanılan" değil "en son İNDİRİLEN" oluyordu.
 *
 * Kapı İKİ koşullu, ikisi de gerekli:
 *  • `media_cached_at_ms == null` — satır bir önbellek kaydı DEĞİL.
 *  • `client_message_id != null` — POZİTİF sahiplik kanıtı. Yalnız birinciye
 *    bakmak yetmiyor: `clearMediaCache` (tahliye) damgayı NULL'layıp yolu
 *    bırakabiliyor, o anda tahliye edilmiş bir GELEN mesaj birinci koşulu
 *    sağlıyor. Yalnız ikinciye bakmak da yetmiyor: kendi kaydımızın dosyası
 *    kaybolup yeniden indirildiğinde satırda hem cmid hem damga bulunuyor.
 * Aynı ikili `chatRepository.readOwnRecordingUri`'de de uygulanıyor.
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
    _localUri:
      row.media_cached_at_ms == null && row.client_message_id != null ? row.local_uri : null,
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
  /** v6 — "Dating" | "Friends"; NULL = sunucu söylemedi (≠ Dating). */
  mode: string | null;
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
    // ÜÇ DURUMLU değil ama aynı aile: NULL → `undefined` ("bilmiyoruz"), mod
    // süzgeci bu satırı ELEMİYOR (bkz. ConversationListItemDto.mode).
    mode: row.mode ?? undefined,
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
  /** v8 — backfill'in KENDİ devam noktası; ekranın `next_cursor`'ı DEĞİL
   *  (budama onu NULL'luyor, bkz. migrations.ts V8). */
  backfill_cursor: string | null;
  /** v8 — arşivin tamamı indi mi (0/1). Tek yönlü mandal; söken yollar
   *  `clearAllChatData()` ve `clearBackfillDone`. */
  backfill_done: number;
}

/**
 * `send_attempts` satırı (v7) — gönderim kuyruğunun disk muhasebesi.
 *
 * Mesaj GÖVDESİ taşımaz: tek kaynak `messages.client_message_id` satırı,
 * burası yalnız deneme sayacı/backoff/permanent/quota_charged için var
 * (bkz. migrations.ts V7 yorumu).
 */
export interface SendAttemptRow {
  client_message_id: string;
  attempts: number;
  first_seen_at_ms: number;
  next_eligible_at_ms: number;
  permanent: number;
  quota_charged: number;
  origin: string | null;
  last_error: string | null;
}

export type MutationKind = 'reaction' | 'delete';

/**
 * `pending_mutations` satırı (v9) — tepki/silme emirlerinin disk muhasebesi.
 *
 * `send_attempts`'in aksine gövdesiz DEĞİL: `payload_json` taşıyor, çünkü
 * tepki niyeti `messages.reactions_json`'dan türetilemez (bkz. migrations.ts
 * V9 yorumu). `permanent` kolonu yok — kalıcı ret burada satırı SİLER, bir
 * durumu işaretlemez.
 */
export interface PendingMutationRow {
  message_id: string;
  kind: MutationKind;
  conversation_id: string;
  payload_json: string;
  attempts: number;
  first_seen_at_ms: number;
  next_eligible_at_ms: number;
  last_error: string | null;
}
