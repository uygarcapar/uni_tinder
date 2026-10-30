jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  getChatDb,
  __resetChatDbForTests,
  CHAT_DB_NAME,
  type ChatDbDriver,
} from '@/features/chat/db/chatDb';
import {
  readBackfillTargets,
  setBackfillCursor,
  markBackfillDone,
  clearBackfillDone,
  bumpBackfillFailure,
  saveMessage,
  MESSAGE_RETENTION_DAYS,
  pruneExpiredMessages,
} from '@/features/chat/chatRepository';
import { BACKFILL_MAX_FAILURES } from '@/features/chat/backfillPolicy';
import { CHAT_DB_VERSION, MIGRATIONS, runMigrations } from '@/features/chat/db/migrations';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

/**
 * `sync_state.backfill_cursor` / `backfill_done` (v8) — backfill'in kendi
 * ilerleme damgası. Burada yalnız depo katmanı (okuma/yazma/migration) test
 * ediliyor; bu API'yi tüketen tur ve tetikleyiciler `chatBackfill.ts`'te
 * (testleri chatBackfill.test.ts / chatBackfill.triggers.test.ts).
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

/** Minimal bir `conversations` satırı — testin tek ilgilendiği alan `last_message_at_ms`. */
const insertConversation = (
  db: ChatDbDriver,
  conversationId: string,
  lastMessageAtMs: number | null = null,
): void => {
  db.run(
    `INSERT INTO conversations (conversation_id, partner_user_id, last_message_at_ms)
     VALUES (?, ?, ?)`,
    [conversationId, `partner-${conversationId}`, lastMessageAtMs],
  );
};

const WELL_PAST = MESSAGE_RETENTION_DAYS + 90;
const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/** `daysAgo` gün önce gönderilmiş mesaj — `pruneExpiredMessages`'ı tetiklemek için. */
const aged = (id: string, conversationId: string, daysAgo: number): MessageDto =>
  ({
    id,
    conversationId,
    senderId: 'partner',
    content: id,
    contentType: 0,
    sentAt: new Date(NOW - daysAgo * DAY).toISOString(),
  }) as MessageDto;

