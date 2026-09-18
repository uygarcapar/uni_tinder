jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import { openChatDb, getChatDb, __resetChatDbForTests } from '@/features/chat/db/chatDb';
import {
  MESSAGE_RETENTION_DAYS,
  applyHistoryPage,
  pruneExpiredMessages,
  readSyncState,
  upsertMessage,
} from '@/features/chat/chatRepository';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';
const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** `daysAgo` gün önce gönderilmiş mesaj. */
const aged = (id: string, daysAgo: number): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'partner',
    content: id,
    contentType: 0,
    sentAt: new Date(NOW - daysAgo * DAY).toISOString(),
  }) as MessageDto;

const ids = () =>
  getChatDb()
    .getAll<{ id: string }>('SELECT id FROM messages ORDER BY sent_at_ms DESC')
    .map((r) => r.id);

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

/** Sunucunun gecikmesi için eklenen payın ötesinde — kesin silinecek yaş. */
const WELL_PAST = MESSAGE_RETENTION_DAYS + 90;

describe('pruneExpiredMessages', () => {
  it('saklama penceresi sunucunun 2 yıllık job\'ıyla aynı', () => {
    expect(MESSAGE_RETENTION_DAYS).toBe(730);
  });

  it('pencere dışındakileri siler, içindekilere dokunmaz', () => {
    const db = getChatDb();
    db.transaction(() => {
      upsertMessage(db, aged('cok-eski', WELL_PAST), CONV);
      upsertMessage(db, aged('sinirda-yeni', MESSAGE_RETENTION_DAYS - 1), CONV);
      upsertMessage(db, aged('dun', 1), CONV);
    });

    const deleted = pruneExpiredMessages(NOW);

    expect(deleted).toBe(1);
    expect(ids()).toEqual(['dun', 'sinirda-yeni']);
  });

  it('NOMİNAL sınırı yeni geçenlere DOKUNMAZ — sunucu silmesi haftalık job ile gecikiyor', () => {
    // Sunucu 730'u geçen mesajı hemen silmiyor: job Pazartesi 02:00 UTC'de
    // çalışıyor ve run başına 1M ile sınırlı. Tam 730'da budasaydık sunucunun
    // hâlâ servis ettiği satırı silerdik → tam-senkronda geri gelir, bir
    // sonraki budamada yine silinirdi (salınım).
    const db = getChatDb();
    db.transaction(() => {
      upsertMessage(db, aged('nominali-yeni-gecti', MESSAGE_RETENTION_DAYS + 3), CONV);
    });

    expect(pruneExpiredMessages(NOW)).toBe(0);
    expect(ids()).toEqual(['nominali-yeni-gecti']);
  });

  it('SYSTEM mesajlarını silmez — sunucuda da retention\'dan muaflar', () => {
    // MessageRetentionJob: `.Where(m => m.SentAt < cutoff && !m.IsSystemMessage)`
    // Silseydik sunucunun hâlâ döndürdüğü satırlar her tam-senkronda geri
    // gelip her budamada tekrar silinirdi.
    const db = getChatDb();
    db.transaction(() => {
      upsertMessage(
        db,
        { ...aged('match-created', WELL_PAST), isSystemMessage: true, localizationKey: 'system.match_created' },
        CONV,
      );
      upsertMessage(db, aged('normal-eski', WELL_PAST), CONV);
    });

    const deleted = pruneExpiredMessages(NOW);

    expect(deleted).toBe(1);
    expect(ids()).toEqual(['match-created']);
  });

  it('BEKLEYEN/BAŞARISIZ gönderimlere dokunmaz — kullanıcının yazdığı şey silinmez', () => {
    const db = getChatDb();
    db.transaction(() => {
      upsertMessage(db, aged('eski-gonderilmis', WELL_PAST), CONV);
      upsertMessage(db, { ...aged('eski-pending', WELL_PAST), clientMessageId: 'c1' }, CONV, 'pending');
      upsertMessage(db, { ...aged('eski-failed', WELL_PAST), clientMessageId: 'c2' }, CONV, 'failed');
    });

    pruneExpiredMessages(NOW);

    const remaining = ids();
    expect(remaining).toContain('eski-pending');
    expect(remaining).toContain('eski-failed');
    expect(remaining).not.toContain('eski-gonderilmis');
  });

  it('budama sonrası cursor NULL\'lanır ve oldest_loaded yükselir', () => {
    // Derin sayfalama yapılmış bir sohbet: elde bir derin cursor var.
    applyHistoryPage(
      CONV,
      { messages: [aged('yeni', 1), aged('eski', WELL_PAST)], nextCursor: 'c-deep', hasMore: true },
      { append: false },
    );
    expect(readSyncState(CONV)!.next_cursor).toBe('c-deep');

    pruneExpiredMessages(NOW);

    const sync = readSyncState(CONV)!;
    // Cursor artık yerel aralığın ALTINI işaret ediyordu → delik üretirdi.
    expect(sync.next_cursor).toBeNull();
    expect(sync.oldest_loaded_sent_at_ms).toBe(NOW - 1 * DAY);
  });

  it('hayatta kalan SYSTEM mesajı bitişik tabanı aşağı ÇEKMEZ', () => {
    // Muaf system mesajı cutoff'un çok altında kalıyor. Tabanı ona göre
    // kursaydık, aradaki normal mesajların silindiği DELİKLİ bir aralık
    // üzerinde "bitişik" iddia etmiş olurduk.
    const db = getChatDb();
    applyHistoryPage(
      CONV,
      { messages: [aged('yeni', 1)], nextCursor: 'c-deep', hasMore: true },
      { append: false },
    );
    db.transaction(() => {
      upsertMessage(db, { ...aged('eski-system', WELL_PAST), isSystemMessage: true }, CONV);
      upsertMessage(db, aged('eski-normal', WELL_PAST), CONV);
    });

    pruneExpiredMessages(NOW);

    expect(ids()).toEqual(['yeni', 'eski-system']);
    // Taban kesintisiz bölgenin başı — eski system mesajı bitişiklik
    // garantisinin DIŞINDA.
    expect(readSyncState(CONV)!.oldest_loaded_sent_at_ms).toBe(NOW - 1 * DAY);
  });

  it('silinecek bir şey yoksa hiçbir şeye dokunmaz', () => {
    applyHistoryPage(
      CONV,
      { messages: [aged('yeni', 1)], nextCursor: 'c-deep', hasMore: true },
      { append: false },
    );

    expect(pruneExpiredMessages(NOW)).toBe(0);
    // Cursor korunmalı — gereksiz null'lamak sayfalamayı bozardı.
    expect(readSyncState(CONV)!.next_cursor).toBe('c-deep');
  });

  it('boş arşivde patlamaz', () => {
    expect(() => pruneExpiredMessages(NOW)).not.toThrow();
  });

  it('yalnız etkilenen sohbetin sync_state\'ine dokunur', () => {
    const db = getChatDb();
    applyHistoryPage(
      'conv-temiz',
      { messages: [{ ...aged('a', 1), conversationId: 'conv-temiz' }], nextCursor: 'c-temiz', hasMore: true },
      { append: false },
    );
    db.transaction(() => {
      upsertMessage(db, aged('eski', MESSAGE_RETENTION_DAYS + 5), CONV);
    });

    pruneExpiredMessages(NOW);

    expect(readSyncState('conv-temiz')!.next_cursor).toBe('c-temiz');
  });
});
