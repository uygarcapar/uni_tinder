import { getChatDb } from '@/features/chat/db/chatDb';
import { initSyncState, upsertConversations, upsertMessage } from '@/features/chat/chatRepository';
import { appKv, chatCacheStorage } from '@/shared/store/mmkvStorage';
import { utcTime } from '@/shared/utils/dateUtc';
import type { ConversationListItemDto, MessageDto } from '@/shared/types';

/**
 * Eski MMKV chat cache'ini (redux-persist `persist:chat`) SQLite'a bir kez taşır.
 *
 * ── İşaret NEREDE duruyor ───────────────────────────────────────────────────
 * `appKv`'de (şifreli 'redux-app' instance'ı), 'chat-cache'te DEĞİL: chat-cache
 * logout'ta tamamen siliniyor, işaret ondan uzun yaşamak zorunda. Yoksa her
 * logout sonrası import "hiç yapılmamış" sayılırdı.
 *
 * ── Blob AYNI RELEASE'TE SİLİNMEZ ───────────────────────────────────────────
 * Import et, işareti koy, `persist:chat`'i yerinde bırak. `CHAT_SQLITE_ENABLED`
 * bir OTA hotfix'le kapatılırsa redux-persist onu rehydrate eder ve uygulama
 * sağlam kalır. Aynı release'te köprüyü yakmak kill-switch'i anlamsızlaştırır.
 *
 * ── Silerken `remove`, ASLA `clearAll` ──────────────────────────────────────
 * Composer draft'ları AYNI MMKV dosyasında, 'draft:' önekiyle duruyor
 * (draftStore.ts:17-19). `clearChatCache()` = `clearAll()` — bir sonraki
 * release'te blob'u temizlerken o fonksiyonu KULLANMA, yoksa kullanıcının yarım
 * yazdığı her mesaj gider.
 */

const IMPORT_MARKER = 'chat_sqlite_import_v1';
const LEGACY_KEY = 'persist:chat';

export interface ImportResult {
  ran: boolean;
  conversations: number;
  messages: number;
}

export function importLegacyChatCache(): ImportResult {
  const skipped: ImportResult = { ran: false, conversations: 0, messages: 0 };
  if (appKv.getBoolean(IMPORT_MARKER) === true) return skipped;

  const raw = chatCacheStorage.getString(LEGACY_KEY);
  if (!raw) {
    // Taşınacak bir şey yok (temiz kurulum) — yine de işaretle, her açılışta
    // MMKV'yi yoklamayalım.
    appKv.set(IMPORT_MARKER, true);
    return skipped;
  }

  const result: ImportResult = { ran: true, conversations: 0, messages: 0 };
  try {
    // redux-persist zarfı: dış nesne bir JSON, ama HER ANAHTARIN DEĞERİ ayrıca
    // JSON string'lenmiş. Tek parse yetmez.
    const envelope = JSON.parse(raw) as Record<string, string>;
    const conversations = safeParse<ConversationListItemDto[]>(envelope.conversations, []);
    const messagesByConv = safeParse<Record<string, any>>(envelope.messagesByConv, {});

    if (conversations.length) {
      upsertConversations(conversations);
      result.conversations = conversations.length;
    }

    const db = getChatDb();
    db.transaction(() => {
      for (const [conversationId, bucket] of Object.entries(messagesByConv)) {
        const messages: MessageDto[] = Array.isArray(bucket?.messages) ? bucket.messages : [];
        // Transform bunları yazarken zaten ayıklıyordu (chatPersistTransform.ts:36-40)
        // ama transform'dan ÖNCEKİ bir blob da diskte olabilir — savunmacı süz.
        const durable = messages.filter(
          (m) => m && !m._pending && !m._failed && !String(m.id ?? '').startsWith('temp-'),
        );
        if (!durable.length) continue;

        for (const m of durable) upsertMessage(db, m, conversationId);
        result.messages += durable.length;

        const oldest = Math.min(...durable.map((m) => utcTime(m.sentAt)).filter(Number.isFinite));
        initSyncState(conversationId, {
          oldestLoadedSentAtMs: Number.isFinite(oldest) ? oldest : null,
          // Cap'lenmiş bloblarda transform cursor'ı null'lamış olur; sorun değil,
          // açılıştaki page-1 reconcile onarım dalını çalıştırıyor.
          nextCursor: bucket?.nextCursor ?? null,
          hasMore: !!bucket?.hasMore,
          hasHiddenHistory: !!bucket?.hasHiddenHistory,
        });
      }
    });
  } catch (error) {
    // Bozuk blob yüzünden uygulama açılmamazlık etmesin: SQLite boş kalır,
    // sunucudan yeniden dolar. İşareti YİNE de koyuyoruz — aynı bozuk blob'u
    // her açılışta yeniden denemenin faydası yok.
    console.error('legacy chat cache import failed:', error);
  }

  appKv.set(IMPORT_MARKER, true);
  return result;
}

function safeParse<T>(value: string | undefined, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return (JSON.parse(value) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/** Yalnız test içindir. */
export function __resetImportMarker(): void {
  appKv.set(IMPORT_MARKER, false);
}
