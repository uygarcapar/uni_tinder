import type { ChatDbDriver } from './chatDb';

/**
 * Şema migration'ları — PRAGMA user_version ile sürümlenir.
 *
 * Kurallar:
 *  - Yayınlanmış bir migration'ı ASLA düzenleme; yeni bir sürüm ekle.
 *  - Hepsi tek transaction içinde, ilk okumadan ÖNCE çalışır.
 *  - `PRAGMA user_version` parametrelenemez (SQLite kısıtı) — sürüm sayı
 *    literali olarak gömülür; değer bu dosyadan geldiği için enjeksiyon yok.
 */

/**
 * v1 — local-first chat'in temel şeması.
 *
 * ── Kasten OLMAYAN kolonlar ─────────────────────────────────────────────────
 * `partner_is_online` YOK: presence realtime veridir, restart'a taşınırsa
 * herkes sahte "online" görünür (bugün chatPersistTransform.ts:53-55 aynı
 * kuralı zorluyor). Aynı gerekçeyle quota/typing/presence tabloları da yok —
 * onlar Redux-only ve kasten volatil (shared/store/index.ts).
 */
const V1 = `
CREATE TABLE conversations (
  conversation_id            TEXT PRIMARY KEY,
  match_id                   TEXT,
  partner_user_id            TEXT NOT NULL,
  partner_display_name       TEXT,
  partner_profile_image_url  TEXT,
  last_message_preview       TEXT,
  last_message_at            TEXT,
  last_message_at_ms         INTEGER,
  last_message_content_type  INTEGER,
  unread_count               INTEGER NOT NULL DEFAULT 0,
  is_active                  INTEGER NOT NULL DEFAULT 1,
  is_unlimited               INTEGER,
  remaining_messages         INTEGER,
  requires_premium           INTEGER,
  restorable_until           TEXT,
  restorable_until_known     INTEGER NOT NULL DEFAULT 0,
  deactivated_by_me          INTEGER,
  sort_order                 INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id                    TEXT PRIMARY KEY,
  conversation_id       TEXT NOT NULL,
  client_message_id     TEXT,
  sender_id             TEXT,
  content               TEXT NOT NULL DEFAULT '',
  content_type          INTEGER NOT NULL DEFAULT 0,
  sent_at               TEXT NOT NULL,
  sent_at_ms            INTEGER NOT NULL,
  read_at               TEXT,
  delivered_at          TEXT,
  edited_at             TEXT,
  deleted_at            TEXT,
  deleted_for_everyone  INTEGER NOT NULL DEFAULT 0,
  media_url             TEXT,
  duration_ms           INTEGER,
  waveform_peaks        TEXT,
  reply_to_message_id   TEXT,
  reply_to_json         TEXT,
  reactions_json        TEXT,
  is_system_message     INTEGER NOT NULL DEFAULT 0,
  localization_key      TEXT,
  send_state            TEXT NOT NULL DEFAULT 'sent',
  local_uri             TEXT,
  row_version           INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_messages_conv_time ON messages (conversation_id, sent_at_ms DESC, id);
CREATE UNIQUE INDEX idx_messages_cmid ON messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE TABLE sync_state (
  conversation_id           TEXT PRIMARY KEY,
  oldest_loaded_sent_at_ms  INTEGER,
  next_cursor               TEXT,
  has_more                  INTEGER NOT NULL DEFAULT 0,
  has_hidden_history        INTEGER NOT NULL DEFAULT 0,
  last_synced_at_ms         INTEGER
);

CREATE TABLE outbox (
  seq                 INTEGER PRIMARY KEY AUTOINCREMENT,
  client_message_id   TEXT NOT NULL UNIQUE,
  conversation_id     TEXT NOT NULL,
  kind                TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  state               TEXT NOT NULL DEFAULT 'queued',
  attempts            INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms  INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  created_at_ms       INTEGER NOT NULL
);

CREATE INDEX idx_outbox_ready ON outbox (state, next_attempt_at_ms, seq);
`;

/**
 * v2 — `is_sender_deleted`.
 *
 * Sunucu bu alanı öteden beri gönderiyordu ama hiçbir yerde okunmuyordu; şema
 * da taşımıyordu. Faz 3'te okuma yolu SQLite'a döndüğü için "taşımıyor" artık
 * "kalıcı olarak kayboluyor" demek: sunucu kopyası diske yazılıyor, alan
 * düşüyor, ekrana diskten gelen satır çıkıyor.
 *
 * Hesap silinince mesaj ve sohbet yerinde kalıyor, yalnız gönderen
 * anonimleşiyor — yani bu alan insert'ten SONRA değişebilir; bu yüzden
 * messageContentEqual'a da eklendi (yoksa balon bayat kalırdı).
 */
