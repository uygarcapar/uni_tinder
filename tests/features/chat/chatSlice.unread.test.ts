// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, {
  appendOptimisticMessage,
  fetchConversations,
  messageSent,
  receiveMessage,
} from '@/features/chat/chatSlice';

/**
 * "Son mesajı ben attım ama okunmamış görünüyor" hatası.
 *
 * Kök neden: sohbete girerken clearUnreadForConversation yerel sayacı sıfırlarken
 * /conversations isteği zaten uçuştaydı; yanıt markRead'den ÖNCEKİ (bayat)
 * unreadCount'u taşıdığı için rozet geri geliyor ve bir sonraki tazelemeye kadar
 * asılı kalıyordu. Kilitlenen davranışlar:
 *  - kendi gönderimimiz (optimistic / MessageSent / kendi ReceiveMessage echo'su)
 *    sohbeti yerelde okunmuş yapar
 *  - fetchConversations, server BİZİM BİLMEDİĞİMİZ daha yeni bir mesaj taşımıyorsa
 *    yerel "okundu"yu ezmez
 *  - gerçekten yeni mesaj varsa server sayacı aynen uygulanır
 */

const CID = 'c1';
const ME = 'me';
const T1 = '2026-08-14T10:00:00Z';
const T2 = '2026-08-14T10:05:00Z';

const baseState = (overrides: any = {}) => ({
  conversations: [
    {
      conversationId: CID,
      partnerUserId: 'u2',
      isActive: true,
      unreadCount: 0,
      lastMessageAt: T1,
      lastMessagePreview: 'selam',
    },
  ],
  conversationsLoading: false,
  conversationsError: null,
  messagesByConv: {
    [CID]: { messages: [], nextCursor: null, hasMore: false, loading: false },
  },
  typingByConv: {},
  presenceByUser: {},
  unreadTotal: 0,
  activeConversationId: null,
  quotaByConv: {},
  quotaMetaByConv: {},
  ...overrides,
});

const withUnread = (n: number) => {
  const s = baseState();
  s.conversations[0].unreadCount = n;
  s.unreadTotal = n;
  return s;
};

const fulfilled = (payload: any[]) => ({
  type: fetchConversations.fulfilled.type,
  payload,
  meta: { arg: undefined, requestId: 'r', requestStatus: 'fulfilled' },
});

describe('chatSlice — okunmamış rozeti', () => {
  it('kendi optimistic gönderimim sohbeti okunmuş yapar', () => {
    const next = reducer(
      withUnread(3),
      appendOptimisticMessage({
        conversationId: CID,
        message: {
          id: 'temp-1',
          clientMessageId: '1',
          conversationId: CID,
          senderId: ME,
          content: 'ben',
          sentAt: T2,
          _pending: true,
        } as any,
      }),
    );
    expect(next.conversations[0].unreadCount).toBe(0);
    expect(next.unreadTotal).toBe(0);
  });

  it('MessageSent ack\'i de sayacı düşürür', () => {
    const next = reducer(
      withUnread(2),
      messageSent({
        id: 'm9',
        clientMessageId: '9',
        conversationId: CID,
        senderId: ME,
        content: 'ben',
        sentAt: T2,
      } as any),
    );
    expect(next.conversations[0].unreadCount).toBe(0);
    expect(next.unreadTotal).toBe(0);
  });

  it('kendi mesajımın hub echo\'su sayacı ARTIRMAZ, düşürür', () => {
    const next = reducer(
      withUnread(1),
      receiveMessage({
        id: 'm9',
        conversationId: CID,
        senderId: ME,
        content: 'ben',
        sentAt: T2,
        _selfUserId: ME,
      } as any),
    );
    expect(next.conversations[0].unreadCount).toBe(0);
    expect(next.unreadTotal).toBe(0);
  });

  it('karşı tarafın mesajı (sohbet açık değilken) sayacı artırmaya devam eder', () => {
    const next = reducer(
      baseState(),
      receiveMessage({
        id: 'm9',
        conversationId: CID,
        senderId: 'u2',
        content: 'onlar',
        sentAt: T2,
        _selfUserId: ME,
      } as any),
    );
    expect(next.conversations[0].unreadCount).toBe(1);
    expect(next.unreadTotal).toBe(1);
  });

  it('bayat /conversations yanıtı okunmuş sohbette rozeti geri getirmez', () => {
    const next = reducer(
      baseState(), // yerel: okundu (0), son mesaj T1
      fulfilled([
        {
          conversationId: CID,
          partnerUserId: 'u2',
          isActive: true,
          unreadCount: 3, // markRead işlenmeden alınmış bayat sayaç
          lastMessageAt: T1, // server bizden yeni bir şey bilmiyor
          lastMessagePreview: 'selam',
        },
      ]),
    );
    expect(next.conversations[0].unreadCount).toBe(0);
    expect(next.unreadTotal).toBe(0);
  });

  it('server gerçekten yeni mesaj taşıyorsa sayacı uygular', () => {
    const next = reducer(
      baseState(),
      fulfilled([
        {
          conversationId: CID,
          partnerUserId: 'u2',
          isActive: true,
          unreadCount: 2,
          lastMessageAt: T2, // yerelden YENİ
          lastMessagePreview: 'yeni',
        },
      ]),
    );
    expect(next.conversations[0].unreadCount).toBe(2);
    expect(next.unreadTotal).toBe(2);
  });

  it('açık sohbette server sayacı her hâlükârda sıfırlanır', () => {
    const next = reducer(
      baseState({ activeConversationId: CID }),
      fulfilled([
        {
          conversationId: CID,
          partnerUserId: 'u2',
          isActive: true,
          unreadCount: 5,
          lastMessageAt: T2,
          lastMessagePreview: 'yeni',
        },
      ]),
    );
    expect(next.conversations[0].unreadCount).toBe(0);
    expect(next.unreadTotal).toBe(0);
  });
});
