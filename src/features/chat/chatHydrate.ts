import {
  countMessages,
  readAround,
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
 *
 * ── PENCERELİ (hedefli atlama) bucket'lar da bu okumadan MUAF ────────────────
 * Review turu 2, Önemli 4'ün kapanışı: `isWindowed:true` bucket'lar için
 * `readWindow` (arşivin DİBİ) burada HİÇ OKUNMUYOR — okusak bile
 * `chatSlice.applyLocalDelta` onu merge etmeyecek (aynı kuralın orada da
 * yazılı kopyası), yani okuma SAF İSRAF olurdu. `receiveMessage`deki AYNI
 * gerekçe: mesaj zaten diske indi (bu fonksiyonun ÜSTÜNDEki `chatDeltaSync.run`
 * `applyPage` ile yazıp watermark'ı BU fonksiyondan TAMAMEN BAĞIMSIZ ilerletti),
 * iki yıl önceki bir pencereye yapıştırmak hiç göstermemekten daha yanıltıcı.
 * Pencere "son mesaja dön" (ChatScreen) ya da taze giriş (hydrateConversation)
 * ile temizlenince hot-window okuması zaten SQLite'taki GÜNCEL hâli görür —
 * bu turda atlanan hiçbir şey kaybolmuyor, yalnız EKRANA yansıması gecikiyor.
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
      const bucket = buckets[conversationId];
      if (!bucket || bucket.isWindowed) continue;
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
        // Arşivin DİBİ (en yeni sayfa) — pencereli DEĞİL. Açıkça `false`:
        // sohbete "taze" girmek (ya da ChatScreen'in "son mesaja dön"ü) önceki
        // bir hedefli ziyaretten kalmış `isWindowed`i burada TEMİZLER.
        isWindowed: false,
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

// Hedef mesajın ÖNÜ/ARKASI — `HOT_WINDOW`ın yarısı kadar her iki yönde,
// böylece toplam pencere boyutu mertebe olarak hot window ile aynı kalıyor.
export const JUMP_WINDOW_BEFORE = 30;
export const JUMP_WINDOW_AFTER = 30;

/**
 * Faz 4 — arama sonucundan mesaja atlama (Task 5). Hedef mesajın ETRAFINI
 * `readAround` ile YERELDEN okuyup store'a yazar; AĞA HİÇ ÇIKILMAZ
 * (`readAround` saf SQLite okuması — roadmap 4.3'ün "yerel yolun en büyük
 * avantajı" dediği tam olarak bu).
 *
 * `false` dönen İKİ ayrı durum var, ikisi de çağıranı AYNI yere (normal açılış)
 * gönderir:
 *  • local-first kapalı / id'ler boş — SQLite'a hiç gidilmedi.
 *  • hedef satır okunan pencerede YOK — `readAround`ın kendi sözleşmesi gereği
 *    (hedef artık arşivde yoksa sessizce atlanır, pencere yine de döner) bu,
 *    "mesaj hiç senkronize olmamış" ya da "id bayat" durumunu ayırt edemeyen
 *    bir sinyal; ayrım ÖNEMLİ DEĞİL, ikisinde de kullanıcıya gösterilecek
 *    hedef yok.
 *
 * ⚠️ Hedef BULUNAMADIĞINDA dispatch YAPILMAZ — bulunamayan bir pencereyi yine
 * de yazmak (ör. yalnız `sentAtMs` civarındaki rastgele satırları) çağıranın
 * "normal açılışa düş" dalını (ChatScreen'in `hadInitialMessagesRef`/hot-window
 * hydrate'i) YANLIŞ bir pencereyle önceden doldurup o dalın çalışmasını
 * engellerdi.
 */
export function hydrateAroundMessage(
  dispatch: (action: any) => void,
  conversationId: string,
  sentAtMs: number,
  messageId: string,
  before = JUMP_WINDOW_BEFORE,
  after = JUMP_WINDOW_AFTER,
): boolean {
  if (!CHAT_SQLITE_ENABLED || !conversationId || !messageId) return false;
  try {
    const { messages: rows, reachesNewest } = readAround(
      conversationId,
      sentAtMs,
      messageId,
      before,
      after,
    );
    if (!rows.some((r) => r.id === messageId)) return false;

    const sync = readSyncState(conversationId);
    dispatch(
      hydrateWindow({
        conversationId,
        // `projectWindow` (hydrateConversation'ın yolu) DEĞİL: o fonksiyon
        // HAM `MessageRow`ları `messageCache`in identity map'inden geçirip
        // DTO'ya çeviriyor — `readAround` ise kendi `rowToMessage`ıyla DTO'yu
        // ZATEN üretmiş döner (bkz. chatRepository.readAround). İkinci bir
        // dönüşüm hem tip hatası (DTO'yu Row bekleyen bir fonksiyona vermek)
        // hem de `rowToMessage`ın DTO alanlarını Row alanı sanıp çökmesi
        // olurdu. Bilinen bedel: bu pencerenin nesneleri `messageCache`in
        // identity map'ine KAYITLI DEĞİL, yani aynı mesaj daha sonra normal
        // yoldan (ör. yukarı kaydırma) tekrar okunursa BİR KEZLİK fazladan
        // nesne/render olur — işlevsel bir hata değil, nadir bir yolun
        // (hedefe atlama) ödediği küçük, kabul edilmiş bir performans bedeli.
        messages: rows,
        // Bu pencere arşivin DİBİ değil, hedefin ETRAFI — `hasMore` bilerek
        // sabit `true`: yukarı kaydırma `loadOlderLocalFirst`a düşüyor, o da
        // diskte başka satır yoksa kendi 'exhausted' sonucuyla zaten güvenli
        // durur. `nextCursor` ise sync_state'in GENEL (en yeni sayfa) imleci —
        // bu ORTA pencere için tam doğru değil ama bugün yalnız yerel tükenip
        // ağa düşüldüğünde kullanılıyor, o da nadir bir yol; bilinen, kabul
        // edilmiş bir yaklaşıklık (hydrateConversation'daki tam isabetin
        // aksine).
        nextCursor: sync?.next_cursor ?? null,
        hasMore: true,
        hasHiddenHistory: !!sync?.has_hidden_history,
        // Bayrak PENCERENİN KENDİSİNDEN türüyor, hangi fonksiyonun çağrıldığından
        // DEĞİL (review turu 4, Önemli 2). `receiveMessage` bu bayrak açıkken
        // canlı mesajı bitiştirmeyi bırakıyor (bkz. chatSlice.ts'teki yorumu) —
        // o bastırma yalnız pencere GERÇEKTEN mid-archive ise doğru. Eski hâl
        // KOŞULSUZ `true` yazıyordu ve "az önce konuşulan bir kelimeyi aramak"
        // pratikte her zaman hot window'un İÇİNDE bir hedefe denk geliyordu:
        // kullanıcı canlı sohbete bakıyor sanıyor, gelen mesajlar SESSİZCE
        // yutuluyordu. `readAround` cevabı zaten biliyor (`reachesNewest`:
        // hedeften daha yeni satır kalmadı = pencere arşivin dibine değiyor).
        //
        // Temizlenmenin diğer yolları aynen duruyor: sohbete taze girmek
        // (hydrateConversation, isWindowed:false), ChatScreen'in "son mesaja
        // dön"ü ve `fetchHistory`nin cursor:null dalı.
        isWindowed: !reachesNewest,
      }),
    );
    return true;
  } catch (error) {
    console.error('[chatHydrate] hedef etrafı okunamadı:', error);
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
