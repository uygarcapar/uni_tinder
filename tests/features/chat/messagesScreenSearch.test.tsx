/**
 * Faz 4 / Task 4 — global aramada "Mesajlar" bölümü. `MessagesScreen`in HİÇBİR
 * test kapsamı yoktu (ekran ~2000 satır: pager, ScreenHeader, reanimated
 * koreografisi) — bu suite ekranın GERÇEĞİNİ mount ediyor, yalnız native/ağır
 * çevresini (pager-view, PagerTabBar'ın reanimated iç tesisatı, premium tier,
 * plus sheet girişi) test-dostu kopyalarla değiştiriyor. `react-native-mmkv`
 * ve `expo-secure-store`/`expo-crypto` zaten proje-genel mock'lu (bkz.
 * __mocks__/react-native-mmkv.ts, jest.setup.ts) — `useAppMode`/`useDrafts`
 * GERÇEK bırakılabiliyor.
 *
 * `@react-navigation/native`in `useFocusEffect`'i düz bir mount-effect'e
 * indirgendi (navigator ağacı KURULMADI — gerçek bir Stack.Navigator/
 * react-native-screens kurmak bu suitenin konusuyla ilgisiz bir risk
 * eklerdi); `useNavigation` ise doğrudan gözlemlenebilir bir `jest.fn()`
 * döndürüyor.
 */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    __esModule: true,
    useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
    // Gerçek `useFocusEffect` navigator ağacına (addListener('focus', ...))
    // bağlı — burada navigator YOK, bu yüzden düz bir "mount'ta bir kez çalış"
    // efektine indirgendi. Ekranın odak-kaybında/-kazanımında TEKRAR çalışma
    // davranışı bu suitenin iddialarının HİÇBİRİNDE kullanılmıyor.
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
  };
});

// PagerTabBar'ın kendisi reanimated'ın useAnimatedRef/scrollTo/useHandler gibi
// düşük seviye worklet API'lerini kullanıyor — bu suitenin konusu "Mesajlar"
// bölümü, sekme şeridinin kaydırma koreografisi değil. Şerit görsel bir
// kopyayla, pager'ın imperative yüzeyi (`setPage`) no-op'la değiştirildi.
jest.mock('@/shared/components/PagerTabBar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => null,
    AnimatedPagerView: React.forwardRef(({ children }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        setPage: () => {},
        setPageWithoutAnimation: () => {},
      }));
      return React.createElement(View, null, children);
    }),
    usePagerScrollHandler: () => undefined,
    usePagerTabCommit: () => ({
      onPageSelected: () => {},
      onPageScrollStateChanged: () => {},
    }),
  };
});

jest.mock('react-native-easing-gradient', () => ({
  easeGradient: () => ({ colors: ['#000', '#fff'], locations: [0, 1] }),
}));

jest.mock('@/shared/components/WaveFillLogo', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/features/profile/premiumTier', () => ({
  usePremiumTier: () => ({ isPremium: false, resolved: true }),
}));

jest.mock('@/features/profile/litPlusEntry', () => ({
  openLitPlus: jest.fn(),
}));

const mockGetConversations = jest.fn((..._args: any[]) => Promise.reject(new Error('no network in test')));
const mockGetMessageHistory = jest.fn((..._args: any[]) => Promise.reject(new Error('no network in test')));
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: {
    getConversations: (...args: any[]) => mockGetConversations(...args),
    getMessageHistory: (...args: any[]) => mockGetMessageHistory(...args),
    deactivateConversation: jest.fn(),
    restoreConversation: jest.fn(),
  },
  HISTORY_PAGE_SIZE: 50,
}));

const mockHydrateConversation = jest.fn();
jest.mock('@/features/chat/chatHydrate', () => ({
  hydrateConversation: (...args: any[]) => mockHydrateConversation(...args),
  readVoiceDurationsFromLocal: () => ({}),
}));

// `searchMessages` TEK gerçek davranışı `chatRepository`den geliyor —
// `messageSearchRepo.test.ts`in SQLite'a vuran GERÇEK testi var. Burada tam
// repository mock'lanıyor ki bu suite SQLite açmak zorunda kalmasın (ekranın
// konusu "hangi sorguda bölüm görünür/gizlenir", SQL'in kendisi değil).
const mockSearchMessages = jest.fn((..._args: any[]) => [] as any[]);
jest.mock('@/features/chat/chatRepository', () => ({
  searchMessages: (...args: any[]) => mockSearchMessages(...args),
  debugLastMessageRows: () => [],
}));

jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: jest.fn(),
  hideToast: jest.fn(),
}));

jest.mock('@/features/chat/components/ConversationOptionsSheet', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/shared/components/ReportModal', () => ({
  __esModule: true,
  default: () => null,
}));

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import chatReducer from '@/features/chat/chatSlice';
import MessagesScreen from '@/features/chat/screens/MessagesScreen';
import { MIN_SEARCH_LENGTH } from '@/features/chat/messageSearch';

const CONVERSATION_ID = 'conv-1';
const PARTNER_USER_ID = 'partner-1';

function authReducer(state = { user: { userId: 'me', id: 'me' } }) {
  return state;
}

