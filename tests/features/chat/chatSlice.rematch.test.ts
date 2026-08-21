// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, {
  conversationDeactivated,
  conversationRestored,
  historyRevealed,
  fetchConversations,
  fetchHistory,
} from '@/features/chat/chatSlice';

/**
 * Unmatch + rematch ("anılar canlanır") kapıları.
 *
 * Kilitlenen davranışlar:
 *  - restorableUntil unmatch YANITINDAN gelir; null = geri alma yok (limit dolmuş
 *    / engellenmiş) ve UI butonu göstermez
 *  - karşı tarafın ConversationDeactivated event'i restorableUntil TAŞIMAZ →
 *    alan hiç geçilmediğinde mevcut değer bozulmaz
 *  - restore, pencereyi TÜKETİR (isActive=true + restorableUntil=null)
 *  - hasHiddenHistory server-authoritative: her history sayfası cevabı yazar
 */

const CID = 'c1';
const OTHER = 'c2';

const state = () =>
  ({
    conversations: [
      { conversationId: CID, partnerUserId: 'u2', isActive: true, unreadCount: 0 },
      { conversationId: OTHER, partnerUserId: 'u3', isActive: true, unreadCount: 0 },
    ],
    conversationsLoading: false,
    conversationsError: null,
    messagesByConv: {
      [CID]: {
        messages: [{ id: 'm1', content: 'oturmuş', sentAt: '2026-08-15T10:00:00Z' }],
        nextCursor: null,
        hasMore: false,
        loading: false,
      },
    },
    typingByConv: {},
    presenceByUser: {},
    unreadTotal: 0,
    activeConversationId: CID,
    quotaByConv: {},
    quotaMetaByConv: {},
  }) as any;

const conv = (s: any, id = CID) =>
  s.conversations.find((c: any) => c.conversationId === id);

describe('conversationDeactivated — restorableUntil', () => {
  it('unmatch yanıtındaki geri alma penceresini saklar', () => {
    const next = reducer(
      state(),
      conversationDeactivated({
        conversationId: CID,
        restorableUntil: '2026-08-16T10:00:00Z',
      }),
    );

    expect(conv(next).isActive).toBe(false);
    expect(conv(next).restorableUntil).toBe('2026-08-16T10:00:00Z');
  });

  it('null pencere (limit dolmuş / engellenmiş) aynen yazılır', () => {
    const next = reducer(
      state(),
      conversationDeactivated({ conversationId: CID, restorableUntil: null }),
    );

    expect(conv(next).restorableUntil).toBeNull();
  });

  it('alan hiç geçilmezse (karşı tarafın event\'i) mevcut değeri bozmaz', () => {
    const base = state();
    conv(base).restorableUntil = '2026-08-16T10:00:00Z';

    const next = reducer(base, conversationDeactivated({ conversationId: CID }));

    expect(conv(next).isActive).toBe(false);
    expect(conv(next).restorableUntil).toBe('2026-08-16T10:00:00Z');
  });
});

describe('conversationRestored', () => {
  it('sohbeti aktifleştirir ve pencereyi tüketir', () => {
    const base = state();
    conv(base).isActive = false;
    conv(base).restorableUntil = '2026-08-16T10:00:00Z';

    const next = reducer(base, conversationRestored({ conversationId: CID }));

    expect(conv(next).isActive).toBe(true);
    expect(conv(next).restorableUntil).toBeNull();
  });

  it('bilinmeyen sohbet id\'sinde patlamaz', () => {
    const next = reducer(state(), conversationRestored({ conversationId: 'yok' }));

    expect(conv(next).isActive).toBe(true);
  });
});

describe('fetchConversations merge — geri alma penceresi', () => {
  const listed = (overrides: any) => ({
    type: fetchConversations.fulfilled.type,
    payload: [
      {
        conversationId: CID,
        partnerUserId: 'u2',
        isActive: false,
        unreadCount: 0,
        ...overrides,
      },
    ],
  });

  it('liste DTO\'su alanı taşımıyorsa yereli korur', () => {
    // Unmatch'in hemen ardından force refetch atılıyor; alan düşerse "geri al"
    // butonu daha ilk saniyede kaybolurdu.
    const base = state();
    conv(base).isActive = false;
    conv(base).restorableUntil = '2026-08-16T10:00:00Z';

    const next = reducer(base, listed({}));

    expect(conv(next).restorableUntil).toBe('2026-08-16T10:00:00Z');
  });

  it('server açıkça null derse (pencere kapandı) server kazanır', () => {
    const base = state();
    conv(base).isActive = false;
    conv(base).restorableUntil = '2026-08-16T10:00:00Z';

    const next = reducer(base, listed({ restorableUntil: null }));

    expect(conv(next).restorableUntil).toBeNull();
  });
});

describe('gizli geçmiş kapısı (hasHiddenHistory)', () => {
  const fulfilled = (payload: any) => ({
    type: fetchHistory.fulfilled.type,
    payload,
    meta: { arg: { conversationId: payload.conversationId } },
  });

  it('history cevabındaki bayrağı bucket\'a yazar', () => {
    const next = reducer(
      state(),
      fulfilled({
        conversationId: CID,
        messages: [{ id: 'm1', content: 'oturmuş', sentAt: '2026-08-15T10:00:00Z' }],
        nextCursor: null,
        hasMore: false,
        hasHiddenHistory: true,
        append: false,
      }),
    );

    expect(next.messagesByConv[CID].hasHiddenHistory).toBe(true);
  });

  it('alanı göndermeyen (eski) backend\'de kapı kapalı kalır', () => {
    const next = reducer(
      state(),
      fulfilled({
        conversationId: CID,
        messages: [],
        nextCursor: null,
        hasMore: false,
        append: false,
      }),
    );

    expect(next.messagesByConv[CID].hasHiddenHistory).toBe(false);
  });

  it('reveal sonrası kapı kapanır', () => {
    const base = reducer(
      state(),
      fulfilled({
        conversationId: CID,
        messages: [],
        nextCursor: null,
        hasMore: false,
        hasHiddenHistory: true,
        append: false,
      }),
    );

    const next = reducer(base, historyRevealed({ conversationId: CID }));

    expect(next.messagesByConv[CID].hasHiddenHistory).toBe(false);
  });

  it('bucket yoksa historyRevealed patlamaz', () => {
    const next = reducer(state(), historyRevealed({ conversationId: 'yok' }));

    expect(next.messagesByConv.yok).toBeUndefined();
  });
});
