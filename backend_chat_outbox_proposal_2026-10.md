# Gönderim kalıcılığı (outbox) — backend talebi

**Tarih:** 2026-10-06
**Durum: CEVAPLANDI (aynı gün).** Talep A ve Talep B **zaten canlıda**; backend'de
değişiklik gerekmedi. Sözleşme backend tarafında testlerle kilitli
(`ChatServiceSendIdempotencyTests.cs`).

## Sonuç — istemcide ne yapıldı

| Cevap | İstemci değişikliği |
|---|---|
| `(SenderId, ClientMessageId)` filtreli UNIQUE index; ikinci istek var olan mesajı döndürüyor, kota bir kez düşüyor, fanout bir kez | `isEligible`'daki **`origin === "ackTimeout"` kapısı kaldırıldı** — ack'i görülmemiş gönderim artık sessizce de denenebiliyor. Kuyruğun kalıcı olmasının kilidi buydu. |
| Rate limit: dakikada 30 (HTTP ve hub ayrı) | Yeni `rateLimited` hata sınıfı (429 + hub'ın `RATE_LIMITED` string kodu) → tur **kesiliyor**; ayrıca tur başına `MAX_PER_FLUSH = 20` tavanı. |
| "PUT tamamlandıysa adım 1'i TEKRARLAMAYIN, `mediaUrl`'i saklayıp `send`'i tekrarlayın" | `mediaUrl` yükleme biter bitmez diske yazılıyor (`setVoiceMediaUrl`), tanım onu taşıyor, `sendVoiceMessage` dolu gelince 1. ve 2. adımı **atlıyor**. Yan kazanç: yerel dosya iOS cache temizliğine gitse bile mesaj gidiyor. |
| Yetim nesne 7 günde siliniyor → `UT-6605` | `needsVoiceReupload` ile bu kod artık **kalıcı değil**: anahtar düşürülüp 1. adımdan başlanıyor (yerel dosya varsa). |
| Herkesten silinmiş mesajı tekrar denemek `deletedForEveryone: true` döndürüyor | Ek iş yok: `messageSent` server kopyasını merge ediyor, balon `sent` + silinmiş hâle geçiyor. |

**Yanlış çıkan tespitim:** "`clientMessageId` history//changes yanıtlarında
gelmiyor" — ölçüm değildi, `chatRepository`'deki bayat bir yorumdan çıkarılmış
bir varsayımdı. Host ve path de doğruydu (`api.lit.4ourstack.com`,
`/api/messages/conversations/{id}/history-cursor`). Yorum düzeltildi: `COALESCE`
oradan kalkmıyor ama gerekçesi artık doğru yazıyor — cmid iki durumda boş
gelebilir (cmid'siz eski mesajlar ve karşı tarafın mesajları), `local_uri` ise
hiçbir sunucu kopyasında yok.

**Uygulanmayan tek öneri:** Not (`POST /swipe/Note`) outbox'a alınmadı — bugün
kuyruğa hiç girmiyor. Alınırsa `AlreadySwiped` (UT-6404) **başarı** olarak
işlenmeli (backend'in notu).

## Kalan tek istek (küçük, engelleyici değil)

**Hub `Error` payload'ına `clientMessageId` eklenebilir mi?**

Bugün `Error` gövdesinde `conversationId` var ama cmid yok. Sonuç: hub
üzerinden gönderilen bir mesaj `RATE_LIMITED` ile reddedildiğinde o hatayı
HANGİ mesaja ait olduğunu bilemiyoruz, dolayısıyla mesaj ack watchdog'unun
**12 saniyesini** bekleyip zaman aşımına düşüyor. Alan gelse:

- hata anında `failed`'a çekilir (12 sn beklemek yok),
- rate limit turu ANINDA kesilir (şu an turu ancak REST 429'u kesiyor),
- "yavaşla" cevabı ilgisiz bir mesaja yazılmaz.

Aynı mantık `CHAT_QUOTA_EXHAUSTED` ve `INVALID_*` için de geçerli. Tek alan,
ve hub'ın `SendMessage` çağrısı cmid'yi zaten argüman olarak alıyor.

**Bilgi (talep değil):** Artık tamamlanmış yüklemeyi yeniden kullanıyoruz, yani
yetim S3 nesnesi üretimimiz belirgin düşecek; ve kuyruk boşaltma turu başına en
çok 20 mesaj deniyoruz (sınırınız 30/dk).

---

## (Aşağısı talebin orijinal hâli — dondurulmuş)

**Engelleyici mi:** hayır. Bugün çalışan bir davranış var (aşağıda), talep onu
"kullanıcı dokunmadan düzelen"e çeviriyor.

---

## Bağlam — istemcide ne değişti

Chat artık local-first: mesajlar, sohbet listesi ve senkron durumu cihazdaki
SQLite'ta duruyor, ekran diskten okuyor. Bunun bir yan etkisi gönderim yolunu
açığa çıkardı:

**Gönderim kuyruğu hâlâ BELLEKTE.** Uygulama bir mesaj gönderilirken kapanırsa
(kullanıcı kapattı, OS öldürdü, crash) o mesajın satırı diskte `pending`
durumunda kalıyor ama onu sürecek kuyruk process ile ölüyor. Bugünkü telafimiz:
açılışta `pending` satırları `failed`'a çeviriyoruz, yani balon "tekrar dene"
butonuyla doğuyor ve **kullanıcı dokunursa** gidiyor.

Eksik olan şey otomatik devam: WhatsApp'ta uçakta yazılan mesaj, uygulama
yeniden açıldığında kullanıcı hiçbir şey yapmadan gider. Bizde gitmiyor ve
**bunun sebebi istemci tarafında bir eksik değil, bir emniyet kararı:**

> Ack gelmemesi "mesaj gitmedi" demek değil, "geri dönüş gelmedi" demek.
> Sunucu isteği işlemiş olabilir. Aynı mesajı tekrar göndermek, karşı tarafta
> **çift mesaj** riski. Bu yüzden istemci, ack'i görülmemiş bir gönderimi
> KENDİLİĞİNDEN tekrar denemiyor (`outboxPolicy.isEligible` →
> `origin === "ackTimeout"` dalı).

Yani kalıcı kuyruğu açmanın önündeki tek şey, "aynı mesajı iki kez göndermek
güvenli mi" sorusunun cevabı.

---

## Talep A (asgari, ucuz) — `clientMessageId` TÜM mesaj DTO'larında geri gelsin

İstemci her gönderimde bir `clientMessageId` üretiyor (UUID v4, 36 karakter,
mesaj başına bir kez, asla yeniden kullanılmıyor).

**Gözlemimiz:** bu alan geçmiş (`/messages/{id}/history`) ve delta
(`/messages/changes`) yanıtlarındaki mesaj nesnelerinde **gelmiyor**. İstemci
bunu yerelde telafi ediyor (disk UPSERT'inde `COALESCE(excluded.client_message_id,
messages.client_message_id)` ile kendi değerini koruyor), ama bu telafi yalnız
**zaten tanıdığı** satırlar için çalışıyor.

**Ne istiyoruz:** mesaj DTO'su nerede dönüyorsa (`send` yanıtı, hub
`ReceiveMessage` / `MessageSent`, `history`, `/changes`) `clientMessageId`
alanı — gönderen o mesajın sahibiyse — **dolu gelsin**. Başka tarafın
`clientMessageId`'sini göndermenize gerek yok (gizlilik açısından da gereksiz);
yalnız **isteyen kullanıcının kendi gönderdiği** mesajlarda.

**Neden kıymetli:** bununla istemci "bu mesaj gitti mi?" sorusunu **hiç mesaj
göndermeden** cevaplayabiliyor. Açılış akışı şöyle olur:

1. diskte `pending` satır var → henüz tekrar gönderme,
2. önce delta turu (`/changes`) — zaten atıyoruz,
3. mesaj `clientMessageId`'si ile geri geldiyse → **gitmiş**, satır `sent`'e
   çekilir, hiçbir şey gönderilmez,
4. gelmediyse → gerçekten gitmemiş, kuyruk devam ettirir.

Bu tek başına çift-mesaj riskini **neredeyse** kapatıyor: kalan pencere
"mesaj bizim delta turumuzdan sonra commit edilmiş olması" — küçük ama var.
O pencereyi kapatan şey Talep B.

---

## Talep B (doğrusu) — `send` idempotent olsun

**Kapsam:** hem `POST /api/messages/send` hem hub `SendMessage(convId, content,
clientMessageId)`.

**Beklenen davranış:** aynı `(gönderen, clientMessageId)` ikilisiyle gelen
ikinci istek **yeni mesaj yaratmaz**, var olan mesajı döndürür.

Kabul ölçütleri — istemci bunlara göre yazacak:

| # | Ölçüt | Neden |
|---|---|---|
| B1 | İkinci istek `200` + **var olan mesajın** tam DTO'su (gerçek `id`, sunucunun `sentAt`'i) döner | İstemcinin ack yolu değişmez: `messageSent(result)` aynı şekilde çalışır. `409` da kabul ama o zaman gövdede var olan mesajın `id`'si olmalı — yoksa istemci "başarısız" sayar. |
| B2 | Kota **bir kez** düşer | İstemci de cmid başına bir kez düşüyor (`chargeQuotaOnce`). Sunucu iki kez düşerse kullanıcı yazmadığı mesajın hakkını kaybeder. |
| B3 | Karşı tarafa **bir kez** push/hub event'i gider | İkinci kez gitmesi "mesaj iki kez geldi" bildirimi demek. |
| B4 | Garanti **en az 24 saat** yaşar | Kuyruk artık kalıcı: uygulama bir gün sonra açılıp devam edebilir. Kolon üzerinde unique index ise süre sınırsız, bizim için en iyisi o. |
| B5 | Not / consumable tüketen gönderimlerde de **bir kez** harcanır | Not ürünü (UT-64xx) ayrı bakiyeden düşüyor; iki kez düşmesi para kaybı. |

**Sesli mesaj (3 adım) için ek soru:** akış `upload-url` → S3 PUT → `send`.
Yalnız son adım tekrarlanırsa (aynı `mediaUrl` + aynı cmid) B1 yeterli. Ama
istemci yeniden başladıktan sonra adım 1'i de tekrarlıyorsa **yetim S3
nesnesi** kalıyor. Bu bizim için engelleyici değil (maliyet kalemi, sizde
görünür); sormamızın sebebi temizlik işi gerekip gerekmediğini bilmeniz.

---

## Talep B olmazsa — alternatif C (en az iş)

Idempotency yazılmayacaksa, mükerrer gönderimi **ayırt edilebilir** yapın:
ikinci istek için ayrı bir UT kodu (ör. `UT-67xx DuplicateClientMessageId`) ve
gövdede var olan mesajın `id`'si. İstemci o kodu **başarı** olarak işler
(balonu `sent`'e çeker), hata olarak göstermez. Bu, idempotency'nin ucuz
taklidi: mesaj iki kez YARATILMIYOR olduğu sürece hangi HTTP statüsüyle
söylediğiniz bizim için ikincil.

---

## İstemcide hazır olan

- **`outbox` tablosu** şema v1'den beri duruyor (`seq`, `client_message_id`
  UNIQUE, `kind`, `payload_json`, `state`, `attempts`, `next_attempt_at_ms`,
  `last_error`) — bilerek **kullanılmıyor**, bu cevabı bekliyor.
- `clientMessageId` üretimi, disk tarafında UNIQUE kısmi index ve UPSERT'te
  cmid ile uzlaştırma (optimistic satır ikizlenmiyor).
- Açılışta `pending → failed` uzlaştırması (`failStalePendingSends`).
- Başarısız gönderimlerin **tüm arşivden** bulunması: artık yalnız ekranda açık
  olan sohbetlere değil, diske bakıyor.
- Kalıcı yaş sınırı için ayrı sabit: sessiz devam ettirme yalnız **son 2 saat**
  içinde yazılmış mesajlar için (elle "tekrar dene" sınırsız). Üç gün önceki bir
  mesajı kullanıcı habersiz göndermek doğru olmazdı.

Yani A ya da B geldiğinde istemci tarafında yazılacak şey tek bir kapıyı açmak +
devam ettirme akışı; şema ve yazım yolları yerinde.

---

## Cevap bekleyen sorular

1. `clientMessageId`, mesaj sahibinin kendi mesajlarında `history` ve
   `/changes` yanıtlarında dönebilir mi? (Talep A)
2. `POST /messages/send` ve hub `SendMessage` bugün aynı cmid ile gelen ikinci
   isteği nasıl ele alıyor? (Yeni satır / hata / sessiz yutma?)
3. B1–B5 ölçütlerinin hangileri bugün **zaten** sağlanıyor? (Belki de iş
   sandığımızdan az.)
4. Idempotency garantisi ne kadar yaşar — unique index mi, pencere mi?
5. Sesli mesajda tekrarlanan `upload-url` çağrısı yetim S3 nesnesi bırakıyor
   mu, temizliği var mı?
6. Hub tarafında ack kaybı: `SendMessage` invoke'u resolve oluyor ama mesaj
   işlenmemiş olabileceği bir senaryo var mı? (İstemci bugün bunu varsayıp
   `ackTimeout`'ta sessiz tekrar denemiyor.)

---

## Aciliyet

**Düşük-orta.** Bugünkü davranış kullanıcıyı mesaj kaybetmekle baş başa
bırakmıyor: balon "gönderilemedi" halinde duruyor ve dokununca gidiyor. Talep,
"uygulamayı kapattım, mesaj kendi kendine gitti" deneyimi için. Bizim açımızdan
en küçük iş **Talep A** ve o tek başına da anlamlı bir adım — B olmadan da
istemci çift gönderim riskini büyük ölçüde kapatabilir.