const V2 = `ALTER TABLE messages ADD COLUMN is_sender_deleted INTEGER NOT NULL DEFAULT 0;`;

/**
 * v3 — `meta`: chat'e ait küçük, GLOBAL anahtar/değer alanı.
 *
 * İlk sakini delta-sync watermark'ı. `sync_state`'e konamaz: orası sohbet
 * başına ve watermark tek — `rowversion` veritabanı-geneli olduğu için sunucu
 * iki tablo için tek watermark döndürüyor.
 *
 * appPrefs/MMKV'ye de konamaz: watermark, arşivin ne kadarını gördüğümüzü
 * anlatıyor. Arşivle AYNI ömre sahip olmak zorunda — logout'ta DB silinip
 * watermark kalsaydı, yeni kullanıcı "her şeyi görmüşüm" sanıp baştaki
 * değişiklikleri hiç çekmezdi.
 */
const V3 = `
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

/**
 * v4 — `closed_by_me` / `closed_reason`.
 *
 * "Sohbeti kapatan biz miyiz" sorusunun cevabı sunucuda YOKTU; istemci kendi
 * unmatch'inde damgalayarak tahmin ediyordu (`deactivated_by_me`). Sunucu artık
 * söylüyor ve kanonik kaynak o.
 *
 * Eski kolon DÜŞÜRÜLMÜYOR: sunucu alanı göndermeyen bir sürümde (ya da uç
 * deploy edilmeden) tek bilgi kaynağı hâlâ o. Devir kademeli — bkz.
 * restoreWindow.resolveClosedByMe.
 */
const V4 = `
ALTER TABLE conversations ADD COLUMN closed_by_me INTEGER;
ALTER TABLE conversations ADD COLUMN closed_reason TEXT;
`;

/**
 * v5 — GÖNDERİLMEMİŞ satırların indeksi.
 *
 * İki sorgu arşivin TAMAMINI tarıyordu: `failStalePendingSends` her AÇILIŞTA
 * (okumadan önce, yani ilk kareyi geciktiren yolda) ve `readFailedSends` her
 * outbox turunda. İkisi de sohbete değil DURUMA bakıyor, yani
 * `idx_messages_conv_time` yardım edemiyor. İki yıllık bir arşivde maliyet
 * satır sayısıyla doğrusal büyüyor — oysa aranan satırlar neredeyse her zaman
 * SIFIR tane.
 *
 * ── Kısmi index + sorgudaki "gereksiz" terim ────────────────────────────────
 * Index yalnız `send_state <> 'sent'` satırlarını taşıyor (pratikte 0-birkaç
 * satır; tam index arşiv kadar yer tutardı ve her mesaj yazımında güncellenirdi).
 * Bedeli: planlayıcı kısmi indeksi ancak sorgunun WHERE'i indeksin WHERE'ini
 * İMA EDİYORSA kullanıyor ve bu ima kanıtlayıcısı basit — `send_state='pending'`
 * ifadesinin `send_state <> 'sent'`'i ima ettiğini GÖREMİYOR (3.53'te ölçüldü:
 * SCAN'de kalıyor). Bu yüzden iki sorgu da terimi AYNEN tekrarlıyor; o terim
 * mantıksal olarak fazlalık ama indeksi açan anahtar. Birini silersen sorgu
 * sessizce tam taramaya döner — ölçüm: EXPLAIN QUERY PLAN'de
 * "SEARCH ... USING INDEX idx_messages_unsent" görünmeli.
 *
 * `sent_at_ms, id` kolonları sırayı da indeksten veriyor (readFailedSends
 * ORDER BY'ı) — yoksa temp b-tree kuruluyordu.
 */
const V5 = `
CREATE INDEX idx_messages_unsent ON messages (send_state, sent_at_ms, id)
  WHERE send_state <> 'sent';
