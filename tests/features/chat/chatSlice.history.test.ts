// chatSlice → chatService → api → tokenStorage zinciri native storage'a iniyor;
// reducer testinde ikisi de mock'lanır (davranışları burada konu değil).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-mmkv'); // <rootDir>/__mocks__/react-native-mmkv.ts

import reducer, { fetchHistory } from '@/features/chat/chatSlice';

/**
 * fetchHistory.fulfilled append=false = reconcile MERGE (körlemesine REPLACE değil).
 * Kilitlenen davranışlar:
 *  - içerik aynıysa mesaj OBJE referansları ve messages ARRAY referansı korunur
 *    (LegendList "structural data change" görmesin — flash/reset'in kökü)
 *  - server penceresi server-authoritative: alan farkı server kopyasıyla değişir
 *  - önceden yüklenmiş eski sayfalar (kuyruk) pencereler çakışıyorsa ATILMAZ,
 *    derin cursor korunur; çakışma yoksa REPLACE'e düşülür (delik bırakma)
 *  - clientMessageId server kopyasına taşınır (keyExtractor ona bakıyor)
 *  - server'da karşılığı görünen optimistic (_pending) tekrar eklenmez
 */

const CID = 'c1';
const T0 = 1700000000000;

const msg = (id: string, minute: number, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: CID,
  senderId: 'u2',
  content: `m-${id}`,
  sentAt: new Date(T0 + minute * 60000).toISOString(),
  readAt: null,
  deliveredAt: null,
  isSystemMessage: false,
  contentType: 0,
  reactions: [],
  ...extra,
});

const reconcile = (payload: Record<string, unknown>) =>
  fetchHistory.fulfilled(
    { conversationId: CID, append: false, ...payload } as any,
    'req-1',
    { conversationId: CID, cursor: null as any, pageSize: 30 },
  );

const stateWith = (bucket: Record<string, unknown>) => {
  const init = reducer(undefined, { type: '@@INIT' });
  return {
    ...init,
    messagesByConv: {
      [CID]: { nextCursor: null, hasMore: false, loading: false, messages: [], ...bucket },
    },
  } as any;
};

