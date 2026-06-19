import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import chatService from '@/features/chat/chatService';
import type {
  ChatState,
  MessageDto,
  ConversationListItemDto,
  MessageBucket,
  ChatQuotaStatus,
} from '../../types';

export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      return await chatService.getConversations() as ConversationListItemDto[];
    } catch (e: any) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
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
  }
);

export const fetchUnreadCount = createAsyncThunk(
  'chat/fetchUnreadCount',
  async () => chatService.getUnreadCount() as Promise<number>
);

export const fetchChatQuota = createAsyncThunk(
  'chat/fetchQuota',
  async (conversationId: string, { rejectWithValue }) => {
    try {
      const status = await chatService.getQuota(conversationId);
      return { conversationId, status };
    } catch (e: any) {
      return rejectWithValue(e?.response?.data?.message || e?.message || 'Failed');
    }
  }
);

export const redeemChatUnlock = createAsyncThunk(
  'chat/redeemUnlock',
  async (
    { conversationId, transactionId }: { conversationId: string; transactionId: string },
    { rejectWithValue, dispatch }
  ) => {
    try {
      await chatService.unlockChat(conversationId, transactionId);
      dispatch(fetchChatQuota(conversationId));
      return { conversationId };
    } catch (e: any) {
      return rejectWithValue({
        status: e?.response?.status,
        message: e?.response?.data?.message || e?.message || 'Failed',
      });
    }
  }
);

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
};

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

      if (msg.clientMessageId) {
        const idx = bucket.messages.findIndex((m) => m.clientMessageId === msg.clientMessageId);
        if (idx >= 0) {
          bucket.messages[idx] = { ...bucket.messages[idx], ...msg, _pending: false };
          state.messagesByConv[msg.conversationId] = bucket;
          updateConversationLastMessage(state, msg);
          return;
        }
      }

      if (bucket.messages.some((m) => m.id === msg.id)) return;

      bucket.messages = [msg, ...bucket.messages];
      state.messagesByConv[msg.conversationId] = bucket;
      updateConversationLastMessage(state, msg);

      const isOwn = selfUserId && msg.senderId === selfUserId;
      const conv = state.conversations.find((c) => c.conversationId === msg.conversationId);
      if (conv && !isOwn && !msg.isSystemMessage && state.activeConversationId !== msg.conversationId) {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
        state.unreadTotal += 1;
      }
    },

    messageSent: (state, action: PayloadAction<MessageDto>) => {
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
          (!lastReadSentAt || new Date(m.sentAt) <= new Date(lastReadSentAt))
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

    decrementQuotaLocally: (state, action: PayloadAction<{ conversationId: string }>) => {
      const convId = action.payload?.conversationId;
      if (!convId) return;
      const q = state.quotaByConv[convId];
      if (!q || q.remainingMessages == null) return;
      q.messageCount = (q.messageCount ?? 0) + 1;
      q.remainingMessages = Math.max(0, q.remainingMessages - 1);
      if (q.remainingMessages === 0 && !q.isUnlocked && !q.bothPremium) {
        q.requiresUnlock = true;
      }
    },

    markQuotaUnlocked: (state, action: PayloadAction<{ conversationId: string }>) => {
      const convId = action.payload?.conversationId;
      if (!convId) return;
      const q = state.quotaByConv[convId];
      if (!q) return;
      q.isUnlocked = true;
      q.requiresUnlock = false;
      q.remainingMessages = null;
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
        const merged = action.payload.map((serverConv) => {
          const localConv = state.conversations.find(
            (c) => c.conversationId === serverConv.conversationId,
          );
          if (!localConv) return serverConv;
          const localTime = localConv.lastMessageAt ? new Date(localConv.lastMessageAt).getTime() : 0;
          const serverTime = serverConv.lastMessageAt ? new Date(serverConv.lastMessageAt).getTime() : 0;
          if (localTime > serverTime) {
            return {
              ...serverConv,
              lastMessagePreview: localConv.lastMessagePreview,
              lastMessageAt: localConv.lastMessageAt,
              lastMessageContentType: localConv.lastMessageContentType,
            };
          }
          return serverConv;
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
        const { conversationId, messages, nextCursor, hasMore, append } = action.payload as any;
        const bucket = state.messagesByConv[conversationId] ?? emptyBucket();
        if (append) {
          const existing = new Set(bucket.messages.map((m) => m.id));
          bucket.messages = [...bucket.messages, ...messages.filter((m: MessageDto) => !existing.has(m.id))];
        } else {
          const pendingTop = bucket.messages.filter((m) => m._pending);
          bucket.messages = [...pendingTop, ...messages];
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
      })
      .addCase(fetchChatQuota.fulfilled, (state, action) => {
        const { conversationId, status } = action.payload;
        state.quotaByConv[conversationId] = status as ChatQuotaStatus;
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
  decrementQuotaLocally,
  markQuotaUnlocked,
} = chatSlice.actions;

export default chatSlice.reducer;
