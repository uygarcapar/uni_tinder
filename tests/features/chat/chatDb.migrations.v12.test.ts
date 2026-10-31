jest.mock('expo-sqlite');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  getChatDb,
  __resetChatDbForTests,
  type ChatDbDriver,
} from '@/features/chat/db/chatDb';
import { CHAT_DB_VERSION } from '@/features/chat/db/migrations';
import { saveMessage } from '@/features/chat/chatRepository';
import type { MessageDto } from '@/shared/types';

const { __resetAllDatabases } = SQLite as unknown as {
  __resetAllDatabases: () => void;
};

function userVersion(db: ChatDbDriver) {
  return db.getFirst<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

function columnNames(db: ChatDbDriver, table: string) {
  return db.getAll<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
}

function indexNames(db: ChatDbDriver, table: string) {
  return db
    .getAll<{ name: string }>(`PRAGMA index_list(${table})`)
    .map((i) => i.name);
}

const minimal: MessageDto = {
  id: 'm1',
  conversationId: 'conv-1',
  senderId: 'partner',
  content: 'merhaba',
  contentType: 0,
  sentAt: '2026-09-16T10:00:00.000Z',
  readAt: null,
  deliveredAt: null,
  editedAt: null,
  deletedAt: null,
  deletedForEveryone: false,
  clientMessageId: null,
  reactions: [],
  isSystemMessage: false,
  isSenderDeleted: false,
  localizationKey: undefined,
  mediaUrl: null,
  durationMs: null,
  waveformPeaks: null,
  replyToMessageId: null,
  replyTo: null,
};

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
});

/**
 * V10'un gerçek deliğini taklit eder: `user_version = 11`'e damgalanmış ama
 * `content_folded` / `idx_messages_unfolded` hiç oluşmamış bir cihaz. V11
 * (media kolonları) normal koştuğu için onlar mevcut — delik yalnız V10'un
 * genişletilen kısmında.
 */
function simulateHoleyV11(db: ChatDbDriver) {
  db.exec('DROP INDEX idx_messages_unfolded');
  db.exec('ALTER TABLE messages DROP COLUMN content_folded');
  db.exec('PRAGMA user_version = 11');
}

describe('v12 — V10 deliğini sağaltma', () => {
  it('content_folded eksikken V12 kolonu ekliyor ve ayna yazımı artık patlamıyor', () => {
    const db = getChatDb();
    simulateHoleyV11(db);

    __resetChatDbForTests();
    const upgraded = openChatDb();

    expect(userVersion(upgraded)).toBe(CHAT_DB_VERSION);
    expect(columnNames(upgraded, 'messages')).toContain('content_folded');

    // Ayna yazımının gerçek yolu: saveMessage content_folded'a yazıyor.
    expect(() => saveMessage(minimal, 'conv-1')).not.toThrow();
  });

  it('idx_messages_unfolded eksikken V12 yaratıyor, mevcutken çoğaltmıyor', () => {
    const db = getChatDb();
    simulateHoleyV11(db);

    __resetChatDbForTests();
    const upgraded = openChatDb();

    expect(indexNames(upgraded, 'messages')).toContain('idx_messages_unfolded');
    expect(
      indexNames(upgraded, 'messages').filter((n) => n === 'idx_messages_unfolded'),
    ).toHaveLength(1);
  });

  it('sync_state.backfill_failures eksikken V12 ekliyor ve mevcut satırlar 0 alıyor', () => {
    const db = getChatDb();
    db.run(
      `INSERT INTO sync_state (conversation_id, last_synced_at_ms) VALUES ('conv-1', 1)`,
    );
    db.exec('ALTER TABLE sync_state DROP COLUMN backfill_failures');
    db.exec('PRAGMA user_version = 11');

    __resetChatDbForTests();
    const upgraded = openChatDb();

    expect(columnNames(upgraded, 'sync_state')).toContain('backfill_failures');
    expect(
      upgraded.getAll<{ backfill_failures: number }>(
        'SELECT backfill_failures FROM sync_state WHERE conversation_id = ?',
        ['conv-1'],
      ),
    ).toEqual([{ backfill_failures: 0 }]);
  });

  it('sağlam bir veritabanında V12 tam no-op — kolon sayısı ve indeks değişmiyor', () => {
    const db = openChatDb();
    const messagesColsBefore = columnNames(db, 'messages');
    const syncStateColsBefore = columnNames(db, 'sync_state');
    const indexesBefore = indexNames(db, 'messages');

    expect(userVersion(db)).toBe(CHAT_DB_VERSION);
    expect(messagesColsBefore).toContain('content_folded');
    expect(messagesColsBefore).toContain('media_cached_at_ms');
    expect(messagesColsBefore).toContain('media_size_bytes');
    expect(syncStateColsBefore).toContain('backfill_failures');
    expect(indexesBefore).toContain('idx_messages_unfolded');

    // Tazeden V1..V12 sırayla koştu (fresh install) — V12 burada zaten no-op
    // olmuş olmalı. Şimdi ikinci bir idempotent çağrı ile de doğrula.
    const { runMigrations } = require('@/features/chat/db/migrations');
    expect(() => runMigrations(db)).not.toThrow();

    expect(columnNames(db, 'messages')).toEqual(messagesColsBefore);
    expect(columnNames(db, 'sync_state')).toEqual(syncStateColsBefore);
    expect(indexNames(db, 'messages')).toEqual(indexesBefore);
  });
});
