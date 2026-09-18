import { getChatDb, type ChatDbDriver, type SqlValue } from '@/features/chat/db/chatDb';
import type { MessageRow, SendState, SyncStateRow } from '@/features/chat/db/rows';
import { rekey as rekeyCache } from '@/features/chat/messageCache';
import { normalizeMessage } from '@/features/chat/normalizeMessage';
import { utcTime } from '@/shared/utils/dateUtc';
import type { ConversationListItemDto, MessageDto } from '@/shared/types';

/**
 * Chat'in TÜM SQL'i. Başka hiçbir dosya chatDb'yi import etmez.
 *
 * Buradaki iki algoritma chatSlice'tan PORT EDİLDİ ve semantikleri korunmak
 * zorunda (tests/features/chat/chatSlice.history.test.ts hâlâ Redux tarafını
 * kilitliyor): reconcile merge'i ve conversations "local wins" merge'i.
 */

// ── Yazma yardımcıları ──────────────────────────────────────────────────────

const MESSAGE_COLUMNS = `
  id, conversation_id, client_message_id, sender_id, content, content_type,
  sent_at, sent_at_ms, read_at, delivered_at, edited_at, deleted_at,
  deleted_for_everyone, media_url, duration_ms, waveform_peaks,
  reply_to_message_id, reply_to_json, reactions_json, is_system_message,
  is_sender_deleted, localization_key, send_state, local_uri`;

function messageParams(raw: MessageDto, conversationId: string, sendState: SendState): SqlValue[] {
  const m = normalizeMessage(raw, conversationId);
  return [
    m.id,
    m.conversationId ?? conversationId,
    m.clientMessageId ?? null,
    m.senderId ?? null,
    m.content ?? '',
    typeof m.contentType === 'number' ? m.contentType : 0,
    m.sentAt,
    utcTime(m.sentAt),
    m.readAt ?? null,
    m.deliveredAt ?? null,
    m.editedAt ?? null,
    m.deletedAt ?? null,
    m.deletedForEveryone ? 1 : 0,
    m.mediaUrl ?? null,
    m.durationMs ?? null,
    m.waveformPeaks ?? null,
    m.replyToMessageId ?? null,
    m.replyTo ? JSON.stringify(m.replyTo) : null,
    m.reactions && m.reactions.length ? JSON.stringify(m.reactions) : null,
    m.isSystemMessage ? 1 : 0,
    m.isSenderDeleted ? 1 : 0,
    m.localizationKey ?? null,
    sendState,
    m._localUri ?? null,
  ];
}

/**
 * Gerçekten bir şey değiştiyse güncelle.
 *
 * `IS NOT` SQLite'ın NULL-güvenli eşitsizliği (`<>` NULL'da NULL döner, yani
 * koşul hiç tutmaz). Bu WHERE olmadan her reconcile her satırın
 * `row_version`'ını artırır ve messageCache'in O(1) hızlı yolu tamamen ölür —
 * "hiçbir şey değişmedi" durumu, yani en yaygın durum, tam liste yenilemesine
 * dönerdi. Bu yüzden uzun: karşılaştırma listesi EKSİK kalırsa o alanın
 * güncellemesi sessizce düşer.
 *
 * `client_message_id` ve `local_uri` COALESCE'li: sunucu kopyası ikisini de
 * taşımıyor ama ikisi de kaybedilemez (keyExtractor cmid'e bakıyor; _localUri
 * gönderdiğimiz sesin yerel dosyası).
 */
const UPSERT_MESSAGE = `
INSERT INTO messages (${MESSAGE_COLUMNS})
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  client_message_id    = COALESCE(excluded.client_message_id, messages.client_message_id),
  sender_id            = excluded.sender_id,
  content              = excluded.content,
  content_type         = excluded.content_type,
  sent_at              = excluded.sent_at,
  sent_at_ms           = excluded.sent_at_ms,
  read_at              = excluded.read_at,
  delivered_at         = excluded.delivered_at,
  edited_at            = excluded.edited_at,
  deleted_at           = excluded.deleted_at,
  deleted_for_everyone = excluded.deleted_for_everyone,
  media_url            = excluded.media_url,
  duration_ms          = excluded.duration_ms,
  waveform_peaks       = excluded.waveform_peaks,
  reply_to_message_id  = excluded.reply_to_message_id,
  reply_to_json        = excluded.reply_to_json,
  reactions_json       = excluded.reactions_json,
  is_system_message    = excluded.is_system_message,
  is_sender_deleted    = excluded.is_sender_deleted,
  localization_key     = excluded.localization_key,
  send_state           = excluded.send_state,
  local_uri            = COALESCE(excluded.local_uri, messages.local_uri),
  row_version          = messages.row_version + 1
WHERE messages.sender_id            IS NOT excluded.sender_id
   OR messages.content              IS NOT excluded.content
   OR messages.content_type         IS NOT excluded.content_type
   OR messages.sent_at              IS NOT excluded.sent_at
   OR messages.read_at              IS NOT excluded.read_at
   OR messages.delivered_at         IS NOT excluded.delivered_at
   OR messages.edited_at            IS NOT excluded.edited_at
   OR messages.deleted_at           IS NOT excluded.deleted_at
   OR messages.deleted_for_everyone IS NOT excluded.deleted_for_everyone
   OR messages.media_url            IS NOT excluded.media_url
   OR messages.duration_ms          IS NOT excluded.duration_ms
   OR messages.waveform_peaks       IS NOT excluded.waveform_peaks
   OR messages.reply_to_message_id  IS NOT excluded.reply_to_message_id
   OR messages.reply_to_json        IS NOT excluded.reply_to_json
   OR messages.reactions_json       IS NOT excluded.reactions_json
   OR messages.is_system_message    IS NOT excluded.is_system_message
   OR messages.is_sender_deleted    IS NOT excluded.is_sender_deleted
   OR messages.localization_key     IS NOT excluded.localization_key
   OR messages.send_state           IS NOT excluded.send_state
   OR messages.client_message_id    IS NOT COALESCE(excluded.client_message_id, messages.client_message_id)`;

