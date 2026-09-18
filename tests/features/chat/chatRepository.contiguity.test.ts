jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  applyHistoryPage,
  readSyncState,
  readWindow,
  readOlder,
  upsertMessage,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const BASE = Date.UTC(2026, 8, 16, 10, 0, 0);

/** m1 en eski, mN en yeni — dakikada bir. */
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

/** Sunucu sayfaları newest-first gelir. */
const page = (ns: number[], rest: Partial<Parameters<typeof applyHistoryPage>[1]> = {}) => ({
  messages: ns
    .slice()
    .sort((a, b) => b - a)
    .map((n) => msg(n)),
  nextCursor: null as string | null,
  hasMore: false,
  ...rest,
});

const idsNewestFirst = () => readWindow(CONV, 100).map((r) => r.id);
const seed = (ns: number[]) => {
  const db = getChatDb();
  db.transaction(() => {
    for (const n of ns) upsertMessage(db, msg(n), CONV);
  });
};

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('applyHistoryPage — append (yukarı kaydırma)', () => {
  it('daha eski sayfayı ekler ve oldest_loaded ile cursor\'ı ilerletir', () => {
    seed([4, 5, 6]);
    applyHistoryPage(CONV, page([1, 2, 3], { nextCursor: 'c-deep', hasMore: true }), {
      append: true,
    });

    expect(idsNewestFirst()).toEqual(['m6', 'm5', 'm4', 'm3', 'm2', 'm1']);
    const sync = readSyncState(CONV)!;
    expect(sync.oldest_loaded_sent_at_ms).toBe(BASE + 60_000);
    expect(sync.next_cursor).toBe('c-deep');
    expect(sync.has_more).toBe(1);
  });
});

describe('applyHistoryPage — page-1 reconcile', () => {
  it('ilk çekim: gap yok, sync_state kurulur', () => {
    applyHistoryPage(CONV, page([1, 2, 3], { nextCursor: 'c1', hasMore: true }), {
      append: false,
    });

    const sync = readSyncState(CONV)!;
    expect(sync.oldest_loaded_sent_at_ms).toBe(BASE + 60_000);
    expect(sync.next_cursor).toBe('c1');
  });

  it('içerik birebir aynı (server oldest m3 = local newest m3) → çakışır, satır değişmez', () => {
    seed([1, 2, 3]);
    const before = getChatDb().getAll<{ id: string; row_version: number }>(
      'SELECT id, row_version FROM messages ORDER BY id',
    );

    const result = applyHistoryPage(CONV, page([1, 2, 3]), { append: false });

    expect(result.gapReplaced).toBe(false);
    expect(result.skipped).toBe(false);
    // HİÇBİR row_version artmamalı — messageCache'in O(1) hızlı yolu buna dayanıyor.
    expect(
      getChatDb().getAll<{ id: string; row_version: number }>(
        'SELECT id, row_version FROM messages ORDER BY id',
      ),
    ).toEqual(before);
  });

  it('pencereler çakışıyor (server oldest m4, local newest m6) → kuyruk korunur', () => {
    seed([1, 2, 3, 4, 5, 6]);
    applyHistoryPage(CONV, page([4, 5, 6]), { append: false });

    // m1..m3 sayfada yoktu ama silinmemeli.
    expect(idsNewestFirst()).toEqual(['m6', 'm5', 'm4', 'm3', 'm2', 'm1']);
  });

  it('çakışıyor + kuyruk + derin cursor varsa sayfa-1 cursor\'ı YAZILMAZ', () => {
    seed([1, 2, 3, 4, 5, 6]);
    applyHistoryPage(CONV, page([1, 2, 3], { nextCursor: 'c-deep', hasMore: true }), {
      append: true,
    });

    applyHistoryPage(CONV, page([4, 5, 6], { nextCursor: 'c-page1', hasMore: true }), {
      append: false,
    });

    // Sayfa-1'in cursor'ını yazmak zaten indirilmiş kuyruğu yeniden indirtirdi.
    expect(readSyncState(CONV)!.next_cursor).toBe('c-deep');
  });

  it('çakışıyor ama cursor null (persist/hydrate sonrası) → sayfa-1 cursor\'ı ONARIR', () => {
    seed([2, 3]);
    expect(readSyncState(CONV)).toBeNull();

    applyHistoryPage(CONV, page([2, 3], { nextCursor: 'c-fresh', hasMore: true }), {
      append: false,
    });

    expect(readSyncState(CONV)!.next_cursor).toBe('c-fresh');
  });

  it('çakışmıyor + hasMore:true → yetim kuyruk silinir (gap-replace)', () => {
    seed([1, 2, 3]);
    const result = applyHistoryPage(CONV, page([8, 9], { nextCursor: 'c-new', hasMore: true }), {
      append: false,
    });

    expect(result.gapReplaced).toBe(true);
    expect(result.deletedCount).toBe(3);
    expect(idsNewestFirst()).toEqual(['m9', 'm8']);
    expect(readSyncState(CONV)!.oldest_loaded_sent_at_ms).toBe(BASE + 8 * 60_000);
  });

  it('çakışmıyor + hasMore:false → silmeyi REDDEDER (cursor geri getiremez)', () => {
    seed([1, 2, 3]);
    const result = applyHistoryPage(CONV, page([8, 9], { hasMore: false }), { append: false });

    expect(result.gapRefused).toBe(true);
    expect(result.gapReplaced).toBe(false);
    expect(idsNewestFirst()).toEqual(['m9', 'm8', 'm3', 'm2', 'm1']);
  });

  it('sınır mesajı herkesten silinmiş olsa bile ZAMAN testi çakışmayı görür', () => {
    // Eski id-üyeliği testi: sunucu sayfasının en eski mesajı (m4) yerelde
    // "yok" sayılırdı → sahte gap → m1..m3 silinirdi. Zaman testi görmüyor.
    seed([1, 2, 3, 5, 6]);
    const result = applyHistoryPage(CONV, page([4, 5, 6]), { append: false });

    expect(result.gapReplaced).toBe(false);
    expect(idsNewestFirst()).toEqual(['m6', 'm5', 'm4', 'm3', 'm2', 'm1']);
  });
});

