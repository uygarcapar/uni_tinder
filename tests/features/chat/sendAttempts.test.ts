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
  removeConversationLocally,
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
  // Gerçek bir `FailOrigin` değeri — 'manual' hiçbir yazıcının üretemediği bir
  // değerdi ve okuyana var olmayan bir kaynak sınıfı varmış gibi görünüyordu.
  origin: 'throw',
  last_error: null,
  ...over,
});

beforeEach(() => {
  __resetChatDbForTests();
  __resetAllDatabases();
  clearMessageCache();
  openChatDb();
});

/**
 * "Diski" tamamen silip migration'ları HİÇ çalıştırmamış ham bir sürücü açar —
 * `openChatDb` dosyayı zaten v7'ye taşıdığı için eski bir sürümü taklit
 * etmenin tek yolu bu.
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
 * Ham sürücüyle v1..v6'yı MIGRATIONS dizisinden tek tek koşturup
 * `user_version`'ı 6'da damgalar — v6 şemasının ikinci bir el yazımı KOPYASI
 * (ayrı bir doğruluk kaynağı) üretmemenin yolu bu.
 */
const stampV6 = (db: ChatDbDriver) => {
  for (const migration of MIGRATIONS) {
    if (migration.version > 6) continue;
    migration.up(db);
  }
  db.exec('PRAGMA user_version = 6');
};

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
    // Asıl yetim şekli: messages'ta HİÇ karşılığı olmayan satır — fonksiyonun
    // kendi yorumundaki "ya da hiç yok" dalı, retention budamasından sonra
    // gerçekte ortaya çıkan durum.
    upsertSendAttempt(row({ client_message_id: 'cmid-yok' }));

    const removed = pruneOrphanSendAttempts();

    expect(removed).toBe(2);
    expect(readSendAttempts().map((r) => r.client_message_id)).toEqual(['cmid-m-pending']);
  });

  it('clearAllChatData send_attempts’i de boşaltıyor', () => {
    upsertSendAttempt(row());

    clearAllChatData();

    expect(readSendAttempts()).toEqual([]);
  });

  it('removeConversationLocally yalnız silinen sohbetin muhasebesini siliyor', () => {
    // send_attempts'in conversation_id kolonu yok — silme messages'taki cmid
    // eşleşmesi üzerinden alt sorguyla çalışıyor, bu yüzden messages
    // SİLİNMEDEN ÖNCE koşmak zorunda (bkz. removeConversationLocally
    // yorumu): alt sorgu messages'ı okuyor, o satırlar gitmişse hangi
    // cmid'lerin bu sohbete ait olduğunu bir daha bulamaz. Bu test tam o
    // sırayı kilitliyor — sıra bozulursa (messages önce silinirse) bu
    // sohbetin send_attempts satırı hiç silinmez ve test kırmızıya düşer.
    // (`client_message_id IS NOT NULL` koruması ayrı bir konu — IN listesini
    // NULL'dan temiz tutuyor ama davranışı değiştirmiyor: eşleşen bir satır
    // `TRUE OR UNKNOWN` = TRUE olduğu için NULL varken de silinir. O yüzden
    // bu test onu KİLİTLEMİYOR, kilitleyemez de — gözlenebilir bir davranış
    // farkı yok.)
    const CONV_B = 'conv-2';
    saveMessage(msg('m-a'), CONV, 'pending'); // cmid: cmid-m-a
    saveMessage(msg('m-b', { conversationId: CONV_B }), CONV_B, 'pending'); // cmid: cmid-m-b
    upsertSendAttempt(row({ client_message_id: 'cmid-m-a' }));
    upsertSendAttempt(row({ client_message_id: 'cmid-m-b' }));

    removeConversationLocally(CONV);

    expect(readSendAttempts().map((r) => r.client_message_id)).toEqual(['cmid-m-b']);
  });

  /**
   * V7'nin `DROP TABLE` satırı `IF EXISTS`li. Olmasaydı `outbox`u olmayan bir
   * v6 diski her açılışta migration transaction'ını geri alır, `user_version`
   * 6'da takılır, `openChatDb` atar ve ayna kendini devre dışı bırakırdı —
   * yayınlandıktan sonra düzeltilemeyecek bir satırda toplam bir bedel.
   */
  it('outbox tablosu olmayan v6 diski de v7’ye yükseliyor', () => {
    const db = rawDriverOnEmptyDisk();
    stampV6(db);
    db.exec('DROP TABLE outbox');

    expect(() => runMigrations(db)).not.toThrow();

    expect(db.getFirst<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(7);
    expect(
      db.getAll("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'send_attempts'"),
    ).toEqual([{ name: 'send_attempts' }]);
  });

  it('v6 veritabanı v7’ye yükselince mesaj ve sohbet satırları duruyor', () => {
    // beforeEach'in openChatDb()'si bu dosyayı ZATEN v7'ye taşımış — üstüne
    // v1 migration'ını (CREATE TABLE conversations...) tekrar koşmak "tablo
    // zaten var" hatası verir. Gerçek bir v6 kurulumunu taklit etmek için
    // "diski" tamamen silip ham sürücüyle (openChatDb'nin DIŞINDAN,
    // migrations'ı HİÇ çalıştırmadan) sıfırdan açıyoruz.
    const db = rawDriverOnEmptyDisk();
    stampV6(db);

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
