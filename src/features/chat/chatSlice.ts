import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import chatService, { HISTORY_PAGE_SIZE } from '@/features/chat/chatService';
import { messageContentEqual } from '@/features/chat/messageEquality';
import { contentTypeToNumber } from '@/features/chat/contentType';
import { utcTime } from '@/shared/utils/dateUtc';
// Mod tercihi diskten — `useAppMode`tan DEĞİL (o modül react-redux hook'ları
// çekiyor; swipeSlice'taki aynı gerekçe).
import { loadAppMode } from '@/features/discover/modePrefs';
import { chatErrorCodeOf, chatErrorEffect } from '@/shared/constants/responseCodes';
import type {
  ChatState,
  MessageDto,
  ConversationListItemDto,
  MessageBucket,
  ChatQuotaStatus,
} from '@/shared/types';

const QUOTA_STALE_MS = 30_000;
const CONVERSATIONS_STALE_MS = 15_000;

type FetchChatQuotaArg = string | { conversationId: string; force?: boolean };

// force:true → staleness bypass (reconnect, unmatch/restore gibi mutasyon-sonrası
// tazelemeler). Force'suz çağrılar 15sn staleness + in-flight guard'ına takılır —
// boot'taki AppNavigator+MessagesScreen çifte fetch'i teke iner.
export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  // `| void`: çıplak fetchConversations() çağrıları (0 argüman) tip-geçerli kalsın.
  async (_arg: { force?: boolean } | void, { rejectWithValue }) => {
    try {
      return await chatService.getConversations() as ConversationListItemDto[];
    } catch (e: any) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg && (arg as { force?: boolean }).force) return true;
      const chat = (getState() as any).chat;
      if (chat?.conversationsLoading) return false; // in-flight dedupe
      const stamp = chat?._conversationsFetchedAt;
      return !stamp || Date.now() - stamp > CONVERSATIONS_STALE_MS;
    },
  }
);

export const fetchHistory = createAsyncThunk(
  'chat/fetchHistory',
  async (
    { conversationId, cursor, pageSize = HISTORY_PAGE_SIZE }: { conversationId: string; cursor?: string; pageSize?: number },
    { rejectWithValue }
  ) => {
    try {
      const data = await chatService.getMessageHistory(conversationId, { cursor, pageSize });
      return { conversationId, ...data, append: !!cursor };
    } catch (e: any) {
      // UT-6741 (bozuk cursor) TEK KENDİNİ ONARAN hata: cursor bizden çıkıyor
      // ve persist'ten bayat gelebiliyor. Aynı isteği cursor'suz tekrarlıyoruz —
      // sayfalama sayfa-1'den kurulur (append:false bucket'ı tazeler). Kullanıcı
      // hiçbir şey görmez; alternatifi geçmişin kalıcı olarak açılmamasıydı.
      if (cursor && chatErrorEffect(chatErrorCodeOf(e)) === 'staleCursor') {
        try {
          const fresh = await chatService.getMessageHistory(conversationId, { pageSize });
          return { conversationId, ...fresh, append: false };
        } catch (retryErr: any) {
          return rejectWithValue(
            retryErr?.response?.data?.message || retryErr?.message || 'Failed'
          );
        }
      }
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  },
  {
    // In-flight dedupe: aynı konuşma için bir history fetch'i uçuştayken
    // ikincisini atma. MessagesScreen'in prefetch'i ile ChatScreen'in giriş
    // reconcile'ı aynı saniyede yarışıp AYNI history-cursor isteğini iki kez
    // atıyordu (Sentry trace kanıtlı). Bucket loading'i tek olduğu için farklı
    // cursor'lu (pagination) eşzamanlı istek de zaten yarış üretirdi — o da
    // bekler; ChatScreen pagination'ı loadingHistory ile ayrıca gate'li.
    condition: ({ conversationId }, { getState }) => {
      const bucket = (getState() as any).chat?.messagesByConv?.[conversationId];
      return !bucket?.loading;
    },
  }
);

export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  /**
   * ⚠️ MOD ARGÜMAN DEĞİL, BURADA ÇÖZÜLÜYOR — `swipeSlice.fetchWhoLikedMe`
   * ile aynı gerekçe: çağıranların hepsi (AppNavigator'ın bağlantı/foreground
   * turları, outbox, ekranlar) sabit referanslı callback'lerin içinde ve modu
   * kapanıştan okusalar bayat değere tutunurlardı. Tercihin kaynağı disk
   * (modePrefs); state'ten gereken tek şey anahtarın kullanıcı kimliği.
   */
  async (_: void, { getState }) => {
    const userId = (getState() as any)?.auth?.user?.id;
    return chatService.getUnreadCount(loadAppMode(userId)) as Promise<number>;
  }
);

export const fetchChatQuota = createAsyncThunk(
  'chat/fetchQuota',
  async (arg: FetchChatQuotaArg, { rejectWithValue }) => {
    const conversationId = typeof arg === 'string' ? arg : arg.conversationId;
    try {
      const status = await chatService.getQuota(conversationId);
      return { conversationId, status };
    } catch (e: any) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  },
  {
    condition: (arg, { getState }) => {
      const conversationId = typeof arg === 'string' ? arg : arg.conversationId;
      const force = typeof arg === 'object' && arg.force === true;
      if (force) return true;
      if (!conversationId) return false;
      const state = getState() as any;
      const stamp = state?.chat?.quotaMetaByConv?.[conversationId]?.fetchedAt;
      if (!stamp) return true;
      return Date.now() - stamp > QUOTA_STALE_MS;
    },
  }
);

// Backend kontratı 2026-08-02'de değişti: kanonik alanlar isUnlimited /
// requiresPremium / hasPremiumParticipant. Eski alanlar (bothPremium,
// requiresUnlock) bir sonraki major'a kadar aynı değerle doldurulmaya devam
// ediyor — backend deploy'u inene kadar SADECE onlar gelebilir, o yüzden
// fallback zinciri iki yönde de tutuluyor.
function normalizeQuota(raw: any): ChatQuotaStatus {
  const isUnlocked = !!raw?.isUnlocked;
  const hasPremiumParticipant = !!(raw?.hasPremiumParticipant ?? raw?.bothPremium);
  const isUnlimited = !!(raw?.isUnlimited ?? raw?.bothPremium) || isUnlocked;
  const remainingMessages = isUnlimited ? null : raw?.remainingMessages ?? null;
  return {
    hasPremiumParticipant,
    isUnlimited,
    isUnlocked,
    messageCount: raw?.messageCount ?? 0,
    freeMessageLimit: raw?.freeMessageLimit ?? 0,
    remainingMessages,
    requiresPremium:
      !isUnlimited && !!(raw?.requiresPremium ?? raw?.requiresUnlock),
  };
}

const emptyBucket = (): MessageBucket => ({
  messages: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
});

