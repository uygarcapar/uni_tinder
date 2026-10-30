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
let ftsAvailable = false;

/**
 * Aramanın FTS5 indeksi — şema zincirinin DIŞINDA, kapasite kapısının ardında.
 *
 * Bu, "SQL yalnız chatRepository'de" kuralının TEK istisnası: ifadenin kendisi
 * kapasite probe'uyla ayrılmaz, ikisini iki dosyaya bölmek kapının açık
 * unutulmasına davetiye olurdu.
 *
 * ── Neden migration zincirinde değil ────────────────────────────────────────
 * expo-sqlite bugün FTS5'i her iki platformda da derliyor (podspec/gradle/spm
 * üçü de `-DSQLITE_ENABLE_FTS5=1`) ve projede kapatma bayrağı yok. Ama bir gün
 * kapatılırsa bu ifade ATAR; zincirin içinde olsaydı atması migration
 * transaction'ını geri alır, `openChatDb` her açılışta atar ve ayna kendini
 * devre dışı bırakırdı — sohbet local-first yolunu TAMAMEN kaybeder. Burada
 * atması ise yalnız aramayı `content_folded` üzerinde LIKE'a düşürür: doğru,
 * yalnız yavaş. İhtimal aynı, bedeller arasında dağlar var; bu yüzden ifade
 * sürümsüz, idempotent (`IF NOT EXISTS`) ve try/catch içinde.
 *
 * `content_folded` burada da katlanmış metni tutuyor; GÖSTERİLECEK içerik
 * indekste DEĞİL — arama sonucu `messages` satırına join'lenip orijinal
 * `content` okunuyor (Task 3'ün `MessageSearchHit`i). İndekste ikinci bir kopya
 * tutmak, aynı metni iki yerde tazeleme borcu demekti.
 *
 * ── Satırın anahtarı `rowid`, `message_id` DEĞİL ────────────────────────────
 * ⚠️🔴 `message_id` UNINDEXED: üzerinde indeks YOK ve fts5'te yaratılamaz da.
 * `WHERE message_id = ?` bu yüzden TÜM indeksi tarıyor (EXPLAIN: "SCAN
 * messages_fts VIRTUAL TABLE INDEX 0") — yani mesaj başına O(arşiv), bir
 * geçmiş sayfası boyunca kuadratik. Ölçüldü (better-sqlite3, 20k satırlık
 * indeks, 200 mesajlık sayfa tek transaction'da): message_id anahtarıyla
 * 249 ms, rowid anahtarıyla 0.6 ms. Backfill sayfaları JS thread'inde senkron
 * yazıldığı için bu doğrudan donmuş arayüz demek.
 *
 * O yüzden HER yazma/silme `messages.rowid` üzerinden gidiyor (`messages`
 * rowid'li bir tablo — `id TEXT PRIMARY KEY`, WITHOUT ROWID değil).
 * `message_id` kolonu yalnız ÇAPA: indeks satırının hangi mesaja ait olduğunu
 * doğrulanabilir kılıyor (bkz. chatRepository.pruneOrphanSearchIndex) ve
 * ayıklamada okunabilir tutuyor. ARAMA/SİLME ANAHTARI OLARAK KULLANMA.
 *
 * ⚠️ Bu, `VACUUM`a bir bağımlılık doğuruyor: VACUUM rowid'leri yeniden
 * numaralandırabilir ve indeksin çapaları kayar. Bugün tek VACUUM aşağıdaki
 * wipe dalında ve orada ZARARSIZ — iki tablo da AYNI transaction'da
 * boşaltıldıktan sonra çalışıyor, ortada kayacak satır kalmıyor. Başka bir
 * yere VACUUM eklenecekse arkasından indeks yeniden kurulmalı
 * (`UPDATE messages SET content_folded = NULL` + boot'taki doldurma turu).
 */
const CREATE_MESSAGES_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_folded, message_id UNINDEXED, tokenize='unicode61'
);`;

function probeFts(db: ChatDbDriver): boolean {
  try {
    const row = db.getFirst<{ ok: number }>(
      "SELECT sqlite_compileoption_used('ENABLE_FTS5') AS ok",
    );
    if (!row?.ok) return false;
    db.exec(CREATE_MESSAGES_FTS);
    return true;
  } catch (error) {
    // Probe "var" dediği hâlde yaratım düşerse (ör. tablo bozuk) arama yine
    // LIKE'a düşsün; açılışı buradan ASLA patlatma.
    console.error('messages_fts unavailable, search falls back to LIKE:', error);
    return false;
  }
}

/**
 * FTS indeksi bu cihazda kullanılabilir mi. `openChatDb` içinde BİR kez
 * ölçülüyor — yazma kapısı ve arama sorgusu aynı cevabı kullanmak zorunda,
 * yoksa indekse yazılmamış satırlar FTS yoluyla aranır ve sessizce "sonuç yok"
 * çıkar.
 */
export function isFtsAvailable(): boolean {
  return ftsAvailable;
}

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
  ftsAvailable = probeFts(next);
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
  const hadFts = ftsAvailable;
  driver = null;
  ftsAvailable = false;
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
        // Arama indeksi katlanmış da olsa ÖNCEKİ kullanıcının mesaj metnini
        // taşıyor; `messages` ile aynı anda gitmek zorunda.
        if (hadFts) current.run('DELETE FROM messages_fts');
        current.run('DELETE FROM conversations');
        current.run('DELETE FROM send_attempts');
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
  ftsAvailable = false;
}