describe('chatSlice fetchHistory.fulfilled (append=false) reconcile merge', () => {
  it('içerik birebir aynıysa mesaj objeleri VE messages array referansı korunur', () => {
    const a = msg('3', 3);
    const b = msg('2', 2);
    const c = msg('1', 1);
    const prev = stateWith({ messages: [a, b, c], nextCursor: 'cur-old', hasMore: true });

    const next = reducer(
      prev,
      reconcile({
        messages: [msg('3', 3), msg('2', 2), msg('1', 1)],
        nextCursor: 'cur-new',
        hasMore: true,
      }),
    );

    const bucket = next.messagesByConv[CID];
    expect(bucket.messages).toBe(prev.messagesByConv[CID].messages);
    expect(bucket.messages[0]).toBe(a);
    expect(bucket.messages[1]).toBe(b);
    expect(bucket.messages[2]).toBe(c);
    // kuyruk yok → sayfa-1 durumu: server cursor'ı yazılır
    expect(bucket.nextCursor).toBe('cur-new');
  });

  it('alanı değişen mesaj server kopyasıyla değişir, diğer referanslar korunur', () => {
    const a = msg('3', 3);
    const b = msg('2', 2);
    const c = msg('1', 1);
    const prev = stateWith({ messages: [a, b, c] });

    const next = reducer(
      prev,
      reconcile({
        messages: [msg('3', 3), msg('2', 2, { content: 'düzenlendi', editedAt: 'e1' }), msg('1', 1)],
        nextCursor: null,
        hasMore: false,
      }),
    );

    const m = next.messagesByConv[CID].messages;
    expect(m[0]).toBe(a);
    expect(m[1]).not.toBe(b);
    expect(m[1].content).toBe('düzenlendi');
    expect(m[2]).toBe(c);
  });

  it('pencereler çakışıyorsa eski sayfalar (kuyruk) korunur ve derin cursor kalır', () => {
    const olds = [msg('6', 6), msg('5', 5), msg('4', 4), msg('3', 3), msg('2', 2), msg('1', 1)];
    const prev = stateWith({ messages: olds, nextCursor: 'deep-cursor', hasMore: true });

    // Server sayfa-1: yeni bir mesaj + eski pencereyle çakışan 6/5/4.
    const next = reducer(
      prev,
      reconcile({
        messages: [msg('7', 7), msg('6', 6), msg('5', 5), msg('4', 4)],
        nextCursor: 'page1-cursor',
        hasMore: true,
      }),
    );

    const bucket = next.messagesByConv[CID];
    expect(bucket.messages.map((m: any) => m.id)).toEqual(['7', '6', '5', '4', '3', '2', '1']);
    // çakışan pencere: eski referanslar korunur
    expect(bucket.messages[1]).toBe(olds[0]);
    expect(bucket.messages[3]).toBe(olds[2]);
    // kuyruk: aynen eski referanslar
    expect(bucket.messages[4]).toBe(olds[3]);
    expect(bucket.messages[6]).toBe(olds[5]);
    // derin cursor server'ın sayfa-1 cursor'ı ile EZİLMEZ
    expect(bucket.nextCursor).toBe('deep-cursor');
    expect(bucket.hasMore).toBe(true);
  });

  it('pencereler çakışmıyorsa kuyruk atılır (delik bırakmamak için REPLACE)', () => {
    const prev = stateWith({
      messages: [msg('3', 3), msg('2', 2), msg('1', 1)],
      nextCursor: 'deep-cursor',
      hasMore: true,
    });

    // Arada 30+ mesaj gelmiş senaryo: server sayfası tamamen yeni id'ler.
    const next = reducer(
      prev,
      reconcile({
        messages: [msg('10', 10), msg('9', 9), msg('8', 8)],
        nextCursor: 'page1-cursor',
        hasMore: true,
      }),
    );

    const bucket = next.messagesByConv[CID];
    expect(bucket.messages.map((m: any) => m.id)).toEqual(['10', '9', '8']);
    expect(bucket.nextCursor).toBe('page1-cursor');
  });

  it('hydrate sonrası null cursor, kuyruk korunurken server cursor’ı ile onarılır', () => {
    // Persist transform cursor'ı null'lar ama mesajlar durur.
    const olds = [msg('3', 3), msg('2', 2), msg('1', 1)];
    const prev = stateWith({ messages: olds, nextCursor: null, hasMore: true });

    const next = reducer(
      prev,
      reconcile({
        messages: [msg('4', 4), msg('3', 3), msg('2', 2)],
        nextCursor: 'page1-cursor',
        hasMore: true,
      }),
    );

    const bucket = next.messagesByConv[CID];
    expect(bucket.messages.map((m: any) => m.id)).toEqual(['4', '3', '2', '1']);
    // kuyruk var ama mevcut cursor null'dı → server cursor'ı yazılır (onarım);
    // overlap append dalında id-dedupe ile zararsız.
    expect(bucket.nextCursor).toBe('page1-cursor');
  });

  it('clientMessageId server kopyasına taşınır; içerik aynıysa eski referans kalır', () => {
    const withCli = msg('2', 2, { clientMessageId: 'cli-2' });
    const prev = stateWith({ messages: [msg('3', 3), withCli] });

    // Server history DTO'su clientMessageId taşımıyor.
    const same = reducer(
      prev,
      reconcile({ messages: [msg('3', 3), msg('2', 2)], nextCursor: null, hasMore: false }),
    );
    expect(same.messagesByConv[CID].messages[1]).toBe(withCli);

    const edited = reducer(
      prev,
      reconcile({
        messages: [msg('3', 3), msg('2', 2, { content: 'yeni' })],
        nextCursor: null,
        hasMore: false,
      }),
    );
    const m2 = edited.messagesByConv[CID].messages[1];
    expect(m2).not.toBe(withCli);
    expect(m2.content).toBe('yeni');
    // keyExtractor clientMessageId||id — key değişmemeli
    expect(m2.clientMessageId).toBe('cli-2');
  });

  it('optimistic: server’da karşılığı olmayan başta kalır, olanı düşer', () => {
    const pending = msg('temp-x', 9, { _pending: true, clientMessageId: 'cli-x' });
    const prev = stateWith({ messages: [pending, msg('1', 1)] });

    // Karşılığı yok → başta kalır.
    const kept = reducer(
      prev,
      reconcile({ messages: [msg('2', 2), msg('1', 1)], nextCursor: null, hasMore: false }),
    );
    expect(kept.messagesByConv[CID].messages.map((m: any) => m.id)).toEqual([
      'temp-x',
      '2',
      '1',
    ]);
    expect(kept.messagesByConv[CID].messages[0]).toBe(pending);

    // Server aynı clientMessageId'yi döndürüyor → optimistic tekrar EKLENMEZ.
    const resolved = reducer(
      prev,
      reconcile({
        messages: [msg('real-x', 9, { clientMessageId: 'cli-x' }), msg('1', 1)],
        nextCursor: null,
        hasMore: false,
      }),
    );
    expect(resolved.messagesByConv[CID].messages.map((m: any) => m.id)).toEqual([
      'real-x',
      '1',
    ]);
  });

  it('append=true davranışı değişmedi: id-dedupe ile sona ekler, cursor günceller', () => {
    const prev = stateWith({
      messages: [msg('3', 3), msg('2', 2)],
      nextCursor: 'p1',
      hasMore: true,
    });

    const next = reducer(
      prev,
      fetchHistory.fulfilled(
        {
          conversationId: CID,
          append: true,
          messages: [msg('2', 2), msg('1', 1)],
          nextCursor: 'p2',
          hasMore: false,
        } as any,
        'req-2',
        { conversationId: CID, cursor: 'p1', pageSize: 30 },
      ),
    );

    const bucket = next.messagesByConv[CID];
    expect(bucket.messages.map((m: any) => m.id)).toEqual(['3', '2', '1']);
    expect(bucket.nextCursor).toBe('p2');
    expect(bucket.hasMore).toBe(false);
  });
});