/**
 * TEK bir mesajı bucket'ın BAŞINA (listede en yeni uç) eklemenin TEK KAPISI.
 *
 * ── Neden bir chokepoint (review turu 4, Önemli 3) ──────────────────────────
 * `isWindowed` bayrağı dört tur boyunca KAPI KAPI yamanmıştı: `receiveMessage`,
 * `applyLocalDelta`, `fetchHistory`nin cursor:null dalı, `appendOutgoing`...
 * ve `messageSent` hiç fark edilmeden AÇIK kalmıştı. O reducer iki ayrı yerden
 * dispatch ediliyor ve ikisi de `appendOutgoing`'in pencere-temizleme yolundan
 * GEÇMİYOR: `outbox.ts`in gönderim ack'i ve hub'ın `MessageSent` event'i (kendi
 * mesajın BAŞKA bir cihazdan). İkisinde de `clientMessageId` araması pencereli
 * bucket'ta ISKALIYOR ve mesaj iki yıl önceki bir pencerenin yanına
 * yapışıyordu — bayrağın önlemek için var olduğu TAM ŞEY.
 *
 * Bayrağı tek bir fonksiyonda okumak, yeni bir yazıcının kapıyı GÖRMEDEN
 * açmasını engelliyor ve `origin` seçmek zorunlu olduğu için yeni çağıran
 * "bu mesaj kimden" sorusuna cevap vermek ZORUNDA.
 *
 * ── KAPSAM: "tek mesajlık baş yazımı" — HER yazım DEĞİL ─────────────────────
 * Review turu 5, Minör 3: bu yorum önce "bucket'a mesaj eklemenin başka bir
 * yolu yok" diyordu ve bu YANLIŞTI. `mergeLocalWindow` (yukarıda) `fresh`
 * dizisini `[...fresh, ...bucket.messages]` ile BU KAPIDAN GEÇMEDEN önüne
 * ekliyor — dizi-birleştirme bir toplu okuma yansıtması, tek tek mesaj
 * eklemesi değil, ve `origin` kavramı orada anlamsız (gelen pencere diskin
 * kendisi). Orada bayrak ÇAĞRI YERİNDE korunuyor: tek çağıranı
 * `applyLocalDelta` ve o da döngüsünde `if (bucket.isWindowed) continue`
 * diyor (aşağıda, delta dalı). İddia bu yüzden DARALTILDI — garanti edilen
 * şey: pencereli bir bucket'a TEK MESAJLIK bir baş yazımı bu fonksiyondan
 * geçmeden olamaz. Toplu birleştirme yolları (bugün yalnız bir tane, private)
 * İSTİSNA ve kendi kapılarını taşımak zorunda; üçüncü bir toplu yol açan
 * kişi `applyLocalDelta`daki o `continue`yu kopyalamak zorunda.
 *
 * `origin`:
 *  • `'remote'` — karşı taraftan ya da BAŞKA bir yoldan gelen (realtime,
 *    gönderim ack'i, başka cihaz). Bucket pencereliyse EKLENMİYOR: mesaj zaten
 *    diskte, kullanıcı "son mesaja dön"e basınca orada bulacak; pencerenin
 *    yanına yapıştırmak sohbet O NOKTADA devam ediyormuş gibi okunur ve hiç
 *    göstermemekten daha YANILTICI olur.
 *  • `'localSend'` — kullanıcının AZ ÖNCE yazdığı mesaj (optimistic balon).
 *    ASLA bastırılmıyor: kendi gönderdiği mesajın göz önünde kaybolması, canlı
 *    bir mesajı kaçırmaktan daha kötü. Pencerenin kendisi bu yolda çağıranın
 *    sorumluluğu — `ChatScreen.appendOutgoing` dispatch'ten ÖNCE
 *    `hydrateConversation` ile hot window'a dönüyor (yalnız bayrağı `false`a
 *    çekmek yetmez, İÇERİK de taze olmalı). Pencere hâlâ açıkken buraya
 *    gelinmesi o sözleşmenin bozulduğu anlamına geliyor; sessiz kalmıyoruz.
 */
function prependToBucket(
  bucket: MessageBucket,
  msg: MessageDto,
  origin: 'remote' | 'localSend',
): void {
  if (bucket.isWindowed) {
    if (origin === 'remote') return;
    if (__DEV__) {
      console.warn(
        '[chat] pencereli bucket\'a yerel gönderim eklendi — çağıran önce hot window\'a dönmeliydi',
      );
    }
  }
  bucket.messages = [msg, ...bucket.messages];
}

const initialState: ChatState = {
  conversations: [],
  conversationsLoading: false,
  conversationsError: null,
  messagesByConv: {},
  typingByConv: {},
  presenceByUser: {},
  unreadTotal: 0,
  activeConversationId: null,
  quotaByConv: {},
  quotaMetaByConv: {},
};

// Kendi mesajını gönderen kullanıcı o sohbeti okumuş sayılır. Rozet gönderim
// anında yerelde düşer; server tarafını ChatScreen'in markRead'i + MessagesRead
// event'i kapatır. Bu olmadan "son mesajı ben attım ama okunmamış görünüyor"
// hali, sohbete girerken uçuşa çıkan /conversations yanıtı bayat unreadCount
// getirdiğinde bir sonraki tazelemeye kadar asılı kalıyordu.
function markConversationReadLocally(state: ChatState, conversationId: string) {
  const conv = state.conversations.find((c) => c.conversationId === conversationId);
  if (!conv || !conv.unreadCount) return;
  state.unreadTotal = Math.max(0, state.unreadTotal - conv.unreadCount);
  conv.unreadCount = 0;
}

// contentTypeToNumber artık ./contentType'ta — SQLite yazım kapısı
// (normalizeMessage) ve slice aynı dönüşümü paylaşmak zorunda, iki kopya
// ayrışırsa sesli mesajlar sessizce farklı tiplere düşer.

/**
 * Kota sohbet başına ve İKİ TARAFIN TOPLAMI: karşı tarafın mesajı da hakkı
 * düşürür. Yerel sayaç bu yüzden hem kendi gönderimimizde
 * (decrementQuotaLocally) hem karşı tarafın mesajı gelince (receiveMessage)
 * ilerliyor; aksi halde "kaç kaldı" bir sonraki /quota çekimine kadar bayat
 * kalıyor ve ara uyarılar (bkz. quotaMilestones) karşı tarafın mesajlarında
 * hiç tetiklenmiyordu. Sunucu authoritative: sohbet açılışı ve 402 yolu
 * fetchChatQuota ile düzeltir.
 */
function consumeQuotaLocally(state: ChatState, convId: string) {
  const q = state.quotaByConv[convId];
  if (!q) return;
  // Sayaç sınırsız sohbetlerde de artmaya devam eder (backend de öyle
  // sayıyor) — premium taraf abonelikten çıkarsa sohbet anında cap'e düşsün.
  q.messageCount = (q.messageCount ?? 0) + 1;
  if (q.remainingMessages == null) return;
  q.remainingMessages = Math.max(0, q.remainingMessages - 1);
  if (q.remainingMessages === 0 && !q.isUnlimited) {
    q.requiresPremium = true;
  }
}

function updateConversationLastMessage(state: ChatState, msg: MessageDto) {
  const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
  if (!conv) return;
  conv.lastMessagePreview = msg.content;
  conv.lastMessageAt = msg.sentAt;
  conv.lastMessageContentType = contentTypeToNumber(msg.contentType);
  const idx = state.conversations.indexOf(conv);
  if (idx > 0) {
    state.conversations.splice(idx, 1);
    state.conversations.unshift(conv);
  }
}

