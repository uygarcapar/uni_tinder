/**
 * Faz 4 — `ChatScreen`in düzenleme modu (composer + şerit + kuyruk çağrı
 * noktaları). "Düzenle" satırının `canEdit` kapıları (sahiplik/sistem/
 * silinmiş/sesli/pencere/pending) AYRI dosyada pinli:
 * `tests/features/chat/components/MessageActionSheet.test.tsx` — o dosya
 * bileşeni DOĞRUDAN (gerçek) render ediyor, burası ise `MessageActionSheet`i
 * MOCK'luyor (chatMutationHandlers.test.ts'teki gibi) — aynı dosyada hem
 * gerçek hem sahte `MessageActionSheet` BARINAMAZ (jest.mock modül başına
 * tek factory, dosya genelinde hoist edilir).
 *
 * Ekranın kendisi devasa (LegendList, klavye kontrolcüsü, @expo/ui camı) —
 * bu suite yalnız düzenleme akışını ilgilendiren çevresini gerçek bırakıyor
 * (chatSlice reducer'ı, pendingMutations/pendingMutationPolicy arayüzü),
 * gerisini (liste virtualization'ı, balon/composer/aksiyon menüsü UI'ı) basit
 * test-dostu kopyalarla değiştiriyor — `chatMutationHandlers.test.ts`teki
 * haritanın BİREBİR aynısı.
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
const mockEnqueueEdit = jest.fn();
const mockFlushPendingMutations = jest.fn((..._args: any[]) =>
  Promise.resolve({ ran: true, done: 0, retried: 0, rejected: 0 }),
);
jest.mock('@/features/chat/pendingMutations', () => ({
  enqueueReaction: (...args: any[]) => mockEnqueueReaction(...args),
  enqueueDelete: (...args: any[]) => mockEnqueueDelete(...args),
  enqueueEdit: (...args: any[]) => mockEnqueueEdit(...args),
  flushPendingMutations: (...args: any[]) => mockFlushPendingMutations(...args),
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

// Balon içeriği TEXT olarak çiziliyor (gönderme değil, "remount sonrası YENİ
// metin görünüyor" testinin tek kapısı budur).
jest.mock('@/features/chat/components/MessageBubble', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ message, onLongPress }: any) =>
      React.createElement(
        Pressable,
        { testID: `bubble-${message.id}`, onLongPress: () => onLongPress?.({}) },
        React.createElement(Text, null, message.content),
      ),
  };
});

jest.mock('@/features/chat/components/ReplySwipeRow', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));

// Composer: gerçek metin kutusu / klavye / cam YOK — yalnız ChatScreen'in
// geçtiği prop'lara erişilebilir test-dostu bir kopya. `__getLastProps`
// her testte son render'daki prop'ları (initialText, replyTo, vb.) döner.
let mockLastComposerProps: any = null;
let mockComposerSendContent = 'merhaba';
jest.mock('@/features/chat/components/MessageComposer', () => {
  const React = require('react');
  const { View, Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    __setComposerSendContent: (content: string) => {
      mockComposerSendContent = content;
    },
    __getLastComposerProps: () => mockLastComposerProps,
    default: (props: any) => {
      mockLastComposerProps = props;
      return React.createElement(
        View,
        null,
        React.createElement(
          Text,
          { testID: 'composer-initial-text' },
          props.initialText ?? '',
        ),
        React.createElement(Pressable, {
          testID: 'composer-send',
          onPress: () =>
            props.onSend?.({ content: mockComposerSendContent, clientMessageId: 'cmid-1' }),
        }),
        props.replyTo
          ? React.createElement(Pressable, {
              testID: 'composer-cancel',
              onPress: () => props.onCancelReply?.(),
            })
          : null,
      );
    },
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

// Uzun-bas menüsü: ChatScreen'in geçtiği onEdit'i doğrudan tetikleyen bir test
// butonu — `chatMutationHandlers.test.ts`teki onPickReaction/onDelete butonlarının
// ikizi.
jest.mock('@/features/chat/components/MessageActionSheet', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onEdit }: any) => {
      if (!visible) return null;
      return React.createElement(
        View,
        null,
        React.createElement(Pressable, {
          testID: 'action-edit',
          onPress: () => onEdit(),
        }),
      );
    },
  };
});

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import chatReducer from '@/features/chat/chatSlice';
import ChatScreen from '@/features/chat/screens/ChatScreen';
import * as MessageComposerMock from '@/features/chat/components/MessageComposer';

const CONVERSATION_ID = 'conv-1';
const MESSAGE_ID = 'msg-1';
const MY_USER_ID = 'me';
const PARTNER_USER_ID_FOR_SCREEN = 'partner-1';

function buildMessage(overrides: any = {}) {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: MY_USER_ID,
    content: 'orijinal metin',
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
            partnerUserId: PARTNER_USER_ID_FOR_SCREEN,
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

function renderChatScreen(store: any) {
  const navigation: any = { goBack: jest.fn(), setOptions: jest.fn() };
  const route: any = {
    params: {
      conversationId: CONVERSATION_ID,
      partner: { userId: PARTNER_USER_ID_FOR_SCREEN, displayName: 'Partner' },
      isActive: true,
    },
  };
  return render(
    React.createElement(Provider, {
      store,
      children: React.createElement(NavigationContainer, {
        children: React.createElement(ChatScreen as any, { route, navigation }),
      }),
    }),
  );
}

async function openEditMode() {
  await act(async () => {
    fireEvent(screen.getByTestId(`bubble-${MESSAGE_ID}`), 'longPress');
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('action-edit'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLastComposerProps = null;
  mockComposerSendContent = 'yeni metin';
  mockFlushPendingMutations.mockImplementation(() =>
    Promise.resolve({ ran: true, done: 0, retried: 0, rejected: 0 }),
  );
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

describe('ChatScreen — düzenleme modu', () => {
  it('düzenleme modunda composer mevcut metinle doluyor', async () => {
    const store = buildStore(buildMessage());
    renderChatScreen(store);

    await openEditMode();

    expect(screen.getByTestId('composer-initial-text').props.children).toBe(
      'orijinal metin',
    );
  });

  it('gönderince optimistik dispatch + enqueueEdit + flush tetiklenir', async () => {
    const store = buildStore(buildMessage());
    renderChatScreen(store);

    await openEditMode();

    (MessageComposerMock as any).__setComposerSendContent('yeni metin');
    await act(async () => {
      fireEvent.press(screen.getByTestId('composer-send'));
    });

    // Optimistik: store'daki mesaj ANINDA yeni içerikle güncellendi.
    const state = store.getState();
    expect(state.chat.messagesByConv[CONVERSATION_ID].messages[0].content).toBe(
      'yeni metin',
    );

    expect(mockEnqueueEdit).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      content: 'yeni metin',
      serverBase: 'orijinal metin',
    });
    expect(mockFlushPendingMutations).toHaveBeenCalledWith('interactive');

    // Düzenleme modu kapandı — composer normal moda döndü (replyTo yuvası boş).
    expect((MessageComposerMock as any).__getLastComposerProps().replyTo).toBeNull();
  });

  it('iptal düzenleme modunu kapatır ve metni DEĞİŞTİRMEZ', async () => {
    const store = buildStore(buildMessage());
    renderChatScreen(store);

    await openEditMode();
    await act(async () => {
      fireEvent.press(screen.getByTestId('composer-cancel'));
    });

    expect(mockEnqueueEdit).not.toHaveBeenCalled();
    expect(mockFlushPendingMutations).not.toHaveBeenCalled();
    const state = store.getState();
    expect(state.chat.messagesByConv[CONVERSATION_ID].messages[0].content).toBe(
      'orijinal metin',
    );
    // Düzenleme şeridi gitti — composer normal moda döndü.
    expect((MessageComposerMock as any).__getLastComposerProps().replyTo).toBeNull();
  });

  it('düzenleme kuyruktayken ekran yeniden kurulunca YENİ metin görünüyor', async () => {
    const store = buildStore(buildMessage());
    const first = renderChatScreen(store);

    await openEditMode();
    (MessageComposerMock as any).__setComposerSendContent('kalıcı yeni metin');
    await act(async () => {
      fireEvent.press(screen.getByTestId('composer-send'));
    });

    first.unmount();

    renderChatScreen(store);
    await act(async () => {});

    expect(screen.getByText('kalıcı yeni metin')).toBeTruthy();
  });
});
