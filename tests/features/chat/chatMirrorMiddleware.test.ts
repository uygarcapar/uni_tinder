jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  chatMirrorMiddleware,
  startChatMirror,
  __resetChatMirrorForTests,
} from '@/features/chat/chatMirrorMiddleware';
import { readWindow, readSyncState } from '@/features/chat/chatRepository';
import { clear as clearMessageCache, projectWindow } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const BASE = Date.UTC(2026, 8, 16, 10, 0, 0);

const msg = (n: number, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id: `m${n}`,
    conversationId: CONV,
    senderId: 'partner',
    content: `mesaj ${n}`,
    contentType: 0,
    sentAt: new Date(BASE + n * 60_000).toISOString(),
    ...over,
  }) as MessageDto;

/** Gerçek middleware'i minimal bir store taklidiyle koşturur. */
function makeHarness(state: any = { chat: { activeConversationId: null, messagesByConv: {} } }) {
  const seen: any[] = [];
  const api = { getState: () => state, dispatch: (a: any) => a };
  const dispatch = (chatMirrorMiddleware as any)(api)((a: any) => {
    seen.push(a);
    return a;
  });
  return { dispatch, seen, state };
}

const ids = () => readWindow(CONV, 100).map((r) => r.id);
const rowOf = (id: string) =>
  getChatDb().getFirst<any>('SELECT * FROM messages WHERE id = ?', [id]);

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  __resetChatMirrorForTests();
  clearMessageCache();
  openChatDb();
  startChatMirror();
});

describe('middleware sözleşmesi', () => {
  it('action her zaman ÖNCE reducer\'a gider', () => {
    const { dispatch, seen } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    expect(seen).toHaveLength(1);
  });

  it('chat dışı action\'lara dokunmaz', () => {
    const { dispatch, seen } = makeHarness();
    dispatch({ type: 'auth/login', payload: {} });
    expect(seen).toHaveLength(1);
    expect(ids()).toEqual([]);
  });

  it('ayna patlarsa action AKIŞI BOZULMAZ', () => {
    const { dispatch, seen } = makeHarness();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // conversationId yok → repository'de patlayacak bir payload.
    expect(() =>
      dispatch({ type: 'chat/fetchHistory/fulfilled', payload: { conversationId: CONV, messages: [null] } }),
    ).not.toThrow();
    expect(seen).toHaveLength(1);

    (console.error as jest.Mock).mockRestore();
  });

  it('startChatMirror çağrılmadıysa ayna sessizdir', () => {
    __resetChatMirrorForTests();
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    expect(ids()).toEqual([]);
  });
});