describe('backfill ilerleme kolonları (v8)', () => {
  it('readBackfillTargets son konuşulan sohbetten geriye sıralıyor', () => {
    const db = getChatDb();
    insertConversation(db, 'conv-orta', 2_000);
    insertConversation(db, 'conv-yeni', 3_000);
    insertConversation(db, 'conv-eski', 1_000);

    const targets = readBackfillTargets(10).map((t) => t.conversationId);

    expect(targets).toEqual(['conv-yeni', 'conv-orta', 'conv-eski']);
  });

  it('last_message_at_ms eşit olan sohbetlerde sıra conversation_id ile SABİT', () => {
    // Tek kolonlu ORDER BY'da eşit satırların hangi fiziksel sırada geldiği
    // SQLite'ın iç detayı — tiebreaker olmadan round'lar her çalışmada farklı
    // bir satırı "önce" seçebilirdi. Aynı zaman damgasını kasten paylaştırıyoruz.
    const db = getChatDb();
    insertConversation(db, 'conv-b', 5_000);
    insertConversation(db, 'conv-a', 5_000);
    insertConversation(db, 'conv-c', 5_000);

    const targets = readBackfillTargets(10).map((t) => t.conversationId);

    expect(targets).toEqual(['conv-a', 'conv-b', 'conv-c']);
  });

  it('hiç mesajlaşılmamış (last_message_at_ms NULL) sohbet de hedef, en sona düşer', () => {
    const db = getChatDb();
    insertConversation(db, 'conv-mesajli', 1_000);
    insertConversation(db, 'conv-hic-mesajsiz', null);

    const targets = readBackfillTargets(10).map((t) => t.conversationId);

    expect(targets).toEqual(['conv-mesajli', 'conv-hic-mesajsiz']);
  });

  it('markBackfillDone edilen sohbet targets listesinde ÇIKMIYOR', () => {
    const db = getChatDb();
    insertConversation(db, 'conv-bitti', 2_000);
    insertConversation(db, 'conv-devam', 1_000);

    markBackfillDone('conv-bitti');

    const targets = readBackfillTargets(10).map((t) => t.conversationId);
    expect(targets).toEqual(['conv-devam']);
  });

  it('clearBackfillDone sohbeti hedef listesine GERİ getiriyor, cursor\'a dokunmuyor', () => {
    // `backfill_done` bir MANDAL: tek yazıcısı `markBackfillDone` ve onu
    // `clearAllChatData()` dışında hiçbir tam senkron yolu temizlemiyor. Gizli
    // geçmişi olan (rematch) bir sohbet sunucudan `messages: [] / hasMore:
    // false` alıp "tamam" damgasını yiyebiliyor; kullanıcı arşivi açtığında
    // (`chat/historyRevealed`) mandalın SÖKÜLEBİLİR olması şart, yoksa o
    // sohbetin geçmişi bir daha hiç indirilmiyor.
    const db = getChatDb();
    insertConversation(db, 'conv-gizli', 1_000);
    setBackfillCursor('conv-gizli', 'cursor-yarida');
    markBackfillDone('conv-gizli');
    expect(readBackfillTargets(10)).toEqual([]);

    clearBackfillDone('conv-gizli');

    // Cursor KORUNUYOR: mandal "bitti mi" sorusuna ait, "nerede kalmıştım"a
    // değil — ikisini birlikte sıfırlamak diskte olan sayfaları yeniden
    // indirtirdi.
    expect(readBackfillTargets(10)).toEqual([
      { conversationId: 'conv-gizli', cursor: 'cursor-yarida', failures: 0 },
    ]);
  });

  it('clearBackfillDone sync_state satırı YOKKEN satır AÇMIYOR', () => {
    // Mandal yoksa temizlenecek bir şey de yok; boş bir sync_state satırı
    // açmak `readBackfillTargets`'ın LEFT JOIN'ini gereksizce besler.
    const db = getChatDb();
    insertConversation(db, 'conv-bos', 1_000);

    clearBackfillDone('conv-bos');

    expect(db.getAll('SELECT conversation_id FROM sync_state')).toEqual([]);
  });

  it('setBackfillCursor yazdığı cursor targets ile geri geliyor', () => {
    const db = getChatDb();
    insertConversation(db, 'conv-1', 1_000);

    setBackfillCursor('conv-1', 'cursor-abc');

    expect(readBackfillTargets(10)).toEqual([
      { conversationId: 'conv-1', cursor: 'cursor-abc', failures: 0 },
    ]);
  });

  it('limit tavanına uyuyor', () => {
    const db = getChatDb();
    for (let i = 0; i < 5; i += 1) insertConversation(db, `conv-${i}`, 1_000 + i);

    expect(readBackfillTargets(2)).toHaveLength(2);
  });

  it('rafa kalkmış (üst üste BACKFILL_MAX_FAILURES hatalı) sohbet LIMIT PENCERESİNE hiç GİRMİYOR', () => {
    // Ayırt edici: eleme `LIMIT`'TEN SONRA (ör. çağıranın kendi filtresinde)
    // yapılsaydı bu sohbet yine de pencereyi doldururdu ve dar bir `limit`
    // altında arkadaki canlı sohbeti dışarıda bırakırdı — tam da bu testin
    // ayırt etmesi gereken hata. `limit=1` bunu zorluyor: rafa kalkmış sohbet
    // en yeni konuşulan (pencereye İLK girecek olan) olmasına rağmen dönen
    // tek satır canlı sohbet olmalı.
    const db = getChatDb();
    insertConversation(db, 'conv-rafa', 2_000); // en yeni — eleme yoksa pencereyi o doldururdu
    insertConversation(db, 'conv-canli', 1_000);
    for (let i = 0; i < BACKFILL_MAX_FAILURES; i += 1) bumpBackfillFailure('conv-rafa');

    const targets = readBackfillTargets(1);

    expect(targets).toEqual([{ conversationId: 'conv-canli', cursor: null, failures: 0 }]);
  });

  it('sync_state satırı HİÇ YOKKEN de hedef döndürüyor (cursor null)', () => {
    const db = getChatDb();
    insertConversation(db, 'conv-cursursuz', 1_000);

    expect(readBackfillTargets(10)).toEqual([
      { conversationId: 'conv-cursursuz', cursor: null, failures: 0 },
    ]);
  });

  it('pruneExpiredMessages backfill_cursor ve backfill_done’a DOKUNMUYOR', () => {
    const db = getChatDb();
    // Her iki sohbette de budamanın GERÇEKTEN dokunacağı eski birer mesaj var
    // — yoksa `affected` listesi boş kalır ve test "hiçbir şey olmadı" için
    // yanlış sebeple yeşile düşer.
    insertConversation(db, 'conv-cursor', 1_000);
    insertConversation(db, 'conv-done', 2_000);
    setBackfillCursor('conv-cursor', 'cursor-korunmali');
    markBackfillDone('conv-done');
    saveMessage(aged('m-cursor', 'conv-cursor', WELL_PAST), 'conv-cursor');
    saveMessage(aged('m-done', 'conv-done', WELL_PAST), 'conv-done');

    // `toBe(2)`: iki eski mesaj da GERÇEKTEN silinmeli — yoksa affected listesi
    // boş kalır ve aşağıdaki "dokunulmadı" iddiası "hiçbir şey olmadı" için
    // yanlış sebeple yeşile düşer (RETENTION_SLACK_DAYS büyürse bu test fail eder).
    expect(pruneExpiredMessages(NOW)).toBe(2);

    const targets = readBackfillTargets(10);
    expect(targets.find((t) => t.conversationId === 'conv-cursor')?.cursor).toBe(
      'cursor-korunmali',
    );
    expect(targets.some((t) => t.conversationId === 'conv-done')).toBe(false);
  });

  it('v7 veritabanı EN SON sürüme yükselince mesaj/sohbet/sync_state satırları duruyor', () => {
    const db = rawDriverOnEmptyDisk();
    stampV7(db);

    db.run('INSERT INTO conversations (conversation_id, partner_user_id) VALUES (?, ?)', [
      'conv-eski',
      'partner-1',
    ]);
    db.run(
      `INSERT INTO messages (id, conversation_id, content, content_type, sent_at, sent_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['m-eski', 'conv-eski', 'merhaba', 0, '2026-10-20T10:00:00.000Z', 1_761_000_000_000],
    );
    db.run(
      `INSERT INTO sync_state (conversation_id, next_cursor, has_more) VALUES (?, ?, ?)`,
      ['conv-eski', 'c-eski', 1],
    );

    runMigrations(db);

    expect(db.getFirst<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(
      CHAT_DB_VERSION,
    );
    expect(db.getAll('SELECT id FROM messages')).toEqual([{ id: 'm-eski' }]);
    expect(db.getAll('SELECT conversation_id FROM conversations')).toEqual([
      { conversation_id: 'conv-eski' },
    ]);
    expect(
      db.getFirst<{ next_cursor: string | null; backfill_cursor: string | null; backfill_done: number }>(
        'SELECT next_cursor, backfill_cursor, backfill_done FROM sync_state WHERE conversation_id = ?',
        ['conv-eski'],
      ),
    ).toEqual({ next_cursor: 'c-eski', backfill_cursor: null, backfill_done: 0 });
  });
});

/**
 * "Diski" tamamen silip migration'ları HİÇ çalıştırmamış ham bir sürücü açar —
 * `openChatDb` dosyayı zaten v8'e taşıdığı için eski bir sürümü taklit
 * etmenin tek yolu bu (bkz. sendAttempts.test.ts — aynı desen).
 */
const rawDriverOnEmptyDisk = (): ChatDbDriver => {
  __resetChatDbForTests();
  __resetAllDatabases();
  const raw = SQLite.openDatabaseSync(CHAT_DB_NAME);
  return {
    getAll: (sql, params = []) => raw.getAllSync(sql, params),
    getFirst: (sql, params = []) => raw.getFirstSync(sql, params),
    run: (sql, params = []) => {
      raw.runSync(sql, params);
    },
    exec: (sql) => raw.execSync(sql),
    transaction: (fn) => raw.withTransactionSync(fn),
    close: () => raw.closeSync(),
  };
};

/**
 * Ham sürücüyle v1..v7'yi MIGRATIONS dizisinden tek tek koşturup
 * `user_version`'ı 7'de damgalar — v7 şemasının ikinci bir el yazımı KOPYASI
 * (ayrı bir doğruluk kaynağı) üretmemenin yolu bu.
 */
const stampV7 = (db: ChatDbDriver) => {
  for (const migration of MIGRATIONS) {
    if (migration.version > 7) continue;
    migration.up(db);
  }
  db.exec('PRAGMA user_version = 7');
};
