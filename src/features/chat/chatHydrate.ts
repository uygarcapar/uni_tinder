import {
  countMessages,
  readConversations,
  readConversationsByIds,
  readFailedSends,
  readLastVoiceDurations,
  readOlder,
  readSyncState,
  readWindow,
  type LastVoiceQuery,
} from '@/features/chat/chatRepository';
import type { AppliedChanges } from '@/features/chat/chatDeltaSync';
import {
  applyLocalDelta,
  hydrateConversations,
  hydrateWindow,
  prependOlderFromLocal,
} from '@/features/chat/chatSlice';
import { projectRow, projectRows, projectWindow } from '@/features/chat/messageCache';
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
 * Sohbet listesini diskten store'a yazar — AÇILIŞTA BİR KEZ.
 *
 * Neden React değil de açılış: liste yalnız MessagesScreen'in değil, sekme
 * rozetinin ve bildirimden gelen derin bağlantının da girdisi. Ekranın
 * mount'unu beklemek "liste ekranı açılınca dolar" demekti; store kurulurken
 * okumak ilk render'da herkesin dolu listeyi görmesi demek.
 *
 * @returns diskten gelen satır sayısı (teşhis için).
 */
export function hydrateConversationList(dispatch: (action: any) => void): number {
  if (!CHAT_SQLITE_ENABLED) return 0;
  try {
    const list = readConversations();
    dispatch(hydrateConversations(list));
    return list.length;
  } catch (error) {
    // Liste okunamadıysa eski davranış: ağ gelene kadar boş ekran.
    console.error('[chatHydrate] sohbet listesi okunamadı:', error);
    return 0;
  }
}

/**
 * Gönderilememiş mesajlar — TÜM arşivden, outbox'ın sessiz turu için.
 *
 * Saf okuma, dispatch yok. `projectRow` ile satır başına kimlik haritasından
 * geçiyor: aynı mesaj Redux bucket'ında da duruyorsa AYNI NESNE dönüyor, yani
 * birleştirme (outboxPolicy.mergeFailedOutbox) referans karşılaştırmasıyla
 * ikizleri eliyor.
 */
export function readFailedOutboxFromLocal(opts?: {
  sinceMs?: number;
  limit?: number;
}): MessageDto[] {
  if (!CHAT_SQLITE_ENABLED) return [];
  try {
    return readFailedSends(opts).map((row) => projectRow(row.conversation_id, row));
  } catch (error) {
    // Disk okunamadıysa tur Redux bucket'larıyla devam eder (eski davranış).
    console.error('[chatHydrate] başarısız gönderimler okunamadı:', error);
    return [];
  }
}

/**
 * DELTA-SYNC → EKRAN. Diske inen değişiklikleri store'a taşır.
 *
 * Delta turu yalnız SQLite'a yazıyor (chatDeltaSync.applyPage) ve hiç dispatch
 * etmiyordu. Burası o turun dokunduğu sohbetleri diskten YENİDEN OKUYUP tek bir
 * action'la store'a veriyor — ağ turu yok, payload da kullanılmıyor (gerekçe:
 * chatSlice.applyLocalDelta).
 *
 * Mesaj penceresi YALNIZ Redux'ta bucket'ı olan sohbetler için okunuyor:
 * pratikte bu açık sohbet (ve geçmişte açılmış birkaç tanesi), yani tur başına
 * 0-1 indeksli okuma. Bucket'ı olmayan sohbeti ısıtmak boşa iş olurdu — oraya
 * girildiğinde hydrateConversation zaten diskten okuyor.
 */
export function applyDeltaFromLocal(
  store: { getState: () => any; dispatch: (action: any) => void },
  applied: AppliedChanges,
): void {
  if (!CHAT_SQLITE_ENABLED) return;
  const touched = applied.conversationIds;
  if (!touched.length && !applied.removedConversationIds.length) return;

  try {
    const buckets = store.getState()?.chat?.messagesByConv ?? {};
    const windowsByConv: Record<string, MessageDto[]> = {};
    for (const conversationId of touched) {
      if (!buckets[conversationId]) continue;
      const rows = readWindow(conversationId, HOT_WINDOW);
      if (rows.length) {
        windowsByConv[conversationId] = projectWindow(conversationId, rows);
      }
    }

    store.dispatch(
      applyLocalDelta({
        conversations: readConversationsByIds(touched),
        windowsByConv,
        deletions: applied.deletions,
        removedConversationIds: applied.removedConversationIds,
      }),
    );
  } catch (error) {
    // Ekran bayat kalır, disk doğru: bir sonraki giriş/fetch düzeltiyor.
    console.error('[chatHydrate] delta store\'a taşınamadı:', error);
  }
}

/**
 * Sohbet listesi satırları için son sesli mesajın süresi — RENDER SIRASINDA
 * çağrılabilir (saf okuma, dispatch yok; `hasLocalHistory` ile aynı sözleşme).
 *
 * MessagesScreen'in süre kaynağı eskiden yalnız Redux bucket'ıydı; bucket artık
 * persist edilmediği için (CHAT_PERSIST_ENABLED=false) soğuk açılışta BOŞ
 * oluyor ve süre ancak sohbete girip çıkınca (hydrateConversation) görünüyordu.
 * Arşivde ise süre zaten duruyor — bu fonksiyon o veriyi ekrana açan kapı.
 */
export function readVoiceDurationsFromLocal(
  queries: LastVoiceQuery[],
): Record<string, number> {
  if (!CHAT_SQLITE_ENABLED || !queries.length) return {};
  try {
    return readLastVoiceDurations(queries);
  } catch (error) {
    // Liste satırında süre YAZMAMAK kozmetik; okuma patlarsa çağıranın ağ
    // yedeği devreye giriyor.
    console.error('[chatHydrate] sesli mesaj süreleri okunamadı:', error);
    return {};
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
