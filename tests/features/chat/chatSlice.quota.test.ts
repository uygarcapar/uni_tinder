jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv');

import reducer, {
  decrementQuotaLocally,
  fetchChatQuota,
  receiveMessage,
} from '@/features/chat/chatSlice';

const CID = 'c1';
const ME = 'me';
const THEM = 'them';

const seedQuota = (over: Record<string, unknown> = {}) =>
  reducer(undefined, {
    type: fetchChatQuota.fulfilled.type,
    payload: {
      conversationId: CID,
      status: {
        hasPremiumParticipant: false,
        isUnlimited: false,
        isUnlocked: false,
        messageCount: 10,
        freeMessageLimit: 30,
        remainingMessages: 20,
        requiresPremium: false,
        ...over,
      },
    },
  } as any);

const msg = (over: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    conversationId: CID,
    senderId: THEM,
    content: 'selam',
    sentAt: '2026-09-12T10:00:00Z',
    ...over,
  }) as any;

/**
 * Kota sohbet başına ve İKİ TARAFIN TOPLAMI (backend ChatRoomQuota). Yerel
 * sayaç karşı tarafın mesajında da düşmeli, yoksa "kaç kaldı" bir sonraki
 * /quota çekimine kadar bayat kalır ve ara uyarılar tetiklenmez.
 */
describe('chatSlice quota', () => {
  it('karşı tarafın mesajı kalan hakkı düşürür', () => {
    let s = seedQuota();
    s = reducer(s, receiveMessage({ ...msg(), _selfUserId: ME }));
    expect(s.quotaByConv[CID].remainingMessages).toBe(19);
    expect(s.quotaByConv[CID].messageCount).toBe(11);
  });

  it('kendi mesajımın echo\'su ikinci kez düşürmez', () => {
    let s = seedQuota();
    s = reducer(s, decrementQuotaLocally({ conversationId: CID }));
    s = reducer(s, receiveMessage({ ...msg({ id: 'm2', senderId: ME, clientMessageId: 'x' }), _selfUserId: ME }));
    expect(s.quotaByConv[CID].remainingMessages).toBe(19);
  });

  it('sistem mesajı ve aynı mesajın tekrarı düşürmez', () => {
    let s = seedQuota();
    s = reducer(s, receiveMessage({ ...msg({ id: 'sys', isSystemMessage: true }), _selfUserId: ME }));
    expect(s.quotaByConv[CID].remainingMessages).toBe(20);
    s = reducer(s, receiveMessage({ ...msg(), _selfUserId: ME }));
    s = reducer(s, receiveMessage({ ...msg(), _selfUserId: ME }));
    expect(s.quotaByConv[CID].remainingMessages).toBe(19);
  });

  it('son hak düşünce requiresPremium açılır; sınırsız sohbette yalnız sayaç artar', () => {
    let s = seedQuota({ remainingMessages: 1, messageCount: 29 });
    s = reducer(s, receiveMessage({ ...msg(), _selfUserId: ME }));
    expect(s.quotaByConv[CID].remainingMessages).toBe(0);
    expect(s.quotaByConv[CID].requiresPremium).toBe(true);

    let u = seedQuota({ isUnlimited: true, remainingMessages: null });
    u = reducer(u, receiveMessage({ ...msg(), _selfUserId: ME }));
    expect(u.quotaByConv[CID].messageCount).toBe(11);
    expect(u.quotaByConv[CID].remainingMessages).toBeNull();
    expect(u.quotaByConv[CID].requiresPremium).toBe(false);
  });
});