/**
 * Tek mesajı yazar.
 *
 * `clientMessageId` eşleşmesi id eşleşmesinden ÖNCE gelir: optimistic satır
 * `temp-<cmid>` id'siyle doğuyor, sunucu ack'i gerçek id ile geliyor. Sadece
 * id'ye bakarsak aynı mantıksal mesaj İKİ SATIR olurdu (ve kısmi unique index
 * bunu reddedip yazmayı patlatırdı). Eşleşme bulunduğunda satırın id'si yerinde
 * güncellenir ve identity map aynı anahtara taşınır.
 */
export function upsertMessage(
  db: ChatDbDriver,
  raw: MessageDto,
  conversationId: string,
  sendState: SendState = 'sent',
): void {
  const cmid = raw.clientMessageId;
  if (cmid) {
    const existing = db.getFirst<{ id: string }>(
      'SELECT id FROM messages WHERE client_message_id = ?',
      [cmid],
    );
    if (existing && existing.id !== raw.id) {
      db.run('UPDATE messages SET id = ?, row_version = row_version + 1 WHERE client_message_id = ?', [
        raw.id,
        cmid,
      ]);
      rekeyCache(conversationId, existing.id, raw.id);
    }
  }
  db.run(UPSERT_MESSAGE, messageParams(raw, conversationId, sendState));
}

export function upsertMessages(
  db: ChatDbDriver,
  messages: MessageDto[],
  conversationId: string,
  sendState: SendState = 'sent',
): void {
  for (const m of messages) upsertMessage(db, m, conversationId, sendState);
}

/**
 * Tek mesajlık dışarıdan çağrı (realtime event'leri). `upsertMessage` sürücüyü
 * parametre alıyor çünkü toplu yollar hepsini TEK transaction'da yazıyor; tek
 * satır yazanların o ayrıntıyı bilmesi gerekmiyor.
 */
export function saveMessage(
  raw: MessageDto,
  conversationId: string,
  sendState: SendState = 'sent',
): void {
  upsertMessage(getChatDb(), raw, conversationId, sendState);
}

// ── Okuma yolu (keyset — asla OFFSET) ───────────────────────────────────────

/** Sohbet açılışının sıcak penceresi: en yeniden geriye `limit` satır. */
export function readWindow(conversationId: string, limit = 60): MessageRow[] {
  return getChatDb().getAll<MessageRow>(
    `SELECT * FROM messages WHERE conversation_id = ?
     ORDER BY sent_at_ms DESC, id DESC LIMIT ?`,
    [conversationId, limit],
  );
}

/**
 * Yukarı kaydırma. Keyset (sent_at_ms, id) — OFFSET binlerce satırlık bir
 * sohbette her sayfada taranan satır sayısını büyütürdü; ayrıca araya realtime
 * bir insert girdiğinde OFFSET satır atlatır/tekrarlatır.
 *
 * `id` tiebreaker'ı şart: aynı milisaniyede iki mesaj varsa (toplu gönderim,
 * sistem mesajı) yalnız zamana bakan bir keyset ya sonsuz döngüye girer ya da
 * satır atlar.
 */
export function readOlder(
  conversationId: string,
  before: { sentAtMs: number; id: string },
  limit = 30,
): MessageRow[] {
  return getChatDb().getAll<MessageRow>(
    `SELECT * FROM messages
     WHERE conversation_id = ?
       AND (sent_at_ms < ? OR (sent_at_ms = ? AND id < ?))
     ORDER BY sent_at_ms DESC, id DESC LIMIT ?`,
    [conversationId, before.sentAtMs, before.sentAtMs, before.id, limit],
  );
}

/** Yerel arşivde bu sohbetten kaç satır var — indeksli COUNT, render sırasında güvenli. */
export function countMessages(conversationId: string): number {
  return messageCount(getChatDb(), conversationId);
}

export function readSyncState(conversationId: string): SyncStateRow | null {
  return getChatDb().getFirst<SyncStateRow>(
    'SELECT * FROM sync_state WHERE conversation_id = ?',
    [conversationId],
  );
}

function newestSentAtMs(db: ChatDbDriver, conversationId: string): number | null {
  const row = db.getFirst<{ v: number | null }>(
    'SELECT MAX(sent_at_ms) AS v FROM messages WHERE conversation_id = ?',
    [conversationId],
  );
  return row?.v ?? null;
}

