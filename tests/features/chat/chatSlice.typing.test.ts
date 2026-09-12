jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv');

import reducer, {
  clearAllTyping,
  receiveMessage,
  userStartedTyping,
  userStoppedTyping,
} from '@/features/chat/chatSlice';

const CID = 'c1';
const ME = 'me';
const THEM = 'them';

const msg = (over: Record<string, unknown> = {}) =>
  ({
    id: 'm1',
    conversationId: CID,
    senderId: THEM,
    content: 'selam',
    sentAt: '2026-09-12T10:00:00Z',
    ...over,
  }) as any;

const typing = (state: any) => Object.keys(state.typingByConv[CID] ?? {});

describe('chatSlice typing', () => {
  it('karşı taraftan mesaj gelince onun "yazıyor"u düşer', () => {
    let s = reducer(undefined, userStartedTyping({ conversationId: CID, userId: THEM }));
    expect(typing(s)).toEqual([THEM]);
    s = reducer(s, receiveMessage({ ...msg(), _selfUserId: ME }));
    expect(typing(s)).toEqual([]);
  });

  it('kendi mesajımın echo\'su karşı tarafın "yazıyor"una dokunmaz', () => {
    let s = reducer(undefined, userStartedTyping({ conversationId: CID, userId: THEM }));
    s = reducer(s, receiveMessage({ ...msg({ id: 'm2', senderId: ME }), _selfUserId: ME }));
    expect(typing(s)).toEqual([THEM]);
  });

  it('clearAllTyping her sohbetteki her göstergeyi siler', () => {
    let s = reducer(undefined, userStartedTyping({ conversationId: CID, userId: THEM }));
    s = reducer(s, userStartedTyping({ conversationId: 'c2', userId: 'x' }));
    s = reducer(s, clearAllTyping());
    expect(s.typingByConv).toEqual({});
  });

  it('userStoppedTyping yalnız o kullanıcıyı siler', () => {
    let s = reducer(undefined, userStartedTyping({ conversationId: CID, userId: THEM }));
    s = reducer(s, userStartedTyping({ conversationId: CID, userId: 'other' }));
    s = reducer(s, userStoppedTyping({ conversationId: CID, userId: THEM }));
    expect(typing(s)).toEqual(['other']);
  });
});