/**
 * Diskten okunmuş sıcak pencereyi bucket'a merge eder — `applyLocalDelta`'nın
 * iş yapan yarısı. Liste newest-first kalır.
 *
 * Üç kural:
 *  1. Eşleşen satır (id ya da clientMessageId) güncellenir; içerik gerçekten
 *     aynıysa ESKİ REFERANS korunur (LegendList uyanmasın).
 *  2. `clientMessageId` asla düşmez — keyExtractor ona bakıyor, kaybı item
 *     anahtarını değiştirip MVCP çapasını koparırdı.
 *  3. Bucket'ın en eski satırından DAHA ESKİ yeni satır EKLENMEZ: o satır
 *     yüklenmemiş bir sayfaya ait ve araya girmesi "bitişik son-ek"
 *     invariant'ını bozar (arada delik). Diskte duruyor, yukarı kaydırma okur.
 */
function mergeLocalWindow(bucket: MessageBucket, incoming: MessageDto[]): void {
  const byId = new Map<string, number>();
  const byClientId = new Map<string, number>();
  bucket.messages.forEach((m, i) => {
    if (m.id) byId.set(m.id, i);
    if (m.clientMessageId) byClientId.set(m.clientMessageId, i);
  });
  const oldestShown = bucket.messages.length
    ? utcTime(bucket.messages[bucket.messages.length - 1].sentAt)
    : 0;

  const fresh: MessageDto[] = [];
  for (const msg of incoming) {
    const idx =
      byId.get(msg.id) ??
      (msg.clientMessageId ? byClientId.get(msg.clientMessageId) : undefined);
    if (idx === undefined) {
      if (oldestShown && utcTime(msg.sentAt) < oldestShown) continue;
      fresh.push(msg);
      continue;
    }
    const prev = bucket.messages[idx];
    // Pencere messageCache'ten geliyor: hiçbir şey değişmediyse NESNE AYNI.
    if (prev === msg) continue;
    const next =
      prev.clientMessageId && !msg.clientMessageId
        ? { ...msg, clientMessageId: prev.clientMessageId }
        : msg;
    if (messageContentEqual(prev, next)) continue;
    bucket.messages[idx] = next;
  }

  if (!fresh.length) return;
  bucket.messages = [...fresh, ...bucket.messages].sort(
    (a, b) => utcTime(b.sentAt) - utcTime(a.sentAt),
  );
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveConversation: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },

    /**
     * SQLite'tan gelen SOHBET LİSTESİ — açılışta bir kez (bkz. startChatMirror).
     *
     * ── Neden merge DEĞİL, "yalnız boşsa yaz" ───────────────────────────────
     * Bu bir PRIMER, senkron kaynak değil: açılışta Redux listesi boş olduğu
     * için diskten dolduruyoruz, ondan sonra tek söz sahibi ağ + realtime.
     * Liste doluyken diskle merge etmeye kalkmak `fetchConversations.fulfilled`
     * içindeki dört local-wins kuralını (ve `upsertConversations`'taki SQL
     * ikizlerini) ÜÇÜNCÜ bir yerde tekrarlamak olurdu — bayat bir disk satırı
     * az önce gelen mesajı ezebilirdi.
     *
     * `_conversationsFetchedAt` damgası KASTEN yazılmıyor: o damga "sunucudan
     * ne zaman taze veri aldık" demek ve iki şeyi kapılıyor — 15sn staleness
     * guard'ı (yazarsak odak tazelemesi yutulur) ve AppNavigator'ın boot-settle
     * ölçütü (yazarsak uygulama ağ hiç cevap vermeden "oturdu" sayılır).
     * Ekranın boş-durum kapısı için AYRI damga var.
     */
    hydrateConversations: (
      state,
      action: PayloadAction<ConversationListItemDto[]>,
    ) => {
      state._conversationsHydratedAt = Date.now();
      if (state.conversations.length || !action.payload.length) return;
      state.conversations = action.payload;
      // Sekme rozeti de ağı beklemesin. fetchUnreadCount/MessagesRead birazdan
      // düzeltiyor; buradaki değer yalnız ilk kareler için.
      state.unreadTotal = action.payload.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
      action.payload.forEach((c) => {
        // Presence diskte YOK (bkz. rowToConversation) — herkes offline doğuyor,
        // hub bağlanınca gerçeği yazıyor.
        if (c.partnerUserId) {
          state.presenceByUser[c.partnerUserId] = { isOnline: false, lastSeen: null };
        }
      });
    },

    /**
     * DELTA-SYNC'İN DİSKE YAZDIĞINI EKRANA TAŞIR.
     *
     * Delta akışı (`GET /messages/changes`) doğrudan SQLite'a yazıyor ve hiç
     * dispatch etmiyordu: "diskte var, ekranda yok" — açık sohbet ve liste,
     * arka plandan dönüşte çekilen mesajları ancak bir sonraki girişte (ya da
     * ağ fetch'inde) görüyordu. Bu reducer o tek yönlü sokağı kapatıyor.
     *
     * ── Kaynak PAYLOAD DEĞİL DİSK ───────────────────────────────────────────
     * `windowsByConv` sunucunun delta gövdesi değil, yazımdan SONRA diskten
     * yeniden okunmuş pencere (bkz. applyDeltaFromLocal). Sebebi alan kaybı:
     * sunucu kopyası `clientMessageId` ve `_localUri` taşımıyor, disk ise
     * ikisini COALESCE ile koruyor. Ham payload'ı yazmak gönderdiğimiz sesin
     * yerel dosyasını düşürürdü (balon imzalı link istemeye başlar) ve
     * keyExtractor'ın cmid'ini değiştirirdi.
     *
     * ── Merge, REPLACE değil ────────────────────────────────────────────────
     * Bucket'ta yüklü 2.+ sayfalar (`tail`) olabilir; pencereyi körlemesine
     * yazmak onları silerdi (fetchHistory'nin reconcile dalındaki aynı yara).
     * Eşleşen satır güncellenir, yeni satır sıraya girer, KUYRUK KORUNUR.
     *
     * Bucket'ı OLMAYAN sohbet atlanıyor: orayı açılışta hydrateConversation
     * zaten diskten okuyor, burada bucket yaratmak sıcak pencere mantığını
     * ikinci bir yere kopyalamak olurdu.
     */
    applyLocalDelta: (
      state,
      action: PayloadAction<{
        /** Diskten yeniden okunmuş liste satırları (dokunulanlar). */
        conversations: ConversationListItemDto[];
        /** conversationId → diskten yeniden okunmuş sıcak pencere. */
        windowsByConv: Record<string, MessageDto[]>;
        /** Pencerenin DIŞINDA kalan satırlar için silme tombstone'ları. */
        deletions: {
          messageId: string;
          conversationId: string;
          deletedAt: string;
          deletedForEveryone: boolean;
        }[];
        removedConversationIds: string[];
      }>,
    ) => {
      const { conversations, windowsByConv, deletions, removedConversationIds } =
        action.payload;

      if (removedConversationIds?.length) {
        const gone = new Set(removedConversationIds);
        state.conversations = state.conversations.filter(
          (c) => !gone.has(c.conversationId),
        );
        for (const id of gone) delete state.messagesByConv[id];
      }

      for (const conversationId in windowsByConv ?? {}) {
        const bucket = state.messagesByConv[conversationId];
        const incoming = windowsByConv[conversationId];
        if (!bucket || !incoming?.length) continue;
        // Review turu 2, Önemli 4'ün kapanışı — `receiveMessage`deki AYNI
        // kural burada da geçerli: bucket PENCERELİYSE (hedef-etrafı, bkz.
        // MessageBucket.isWindowed) delta turunun EN YENİ sayfası (arşivin
        // DİBİ, `chatHydrate.applyDeltaFromLocal`in okuduğu) bu bucket'a
        // MERGE EDİLMİYOR. Mesaj ZATEN DİSKE indi — bu reducer'ın GÖREVİ
        // disk→ekran yansıtması, disk yazımı/watermark ilerlemesi bundan
        // TAMAMEN BAĞIMSIZ (chatDeltaSync.ts'in `run()`u `applyPage`+
        // `setSyncWatermark`i BU dispatch'ten ÖNCE ve ondan HİÇ ETKİLENMEDEN
        // tamamlıyor) — yani burada atlamak hiçbir turu KAYBETMİYOR, yalnız
        // o turun EKRANA yansımasını `hydrateConversation`in ("son mesaja
        // dön" / taze giriş) bir sonraki hot-window okumasına BIRAKIYOR.
        if (bucket.isWindowed) continue;
        mergeLocalWindow(bucket, incoming);
      }

      // Pencere dışındaki silmeler: yukarıdaki merge yalnız diskten okunan 60
      // satırı kapsıyor, derine kaydırılmış bir bucket'ta daha eski bir mesaj
      // silinmiş olabilir. Tombstone semantiği messageDeleted ile birebir.
      for (const d of deletions ?? []) {
        const bucket = state.messagesByConv[d.conversationId];
        if (!bucket) continue;
        const idx = bucket.messages.findIndex((m) => m.id === d.messageId);
        if (idx < 0) continue;
        const msg = bucket.messages[idx];
        if (msg.deletedAt) continue;
        bucket.messages[idx] = {
          ...msg,
          deletedAt: d.deletedAt,
          deletedForEveryone: d.deletedForEveryone,
          content: d.deletedForEveryone ? '' : msg.content,
          mediaUrl: d.deletedForEveryone ? null : msg.mediaUrl,
        };
      }

      if (conversations?.length) {
        const byId = new Map(state.conversations.map((c) => [c.conversationId, c]));
        for (const fresh of conversations) {
          const prev = byId.get(fresh.conversationId);
          // partnerIsOnline diskte YOK (presence volatil, kolonu bile yok) —
          // mevcut satırdan taşınmazsa hub'ın yazdığı "online" silinirdi.
          byId.set(fresh.conversationId, {
            ...fresh,
            partnerIsOnline: prev?.partnerIsOnline ?? false,
          });
        }
        // Sıra tek kurala bağlı: en yeni mesaj en üstte (readConversations ile
        // aynı). Yeni satırlar da (ilk mesaj, yeni eşleşme) böylece yerine
        // oturuyor.
        state.conversations = Array.from(byId.values()).sort(
          (a, b) => utcTime(b.lastMessageAt) - utcTime(a.lastMessageAt),
        );
        state.unreadTotal = state.conversations.reduce(
          (sum, c) => sum + (c.unreadCount || 0),
          0,
        );
      }
    },

    /**
     * SQLite'tan gelen SICAK PENCERE — local-first okuma yolunun girişi.
     *
     * fetchHistory.fulfilled'ın reconcile merge'ine KASTEN dokunmuyor: o
     * algoritma tests/features/chat/chatSlice.history.test.ts ile kilitli ve
     * göç boyunca aynen yaşamalı. Bu AYRI bir yol — kaynağı ağ değil disk.
     *
     * Dizi referansı: `messages` zaten messageCache.projectWindow'dan geliyor,
     * yani hiçbir şey değişmediyse ÖNCEKİYLE AYNI referans. Immer aynı değerin
     * atanmasını değişiklik saymıyor (set trap `is()` ile kısa devre yapıyor),
     * dolayısıyla no-op hydrate state'i hiç kirletmiyor → messagesWithSeparators
     * useMemo'su çalışmıyor → LegendList uyanmıyor.
     */
    hydrateWindow: (
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: MessageDto[];
        nextCursor: string | null;
        hasMore: boolean;
        hasHiddenHistory: boolean;
        /**
         * Faz 4 — bu pencere hedef-etrafı mı (bkz. MessageBucket.isWindowed).
         * BİLEREK OPSİYONEL DEĞİL DAVRANIŞ OLARAK varsayılan: verilmezse
         * `false`a DÜŞER (`!!undefined`) — yani `hydrateConversation`in normal
         * hot-window çağrıları bu alanı hiç geçmeden önceki pencereli bayrağı
         * TEMİZLER. "Sohbete taze girmek flag'i temizler" kuralı burada,
         * çağıranın ayrıca bir "clear" action'ı çağırmasına GEREK YOK.
         */
        isWindowed?: boolean;
      }>,
    ) => {
      const { conversationId, messages, nextCursor, hasMore, hasHiddenHistory, isWindowed } =
        action.payload;
      const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
      bucket.messages = messages;
      bucket.nextCursor = nextCursor;
      bucket.hasMore = hasMore;
      bucket.hasHiddenHistory = hasHiddenHistory;
      bucket.loading = false;
      bucket.isWindowed = !!isWindowed;
      state.messagesByConv[conversationId] = bucket;
    },

    /**
     * Yukarı kaydırmada YEREL'den gelen eski sayfa (ağ yok).
     *
     * Semantiği fetchHistory'nin `append` dalıyla birebir aynı: id-dedupe +
     * kuyruğa ekleme (liste newest-first, eskiler SONA gider).
     *
     * `loading`'e DOKUNMUYOR ve bu kritik: o bayrak retry timer'larını ve giriş
     * skeleton'ını kapılıyor (ChatScreen.tsx:829, :844). Yerel okuma zaten
     * senkron bitmiş durumda — "yükleniyor" demek ekranda sahte bir durum
     * yaratır ve prepend guard'larını yanıltır.
     */
    prependOlderFromLocal: (
      state,
      action: PayloadAction<{ conversationId: string; messages: MessageDto[] }>,
    ) => {
      const { conversationId, messages } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket || !messages.length) return;
      const existing = new Set(bucket.messages.map((m) => m.id));
      const fresh = messages.filter((m) => !existing.has(m.id));
      if (!fresh.length) return;
      bucket.messages = [...bucket.messages, ...fresh];
    },

    /**
     * Geçmiş GERÇEKTEN bitti: ne diskte daha eski satır var ne de sunucuda
     * (cursor yok).
     *
     * Şart, çünkü `hasMore` yukarı kaydırmanın tekrar-dene zamanlayıcısını
     * besliyor (ChatScreen.tsx:893). Yerel tükenip cursor da yokken bayrak
     * açık kalırsa timer 450 ms'de bir sonsuza kadar boş yere tetiklenir.
     */
    setHistoryExhausted: (state, action: PayloadAction<string>) => {
      const bucket = state.messagesByConv[action.payload];
      if (!bucket) return;
      bucket.hasMore = false;
      bucket.nextCursor = null;
    },

    receiveMessage: (state, action: PayloadAction<MessageDto & { _selfUserId?: string }>) => {
      const msg = action.payload;
      const selfUserId = msg._selfUserId;
      const bucket = state.messagesByConv[msg.conversationId] ?? emptyBucket();

      const isOwn = !!selfUserId && msg.senderId === selfUserId;

      // Mesaj geldiyse gönderen yazmayı bitirmiştir: göstergeyi bekletmeden
      // düşür. Gönderenin `StopTyping`i çoğu zaman mesajla aynı anda gelir ama
      // sırası garanti değil; bu olmadan balon mesajın altında bir an daha
      // "yazıyor..." kalıyordu (bkz. typingExpiry).
      if (!isOwn && msg.senderId) {
        const typing = state.typingByConv[msg.conversationId];
        if (typing) delete typing[msg.senderId];
      }

      if (msg.clientMessageId) {
        const idx = bucket.messages.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        if (idx >= 0) {
          bucket.messages[idx] = { ...bucket.messages[idx], ...msg, _pending: false };
          state.messagesByConv[msg.conversationId] = bucket;
          updateConversationLastMessage(state, msg);
          if (isOwn) markConversationReadLocally(state, msg.conversationId);
          return;
        }
      }

      if (bucket.messages.some((m) => m.id === msg.id)) return;

      // Pencereli bucket'ta BASTIRILIYOR — kapı ve gerekçesi tek yerde,
      // `prependToBucket`ta (mesaj zaten diskte; mirror middleware ayrı bir
      // yoldan yazıyor).
      prependToBucket(bucket, msg, 'remote');
      state.messagesByConv[msg.conversationId] = bucket;
      updateConversationLastMessage(state, msg);

      if (isOwn) {
        markConversationReadLocally(state, msg.conversationId);
        return;
      }
      // Karşı tarafın mesajı da kotadan düşer (sistem mesajı düşmez — backend
      // onu saymıyor). Kendi mesajımız gönderim anında düşülmüştü (echo yukarıda
      // isOwn ile çıktı), çift sayım yok.
      if (!msg.isSystemMessage) consumeQuotaLocally(state, msg.conversationId);
      const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
      if (conv && !msg.isSystemMessage && state.activeConversationId !== msg.conversationId) {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
        state.unreadTotal += 1;
      }
    },

    messageSent: (state, action: PayloadAction<MessageDto>) => {
      const msg = action.payload;
      const bucket = state.messagesByConv[msg.conversationId];
      if (!bucket) return;

      // MessageSent yalnız KENDİ gönderimimizin ack'i — sohbet okunmuş sayılır.
      markConversationReadLocally(state, msg.conversationId);

      if (msg.clientMessageId) {
        const idx = bucket.messages.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        if (idx >= 0) {
          bucket.messages[idx] = { ...bucket.messages[idx], ...msg, _pending: false };
          updateConversationLastMessage(state, msg);
          return;
        }
      }
      if (!bucket.messages.some((m) => m.id === msg.id)) {
        // `origin: 'remote'` — bu reducer'ın İKİ dispatch yeri de ekranın
        // gönderim yolunun (`appendOutgoing`) DIŞINDA: `outbox.ts`in gönderim
        // ack'i ve hub'ın `MessageSent` event'i (kendi mesajın başka bir
        // cihazdan). İkisinde de kullanıcı "şimdi buradayım" demedi, yani
        // pencereli bir bucket'ta bastırılması DOĞRU (bkz. prependToBucket).
        // Pencere açıkken kullanıcının KENDİ yazdığı bir mesaj buraya
        // gelemez: `appendOutgoing` optimistic balonu eklemeden önce hot
        // window'a dönüyor, dolayısıyla yukarıdaki `clientMessageId` araması
        // o balonu BULUR ve bu dala hiç düşmez.
        prependToBucket(bucket, msg, 'remote');
        updateConversationLastMessage(state, msg);
      }
    },

    messagesRead: (
      state,
      action: PayloadAction<{
        conversationId: string;
        readByUserId: string;
        lastReadSentAt?: string;
        readAt?: string;
        _selfUserId?: string;
      }>
    ) => {
      const { conversationId, readByUserId, lastReadSentAt, readAt, _selfUserId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;

      bucket.messages = bucket.messages.map((m) => {
        if (
          m.senderId !== readByUserId &&
          m.senderId != null &&
          !m.readAt &&
          // utcTime: persist'ten rehydrate olan ESKİ kayıtlar Z'siz olabilir;
          // taze payload Z'li gelir — çıplak karşılaştırma 3 saatlik yanlış
          // pencere üretip mesajları hatalı okundu işaretlerdi.
          (!lastReadSentAt || utcTime(m.sentAt) <= utcTime(lastReadSentAt))
        ) {
          return { ...m, readAt: readAt || new Date().toISOString() };
        }
        return m;
      });

      if (_selfUserId && readByUserId === _selfUserId) {
        const conv = state.conversations.find((c) => c.conversationId === conversationId);
        if (conv && conv.unreadCount > 0) {
          state.unreadTotal = Math.max(0, state.unreadTotal - conv.unreadCount);
          conv.unreadCount = 0;
        }
      }
    },

    clearUnreadForConversation: (state, action: PayloadAction<string>) => {
      const convId = action.payload;
      const conv = state.conversations.find((c) => c.conversationId === convId);
      if (conv && conv.unreadCount > 0) {
        state.unreadTotal = Math.max(0, state.unreadTotal - conv.unreadCount);
        conv.unreadCount = 0;
      }
    },

    messageDelivered: (
      state,
      action: PayloadAction<{ messageId: string; conversationId: string; deliveredAt: string }>
    ) => {
      const { messageId, conversationId, deliveredAt } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const m = bucket.messages.find((x) => x.id === messageId);
      if (m && !m.deliveredAt) m.deliveredAt = deliveredAt;
    },

    // AppNavigator, ardışık MessageDelivered push'larını ~50ms tamponlayıp tek
    // dispatch'e indiriyor (mount anındaki delivered-ack fırtınasında N array-rebuild
    // yerine 1). Her batch item'ı idempotent uygulanır.
    messagesDeliveredBatch: (
      state,
      action: PayloadAction<{ messageId: string; conversationId: string; deliveredAt: string }[]>
    ) => {
      // Bucket başına tek geçişte id→mesaj indeksi kur — item başına find
      // (O(n·m)) yerine O(n+m). Mount fırtınasında batch yüzlerce ack taşıyabilir.
      const indexByConv = new Map<string, Map<string, MessageDto>>();
      for (const { messageId, conversationId, deliveredAt } of action.payload) {
        const bucket = state.messagesByConv[conversationId];
        if (!bucket) continue;
        let byId = indexByConv.get(conversationId);
        if (!byId) {
          byId = new Map(bucket.messages.map((x) => [x.id, x]));
          indexByConv.set(conversationId, byId);
        }
        const m = byId.get(messageId);
        if (m && !m.deliveredAt) m.deliveredAt = deliveredAt;
      }
    },

    messageEdited: (state, action: PayloadAction<MessageDto>) => {
      const msg = action.payload;
      const bucket = state.messagesByConv[msg.conversationId];
      if (!bucket) return;
      const idx = bucket.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) bucket.messages[idx] = { ...bucket.messages[idx], ...msg };
    },

    messageDeleted: (
      state,
      action: PayloadAction<{
        messageId: string;
        conversationId: string;
        forEveryone: boolean;
        deletedAt: string;
      }>
    ) => {
      const { messageId, conversationId, forEveryone, deletedAt } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const idx = bucket.messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) {
        const msg = bucket.messages[idx];
        bucket.messages[idx] = {
          ...msg,
          deletedAt,
          deletedForEveryone: forEveryone,
          content: forEveryone ? '' : msg.content,
          mediaUrl: forEveryone ? null : msg.mediaUrl,
        };
      }
    },

    reactionsChanged: (
      state,
      action: PayloadAction<{ messageId: string; conversationId: string; reactions: any[] }>
    ) => {
      const { messageId, conversationId, reactions } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const idx = bucket.messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) bucket.messages[idx].reactions = reactions || [];
    },

    userStartedTyping: (state, action: PayloadAction<{ conversationId: string; userId: string }>) => {
      const { conversationId, userId } = action.payload;
      if (!state.typingByConv[conversationId]) state.typingByConv[conversationId] = {};
      state.typingByConv[conversationId][userId] = Date.now();
    },
    userStoppedTyping: (state, action: PayloadAction<{ conversationId: string; userId: string }>) => {
      const { conversationId, userId } = action.payload;
      if (state.typingByConv[conversationId]) {
        delete state.typingByConv[conversationId][userId];
      }
    },
    // Reconnect / foreground: kopukluk penceresinde `UserStoppedTyping`
    // kaçmış olabilir (hub replay yapmıyor). Eldeki her "yazıyor" bayat
    // sayılır; hâlâ yazan varsa heartbeat'i birkaç saniyede geri getirir.
    clearAllTyping: (state) => {
      state.typingByConv = {};
    },

    userStatusChanged: (
      state,
      action: PayloadAction<{ userId: string; isOnline: boolean; lastSeen?: string }>
    ) => {
      const { userId, isOnline, lastSeen } = action.payload;
      state.presenceByUser[userId] = { isOnline, lastSeen: lastSeen ?? null };
      const conv = state.conversations.find((c) => c.partnerUserId === userId);
      if (conv) conv.partnerIsOnline = isOnline;
    },
    userStatusResponse: (state, action: PayloadAction<{ userId: string; isOnline: boolean }>) => {
      const { userId, isOnline } = action.payload;
      state.presenceByUser[userId] = { isOnline, lastSeen: null };
    },

    matchNotification: (
      state,
      action: PayloadAction<{
        conversationId?: string;
        matchId?: string;
        matchedUserId: string;
        matchedUserName: string;
        matchedUserPhoto?: string;
        matchedAt: string;
      }>
    ) => {
      const m = action.payload;
      if (!m.conversationId) return;
      if (state.conversations.find((c) => c.conversationId === m.conversationId)) return;
      state.conversations.unshift({
        conversationId: m.conversationId,
        matchId: m.matchId,
        partnerUserId: m.matchedUserId,
        partnerDisplayName: m.matchedUserName,
        partnerProfileImageUrl: m.matchedUserPhoto,
        lastMessagePreview: null,
        lastMessageAt: m.matchedAt,
        unreadCount: 0,
        isActive: true,
        partnerIsOnline: false,
      });
    },

    // Sohbet kapandı. İki kaynaktan gelir:
    //   • ConversationDeactivated hub event'i (karşı taraf unmatch etti),
    //   • kapalı sohbete gönderim denemesinde düşen Error{CONVERSATION_ERROR}
    //     (event kaçarsa / offline'dan dönüşte tek anlık sinyal budur).
    // Her iki halde listeyi ve asılı kalan balonları YEREL düzeltiyoruz; force
    // refetch ayrıca atılır ama cevabı düşene kadar UI yalan söylemesin.
    //
    // restorableUntil: unmatch YANITINDAN gelir (kendi unmatch'imiz). Karşı
    // tarafın unmatch'inde gelmez — geri alma zaten yalnız unmatch edene açık.
    //
    // byMe: "Geri Al"ın TEK kapısı. Kapatanın kim olduğunu sunucu liste DTO'sunda
    // söylemediği için, kendi unmatch'imizde bunu istemcide damgalıyoruz; hub
    // event'i / gönderim reddi gibi karşı taraf kaynaklı yollar byMe GEÇMEZ →
    // bayrak false'a düşer ve buton o uçta hiç çıkmaz. Damgaya bakmak yetmiyordu:
    // karşı taraf event'i kaçırıp uygulamayı yeniden açtığında restorableUntil
    // `undefined` (bilinmiyor) oluyor ve buton ona da görünüyordu.
    conversationDeactivated: (
      state,
      action: PayloadAction<{
        conversationId: string;
        restorableUntil?: string | null;
        byMe?: boolean;
      }>
    ) => {
      const { conversationId, restorableUntil, byMe } = action.payload;
      const conv = state.conversations.find((c) => c.conversationId === conversationId);
      if (conv) {
        conv.isActive = false;
        if (restorableUntil !== undefined) conv.restorableUntil = restorableUntil;
        conv.deactivatedByMe = byMe === true;
      }
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      // "Gönderiliyor"da asılı balonlar: ack asla gelmeyecek → başarısıza çevir.
      bucket.messages = bucket.messages.map((m) =>
        m._pending ? { ...m, _pending: false, _failed: true } : m,
      );
    },

    // Geri alma penceresi kullanıldı (kendi restore'umuz ya da karşı
    // tarafın ConversationRestored event'i). Sohbet hiç kesintiye uğramamış gibi
    // döner — geçmiş kapısı YOK, restorableUntil tüketilmiştir.
    conversationRestored: (state, action: PayloadAction<{ conversationId: string }>) => {
      const conv = state.conversations.find(
        (c) => c.conversationId === action.payload.conversationId,
      );
      if (!conv) return;
      conv.isActive = true;
      conv.restorableUntil = null;
      conv.deactivatedByMe = false;
    },

    // "Eski sohbeti göster" açıldı — kendi reveal'imiz ya da karşı tarafın
    // ConversationHistoryRevealed event'i. Kapıyı ANINDA kapatıyoruz; gizli
    // mesajlar history refetch'iyle gelir (ChatScreen/AppNavigator tetikler).
    historyRevealed: (state, action: PayloadAction<{ conversationId: string }>) => {
      const bucket = state.messagesByConv[action.payload.conversationId];
      if (bucket) bucket.hasHiddenHistory = false;
    },

    decrementQuotaLocally: (state, action: PayloadAction<{ conversationId: string }>) => {
      const convId = action.payload?.conversationId;
      if (!convId) return;
      consumeQuotaLocally(state, convId);
    },

    appendOptimisticMessage: (
      state,
      action: PayloadAction<{ conversationId: string; message: MessageDto }>
    ) => {
      const { conversationId, message } = action.payload;
      const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
      // `origin: 'localSend'` — ASLA bastırılmıyor (bkz. prependToBucket).
      // Pencereyi temizleme işi çağıranda: `ChatScreen.appendOutgoing` bu
      // dispatch'ten ÖNCE `hydrateConversation` çağırıyor.
      prependToBucket(bucket, message, 'localSend');
      state.messagesByConv[conversationId] = bucket;
      updateConversationLastMessage(state, message);
      markConversationReadLocally(state, conversationId);
    },

    failOptimisticMessage: (
      state,
      action: PayloadAction<{ conversationId: string; clientMessageId: string }>
    ) => {
      const { conversationId, clientMessageId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const m = bucket.messages.find((x) => x.clientMessageId === clientMessageId);
      if (m) m._failed = true;
    },

    /**
     * Yeniden gönderim — balon YERİNDE "tekrar bekliyor" durumuna döner.
     *
     * Eski yol (removeOptimisticMessage + yeniden append) satırı REMOUNT
     * ediyordu: yeniden-gönder butonu bir anda yok olup balon sağa ışınlanıyor,
     * hata dönünce yine bir anda sola atlıyordu — kayma animasyonu (bkz.
     * MessageBubble > failAnim) çalışacak satırı bulamıyordu. Üstelik satır
     * listenin en altına taşınıyor ve yalnız optimistic kopyada duran alanlar
     * (_localUri gibi) yeniden kurulmak zorunda kalıyordu.
     */
    retryOptimisticMessage: (
      state,
      action: PayloadAction<{ conversationId: string; clientMessageId: string }>
    ) => {
      const { conversationId, clientMessageId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const m = bucket.messages.find((x) => x.clientMessageId === clientMessageId);
      if (m) {
        m._failed = false;
        m._pending = true;
      }
    },

    removeOptimisticMessage: (
      state,
      action: PayloadAction<{ conversationId: string; clientMessageId: string }>
    ) => {
      const { conversationId, clientMessageId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      bucket.messages = bucket.messages.filter((m) => m.clientMessageId !== clientMessageId);
    },

    resetChat: () => initialState,
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.conversationsLoading = true;
        state.conversationsError = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.conversationsLoading = false;
        // Staleness gate + AppNavigator whenBootSettled bu damgayı okur.
        // (Tip'te öteden beri vardı ama hiç yazılmıyordu — boot-settle hep
        // 3.5s timeout'a düşüyordu.)
        state._conversationsFetchedAt = Date.now();
        const merged = action.payload.map((serverConv) => {
          const localConv = state.conversations.find(
            (c) => c.conversationId === serverConv.conversationId,
          );
          if (!localConv) return serverConv;
          const localTime = localConv.lastMessageAt ? utcTime(localConv.lastMessageAt) : 0;
          const serverTime = serverConv.lastMessageAt ? utcTime(serverConv.lastMessageAt) : 0;
          let next = serverConv;
          if (localTime > serverTime) {
            next = {
              ...serverConv,
              lastMessagePreview: localConv.lastMessagePreview,
              lastMessageAt: localConv.lastMessageAt,
              lastMessageContentType: localConv.lastMessageContentType,
            };
          }
          // Okundu bilgisinde YEREL kazanabilir. Sohbete girerken markRead ile
          // /conversations aynı anda uçuyor: yanıt bizden ÖNCEKİ (bayat) sayacı
          // taşıyorsa körlemesine yazmak, az önce okunan — hatta cevap yazdığımız —
          // sohbeti tekrar "okunmamış" gösteriyordu. Yerel 0'a ancak server BİZİM
          // BİLMEDİĞİMİZ daha yeni bir mesaj taşıyorsa dokunuyoruz; açık olan
          // sohbet ise her hâlükârda okunmuş sayılır.
          if (
            (next.unreadCount || 0) > 0 &&
            (state.activeConversationId === next.conversationId ||
              ((localConv.unreadCount || 0) === 0 && serverTime <= localTime))
          ) {
            next = { ...next, unreadCount: 0 };
          }
          // Geri alma penceresi unmatch YANITINDAN geliyor; liste DTO'su bu alanı
          // taşımayabiliyor. Alan gelmiyorsa (undefined) yereli koru — yoksa
          // unmatch'in hemen ardından attığımız force refetch pencereyi silip
          // "geri al" butonunu daha ilk saniyede kaybettiriyordu. Server AÇIKÇA
          // null derse (pencere kapandı) server kazanır.
          if (next.restorableUntil === undefined && localConv.restorableUntil != null) {
            next = { ...next, restorableUntil: localConv.restorableUntil };
          }
          // "Kapatan biz miyiz" bilgisi SUNUCUDA YOK — server objesi bu alanı
          // hiç taşımıyor, taşımadığı için de her fetch'te bayrağı silerdi.
          // Sohbet hâlâ kapalıyken yereli koru; server yeniden aktif gösteriyorsa
          // (restore / rematch) bayrak zaten anlamını yitirir.
          if (!next.isActive && localConv.deactivatedByMe !== undefined) {
            next = { ...next, deactivatedByMe: localConv.deactivatedByMe };
          }
          return next;
        });
        state.conversations = merged;
        state.unreadTotal = merged.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        merged.forEach((c) => {
          if (c.partnerUserId) {
            state.presenceByUser[c.partnerUserId] = { isOnline: !!c.partnerIsOnline, lastSeen: null };
          }
        });
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.conversationsLoading = false;
        state.conversationsError = action.payload as string;
      })
      .addCase(fetchHistory.pending, (state, action) => {
        const { conversationId } = action.meta.arg;
        const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
        bucket.loading = true;
        state.messagesByConv[conversationId] = bucket;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        const { conversationId, messages, nextCursor, hasMore, append, hasHiddenHistory } =
          action.payload as any;
        const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
        // Server-authoritative: rematch kapısı her sayfada aynı cevabı taşır.
        // Alanı hiç göndermeyen (eski) backend'de false kalır → kapı çıkmaz.
        bucket.hasHiddenHistory = !!hasHiddenHistory;
        if (append) {
          const existing = new Set(bucket.messages.map((m) => m.id));
          bucket.messages = [...bucket.messages, ...messages.filter((m: MessageDto) => !existing.has(m.id))];
          bucket.nextCursor = nextCursor;
          bucket.hasMore = hasMore;
        } else {
          // Review turu 3, Önemli — bu dal HER ZAMAN `cursor:null` (arşivin EN
          // YENİ sayfası) çekiyor, `append` dalının aksine. Pencereli (hedefli
          // atlama) bir bucket'a bu sayfa gelirse (mid-archive pencereyle
          // ÇAKIŞMADIĞI için aşağıdaki `windowsOverlap` false çıkar, `tail` boş
          // kalır ve `next` SADECE server'ın en yeni sayfası olur) bucket ARTIK
          // hot window gösteriyor ama `isWindowed` hâlâ `true` kalıyordu —
          // `receiveMessage`/`applyLocalDelta` o bucket'ı SONSUZA DEK canlı
          // mesajlara kapalı tutardı, kullanıcı en güncel görünümdeyken bile.
          // `hydrateConversation`in `isWindowed:false` yazdığı AYNI gerekçe
          // burada da geçerli: bu da arşivin dibini gösteren bir pencere.
          bucket.isWindowed = false;
          // Reconcile MERGE — körlemesine REPLACE değil. REPLACE her chat girişinde
          // tüm mesaj referanslarını yenileyip (LegendList "structural data change"
          // → tam container reset) yüklenmiş 2.+ sayfaları atıyordu; kullanıcı o
          // sırada eski mesajlara bakıyorsa balonlar silinip geri geliyordu.
          const old = bucket.messages;
          const oldById = new Map<string, MessageDto>();
          const oldByClientId = new Map<string, MessageDto>();
          for (const m of old) {
            if (m.id) oldById.set(m.id, m);
            if (m.clientMessageId) oldByClientId.set(m.clientMessageId, m);
          }

          // Server penceresi server-authoritative: alan farkı varsa server kopyası
          // kazanır (kaçan edit/delete/receipt düzelir); alanlar eşitse ESKİ referans
          // korunur. clientMessageId'yi kaybetme — keyExtractor ona bakıyor; düşerse
          // item key'i değişir, MVCP çapası ve container'ı gider.
          const merged = (messages as MessageDto[]).map((sm) => {
            const om =
              oldById.get(sm.id) ??
              (sm.clientMessageId ? oldByClientId.get(sm.clientMessageId) : undefined);
            if (!om) return sm;
            const withClientId =
              om.clientMessageId && !sm.clientMessageId
                ? { ...sm, clientMessageId: om.clientMessageId }
                : sm;
            return messageContentEqual(om, withClientId) ? om : withClientId;
          });

          // Kuyruk (önceden yüklenmiş 2.+ sayfalar) yalnız pencereler ÇAKIŞIYORSA
          // korunur: server sayfasının en eski mesajı bucket'ta yoksa arada cursor'ın
          // dolduramayacağı delik oluşur — o durumda eski REPLACE davranışına düş.
          const serverIds = new Set(merged.map((m) => m.id));
          const oldestServer = messages.length
            ? (messages[messages.length - 1] as MessageDto)
            : null;
          const windowsOverlap = !!oldestServer && oldById.has(oldestServer.id);
          let tail: MessageDto[] = [];
          if (windowsOverlap) {
            const oldestT = utcTime(oldestServer!.sentAt);
            tail = old.filter(
              (m) =>
                !m._pending &&
                !serverIds.has(m.id) &&
                utcTime(m.sentAt) < oldestT,
            );
          }

          // Optimistic'ler: server cevabında karşılığı olanlar merge'e girdi; henüz
          // dönmemiş olanlar en başta (en yeni uç) kalır.
          const serverClientIds = new Set(
            (messages as MessageDto[]).map((m) => m.clientMessageId).filter(Boolean),
          );
          const pendingTop = old.filter(
            (m) =>
              m._pending &&
              !serverIds.has(m.id) &&
              !(m.clientMessageId && serverClientIds.has(m.clientMessageId)),
          );

          const next = [...pendingTop, ...merged, ...tail];
          // Hiçbir şey değişmediyse array identity'yi de koru: selector aynı referansı
          // döner → messagesWithSeparators useMemo hiç çalışmaz → LegendList uyanmaz.
          // (Tekrar girişteki reconcile'ın en yaygın sonucu tam da budur.)
          const unchanged =
            next.length === old.length && next.every((m, i) => m === old[i]);
          if (!unchanged) bucket.messages = next;

          if (tail.length > 0 && bucket.nextCursor) {
            // Derin sayfalama durumu: kuyruk + geçerli derin cursor aynen kalır;
            // server'ın sayfa-1 cursor'ını yazmak kuyruğu yeniden indirtirdi.
          } else {
            // Kuyruk yok ya da cursor null (persist transform null'lar) — server'ın
            // cursor'ı ile onar; kuyrukla overlap zararsız, append dalı id-dedupe'lu.
            bucket.nextCursor = nextCursor;
            bucket.hasMore = hasMore;
          }
        }
        bucket.loading = false;
        state.messagesByConv[conversationId] = bucket;
      })
      .addCase(fetchHistory.rejected, (state, action) => {
        const convId = action.meta.arg.conversationId;
        const bucket = state.messagesByConv[convId];
        if (bucket) bucket.loading = false;
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadTotal = action.payload;
      })
      .addCase(fetchChatQuota.fulfilled, (state, action) => {
        const { conversationId, status } = action.payload;
        const next = normalizeQuota(status);
        const prev = state.quotaByConv[conversationId];
        // İçerik değişmediyse quotaByConv referansı korunur; fetch damgası
        // ayrı map'te tutulur (bkz. ChatQuotaMeta — cascade önlemi).
        const changed =
          !prev ||
          prev.isUnlimited !== next.isUnlimited ||
          prev.hasPremiumParticipant !== next.hasPremiumParticipant ||
          prev.isUnlocked !== next.isUnlocked ||
          prev.messageCount !== next.messageCount ||
          prev.freeMessageLimit !== next.freeMessageLimit ||
          prev.remainingMessages !== next.remainingMessages ||
          prev.requiresPremium !== next.requiresPremium;
        if (changed) state.quotaByConv[conversationId] = next;
        state.quotaMetaByConv[conversationId] = {
          fetchedAt: Date.now(),
          inFlight: false,
        };
      });
  },
});