function messageCount(db: ChatDbDriver, conversationId: string): number {
  const row = db.getFirst<{ n: number }>(
    'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?',
    [conversationId],
  );
  return row?.n ?? 0;
}

function writeSyncState(
  db: ChatDbDriver,
  conversationId: string,
  patch: {
    oldestLoadedSentAtMs?: number | null;
    nextCursor?: string | null;
    hasMore?: boolean;
    hasHiddenHistory?: boolean;
  },
): void {
  db.run(
    `INSERT INTO sync_state (conversation_id, oldest_loaded_sent_at_ms, next_cursor, has_more, has_hidden_history)
     VALUES (?,?,?,?,?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       oldest_loaded_sent_at_ms = COALESCE(?, sync_state.oldest_loaded_sent_at_ms),
       next_cursor        = CASE WHEN ? THEN ? ELSE sync_state.next_cursor END,
       has_more           = CASE WHEN ? THEN ? ELSE sync_state.has_more END,
       has_hidden_history = CASE WHEN ? THEN ? ELSE sync_state.has_hidden_history END`,
    [
      conversationId,
      patch.oldestLoadedSentAtMs ?? null,
      patch.nextCursor ?? null,
      patch.hasMore ? 1 : 0,
      patch.hasHiddenHistory ? 1 : 0,
      patch.oldestLoadedSentAtMs ?? null,
      patch.nextCursor !== undefined ? 1 : 0,
      patch.nextCursor ?? null,
      patch.hasMore !== undefined ? 1 : 0,
      patch.hasMore ? 1 : 0,
      patch.hasHiddenHistory !== undefined ? 1 : 0,
      patch.hasHiddenHistory ? 1 : 0,
    ],
  );
}

// ── Bitişiklik (contiguity) invariant'ı ─────────────────────────────────────

export interface HistoryPage {
  messages: MessageDto[]; // newest-first
  nextCursor: string | null;
  hasMore: boolean;
  hasHiddenHistory?: boolean;
}

export interface ApplyPageResult {
  /** Hiçbir şey yazılmadı (şüpheli boş page-1). */
  skipped: boolean;
  /** Pencereler çakışmadı → yetim kuyruk silindi. */
  gapReplaced: boolean;
  /** Gap vardı ama hasMore:false olduğu için silmeyi REDDETTİK. */
  gapRefused: boolean;
  deletedCount: number;
}

/**
 * Sunucudan gelen bir geçmiş sayfasını uygular.
 *
 * INVARIANT: bir sohbetin yerel satırları, sunucunun gerçek geçmişinin BİTİŞİK
 * bir son-ekidir — `oldest_loaded_sent_at_ms`'ten bildiğimiz en yeni mesaja
 * kadar, delik yok.
 */
