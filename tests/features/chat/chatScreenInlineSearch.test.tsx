/**
 * Faz 4 / Task 6 — sohbet içinde arama. Başlıktaki büyüteç açar;
 * `chatRepository.searchMessages` `{ conversationId }` ile SINIRLI çalışır,
 * ileri/geri Task 5'in atlama mekanizmasını (hydrateAroundMessage + aynı
 * scroll/highlight yolu) KULLANIR — ikinci bir atlama yolu icat edilmedi.
 *
 * Harita `chatScreenJumpToMessage.test.tsx`le BİREBİR aynı: ekran devasa,
 * bu suite yalnız arama dalını ilgilendiren çevresini gerçek bırakıyor,
 * gerisini (liste/balon/composer/sheet'ler) aynı test-dostu kopyalarla
 * değiştiriyor. `chatRepository` BURADA mock'lu (gerçek SQLite davranışı
 * `messageSearchRepo.test.ts`te) — bu suitenin konusu "ekran hangi sorguda
 * ne yapıyor", SQL'in kendisi değil.
 */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    Host: ({ children }: any) => children ?? null,
    RNHostView: ({ children }: any) => React.createElement(View, null, children),
    Image: () => null,
    Text: ({ children }: any) => React.createElement(Text, null, children),
    // `testID` burada EK OLARAK forward ediliyor (jump testinin mock'undan
    // tek farkı): bu suite başlıktaki @expo/ui büyüteç butonuna testID ile
    // basıyor, gerçek `Button`ın `modifiers` zincirini (accessibilityLabel
    // dahil) işlemeyen bu sahte bileşen onsuz hiç erişilebilir olmazdı.
    Button: ({ onPress, children, label, testID }: any) =>
      React.createElement(
        TouchableOpacity,
        { onPress, accessibilityLabel: label, testID },
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

// Jump dalı (Task 5) GERÇEK bırakılmıyor ama ÇAĞRILARI gözlemlenebilir:
// `hydrateAroundImpl` her testte ayrı davranış kurabilsin diye bir dispatch
// fonksiyonu olarak tutuluyor — tıpkı chatScreenJumpToMessage.test.tsx'teki gibi.
const mockHasLocalHistory = jest.fn((..._args: any[]) => true);
const mockHydrateConversation = jest.fn((..._args: any[]) => false);
let hydrateAroundImpl: (
  dispatch: any,
  conversationId: string,
  sentAtMs: number,
  messageId: string,
) => boolean = () => false;
const mockHydrateAroundMessage = jest.fn((...args: any[]) => (hydrateAroundImpl as any)(...args));
jest.mock('@/features/chat/chatHydrate', () => ({
  hasLocalHistory: (...args: any[]) => mockHasLocalHistory(...args),
  hydrateConversation: (...args: any[]) => mockHydrateConversation(...args),
  hydrateAroundMessage: (...args: any[]) => mockHydrateAroundMessage(...args),
  loadOlderLocalFirst: () => ({ kind: 'noop' }),
}));

// `chatRepository.searchMessages` TAM mock'lu — bu suitenin konusu SQL değil,
// ekranın sorguyu nasıl sınırladığı ve sonuçla ne yaptığı (bkz. dosya başı).
const mockSearchMessages = jest.fn((..._args: any[]) => [] as any[]);
jest.mock('@/features/chat/chatRepository', () => ({
  searchMessages: (...args: any[]) => mockSearchMessages(...args),
}));

const mockHighlightMessage = jest.fn();
jest.mock('@/features/chat/components/messageHighlight', () => ({
  highlightMessage: (...args: any[]) => mockHighlightMessage(...args),
  useMessageHighlight: () => false,
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

jest.mock('@/features/chat/pendingMutations', () => ({
  enqueueReaction: jest.fn(),
  enqueueDelete: jest.fn(),
  flushPendingMutations: jest.fn((..._args: any[]) =>
    Promise.resolve({ ran: true, done: 0, retried: 0, rejected: 0 }),
  ),
}));

jest.mock('@/features/chat/outbox', () => ({
  sendOutgoing: jest.fn(),
  retryFailedMessage: jest.fn(),
}));

jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: jest.fn(),
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
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ message }: any) =>
      React.createElement(View, { testID: `bubble-${message.id}` }),
  };
});

jest.mock('@/features/chat/components/ReplySwipeRow', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));

jest.mock('@/features/chat/components/MessageComposer', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ onSend }: any) =>
      React.createElement(Pressable, {
        testID: 'composer-send',
        onPress: () =>
          onSend?.({ content: 'merhaba', clientMessageId: 'cmid-1' }),
      }),
  };
});

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

jest.mock('@/features/chat/components/MessageActionSheet', () => ({
  __esModule: true,
  default: () => null,
}));

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import chatReducer, { hydrateWindow } from '@/features/chat/chatSlice';
import ChatScreen from '@/features/chat/screens/ChatScreen';

