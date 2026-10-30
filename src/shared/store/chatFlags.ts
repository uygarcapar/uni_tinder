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

/**
 * Backfill — arşivi arka planda geri dolduran tur (`chatBackfill.ts`).
 *
 * Boot'tan `BACKFILL_BOOT_DELAY_MS` sonra tek turu tetikler; tur kendi
 * içinde sayfalayıp `backfill_cursor`/`backfill_done` ilerletir. Kapatmak
 * güvenli: tur hiç BAŞLAMAZ (ileride yazılacak hiçbir satır yazılmaz) ama
 * o ana kadar diske yazılmış satırlar YERİNDE kalır — geri almak veri
 * kaybettirmez, yalnız arşivin geri kalanı ağdan sayfalanmaya devam eder.
 */
export const CHAT_BACKFILL_ENABLED = true;

/**
 * Reaksiyon/silme mutasyon kuyruğu (`pendingMutations.ts`).
 *
 * AÇIKKEN: `ChatScreen`'in `handlePickReaction`/`handleDelete`'i artık ağı
 * DOĞRUDAN çağırmıyor — optimistik dispatch'ten sonra niyet
 * `pending_mutations` tablosuna yazılır, ağ çağrısını ve KALICI ret sonrası
 * geri almayı tur (`flushPendingMutations`) üstlenir. Ağ hatasında İKİNCİ bir
 * geri alma YOK — tek sahip tur, o da yalnız `rejected` dalında.
 *
 * Kapatmak bugünkü (kuyruk ÖNCESİ) davranışa tam döner: ekran yine doğrudan
 * REST'e gider, hata ANINDA (optimistik listeyi geri dispatch ederek) geri
 * alınır, kuyruğa HİÇ satır yazılmaz.
 *
 * Bayrak İKİ yeri kapatır: çağrı noktasını (ChatScreen) VE turun kendisini —
 * `flushPendingMutations`'ın ilk satırı bu bayrağa bakıp `ran: false` ile
 * dönüyor (bkz. pendingMutations.ts). Yani kapatınca ağ tarafı tamamen durur.
 *
 * SONUCU TAM OLARAK ŞU: kapatmak veri KAYBETTİRMEZ ama o ana kadar diske
 * yazılmış satırları MAHSUR BIRAKIR. Tur draining'e hiç gelmediği için o
 * emirler ne sunucuya uygulanır ne de ekranda geri alınır (yetim budaması
 * yalnız mesajı silinmiş satırları temizler) — kullanıcı optimistik emojisini
 * görmeye devam eder, sunucu onu hiç duymaz. Bayrak haftalar sonra yeniden
 * açılırsa bu emirler BEKLENMEDİK bir anda gönderilir. Bir olay sırasında
 * acil kapatma hamlesi olarak doğru, ama kalıcı kapatma kararı bu mahsur
 * kalma hâlini (gerekirse tabloyu elle boşaltmayı) birlikte düşünmeli.
 */
export const CHAT_MUTATION_QUEUE_ENABLED = true;
