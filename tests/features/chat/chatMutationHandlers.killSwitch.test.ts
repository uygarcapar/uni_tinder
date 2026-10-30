/**
 * `CHAT_MUTATION_QUEUE_ENABLED` KAPALI — AYRI dosya, çünkü bayrak modül
 * yüklenirken okunuyor (chatFlags.ts'teki `export const`), yani aynı
 * dosyada hem açık hem kapalı hâl sınanamıyor (bkz.
 * chatBackfill.killSwitch.test.ts'teki aynı kısıt — bu dosya onun deseni).
 *
 * Kapsam KASTEN DAR: Task 4 bayrağın yalnız ÇAĞRI NOKTASINI (ChatScreen'in
 * iki handler'ı) kapatıyor — `flushPendingMutations`'ın İÇİNDE ikinci bir
 * gate Task 5'in işi ve henüz YOK. Bu yüzden burada `flushPendingMutations`'ın
 * davranışına dair HİÇBİR iddia YOK; tek iddia "eski yol çalışıyor, kuyruğa
 * HİÇ satır yazılmıyor".
 */
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
  CHAT_BACKFILL_ENABLED: true,
  CHAT_MUTATION_QUEUE_ENABLED: false,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

// jest.setup.ts'in @expo/ui/swift-ui mock'u `Text`i hiç dışa aktarmıyor —
// ChatHeader'ın isim pili `SwiftUIText` kullanıyor, mock'suz "Element type
// is invalid" ile düşer. Taban mock'u aynen koruyup yalnız eksik olanı
// ekliyoruz (bkz. chatMutationHandlers.test.ts'teki aynı not).
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    Host: ({ children }: any) => children ?? null,
    RNHostView: ({ children }: any) => React.createElement(View, null, children),
    Image: () => null,
    Text: ({ children }: any) => React.createElement(Text, null, children),
    Button: ({ onPress, children, label }: any) =>
      React.createElement(
        TouchableOpacity,
        { onPress, accessibilityLabel: label },
        children ?? null,
      ),
    ContextMenu: Object.assign(
      ({ children }: any) => React.createElement(View, null, children),
      {
        Trigger: ({ children }: any) => React.createElement(View, null, children),
        Items: ({ children }: any) => React.createElement(View, null, children),
        Preview: ({ children }: any) => React.createElement(View, null, children),
      },
    ),
  };
});

jest.mock('@legendapp/list/keyboard', () => ({
  KeyboardAwareLegendList: () => null,
  useKeyboardChatComposerInset: () => ({
    contentInsetEndAdjustment: { value: 0 },
    onComposerLayout: () => {},
  }),
}));

const mockEnqueueReaction = jest.fn();
const mockEnqueueDelete = jest.fn();
const mockFlushPendingMutations = jest.fn((..._args: any[]) =>
  Promise.resolve({ ran: true, done: 0, retried: 0, rejected: 0 }),
);
jest.mock('@/features/chat/pendingMutations', () => ({
  enqueueReaction: (...args: any[]) => mockEnqueueReaction(...args),
  enqueueDelete: (...args: any[]) => mockEnqueueDelete(...args),
  flushPendingMutations: (...args: any[]) => mockFlushPendingMutations(...args),
}));

// bkz. chatMutationHandlers.test.ts'teki not: `import`lar Babel'in CJS
// dönüşümüyle dosyanın tepesine taşınıyor, bu yüzden metotlar LAZY
// indirection olarak tanımlanıyor (dış `mockGetConversations` vb. const'lar
// henüz atanmamışken factory çağrılabiliyor).
const mockGetConversations = jest.fn((..._args: any[]) => Promise.reject(new Error('no network in test')));
const mockGetMessageHistory = jest.fn((..._args: any[]) => Promise.reject(new Error('no network in test')));
const mockGetQuota = jest.fn((..._args: any[]) => Promise.reject(new Error('no network in test')));
const mockMarkRead = jest.fn((..._args: any[]) => Promise.resolve());
const mockAddReaction = jest.fn((..._args: any[]) => Promise.resolve([]));
const mockRemoveReaction = jest.fn((..._args: any[]) => Promise.resolve([]));
const mockDeleteMessage = jest.fn((..._args: any[]) => Promise.resolve());
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: {
    getConversations: (...args: any[]) => mockGetConversations(...args),
    getMessageHistory: (...args: any[]) => mockGetMessageHistory(...args),
    getQuota: (...args: any[]) => mockGetQuota(...args),
    markRead: (...args: any[]) => mockMarkRead(...args),
    addReaction: (...args: any[]) => mockAddReaction(...args),
    removeReaction: (...args: any[]) => mockRemoveReaction(...args),
    deleteMessage: (...args: any[]) => mockDeleteMessage(...args),
  },
  HISTORY_PAGE_SIZE: 50,
}));

