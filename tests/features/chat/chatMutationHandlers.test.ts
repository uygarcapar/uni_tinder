/**
 * ChatScreen'in `handlePickReaction`/`handleDelete`'i kuyruğa bağlı — bu
 * suite bayrak AÇIK (varsayılan `CHAT_MUTATION_QUEUE_ENABLED`) yolu sınıyor:
 * optimistik dispatch aynı, ama ağ çağrısı/geri alma artık ChatScreen'in işi
 * DEĞİL — `enqueueReaction`/`enqueueDelete` + `flushPendingMutations`'a
 * devrediliyor. Bayrak KAPALI yol AYRI dosyada (chatMutationHandlers.killSwitch.test.ts)
 * — bayrak modül yüklenirken okunuyor, aynı dosyada iki hâl sınanamıyor
 * (bkz. chatBackfill.killSwitch.test.ts'teki aynı kısıt).
 *
 * Ekranın kendisi devasa (LegendList, klavye kontrolcüsü, @expo/ui camı, vs.)
 * — bu suite yalnız iki handler'ı ilgilendiren çevresini gerçek bırakıyor
 * (chatSlice reducer'ı, reactionPick/pendingMutations arayüzü), gerisini
 * (liste virtualization'ı, balon/aksiyon menüsü UI'ı) basit test-dostu
 * kopyalarla değiştiriyor.
 */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

// jest.setup.ts'in @expo/ui/swift-ui mock'u `Text`i hiç dışa aktarmıyor (o
// mock'un kapsamı buraya kadar uzanmıyordu) — ChatHeader'ın isim pili
// `SwiftUIText` kullanıyor, mock'suz "Element type is invalid" ile düşer.
// Taban mock'u aynen koruyup yalnız eksik olanı ekliyoruz.
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

// Babel'in CJS dönüşümü `import`ları dosyanın TEPESİNE taşıyor (ESM hoisting
// semantiği) — ChatScreen'in kendi `chatService` import'u bu dosyadaki
// `import ChatScreen` satırından önce değil, FİİLEN ondan bağımsız olarak en
// üstte değerlendirilir; yani factory, aşağıdaki `mockGetConversations` vb.
// const'lar henüz atanmamışken çağrılabilir. `default: mockChatService` gibi
// DOĞRUDAN bir referans o anda `undefined`i DONDURURDU. Çözüm:
// `pendingMutations` mock'undaki gibi her metodu LAZY bir indirection yapmak
// — çağrıldığı anda (render/efekt zamanı, const'lar çoktan atanmış) dış
// değişkene bakar.
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

// ── Ağır alt bileşenler: liste virtualization'ı ve aksiyon menüsü UI'ı bu
// suite'in konusu değil. Liste gerçek renderItem'ı çağırıyor (ChatScreen'in
// kendi mantığı), balon yalnız uzun-bas tetikleyen bir Pressable'a indiriliyor.
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

// Uzun-bas menüsü: ChatScreen'in geçtiği onPickReaction/onDelete'i doğrudan
// tetikleyen iki test butonu. Hangi emoji'nin seçileceği __setEmoji ile
// ayarlanıyor — her testte önce bu çağrılıyor.
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
import chatReducer, { reactionsChanged, messageDeleted } from '@/features/chat/chatSlice';
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

describe('handlePickReaction — kuyruğa bağlı', () => {
  it('tepki: optimistik dispatch + kuyruğa yazma + tur tetikleme', async () => {
    (MessageActionSheetMock as any).__setEmoji('😀');
    renderChatScreen(buildMessage({ reactions: [] }));

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-pick-reaction'));
    });

    // Direkt REST'e HİÇ gidilmedi — kuyruk devraldı.
    expect(mockAddReaction).not.toHaveBeenCalled();
    expect(mockRemoveReaction).not.toHaveBeenCalled();

    expect(mockEnqueueReaction).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      desired: '😀',
      serverBase: null,
    });
    expect(mockFlushPendingMutations).toHaveBeenCalledWith('interactive');
  });

  it('tepki ağ hatasında ARTIK GERİ ALINMIYOR — emoji yerinde kalıyor', async () => {
    // Ayırt edici iddia: bu fazın tamamı bu satır. Eski kodda ağ çağrısı
    // ChatScreen'in KENDİ try/catch'inde yakalanıp `prev` listesi geri
    // dispatch ediliyordu (ChatScreen.tsx'in eski handlePickReaction'ı).
    // `flushPendingMutations` gerçekte asla reject ETMEZ (her satırın
    // hatasını kendi içinde yutup bir sonuç nesnesi döner — pendingMutations.ts),
    // yani bu sahte round "rejected" sayısı 1 olan bir sonuç veriyor: bir
    // satır KALICI olarak reddedildi. Eğer ChatScreen hâlâ KENDİ geri alma
    // kodunu taşısaydı o kod burada da devreye girip İKİNCİ bir
    // reactionsChanged dispatch'i üretirdi — taşımadığı için tek kalıyor.
    mockFlushPendingMutations.mockImplementation(() =>
      Promise.resolve({ ran: true, done: 0, retried: 0, rejected: 1 }),
    );
    (MessageActionSheetMock as any).__setEmoji('😀');
    const { store } = renderChatScreen(buildMessage({ reactions: [] }));
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-pick-reaction'));
    });

    const payloads = dispatchSpy.mock.calls
      .map((args) => args[0])
      .filter((action: any) => action?.type === reactionsChanged.type)
      .map((action: any) => action.payload);

    expect(payloads).toHaveLength(1);
    expect(payloads[0].reactions.some((r: any) => r.emoji === '😀')).toBe(true);
  });

  it('serverBase benim mevcut emojimden hesaplanıyor, başkasının emojisinden DEĞİL', async () => {
    (MessageActionSheetMock as any).__setEmoji('🔥');
    renderChatScreen(
      buildMessage({
        reactions: [
          { emoji: '❤️', count: 1, userIds: ['other-user'] },
          { emoji: '😀', count: 1, userIds: [MY_USER_ID] },
        ],
      }),
    );

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-pick-reaction'));
    });

    expect(mockEnqueueReaction).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      desired: '🔥',
      serverBase: '😀',
    });
  });
});

describe('handleDelete — kuyruğa bağlı', () => {
  it('silme: optimistik dispatch + kuyruğa yazma, Alert YOK', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { store } = renderChatScreen(buildMessage());
    const dispatchSpy = jest.spyOn(store, 'dispatch');

    await longPressBubble();
    await act(async () => {
      fireEvent.press(screen.getByTestId('action-delete'));
    });

    expect(mockDeleteMessage).not.toHaveBeenCalled();
    expect(mockEnqueueDelete).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      forEveryone: false,
    });
    expect(mockFlushPendingMutations).toHaveBeenCalledWith('interactive');
    expect(alertSpy).not.toHaveBeenCalled();

    const deleteDispatches = dispatchSpy.mock.calls
      .map((args) => args[0])
      .filter((action: any) => action?.type === messageDeleted.type);
    expect(deleteDispatches).toHaveLength(1);

    alertSpy.mockRestore();
  });
});