function buildStore() {
  const chatInitial = chatReducer(undefined, { type: '@@INIT' });
  return configureStore({
    reducer: { chat: chatReducer, auth: authReducer },
    preloadedState: {
      chat: {
        ...chatInitial,
        conversations: [
          {
            conversationId: CONVERSATION_ID,
            partnerUserId: PARTNER_USER_ID,
            partnerDisplayName: 'Ayşe',
            partnerProfileImageUrl: null,
            isActive: true,
            mode: 'Dating',
            unreadCount: 0,
            lastMessageAt: new Date().toISOString(),
          },
        ],
        // "settled" — boş durum flaşını önlemek için (bkz. ekranın kendi notu).
        _conversationsFetchedAt: Date.now(),
      } as any,
      auth: { user: { userId: 'me', id: 'me' } } as any,
    },
  });
}

function renderMessagesScreen() {
  const store = buildStore();
  render(
    React.createElement(Provider, {
      store,
      children: React.createElement(MessagesScreen),
    }),
  );
  return { store };
}

function searchBox() {
  return screen.getByTestId('msgs-search-input');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchMessages.mockReturnValue([]);
  mockGetConversations.mockImplementation(() => Promise.reject(new Error('no network in test')));
  mockGetMessageHistory.mockImplementation(() => Promise.reject(new Error('no network in test')));
});

describe('MessagesScreen — global aramada mesaj bölümü', () => {
  it('sorgu eşiğin altındayken mesaj bölümü görünmüyor, sohbet süzgeci çalışıyor', async () => {
    renderMessagesScreen();

    const input = searchBox();
    fireEvent(input, 'focus');
    jest.useFakeTimers();
    try {
      // Tek harf — MIN_SEARCH_LENGTH (2) altı. `searchMessages` HİÇ
      // ÇAĞRILMAMALI (eşik altı sorgu `prepareSearchQuery`den `null` döner, SQL'e
      // hiç gidilmez) ve mesaj bölümü render edilmemeli. "a" BİLEREK seçildi:
      // "Ayşe"nin katlanmış hâlinde geçiyor, yani sohbet süzgecinin (bellek-içi
      // `includes`, eşiğe bağlı DEĞİL) hâlâ çalıştığını satırın GÖRÜNMESİYLE
      // kanıtlıyoruz — ikisini aynı anda sınamak, "mesaj bölümü kapanınca sohbet
      // listesi de kazayla kapandı" türü bir regresyonu yakalar.
      fireEvent(input, 'changeText', 'a'.repeat(MIN_SEARCH_LENGTH - 1));
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockSearchMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId('msgs-message-section')).toBeNull();
    expect(screen.getByText('Ayşe')).toBeTruthy();
  });

  it('eşik üstünde mesaj sonuçları listeleniyor', async () => {
    mockSearchMessages.mockReturnValue([
      {
        messageId: 'm1',
        conversationId: CONVERSATION_ID,
        sentAtMs: Date.now(),
        content: 'yarın sinemaya gidelim mi',
        partnerDisplayName: 'Ayşe',
      },
    ]);
    renderMessagesScreen();

    const input = searchBox();
    fireEvent(input, 'focus');
    jest.useFakeTimers();
    try {
      fireEvent(input, 'changeText', 'sinema');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockSearchMessages).toHaveBeenCalledWith('sinema', { limit: expect.any(Number) });
    // Üç sekme sayfası (Tümü/Okunmamış/Kapalı) aynı anda canlı (bkz. ekranın
    // kendi "ÜÇ SEKMENİN HEPSİ birden" notu) — bölüm HER sayfada belirir, bu
    // yüzden `getAllByTestId`. Tekil `getByTestId` burada YANLIŞ iddia olurdu.
    expect(screen.getAllByTestId('msgs-message-section').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('msgs-message-hit-m1').length).toBeGreaterThan(0);
  });

  it('sonuç yokken "mesaj bulunamadı" satırı çıkıyor — bölüm sessizce kaybolmuyor', async () => {
    mockSearchMessages.mockReturnValue([]);
    renderMessagesScreen();

    const input = searchBox();
    fireEvent(input, 'focus');
    jest.useFakeTimers();
    try {
      fireEvent(input, 'changeText', 'zeynep');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});

    expect(mockSearchMessages).toHaveBeenCalled();
    expect(screen.getAllByTestId('msgs-message-section').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('msgs-message-section-empty').length).toBeGreaterThan(0);
  });

  it('arama kapanınca mesaj bölümü kalkıyor', async () => {
    mockSearchMessages.mockReturnValue([
      {
        messageId: 'm1',
        conversationId: CONVERSATION_ID,
        sentAtMs: Date.now(),
        content: 'selam nasılsın',
        partnerDisplayName: 'Ayşe',
      },
    ]);
    renderMessagesScreen();

    const input = searchBox();
    fireEvent(input, 'focus');
    jest.useFakeTimers();
    try {
      fireEvent(input, 'changeText', 'selam');
      act(() => {
        jest.advanceTimersByTime(1000);
      });
    } finally {
      jest.useRealTimers();
    }
    await act(async () => {});
    expect(screen.getAllByTestId('msgs-message-section').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByTestId('msgs-search-close'));
    await act(async () => {});

    expect(screen.queryAllByTestId('msgs-message-section')).toHaveLength(0);
  });
});