`;

/**
 * v6 — `mode`: sohbetin ait olduğu uygulama modu ("Dating" | "Friends").
 *
 * Eşleşme 2026-10-21'den beri MOD BAŞINA (backend: `UNIQUE(UserIdA, UserIdB,
 * Mode)`), yani aynı çiftin iki ayrı sohbeti olabiliyor ve liste onları moda
 * göre ayırmak zorunda.
 *
 * Kolon diskte OLMAK ZORUNDA, yalnız redux'ta değil: okuma yolu soğuk açılışta
 * SQLite'tan besleniyor (bkz. chatFlags / hydrateConversations). Taşımasaydı
 * ağ cevabı gelene kadar liste iki modun sohbetlerini karışık gösterirdi —
 * mod ayrımının en görünür olduğu yer tam da o ilk kareler.
 *
 * NULL = "sunucu söylemedi" (eski sürüm / yerel olarak açılmış satır) ve bu
 * `'Dating'` ile AYNI ŞEY DEĞİL: süzgeç NULL satırı elemiyor, yoksa alanı
 * göndermeyen bir sunucuda liste bomboş görünürdü.
 */
const V6 = `ALTER TABLE conversations ADD COLUMN mode TEXT;`;

/**
 * v7 — `send_attempts`: gönderim kuyruğunun disk muhasebesi, `outbox` düşürüldü.
 *
 * `outbox` v1'den beri şemada ama HİÇ YAZILMADI — ona dokunan tek satır
 * `DELETE FROM outbox` (temizlik yollarındaki boş süpürme). Gönderim
 * muhasebesi (deneme sayısı/backoff/permanent/quota_charged) bugüne kadar
 * outbox.ts'teki process-ömürlü bir Map'te yaşıyordu; bu sürüm onu diske
 * taşımanın deposu.
 *
 * `outbox`'u OLDUĞU GİBİ yeniden kullanmak seçenek değildi: `payload_json
 * NOT NULL` taşıyor, yani mesaj gövdesinin İKİNCİ bir kopyasını dayatırdı.
 * Gövdenin tek kaynağı `messages` satırı (client_message_id ile eşleşiyor)
 * — bu tablo o yüzden KASTEN gövdesiz, yalnız muhasebe kolonları taşıyor.
 * Aynı sebepten `conversation_id` de yok: muhasebe mesaj kimliğine (cmid)
 * bağlı, sohbete değil; sohbet gerekiyorsa `messages` üzerinden JOIN edilir.
 *
 * Düşürme `IF EXISTS`li: migration'lar tek transaction'da koşuyor ve
 * yayınlandıktan sonra DÜZELTİLEMİYOR. `outbox` herhangi bir sebeple yoksa
 * (elle müdahale edilmiş bir geliştirici DB'si, yarım kalmış bir kurtarma)
 * çıplak `DROP` her açılışta transaction'ı geri alır: `PRAGMA user_version`
 * 6'da takılır, `openChatDb` atar ve ayna kendini devre dışı bırakır — sohbet
 * local-first yolunu tamamen kaybeder. Ulaşılabilirliği neredeyse sıfır,
 * bedeli toplam.
 */
const V7 = `
DROP TABLE IF EXISTS outbox;
CREATE TABLE send_attempts (
  client_message_id   TEXT PRIMARY KEY,
  attempts            INTEGER NOT NULL DEFAULT 0,
  first_seen_at_ms    INTEGER NOT NULL,
  next_eligible_at_ms INTEGER NOT NULL DEFAULT 0,
  permanent           INTEGER NOT NULL DEFAULT 0,
  quota_charged       INTEGER NOT NULL DEFAULT 0,
  origin              TEXT,
  last_error          TEXT
);
`;

/**
 * v8 — backfill'in KENDİ cursor'u (`backfill_cursor`) ve KENDİ "tamam"
 * damgası (`backfill_done`); ekranın sayfalama kolonlarıyla (`next_cursor`,
 * `has_more`) KASTEN paylaşılmıyor.
 *
 * ── `next_cursor` neden paylaşılamaz ────────────────────────────────────────
 * O kolon EKRANIN sayfalamasına ait, backfill'inki arka planda sayfa sayfa
 * inen ayrı bir tur. `pruneExpiredMessages` dokunduğu HER sohbette
 * `next_cursor`'ı NULL'luyor (ölçüldü — bkz. chatRepository.ts'teki
 * pruneExpiredMessages: budama eski uçtan kestiği için derin cursor yerel
 * aralığın ALTINI işaret eder hâle gelir, delik üretmemek için sıfırlanır).
 * Backfill aynı kolonu kullansaydı her haftalık retention turu onun geri
 * dönüş noktasını da silerdi — backfill ilerlemişken sıfırdan başlamaya
 * zorlanırdı.
 *
 * ── `backfill_done`, `has_more`'dan neden türetilemez ───────────────────────
 * Aynı budama `has_more`'a DOKUNMUYOR — yalnız `oldest_loaded_sent_at_ms` ve
 * `next_cursor` güncelleniyor. Yani prune sonrası "cursor kayboldu, has_more
 * eski değerinde kaldı" normal bir hâl: bu ikili "yarım ama cursor'suz" ile
 * "gerçekten bitti" durumlarını AYIRT EDEMEZ — ikisinde de elde kalan tek
 * bilgi aynı.
 */
const V8 = `
ALTER TABLE sync_state ADD COLUMN backfill_cursor TEXT;
ALTER TABLE sync_state ADD COLUMN backfill_done INTEGER NOT NULL DEFAULT 0;
`;

/**
 * v9 — `pending_mutations`: tepki/silme emirlerinin disk muhasebesi.
 *
 * ── `payload_json` neden var ────────────────────────────────────────────────
 * `send_attempts` (v7) kasten gövdesiz, çünkü gövdenin tek kaynağı `messages`
 * satırı. Burada öyle değil: tepki NİYETİ (`desired`) `messages.reactions_json`'
 * dan türetilemez — ayna optimistik listeyi zaten yazdı, hangi emojinin BİZİM
 * niyetimiz olduğu ile sunucudan gelmiş olanı o JSON'dan ayırt edilemez.
 *
 * ── `permanent` kolonu neden YOK ────────────────────────────────────────────
 * Gönderimde kalıcı başarısızlık balonu "tekrar dene" hâlinde bırakıyor, yani
 * satırın yaşaması gerekiyor. Tepkide/silmede kullanıcıya sunulan tekrar yolu
 * YOK: kalıcı ret geri alma + toast demek, satır AYNI ANDA silinir. Kolon
 * olsaydı hiçbir şeyin temizlemediği bir çöp hâli üretirdi.
 *
 * ── PK neden `(message_id, kind)` ───────────────────────────────────────────
 * Ayrı bir `op_id` + bunun üzerine UNIQUE indeks, aynı kısıtın iki kopyası
 * olurdu. Birleştirme (son-yazan-kazanır) zaten PK çatışmasının kendisi.
 */
const V9 = `
CREATE TABLE pending_mutations (
  message_id          TEXT NOT NULL,
  kind                TEXT NOT NULL,
  conversation_id     TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  attempts            INTEGER NOT NULL DEFAULT 0,
  first_seen_at_ms    INTEGER NOT NULL,
  next_eligible_at_ms INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  PRIMARY KEY (message_id, kind)
);
`;

/**
 * v10 — Faz 3'ten devreden ön koşul (`backfill_failures`) ve aramanın
 * katlanmış içerik kolonu (`content_folded`). Bu dal UNRELEASED bir branch'te:
 * ikisi ayrı migration'lar DEĞİL, tek v10'un iki eklentisi.
 *
 * ── `backfill_failures` ─────────────────────────────────────────────────────
 * Bir sohbetin backfill turunda üst üste aldığı KALICI hata sayısı (429 HARİÇ
 * — o kova paylaşımlı, sohbetin kendisi bozuk demek değil). `conversations`
 * unmatch'te de SATIRI KORUYOR (bkz. chatRepository.ts), yani kalıcı şekilde
 * 4xx/5xx döndüren bir sohbet aksi hâlde her turda bir istek (slot) yakmaya
 * devam ederdi — `readBackfillTargets`'ın `last_message_at_ms DESC LIMIT 30`
 * tavanı altında bu, canlı sohbetleri turdan dışlayabilir. Eşik
 * `backfillPolicy.BACKFILL_MAX_FAILURES`; sayaç başarılı bir sayfada sıfırlanır
 * (bkz. chatRepository.clearBackfillFailures) — geçici bir arızadan kurtulan
 * sohbet rafa kalkmaz.
 *
 * ── `content_folded` ────────────────────────────────────────────────────────
 * Mesaj içeriğinin `foldTr` ile katlanmış hâli; arama BU kolonun üzerinde
 * koşuyor, böylece Türkçe kuralı (`ı`/`İ` ayrı harf) isim aramasıyla birebir
 * aynı. Üç durumlu: NULL = "hiç hesaplanmadı" (v10 öncesinden kalan arşiv,
 * `chatRepository.backfillContentFolded` tek seferlik dolduruyor), '' =
 * "hesaplandı, indekslenecek metin yok" (sesli/görsel/sistem), dolu = aranabilir
 * metin. İkisini ayırmak şart: doldurma turu NULL satırları seçiyor, metin
 * olmayana da NULL yazsaydık o satırlar her turda yeniden seçilip hiç
 * dolmazdı.
 *
 * ── FTS5 sanal tablosu neden BURADA DEĞİL ───────────────────────────────────
 * Zincirde yalnız `ALTER TABLE ADD COLUMN` var — atması imkânsız bir ifade.
 * `CREATE VIRTUAL TABLE … USING fts5` ise FTS5 derlenmemiş bir yapıda atar;
 * burada atmak demek migration transaction'ının geri alınması, `user_version`
 * ün çakılı kalması, `openChatDb`ın her açılışta atması ve aynanın kendini
 * devre dışı bırakması demek — yani sohbet local-first yolunu TAMAMEN
 * kaybeder. Bedel asimetrik: sanal tablo zincir DIŞINDA (chatDb.ts'teki
 * kapasite kapısının ardında) yaratılamazsa kaybedilen tek şey aramanın hızı
 * (Task 3 `content_folded` üzerinde LIKE'a düşüyor — doğru, yalnız yavaş);
 * zincirin içinde yaratılamazsa kaybedilen şey sohbetin tamamı. İhtimali
 * düşük, bedeli toplam — V7'deki çıplak `DROP TABLE` dersinin aynısı.
 *
 * ── `idx_messages_unfolded` — KISMİ ve kendini boşaltan ─────────────────────
 * `backfillContentFolded`ın seçimi (`content_folded IS NULL`, `sent_at_ms`
 * sırayla) başka hiçbir indeksle karşılanamıyor: `idx_messages_conv_time`
 * SOHBET İÇİ bir sıralama (`conversation_id` öncü kolon), global sıraya
 * hizmet edemez. Doldurma turu döngüyle çağrıldığı için indekssiz hâl her
 * çağrıda tam tarama + sıralama, yani O(n²/limit) demekti.
 *
 * Kısmi (`WHERE content_folded IS NULL`) olması bir optimizasyon değil
 * tasarımın kendisi: indeks tam olarak "yapılacak iş"i tutuyor, doldurma
 * ilerledikçe satırları düşüyor ve tur bitince diskte boş bir kabuk kalıyor.
 * Tam indeks olsaydı arşivin tamamı kadar yer kaplayıp hiç küçülmezdi.
 */
const V10 = `
ALTER TABLE sync_state ADD COLUMN backfill_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN content_folded TEXT;
CREATE INDEX idx_messages_unfolded ON messages (sent_at_ms DESC)
  WHERE content_folded IS NULL;
