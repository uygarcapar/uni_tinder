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

export const MIGRATIONS: { version: number; up: (db: ChatDbDriver) => void }[] = [
  { version: 1, up: (db) => db.exec(V1) },
  { version: 2, up: (db) => db.exec(V2) },
  { version: 3, up: (db) => db.exec(V3) },
  { version: 4, up: (db) => db.exec(V4) },
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
