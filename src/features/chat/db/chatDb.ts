import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

/**
 * Chat'in yerel SQLite veritabanı — local-first mimarinin kalıcı kaynağı.
 *
 * ── Neden ince bir sürücü arayüzü ────────────────────────────────────────────
 * TÜM SQL chatRepository'de yaşar; burası yalnızca "SQL çalıştır" yüzeyi. İki
 * sebep:
 *  1. Test: jest'te expo-sqlite yerine better-sqlite3 bağlanıyor ve prod kodu
 *     DEĞİŞMEDEN gerçek SQL koşuyor (bkz. __mocks__/expo-sqlite.ts). Map tabanlı
 *     bir mock her SQL bug'ını geçirirdi — SQL burada yeni hata sınıfı.
 *  2. SQLCipher: şifrelemeye geçerken (ya da bir gün op-sqlite'a) değişen tek
 *     dosya burası olmalı. Arayüzü 6 metotta tutmanın tek amacı bu.
 *
 * ── Parametreler POZİSYONEL ('?') ───────────────────────────────────────────
 * İsimli parametre KULLANMA. expo-sqlite bind anahtarlarını native'e AYNEN
 * geçiriyor (paramUtils.normalizeParams), yani ':x' / '$x' / '@x' ayrımı
 * sürücüye ve platforma bağlı. '?' her iki sürücüde de birebir aynı davranıyor.
 */
export type SqlValue = string | number | null;

export interface ChatDbDriver {
  getAll<T>(sql: string, params?: SqlValue[]): T[];
  getFirst<T>(sql: string, params?: SqlValue[]): T | null;
  run(sql: string, params?: SqlValue[]): void;
  /** Çok ifadeli DDL/PRAGMA — parametre almaz. */
  exec(sql: string): void;
  transaction(fn: () => void): void;
  close(): void;
}

export const CHAT_DB_NAME = 'chat.db';

function createExpoDriver(db: SQLite.SQLiteDatabase): ChatDbDriver {
  return {
    getAll: (sql, params = []) => db.getAllSync(sql, params),
    getFirst: (sql, params = []) => db.getFirstSync(sql, params),
    run: (sql, params = []) => {
      db.runSync(sql, params);
    },
    exec: (sql) => db.execSync(sql),
    transaction: (fn) => db.withTransactionSync(fn),
    close: () => db.closeSync(),
  };
}

let driver: ChatDbDriver | null = null;

/**
 * Veritabanını açar, PRAGMA'ları uygular ve migration'ları çalıştırır.
 *
 * SENKRON ve React'ten bağımsız (SQLiteProvider/onInit KASTEN değil): repository
 * bir modül singleton'ı ve outbox drain loop'u React mount'tan ÖNCE DB'ye
 * ihtiyaç duyuyor. Ayrıca sohbet açılışındaki hydrate okuması senkron olmak
 * zorunda — async API bir tick sonra çözülür, ChatScreen boş bucket'la mount
 * olur ve spinner dalına düşer (ChatScreen.tsx:756-759, :816).
 *
 * WAL + synchronous=NORMAL mobilde standart: FULL'ün her commit'te fsync'i
 * yazma maliyetinin baskın kalemi ve burada dayanıklılık kazancı yok — kayıp
 * bir commit sunucudan yeniden çekilebilir.
 */
export function openChatDb(): ChatDbDriver {
  if (driver) return driver;
  const db = SQLite.openDatabaseSync(CHAT_DB_NAME);
  const next = createExpoDriver(db);
  next.exec(
    'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;',
  );
  runMigrations(next);
  driver = next;
  return driver;
}

export function getChatDb(): ChatDbDriver {
  return driver ?? openChatDb();
}

/**
 * Logout choke-point'i. Sıra önemli: kapat, sonra dosyayı sil.
 *
 * Silme başarısız olursa (dosya kilitli) içeriği BOŞALTIP vacuum'la — truncate
 * tek başına boşalan sayfaları diskte okunabilir bırakır ve buradaki veri
 * önceki kullanıcının özel mesajları.
 */
export function destroyChatDb(): void {
  const current = driver;
  driver = null;
  if (!current) {
    try {
      SQLite.deleteDatabaseSync(CHAT_DB_NAME);
    } catch {
      // Hiç açılmamış olabilir — silinecek dosya yoksa sorun değil.
    }
    return;
  }
  try {
    current.close();
    SQLite.deleteDatabaseSync(CHAT_DB_NAME);
  } catch (error) {
    console.error('chat db delete failed, wiping contents instead:', error);
    try {
      current.transaction(() => {
        current.run('DELETE FROM messages');
        current.run('DELETE FROM conversations');
        current.run('DELETE FROM outbox');
        current.run('DELETE FROM sync_state');
        current.run('DELETE FROM meta');
      });
      current.exec('VACUUM');
      current.close();
    } catch (wipeError) {
      console.error('chat db wipe failed:', wipeError);
    }
  }
}

/** Yalnız test içindir — modül singleton'ını sıfırlar. */
export function __resetChatDbForTests(): void {
  driver = null;
}
