import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import chatService from '@/features/chat/chatService';
import { messageContentEqual } from '@/features/chat/messageEquality';
import { utcTime } from '@/shared/utils/dateUtc';
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
    { conversationId, cursor, pageSize = 30 }: { conversationId: string; cursor?: string; pageSize?: number },
    { rejectWithValue }
  ) => {
    try {
      const data = await chatService.getMessageHistory(conversationId, { cursor, pageSize });
      return { conversationId, ...data, append: !!cursor };
    } catch (e: any) {
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
  async () => chatService.getUnreadCount() as Promise<number>
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

function updateConversationLastMessage(state: ChatState, msg: MessageDto) {
  const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
  if (!conv) return;
  conv.lastMessagePreview = msg.content;
  conv.lastMessageAt = msg.sentAt;
  conv.lastMessageContentType = msg.contentType ?? 0;
  const idx = state.conversations.indexOf(conv);
  if (idx > 0) {
    state.conversations.splice(idx, 1);
    state.conversations.unshift(conv);
  }
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveConversation: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },

    receiveMessage: (state, action: PayloadAction<MessageDto & { _selfUserId?: string }>) => {
      const msg = action.payload;
      const selfUserId = msg._selfUserId;
      const bucket = state.messagesByConv[msg.conversationId] ?? emptyBucket();

      const isOwn = !!selfUserId && msg.senderId === selfUserId;

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

      bucket.messages = [msg, ...bucket.messages];
      state.messagesByConv[msg.conversationId] = bucket;
      updateConversationLastMessage(state, msg);

      if (isOwn) {
        markConversationReadLocally(state, msg.conversationId);
        return;
      }
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
        bucket.messages = [msg, ...bucket.messages];
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
    conversationDeactivated: (
      state,
      action: PayloadAction<{ conversationId: string; restorableUntil?: string | null }>
    ) => {
      const { conversationId, restorableUntil } = action.payload;
      const conv = state.conversations.find((c) => c.conversationId === conversationId);
      if (conv) {
        conv.isActive = false;
        if (restorableUntil !== undefined) conv.restorableUntil = restorableUntil;
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
    },

    appendOptimisticMessage: (
      state,
      action: PayloadAction<{ conversationId: string; message: MessageDto }>
    ) => {
      const { conversationId, message } = action.payload;
      const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
      bucket.messages = [message, ...bucket.messages];
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
  userStatusChanged,
  userStatusResponse,
  matchNotification,
  conversationDeactivated,
  conversationRestored,
  historyRevealed,
  appendOptimisticMessage,
  failOptimisticMessage,
  removeOptimisticMessage,
  resetChat,
  decrementQuotaLocally,
} = chatSlice.actions;

export default chatSlice.reducer;