export function applyHistoryPage(
  conversationId: string,
  page: HistoryPage,
  opts: { append: boolean },
): ApplyPageResult {
  const db = getChatDb();
  const result: ApplyPageResult = {
    skipped: false,
    gapReplaced: false,
    gapRefused: false,
    deletedCount: 0,
  };

  const pageMessages = page.messages ?? [];
  const pageOldestMs = pageMessages.length
    ? Math.min(...pageMessages.map((m) => utcTime(m.sentAt)))
    : null;

  db.transaction(() => {
    if (opts.append) {
      // Sunucu-authoritative ve her sayfada aynı cevabı taşır.
      if (page.hasHiddenHistory !== undefined) {
        writeSyncState(db, conversationId, { hasHiddenHistory: !!page.hasHiddenHistory });
      }
      // Daha eski sayfa: kesinlikle yerel aralığın altında, çakışma sorusu yok.
      upsertMessages(db, pageMessages, conversationId);
      const existing = readSyncState(conversationId);
      const nextOldest =
        pageOldestMs === null
          ? (existing?.oldest_loaded_sent_at_ms ?? null)
          : Math.min(existing?.oldest_loaded_sent_at_ms ?? Number.POSITIVE_INFINITY, pageOldestMs);
      writeSyncState(db, conversationId, {
        oldestLoadedSentAtMs: nextOldest,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
      return;
    }

    // ── page-1 reconcile ──
    const localCount = messageCount(db, conversationId);

    if (pageMessages.length === 0) {
      // BOŞ SAYFA. Elimizde mesaj VARSA bu neredeyse kesin geçici bir sunucu
      // arızası; eski kod burada bucket'ı siliyordu (chatSlice.ts:718-731'de
      // oldestServer=null → overlap=false → tail=[]). Redux'ta bu 30 mesaja mal
      // oluyordu, SQLite'ta kullanıcının TÜM offline geçmişine mal olur.
      // Elimizde hiç mesaj yoksa sayfa doğruyu söylüyor (boş sohbet) ve
      // sync_state'i kurmak güvenli.
      if (localCount > 0) {
        result.skipped = true;
        return; // hasHiddenHistory dahil HİÇBİR alan yazılmaz
      }
      writeSyncState(db, conversationId, {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        hasHiddenHistory: !!page.hasHiddenHistory,
      });
      return;
    }

    if (page.hasHiddenHistory !== undefined) {
      writeSyncState(db, conversationId, { hasHiddenHistory: !!page.hasHiddenHistory });
    }

    // En yeni ucu upsert'TEN ÖNCE oku — sayfanın kendi satırları yazıldıktan
    // sonra bakarsak her sayfa kendisiyle "çakışır" ve test anlamsızlaşır.
    const localNewestMs = newestSentAtMs(db, conversationId);

    upsertMessages(db, pageMessages, conversationId);

    if (localCount === 0 || localNewestMs === null) {
      // İlk çekim — gap diye bir şey yok.
      writeSyncState(db, conversationId, {
        oldestLoadedSentAtMs: pageOldestMs,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
      return;
    }

    // ÇAKIŞMA TESTİ ZAMANLA, id ile DEĞİL. id üyeliği (chatSlice.ts:721) sınır
    // mesajı karşı tarafça herkesten silinirse sahte gap görüp sayfalanmış
    // kuyruğu siliyordu. İki aralık da aynı dizinin son-eki olduğu için,
    // sunucu sayfası elimizdekine iniyorsa çakışıyorlar demektir.
    const overlap = pageOldestMs !== null && pageOldestMs <= localNewestMs;

    if (overlap) {
      const tail = db.getFirst<{ n: number }>(
        'SELECT EXISTS(SELECT 1 FROM messages WHERE conversation_id = ? AND sent_at_ms < ?) AS n',
        [conversationId, pageOldestMs!],
      );
      const existing = readSyncState(conversationId);
      if (tail?.n && existing?.next_cursor) {
        // Derin sayfalama: kuyruk + geçerli derin cursor aynen kalır. Sayfa-1'in
        // cursor'ını yazmak kuyruğu yeniden indirtirdi.
        return;
      }
      writeSyncState(db, conversationId, {
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      });
      return;
    }

    // ── GERÇEK GAP ──
    // Yalnız sunucu "daha var" diyorsa sil: sildiğimizi cursor prensipte geri
    // getirebiliyorsa kayıp telafi edilebilir. hasMore:false iken elimizde daha
    // eski satır olması tutarsızlık demek — dokunma, görünür kıl.
    if (!page.hasMore) {
      result.gapRefused = true;
      return;
    }

    // send_state='sent' koşulu: bekleyen/başarısız gönderimler ASLA silinmez
    // (eski kodda `!m._pending` filtresiyle aynı koruma).
    const before = messageCount(db, conversationId);
    db.run(
      `DELETE FROM messages
       WHERE conversation_id = ? AND sent_at_ms < ? AND send_state = 'sent'`,
      [conversationId, pageOldestMs!],
    );
    result.deletedCount = before - messageCount(db, conversationId);
    result.gapReplaced = true;
    writeSyncState(db, conversationId, {
      oldestLoadedSentAtMs: pageOldestMs,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    });
  });

  return result;
}

// ── Nokta mutasyonlar (realtime event'lerin aynası) ─────────────────────────
//
// Hepsinde İKİ kural var:
//  1. `row_version = row_version + 1` — messageCache'in hızlı yolu buna bakıyor.
//  2. No-op koruması (`read_at IS NULL`, `IS NOT ?` …) — gerçekten bir şey
//     değişmiyorsa satıra DOKUNMA, yoksa sürüm boşuna artar ve o mesaj her
//     seferinde yeniden projekte edilir.

/**
 * Okundu bilgisi — tek ranged UPDATE.
 *
 * chatSlice.ts:300-313 bunu tüm dizide `.map()` ile yapıyor; burada index
 * hallediyor. Zaman karşılaştırması `sent_at_ms` üzerinden: ham string
 * karşılaştırması Z'siz eski kayıtlarda 3 saatlik yanlış pencere üretirdi.
 */
export function applyReadReceipt(p: {
  conversationId: string;
  readByUserId: string;
  lastReadSentAt?: string | null;
  readAt?: string | null;
}): void {
  const limitMs = p.lastReadSentAt ? utcTime(p.lastReadSentAt) : null;
  getChatDb().run(
    `UPDATE messages SET read_at = ?, row_version = row_version + 1
     WHERE conversation_id = ? AND sender_id IS NOT NULL AND sender_id <> ?
       AND read_at IS NULL AND (? IS NULL OR sent_at_ms <= ?)`,
    [
      p.readAt ?? new Date().toISOString(),
      p.conversationId,
      p.readByUserId,
      limitMs,
      limitMs,
    ],
  );
}

export function applyDelivered(
  items: { messageId: string; deliveredAt: string }[],
): void {
  const db = getChatDb();
  db.transaction(() => {
    for (const { messageId, deliveredAt } of items) {
      db.run(
        `UPDATE messages SET delivered_at = ?, row_version = row_version + 1
         WHERE id = ? AND delivered_at IS NULL`,
        [deliveredAt, messageId],
      );
    }
  });
}

export function applyDeleted(p: {
  messageId: string;
  forEveryone: boolean;
  deletedAt: string;
}): void {
  const forEveryone = p.forEveryone ? 1 : 0;
  getChatDb().run(
    `UPDATE messages SET
       deleted_at = ?, deleted_for_everyone = ?,
       content   = CASE WHEN ? = 1 THEN '' ELSE content END,
       media_url = CASE WHEN ? = 1 THEN NULL ELSE media_url END,
       row_version = row_version + 1
     WHERE id = ? AND (deleted_at IS NOT ? OR deleted_for_everyone IS NOT ?)`,
    [p.deletedAt, forEveryone, forEveryone, forEveryone, p.messageId, p.deletedAt, forEveryone],
  );
}

/**
 * Delta akışından gelen SİLME kaydı (tombstone).
 *
 * `applyDeleted`'tan farkı: oradaki payload SignalR'ın `MessageDeleted`
 * event'i ve mesajı elimizde varsayıyor. Burada mesaj elimizde OLMAYABİLİR —
 * offline'dayken hem yaratılıp hem silinmiş olabilir. O durumda yapacak bir
 * şey yok (hiç sahip olmadığımız bir satırı silemeyiz) ve satır yaratmıyoruz:
 * tombstone içerik taşımıyor, yaratsak boş bir balon çizerdik.
 *
 * İçerik HER İKİ durumda da temizleniyor — `deletedForEveryone=false` bile
 * olsa. Sunucu da delta'da metni hiç göndermiyor; yerelde tutmaya devam etmek
 * o kararı boşa çıkarırdı.
 */
export function applyDeletionTombstone(p: {
  messageId: string;
  deletedAt: string;
  deletedForEveryone: boolean;
}): void {
  getChatDb().run(
    `UPDATE messages SET
       deleted_at = ?, deleted_for_everyone = ?,
       content = '', media_url = NULL, waveform_peaks = NULL,
       row_version = row_version + 1
     WHERE id = ? AND (deleted_at IS NOT ? OR deleted_for_everyone IS NOT ?)`,
    [
      p.deletedAt,
      p.deletedForEveryone ? 1 : 0,
      p.messageId,
      p.deletedAt,
      p.deletedForEveryone ? 1 : 0,
    ],
  );
}

/**
 * Sohbet tamamen kaldırıldı (engelleme / hesap silme). Mesajları da gider —
 * gizlilik aksiyonu, disk değil.
 */
export function removeConversationLocally(conversationId: string): void {
  const db = getChatDb();
  db.transaction(() => {
    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    db.run('DELETE FROM conversations WHERE conversation_id = ?', [conversationId]);
    db.run('DELETE FROM sync_state WHERE conversation_id = ?', [conversationId]);
    db.run('DELETE FROM outbox WHERE conversation_id = ?', [conversationId]);
  });
}

export function applyReactions(messageId: string, reactions: unknown[] | null): void {
  const json = reactions && reactions.length ? JSON.stringify(reactions) : null;
  getChatDb().run(
    `UPDATE messages SET reactions_json = ?, row_version = row_version + 1
     WHERE id = ? AND reactions_json IS NOT ?`,
    [json, messageId, json],
  );
}

export function setSendState(clientMessageId: string, sendState: SendState): void {
  getChatDb().run(
    `UPDATE messages SET send_state = ?, row_version = row_version + 1
     WHERE client_message_id = ? AND send_state IS NOT ?`,
    [sendState, clientMessageId, sendState],
  );
}

export function removeByClientMessageId(clientMessageId: string): void {
  getChatDb().run('DELETE FROM messages WHERE client_message_id = ?', [clientMessageId]);
}

/**
 * Sohbet kapandı. Asılı kalan `pending` balonları `failed`'a çeviriyoruz —
 * ack asla gelmeyecek (chatSlice.ts:504-507 ile aynı davranış).
 */
export function markConversationDeactivated(p: {
  conversationId: string;
  restorableUntil?: string | null;
  byMe?: boolean;
}): void {
  const db = getChatDb();
  db.transaction(() => {
    db.run(
      `UPDATE conversations SET
         is_active = 0,
         restorable_until = CASE WHEN ? = 1 THEN ? ELSE restorable_until END,
         restorable_until_known = CASE WHEN ? = 1 THEN 1 ELSE restorable_until_known END,
         deactivated_by_me = ?
       WHERE conversation_id = ?`,
      [
        p.restorableUntil !== undefined ? 1 : 0,
        p.restorableUntil ?? null,
        p.restorableUntil !== undefined ? 1 : 0,
        p.byMe === true ? 1 : 0,
        p.conversationId,
      ],
    );
    db.run(
      `UPDATE messages SET send_state = 'failed', row_version = row_version + 1
       WHERE conversation_id = ? AND send_state = 'pending'`,
      [p.conversationId],
    );
  });
}

export function markConversationRestored(conversationId: string): void {
  getChatDb().run(
    `UPDATE conversations SET is_active = 1, restorable_until = NULL,
       restorable_until_known = 1, deactivated_by_me = 0
     WHERE conversation_id = ?`,
    [conversationId],
  );
}

export function setHiddenHistory(conversationId: string, value: boolean): void {
  writeSyncState(getChatDb(), conversationId, { hasHiddenHistory: value });
}

/** sync_state'e doğrudan yazım — MMKV import'u ve testler için. */
export function initSyncState(
  conversationId: string,
  patch: {
    oldestLoadedSentAtMs?: number | null;
    nextCursor?: string | null;
    hasMore?: boolean;
    hasHiddenHistory?: boolean;
  },
): void {
  writeSyncState(getChatDb(), conversationId, patch);
}

/** Yeni eşleşme — sohbet listesine satır açar (chatSlice.matchNotification aynası). */
export function insertConversationFromMatch(p: {
  conversationId: string;
  matchId?: string;
  partnerUserId: string;
  partnerDisplayName: string;
  partnerProfileImageUrl?: string;
  matchedAt: string;
}): void {
  getChatDb().run(
    `INSERT INTO conversations (conversation_id, match_id, partner_user_id,
       partner_display_name, partner_profile_image_url, last_message_at,
       last_message_at_ms, unread_count, is_active, sort_order)
     VALUES (?,?,?,?,?,?,?,0,1,-1)
     ON CONFLICT(conversation_id) DO NOTHING`,
    [
      p.conversationId,
      p.matchId ?? null,
      p.partnerUserId,
      p.partnerDisplayName ?? null,
      p.partnerProfileImageUrl ?? null,
      p.matchedAt ?? null,
      p.matchedAt ? utcTime(p.matchedAt) : 0,
    ],
  );
}

/**
 * Yerel arşiv saklama penceresi — SUNUCUNUN `MessageRetentionJob`'ı ile AYNI.
 *
 * Arşiv "sınırsız" (WhatsApp davranışı) ama bu bir disk kararı; burası bir
 * GİZLİLİK kararı ve ayrı. Sunucu 2 yılda hard delete yapıyor ve arkasında
 * HİÇ İZ BIRAKMIYOR (tombstone yok, delta akışı da bunu çözmüyor). Yerelde
 * aynı pencereyi uygulamazsak cihaz, sunucunun hukuken imha ettiği mesajları
 * süresiz tutmaya devam ederdi.
 *
 * Sunucudan bir sinyal BEKLENMİYOR: politika iki tarafta da aynı yerden
 * (yaş) türediği için ayrışmıyor. Backend bu değeri yapılandırılabilir
 * yaparsa buradaki sabit bir uçtan okunacak.
 */
/**
 * Sunucu `retentionWindowDays`'i bildirene kadarki varsayılan.
 *
 * Kanonik değer SUNUCUDAN geliyor (`/changes` yanıtı, boş yanıtta bile) ve
 * `meta`'ya yazılıyor — iki yerde ayrı sabit tutmak ayrışmayı beklemek olurdu.
 * Burası yalnızca "henüz hiç konuşmadık" hâli için.
 */
export const MESSAGE_RETENTION_DAYS = 730;
const RETENTION_DAYS_KEY = 'retention_window_days';

export function setRetentionWindowDays(days: number | null | undefined): void {
  if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return;
  const db = getChatDb();
  db.run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [RETENTION_DAYS_KEY, String(Math.floor(days))],
  );
}

export function getRetentionWindowDays(): number {
  const raw = getChatDb().getFirst<{ value: string | null }>(
    'SELECT value FROM meta WHERE key = ?',
    [RETENTION_DAYS_KEY],
  )?.value;
  const parsed = raw == null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MESSAGE_RETENTION_DAYS;
}

/**
 * Nominal pencerenin ÜSTÜNE eklenen pay.
 *
 * Sunucunun silmesi 2 yıl çizgisinin ARKASINDAN geliyor: job haftada bir
 * çalışıyor (Pazartesi 02:00 UTC) ve run başına 1M mesajla sınırlı. Yani bir
 * mesaj 730 günü doldurduktan sonra sunucuda en az bir hafta daha yaşıyor.
 *
 * Tam 730'da budarsak sunucunun HÂLÂ servis ettiği satırları yerelde sileriz;
 * derin scroll-back ya da tam-senkron onları geri getirir, bir sonraki budama
 * yine siler → salınım. Payı uzun tutmak güvenli yön: sunucunun kendi
 * gecikmesini aynalamış oluyoruz, kısa tutmak salınım üretiyor.
 *
 * Sunucu sınırı `AddYears(-2)`, bildirilen değer 730 — artık yıl yüzünden
 * ±1 gün sapabiliyor. 30 gün bunu fazlasıyla soğuruyor. KISALTMA: sapma
 * salınım üretecek yönde.
 */
const RETENTION_SLACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Saklama penceresinin dışına düşen mesajları siler.
 *
 * @returns silinen satır sayısı
 *
 * Predikat sunucununkini BİREBİR aynalıyor:
 *   `SentAt < cutoff && !IsSystemMessage`
 *
 * System mesajları (MatchCreated, Rematched, ConversationDeleted) sunucuda
 * retention'dan MUAF ve süresiz duruyor — silinirlerse sohbet "boş başlangıç"
 * gibi görünüyor. Düz bir yaş penceresi uygulasaydık sunucunun hâlâ servis
 * ettiği satırları yerelde silerdik ve onlar her tam-senkronda geri gelip
 * her budamada tekrar silinirdi (salınım).
 *
 * Bekleyen/başarısız gönderimlere DOKUNMAZ: 2 yıllık bir outbox satırı
 * absürt ama silme yolu asla kullanıcının yazdığı bir şeyi yok etmemeli.
 *
 * Budama eski uçtan yaptığı için "cap'lendi" durumunu yeniden yaratıyor —
 * elimizdeki derin cursor artık yerel aralığın ALTINI işaret ediyor, yani
 * delik üretir. Cursor null'lanıyor; yukarı kaydırma yerel dibe varınca
 * `setHistoryExhausted` ile kendini kapatıyor, sunucuda gerçekten daha eskisi
 * varsa sayfa-1 reconcile'ı onarım dalıyla taze cursor yazıyor.
 */
export function pruneExpiredMessages(nowMs: number = Date.now()): number {
  const db = getChatDb();
  const cutoff = nowMs - (getRetentionWindowDays() + RETENTION_SLACK_DAYS) * DAY_MS;
  let deleted = 0;

  db.transaction(() => {
    const affected = db.getAll<{ conversation_id: string }>(
      `SELECT DISTINCT conversation_id FROM messages
       WHERE sent_at_ms < ? AND send_state = 'sent' AND is_system_message = 0`,
      [cutoff],
    );
    if (!affected.length) return;

    const before = db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM messages')?.n ?? 0;
    db.run(
      `DELETE FROM messages
       WHERE sent_at_ms < ? AND send_state = 'sent' AND is_system_message = 0`,
      [cutoff],
    );
    const after = db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM messages')?.n ?? 0;
    deleted = before - after;

    for (const { conversation_id } of affected) {
      // `MIN(sent_at_ms)` DEĞİL: muaf tutulan system mesajları cutoff'un çok
      // altında hayatta kalıyor ve onu taban kabul etmek, aralarındaki normal
      // mesajların silindiği DELİKLİ bir aralık üzerinde "bitişik" iddia etmek
      // olurdu. Kesintisiz bölge cutoff'tan başlıyor; taban, oradaki en eski
      // satır. (Hayatta kalan eski system mesajları listede duruyor — sunucu da
      // aynısını servis ediyor — ama bitişiklik garantisinin DIŞINDALAR.)
      const oldest = db.getFirst<{ v: number | null }>(
        'SELECT MIN(sent_at_ms) AS v FROM messages WHERE conversation_id = ? AND sent_at_ms >= ?',
        [conversation_id, cutoff],
      );
      db.run(
        `UPDATE sync_state SET oldest_loaded_sent_at_ms = ?, next_cursor = NULL
         WHERE conversation_id = ?`,
        [oldest?.v ?? null, conversation_id],
      );
    }
  });

  return deleted;
}

// ── Delta-sync watermark'ı ──────────────────────────────────────────────────
//
// Sunucunun ürettiği opak token. İSTEMCİ ASLA YORUMLAMAZ — aynen saklanıp
// aynen geri gönderilir. (Sunucuda `MIN_ACTIVE_ROWVERSION() - 1` encode'u;
// bunu bilmek bile gerekmiyor ve bilmemek doğrusu: sunucu şemayı istemci
// sürümü çıkmadan değiştirebilsin diye opak.)

const WATERMARK_KEY = 'sync_watermark';

export function getSyncWatermark(): string | null {
  return (
    getChatDb().getFirst<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', [
      WATERMARK_KEY,
    ])?.value ?? null
  );
}

export function setSyncWatermark(watermark: string | null): void {
  const db = getChatDb();
  if (watermark == null) {
    db.run('DELETE FROM meta WHERE key = ?', [WATERMARK_KEY]);
    return;
  }
  db.run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [WATERMARK_KEY, watermark],
  );
}

