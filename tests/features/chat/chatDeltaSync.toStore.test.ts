jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: { getChanges: jest.fn() },
  HISTORY_PAGE_SIZE: 50,
  CHANGES_PAGE_SIZE: 200,
}));
jest.mock('@/shared/store/chatFlags', () => ({
  CHAT_PERSIST_ENABLED: false,
  CHAT_SQLITE_ENABLED: true,
  CHAT_DELTA_SYNC_ENABLED: true,
}));

import * as SQLite from 'expo-sqlite';
import chatService from '@/features/chat/chatService';
import { openChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import { saveMessage, upsertConversations } from '@/features/chat/chatRepository';
import { pullChanges, __resetDeltaSyncForTests } from '@/features/chat/chatDeltaSync';
import { applyDeltaFromLocal } from '@/features/chat/chatHydrate';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import reducer, { hydrateWindow } from '@/features/chat/chatSlice';
import type { ChatState, ConversationListItemDto, MessageDto } from '@/shared/types';

/**
 * DELTA-SYNC → EKRAN.
 *
 * Delta turu diske yazıyordu ve hiç dispatch etmiyordu: arka plandan dönüşte
 * gelen mesaj/silme "diskte var, ekranda yok" durumunda kalıyordu. Buradaki
 * testler o köprünün iki ucunu da kilitliyor — diskten okunduğunu (payload
 * değil) ve bucket kuyruğunun korunduğunu.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };
const getChanges = (chatService as any).getChanges as jest.Mock;

const CONV = 'conv-1';
const T = (iso: string) => iso;
const T_OLD = T('2026-09-18T09:00:00.000Z');
const T_MID = T('2026-09-18T10:00:00.000Z');
const T_NEW = T('2026-09-18T11:00:00.000Z');

const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: T_MID,
    ...over,
  }) as MessageDto;

const conv = (over: Partial<ConversationListItemDto> = {}): ConversationListItemDto =>
  ({
    conversationId: CONV,
    partnerUserId: 'partner-1',
    partnerDisplayName: 'Ada',
    unreadCount: 0,
    isActive: true,
    partnerIsOnline: false,
    ...over,
  }) as ConversationListItemDto;

/** Redux'u taklit eden minik store — reducer gerçek. */
function makeStore(seed?: (s: ChatState) => ChatState) {
  let state: ChatState = reducer(undefined, { type: '@@INIT' });
  if (seed) state = seed(state);
  return {
    getState: () => ({ chat: state }),
    dispatch: (action: any) => {
      state = reducer(state, action);
      return action;
    },
    get chat() {
      return state;
    },
  };
}

const bucketOf = (store: ReturnType<typeof makeStore>) =>
  store.chat.messagesByConv[CONV];

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  __resetDeltaSyncForTests();
  openChatDb();
  getChanges.mockReset();
});

/** Tek sayfalık delta yanıtı. */
const page = (over: Record<string, any> = {}) => ({
  watermark: 'w1',
  hasMore: false,
  messages: [],
  conversations: [],
  deletions: [],
  ...over,
});

it('dokunulan sohbetleri bildiriyor, dokunulmayanı bildirmiyor', async () => {
  getChanges.mockResolvedValueOnce(
    page({
      messages: [msg('m1')],
      conversations: [conv({ conversationId: 'conv-2', lastMessageAt: T_MID })],
    }),
  );

  const result = await pullChanges();

  expect([...result.applied.conversationIds].sort()).toEqual(['conv-1', 'conv-2']);
});

it('açık sohbete yeni mesaj düşüyor — AĞ TURU YOK', async () => {
  // Ekranda duran bucket (girişte diskten hydrate edilmiş hâli).
  saveMessage(msg('m1', { sentAt: T_OLD }), CONV);
  const store = makeStore((s) =>
    reducer(s, hydrateWindow({
      conversationId: CONV,
      messages: [msg('m1', { sentAt: T_OLD })],
      nextCursor: null,
      hasMore: false,
      hasHiddenHistory: false,
    })),
  );

  getChanges.mockResolvedValueOnce(page({ messages: [msg('m2', { sentAt: T_NEW })] }));
  const result = await pullChanges();
  applyDeltaFromLocal(store, result.applied);

  // newest-first: yeni mesaj başa geçti
  expect(bucketOf(store).messages.map((m) => m.id)).toEqual(['m2', 'm1']);
});

it('mesaj PAYLOAD\'DAN değil DİSKTEN geliyor — clientMessageId ve yerel ses dosyası korunuyor', async () => {
  // Gönderdiğimiz sesli mesaj: cmid + _localUri yalnız bizde var.
  saveMessage(
    msg('m1', {
      clientMessageId: 'cmid-1',
      contentType: 2,
      durationMs: 4200,
      _localUri: 'file:///voice/1.m4a',
      sentAt: T_MID,
    }),
    CONV,
  );
  const store = makeStore((s) =>
    reducer(s, hydrateWindow({
      conversationId: CONV,
      messages: [msg('m1', { clientMessageId: 'cmid-1', contentType: 2 })],
      nextCursor: null,
      hasMore: false,
      hasHiddenHistory: false,
    })),
  );

  // Sunucunun echo'su: cmid YOK, _localUri YOK, üstüne okundu bilgisi geldi.
  getChanges.mockResolvedValueOnce(
    page({
      messages: [
        {
          id: 'm1',
          conversationId: CONV,
          senderId: 'partner',
          content: '',
          contentType: 2,
          sentAt: T_MID,
          readAt: T_NEW,
          durationMs: 4200,
        },
      ],
    }),
  );
  const result = await pullChanges();
  applyDeltaFromLocal(store, result.applied);

  const m = bucketOf(store).messages[0];
  expect(m.readAt).toBe(T_NEW); // yeni bilgi geldi
  expect(m.clientMessageId).toBe('cmid-1'); // keyExtractor anahtarı düşmedi
  expect(m._localUri).toBe('file:///voice/1.m4a'); // yerel ses dosyası duruyor
});

