import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import chatService from '../../services/chatService';

/**
 * Chat slice — backend SignalR + REST kontratıyla uyumlu state.
 *
 * Shape:
 *   conversations: ConversationListItemDto[]
 *   conversationsLoading: bool, conversationsError: string?
 *   messagesByConv: { [convId]: { messages: MessageDto[], nextCursor, hasMore, loading } }
 *   typingByConv: { [convId]: { [userId]: timestamp } }
 *   presenceByUser: { [userId]: { isOnline, lastSeen } }
 *   unreadTotal: number
 *
 * Optimistic mesajlar: temp id (uuid) + clientMessageId ile insert; ReceiveMessage / MessageSent
 * geldiğinde reconcile (clientMessageId match → temp'i sil, real DTO'yu koy).
 */

// Async thunks
export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      return await chatService.getConversations();
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  }
);

export const fetchHistory = createAsyncThunk(
  'chat/fetchHistory',
  async ({ conversationId, cursor, pageSize = 30 }, { rejectWithValue }) => {
    try {
      const data = await chatService.getMessageHistory(conversationId, { cursor, pageSize });
      return { conversationId, ...data, append: !!cursor };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  }
);

export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  async () => chatService.getUnreadCount()
);

const initialState = {
  conversations: [],
  conversationsLoading: false,
  conversationsError: null,
  messagesByConv: {},
  typingByConv: {},
  presenceByUser: {},
  unreadTotal: 0,
  // Aktif sohbet — typing/read receipt scope kararı için (foreground/background ayrımı UI tarafında).
  activeConversationId: null,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setActiveConversation: (state, action) => {
      state.activeConversationId = action.payload;
    },

    // ============ SignalR event reducer'ları ============

    // ReceiveMessage event'i: yeni mesaj geldi.
    // Sender'ın diğer cihazlarına da gider — clientMessageId + senderId ile dedupe gerek.
    // Payload: { ...messageDto, _selfUserId } — UI bridge inject eder, multi-device correctness için.
    receiveMessage: (state, action) => {
      const msg = action.payload;
      const selfUserId = msg._selfUserId; // bridge tarafından inject
      const bucket = state.messagesByConv[msg.conversationId] ?? {
        messages: [],
        nextCursor: null,
        hasMore: false,
        loading: false,
      };

      // Optimistic reconcile: clientMessageId match'leniyorsa temp'i değiştir.
      if (msg.clientMessageId) {
        const idx = bucket.messages.findIndex(
          (m) => m.clientMessageId === msg.clientMessageId
        );
        if (idx >= 0) {
          bucket.messages[idx] = { ...bucket.messages[idx], ...msg, _pending: false };
          state.messagesByConv[msg.conversationId] = bucket;
          updateConversationLastMessage(state, msg);
          return;
        }
      }

      // Real ID dedupe (multi-device aynı mesajı 2 kez gönderirse).
      if (bucket.messages.some((m) => m.id === msg.id)) return;

      // En yeni mesaj listenin başında (inverted FlatList için).
      bucket.messages = [msg, ...bucket.messages];
      state.messagesByConv[msg.conversationId] = bucket;
      updateConversationLastMessage(state, msg);

      // Unread güncelle: SADECE partner mesajıysa + active conv değilse + system değilse.
      const isOwn = selfUserId && msg.senderId === selfUserId;
      const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
      if (
        conv
        && !isOwn
        && !msg.isSystemMessage
        && state.activeConversationId !== msg.conversationId
      ) {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
        state.unreadTotal += 1;
      }
    },

    // Sender ack — kendi gönderdiği mesajın server kalıcılaştırılmış DTO'su.
    messageSent: (state, action) => {
      const msg = action.payload;
      const bucket = state.messagesByConv[msg.conversationId];
      if (!bucket) return;

      if (msg.clientMessageId) {
        const idx = bucket.messages.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        if (idx >= 0) {
          bucket.messages[idx] = { ...bucket.messages[idx], ...msg, _pending: false };
          updateConversationLastMessage(state, msg);
          return;
        }
      }
      // ClientMessageId yoksa (örn. HTTP fallback) — id ile dedupe.
      if (!bucket.messages.some((m) => m.id === msg.id)) {
        bucket.messages = [msg, ...bucket.messages];
        updateConversationLastMessage(state, msg);
      }
    },

    // MessagesRead event — readByUserId hangi tarafın okuduğunu söyler.
    // Payload bridge tarafından _selfUserId ile zenginleştirilir.
    messagesRead: (state, action) => {
      const { conversationId, readByUserId, lastReadSentAt, readAt, _selfUserId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;

      // readByUserId !== self ise: partner okudu → KENDI mesajlarımı read işaretle.
      // readByUserId === self ise: ben okudum → partner mesajlarımı read işaretle (UI dedupe).
      bucket.messages = bucket.messages.map((m) => {
        if (
          m.senderId !== readByUserId
          && m.senderId != null
          && !m.readAt
          && (!lastReadSentAt || new Date(m.sentAt) <= new Date(lastReadSentAt))
        ) {
          return { ...m, readAt: readAt || new Date().toISOString() };
        }
        return m;
      });

      // Reader self ise unread sayacını sıfırla (ben okudum → bana gelen mesajlar artık okundu).
      if (_selfUserId && readByUserId === _selfUserId) {
        const conv = state.conversations.find((c) => c.conversationId === conversationId);
        if (conv && conv.unreadCount > 0) {
          state.unreadTotal = Math.max(0, state.unreadTotal - conv.unreadCount);
          conv.unreadCount = 0;
        }
      }
    },

    clearUnreadForConversation: (state, action) => {
      const convId = action.payload;
      const conv = state.conversations.find((c) => c.conversationId === convId);
      if (conv && conv.unreadCount > 0) {
        state.unreadTotal = Math.max(0, state.unreadTotal - conv.unreadCount);
        conv.unreadCount = 0;
      }
    },

    // MessageDelivered event — sender tarafında ✓✓.
    messageDelivered: (state, action) => {
      const { messageId, conversationId, deliveredAt } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const m = bucket.messages.find((x) => x.id === messageId);
      if (m && !m.deliveredAt) m.deliveredAt = deliveredAt;
    },

    // MessageEdited — full DTO geliyor.
    messageEdited: (state, action) => {
      const msg = action.payload;
      const bucket = state.messagesByConv[msg.conversationId];
      if (!bucket) return;
      const idx = bucket.messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) bucket.messages[idx] = { ...bucket.messages[idx], ...msg };
    },

    // MessageDeleted — content redact + flag set.
    messageDeleted: (state, action) => {
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

    // ReactionsChanged — full reactions list.
    reactionsChanged: (state, action) => {
      const { messageId, conversationId, reactions } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const idx = bucket.messages.findIndex((m) => m.id === messageId);
      if (idx >= 0) bucket.messages[idx].reactions = reactions || [];
    },

    // Typing
    userStartedTyping: (state, action) => {
      const { conversationId, userId } = action.payload;
      if (!state.typingByConv[conversationId]) state.typingByConv[conversationId] = {};
      state.typingByConv[conversationId][userId] = Date.now();
    },
    userStoppedTyping: (state, action) => {
      const { conversationId, userId } = action.payload;
      if (state.typingByConv[conversationId]) {
        delete state.typingByConv[conversationId][userId];
      }
    },

    // Presence
    userStatusChanged: (state, action) => {
      const { userId, isOnline, lastSeen } = action.payload;
      state.presenceByUser[userId] = { isOnline, lastSeen };
      // Conversation list'teki yeşil noktayı da güncelle.
      const conv = state.conversations.find((c) => c.partnerUserId === userId);
      if (conv) conv.partnerIsOnline = isOnline;
    },
    userStatusResponse: (state, action) => {
      const { userId, isOnline } = action.payload;
      state.presenceByUser[userId] = { isOnline, lastSeen: null };
    },

    // MatchNotification — yeni conversation oluştu, conv list'e ekle.
    matchNotification: (state, action) => {
      const m = action.payload;
      if (!m.conversationId) return;
      // Zaten mevcut conv mı?
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

    // ============ Optimistic UI helpers ============

    appendOptimisticMessage: (state, action) => {
      // payload: { conversationId, message: MessageDto-shape with _pending=true }
      const { conversationId, message } = action.payload;
      const bucket = state.messagesByConv[conversationId] ?? {
        messages: [],
        nextCursor: null,
        hasMore: false,
        loading: false,
      };
      bucket.messages = [message, ...bucket.messages];
      state.messagesByConv[conversationId] = bucket;
      updateConversationLastMessage(state, message);
    },

    failOptimisticMessage: (state, action) => {
      const { conversationId, clientMessageId } = action.payload;
      const bucket = state.messagesByConv[conversationId];
      if (!bucket) return;
      const m = bucket.messages.find((x) => x.clientMessageId === clientMessageId);
      if (m) m._failed = true;
    },

    removeOptimisticMessage: (state, action) => {
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
        state.conversations = action.payload;
        state.unreadTotal = action.payload.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        // Presence map'i de doldur (UI başlangıçta yeşil noktayı doğru gösterebilsin).
        action.payload.forEach((c) => {
          if (c.partnerUserId) {
            state.presenceByUser[c.partnerUserId] = {
              isOnline: !!c.partnerIsOnline,
              lastSeen: null,
            };
          }
        });
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.conversationsLoading = false;
        state.conversationsError = action.payload;
      })
      .addCase(fetchHistory.pending, (state, action) => {
        const { conversationId } = action.meta.arg;
        const bucket = state.messagesByConv[conversationId] ?? {
          messages: [],
          nextCursor: null,
          hasMore: false,
          loading: false,
        };
        bucket.loading = true;
        state.messagesByConv[conversationId] = bucket;
      })
      .addCase(fetchHistory.fulfilled, (state, action) => {
        const { conversationId, messages, nextCursor, hasMore, append } = action.payload;
        const bucket = state.messagesByConv[conversationId] ?? {
          messages: [],
          nextCursor: null,
          hasMore: false,
          loading: false,
        };
        // History en yeni → en eski sıralı; inverted FlatList için doğrudan kullan.
        if (append) {
          // Append eski mesajları aşağıya: dedup by id.
          const existing = new Set(bucket.messages.map((m) => m.id));
          const merged = [...bucket.messages, ...messages.filter((m) => !existing.has(m.id))];
          bucket.messages = merged;
        } else {
          // İlk yükleme — pending optimistic'leri başta tutmak için merge.
          const pendingTop = bucket.messages.filter((m) => m._pending);
          const incomingIds = new Set(messages.map((m) => m.id));
          const filteredPending = pendingTop.filter(
            (m) => !m.clientMessageId || ![...incomingIds].some(() => false)
          );
          bucket.messages = [...filteredPending, ...messages];
        }
        bucket.nextCursor = nextCursor;
        bucket.hasMore = hasMore;
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
      });
  },
});

// Yardımcı: ReceiveMessage / MessageSent geldiğinde conv list'in lastMessage alanlarını taze tut.
function updateConversationLastMessage(state, msg) {
  const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
  if (!conv) return;
  conv.lastMessagePreview = msg.content;
  conv.lastMessageAt = msg.sentAt;
  // List'i en başa al (LastMessageAt'e göre sıralı tutmak için).
  const idx = state.conversations.indexOf(conv);
  if (idx > 0) {
    state.conversations.splice(idx, 1);
    state.conversations.unshift(conv);
  }
}

export const {
  setActiveConversation,
  receiveMessage,
  messageSent,
  messagesRead,
  clearUnreadForConversation,
  messageDelivered,
  messageEdited,
  messageDeleted,
  reactionsChanged,
  userStartedTyping,
  userStoppedTyping,
  userStatusChanged,
  userStatusResponse,
  matchNotification,
  appendOptimisticMessage,
  failOptimisticMessage,
  removeOptimisticMessage,
  resetChat,
} = chatSlice.actions;

export default chatSlice.reducer;