/** Logout dışı toplu temizlik (ör. kill-switch kapanışı). Dosyayı SİLMEZ. */
export function clearAllChatData(): void {
  const db = getChatDb();
  db.transaction(() => {
    db.run('DELETE FROM messages');
    db.run('DELETE FROM conversations');
    db.run('DELETE FROM sync_state');
    db.run('DELETE FROM outbox');
    // Watermark arşivle AYNI anda gitmek zorunda: kalsaydı yeni kullanıcı
    // "her şeyi görmüşüm" sanıp aradaki değişiklikleri hiç çekmezdi.
    db.run('DELETE FROM meta');
  });
}

// ── Conversations: "local wins" UPSERT ──────────────────────────────────────

/**
 * chatSlice.ts:609-654'teki dört kuralı KURAL KURAL taşır. Parafraz etme —
 * her biri ayrı bir bug'ın yara izi:
 *  1. lastMessage*: yerel KESİN daha yeniyse yerel kazanır
 *  2. unreadCount: yerel 0'ı körlemesine ezme (markRead ile /conversations
 *     yarışı okunmuş sohbeti tekrar okunmamış gösteriyordu)
 *  3. restorableUntil: "alan gelmedi" ≠ "null geldi" (unmatch sonrası force
 *     refetch "geri al" butonunu ilk saniyede siliyordu)
 *  4. deactivatedByMe: SUNUCUDA YOK — taşımadığı için her fetch'te silerdi
 *
 * partner_is_online KOLON DEĞİL: presence realtime, restart'a taşınırsa herkes
 * sahte "online" görünür.
 */