export const {
  setActiveConversation,
  applyLocalDelta,
  hydrateConversations,
  hydrateWindow,
  prependOlderFromLocal,
  setHistoryExhausted,
  receiveMessage,
  messageSent,
  messagesRead,
  clearUnreadForConversation,
  messageDelivered,
  messagesDeliveredBatch,
  messageEdited,
  messageDeleted,
  reactionsChanged,
  userStartedTyping,
  userStoppedTyping,
  clearAllTyping,
  userStatusChanged,
  userStatusResponse,
  matchNotification,
  conversationDeactivated,
  conversationRestored,
  historyRevealed,
  appendOptimisticMessage,
  failOptimisticMessage,
  retryOptimisticMessage,
  removeOptimisticMessage,
  resetChat,
  decrementQuotaLocally,
} = chatSlice.actions;

/**
 * Sekme rozetinin SAYISI — SEÇİLİ MODUN okunmamışları.
 *
 * Kaynak satırların kendisi, `unreadTotal` DEĞİL: o alan modsuz (sunucunun
 * toplamı + iyimser artış/azalışlar) ve Arkadaş modunda Flört mesajlarını da
 * sayardı — "rozet 3, sohbet 2" vakasının mod hâli. Satırlardan toplamak
 * güvenli, çünkü `/conversations` SAYFALANMIYOR: liste tamsa toplam da tam.
 *
 * MODU OLMAYAN satır (sunucu söylemiyor / yerel olarak açılmış) SAYILIYOR —
 * listede de görünüyor (bkz. MessagesScreen > modeConversations). İki yer aynı
 * kuralı paylaşmak zorunda, yoksa rozet listede olmayan bir mesajı sayar.
 *
 * Liste HENÜZ YOKSA (soğuk açılış, hydrate öncesi) `unreadTotal`a düşülüyor:
 * o değer `/unread-count?mode=` ile çekiliyor, yani o da mod kapsamlı.
 */
export const selectUnreadForMode = (state: any, mode: string): number => {
  const rows: ConversationListItemDto[] = state?.chat?.conversations ?? [];
  if (!rows.length) return state?.chat?.unreadTotal ?? 0;
  let total = 0;
  for (const c of rows) {
    if (c.mode && c.mode !== mode) continue;
    total += c.unreadCount || 0;
  }
  return total;
};

export default chatSlice.reducer;
