# Chat delta-sync — mutabakat notu (rev. 3)

**Tarih:** 2026-09-18
**Durum:** backend beş maddeyi de tamamladı (2021/2030 yeşil, migration üretiliyor).
Bu sürüm dondurulmuş sözleşmeyi ve kalan tek soruyu içeriyor.

---

## DONDURULMUŞ SÖZLEŞME — `/changes`

**`reactions[]` ve `receipts[]` YOK — ve bu doğru karar.** Reaction değişimi ve
okundu damgası mesaj satırına dokunduğu için mesaj zaten `messages[]`'a giriyor;
ayrı dizi aynı veriyi iki kez göndermek olurdu.

**İstemcide ek iş çıkarmıyor.** Yerel model zaten mesaj-bazlı: `read_at`,
`delivered_at` ve `reactions_json` `messages` tablosunda **mesaj başına** kolon.
Sohbet-bazlı `applyReadReceipt` yalnızca SignalR'ın `MessagesRead` event'i
sohbet-bazlı olduğu için var. Delta'dan gelen mesaj-bazlı receipt doğrudan
satıra yazılıyor — dönüştürme gerekmiyor, sohbet-bazlı şeklin geri eklenmesine
**gerek yok**.

Sonuç: `messages[]`'ı uygulayan tek kod yolu reaction + receipt + edit + soft
delete'in hepsini kapsıyor.

### Kalan tek soru

**`deletions[]` hâlâ var mı?** Soft delete mesaj satırına dokunduğuna göre
(`DeletedAt` → `SyncSeq` artıyor) mesaj `messages[]`'a `deletedAt` dolu olarak
zaten giriyor — yani reactions/receipts ile birebir aynı mantıkla gereksizleşmiş
olabilir. Yalnız o ikisi sayıldığı için emin olamadık.

Varsa: `messages[]`'ın taşımadığı ne taşıyor? Yoksa: istemcide handler
yazılmayacak.

### Sequencing — `/api/messages/deletions`

İstemci bu ucu **ayrıca bağlamayacak**. İki watermark şeması taşımanın anlamı
yok; doğrudan `/changes`'e geçiliyor. Madde 2 bağımsız kıymetliydi ve deploy'u
hızlandırdı ama istemcide tek tüketici `/changes` olacak — sizin "kaldırılmalı
ya da rowversion'a taşınmalı" notunuz bizim açımızdan "kaldırılabilir".

### Deploy penceresi — istemci tolere ediyor

`Messages` tablosunun boyutunu ölçemiyoruz (prod DB erişimi yok); o sizde.
Söyleyebileceğimiz: **migration uzun sürer ya da geri alınırsa istemcide görünür
bir bozulma olmuyor.** `/changes` henüz hiçbir yerden çağrılmıyor, yeni alanların
hiçbiri zorunlu değil, ve yazım hatalarını ayna yutup mevcut API yoluna devam
ediyor. Düşük trafikli saate almakta serbestsiniz.

### İstemcide hazır olan

`meta` tablosu (şema v3) + `getSyncWatermark()` / `setSyncWatermark()`.
Watermark **opak** saklanıyor — istemci yorumlamıyor — ve ömrü arşivle aynı:
logout'ta DB ile birlikte siliniyor. Kalsaydı yeni kullanıcı "her şeyi
görmüşüm" sanıp aradaki değişiklikleri hiç çekmezdi (testi var).

> **Bir düzeltme:** rev.2'de "`pullChanges(watermark)` dikişi hazır" yazmıştık.
> Doğrusu: repository o dikişi **alabilecek** şekilde tasarlanmıştı (tüm
> yazımlar idempotent ve tek noktadan geçiyor), ama çağrılacak fonksiyon yoktu.
> Watermark katmanı artık gerçekten var; `pullChanges` yukarıdaki soru
> cevaplanınca tek parçada yazılacak.

---

**Aciliyet:** engelleyici DEĞİL. İstemci mevcut API ile çalışıyor ve ship edilebilir.

> **rev.1'e göre ne değişti:** üç iddiam yanlıştı ve düzeltildi — (B) cursor
> TTL'i endişesi, `removedConversations` premisi, ve öncelik sırası. Ayrıntılar
> ilgili başlıklarda. Ayrıca backend bir cursor tie-break hatası buldu; o artık
> listenin başında.

---

## 0. Kapanan maddeler

**A. `pageSize` tavanı = 100.** 50 sorunsuz, istemci 50'ye geçiyor.

⚠️ Alınan not: **aşan değer sessizce kırpılıyor, 400 dönmüyor.** İstemci
"istediğim kadar geldi mi" diye saymıyor — `hasMore`/`nextCursor` ile
ilerliyor, dolayısıyla bizde etkisi yok. Yine de sözleşmeye yazıldı.