jest.mock('@/features/chat/chatHydrate', () => ({
  hasLocalHistory: () => true,
  hydrateConversation: () => {},
  loadOlderLocalFirst: () => ({ kind: 'noop' }),
}));

jest.mock('@/features/chat/realtimeService', () => ({
  __esModule: true,
  default: {
    joinConversation: jest.fn((..._args: any[]) => Promise.resolve()),
    markMessageDelivered: jest.fn((..._args: any[]) => Promise.resolve()),
  },
}));

jest.mock('@/features/chat/quotaPaywall', () => ({
  openQuotaPaywall: jest.fn(),
}));

// outbox.ts gerçek store'u (`@/shared/store`) import ediyor, o da
// settingsSlice üzerinden expo-localization'ı (native) uyandırıp jest'i
// düşürüyor — bu suite'in iki handler'ıyla ilgisi yok, dışarıda tutuluyor.
jest.mock('@/features/chat/outbox', () => ({
  sendOutgoing: jest.fn(),
  retryFailedMessage: jest.fn(),
}));

const mockShowInfoToast = jest.fn();
jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: (...args: any[]) => mockShowInfoToast(...args),
  hideToast: jest.fn(),
}));

jest.mock('@/shared/services/analytics', () => ({
  analytics: { capture: jest.fn() },
}));

jest.mock('@/features/chat/components/ChatMessageList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem }: any) =>
      React.createElement(
        View,
        null,
        (data || []).map((item: any, index: number) =>
          React.createElement(
            View,
            { key: item.id ?? `row-${index}` },
            renderItem({ item, index, data }),
          ),
        ),
      ),
  };
});

jest.mock('@/features/chat/components/MessageBubble', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ message, onLongPress }: any) =>
      React.createElement(Pressable, {
        testID: `bubble-${message.id}`,
        onLongPress: () => onLongPress?.({}),
      }),
  };
});

jest.mock('@/features/chat/components/ReplySwipeRow', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));

jest.mock('@/features/chat/components/MessageComposer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/features/chat/components/ConversationOptionsSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/features/chat/components/HiddenHistoryBanner', () => ({
  __esModule: true,
  default: () => null,
  HIDDEN_HISTORY_ROW_ID: '__hidden_history__',
}));

jest.mock('@/shared/components/ReportModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/features/profile/components/PreviewModal', () => ({
  __esModule: true,
  default: () => null,
}));

let mockActionSheetEmoji = '😀';
jest.mock('@/features/chat/components/MessageActionSheet', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    __setEmoji: (emoji: string) => {
      mockActionSheetEmoji = emoji;
    },
    default: ({ visible, onPickReaction, onDelete }: any) => {
      if (!visible) return null;
      return React.createElement(
        View,
        null,
        React.createElement(Pressable, {
          testID: 'action-pick-reaction',
          onPress: () => onPickReaction(mockActionSheetEmoji),
        }),
        React.createElement(Pressable, {
          testID: 'action-delete',
          onPress: () => onDelete(false),
        }),
      );
    },
  };
});

import React from 'react';
import { Alert } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, fireEvent, screen, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import chatReducer from '@/features/chat/chatSlice';
import ChatScreen from '@/features/chat/screens/ChatScreen';
import * as MessageActionSheetMock from '@/features/chat/components/MessageActionSheet';