it('derine kaydırılmış bucket KUYRUĞUNU kaybetmiyor', async () => {
  // Sıcak pencerenin dışında kalmış eski sayfa ekranda duruyor.
  const tail = msg('m-old', { sentAt: '2026-01-01T00:00:00.000Z' });
  saveMessage(msg('m1', { sentAt: T_MID }), CONV);
  const store = makeStore((s) =>
    reducer(s, hydrateWindow({
      conversationId: CONV,
      messages: [msg('m1', { sentAt: T_MID }), tail],
      nextCursor: null,
      hasMore: false,
      hasHiddenHistory: false,
    })),
  );

  getChanges.mockResolvedValueOnce(page({ messages: [msg('m2', { sentAt: T_NEW })] }));
  const result = await pullChanges();
  applyDeltaFromLocal(store, result.applied);

  expect(bucketOf(store).messages.map((m) => m.id)).toEqual(['m2', 'm1', 'm-old']);
});

it('bucket\'ı OLMAYAN sohbete bucket yaratmıyor', async () => {
  const store = makeStore();

  getChanges.mockResolvedValueOnce(page({ messages: [msg('m1')] }));
  const result = await pullChanges();
  applyDeltaFromLocal(store, result.applied);

  expect(store.chat.messagesByConv[CONV]).toBeUndefined();
});

it('silme tombstone\'u ekrana iniyor', async () => {
  saveMessage(msg('m1'), CONV);
  const store = makeStore((s) =>
    reducer(s, hydrateWindow({
      conversationId: CONV,
      messages: [msg('m1')],
      nextCursor: null,
      hasMore: false,
      hasHiddenHistory: false,
    })),
  );

  getChanges.mockResolvedValueOnce(
    page({
      deletions: [
        {
          messageId: 'm1',
          conversationId: CONV,
          deletedAt: T_NEW,
          deletedForEveryone: true,
        },
      ],
    }),
  );
  const result = await pullChanges();
  applyDeltaFromLocal(store, result.applied);

  const m = bucketOf(store).messages[0];
  expect(m.deletedAt).toBe(T_NEW);
  expect(m.deletedForEveryone).toBe(true);
  expect(m.content).toBe('');
});

describe('sohbet listesi', () => {
  it('yeni mesaj listeyi güncelliyor ve en üste taşıyor', async () => {
    // Ekranda conv-a üstte (daha yeni), CONV altta.
    upsertConversations([
      conv({ conversationId: 'conv-a', lastMessageAt: T_MID }),
      conv({ conversationId: CONV, lastMessageAt: T_OLD }),
    ]);
    const store = makeStore();
    store.dispatch({
      type: 'chat/hydrateConversations',
      payload: [
        conv({ conversationId: 'conv-a', lastMessageAt: T_MID }),
        conv({ conversationId: CONV, lastMessageAt: T_OLD, partnerIsOnline: true }),
      ],
    });

    getChanges.mockResolvedValueOnce(
      page({
        conversations: [
          conv({ lastMessageAt: T_NEW, lastMessagePreview: 'yeni', unreadCount: 2 }),
        ],
      }),
    );
    const result = await pullChanges();
    applyDeltaFromLocal(store, result.applied);

    const list = store.chat.conversations;
    expect(list.map((c) => c.conversationId)).toEqual([CONV, 'conv-a']);
    expect(list[0].lastMessagePreview).toBe('yeni');
    expect(list[0].unreadCount).toBe(2);
    // Rozet toplamı da yeniden hesaplandı.
    expect(store.chat.unreadTotal).toBe(2);
  });

  it('presence EZİLMİYOR — diskte kolonu yok', async () => {
    upsertConversations([conv({ lastMessageAt: T_OLD })]);
    const store = makeStore();
    store.dispatch({
      type: 'chat/hydrateConversations',
      payload: [conv({ lastMessageAt: T_OLD, partnerIsOnline: true })],
    });

    getChanges.mockResolvedValueOnce(
      page({ conversations: [conv({ lastMessageAt: T_NEW })] }),
    );
    const result = await pullChanges();
    applyDeltaFromLocal(store, result.applied);

    expect(store.chat.conversations[0].partnerIsOnline).toBe(true);
  });

  it('kaldırılan sohbet listeden ve bucket\'tan düşüyor', async () => {
    upsertConversations([conv({ lastMessageAt: T_OLD })]);
    const store = makeStore((s) =>
      reducer(s, hydrateWindow({
        conversationId: CONV,
        messages: [msg('m1')],
        nextCursor: null,
        hasMore: false,
        hasHiddenHistory: false,
      })),
    );
    store.dispatch({
      type: 'chat/hydrateConversations',
      payload: [conv({ lastMessageAt: T_OLD })],
    });

    getChanges.mockResolvedValueOnce(
      page({ removedConversations: [{ conversationId: CONV, reason: 'Blocked' }] }),
    );
    const result = await pullChanges();
    applyDeltaFromLocal(store, result.applied);

    expect(store.chat.conversations).toHaveLength(0);
    expect(store.chat.messagesByConv[CONV]).toBeUndefined();
  });
});