**B. Cursor zaten keyset encode — endişem GEÇERSİZDİ.**

rev.1'de "kalıcı sakladığımız cursor bayatlar, UT-6741 sıklaşır" diye bir
madde vardı. Yanlış: cursor `base64("{SentAt:o}|{Id}")`, sunucuda oturum
durumu yok, TTL yok. UT-6741 yalnız **bozuk** cursor'da atılıyor (decode/parse
hatası), **eski** cursor'da değil. Üç ay saklanan cursor bir gün saklananla
aynı çalışıyor; referans verdiği mesaj retention ile silinmiş olsa bile
çalışıyor (satır lookup'ı değil, keyset karşılaştırması).

İstemci tarafındaki sonuç: planlanan "cursor-rebuild walk" telafi mekanizması
**iptal edildi** — var olmayan bir soruna yazılmış ölü karmaşıklıktı.

**Konvansiyonlar doğrulandı:** enum'lar PascalCase string
(`JsonStringEnumConverter` global), tüm `DateTime`'lar `Kind=Utc` →
`Z` sonekli. İkisi de varsaydığımız gibi.

**UT kodu:** `UT-6744` boşta ve `INVALID_WATERMARK` için uygun.
`ChatErrorStatusMap.For()` listede olmayan kodu 400'e düşürdüğü için map'e
dokunmak gerekmiyor — istemci kararını HTTP status'ten değil UT kodundan
veriyor.

---

## 1. Cursor tie-break hatası — en öncelikli

Backend'in tespiti; **kabul ediyoruz ve listenin başına alıyoruz.**

Cursor predikatı `string.Compare(m.Id.ToString(), …)` (nvarchar collation,
soldan sağa) ile sıralama `ThenByDescending(m => m.Id)` (SQL Server
`uniqueidentifier` bayt-grubu sırası: 10-15 → 8-9 → 6-7 → 4-5 → 0-3) aynı
fikirde değil. Aynı `SentAt`'e sahip iki mesajda sayfa sınırında bir mesaj
kalıcı olarak atlanabiliyor.

**Neden bizim için kritik:** yerel arşiv "bitişik aralık" invariant'ı ile
korunuyor — `oldest_loaded_sent_at_ms`'ten en yeniye kadar **delik yok**
varsayımı. Sunucu sayfası bir satır atlarsa o delik invariant'ın içinde
görünmez hâle geliyor ve istemci tarafında kapatılabilecek bir yolu yok:
tek satırlık boşluğu tespit edecek bir sinyal yok. Eskiden görünmezdi çünkü
cache her açılışta sıfırdan kuruluyordu; artık kalıcı.

Sıklığın düşük olduğu (aynı `datetime2(7)` damgası) doğru; sistem mesajlarında
gerçekçi olduğu da doğru.

İstemci tarafında aynı sınıf hata **yok**: yerel sayfalama açık
`(sent_at_ms, id)` keyset'i kullanıyor ve aynı-milisaniye senaryosunun testi
var (`chatRepository.contiguity.test.ts` → "aynı milisaniyedeki mesajlarda id
tiebreaker'ı satır atlatmaz").

---

## 2. Öncelik sırası — DÜZELTİLDİ

rev.1'deki sıralama şemayı bilmeden yazılmıştı ve yanlıştı. Backend'in
düzeltmesi kabul:

| # | İş | Maliyet | Not |
|---|---|---|---|
| 1 | **Cursor tie-break düzeltmesi** | küçük | `/changes`'ten bağımsız, kalıcı arşivi bugün tehdit ediyor |
| 2 | **`deletions`** | **şema değişikliği YOK** | Silme zaten soft (`DeletedAt` + `DeletedForEveryone`), `(ConversationId, DeletedAt)` index'i mevcut. Bu bir migration değil, bir query. |
| 3 | **`removedConversations` → sadece `reason`** | küçük | Aşağıya bakınız — premisim yanlıştı |
| 4 | **`Message.ReactionsUpdatedAt`** | **tek gerçek migration** | Reaction kaldırma hard delete ve hiçbir timestamp kıpırdamıyor → mevcut state'ten kurtarılamıyor |
| 5 | **`rowversion` + `/changes`** | asıl iş | 2-4'ün üstüne oturuyor |

### `removedConversations` — premisim yanlıştı

rev.1'de "unmatch edilen sohbet listeden düşüyor ama mesajlar cihazda kalıyor"
yazmıştım. `GetUserConversationsAsync` `IsActive` filtresi uygulamıyor; sohbet
`IsActive=false` ile listede kalmaya devam ediyor.

İstemci tarafı kontrol edildi: **yokluğu silme saymıyoruz.** Sohbet listesi
yazımı yalnız insert/update yapıyor, listede olmayanı silen bir yol yok
(tek `DELETE FROM conversations` logout yolunda). `isActive` de doğru
kullanılıyor — kapanmış sohbetler "Kapalı" sekmesinde görünüyor. Yani bu
madde bir istemci hatası değildi ve backend'de de yapılacak bir şey yok.

Geriye kalan tek istek: **`reason` ayrımı** (Unmatch / Blocked).
`Match.Status` + `Conversation.UnmatchedByUserId`'den türetilebiliyor;
mevcut `ConversationListItemDto`'ya iki alan eklenmesi yeterli, `/changes`'i
beklemesi gerekmiyor.

### `AccountDeleted` — ÇIKARILDI

Backend'de karşılığı yok: hesap silinince sohbet ve mesajlar yerinde kalıyor,
yalnız gönderen anonimleşiyor ve bunu `MessageDto.IsSenderDeleted` zaten
taşıyor.

İstemci tarafında bir eksik ortaya çıktı: **`isSenderDeleted` hiç
okunmuyor.** Tipte de yok. Bu bizde açılan bir iş (gönderen adı /
silinmiş-hesap rozeti); backend'den bir şey gerekmiyor.

---

## 3. Watermark — gerekçem doğru yöne bakıyordu ama yetersizdi

Backend'in itirazı kabul ve teşekkürler; bu, rev.1'in en zayıf yeriydi.

rev.1'de "opak token sınırı sunucuya seçtirir, yarış kapanır" demiştim.
Eksik olan şart: **opak token ancak encode ettiği sütun commit sırasıyla
atanıyorsa işe yarar.** Bu şemada öyle değil — `SentAt`/`EditedAt`/
`DeletedAt`/`ReadAt` uygulama kodunda `DateTime.UtcNow` ile,
`SaveChangesAsync`'ten **önce** atanıyor. Satır `T` damgasını alıp `T+40ms`'de
commit oluyor; arada gelen bir delta çağrısı onu kaçırıyor ve bir daha hiç
göremiyor. base64'e sarmak bunu değiştirmiyor — haklısınız.

**`rowversion` + `MIN_ACTIVE_ROWVERSION()` önerisini kabul ediyoruz.**
SQL Server'ın yazma anında atadığı, veritabanı genelinde monoton bir sütun;
watermark olarak `MIN_ACTIVE_ROWVERSION() - 1` dönmek yarışı inşaat gereği
kapatıyor. Sargability argümanı da doğru: `SentAt >= X OR EditedAt >= X OR
DeletedAt >= X` üç sütun üzerinde OR ile index kullanamaz.

`[Timestamp]` tuzağı da not alındı — `Profile.RowVersion` pattern'ini
kopyalamak `Messages` üzerinde `DbUpdateConcurrencyException` üretirdi;
`HasColumnType("rowversion")` + `ValueGeneratedOnAddOrUpdate()` +
`IsConcurrencyToken(false)` gerekiyor.

`CHANGETABLE` alternatifi için de aynı sonuca varıyoruz: hard delete
tombstone'ları cazip ama DB seviyesinde feature flag + retention ayarı +
operasyonel parça demek; `rowversion` + `ReactionsUpdatedAt` daha iyi denge.

**Overlap `>=`:** onay alındı. Ek not kabul — `messageId` dedupe'u mesajlar
için; `receipts`/`reactions` last-writer-wins ama tam güncel set gönderildiği
için onlar da idempotent.

---

## 4. Sizin sorunuz: istemci retention'ı

> *"İstemci arşivi aynı 2 yıllık politikayı kendi uyguluyor mu, yoksa süresiz
> mi saklıyor?"*

**Şu anki hâli: süresiz. Bu bir boşluk ve düzeltiyoruz — teşekkürler.**

`MessageRetentionJob` 2 yılda hard delete yapıyor ve hiç iz bırakmıyor; yani
istemci, sunucunun hukuken imha ettiği mesajları cihazda tutmaya devam
ederdi. `/changes` bunu çözmüyor (tombstone yok).

**Cevabınız alındı: 2 yıl `const`, sabit kalıyor.** Sunucuda sabit kalması
konusunda hemfikiriz — bu bir tuning knob değil, KVKK politika sayısı.
`/changes` geldiğinde `retentionWindowDays` olarak yanıta koyma öneriniz
kabul; o güne kadar istemcide sabit duruyor ve değişirse **koordineli sürüm**
olarak ele alıyoruz, sessiz config flip'i olarak değil.

`version-check`'i taşıyıcı olarak kullanmama gerekçeniz de kabul: kimlik
doğrulamasız + fail-open bir kanaldan, yerel veri SİLEN bir politika değerinin
gelmesi doğru olmazdı.

### İki düzeltmeniz — ikisi de haklıydı, ikisi de uygulandı

rev.2'de "sunucu penceresinin dışına düşen satırlar yerel arşivden de
siliniyor" diye düz bir yaş penceresi tarif etmiştim. İkisi de salınım
üretirdi:

**1. System mesajları muaf.** `.Where(m => m.SentAt < cutoff && !m.IsSystemMessage)`
— düz pencerede sunucunun HÂLÂ servis ettiği `MatchCreated` / `Rematched`
satırlarını yerelde silerdik; derin scroll-back veya tam-senkron onları geri
getirir, bir sonraki budama yine silerdi.

Yerel predikat artık birebir aynalıyor: `sent_at_ms < cutoff AND is_system_message = 0`.

Buna bağlı bir incelik daha çıktı: muaf system mesajları cutoff'un çok altında
hayatta kaldığı için, bitişiklik tabanını `MIN(sent_at_ms)` ile kurmak
**delikli** bir aralık üzerinde "bitişik" iddia etmek olurdu. Taban artık
kesintisiz bölgenin başı (`MIN(sent_at_ms) WHERE sent_at_ms >= cutoff`);
hayatta kalan eski system mesajları listede duruyor ama bitişiklik
garantisinin dışındalar.

**2. Sınır kesin değil.** Job haftada bir çalışıyor (Pazartesi 02:00 UTC) ve
run başına 1M ile sınırlı; gerçek silme nominal çizginin en az bir hafta
arkasından geliyor. Tam 730'da budamak aynı salınımı üretirdi.

Yerel pencereye **30 günlük pay** eklendi (`730 + 30`). Payı uzun tutmak
güvenli yön — sunucunun kendi gecikmesini aynalıyoruz; kısa tutmak salınım
üretiyor.

Testlerle kilitlendi: "NOMİNAL sınırı yeni geçenlere dokunmaz", "SYSTEM
mesajlarını silmez", "hayatta kalan SYSTEM mesajı bitişik tabanı aşağı
çekmez".

### Bilinen boşluk: `OrphanConversationCleanupJob`

180 gün gerçek mesaj almamış sohbetlerin hard delete'i iz bırakmıyor; kalıcı
arşivde boş kabuklar asılı kalıyor. Etkisi düşük (o sohbetlerde system mesajı
dışında bir şey yok) ve `/changes` bunu da çözmüyor. **Ayrı iş olarak not
düşüldü**, bu turda kapsam dışı.

---

## 5. Özet — kimde ne var

**Backend:**
1. Cursor tie-break düzeltmesi
2. `deletions` ucu (şema değişikliği yok)
3. `ConversationListItemDto`'ya `reason` (Unmatch/Blocked)
4. `Message.ReactionsUpdatedAt` migration'ı
5. `rowversion` + `GET /api/messages/changes` (+ `UT-6744`), `retentionWindowDays` yanıta
6. ~~2 yıllık retention sabit mi?~~ ✔ kapandı — sabit kalıyor

**İstemci:**
1. Yerel retention ✔ — system muafiyeti + 30 günlük pay ile, sunucu predikatını birebir aynalıyor
2. "Cursor-rebuild walk" iptal ✔
3. `pageSize` 50'ye çıkarma
4. `isSenderDeleted` okuma (tipte ve şemada yok)
5. `reason` geldiğinde "Kapalı" sekmesinde ayrım
6. `pullChanges(watermark)` dikişi — `/changes` gelince takılacak yer hazır

**Açık kalan ortak boşluk:** `OrphanConversationCleanupJob` (180 gün, izsiz) —
ayrı iş.

---

## 6. Madde 1'e (cursor tie-break) başlayın

Evet, lütfen. Kendi içinde kapalı, `/changes`'ten bağımsız ve bugün veri
kaybettiriyor — kalıcı arşivde o delik bir daha kapanmıyor.

Test notunuz kritik: hata yalnız SQL Server'da var çünkü `TestDbFactory`
SQLite kullanıyor ve SQLite `Guid`'i TEXT olarak saklıyor, yani iki ordering
orada uyuşuyor. Testin ya prod provider'ında koşması ya da ordering'i
sağlayıcıdan bağımsız kuracak şekilde yazılması gerekiyor — aksi hâlde yeşil
görünüp hatayı geçirir.

İstemci tarafında bekleyen bir bağımlılık yok; düzeltme geldiğinde bizde bir
değişiklik gerekmiyor (yerel sayfalama zaten açık `(sent_at_ms, id)` keyset'i
kullanıyor).
