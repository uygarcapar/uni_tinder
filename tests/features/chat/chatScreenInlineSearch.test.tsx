/**
 * Faz 4 / Task 6 — sohbet içinde arama. Başlıktaki büyüteç açar;
 * `chatRepository.searchMessages` `{ conversationId }` ile SINIRLI çalışır,
 * ileri/geri Task 5'in atlama mekanizmasını (hydrateAroundMessage + aynı
 * scroll/highlight yolu) KULLANIR — ikinci bir atlama yolu icat edilmedi.
 *
 * Review turu 1 bu suite'in GERİSİNDE bir Kritik + iki Important + beş Minor
 * buldu (bkz. görev raporunun "Fix round 1" bölümü) — aşağıdaki testler o
 * turdan sonra eklendi/genişletildi, her biri hangi kırılmayı YAKALADIĞINI
 * yorumunda söylüyor.
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

// Review turu 1, Important 3 — "`scrollToIndex` sadece `highlightMessage`
// ispatlanıyor, hop'un KENDİSİ hiç pinlenmiyor" bulgusu burada kapatılıyor:
// `listRef` prop'u (ChatScreen'in kendi `useRef`i, React `ref=` DEĞİL — bkz.
// ChatMessageList.tsx: gerçek bileşen bunu `ref={listRef}`le LegendList'e
// bağlıyor) bu mock'ta DOLDURULUYOR ki `scrollToIndex`/`scrollToEnd` çağrıları
// gözlemlenebilsin.
const mockScrollToIndex = jest.fn();
const mockScrollToEnd = jest.fn();
jest.mock('@/features/chat/components/ChatMessageList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem, listRef }: any) => {
      if (listRef && !listRef.current) {
        listRef.current = { scrollToIndex: mockScrollToIndex, scrollToEnd: mockScrollToEnd };
      }
      return React.createElement(
        View,
        null,
        (data || []).map((item: any, index: number) =>
          React.createElement(
            View,
            { key: item.id ?? `row-${index}` },
            renderItem({ item, index, data }),
          ),
        ),
      );
    },
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
import { Keyboard } from 'react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import chatReducer, { hydrateWindow, receiveMessage, messageEdited } from '@/features/chat/chatSlice';
import ChatScreen from '@/features/chat/screens/ChatScreen';
import i18n from '@/shared/i18n';

const CONVERSATION_ID = 'conv-1';
const CONVERSATION_ID_B = 'conv-2';
const MY_USER_ID = 'me';
const PARTNER_USER_ID = 'partner-1';
const BASE_MS = Date.UTC(2026, 9, 20, 12, 0, 0);

function authReducer(state = { user: { userId: MY_USER_ID, id: MY_USER_ID } }) {
  return state;
}

function buildStore(initialBucket?: any) {
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
          {
            conversationId: CONVERSATION_ID_B,
            partnerUserId: 'partner-2',
            partnerDisplayName: 'Partner B',
            partnerProfileImageUrl: null,
            isActive: true,
            mode: 'Dating',
          },
        ],
        messagesByConv: initialBucket ? { [CONVERSATION_ID]: initialBucket } : {},
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

function routeFor(conversationId: string) {
  return {
    params: {
      conversationId,
      partner: { userId: PARTNER_USER_ID, displayName: 'Partner' },
      isActive: true,
    },
  };
}

function renderChatScreen(opts: { initialBucket?: any } = {}) {
  const store = buildStore(opts.initialBucket);
  const navigation: any = { goBack: jest.fn(), setOptions: jest.fn() };
  const element = (conversationId: string) =>
    React.createElement(Provider, {
      store,
      children: React.createElement(NavigationContainer, {
        children: React.createElement(ChatScreen as any, {
          route: routeFor(conversationId),
          navigation,
        }),
      }),
    });
  const { rerender } = render(element(CONVERSATION_ID));
  return {
    store,
    /** Aynı ekran ÖRNEĞİNİ (remount DEĞİL) başka bir conversationId'yle rerender eder. */
    rerenderWithConversation: (conversationId: string) => rerender(element(conversationId)),
  };
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

