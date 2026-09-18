import {
  countMessages,
  readOlder,
  readSyncState,
  readWindow,
} from '@/features/chat/chatRepository';
import { hydrateWindow, prependOlderFromLocal } from '@/features/chat/chatSlice';
import { projectRows, projectWindow } from '@/features/chat/messageCache';
import { CHAT_SQLITE_ENABLED } from '@/shared/store/chatFlags';
import { utcTime } from '@/shared/utils/dateUtc';
import type { MessageDto } from '@/shared/types';

/**
 * SQLite → Redux sıcak penceresi. Local-first okumanın TEK giriş noktası.
 *
 * ── Neden SENKRON ───────────────────────────────────────────────────────────
 * expo-sqlite'ın async API'si bir tick sonra çözülüyor. O durumda ChatScreen
 * BOŞ bucket'la mount olur → `hadInitialMessagesRef` false kalır
 * (ChatScreen.tsx:711-713) → `await fetchHistory` dalına düşülür → SPINNER.
 * Yani async okuma "spinner yok" hedefini tanımı gereği sağlayamıyor. 60 satır
 * indeksli okuma ~1-3 ms; HTTP gidiş-dönüşünden iki mertebe ucuz.
 */

/** Sohbet açılışında belleğe alınan satır sayısı. */
export const HOT_WINDOW = 60;

/** Yukarı kaydırmada yerel diskten çekilen sayfa boyutu (ağ sayfasıyla aynı). */
export const LOCAL_PAGE = 30;

/**
 * "Bu sohbetin yerel geçmişi var mı?" — RENDER SIRASINDA çağrılabilir.
 *
 * ChatScreen ilk render'ında `hadInitialMessagesRef`'i belirliyor ve o karar
 * spinner'lı dalı mı yoksa fire-and-forget reconcile dalını mı seçeceğini
 * tayin ediyor (ChatScreen.tsx:711-713, :766-779). Deep link / bildirime
 * dokunma yolunda Redux bucket'ı henüz boş oluyor; oraya yalnız `messages`e
 * bakarak karar verirsek diskte geçmiş dururken spinner gösterirdik.
 *
 * Saf okuma, dispatch yok — render sırasında yan etki üretmiyor.
 */
export function hasLocalHistory(conversationId: string): boolean {
  if (!CHAT_SQLITE_ENABLED || !conversationId) return false;
  try {
    return countMessages(conversationId) > 0;
  } catch {
    return false;
  }
}

/**
 * Sohbetin sıcak penceresini diskten okuyup store'a yazar.
 *
 * @returns ekrana yazılacak mesaj olup olmadığı — çağıran buna göre iskelet
 *          gösterip göstermeyeceğine karar verebilir.
 */
export function hydrateConversation(
  dispatch: (action: any) => void,
  conversationId: string,
  limit = HOT_WINDOW,
): boolean {
  if (!CHAT_SQLITE_ENABLED || !conversationId) return false;
  try {
    const rows = readWindow(conversationId, limit);
    if (!rows.length) return false;

    const sync = readSyncState(conversationId);
    dispatch(
      hydrateWindow({
        conversationId,
        messages: projectWindow(conversationId, rows),
        // Pencerenin DİBİNDE hâlâ yerel satır varsa cursor'a gerek yok; yukarı
        // kaydırma önce diski tüketir. `hasMore`'u burada geniş tutmak güvenli:
        // yerel biterse loadOlderLocalFirst ağa düşüyor.
        nextCursor: sync?.next_cursor ?? null,
        hasMore: rows.length >= limit || !!sync?.has_more,
        hasHiddenHistory: !!sync?.has_hidden_history,
      }),
    );
    return true;
  } catch (error) {
    // Disk okunamadıysa eski davranışa düş (ağdan çek) — sohbet açılmamazlık
    // etmesin.
    console.error('[chatHydrate] hydrate başarısız:', error);
    return false;
  }
}

export type LoadOlderOutcome =
  /** Yerelden satır geldi, ağa gerek yok. */
  | 'local'
  /** Yerel tükendi — çağıran ağ sayfasını istemeli. */
  | 'exhausted'
  /** Local-first kapalı ya da okuma patladı — çağıran eski yolu kullanmalı. */
  | 'unavailable';

/**
 * Yukarı kaydırma: ÖNCE disk, bitince ağ.
 *
 * Çağıranın mevcut sayfalama guard'ları (momentum kapısı, in-flight, cooldown)
 * AYNEN kalmalı. Pahalı olan hiçbir zaman fetch değildi — LegendList prepend'i
 * + MVCP yeniden hesabıydı (ChatScreen.tsx:883-887). Yerel okuma daha hızlı
 * olduğu için fling ortasında prepend etmeyi KOLAYLAŞTIRIYOR; "artık anlık"
 * diye guard atlamak commit storm'u geri getirir.
 */
export function loadOlderLocalFirst(
  dispatch: (action: any) => void,
  conversationId: string,
  oldestShown: MessageDto | undefined,
  limit = LOCAL_PAGE,
): LoadOlderOutcome {
  if (!CHAT_SQLITE_ENABLED || !conversationId || !oldestShown) return 'unavailable';
  try {
    const sentAtMs = utcTime(oldestShown.sentAt);
    if (!Number.isFinite(sentAtMs)) return 'unavailable';

    const rows = readOlder(conversationId, { sentAtMs, id: oldestShown.id }, limit);
    if (!rows.length) return 'exhausted';

    dispatch(
      prependOlderFromLocal({
        conversationId,
        // projectRows, projectWindow DEĞİL: satır kimliği aynı sohbetin
        // identity map'inden gelmeli (aynı mesaj iki nesne olmasın), ama bu
        // sayfa "son pencere" değil — dizi önbelleğini ezmemeli.
        messages: projectRows(conversationId, rows),
      }),
    );
    return 'local';
  } catch (error) {
    console.error('[chatHydrate] yerel sayfa okunamadı:', error);
    return 'unavailable';
  }
}
