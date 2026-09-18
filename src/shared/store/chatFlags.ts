/**
 * Chat depolama bayrakları — AYRI dosyada, çünkü hem `shared/store/index.ts`
 * (reducer kurulumu) hem `features/chat/*` (okuma yolu) okuyor. store/index.ts'te
 * dursaydı chat tarafı store'u import etmek zorunda kalırdı ve store zaten
 * chatSlice + chatMirrorMiddleware'i import ediyor → döngü.
 */

/**
 * Eski MMKV/redux-persist chat cache'i.
 *
 * Faz 3'te SQLite okuma yolu devraldığı için KAPALI. Bir release boyunca
 * burada duruyor: `CHAT_SQLITE_ENABLED` bir OTA hotfix'le kapatılırsa bunu
 * açmak eski davranışa tam dönüş demek (blob hâlâ diskte — bkz.
 * features/chat/db/importLegacyCache.ts).
 */
export const CHAT_PERSIST_ENABLED = false;

/**
 * Local-first chat (SQLite) okuma yolu.
 *
 * YALNIZCA OKUMALARI kapılar — ayna (chatMirrorMiddleware) her hâlükârda
 * yazmaya devam eder. Böylece ileri geri çevirmek asla veri kaybettirmez,
 * yalnız hangi kaynağın ekrana çıktığını değiştirir.
 */
export const CHAT_SQLITE_ENABLED = true;

/**
 * Delta-sync (`GET /api/messages/changes`) — 2026-09-18'de AÇILDI, uç yayında.
 *
 * "Ben yokken ne değişti" sorusunun tek cevabı. Özellikle silmeler: silinmiş
 * mesaj `messages[]`'a hiç girmiyor, `deletions[]`'a giriyor — bu akış olmadan
 * kalıcı arşiv, sunucuda silinmiş bir mesajı süresiz tutardı.
 *
 * Geri almak güvenli: false yapmak istemciyi eski yakalama yoluna
 * (fetchConversations + sayfa-1 reconcile) döndürür ve hiçbir veri kaybı
 * yaratmaz — yalnız silme/reaction geri alma gibi "olay" bilgileri yeniden
 * görünmez olur. Watermark diskte kalır, tekrar açılınca kaldığı yerden devam
 * eder.
 */
export const CHAT_DELTA_SYNC_ENABLED = true;