describe('realtime event\'leri aynalanıyor (AppNavigator\'a dokunmadan)', () => {
  it('receiveMessage satır yazar', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    expect(ids()).toEqual(['m1']);
  });

  it('optimistic → ack: temp satır server id\'sine döner, ikizlenmez', () => {
    const { dispatch } = makeHarness();
    dispatch({
      type: 'chat/appendOptimisticMessage',
      payload: {
        conversationId: CONV,
        message: msg(1, { id: 'temp-x', clientMessageId: 'cmid-x' }),
      },
    });
    expect(rowOf('temp-x').send_state).toBe('pending');

    dispatch({
      type: 'chat/messageSent',
      payload: msg(1, { id: 'srv-1', clientMessageId: 'cmid-x' }),
    });

    expect(ids()).toEqual(['srv-1']);
    expect(rowOf('srv-1').send_state).toBe('sent');
  });

  it('fail / retry / remove send_state\'i sürer', () => {
    const { dispatch } = makeHarness();
    const payload = { conversationId: CONV, clientMessageId: 'cmid-x' };
    dispatch({
      type: 'chat/appendOptimisticMessage',
      payload: { conversationId: CONV, message: msg(1, { id: 'temp-x', clientMessageId: 'cmid-x' }) },
    });

    dispatch({ type: 'chat/failOptimisticMessage', payload });
    expect(rowOf('temp-x').send_state).toBe('failed');

    dispatch({ type: 'chat/retryOptimisticMessage', payload });
    expect(rowOf('temp-x').send_state).toBe('pending');

    dispatch({ type: 'chat/removeOptimisticMessage', payload });
    expect(ids()).toEqual([]);
  });

  it('messagesRead yalnız KARŞI TARAFIN okunmamışlarını, sınıra kadar işaretler', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1, { id: 'a', senderId: 'me' }) });
    dispatch({ type: 'chat/receiveMessage', payload: msg(2, { id: 'b', senderId: 'me' }) });
    dispatch({ type: 'chat/receiveMessage', payload: msg(3, { id: 'c', senderId: 'partner' }) });

    dispatch({
      type: 'chat/messagesRead',
      payload: {
        conversationId: CONV,
        readByUserId: 'partner',
        lastReadSentAt: new Date(BASE + 1 * 60_000).toISOString(),
        readAt: '2026-09-16T12:00:00.000Z',
      },
    });

    expect(rowOf('a').read_at).toBe('2026-09-16T12:00:00.000Z');
    expect(rowOf('b').read_at).toBeNull(); // sınırın ötesinde
    expect(rowOf('c').read_at).toBeNull(); // okuyanın kendi mesajı
  });

  it('messagesDeliveredBatch idempotent', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });

    const batch = [{ messageId: 'm1', conversationId: CONV, deliveredAt: '2026-09-16T12:00:00.000Z' }];
    dispatch({ type: 'chat/messagesDeliveredBatch', payload: batch });
    const afterFirst = rowOf('m1').row_version;

    dispatch({ type: 'chat/messagesDeliveredBatch', payload: batch });
    // İkinci kez uygulanınca sürüm ARTMAMALI — yoksa her ack fırtınası
    // messageCache'in hızlı yolunu bozar.
    expect(rowOf('m1').row_version).toBe(afterFirst);
  });

  it('messageDeleted forEveryone içeriği siler', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1, { mediaUrl: 'media-1' }) });
    dispatch({
      type: 'chat/messageDeleted',
      payload: { messageId: 'm1', conversationId: CONV, forEveryone: true, deletedAt: 'D' },
    });

    const row = rowOf('m1');
    expect(row.content).toBe('');
    expect(row.media_url).toBeNull();
    expect(row.deleted_for_everyone).toBe(1);
  });

  it('reactionsChanged aynı içerikte sürümü ARTIRMAZ', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    const reactions = [{ emoji: '🔥', count: 1, userIds: ['u1'] }];

    dispatch({ type: 'chat/reactionsChanged', payload: { messageId: 'm1', conversationId: CONV, reactions } });
    const v = rowOf('m1').row_version;
    dispatch({ type: 'chat/reactionsChanged', payload: { messageId: 'm1', conversationId: CONV, reactions } });

    expect(rowOf('m1').row_version).toBe(v);
  });

  it('conversationDeactivated asılı pending balonları failed yapar', () => {
    const { dispatch } = makeHarness();
    dispatch({
      type: 'chat/appendOptimisticMessage',
      payload: { conversationId: CONV, message: msg(1, { id: 'temp-x', clientMessageId: 'cmid-x' }) },
    });
    dispatch({
      type: 'chat/conversationDeactivated',
      payload: { conversationId: CONV, restorableUntil: null, byMe: true },
    });

    expect(rowOf('temp-x').send_state).toBe('failed');
  });

  it('historyRevealed rematch kapısını kapatır', () => {
    const { dispatch } = makeHarness();
    dispatch({
      type: 'chat/fetchHistory/fulfilled',
      payload: {
        conversationId: CONV,
        messages: [msg(1)],
        nextCursor: null,
        hasMore: false,
        hasHiddenHistory: true,
        append: false,
      },
    });
    expect(readSyncState(CONV)!.has_hidden_history).toBe(1);

    dispatch({ type: 'chat/historyRevealed', payload: { conversationId: CONV } });
    expect(readSyncState(CONV)!.has_hidden_history).toBe(0);
  });

  it('resetChat arşivi boşaltır — önceki kullanıcının mesajı kalmaz', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    dispatch({ type: 'chat/resetChat' });
    expect(ids()).toEqual([]);
  });

  it('resetChat JS HEAP\'ini de temizler — projekte nesneler sızmamalı', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });

    const before = projectWindow(CONV, readWindow(CONV, 10))[0];
    expect(before.id).toBe('m1');

    dispatch({ type: 'chat/resetChat' });

    // Aynı satırı yeniden yazıp projekte edince YENİ nesne gelmeli; eskisi
    // identity map'te kalsaydı sonraki kullanıcıya servis edilebilirdi.
    dispatch({ type: 'chat/receiveMessage', payload: msg(1) });
    const after = projectWindow(CONV, readWindow(CONV, 10))[0];

    expect(after).not.toBe(before);
  });
});

