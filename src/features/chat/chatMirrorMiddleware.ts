import type { Middleware } from '@reduxjs/toolkit';
import * as repo from '@/features/chat/chatRepository';
import { openChatDb } from '@/features/chat/db/chatDb';
import { importLegacyChatCache } from '@/features/chat/db/importLegacyCache';
import { startDeltaSync } from '@/features/chat/chatDeltaSync';
import { fetchConversations } from '@/features/chat/chatSlice';
import { clear as clearMessageCache, projectWindow } from '@/features/chat/messageCache';
import { messageContentEqual } from '@/features/chat/messageEquality';
import type { MessageDto } from '@/shared/types';

/**
 * Chat DUAL-WRITE aynası.
 *
 * ── Neden middleware ────────────────────────────────────────────────────────
 * SQLite'a yazmanın iki adayı vardı: (a) her çağrı yerini tek tek elle bağlamak,
 * (b) action akışını dinlemek. (b) seçildi çünkü SignalR handler'ları
 * AppNavigator.tsx'in içinde bir effect closure'ı olarak yaşıyor ve oraya
 * dokunmadan realtime yolunu yakalamanın tek yolu bu: handler'lar zaten
 * dispatch ediyor, middleware onları görüyor. Tek yeni dosya + store'a tek
 * satır; geri almak da aynı tek satır.
 *
 * ── Sıra: ÖNCE Redux ────────────────────────────────────────────────────────
 * `next(action)` en başta çağrılır. Bu fazda Redux HÂLÂ TEK GERÇEK; SQLite
 * gölge. Ayna kodu ne kadar sürerse sürsün ya da patlarsa patlasın, ekrana
 * giden yol etkilenmemeli.
 *
 * ── Hiçbir hata dışarı sızmaz ───────────────────────────────────────────────
 * Tüm ayna işi try/catch içinde. Bir SQL hatası sohbeti kilitlemez; en kötü
 * ihtimalle arşiv o event'i kaçırır ve bir sonraki reconcile düzeltir.
 */

let started = false;
let failureCount = 0;
const MAX_LOGGED_FAILURES = 5;

let stopDeltaSync: (() => void) | null = null;

/**
 * Store kurulduktan sonra bir kez — DB'yi açar, eski MMKV blob'unu taşır,
 * saklama penceresini uygular ve delta-sync tetikleyicilerini kurar.
 *
 * `store` opsiyonel: yalnız delta-sync için gerekiyor ve o da bayrakla kapılı.
 * Testler parametresiz çağırabiliyor.
 */
export function startChatMirror(store?: {
  getState: () => any;
  dispatch: (action: any) => any;
}): void {
  if (started) return;
  started = true;
  try {
    openChatDb();
    importLegacyChatCache();
    // Saklama penceresi — sunucunun MessageRetentionJob'ı ile aynı. Açılışta
    // bir kez, indeksli tek DELETE. Sunucudan sinyal beklemiyor: o iş hard
    // delete yapıyor ve arkasında hiç iz bırakmıyor.
    repo.pruneExpiredMessages();
  } catch (error) {
    console.error('[chatMirror] başlatılamadı, ayna devre dışı:', error);
    started = false;
    return;
  }

  if (!store) return;
  // Bayrak kapalıyken startDeltaSync no-op döndürüyor; burada koşul yok.
  stopDeltaSync = startDeltaSync({
    getActiveConversationId: () => store.getState()?.chat?.activeConversationId ?? null,
    // UT-6744: delta hiçbir şey söyleyemiyor → mevcut yolla tam senkron.
    // Sohbet listesi yenilenince açık sohbetin reconcile'ı ChatScreen'den
    // zaten geliyor.
    onNeedsFullResync: () => {
      store.dispatch(fetchConversations({ force: true }));
    },
  });
}

/** Logout / teardown. */
export function stopChatMirror(): void {
  stopDeltaSync?.();
  stopDeltaSync = null;
}

export function __resetChatMirrorForTests(): void {
  started = false;
  failureCount = 0;
}

