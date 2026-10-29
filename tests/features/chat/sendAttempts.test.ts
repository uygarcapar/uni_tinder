jest.mock('expo-sqlite');
jest.mock('react-native-mmkv');

import * as SQLite from 'expo-sqlite';
import {
  openChatDb,
  __resetChatDbForTests,
  CHAT_DB_NAME,
  type ChatDbDriver,
} from '@/features/chat/db/chatDb';
import {
  readSendAttempts,
  upsertSendAttempt,
  deleteSendAttempts,
  pruneOrphanSendAttempts,
  clearAllChatData,
  saveMessage,
} from '@/features/chat/chatRepository';
import type { SendAttemptRow } from '@/features/chat/db/rows';
import { MIGRATIONS, runMigrations } from '@/features/chat/db/migrations';
import { clear as clearMessageCache } from '@/features/chat/messageCache';
import type { MessageDto } from '@/shared/types';

/**
 * `send_attempts` (v7) — gönderim kuyruğunun disk muhasebesi.
 *
 * Bugüne kadar bu bilgi outbox.ts'teki in-memory Map'teydi ve process ölünce
 * sıfırlanıyordu (bkz. chatRepository.ts:291 yorumu). Burada yalnız depo
 * katmanı test ediliyor — Task 3 bu API'yi tüketecek, Map'i söküp yerine
 * bunu koyacak.
 */

const { __resetAllDatabases } = SQLite as unknown as { __resetAllDatabases: () => void };

const CONV = 'conv-1';

const msg = (id: string, over: Partial<MessageDto> = {}): MessageDto =>
  ({
    id,
    conversationId: CONV,
    senderId: 'me',
    content: `içerik ${id}`,
    contentType: 0,
    sentAt: '2026-10-29T10:00:00.000Z',
    clientMessageId: `cmid-${id}`,
    ...over,
  }) as MessageDto;

const row = (over: Partial<SendAttemptRow> = {}): SendAttemptRow => ({
  client_message_id: 'cmid-1',
  attempts: 1,
  first_seen_at_ms: 1_000,
  next_eligible_at_ms: 2_000,
  permanent: 0,
  quota_charged: 0,
  origin: 'manual',
  last_error: null,
  ...over,
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

describe('send_attempts: yazıp geri okuma', () => {
  it('yazıp geri okuyor', () => {
    upsertSendAttempt(row());

    expect(readSendAttempts()).toEqual([row()]);
  });

  it('aynı cmid ikinci yazımda GÜNCELLENİYOR, satır çiftlenmiyor', () => {
    upsertSendAttempt(row({ attempts: 1, last_error: null }));
    upsertSendAttempt(row({ attempts: 2, last_error: 'UT-6701', permanent: 1 }));

    const all = readSendAttempts();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(row({ attempts: 2, last_error: 'UT-6701', permanent: 1 }));
  });

  it('deleteSendAttempts yalnız verilen cmid’leri siliyor', () => {
    upsertSendAttempt(row({ client_message_id: 'cmid-a' }));
    upsertSendAttempt(row({ client_message_id: 'cmid-b' }));
    upsertSendAttempt(row({ client_message_id: 'cmid-c' }));

    deleteSendAttempts(['cmid-a', 'cmid-c']);

    expect(readSendAttempts().map((r) => r.client_message_id)).toEqual(['cmid-b']);
  });

  it('pruneOrphanSendAttempts gönderilmiş mesajın kaydını siliyor, bekleyeni bırakıyor', () => {
    saveMessage(msg('m-sent'), CONV); // varsayılan send_state 'sent'
    saveMessage(msg('m-pending'), CONV, 'pending');
    upsertSendAttempt(row({ client_message_id: 'cmid-m-sent' }));
    upsertSendAttempt(row({ client_message_id: 'cmid-m-pending' }));

    const removed = pruneOrphanSendAttempts();

    expect(removed).toBe(1);
    expect(readSendAttempts().map((r) => r.client_message_id)).toEqual(['cmid-m-pending']);
  });

  it('clearAllChatData send_attempts’i de boşaltıyor', () => {
    upsertSendAttempt(row());

    clearAllChatData();

    expect(readSendAttempts()).toEqual([]);
  });

  it('v6 veritabanı v7’ye yükselince mesaj ve sohbet satırları duruyor', () => {
    // beforeEach'in openChatDb()'si bu dosyayı ZATEN v7'ye taşımış — üstüne
    // v1 migration'ını (CREATE TABLE conversations...) tekrar koşmak "tablo
    // zaten var" hatası verir. Gerçek bir v6 kurulumunu taklit etmek için
    // "diski" tamamen silip ham sürücüyle (openChatDb'nin DIŞINDAN,
    // migrations'ı HİÇ çalıştırmadan) sıfırdan açıyoruz.
    __resetChatDbForTests();
    __resetAllDatabases();
    const raw = SQLite.openDatabaseSync(CHAT_DB_NAME);
    const db: ChatDbDriver = {
      getAll: (sql, params = []) => raw.getAllSync(sql, params),
      getFirst: (sql, params = []) => raw.getFirstSync(sql, params),
      run: (sql, params = []) => {
        raw.runSync(sql, params);
      },
      exec: (sql) => raw.execSync(sql),
      transaction: (fn) => raw.withTransactionSync(fn),
      close: () => raw.closeSync(),
    };

    // Ham sürücüyle v1..v6'yı MIGRATIONS dizisinden tek tek koşturup
    // user_version'ı 6'da damgalıyoruz — v6 şemasının ikinci bir el yazımı
    // KOPYASI (ayrı bir doğruluk kaynağı) üretmemenin yolu bu.
    for (const migration of MIGRATIONS) {
      if (migration.version > 6) continue;
      migration.up(db);
    }
    db.exec('PRAGMA user_version = 6');

    db.run(
      `INSERT INTO conversations (conversation_id, partner_user_id) VALUES (?, ?)`,
      ['conv-eski', 'partner-1'],
    );
    db.run(
      `INSERT INTO messages (id, conversation_id, content, content_type, sent_at, sent_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['m-eski', 'conv-eski', 'merhaba', 0, '2026-10-20T10:00:00.000Z', 1_761_000_000_000],
    );

    runMigrations(db);

    expect(db.getAll('SELECT id FROM messages')).toEqual([{ id: 'm-eski' }]);
    expect(db.getAll('SELECT conversation_id FROM conversations')).toEqual([
      { conversation_id: 'conv-eski' },
    ]);
    const tables = db
      .getAll<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'send_attempts'",
      )
      .map((t) => t.name);
    expect(tables).toEqual(['send_attempts']);
  });
});