describe('fetchHistory aynası', () => {
  it('sayfa uygulanır ve sync_state kurulur', () => {
    const { dispatch } = makeHarness();
    dispatch({
      type: 'chat/fetchHistory/fulfilled',
      payload: {
        conversationId: CONV,
        messages: [msg(3), msg(2), msg(1)],
        nextCursor: 'c1',
        hasMore: true,
        append: false,
      },
    });

    expect(ids()).toEqual(['m3', 'm2', 'm1']);
    expect(readSyncState(CONV)!.next_cursor).toBe('c1');
  });

  it('boş page-1 mevcut arşivi SİLMEZ', () => {
    const { dispatch } = makeHarness();
    dispatch({
      type: 'chat/fetchHistory/fulfilled',
      payload: { conversationId: CONV, messages: [msg(1)], nextCursor: null, hasMore: false, append: false },
    });

    dispatch({
      type: 'chat/fetchHistory/fulfilled',
      payload: { conversationId: CONV, messages: [], nextCursor: null, hasMore: false, append: false },
    });

    expect(ids()).toEqual(['m1']);
  });
});

describe('fetchConversations aynası', () => {
  const serverConv = (unreadCount: number) => ({
    conversationId: CONV,
    partnerUserId: 'p1',
    partnerDisplayName: 'Ada',
    unreadCount,
    isActive: true,
    partnerIsOnline: true,
    lastMessageAt: new Date(BASE).toISOString(),
  });

  const convRow = () =>
    getChatDb().getFirst<any>('SELECT * FROM conversations WHERE conversation_id = ?', [CONV]);

  it('İLK görülen sohbette sunucunun sayacı aynen alınır', () => {
    // Redux ile birebir parite: chatSlice.ts:613 `if (!localConv) return serverConv`
    // — hiç görmediğimiz bir sohbette yerel bilgi yok, "local wins" kuralının
    // uygulanacağı bir yerel değer de yok.
    const { dispatch } = makeHarness({ chat: { activeConversationId: CONV, messagesByConv: {} } });

    dispatch({ type: 'chat/fetchConversations/fulfilled', payload: [serverConv(7)] });

    expect(convRow().unread_count).toBe(7);
  });

  it('BİLİNEN sohbet açıksa sunucunun sayacı sıfırlanır', () => {
    const { dispatch } = makeHarness({ chat: { activeConversationId: CONV, messagesByConv: {} } });
    dispatch({ type: 'chat/fetchConversations/fulfilled', payload: [serverConv(0)] });

    // markRead ile yarışan ikinci yanıt okunmamış sayaç taşıyor.
    dispatch({ type: 'chat/fetchConversations/fulfilled', payload: [serverConv(7)] });

    expect(convRow().unread_count).toBe(0);
  });

  it('presence diske YAZILMAZ (partnerIsOnline:true olsa bile kolon yok)', () => {
    const { dispatch } = makeHarness();
    dispatch({ type: 'chat/fetchConversations/fulfilled', payload: [serverConv(0)] });

    expect(Object.keys(convRow())).not.toContain('partner_is_online');
  });
});