`;

/**
 * v11 — `media_cached_at_ms` / `media_size_bytes`: GELEN medyanın yerel kopya
 * önbelleği.
 *
 * `local_uri` (v1) bugüne kadar YALNIZ kendi gönderdiğimiz sesin yerel
 * dosyasını gösteriyordu; bu sürümle anlamı genişliyor — "bu mesajın
 * medyasının yerel kopyası", iki kaynaktan dolabiliyor (kendi kaydımız ya da
 * indirilmiş kopya). İKİNCİ bir yol kolonu AÇILMADI: aynı kolon, iki yazıcı,
 * iki format bu dosyanın tarihçesinde bir kez yaşandı. Ayrım `local_uri`de
 * değil, bu iki kolonun VARLIĞINDA: `media_cached_at_ms` dolu = "bu yerel
 * dosya tahliye edilebilir bir önbellek kopyası"; kendi kaydımız bu damgayı
 * hiç almaz, bu yüzden LRU tahliyesi (Task 2) onu seçemez — o dosya, yükleme
 * tamamlanana kadar TEK kopya.
 *
 * `media_size_bytes` AYRI kolon, `stat`ten türetilmiyor: tavan BAYT cinsinden
 * ve her tahliye turunda diskteki her dosyayı tek tek `stat`lamak senkron
 * açılış yolunu yavaşlatırdı. İndirme anında yazılıyor, bu yüzden diskten
 * sapması mümkün değil.
 */
const V11 = `
ALTER TABLE messages ADD COLUMN media_cached_at_ms INTEGER;
ALTER TABLE messages ADD COLUMN media_size_bytes INTEGER;
`;

export const MIGRATIONS: { version: number; up: (db: ChatDbDriver) => void }[] = [
  { version: 1, up: (db) => db.exec(V1) },
  { version: 2, up: (db) => db.exec(V2) },
  { version: 3, up: (db) => db.exec(V3) },
  { version: 4, up: (db) => db.exec(V4) },
  { version: 5, up: (db) => db.exec(V5) },
  { version: 6, up: (db) => db.exec(V6) },
  { version: 7, up: (db) => db.exec(V7) },
  { version: 8, up: (db) => db.exec(V8) },
  { version: 9, up: (db) => db.exec(V9) },
  { version: 10, up: (db) => db.exec(V10) },
  { version: 11, up: (db) => db.exec(V11) },
];

export const CHAT_DB_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function runMigrations(db: ChatDbDriver): void {
  const row = db.getFirst<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= CHAT_DB_VERSION) return;

  db.transaction(() => {
    for (const migration of MIGRATIONS) {
      if (migration.version <= current) continue;
      migration.up(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
  });
}