export function upsertConversations(
  list: ConversationListItemDto[],
  opts: { activeConversationId?: string | null } = {},
): void {
  const db = getChatDb();
  const active = opts.activeConversationId ?? null;

  db.transaction(() => {
    list.forEach((c, index) => {
      const serverMs = c.lastMessageAt ? utcTime(c.lastMessageAt) : 0;
      // "Alan hiç gelmedi mi" ayrımı tek nullable kolonla temsil edilemez.
      const restorableKnown = Object.prototype.hasOwnProperty.call(c, 'restorableUntil') ? 1 : 0;

      db.run(
        `INSERT INTO conversations (
           conversation_id, match_id, partner_user_id, partner_display_name,
           partner_profile_image_url, last_message_preview, last_message_at,
           last_message_at_ms, last_message_content_type, unread_count, is_active,
           is_unlimited, remaining_messages, requires_premium, restorable_until,
           restorable_until_known, deactivated_by_me, sort_order,
           closed_by_me, closed_reason)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           match_id                  = excluded.match_id,
           partner_user_id           = excluded.partner_user_id,
           partner_display_name      = excluded.partner_display_name,
           partner_profile_image_url = excluded.partner_profile_image_url,
           sort_order                = excluded.sort_order,
           is_active                 = excluded.is_active,
           is_unlimited              = excluded.is_unlimited,
           remaining_messages        = excluded.remaining_messages,
           requires_premium          = excluded.requires_premium,

           -- (1) yerel kesin daha yeniyse yereli koru
           last_message_preview = CASE WHEN conversations.last_message_at_ms > excluded.last_message_at_ms
                                       THEN conversations.last_message_preview
                                       ELSE excluded.last_message_preview END,
           last_message_at = CASE WHEN conversations.last_message_at_ms > excluded.last_message_at_ms
                                  THEN conversations.last_message_at
                                  ELSE excluded.last_message_at END,
           last_message_content_type = CASE WHEN conversations.last_message_at_ms > excluded.last_message_at_ms
                                            THEN conversations.last_message_content_type
                                            ELSE excluded.last_message_content_type END,
           last_message_at_ms = CASE WHEN conversations.last_message_at_ms > excluded.last_message_at_ms
                                     THEN conversations.last_message_at_ms
                                     ELSE excluded.last_message_at_ms END,

           -- (2) okundu bilgisinde yerel kazanabilir
           unread_count = CASE
             WHEN excluded.unread_count > 0
              AND (? = conversations.conversation_id
                   OR (conversations.unread_count = 0
                       AND excluded.last_message_at_ms <= conversations.last_message_at_ms))
             THEN 0 ELSE excluded.unread_count END,

           -- (3) alan gelmediyse (known=0) yereli koru; server AÇIKÇA null derse kazanır
           restorable_until = CASE
             WHEN excluded.restorable_until_known = 0 AND conversations.restorable_until IS NOT NULL
             THEN conversations.restorable_until ELSE excluded.restorable_until END,
           restorable_until_known = CASE
             WHEN excluded.restorable_until_known = 0 THEN conversations.restorable_until_known
             ELSE 1 END,

           -- (4) ESKİ istemci tahmini; sohbet hâlâ kapalıyken koru, aktifse
           -- anlamını yitirir. Sunucu closed_by_me göndermeyen sürümlerde
           -- hâlâ tek kaynak (bkz. resolveClosedByMe).
           deactivated_by_me = CASE WHEN excluded.is_active = 0
                                    THEN conversations.deactivated_by_me ELSE NULL END,

           -- (5) SUNUCUNUN cevabı — "local wins" kuralına TABİ DEĞİL, çünkü
           -- tahmin değil bilgi. Ama sunucu SUSUYORSA (alan yok, NULL geliyor)
           -- elimizdekini de silmiyoruz: COALESCE ile eski değer korunuyor.
           closed_by_me  = CASE WHEN excluded.is_active = 0
                                THEN COALESCE(excluded.closed_by_me, conversations.closed_by_me)
                                ELSE NULL END,
           closed_reason = CASE WHEN excluded.is_active = 0
                                THEN COALESCE(excluded.closed_reason, conversations.closed_reason)
                                ELSE NULL END`,
        [
          c.conversationId,
          c.matchId ?? null,
          c.partnerUserId,
          c.partnerDisplayName ?? null,
          c.partnerProfileImageUrl ?? null,
          c.lastMessagePreview ?? null,
          c.lastMessageAt ?? null,
          serverMs,
          c.lastMessageContentType ?? null,
          c.unreadCount ?? 0,
          c.isActive ? 1 : 0,
          c.isUnlimited === undefined ? null : c.isUnlimited ? 1 : 0,
          c.remainingMessages ?? null,
          c.requiresPremium === undefined ? null : c.requiresPremium ? 1 : 0,
          c.restorableUntil ?? null,
          restorableKnown,
          c.deactivatedByMe === undefined ? null : c.deactivatedByMe ? 1 : 0,
          index,
          c.closedByMe === undefined ? null : c.closedByMe ? 1 : 0,
          c.closedReason ?? null,
          active,
        ],
      );
    });
  });
}
