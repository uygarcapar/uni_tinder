// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, { conversationDeactivated } from '@/features/chat/chatSlice';

/**
 * Karşı taraf unmatch ettiğinde backend hiçbir hub event'i yayınlamıyor
 * (kontrat §14). Tek anlık sinyal, kapalı sohbete gönderimde dönen
 * Error{CONVERSATION_ERROR}. Kilitlenen davranışlar:
 *  - sohbet YEREL olarak isActive=false olur (force refetch'i beklemeden)
 *  - "gönderiliyor"da asılı _pending balonlar _failed'e çevrilir (ack gelmeyecek)
 *  - zaten oturmuş mesajlara ve diğer sohbetlere dokunulmaz
 */

const CID = 'c1';
const OTHER = 'c2';

const state = () => ({
  conversations: [
    { conversationId: CID, partnerUserId: 'u2', isActive: true, unreadCount: 0 },
    { conversationId: OTHER, partnerUserId: 'u3', isActive: true, unreadCount: 0 },
  ],
  conversationsLoading: false,
  conversationsError: null,
  messagesByConv: {
    [CID]: {
      messages: [
        { id: 'temp-x', clientMessageId: 'x', content: 'giden', _pending: true },
        { id: 'm1', content: 'oturmuş' },
      ],
      nextCursor: null,
      hasMore: false,
      loading: false,
    },
    [OTHER]: {
      messages: [{ id: 'temp-y', clientMessageId: 'y', content: 'öbür', _pending: true }],
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

describe('conversationDeactivated', () => {
  it('sohbeti pasife çeker ve bekleyen balonları başarısıza düşürür', () => {
    const next = reducer(state(), conversationDeactivated({ conversationId: CID }));

    expect(next.conversations.find((c: any) => c.conversationId === CID).isActive).toBe(false);
    const [pending, settled] = next.messagesByConv[CID].messages as any[];
    expect(pending._pending).toBe(false);
    expect(pending._failed).toBe(true);
    expect(settled._failed).toBeUndefined();
  });

  it('diğer sohbetlere dokunmaz', () => {
    const next = reducer(state(), conversationDeactivated({ conversationId: CID }));

    expect(next.conversations.find((c: any) => c.conversationId === OTHER).isActive).toBe(true);
    expect((next.messagesByConv[OTHER].messages[0] as any)._pending).toBe(true);
  });

  // "Geri Al" yalnız eşleşmeyi kaldırana açık. Kapatanın kim olduğunu sunucu
  // söylemiyor → bayrağı kendi unmatch'imizde biz damgalıyoruz; karşı taraf
  // kaynaklı yollar (hub event'i, gönderim reddi) byMe GEÇMEZ.
  it('byMe geçilmeyen kapanışta deactivatedByMe=false olur', () => {
    const next = reducer(state(), conversationDeactivated({ conversationId: CID }));

    expect(
      next.conversations.find((c: any) => c.conversationId === CID).deactivatedByMe,
    ).toBe(false);
  });

  it('kendi unmatch\'imizde (byMe) deactivatedByMe=true olur', () => {
    const next = reducer(
      state(),
      conversationDeactivated({
        conversationId: CID,
        restorableUntil: '2026-08-16T12:00:00Z',
        byMe: true,
      }),
    );

    const conv = next.conversations.find((c: any) => c.conversationId === CID);
    expect(conv.deactivatedByMe).toBe(true);
    expect(conv.restorableUntil).toBe('2026-08-16T12:00:00Z');
  });

  it('bucket yoksa (sohbet hiç açılmamış) patlamaz', () => {
    const base = state();
    delete base.messagesByConv[CID];

    const next = reducer(base, conversationDeactivated({ conversationId: CID }));

    expect(next.conversations.find((c: any) => c.conversationId === CID).isActive).toBe(false);
  });
});