describe('applyHistoryPage — boş sayfa (arşivi koruyan kural)', () => {
  it('elimizde mesaj VARKEN boş page-1 HİÇBİR ŞEYİ değiştirmez', () => {
    seed([1, 2, 3]);
    applyHistoryPage(CONV, page([1, 2, 3], { nextCursor: 'c1', hasMore: true }), {
      append: false,
    });
    const syncBefore = readSyncState(CONV);
    const rowsBefore = getChatDb().getAll('SELECT * FROM messages ORDER BY id');

    const result = applyHistoryPage(
      CONV,
      { messages: [], nextCursor: null, hasMore: false, hasHiddenHistory: true },
      { append: false },
    );

    expect(result.skipped).toBe(true);
    expect(getChatDb().getAll('SELECT * FROM messages ORDER BY id')).toEqual(rowsBefore);
    // hasHiddenHistory dahil tek alan bile yazılmamalı.
    expect(readSyncState(CONV)).toEqual(syncBefore);
  });

  it('hiç mesaj yokken boş page-1 doğruyu söyler (boş sohbet) → sync_state kurulur', () => {
    const result = applyHistoryPage(
      CONV,
      { messages: [], nextCursor: null, hasMore: false, hasHiddenHistory: true },
      { append: false },
    );

    expect(result.skipped).toBe(false);
    expect(readSyncState(CONV)!.has_hidden_history).toBe(1);
  });
});

describe('gap-replace bekleyen gönderimleri silmez', () => {
  it("send_state 'pending'/'failed' satırlar yetim kuyrukta bile kalır", () => {
    const db = getChatDb();
    seed([1, 2]);
    db.transaction(() => {
      upsertMessage(db, msg(3, { id: 'temp-x', clientMessageId: 'cmid-x' }), CONV, 'pending');
      upsertMessage(db, msg(4, { id: 'temp-y', clientMessageId: 'cmid-y' }), CONV, 'failed');
    });

    applyHistoryPage(CONV, page([8, 9], { nextCursor: 'c', hasMore: true }), { append: false });

    const remaining = idsNewestFirst();
    expect(remaining).toContain('temp-x');
    expect(remaining).toContain('temp-y');
    expect(remaining).not.toContain('m1');
  });
});

describe('clientMessageId ile uzlaştırma', () => {
  it('temp satır server id\'sine DÖNÜŞÜR, ikinci satır yaratılmaz', () => {
    const db = getChatDb();
    upsertMessage(db, msg(1, { id: 'temp-x', clientMessageId: 'cmid-x' }), CONV, 'pending');

    // Sunucu ack'i: gerçek id, aynı cmid.
    upsertMessage(db, msg(1, { id: 'srv-1', clientMessageId: 'cmid-x' }), CONV, 'sent');

    const rows = db.getAll<{ id: string; send_state: string }>('SELECT id, send_state FROM messages');
    expect(rows).toEqual([{ id: 'srv-1', send_state: 'sent' }]);
  });
});

describe('readOlder — keyset', () => {
  it('aynı milisaniyedeki mesajlarda id tiebreaker\'ı satır atlatmaz', () => {
    const db = getChatDb();
    const sameTime = new Date(BASE).toISOString();
    db.transaction(() => {
      for (const id of ['a', 'b', 'c']) {
        upsertMessage(db, { ...msg(0), id, sentAt: sameTime } as MessageDto, CONV);
      }
    });

    const firstPage = readOlder(CONV, { sentAtMs: BASE, id: 'd' }, 2);
    expect(firstPage.map((r) => r.id)).toEqual(['c', 'b']);

    const secondPage = readOlder(CONV, { sentAtMs: BASE, id: 'b' }, 2);
    expect(secondPage.map((r) => r.id)).toEqual(['a']);
  });
});
