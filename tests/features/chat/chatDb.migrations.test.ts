jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  destroyChatDb,
  __resetChatDbForTests,
  CHAT_DB_NAME,
  type ChatDbDriver,
} from '@/features/chat/db/chatDb';
import { CHAT_DB_VERSION, runMigrations } from '@/features/chat/db/migrations';

const { __resetAllDatabases } = SQLite as unknown as {
  __resetAllDatabases: () => void;
};

function userVersion(db: ChatDbDriver) {
  return db.getFirst<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

function tableNames(db: ChatDbDriver) {
  return db
    .getAll<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((r) => r.name);
}

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
});

describe('chat db migrations', () => {
  it('boş veritabanını en son sürüme taşır ve tabloları kurar', () => {
    const db = openChatDb();

    expect(userVersion(db)).toBe(CHAT_DB_VERSION);
    expect(tableNames(db)).toEqual([
      'conversations',
      'messages',
      'meta',
      'outbox',
      'sync_state',
    ]);
  });

  it('yeniden açılışta idempotent — sürüm sabit, veri duruyor', () => {
    const first = openChatDb();
    first.run(
      `INSERT INTO messages (id, conversation_id, content, content_type, sent_at, sent_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['m1', 'c1', 'merhaba', 0, '2026-09-16T10:00:00Z', 1_757_000_000_000],
    );

    // Gerçek hayatta: app kill + yeniden açılış. Dosya duruyor, singleton sıfır.
    __resetChatDbForTests();
    const second = openChatDb();

    expect(userVersion(second)).toBe(CHAT_DB_VERSION);
    expect(second.getAll('SELECT id FROM messages')).toEqual([{ id: 'm1' }]);
  });

  it('runMigrations ikinci kez çağrılınca hiçbir şey yapmaz', () => {
    const db = openChatDb();
    const before = tableNames(db);

    expect(() => runMigrations(db)).not.toThrow();

    expect(userVersion(db)).toBe(CHAT_DB_VERSION);
    expect(tableNames(db)).toEqual(before);
  });

  it('client_message_id kısmi unique index: mükerrer cmid reddedilir, NULL serbest', () => {
    const db = openChatDb();
    const insert = (id: string, cmid: string | null) =>
      db.run(
        `INSERT INTO messages (id, conversation_id, client_message_id, content, content_type, sent_at, sent_at_ms)
         VALUES (?, ?, ?, '', 0, '2026-09-16T10:00:00Z', 1)`,
        [id, 'c1', cmid],
      );

    insert('m1', 'cmid-1');
    // Aynı cmid ikinci kez giremez — optimistic satırın server ack'iyle
    // ÇİFTLENMEMESİNİ garantileyen şey bu index.
    expect(() => insert('m2', 'cmid-1')).toThrow();

    // Sunucudan gelen mesajların cmid'i yok; kısmi index onları kısıtlamamalı.
    expect(() => {
      insert('m3', null);
      insert('m4', null);
    }).not.toThrow();
  });

  it('destroyChatDb dosyayı siler — sonraki açılış boş ve yeniden migrate edilmiş', () => {
    const db = openChatDb();
    db.run(
      `INSERT INTO messages (id, conversation_id, content, content_type, sent_at, sent_at_ms)
       VALUES ('m1', 'c1', 'gizli', 0, '2026-09-16T10:00:00Z', 1)`,
    );

    destroyChatDb();

    const fresh = openChatDb();
    expect(userVersion(fresh)).toBe(CHAT_DB_VERSION);
    expect(fresh.getAll('SELECT id FROM messages')).toEqual([]);
  });

  it('destroyChatDb hiç açılmamış veritabanında patlamaz', () => {
    expect(() => destroyChatDb()).not.toThrow();
  });

  it('kapatılmış sürücüye yazmak hata verir', () => {
    const db = openChatDb();
    db.close();
    expect(() => db.run('SELECT 1')).toThrow(/closed/);
  });
});

describe('CHAT_DB_NAME', () => {
  it('logout silme yolu ile açma yolu aynı adı kullanır', () => {
    openChatDb();
    expect(() => SQLite.deleteDatabaseSync(CHAT_DB_NAME)).not.toThrow();
  });
});
