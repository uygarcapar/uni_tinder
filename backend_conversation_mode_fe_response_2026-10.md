# Sohbetlerin mod ayrımı — istemci yanıtı (soru kapandı)

**Tarih:** 2026-10-21
**Durum:** istemci tarafı **bitti** (rehberdeki 5 maddenin hepsi karşılandı).
Bir maddeyi **önerilenden farklı** yoldan çözdük — gerekçe aşağıda.

> **Soru CEVAPLANDI (aynı gün): evet, delta satırları `mode` taşıyor.**
> `/messages/changes` → `ChangesFeedDto.Conversations` liste ucuyla AYNI DTO
> (`List<ConversationListItemDto>`) ve delta `GetUserConversationsAsync`
> çıktısını değişen id'lere göre süzerek dolduruyor — yani alan o yoldan da
> geliyor, **ek iş yok** ve §Soru'da anlattığımız "modsuz satır" penceresi hiç
> açılmıyor. Sözleşme testle sabitlendi (`Changes_ConversationRows_CarryMode`,
> SQL Server entegrasyon süiti); delta'ya daha hafif bir projeksiyon konulursa
> test patlıyor.
>
> Yedek planımız ("modsuz satır görünce `/conversations` tazele") **iptal** —
> yazılmadı, gerek de yok.
>
> İstemcideki iki tolerans AYNEN KALIYOR, ikisi de artık yalnız ESKİ veri için:
> `COALESCE` ile modu koruyan yazım ve "modu olmayan satırı eleme" süzgeç
> kuralı. Tek kaynakları kaldı: alanı taşımayan bir `MatchNotification`'dan
> yerel olarak açılmış satır ve v6 öncesinden kalan disk satırları. Zararsız,
> ve ilk `/conversations`/delta turunda kendiliğinden doluyorlar.

---

## Yapılanlar

| Rehber maddesi | İstemcide |
|---|---|
| 1. Listeyi seçili modla çek, mod değişince boşalt | **Farklı yoldan:** liste modsuz çekiliyor, süzme istemcide (§Sapma) |
| 2. Rozeti `?mode=` ile çek | `GET /unread-count?mode=` bağlandı. Rozetin ASIL kaynağı satırlar (mod süzgeçli selector); bu sayı satır HENÜZ YOKKEN (soğuk açılış) devreye giren yedek — o yüzden o da mod kapsamlı |
| 3. Liste anahtarı `conversationId` olmalı | Zaten öyleydi (`keyExtractor={(c) => c.conversationId}`) — aynı partnerin iki satırı çakışmıyor |
| 4. "Eşleşmeyi kaldır" metni | **Kontrol edildi, değişiklik gerekmedi:** metinler hiçbir zaman "tüm bağlantın kopar" demiyordu, kapsamı sohbet: TR "Sohbet kapanır, mesajların silinmez. Bir süre sonra tekrar eşleşebilirsiniz." / EN "The chat closes but your messages are kept…". Engelleme metni de doğru kalıyor ("bir daha eşleşmezsiniz") çünkü engel iki modu da bitiriyor |
| 5. Mod rozeti (opsiyonel) | Satır başına rozet ÇİZİLMİYOR — liste zaten tek modun satırlarını gösteriyor, ikinci bir işaret gürültü olurdu. Veri (`mode`) diskte duruyor, istenirse tek satır |

Ek olarak: sohbet satırı artık SQLite aynasında da mod taşıyor (şema v6,
`conversations.mode`) ve `MatchNotification.mode` yeni doğan satıra yazılıyor —
yani eşleşme anında açılan sohbet daha ilk karede doğru sekmede duruyor.

## Sapma — listeyi `?mode=` ile ÇEKMİYORUZ, istemcide süzüyoruz

Öneri "listeyi `?mode=` ile çek, mod değişince boşaltıp yeniden kur"du. Bizde
sohbet okuma yolu **local-first**: liste soğuk açılışta SQLite aynasından
geliyor, ağ cevabı onun üstüne biniyor. Üç sebep:

1. **Delta ucu mod süzgeci taşımıyor** (sizin de yazdığınız gibi, bilinçli).
   Yani ayna her hâlde tüm modların satırlarını alıyor; listeyi moda göre
   çekmek **ikinci bir mekanizma** eklemek olurdu — biri süzgeçli (ağ), biri
   süzgeçsiz (delta).
2. **Liste sayfalanmıyor**, yani tam liste zaten elimizde; süzmek saf bir
   `filter`. Mod geçişi böylece **ağa hiç çıkmıyor** ve boş liste karesi yok.
3. `?mode=` ile çekerken gelen cevap bizde listeyi REPLACE ediyor (local-wins
   kuralları o cevabın üstünde çalışıyor); mod başına çekmek o yolu mod başına
   iki ayrı duruma bölerdi.

Kural, satırın kendi `mode` alanı: `!row.mode || row.mode === seçiliMod`.
**Modu olmayan satır elenmiyor** — alanı göndermeyen bir sürümde ya da yerel
olarak (mod taşımayan bir `MatchNotification`'dan) açılmış satırda elemek,
kullanıcının sohbetlerini kaybettirirdi. Sekme rozeti de AYNI kuralı uyguluyor;
ikisi ayrışsa rozet listede olmayan bir mesajı sayardı.

`?mode=` parametresini kullanmıyor olmamız sizin tarafta bir iş değişikliği
gerektirmiyor — parametresiz çağrının tüm modları döndürmesi (geri uyum kararı)
bizim için tam da doğru davranış.

## Soru: delta satırları `mode` taşıyor mu? → **CEVAP: evet** (yukarıdaki nota bak)

> Aşağısı sorunun orijinal hâli — dondurulmuş.

`/messages/changes` yanıtındaki `conversations[]` satırları aynı diske aynı
yoldan yazılıyor (`upsertConversations`), yani alan oradan da gelirse hiçbir ek
iş yok. Taşımıyorsa şu pencere açılıyor:

- uygulama arka planda, yeni bir eşleşme/mesaj delta turunda iniyor,
- satır **modsuz** yazılıyor → o sohbet iki sekmede de görünüyor,
- bir sonraki `/conversations` cevabına kadar böyle kalıyor.

Yazım tarafı hazır: mod **COALESCE** ile korunuyor, yani alanı taşımayan bir
delta satırı eldeki modu silmiyor — ama hiç yazılmamış satır için elimizde
dolduracak bir değer de olmuyor.

İsteğimiz: delta'nın sohbet satırları da `mode` taşısın (liste DTO'sundaki
alanın aynısı). Eklenmesi zorsa alternatifimiz, modsuz bir delta satırı görünce
`/conversations`ı tazelemek — yapabiliriz ama arka plandan dönüşte fazladan bir
istek demek, o yüzden önce soruyoruz.

## Migration'ın görünür etkisi (bilgi, talep değil)

`ModeFlags = 3` olup ikiye bölünen çiftlerde Friends satırının **boş sohbetle**
açılması istemcide de aynen öyle görünüyor: Arkadaş sekmesinde o kişiyle mesajsız
bir satır. Ürün kararı olarak kabul ediyoruz; istemcide "boş sohbet" satırı
zaten desteklenen bir durum (yeni eşleşmenin ilk hâli).

## Mod-körü kalanlar listesiyle hizalıyız

`block`, hesap silme/ihracat, günlük swipe kotası, global metrikler ve akıştan
doğan eşleşmenin Dating olması — dördü de istemcide aynı şekilde duruyor. Kota
göstergesinde mod başına ayrışma beklemiyoruz; akış bir flört yüzeyi olarak
kalıyor (akış mod-duyarlı olacaksa ayrı iş olarak konuşuruz).