const CONVERSATION_ID = 'conv-1';
const MY_USER_ID = 'me';
const PARTNER_USER_ID = 'partner-1';
const BASE_MS = Date.UTC(2026, 9, 20, 12, 0, 0);

function authReducer(state = { user: { userId: MY_USER_ID, id: MY_USER_ID } }) {
  return state;
}

function buildStore() {
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
        messagesByConv: {},
        typingByConv: {},
        presenceByUser: {},
        quotaByConv: {},
        quotaMetaByConv: {},
        unreadTotal: 0,
        conversationsLoading: false,
      } as any,
      auth: { user: { userId: MY_USER_ID, id: MY_USER_ID } } as any,
    },
  });
}

function renderChatScreen() {
  const store = buildStore();
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

/** Her testin aynı yoldan geçmesi için: büyüteci aç, sorguyu yaz, debounce'u akıt. */
function openSearchAndType(query: string) {
  fireEvent.press(screen.getByTestId('chat-search-open'));
  fireEvent.changeText(screen.getByTestId('chat-inline-search-input'), query);
  act(() => {
    jest.advanceTimersByTime(1000);
  });
}

function hitFixture(id: string, sentAtMs: number) {
  return {
    messageId: id,
    conversationId: CONVERSATION_ID,
    sentAtMs,
    content: 'selam',
    partnerDisplayName: 'Partner',
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHasLocalHistory.mockReturnValue(true);
  mockHydrateConversation.mockReturnValue(false);
  hydrateAroundImpl = () => false;
  mockSearchMessages.mockReturnValue([]);
  mockGetConversations.mockImplementation(() =>
    Promise.reject(new Error('no network in test')),
  );
  mockGetMessageHistory.mockImplementation(() =>
    Promise.reject(new Error('no network in test')),
  );
  mockGetQuota.mockImplementation(() =>
    Promise.reject(new Error('no network in test')),
  );
});

describe('sohbet içinde arama', () => {
  it('başlıktan arama açılıyor ve yalnız bu sohbette arıyor', async () => {
    renderChatScreen();
    await act(async () => {});

    expect(screen.queryByTestId('chat-inline-search-input')).toBeNull();

    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    // `conversationId` ile SINIRLI — global aramadaki (MessagesScreen)
    // `{ limit }`ten farklı olarak burada `conversationId` ZORUNLU, yoksa bu
    // ekran tüm arşivi tarar ve "yalnız bu sohbette" sözü boş kalırdı.
    expect(mockSearchMessages).toHaveBeenCalledWith('selam', {
      conversationId: CONVERSATION_ID,
      limit: expect.any(Number),
    });
  });

  it('ileri/geri eşleşmeler arasında dönüyor ve sayaç doğru', async () => {
    // Bilerek karışık sırada: `searchMessages` newest-first döner,
    // ekran kronolojik (eski→yeni) sıraya kendisi çeviriyor.
    mockSearchMessages.mockReturnValue([
      hitFixture('m-newest', BASE_MS + 2000),
      hitFixture('m-oldest', BASE_MS),
      hitFixture('m-mid', BASE_MS + 1000),
    ]);
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [
            {
              id: messageId,
              conversationId,
              senderId: PARTNER_USER_ID,
              content: 'selam',
              contentType: 0,
              sentAt: new Date(sentAtMs).toISOString(),
            },
          ],
          nextCursor: null,
          hasMore: true,
          hasHiddenHistory: false,
          isWindowed: true,
        }),
      );
      return true;
    };

    renderChatScreen();
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    // Açılışta EN YENİ eşleşmeye atlanır (kronolojik sırada SON, 3/3) —
    // arama yeni yazılmış bir mesajı bulmak için açılıyor, en eskiden
    // başlamak kullanıcıyı yanlış uca gönderirdi.
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-newest');

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-prev'));
    });
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-mid');

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-prev'));
    });
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-oldest');

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-mid');

    // Fetch-once (karar 2): sorgu DEĞİŞMEDİ, dört hop'un hiçbiri SQL'i tekrar
    // tetiklemedi — tutulan sonuç listesi hop başına yeniden çekilmiyor.
    expect(mockSearchMessages).toHaveBeenCalledTimes(1);
  });

  it('eşleşme yokken ileri/geri bir şey yapmıyor', async () => {
    mockSearchMessages.mockReturnValue([]);

    renderChatScreen();
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('yokbukelime');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(screen.getByTestId('chat-inline-search-empty')).toBeTruthy();
    mockHydrateAroundMessage.mockClear();
    mockHighlightMessage.mockClear();

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-prev'));
    });

    expect(mockHydrateAroundMessage).not.toHaveBeenCalled();
    expect(mockHighlightMessage).not.toHaveBeenCalled();
  });
});
