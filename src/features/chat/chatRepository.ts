import { getChatDb, type ChatDbDriver, type SqlValue } from '@/features/chat/db/chatDb';
import {
  rowToConversation,
  type ConversationRow,
  type MessageRow,
  type MutationKind,
  type PendingMutationRow,
  type SendAttemptRow,
  type SendState,
  type SyncStateRow,
} from '@/features/chat/db/rows';
import { ContentType, contentTypeToNumber } from '@/features/chat/contentType';
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
 * `client_message_id` ve `local_uri` COALESCE'li — ama gerekçeleri AYRI:
 *  • `local_uri` YALNIZ istemcide var (gönderdiğimiz sesin yerel dosyası),
 *    hiçbir sunucu kopyası taşımıyor. COALESCE olmadan her reconcile silerdi.
 *  • `client_message_id`'yi sunucu geri yansıtıyor (2026-10-06'da doğrulandı:
 *    send yanıtı, hub ack'i, history ve /changes — hepsinde dolu geliyor). Yine
 *    de COALESCE'li, çünkü alan iki durumda boş gelebiliyor: cmid'siz
 *    gönderilmiş eski mesajlar ve KARŞI TARAFIN mesajları (onların cmid'si
 *    bizim için anlamsız). Düşerse keyExtractor'ın anahtarı değişir.
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
 *
 * `pending_mutations` da AYNI satırda REKEY edilir: bir reaksiyon/silme emri
 * mesaj hâlâ `pending`ken (optimistik `temp-<cmid>` id'siyle) kuyruğa
 * girebiliyor (`MessageActionSheet`'in reaksiyon/silme aksiyonlarında gönderim
 * durumu gate'i YOK — bkz. pendingMutations.ts'in `send_state !== 'sent'`
 * atlama adımı, tam bunun için var). `pending_mutations`'ın FK/cascade'i yok;
 * rekey edilmezse emir eski id'ye bağlı kalır ve ack'ten sonraki ilk turda
 * `pruneOrphanPendingMutations` onu YETİM sayıp sessizce SİLER — kullanıcının
 * verdiği emir hiç ağa çıkmadan kaybolur. `messageCache`'in `rekey`'iyle AYNI
 * satırda olması bilinçli: ikisi de bu id değişiminin aynı anki sonucu, iki
 * ayrı mekanizma icat etmek yerine mevcut tek noktaya eklendi.
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
      db.run('UPDATE pending_mutations SET message_id = ? WHERE message_id = ?', [
        raw.id,
        existing.id,
      ]);
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

/**
 * Sohbet listesinin TAMAMI, diskten — soğuk açılışın tek kaynağı.
 *
 * ── Sıra neden `sort_order` DEĞİL ───────────────────────────────────────────
 * `sort_order`, /conversations yanıtının o anki index'i; sunucu yanıtından
 * sonra gelen her mesaj onu bayatlatıyor (yerel mesaj satırın damgasını
 * güncelliyor ama index'e dokunmuyor). Damgaya göre sıralamak hem sunucunun
 * kuralıyla aynı hem de yerel yazımlarla tutarlı. Index yalnız TIEBREAKER:
 * yeni eşleşme satırları `sort_order = -1` ile açılıyor (bkz.
 * insertConversationFromMatch) ve hiç mesajlaşılmamış sohbetlerin kendi
 * aralarındaki sırası ancak oradan biliniyor.
 */
export function readConversations(): ConversationListItemDto[] {
  return getChatDb()
    .getAll<ConversationRow>(
      `SELECT * FROM conversations
        ORDER BY COALESCE(last_message_at_ms, 0) DESC, sort_order ASC, conversation_id ASC`,
    )
    .map(rowToConversation);
}

/**
 * Yalnız BELİRLİ sohbetlerin satırları — delta-sync'in dokunduklarını ekrana
 * taşımak için (bkz. chatHydrate.applyDeltaFromLocal). Sıra `readConversations`
 * ile aynı: çağıran bu satırları mevcut listeye upsert edip yeniden sıralıyor.
 */
export function readConversationsByIds(
  conversationIds: string[],
): ConversationListItemDto[] {
  if (!conversationIds.length) return [];
  const holes = conversationIds.map(() => '?').join(',');
  return getChatDb()
    .getAll<ConversationRow>(
      `SELECT * FROM conversations WHERE conversation_id IN (${holes})
        ORDER BY COALESCE(last_message_at_ms, 0) DESC, sort_order ASC, conversation_id ASC`,
      conversationIds,
    )
    .map(rowToConversation);
}

/**
 * AÇILIŞ UZLAŞTIRMASI: `pending` kalmış gönderimleri `failed`'a çevirir.
 *
 * Okuma yolu SQLite'a döndüğünden beri (bkz. chatFlags) gönderim sırasında
 * ölen uygulamanın `send_state='pending'` satırı diskten GERİ GELİYOR ve
 * `_pending: true` ile balona dönüyor (rows.ts). Ama o satırı sürecek kuyruk
 * BELLEKTE: outbox'ın attempts/ackTimers map'leri process ile ölüyor
 * (features/chat/outbox.ts). Yani balon sonsuza kadar "gönderiliyor" halinde
 * kalıyor ve `_failed` olmadığı için "tekrar dene" bile çıkmıyor.
 *
 * `failed`'a çevirmek bilgiyi KAYBETMİYOR, sahipliği kullanıcıya veriyor:
 * balonda yeniden deneme çıkar. Otomatik yeniden göndermek burada YAPILMAZ —
 * kullanıcı asılı bir "gönderiliyor" spinner'ı görmesin, balonda "tekrar dene"
 * butonu çıksın (sessiz otomatik tekrar outbox.flushOutbox'ın işi, burası
 * yalnız açılış uzlaştırması). `clientMessageId` idempotency'si artık ENDİŞE
 * DEĞİL: `(SenderId, ClientMessageId)` üzerinde filtreli UNIQUE index var,
 * backend 2026-10-06'da sözleşmeyi dondurdu ve 2026-10-27'de yeniden teyit
 * edildi — garanti zaman penceresine değil index'e dayanıyor, satırın ömrü
 * mesajın retention'ı (730 gün). Kanonik yorum: outboxPolicy.isEligible içindeki
 * "KAPISI KALDIRILDI (2026-10-06)" notu.
 *
 * @returns failed'a çevrilen satır sayısı (teşhis için).
 */
export function failStalePendingSends(): number {
  const db = getChatDb();
  const stale = db.getFirst<{ n: number }>(
    // `send_state <> 'sent'` terimi MANTIKSAL FAZLALIK ama kısmi indeksi
    // (idx_messages_unsent) açan anahtar — gerekçe: migrations.ts V5.
    "SELECT COUNT(*) AS n FROM messages WHERE send_state = 'pending' AND send_state <> 'sent'",
  );
  const count = stale?.n ?? 0;
  if (count > 0) {
    db.run(
      `UPDATE messages SET send_state = 'failed', row_version = row_version + 1
        WHERE send_state = 'pending' AND send_state <> 'sent'`,
    );
  }
  return count;
}

/**
 * GÖNDERİLEMEMİŞ mesajlar — TÜM arşivden, en eskiden yeniye.
 *
 * Outbox'ın sessiz turu bu listeyi şimdiye kadar Redux bucket'larından
 * çıkarıyordu (`outboxPolicy.selectFailedOutbox`). Bucket ise yalnız AÇILMIŞ
 * sohbetler için var: uygulama yeniden başladıktan sonra, kullanıcı o sohbete
 * girmedikçe oradaki başarısız mesaj hiçbir tura görünmüyordu. Arşiv kalıcı
 * olduğundan doğru kaynak disk.
 *
 * @param sinceMs  bundan ESKİ mesajlar dönmez. Sessiz tur bu parametreyi artık
 *                 HİÇ VERMİYOR (yaş sınırı 2026-10-29'da kalktı, bkz.
 *                 outboxPolicy.LATE_SEND_NOTICE_MS yorumu) — alan genel amaçlı
 *                 bir filtre olarak duruyor, varsayılanı (0) sınırsız demek.
 * @param limit    tur başına tavan; patolojik bir arşiv tek turda yüz istek
 *                 üretmesin.
 */
export function readFailedSends({
  sinceMs = 0,
  limit = 50,
}: { sinceMs?: number; limit?: number } = {}): MessageRow[] {
  return getChatDb().getAll<MessageRow>(
    // `send_state <> 'sent'`: bkz. failStalePendingSends — kısmi indeks kapısı.
    `SELECT * FROM messages
      WHERE send_state = 'failed' AND send_state <> 'sent' AND sent_at_ms >= ?
      ORDER BY sent_at_ms ASC, id ASC LIMIT ?`,
    [sinceMs, limit],
  );
}

/** `readLastVoiceDurations` girdisi — sohbet listesi satırının özeti. */
export interface LastVoiceQuery {
  conversationId: string;
  /**
   * Liste satırının son mesaj damgası (ms). 0 / verilmemiş → bilinmiyor; o
   * durumda sohbetin en yeni satırına bakılır.
   */
  lastMessageAtMs?: number;
}

/**
 * Sohbet listesi satırındaki "🎤 Sesli mesaj (0:07)" için SON MESAJIN SÜRESİ.
 *
 * Süre sohbet listesi DTO'sunda YOK (ConversationListItemDto yalnız
 * preview/at/contentType taşıyor) ama arşivde VAR: her mesaj yazımı
 * (realtime, delta-sync, history sayfası) `duration_ms` kolonuna düşüyor —
 * sohbet hiç açılmamış olsa bile. Yani bu okuma, listeyi süre için ağa
 * çıkmaktan kurtaran local-first yol.
 *
 * ── Damga eşleşmesi ŞART ────────────────────────────────────────────────────
 * "Arşivdeki en yeni satır" ile "sohbetin son mesajı" aynı şey olmak zorunda
 * değil: metin bir mesaj gelmiş ama henüz diske inmemişse (delta-sync turu
 * gelmedi) arşivin tepesi hâlâ eski sesli mesajdır — onun süresini yazmak
 * satırda metin önizlemesinin YERİNE sesli mesaj göstermek olurdu. Bu yüzden
 * damga ±1sn toleransla eşleşmek zorunda (tolerans optimistic balonun yerel
 * damgası için; MessagesScreen'in Redux yolundaki kuralın aynısı).
 *
 * Süresi olmayan ya da sesli olmayan sohbet SONUÇTA HİÇ GÖRÜNMEZ ("bilmiyoruz"
 * ile "sıfır" karışmasın): çağıran eksikleri kendi yoluyla tazeler.
 */
export function readLastVoiceDurations(queries: LastVoiceQuery[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!queries.length) return out;
  const db = getChatDb();

  for (const { conversationId, lastMessageAtMs } of queries) {
    if (!conversationId) continue;
    const stamp = Number(lastMessageAtMs);
    const stamped = Number.isFinite(stamp) && stamp > 0;
    // İki sorgu da (conversation_id, sent_at_ms DESC, id) indeksini kullanıyor;
    // damgalı dal aralık taraması, damgasız dal tek adımlık seek.
    const row = stamped
      ? db.getFirst<Pick<MessageRow, 'content_type' | 'duration_ms'>>(
          `SELECT content_type, duration_ms FROM messages
            WHERE conversation_id = ? AND deleted_at IS NULL
              AND sent_at_ms >= ? AND sent_at_ms <= ?
            ORDER BY sent_at_ms DESC, id DESC LIMIT 1`,
          [conversationId, stamp - 1000, stamp + 1000],
        )
      : db.getFirst<Pick<MessageRow, 'content_type' | 'duration_ms'>>(
          `SELECT content_type, duration_ms FROM messages
            WHERE conversation_id = ? AND deleted_at IS NULL
            ORDER BY sent_at_ms DESC, id DESC LIMIT 1`,
          [conversationId],
        );
    if (!row || row.content_type !== ContentType.Voice) continue;
    const ms = Number(row.duration_ms);
    if (Number.isFinite(ms) && ms > 0) out[conversationId] = ms;
  }

  return out;
}

/**
 * TEŞHİS (yalnız `__DEV__`): bir sohbetin arşivdeki en yeni satırlarının ham
 * hâli. `readLastVoiceDurations` "bilmiyorum" dediğinde sebebi ayırmak için —
 * dört farklı sebep aynı sonucu veriyor ve ikisi istemci, ikisi sunucu tarafı:
 *   • satır HİÇ YOK            → arşiv o mesajı henüz almamış (delta zamanlaması)
 *   • damga çok uzak           → tarih normalizasyonu (bkz. dateUtc)
 *   • content_type ≠ 2         → yazım kapısı tipi çözememiş
 *   • duration_ms NULL         → payload süreyi taşımıyor
 * Ürün yolunda ÇAĞRILMAZ.
 */
export function debugLastMessageRows(
  conversationId: string,
  limit = 3,
): Pick<MessageRow, 'id' | 'sent_at' | 'sent_at_ms' | 'content_type' | 'duration_ms' | 'deleted_at'>[] {
  return getChatDb().getAll(
    `SELECT id, sent_at, sent_at_ms, content_type, duration_ms, deleted_at
       FROM messages WHERE conversation_id = ?
       ORDER BY sent_at_ms DESC, id DESC LIMIT ?`,
    [conversationId, limit],
  );
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
      const floorMs = existing?.oldest_loaded_sent_at_ms ?? null;
      const nextOldest =
        pageOldestMs === null
          ? floorMs
          : Math.min(floorMs ?? Number.POSITIVE_INFINITY, pageOldestMs);

      // `next_cursor`/`has_more` EKRANIN sayfalama durumu ve bu dalı ekran ile
      // backfill PAYLAŞIYOR. Sayfanın cursor'ı ancak sayfa yerel tabanı
      // gerçekten aşağı taşıyorsa o durumun doğru DEVAMI olur: backfill'in
      // `backfill_cursor`'ı NULL'dan başladığı için her sohbetteki ilk isteği
      // sayfa-1'i (en YENİ sayfayı) getiriyor ve onun cursor'ını yazmak ekranın
      // ulaştığı derinliği GERİ ALIYORDU — `has_more = 0` olan (sonuna kadar
      // okunmuş) bir sohbet bile yeniden "devam ediyor"a dönüyordu. Ekranın
      // kendi derin sayfaları HER ZAMAN tabanı aşağı taşır, yani onlar için bu
      // kapı no-op (bkz. chatRepository.contiguity.test.ts).
      const extendsFloor = pageOldestMs !== null && (floorMs === null || pageOldestMs < floorMs);
      // Tek istisna: sayfa "arşiv bitti" diyorsa (cursor YOK + hasMore false)
      // yazmak hiçbir sayfayı yeniden indirtemez, yalnız sayfalamayı kapatır —
      // ekranın son `loadOlder` isteği tam sınıra denk geldiğinde dönen BOŞ
      // sayfa bu; elenirse o sohbet her soğuk açılışta bayat cursor'la bir
      // istek daha harcardı.
      const reportsEnd = page.hasMore === false && page.nextCursor === null;
      writeSyncState(db, conversationId, {
        oldestLoadedSentAtMs: nextOldest,
        ...(extendsFloor || reportsEnd
          ? { nextCursor: page.nextCursor, hasMore: page.hasMore }
          : {}),
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
    // send_attempts'in conversation_id kolonu YOK (v7 — muhasebe cmid'e bağlı,
    // sohbete değil); bu yüzden messages SİLİNMEDEN ÖNCE, hâlâ mevcutken,
    // cmid'leri üzerinden JOIN edip bu sohbete ait olanları buluyoruz.
    db.run(
      `DELETE FROM send_attempts WHERE client_message_id IN (
         SELECT client_message_id FROM messages
          WHERE conversation_id = ? AND client_message_id IS NOT NULL
       )`,
      [conversationId],
    );
    db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    db.run('DELETE FROM conversations WHERE conversation_id = ?', [conversationId]);
    db.run('DELETE FROM sync_state WHERE conversation_id = ?', [conversationId]);
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

/**
 * Sesli mesajın tamamlanmış yükleme anahtarı — gönderim 3. adımda patlasa bile
 * KALICI olmalı ki tekrar deneme dosyayı ikinci kez yüklemesin (her upload-url
 * yeni bir S3 nesnesi üretiyor). `send` başarılı olduğunda sunucu kopyası aynı
 * değeri getiriyor, yani bu yazım yalnız ARADAKİ pencere için.
 *
 * Satır henüz optimistic (`temp-<cmid>`) olduğu için anahtar id değil cmid.
 */
export function setVoiceMediaUrl(clientMessageId: string, mediaUrl: string): void {
  getChatDb().run(
    `UPDATE messages SET media_url = ?, row_version = row_version + 1
      WHERE client_message_id = ? AND media_url IS NOT ?`,
    [mediaUrl, clientMessageId, mediaUrl],
  );
}

/**
 * Ölü yükleme anahtarını düşürür (UT-6605) — bir sonraki deneme dosyayı
 * yeniden yükleyecek. Yalnız HENÜZ GÖNDERİLMEMİŞ satırlarda: gönderilmiş bir
 * mesajın `media_url`'i sunucunun kanonik değeri, silinmemeli.
 */
export function clearVoiceMediaUrl(clientMessageId: string): void {
  getChatDb().run(
    `UPDATE messages SET media_url = NULL, row_version = row_version + 1
      WHERE client_message_id = ? AND send_state <> 'sent' AND media_url IS NOT NULL`,
    [clientMessageId],
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
  /**
   * Eşleşmenin modu — `MatchNotification.mode` (payload'da yoksa `undefined`
   * bırakılır, "Dating" VARSAYILMAZ). Satır buradan doğduğu için mod ancak
   * burada yazılabiliyor: `/conversations` cevabı gelene kadar yeni sohbet
   * aksi hâlde modsuz durur ve iki sekmede birden görünürdü.
   */
  mode?: string | null;
}): void {
  getChatDb().run(
    `INSERT INTO conversations (conversation_id, match_id, partner_user_id,
       partner_display_name, partner_profile_image_url, last_message_at,
       last_message_at_ms, unread_count, is_active, sort_order, mode)
     VALUES (?,?,?,?,?,?,?,0,1,-1,?)
     ON CONFLICT(conversation_id) DO NOTHING`,
    [
      p.conversationId,
      p.matchId ?? null,
      p.partnerUserId,
      p.partnerDisplayName ?? null,
      p.partnerProfileImageUrl ?? null,
      p.matchedAt ?? null,
      p.matchedAt ? utcTime(p.matchedAt) : 0,
      p.mode ?? null,
    ],
  );
}

// ── Sohbet listesi satırının YEREL tazeliği ─────────────────────────────────
//
// Bu üç fonksiyon olmadan `conversations` satırına yalnız AĞ yazıyordu
// (`upsertConversations`: /conversations yanıtı ve delta turu). Mesaj satırı
// realtime'da diske iniyordu ama liste satırı inmiyordu, yani:
//   mesaj gel/gönder → uygulamayı kapat → offline aç
// listede ESKİ önizleme, ESKİ sıra ve okuduğun sohbette GERİ GELEN rozet.
// Redux tarafı aynı anda doğruyu gösteriyordu (chatSlice
// .updateConversationLastMessage / markConversationReadLocally), yani hata
// yalnız soğuk açılışta görünüyordu — ağ cevabı gelene kadar.
//
// `upsertConversations`'ın "local wins" kuralları (1) ve (2) tam bu yazımları
// korumak için var: oradaki "yerel kesin daha yeni" ve "yerel 0'ı ezme"
// dalları, korunacak yerel değer diske hiç yazılmadığı için boşa çalışıyordu.

/**
 * Son mesaj özeti — mesaj satırını diske yazan realtime yolların EŞLİKÇİSİ.
 *
 * Damga GERİYE GİTMEZ (`<=` koşulu): Redux tarafı koşulsuz üzerine yazıyor
 * ama orada tek kaynak ekran ve her odakta /conversations tazeliyor. Disk ise
 * soğuk açılışın TEK kaynağı: sırası bozulan bir satır kullanıcıya yanlış
 * sıralı liste olarak görünür. Sıra dışı gelen (ya da delta turunda yeniden
 * oynatılan) eski bir mesaj bu yüzden satıra dokunmuyor.
 *
 * Eşitlik DAHİL: optimistic balon ile sunucunun echo'su aynı damgayı
 * taşıyabiliyor ve echo'nun içeriği (sunucunun normalize ettiği hâli) kazanmalı.
 *
 * Satır yoksa hiçbir şey olmuyor — Redux'ta da `if (!conv) return` var. Sohbet
 * satırını yaratmak bu yolun işi değil (bkz. insertConversationFromMatch).
 */
export function touchConversationFromMessage(p: {
  conversationId: string;
  content?: string | null;
  sentAt?: string | null;
  contentType?: MessageDto['contentType'];
}): void {
  if (!p.conversationId || !p.sentAt) return;
  const ms = utcTime(p.sentAt);
  if (!Number.isFinite(ms)) return;
  getChatDb().run(
    `UPDATE conversations SET
       last_message_preview      = ?,
       last_message_at           = ?,
       last_message_at_ms        = ?,
       last_message_content_type = ?
     WHERE conversation_id = ? AND COALESCE(last_message_at_ms, 0) <= ?`,
    [
      p.content ?? '',
      p.sentAt,
      ms,
      contentTypeToNumber(p.contentType),
      p.conversationId,
      ms,
    ],
  );
}

/**
 * Bu mesaj arşivde VAR MI — rozetin MÜKERRER artmasına karşı kapı.
 *
 * `bumpConversationUnread` tanımı gereği idempotent değil, hub ise aynı
 * `ReceiveMessage`'ı iki kez yayınlayabiliyor (reconnect yarışı). Redux tarafı
 * bunu bucket'taki id kontrolüyle eliyor (chatSlice.ts:505) — diskte karşılığı
 * bu tek PK okuması. Yazımdan ÖNCE çağrılmak zorunda; sonra çağırırsan satır
 * zaten yazılmış olur ve her mesaj "mükerrer" görünür.
 */
export function messageExists(id: string): boolean {
  if (!id) return false;
  return !!getChatDb().getFirst<{ n: number }>(
    'SELECT 1 AS n FROM messages WHERE id = ?',
    [id],
  );
}

/** Karşı tarafın mesajı geldi ve sohbet AÇIK DEĞİL — rozet ilerler. */
export function bumpConversationUnread(conversationId: string): void {
  if (!conversationId) return;
  getChatDb().run(
    'UPDATE conversations SET unread_count = unread_count + 1 WHERE conversation_id = ?',
    [conversationId],
  );
}

/**
 * Sohbet okundu sayıldı (girildi, kendi mesajımızı gönderdik ya da kendi
 * `MessagesRead` event'imiz geldi).
 *
 * `unread_count <> 0` koruması diğer nokta mutasyonlardaki no-op kuralının
 * aynısı: zaten sıfırsa satıra dokunma.
 */
export function clearConversationUnread(conversationId: string): void {
  if (!conversationId) return;
  getChatDb().run(
    'UPDATE conversations SET unread_count = 0 WHERE conversation_id = ? AND unread_count <> 0',
    [conversationId],
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
    db.run('DELETE FROM send_attempts');
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
           closed_by_me, closed_reason, mode)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
                                ELSE NULL END,

           -- (6) MOD: sunucu söylüyorsa onun, SUSUYORSA eldeki korunuyor.
           -- Körlemesine yazmak, alanı taşımayan bir yazıcıdan (eski sürüm ya
           -- da ileride eklenecek bir yol) gelen tek satırın modu silmesine ve
           -- sohbetin iki modda birden görünmesine yol açardı.
           mode = COALESCE(excluded.mode, conversations.mode)`,
        [
          c.conversationId,
          c.matchId ?? null,
          c.partnerUserId,
          c.partnerDisplayName ?? null,
          c.partnerProfileImageUrl ?? null,
          c.lastMessagePreview ?? null,
          c.lastMessageAt ?? null,
          serverMs,
          // SAYIYA indiriliyor: wire enum'ları PascalCase string gelebiliyor
          // ("Voice") ve bu kolonu okuyan taraf sayı karşılaştırıyor. Realtime
          // yazıcısı (touchConversationFromMessage) da aynı dönüşümü yapıyor —
          // iki yazıcı aynı kolona iki FORMAT yazarsa okuyan taraf satırın
          // kaynağına göre farklı davranır.
          c.lastMessageContentType == null
            ? null
            : contentTypeToNumber(c.lastMessageContentType),
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
          c.mode ?? null,
          active,
        ],
      );
    });
  });
}

// ── send_attempts: gönderim kuyruğunun disk muhasebesi (v7) ────────────────
//
// Mesaj GÖVDESİ burada taşınmıyor — tek kaynak `messages` satırı (eşleşme
// client_message_id ile). Bu tablo yalnız outbox.ts'in bugüne kadar process
// ömürlü bir Map'te tuttuğu muhasebeyi diske taşıyor: deneme sayısı, backoff
// (`next_eligible_at_ms`), kalıcı başarısızlık ve kota tahsilat bayrağı.
// Yazan/okuyan taraf outbox.ts — bkz. migrations.ts V7 yorumu.

export function readSendAttempts(): SendAttemptRow[] {
  return getChatDb().getAll<SendAttemptRow>('SELECT * FROM send_attempts');
}

/**
 * TEK satır — PK (`client_message_id`) ile. `readSendAttempts()`'in tamamı
 * değil: outbox.ts bunu yalnız `chargeQuotaOnce`'ta Map'te MISS olduğunda
 * (`MAX_TRACKED` tahliyesi diski silmiyor ama Map'i siliyor) tek bir kaydın
 * `quota_charged`'ını sormak için çağırıyor — kota ikinci kez düşmesin diye
 * tüm tabloyu okumaya gerek yok.
 */
export function readSendAttempt(clientMessageId: string): SendAttemptRow | null {
  return getChatDb().getFirst<SendAttemptRow>(
    'SELECT * FROM send_attempts WHERE client_message_id = ?',
    [clientMessageId],
  );
}

export function upsertSendAttempt(row: SendAttemptRow): void {
  getChatDb().run(
    `INSERT INTO send_attempts (
       client_message_id, attempts, first_seen_at_ms, next_eligible_at_ms,
       permanent, quota_charged, origin, last_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_message_id) DO UPDATE SET
       attempts = excluded.attempts,
       first_seen_at_ms = excluded.first_seen_at_ms,
       next_eligible_at_ms = excluded.next_eligible_at_ms,
       permanent = excluded.permanent,
       quota_charged = excluded.quota_charged,
       origin = excluded.origin,
       last_error = excluded.last_error`,
    [
      row.client_message_id,
      row.attempts,
      row.first_seen_at_ms,
      row.next_eligible_at_ms,
      row.permanent,
      row.quota_charged,
      row.origin,
      row.last_error,
    ],
  );
}

export function deleteSendAttempts(clientMessageIds: string[]): void {
  if (!clientMessageIds.length) return;
  const holes = clientMessageIds.map(() => '?').join(',');
  getChatDb().run(
    `DELETE FROM send_attempts WHERE client_message_id IN (${holes})`,
    clientMessageIds,
  );
}

/**
 * Artık kuyrukta olmaması gereken muhasebe satırlarını siler: karşılık gelen
 * mesaj GÖNDERİLMİŞ (`send_state = 'sent'`) ya da hiç yok.
 *
 * `messages.send_state <> 'sent'` burada V5'teki gibi fazlalık bir terim
 * DEĞİL — "orphan"ın bizzat TANIMI. Eşlenik tek bir `send_state` koşulu var
 * ve o koşul bu satırın kalıp kalmayacağını belirliyor; indeks açma amaçlı
 * bir eşlik değil (bu NOT EXISTS alt sorgusu zaten `idx_messages_cmid`'i
 * kullanıyor, `idx_messages_unsent`'i değil). Terimi silersen prune
 * "gönderilmiş + yetim satırları sil"den "yalnız yetimleri sil"e döner ve
 * gönderilmiş mesajların muhasebesi diskte SONSUZA KADAR birikir.
 */
export function pruneOrphanSendAttempts(): number {
  const db = getChatDb();
  const before = db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM send_attempts')?.n ?? 0;
  db.run(`
    DELETE FROM send_attempts
     WHERE NOT EXISTS (
       SELECT 1 FROM messages
        WHERE messages.client_message_id = send_attempts.client_message_id
          AND messages.send_state <> 'sent'
     )`);
  const after = db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM send_attempts')?.n ?? 0;
  return before - after;
}

// ── pending_mutations: tepki/silme emirlerinin disk muhasebesi (v9) ────────
//
// `send_attempts`'in aksine gövdesiz DEĞİL: `payload_json` taşıyor, çünkü
// tepki niyeti (`desired`) `messages.reactions_json`'dan türetilemez — ayna
// optimistik listeyi zaten yazdı, hangi emojinin BİZİM niyetimiz olduğu ile
// sunucudan gelmiş olanı o JSON'dan ayırt edilemez (bkz. migrations.ts V9
// yorumu). `permanent` kolonu da yok: kalıcı ret burada "tekrar dene" hâli
// değil, satırın AYNI ANDA silinmesi. Policy/flush bu dosyanın işi değil
// (sonraki görevler) — burası yalnız depo.

export function readPendingMutations(): PendingMutationRow[] {
  return getChatDb().getAll<PendingMutationRow>(
    'SELECT * FROM pending_mutations ORDER BY first_seen_at_ms ASC',
  );
}

export function upsertPendingMutation(row: PendingMutationRow): void {
  getChatDb().run(
    `INSERT INTO pending_mutations (
       message_id, kind, conversation_id, payload_json, attempts,
       first_seen_at_ms, next_eligible_at_ms, last_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(message_id, kind) DO UPDATE SET
       conversation_id = excluded.conversation_id,
       payload_json = excluded.payload_json,
       attempts = excluded.attempts,
       first_seen_at_ms = excluded.first_seen_at_ms,
       next_eligible_at_ms = excluded.next_eligible_at_ms,
       last_error = excluded.last_error`,
    [
      row.message_id,
      row.kind,
      row.conversation_id,
      row.payload_json,
      row.attempts,
      row.first_seen_at_ms,
      row.next_eligible_at_ms,
      row.last_error,
    ],
  );
}

export function deletePendingMutation(messageId: string, kind: MutationKind): void {
  getChatDb().run('DELETE FROM pending_mutations WHERE message_id = ? AND kind = ?', [
    messageId,
    kind,
  ]);
}

/**
 * `send_attempts`'in `pruneOrphanSendAttempts`'ından farklı olarak burada
 * `send_state` terimi YOK: orada 'sent' olmak satırı yetim yapar (muhasebe
 * artık gerekmez), burada gönderilmiş olmak mutasyonun ÖN KOŞULUdur —
 * gönderilmemiş bir mesaja tepki/silme emri henüz yetim değildir, sırasını
 * bekliyordur. Yetimliğin TEK tanımı mesajın hiç olmaması.
 */
export function pruneOrphanPendingMutations(): number {
  const db = getChatDb();
  const before =
    db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM pending_mutations')?.n ?? 0;
  db.run(`
    DELETE FROM pending_mutations
     WHERE NOT EXISTS (
       SELECT 1 FROM messages WHERE messages.id = pending_mutations.message_id
     )`);
  const after =
    db.getFirst<{ n: number }>('SELECT COUNT(*) AS n FROM pending_mutations')?.n ?? 0;
  return before - after;
}

export function readMessageSendState(messageId: string): SendState | null {
  const row = getChatDb().getFirst<{ send_state: SendState }>(
    'SELECT send_state FROM messages WHERE id = ?',
    [messageId],
  );
  return row?.send_state ?? null;
}

// ── backfill: arka plan geçmiş indirme turunun ilerleme damgası (v8) ───────
//
// `sync_state.next_cursor`/`has_more` EKRANIN sayfalamasına ait ve
// `pruneExpiredMessages` dokunduğu her sohbette `next_cursor`'ı NULL'luyor —
// backfill bu kolonları paylaşsaydı retention turu onun geri dönüş noktasını
// da silerdi (bkz. migrations.ts V8 yorumu). Policy/round/tetikleyiciler bu
// dosyanın işi değil (`backfillPolicy.ts` + `chatBackfill.ts`) — burası yalnız
// depo.

export interface BackfillTarget {
  conversationId: string;
  cursor: string | null;
}

/**
 * Henüz bitmemiş (`backfill_done` NULL ya da 0) sohbetler, en son
 * konuşulandan geriye — en çok `limit` tane.
 *
 * `conversations` ile LEFT JOIN: `sync_state` satırı henüz yoksa (hiç
 * sayfalama/backfill denenmemiş sohbet) da hedef, cursor `null` döner.
 *
 * `conversation_id` tiebreaker'ı şart: `last_message_at_ms` nullable ve hiç
 * mesajlaşılmamış sohbetler hepsi NULL'da eşitleniyor — tek kolonlu sıra
 * SQLite'ın eşit satırları hangi fiziksel sırada döndürdüğüne (belirsiz)
 * bağlı kalırdı, küçük bir `limit` altında round'lar tekrar üretilemez olurdu.
 *
 * `limit` negatifse SQLite onu "sınırsız" sayar (`LIMIT -1` davranışı) — çağıran
 * yanlışlıkla negatif geçerse "en çok limit tane" sözü bozulup tüm bitmemiş
 * arşiv dönerdi; `Math.max(0, limit)` bu durumu sıfıra sabitliyor.
 */
export function readBackfillTargets(limit: number): BackfillTarget[] {
  return getChatDb()
    .getAll<{ conversation_id: string; cursor: string | null }>(
      `SELECT c.conversation_id AS conversation_id, s.backfill_cursor AS cursor
         FROM conversations c
         LEFT JOIN sync_state s ON s.conversation_id = c.conversation_id
        WHERE COALESCE(s.backfill_done, 0) = 0
        ORDER BY c.last_message_at_ms DESC, c.conversation_id ASC
        LIMIT ?`,
      [Math.max(0, limit)],
    )
    .map((row) => ({ conversationId: row.conversation_id, cursor: row.cursor }));
}

/**
 * Sohbetin backfill cursor'unu yazar. `sync_state` satırı yoksa açar —
 * bu çağrı ekranın hiç sayfalama yapmadığı bir sohbette de gelebilir.
 */
export function setBackfillCursor(conversationId: string, cursor: string | null): void {
  getChatDb().run(
    `INSERT INTO sync_state (conversation_id, backfill_cursor) VALUES (?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET backfill_cursor = excluded.backfill_cursor`,
    [conversationId, cursor],
  );
}

/**
 * Sohbetin geçmişi tamamen indi — `readBackfillTargets` bir daha onu
 * döndürmez (bkz. yukarıdaki WHERE koşulu).
 */
export function markBackfillDone(conversationId: string): void {
  getChatDb().run(
    `INSERT INTO sync_state (conversation_id, backfill_done) VALUES (?, 1)
     ON CONFLICT(conversation_id) DO UPDATE SET backfill_done = 1`,
    [conversationId],
  );
}

/**
 * "Tamam" damgasını SÖKER — sohbet `readBackfillTargets`'a geri girer.
 *
 * `backfill_done` tek yönlü bir mandal: `markBackfillDone` dışında yazıcısı
 * yok ve `clearAllChatData()` haricinde hiçbir tam senkron yolu onu
 * temizlemiyor. Mandalı yanlış yere basan GERÇEK yol şu: gizli geçmişi olan
 * (rematch) sohbet sunucudan `messages: [] / hasMore: false` alıyor, round
 * onu tamam sayıyor — oysa arşiv yalnız KİLİTLİ. Kullanıcı kilidi açınca
 * (`chat/historyRevealed`) bu fonksiyon çağrılmazsa o sohbetin geçmişi bir
 * daha hiç indirilmez.
 *
 * `backfill_cursor`'a DOKUNMAZ: mandal "bitti mi" sorusuna ait, "nerede
 * kalmıştım"a değil; ikisini birlikte sıfırlamak diskte olan sayfaları
 * yeniden indirtirdi. Satır yoksa UPDATE no-op — damga da zaten yoktur.
 */
export function clearBackfillDone(conversationId: string): void {
  getChatDb().run('UPDATE sync_state SET backfill_done = 0 WHERE conversation_id = ?', [
    conversationId,
  ]);
}