function mirror(action: any, getState: () => any): void {
  const p = action.payload;

  switch (action.type) {
    case 'chat/fetchConversations/fulfilled':
      repo.upsertConversations(p ?? [], {
        activeConversationId: getState()?.chat?.activeConversationId ?? null,
      });
      return;

    case 'chat/fetchHistory/fulfilled': {
      const { conversationId, messages, nextCursor, hasMore, hasHiddenHistory, append } = p ?? {};
      if (!conversationId) return;
      repo.applyHistoryPage(
        conversationId,
        { messages: messages ?? [], nextCursor: nextCursor ?? null, hasMore: !!hasMore, hasHiddenHistory },
        { append: !!append },
      );
      if (__DEV__) assertMirrorsRedux(conversationId, getState);
      return;
    }

    // Gelen/giden mesaj. upsertMessage clientMessageId ile uzlaştırıyor, yani
    // optimistic satır ikizlenmiyor.
    case 'chat/receiveMessage':
    case 'chat/messageSent':
    case 'chat/messageEdited':
      if (p?.id && p?.conversationId) repo.saveMessage(p, p.conversationId);
      return;

    case 'chat/appendOptimisticMessage':
      if (p?.message?.id && p?.conversationId) {
        repo.saveMessage(p.message, p.conversationId, 'pending');
      }
      return;

    case 'chat/failOptimisticMessage':
      if (p?.clientMessageId) repo.setSendState(p.clientMessageId, 'failed');
      return;

    case 'chat/retryOptimisticMessage':
      if (p?.clientMessageId) repo.setSendState(p.clientMessageId, 'pending');
      return;

    case 'chat/removeOptimisticMessage':
      if (p?.clientMessageId) repo.removeByClientMessageId(p.clientMessageId);
      return;

    case 'chat/messagesRead':
      if (p?.conversationId && p?.readByUserId) repo.applyReadReceipt(p);
      return;

    case 'chat/messageDelivered':
      if (p?.messageId) repo.applyDelivered([p]);
      return;

    case 'chat/messagesDeliveredBatch':
      if (Array.isArray(p) && p.length) repo.applyDelivered(p);
      return;

    case 'chat/messageDeleted':
      if (p?.messageId) repo.applyDeleted(p);
      return;

    case 'chat/reactionsChanged':
      if (p?.messageId) repo.applyReactions(p.messageId, p.reactions ?? []);
      return;

    case 'chat/conversationDeactivated':
      if (p?.conversationId) repo.markConversationDeactivated(p);
      return;

    case 'chat/conversationRestored':
      if (p?.conversationId) repo.markConversationRestored(p.conversationId);
      return;

    case 'chat/historyRevealed':
      if (p?.conversationId) repo.setHiddenHistory(p.conversationId, false);
      return;

    case 'chat/matchNotification':
      if (p?.conversationId && p?.matchedUserId) {
        repo.insertConversationFromMatch({
          conversationId: p.conversationId,
          matchId: p.matchId,
          partnerUserId: p.matchedUserId,
          partnerDisplayName: p.matchedUserName,
          partnerProfileImageUrl: p.matchedUserPhoto,
          matchedAt: p.matchedAt,
        });
      }
      return;

    // resetChat logout choke-point'inde geliyor ve chat tarafındaki TEK
    // güvenlik kapımız bu (AppNavigator'a dokunmuyoruz).
    //
    // İki temizlik birden şart:
    //  • tablolar — diskte önceki kullanıcının mesajı kalmasın
    //  • messageCache — projekte nesneler JS HEAP'inde yaşıyor; yalnız tabloyu
    //    boşaltmak onları düşürmez ve sonraki kullanıcının ekranına önceki
    //    kullanıcının balonları gelebilirdi.
    //
    // Dosyanın kendisi burada SİLİNMİYOR (chatDb.destroyChatDb) — o, süreç
    // sonlandırma sırasına ait ve boşaltılmış tablo zaten okunacak bir şey
    // bırakmıyor.
    case 'chat/resetChat':
      repo.clearAllChatData();
      clearMessageCache();
      return;

    default:
      return;
  }
}

/**
 * Faz 2'nin asıl aracı: SQLite projeksiyonu ile Redux bucket'ı AYNI MI?
 *
 * Sessiz kalması gereken bir alarm. Konuşursa SQL tarafında bir kural
 * (contiguity, UPSERT alan listesi, receipt aralığı) Redux'takinden ayrışmış
 * demektir — ve bunu Faz 3'te okuma yolunu çevirmeden ÖNCE bilmek istiyoruz.
 *
 * `_pending`/`_failed` iki tarafta farklı temsil ediliyor (projeksiyon her zaman
 * boolean yazar, Redux'ta `undefined` olabilir) — karşılaştırmadan önce `!!`
 * ile normalize ediliyor.
 */
function assertMirrorsRedux(conversationId: string, getState: () => any): void {
  const bucket = getState()?.chat?.messagesByConv?.[conversationId];
  if (!bucket?.messages?.length) return;

  const rows = repo.readWindow(conversationId, bucket.messages.length);
  const projected = projectWindow(conversationId, rows);
  const reduxTop: MessageDto[] = bucket.messages.slice(0, projected.length);

  const normalize = (m: MessageDto) => ({ ...m, _pending: !!m._pending, _failed: !!m._failed });

  for (let i = 0; i < projected.length; i++) {
    const a = normalize(projected[i]);
    const b = normalize(reduxTop[i]);
    if (a.id !== b.id) {
      console.warn(
        `[chatMirror] ${conversationId}[${i}] SIRA ayrışması: sqlite=${a.id} redux=${b.id}`,
      );
      return;
    }
    if (!messageContentEqual(a, b)) {
      console.warn(`[chatMirror] ${conversationId}[${i}] İÇERİK ayrışması (${a.id})`);
      return;
    }
  }
}

export const chatMirrorMiddleware: Middleware = (store) => (next) => (action: any) => {
  // ÖNCE Redux — bu fazda tek gerçek o.
  const result = next(action);

  if (!started) return result;
  const type = action?.type;
  if (typeof type !== 'string' || !type.startsWith('chat/')) return result;

  try {
    mirror(action, store.getState);
  } catch (error) {
    if (failureCount++ < MAX_LOGGED_FAILURES) {
      console.error(`[chatMirror] ${type} aynalanamadı:`, error);
    }
  }
  return result;
};
