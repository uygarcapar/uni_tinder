/**
 * Faz 4 / Task 5 — arama sonucundan mesaja atlama. `ChatScreen` route
 * param'larında `targetMessageId`+`targetSentAtMs` taşıyorsa pencere
 * `chatHydrate.hydrateAroundMessage` ile YERELDEN okunur (ağ turu YOK) ve
 * liste oturunca hedefe kaydırılıp kısa süre vurgulanır.
 *
 * `chatMutationHandlers.test.ts`teki harita: ekran devasa (LegendList, klavye
 * kontrolcüsü, @expo/ui camı) — bu suite yalnız hedefli-açılış dalını
 * ilgilendiren çevresini gerçek bırakıyor (chatSlice reducer'ı,
 * `chatHydrate`/`messageHighlight` arayüzü), gerisini basit test-dostu
 * kopyalarla değiştiriyor. `chatHydrate`'in GERÇEK `hydrateAroundMessage`
 * davranışı (SQLite okuması) BURADA DEĞİL, `chatHydrate.test.ts`te pinli —
 * burada yalnız ÇAĞRI NOKTASI (ChatScreen'in dönüş değerine göre ne yaptığı)
 * sınanıyor.
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

// `chatHydrate` TAMAMEN mock'lu (disk katmanı test dışı — gerçek SQLite
// davranışı chatHydrate.test.ts'te). `hydrateAroundMessage`in dönüşü ve
// (bulunduysa) dispatch ettiği pencere her testte `__setHydrateAroundMessage`
// ile ayarlanıyor.
const mockHasLocalHistory = jest.fn((..._args: any[]) => true);
const mockHydrateConversation = jest.fn((..._args: any[]) => false);
let hydrateAroundImpl: (dispatch: any, conversationId: string, sentAtMs: number, messageId: string) => boolean =
  () => false;
const mockHydrateAroundMessage = jest.fn((...args: any[]) => (hydrateAroundImpl as any)(...args));
jest.mock('@/features/chat/chatHydrate', () => ({
  hasLocalHistory: (...args: any[]) => mockHasLocalHistory(...args),
  hydrateConversation: (...args: any[]) => mockHydrateConversation(...args),
  hydrateAroundMessage: (...args: any[]) => mockHydrateAroundMessage(...args),
  loadOlderLocalFirst: () => ({ kind: 'noop' }),
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

// Liste gerçek renderItem'ı çağırıyor (ChatScreen'in kendi mantığı) — ref/onLoad
// YOK: bu mock onları forward etmiyor, `listSettled` yalnız ChatScreen'in
// kendi 1200ms güvenlik zaman aşımıyla (onLoad hiç gelmezse) true'ya döner —
// testler bunu fake timer ile ilerletiyor.
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

jest.mock('@/features/chat/components/MessageActionSheet', () => ({
  __esModule: true,
  default: () => null,
}));

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, act } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import chatReducer, { hydrateWindow } from '@/features/chat/chatSlice';
import ChatScreen from '@/features/chat/screens/ChatScreen';

const CONVERSATION_ID = 'conv-1';
const MY_USER_ID = 'me';
const PARTNER_USER_ID = 'partner-1';
const TARGET_ID = 'msg-target';
const NEIGHBOR_ID = 'msg-neighbor';
const TARGET_SENT_AT_MS = Date.UTC(2026, 9, 20, 12, 0, 0);

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
        // Bucket BİLEREK boş: hedefli açılışın `messages.length === 0`
        // koşuluna BAĞLI OLMADIĞINI (merge edilen layout effect) ayrıca
        // sınamaya gerek yok burada — asıl iddia network çağrısı tarafında.
        messagesByConv: {},
        quotaByConv: {},
        quotaMetaByConv: {},
        unreadTotal: 0,
        conversationsLoading: false,
      } as any,
      auth: { user: { userId: MY_USER_ID, id: MY_USER_ID } } as any,
    },
  });
}

function renderChatScreen(opts: { withTarget: boolean }) {
  const store = buildStore();
  const navigation: any = { goBack: jest.fn(), setOptions: jest.fn() };
  const route: any = {
    params: {
      conversationId: CONVERSATION_ID,
      partner: { userId: PARTNER_USER_ID, displayName: 'Partner' },
      isActive: true,
      ...(opts.withTarget
        ? { targetMessageId: TARGET_ID, targetSentAtMs: TARGET_SENT_AT_MS }
        : {}),
    },
  };
  // `render()` kendi içinde zaten `act()`e sarıyor — burayı AYRICA bir
  // `act(async () => {...})` ile sarmak (chatMutationHandlers.test.ts'in
  // YAPMADIĞI şey) iç içe act çağrısının test-renderer'ı "unmounted" bir
  // duruma düşürmesine yol açıyor ("Can't access .root on unmounted test
  // renderer") — çağıran taraf mount sonrası bekleyen promise'leri AYRI bir
  // `await act(async () => {})` ile akıtmalı (aşağıdaki testlerde öyle).
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

beforeEach(() => {
  jest.clearAllMocks();
  mockHasLocalHistory.mockReturnValue(true);
  mockHydrateConversation.mockReturnValue(false);
  hydrateAroundImpl = () => false;
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

describe('hedefli açılış — arama sonucundan mesaja atlama', () => {
  it('hedefli açılışta pencere YERELDEN okunuyor, geçmiş ucu çağrılmıyor', async () => {
    hydrateAroundImpl = (dispatch) => {
      dispatch(
        hydrateWindow({
          conversationId: CONVERSATION_ID,
          messages: [
            {
              id: TARGET_ID,
              conversationId: CONVERSATION_ID,
              senderId: PARTNER_USER_ID,
              content: 'selam',
              contentType: 0,
              sentAt: new Date(TARGET_SENT_AT_MS).toISOString(),
            },
          ],
          nextCursor: null,
          hasMore: true,
          hasHiddenHistory: false,
        }),
      );
      return true;
    };

    renderChatScreen({ withTarget: true });
    await act(async () => {}); // mount effect'lerinin bekleyen promise'lerini akıt

    expect(mockHydrateAroundMessage).toHaveBeenCalledWith(
      expect.any(Function),
      CONVERSATION_ID,
      TARGET_SENT_AT_MS,
      TARGET_ID,
    );
    // Hedef lokalden BULUNDU — bu turun reconcile fetch'i (en yeni sayfa) hiç
    // atılmadı. `hydrateConversation` (normal hot-window dalı) de ÇAĞRILMADI:
    // ikisi de "ağ turu / normal açılış" dalına ait, hedefli dalda atlanmalı.
    expect(mockGetMessageHistory).not.toHaveBeenCalled();
    expect(mockHydrateConversation).not.toHaveBeenCalled();
  });

  it('hedef mesaj listede ve vurgulanmış', async () => {
    hydrateAroundImpl = (dispatch) => {
      dispatch(
        hydrateWindow({
          conversationId: CONVERSATION_ID,
          messages: [
            {
              id: NEIGHBOR_ID,
              conversationId: CONVERSATION_ID,
              senderId: PARTNER_USER_ID,
              content: 'önceki',
              contentType: 0,
              sentAt: new Date(TARGET_SENT_AT_MS - 60_000).toISOString(),
            },
            {
              id: TARGET_ID,
              conversationId: CONVERSATION_ID,
              senderId: PARTNER_USER_ID,
              content: 'selam',
              contentType: 0,
              sentAt: new Date(TARGET_SENT_AT_MS).toISOString(),
            },
          ],
          nextCursor: null,
          hasMore: true,
          hasHiddenHistory: false,
        }),
      );
      return true;
    };

    jest.useFakeTimers();
    try {
      renderChatScreen({ withTarget: true });
      await act(async () => {}); // mount effect'lerinin bekleyen promise'lerini akıt
      // `listSettled` ChatMessageList mock'unun `onLoad`'u hiç çağırmamasından
      // dolayı yalnız ChatScreen'in 1200ms güvenlik zaman aşımıyla true olur
      // (bkz. mock'un başındaki not) — vurgu/kaydırma efekti ancak ondan sonra
      // tetikleniyor.
      await act(async () => {
        jest.advanceTimersByTime(1300);
      });
    } finally {
      jest.useRealTimers();
    }

    // Hedef balon GERÇEKTEN render edilen listede.
    expect(screen.getByTestId(`bubble-${TARGET_ID}`)).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenCalledWith(TARGET_ID);
  });

  it('arşivde olmayan hedefte normal açılışa düşüyor', async () => {
    // Hedef bulunamadı: hydrateAroundMessage false döner, HİÇBİR pencere
    // dispatch etmez (chatHydrate.test.ts'teki sözleşme) — ChatScreen normal
    // açılış dalına (hadInitialMessagesRef'e göre hydrateConversation +
    // reconcile fetchHistory) düşmeli.
    hydrateAroundImpl = () => false;
    mockHasLocalHistory.mockReturnValue(false); // bucket boş + disk boş → "boş açılan" dal

    renderChatScreen({ withTarget: true });
    await act(async () => {}); // mount effect'lerinin bekleyen promise'lerini akıt

    expect(mockHydrateAroundMessage).toHaveBeenCalled();
    expect(mockHighlightMessage).not.toHaveBeenCalled();
    // Normal açılış: hot-window hydrate'i VE reconcile/ilk fetchHistory
    // ÇAĞRILDI — hedefsiz açılışla AYNI yol.
    expect(mockHydrateConversation).toHaveBeenCalledWith(expect.any(Function), CONVERSATION_ID);
    expect(mockGetMessageHistory).toHaveBeenCalled();
  });
});