function messageDto(id: string, sentAtMs: number, overrides: any = {}) {
  return {
    id,
    conversationId: CONVERSATION_ID,
    senderId: PARTNER_USER_ID,
    content: 'selam',
    contentType: 0,
    sentAt: new Date(sentAtMs).toISOString(),
    ...overrides,
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

  /**
   * Review turu 1, Important 2 — `searchMessages` newest-first döner ve
   * EKRAN BU SIRAYI KORUYOR (yeniden sıralamıyor): index 0 = en yeni = "1/N".
   * İlk basılan "ileri" (WhatsApp/Telegram kuralı: birincil yön GEÇMİŞE
   * gider) "1/3 → 2/3"e gitmeli — eski sürüm (en eski→en yeni sıralı, ileri
   * = +1) başlangıçtan basınca `(len-1+1)%len===0`'a, DOĞRUDAN en eski
   * eşleşmeye sarıyordu. Bu test başlangıç konumundan TEK bir "ileri"
   * basışını özel olarak sınıyor.
   */
  it('ileri/geri eşleşmeler arasında dönüyor, sayaç doğru, ilk "ileri" basışı en eskiye SARMIYOR', async () => {
    mockSearchMessages.mockReturnValue([
      hitFixture('m-newest', BASE_MS + 2000),
      hitFixture('m-mid', BASE_MS + 1000),
      hitFixture('m-oldest', BASE_MS),
    ]);
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [messageDto(messageId, sentAtMs)],
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

    // Açılışta EN YENİ eşleşmeye atlanır, index 0 → sayaçta "1/3".
    expect(screen.getByText('1/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-newest');
    // Review turu 2 — `expect.any(Number)` çağrının OLDUĞUNU kanıtlıyordu,
    // HANGİ satıra kaydırdığını DEĞİL (yanlış index'e kayan bir hop da
    // geçerdi). `hydrateAroundImpl` her hop'ta pencereyi TEK mesajlık taze
    // bir bucket'a çeviriyor (bkz. yukarıdaki `messages: [messageDto(...)]`)
    // — `withDateSeparators` her zaman tek bir gün separator'ı + o mesajı
    // üretir (ayrı günler yok, `seenDays` her render'da sıfırdan başlar),
    // yani hedef satır HER hop'ta deterministik biçimde index 1'de.
    expect(mockScrollToIndex).toHaveBeenLastCalledWith({
      index: 1,
      animated: true,
      viewPosition: 0.5,
    });
    // Başlangıç indeksi başka bir değere düşüp sonra düzeltilmiyor — TEK
    // atlama. Bu, "iki ayrı efekt" sürümünün ürettiği (önce yanlış hedefe,
    // sonra doğruya zıplayan) kırpışmayı pinliyor: kırılırsa bu sayı 2'ye çıkar.
    expect(mockHydrateAroundMessage).toHaveBeenCalledTimes(1);
    expect(mockHighlightMessage).toHaveBeenCalledTimes(1);

    // İLK "ileri" basışı — Important 2'nin tam konusu: 1/3 → 2/3 (bir SONRAKİ,
    // daha ESKİ eşleşme), EN ESKİYE sarmıyor.
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-mid');

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-oldest');

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-prev'));
    });
    expect(screen.getByText('2/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-mid');

    // Fetch-once (karar 2): sorgu DEĞİŞMEDİ, dört hop'un hiçbiri SQL'i tekrar
    // tetiklemedi — tutulan sonuç listesi hop başına yeniden çekilmiyor.
    expect(mockSearchMessages).toHaveBeenCalledTimes(1);
  });

  it('başlangıç konumundan "geri" basışı EN YENİYE gidecek bir şey olmadığı için en eskiye sarıyor', async () => {
    mockSearchMessages.mockReturnValue([
      hitFixture('m-newest', BASE_MS + 2000),
      hitFixture('m-mid', BASE_MS + 1000),
      hitFixture('m-oldest', BASE_MS),
    ]);
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [messageDto(messageId, sentAtMs)],
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
    expect(screen.getByText('1/3')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-prev'));
    });
    // Tek sarma noktası BURASI (ruling) — daha yeniye gidecek bir şey yok,
    // en eskiye sarıyor.
    expect(screen.getByText('3/3')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-oldest');
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

  /**
   * Review turu 1, Minor 6 — TEK eşleşmede `(0+1)%1 === 0`, yani
   * `inlineSearchIndex` state'i AYNI değere set edilir ve React re-render'ı
   * atlar: eski sürümde "tekrar vurgula" niyetiyle basan kullanıcı HİÇBİR ŞEY
   * görmüyordu. `inlineSearchHopNonce` index değişmese de atlama efektini
   * tetikliyor — bu test ikinci basıştaki highlight'ın GERÇEKTEN tekrar
   * çağrıldığını pinliyor.
   */
  it('tek eşleşmede next tekrar basılınca YİNE vurguluyor (sessizce hiçbir şey yapmıyor DEĞİL)', async () => {
    mockSearchMessages.mockReturnValue([hitFixture('m-only', BASE_MS)]);
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [messageDto(messageId, sentAtMs)],
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

    expect(mockHighlightMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    // Index DEĞİŞMEDİ (hâlâ tek eşleşme, "1/1") ama vurgu YİNE tetiklendi.
    expect(screen.getByText('1/1')).toBeTruthy();
    expect(mockHighlightMessage).toHaveBeenCalledTimes(2);
    expect(mockHighlightMessage).toHaveBeenLastCalledWith('m-only');
  });

  /**
   * Review turu 1, Minor 9 — tavana (`INLINE_SEARCH_LIMIT`) TAKILAN bir
   * sorgu, sayaçta "`/200`" basıp bunun GERÇEK toplam olduğunu YALANLARDI
   * (200'ün üzerinde eşleşme olabilir, yalnız ilk 200 okundu). "+" ekiyle
   * dürüst kalmalı.
   */
  it('tavana takılan eşleşme sayısında sayaç "200+" basıyor, "200" DEĞİL', async () => {
    const manyHits = Array.from({ length: 200 }, (_, i) =>
      hitFixture(`m-${i}`, BASE_MS + i * 1000),
    );
    mockSearchMessages.mockReturnValue(manyHits);
    hydrateAroundImpl = () => false;

    renderChatScreen();
    await act(async () => {});
    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(screen.getByText('1/200+')).toBeTruthy();
    expect(screen.queryByText('1/200')).toBeNull();
  });

  /**
   * Review turu 2, Minor 4 — hiçbir test bir sonuç kümesini KÜÇÜLTMÜYORDU,
   * yani `inlineSearchDisplayIndex`i (render'daki `Math.min` clamp'i) kaldırıp
   * çağrı yerlerini çiğ `inlineSearchIndex`e geri çevirsen bile bu suite'in
   * HİÇBİR testi kırılmazdı. Bu test geç bir index'te PARK EDİP sorguyu
   * DARALTIYOR ve sayacın hiçbir zaman total'den büyük bir current
   * BASMADIĞINI doğruluyor.
   *
   * ── Dürüstlük notu ───────────────────────────────────────────────────────
   * RNTL'in `act()`i bir efekt zincirini (burada: "yeni sonuç kümesi → index
   * sıfırla → bir sonraki render'da doğru hedefe atla") tek çağrıda TAMAMEN
   * tüketip stabil son duruma kadar akıtıyor — `act()` dönene kadar ara
   * commit'leri `screen` üzerinden GÖZLEMLEMENİN bilinen bir yolu yok. Yani bu
   * test clamp'in koruduğu TEK KARELİK ara durumu DOĞRUDAN yakalamıyor;
   * yakaladığı şey SON (ayarlanmış) durumun hep tutarlı kaldığı — ki bu,
   * index-sıfırlama efekti (ayrı bir mekanizma) sayesinde clamp OLMASA DA
   * doğru çıkıyor. Yine de pratik değeri var: index-sıfırlama efekti
   * BOZULURSA (ör. yanlışlıkla kaldırılırsa) bu test YAKALAR — ki bu,
   * clamp'in tek başına koruduğundan daha GERÇEKÇİ bir regresyon sınıfı.
   */
  it('geç bir index\'te park edip sorgu daraldığında sayaç hiçbir zaman total\'den büyük current basmıyor', async () => {
    mockSearchMessages.mockReturnValue([
      hitFixture('m-5', BASE_MS + 5000),
      hitFixture('m-4', BASE_MS + 4000),
      hitFixture('m-3', BASE_MS + 3000),
      hitFixture('m-2', BASE_MS + 2000),
      hitFixture('m-1', BASE_MS + 1000),
    ]);
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [messageDto(messageId, sentAtMs)],
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
    expect(screen.getByText('1/5')).toBeTruthy();

    // Geç bir index'te PARK ET — "4/5".
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-next'));
    });
    expect(screen.getByText('4/5')).toBeTruthy();

    // Sorguyu DARALT — yeni (daha kısa) sonuç kümesi: 2 eşleşme.
    mockSearchMessages.mockReturnValue([
      hitFixture('m-narrow-2', BASE_MS + 2000),
      hitFixture('m-narrow-1', BASE_MS + 1000),
    ]);
    jest.useFakeTimers();
    try {
      fireEvent.changeText(
        screen.getByTestId('chat-inline-search-input'),
        'selamlar',
      );
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    // Sayaç DOĞRU son durumda — "4/2" gibi aralık dışı bir değer YOK,
    // yeni kümenin EN YENİSİNE (index 0) dönülmüş: "1/2".
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.queryByText(/^[2-9]\/2$/)).toBeNull();
    expect(screen.queryByText(/^4\//)).toBeNull();
  });

  /**
   * Review turu 1 — Kritik. `hydrateAroundMessage` KOŞULSUZ `isWindowed:true`
   * yazıyor (chatHydrate.ts); başlangıç konumu EN YENİ eşleşme olduğu için az
   * önce konuşulan bir kelimeyi aramak PRATİKTE hep "hedef zaten hot
   * window'da" durumuna denk geliyordu — yine de bayrak dikiliyor,
   * `receiveMessage`in pencereli-bucket dalı canlı mesajları SESSİZCE
   * yutuyordu. Bu test: hedef bucket'ta ZATEN mevcutken (ve bucket pencereli
   * DEĞİLKEN) arama `hydrateAroundMessage`e HİÇ gitmiyor, bayrak `false`
   * kalıyor, ve arkadan gelen bir canlı mesaj GÖRÜNÜYOR (yutulmuyor).
   */
  it('arama zaten hot window\'daki bir mesajı buluyor — pencerelenmiyor, canlı mesaj GÖRÜNÜYOR', async () => {
    const hotSentAtMs = BASE_MS;
    mockSearchMessages.mockReturnValue([hitFixture('m-hot', hotSentAtMs)]);
    hydrateAroundImpl = jest.fn(() => {
      throw new Error('hydrateAroundMessage ÇAĞRILMAMALIYDI — hedef zaten hot window\'da');
    });

    const { store } = renderChatScreen({
      initialBucket: {
        messages: [messageDto('m-hot', hotSentAtMs)],
        nextCursor: null,
        hasMore: true,
        hasHiddenHistory: false,
        loading: false,
        isWindowed: false,
      },
    });
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockHydrateAroundMessage).not.toHaveBeenCalled();
    expect(
      (store.getState() as any).chat.messagesByConv[CONVERSATION_ID]?.isWindowed,
    ).toBe(false);
    expect(mockHighlightMessage).toHaveBeenCalledWith('m-hot');
    expect(screen.queryByTestId('chat-go-to-latest')).toBeNull();

    await act(async () => {
      store.dispatch(
        receiveMessage({
          id: 'live-1',
          conversationId: CONVERSATION_ID,
          senderId: PARTNER_USER_ID,
          content: 'az önce geldi',
          contentType: 0,
          sentAt: new Date().toISOString(),
        } as any),
      );
    });

    // Canlı mesaj YUTULMADI — bayrak hiç dikilmediği için receiveMessage'ın
    // "şu an" dalı çalıştı.
    expect(screen.getByTestId('bubble-live-1')).toBeTruthy();
    expect(screen.getByTestId('bubble-m-hot')).toBeTruthy();
  });

  /**
   * Review turu 1 — Kritik'in ikinci yarısı. Eski sürüm arama açıkken
   * `isWindowed && !inlineSearchOpen` koşuluyla "Son mesaja dön" banner'ını
   * TAMAMEN gizliyordu — bucket pencereliyken kullanıcının "şu an"dan
   * koptuğunu görebileceği TEK işaret, tam o an gizleniyordu. Artık
   * `isWindowed ⇒ banner görünür` KOŞULSUZ.
   */
  it('pencereli bucket\'ta arama açıkken dahi "Son mesaja dön" banner\'ı görünür kalıyor', async () => {
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [messageDto(messageId, sentAtMs)],
          nextCursor: null,
          hasMore: true,
          hasHiddenHistory: false,
          isWindowed: true,
        }),
      );
      return true;
    };
    mockSearchMessages.mockReturnValue([hitFixture('m-1', BASE_MS)]);

    renderChatScreen();
    await act(async () => {});
    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    // İki kontrol de AÇIK — biri diğerini bastırmıyor.
    expect(screen.getByTestId('chat-go-to-latest')).toBeTruthy();
    expect(screen.getByTestId('chat-inline-search-input')).toBeTruthy();
  });

  /**
   * Review turu 1, Important 3 — suite 1000ms ilerletip TEK `changeText`
   * gönderiyordu, bu yüzden debounce'u SIFIRA indiren bir implementasyon
   * AYNI şekilde geçerdi. `messagesScreenSearch.test.tsx`teki prob aynı
   * şekilde burada da: debounce PENCERESİNİN İÇİNDE art arda iki `changeText`
   * gönderip SQL'in yalnız SONUNCU değerle VE TEK SEFER çağrıldığını kanıtlıyor.
   */
  it('debounce penceresi içinde art arda yazılan iki değer SQL\'e TEK seferde gidiyor', async () => {
    renderChatScreen();
    await act(async () => {});

    fireEvent.press(screen.getByTestId('chat-search-open'));
    const input = screen.getByTestId('chat-inline-search-input');
    jest.useFakeTimers();
    try {
      fireEvent.changeText(input, 'se');
      // Debounce süresinin (220ms) İÇİNDE — zamanlayıcı henüz dolmadı.
      act(() => {
        jest.advanceTimersByTime(100);
      });
      expect(mockSearchMessages).not.toHaveBeenCalled();
      fireEvent.changeText(input, 'sel');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockSearchMessages).toHaveBeenCalledTimes(1);
    expect(mockSearchMessages).toHaveBeenCalledWith('sel', {
      conversationId: CONVERSATION_ID,
      limit: expect.any(Number),
    });
  });

  /**
   * Review turu 1, Important 3 — `MIN_SEARCH_LENGTH` (2) altı bir sorgu hiç
   * SQL'e gitmemeli; eşik testi önceden YOKTU (yalnız "selam" gibi geçerli
   * sorgularla çalışılmıştı).
   */
  it('eşik altı (1 karakter) sorgu SQL\'e hiç gitmiyor', async () => {
    renderChatScreen();
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('a');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockSearchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('chat-inline-search-empty')).toBeNull();
    expect(screen.queryByTestId('chat-inline-search-counter')).toBeNull();
  });

  /**
   * Review turu 1, Important 3 — `handleCloseInlineSearch`in "her alanı
   * sıfırlıyor" iddiası önceden HİÇ test edilmiyordu (X'e kimse basmıyordu).
   */
  it('X\'e basınca arama kapanır VE sorgu sıfırlanır — yeniden açılışta eski sorgu/sonuç dirilmiyor', async () => {
    mockSearchMessages.mockReturnValue([hitFixture('m-1', BASE_MS)]);
    renderChatScreen();
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});
    expect(screen.getByTestId('chat-inline-search-counter')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-close'));
    });
    expect(screen.queryByTestId('chat-inline-search-input')).toBeNull();

    // Yeniden aç — eski sorgu/sayaç DİRİLMEMELİ.
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-search-open'));
    });
    expect((screen.getByTestId('chat-inline-search-input').props as any).value).toBe('');
    expect(screen.queryByTestId('chat-inline-search-counter')).toBeNull();
  });

  /**
   * Review turu 1, Minor 7 — `[conversationId]` sigorta efekti MOUNT'ta da
   * çalışıyor; eski sürüm orada da `Keyboard.dismiss()` çağırıyordu (arama
   * henüz açılmamışken klavyeye dokunmanın hiçbir anlamı yok). Bu test
   * mount'ta dismiss çağrılMADIĞINI, kullanıcının X'e basmasında ise
   * çağrıldığını ayırıyor.
   */
  it('mount sırasında Keyboard.dismiss çağrılmıyor — açma/kapama kendi dismiss\'ini taşıyor', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    renderChatScreen();
    await act(async () => {});
    // `[conversationId]` sigorta efekti MOUNT'ta da çalışır (conversationId
    // her zaman "ilk kez ayarlanır") — eski sürüm orada da dismiss çağırıyordu,
    // arama henüz açılmamışken klavyeye dokunmanın hiçbir anlamı yoktu.
    expect(dismissSpy).not.toHaveBeenCalled();

    // Büyütece basmak KENDİ dismiss'ini taşıyor (klavyenin autoFocus'a yer
    // açması için) — bu, sigorta efektinden AYRI, meşru bir çağrı.
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-search-open'));
    });
    expect(dismissSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat-inline-search-close'));
    });
    expect(dismissSpy).toHaveBeenCalledTimes(2);
    dismissSpy.mockRestore();
  });

  /**
   * Review turu 1, Important 3 — reviewer'ın "gerçek bir tehlike" dediği
   * sigorta, sıfır testle bırakılmıştı. `conversationId` DEĞİŞİNCE (aynı
   * ekran örneği — remount DEĞİL) tutulan arama durumu YENİ sohbete
   * taşınmamalı.
   */
  it('conversationId değişince (aynı ekran örneği) arama kapanıp sıfırlanıyor', async () => {
    mockSearchMessages.mockReturnValue([hitFixture('m-1', BASE_MS)]);
    const { rerenderWithConversation } = renderChatScreen();
    await act(async () => {});

    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});
    expect(screen.getByTestId('chat-inline-search-input')).toBeTruthy();

    await act(async () => {
      rerenderWithConversation(CONVERSATION_ID_B);
    });

    // Eski sohbetin tutulan arama durumu YENİ sohbette GÖRÜNMÜYOR.
    expect(screen.queryByTestId('chat-inline-search-input')).toBeNull();
  });

  /**
   * Review turu 1, Important 3 — suite yalnız Türkçe sözlüğü (varsayılan
   * `lng: 'tr'`) üzerinden çalışıyordu; `en.ts`teki anahtarların aynı
   * şekle sahip olduğu HİÇ sınanmıyordu (ör. tr'de key var, en'de unutulmuş
   * olabilirdi, i18next sessizce anahtar adını basardı). `getFixedT('en')`
   * global dili DEĞİŞTİRMEDEN İngilizce sözlüğü doğrudan sorguluyor.
   */
  it('en.ts sözlüğündeki inlineSearch anahtarları da dolu ve aynı şekilde interpolasyon yapıyor', () => {
    const tEn = i18n.getFixedT('en');
    expect(tEn('chat.inlineSearch.openLabel')).toBe('Search in chat');
    expect(tEn('chat.inlineSearch.counter', { current: 2, total: 5 })).toBe('2/5');
    expect(tEn('chat.inlineSearch.empty')).toBe('No results');
  });

  /**
   * Review turu 2, Minor 5 — review turu 1'in testi `hydrateAroundMessage`i
   * `found:false` döndürerek "miss" simüle ediyordu, ama o dalda
   * `pendingInlineSearchJumpRef` HİÇ ARMA EDİLMİYOR (`if (found) ref.current
   * = ...` — false'ta ref'e hiç dokunulmuyor), yani eski (hatalı) sıralama
   * ("ref'i `findIndex`TEN SONRA temizle") ile yeni sıralama arasında BU
   * testte gözlenebilir bir fark YOKTU; kod reverte edilse de test geçerdi.
   *
   * Gerçek ayrım noktası `found:true` + hedefin `renderedData`dan FİLTRELENMİŞ
   * olması (ör. "sadece benden sil" → `deletedAt` var, `deletedForEveryone:
   * false`, bkz. messagesWithSeparators'daki filtre) — bu durumda ref ARMA
   * EDİLİYOR ama `findIndex` −1 dönüyor ("miss" ama ref dolu). Eski kod bu
   * noktada ref'i TEMİZLEMEDEN `return` ediyordu; ref sonsuza dek silahlı
   * kalıyordu. Hedefin KENDİSİ bir daha asla görünür olmasa bile (silinmiş
   * mesaj geri gelmez) ref'in GERÇEKTEN temizlenip temizlenmediğini
   * gözlemlemenin yolu: aynı mesajı (search'ün BİLGİSİ OLMADAN) sonradan
   * `messageEdited` ile "geri al" (başarısız bir silme isteğinin snapshot
   * geri yüklemesiyle AYNI yol, bkz. ChatScreen.handleDelete'in catch bloğu)
   * — mesaj artık `renderedData`da GÖRÜNÜR olur. Eski kod hâlâ silahlı
   * ref'i okur, `findIndex` artık ≥0 döner, ve kullanıcının çok önce
   * bıraktığı bir arama hop'u BEKLENMEDİK şekilde kaydırıp vurgular. Yeni
   * kod ref'i ilk miss'te zaten temizlediği için bu İKİNCİ (alakasız)
   * `messages` değişiminde hiçbir şey yapmaz.
   */
  it('miss\'te (filtrelenmiş hedef) ref temizleniyor — hedef SONRADAN görünür olsa bile eski arama hop\'u onu vurgulamıyor', async () => {
    const DELETED_ID = 'm-deleted';
    mockSearchMessages.mockReturnValue([hitFixture(DELETED_ID, BASE_MS)]);
    // `found:true` — ref ARMA EDİLİYOR — ama pencere hedefi "sadece benden
    // sil" ile işaretli dispatch ediyor: `messagesWithSeparators`in filtresi
    // (`!(m.deletedAt && !m.deletedForEveryone)`) onu `renderedData`dan ELER.
    hydrateAroundImpl = (dispatch, conversationId, sentAtMs, messageId) => {
      dispatch(
        hydrateWindow({
          conversationId,
          messages: [
            messageDto(messageId, sentAtMs, {
              deletedAt: new Date().toISOString(),
              deletedForEveryone: false,
            }),
          ],
          nextCursor: null,
          hasMore: true,
          hasHiddenHistory: false,
          isWindowed: true,
        }),
      );
      return true;
    };

    const { store } = renderChatScreen();
    await act(async () => {});
    jest.useFakeTimers();
    try {
      openSearchAndType('selam');
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    // Miss: hedef filtrelenmiş, hiçbir şey vurgulanmadı/kaydırılmadı.
    expect(mockHighlightMessage).not.toHaveBeenCalled();
    expect(mockScrollToIndex).not.toHaveBeenCalled();

    // Aramayla TAMAMEN alakasız bir sonraki olay: mesaj "geri alınıyor"
    // (başarısız silme isteğinin snapshot restore'u, bkz. handleDelete'in
    // catch bloğu — AYNI action). Hedef artık `renderedData`da GÖRÜNÜR.
    await act(async () => {
      store.dispatch(
        messageEdited(
          messageDto(DELETED_ID, BASE_MS, {
            deletedAt: undefined,
            deletedForEveryone: false,
          }) as any,
        ),
      );
    });

    // Ref zaten (ilk miss'te) temizlendiği için bu alakasız değişiklik
    // çok önceki arama hop'unu DİRİLTMİYOR — ne highlight ne scroll.
    expect(mockHighlightMessage).not.toHaveBeenCalled();
    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });
});