const CONVERSATION_ID = 'conv-1';
const MESSAGE_ID = 'msg-1';
const MY_USER_ID = 'me';
const PARTNER_USER_ID = 'partner-1';

function buildMessage(overrides: any = {}) {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: PARTNER_USER_ID,
    content: 'selam',
    contentType: 0,
    sentAt: new Date().toISOString(),
    reactions: [],
    ...overrides,
  };
}

function authReducer(state = { user: { userId: MY_USER_ID, id: MY_USER_ID } }) {
  return state;
}

function buildStore(message: any) {
  return configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: {
      chat: {
        conversations: [
          {
            conversationId: CONVERSATION_ID,
            partnerUserId: PARTNER_USER_ID,
            partnerDisplayName: 'Partner',
            partnerProfileImageUrl: null,
            isActive: true,
            mode: 'Dating',
          },
        ],
        messagesByConv: {
          [CONVERSATION_ID]: {
            messages: [message],
            hasMore: false,
            nextCursor: null,
            loading: false,
            hasHiddenHistory: false,
          },
        },
        quotaByConv: {},
        quotaMetaByConv: {},
        unreadTotal: 0,
        conversationsLoading: false,
      } as any,
      auth: { user: { userId: MY_USER_ID, id: MY_USER_ID } } as any,
    },
  });
}

function renderChatScreen(message: any) {
  const store = buildStore(message);
  const navigation: any = { goBack: jest.fn(), setOptions: jest.fn() };
  const route: any = {
    params: {
      conversationId: CONVERSATION_ID,
      partner: { userId: PARTNER_USER_ID, displayName: 'Partner' },
      isActive: true,
    },
  };
  render(
    React.createElement(Provider, {
      store,
      children: React.createElement(NavigationContainer, {
        children: React.createElement(ChatScreen as any, { route, navigation }),
      }),
    }),
  );
  return { store };
}

async function longPressBubble() {
  await act(async () => {
    fireEvent(screen.getByTestId(`bubble-${MESSAGE_ID}`), 'longPress');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetConversations.mockImplementation(() =>
    Promise.reject(new Error('no network in test')),
  );
  mockGetMessageHistory.mockImplementation(() =>
    Promise.reject(new Error('no network in test')),
  );
  mockGetQuota.mockImplementation(() => Promise.reject(new Error('no network in test')));
});

describe('bayrak kapalı', () => {
  it('tepki: eski yol — REST doğrudan, hata geri alıyor, kuyruğa YAZILMIYOR', async () => {
    // Ayırt edici iddia: bayrak kapalıyken `enqueueReaction` HİÇ çağrılmıyor
    // (çağrı noktası eski kodu çalıştırıyor) VE ağ hatasında optimistik liste
    // GERİ ALINIYOR — kuyruk açıkken bunların ikisi de tersti.
    mockAddReaction.mockImplementation(() => Promise.reject(new Error('network down')));
    (MessageActionSheetMock as any).__setEmoji('😀');
    const { store } = renderChatScreen(buildMessage({ reactions: [] }));

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-pick-reaction'));
    });
    // Geri alma dispatch'i promise rejection'ı sonrası mikro görevde gelir.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAddReaction).toHaveBeenCalledWith(MESSAGE_ID, '😀');
    expect(mockEnqueueReaction).not.toHaveBeenCalled();
    expect(mockFlushPendingMutations).not.toHaveBeenCalled();

    const message = (store.getState() as any).chat.messagesByConv[CONVERSATION_ID].messages[0];
    expect(message.reactions).toEqual([]);
  });

  it('silme: eski yol — REST doğrudan, hata Alert gösterir, kuyruğa YAZILMIYOR', async () => {
    mockDeleteMessage.mockImplementation(() => Promise.reject(new Error('network down')));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderChatScreen(buildMessage());

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-delete'));
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockDeleteMessage).toHaveBeenCalledWith(MESSAGE_ID, false);
    expect(mockEnqueueDelete).not.toHaveBeenCalled();
    expect(mockFlushPendingMutations).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
