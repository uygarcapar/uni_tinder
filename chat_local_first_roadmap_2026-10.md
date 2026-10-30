# Chat local-first — tamamlama yol haritası (2026-10-27)

## Hedef: bitince ne doğru olacak

Bugün chat'in okuma yolu zaten SQLite üzerinde ve soğuk açılış anında boyanıyor.
Eksik olan, local-first'ün "hız" dışındaki vaatleri. Bu haritanın sonunda:

1. Sohbet listesi ve sohbet içi ağ beklemeden açılır — **bugün çalışıyor**.
2. Offline'da yazdığın mesaj, uygulamayı öldürsen bile ağ gelince kendiliğinden
   gider ve mükerrer olmaz.
3. Offline'da verdiğin tepki / düzenleme / silme de kaybolmaz.
4. Tüm geçmiş cihazda durur; **aradığın her mesajı bulursun** — offline'da,
   anında, ve sonucu tıklayınca o mesajın yanına inersin.
5. Gelen sesli mesajlar offline dinlenir.

"En iyi hali" derken kastım bu beş madde. Sıra keyfi değil: her faz kendinden
sonrakinin ön koşulu ya da onun riskini düşüren şey.

---

## Faz 0 — Bozuk olanı tamir et (backend yok, yarım gün)

Yeni özellik değil; şu an kullanıcıya yanlış cevap veren şeyler.

### 0.1 Türkçe harf katlaması — isim araması

**Sorun:** `MessagesScreen.tsx:695-696` araması `toLowerCase()` kullanıyor.
JS İngilizce kuralı uyguluyor:

| Kayıtlı ad | Kullanıcı yazar | Bulunur mu |
|---|---|---|
| `İrem` | `irem` | ❌ (`"İ".toLowerCase()` = `i` + U+0307 birleşik nokta) |
| `Işıl` | `ışıl` | ❌ (`I` → `i`, oysa Türkçede `I` → `ı`) |
| `Özge` | `ozge` | ❌ (aksan katlaması yok) |

İlk iki satır kesin bug: kullanıcı adı **doğru** yazıyor ve bulamıyor. İ ile
başlayan isimler seyrek değil (İrem, İpek, İlayda, İsmail, İbrahim).

**Yapılacak:** `src/shared/utils/foldTr.ts` — tek saf fonksiyon:
`İ→i`, `I→ı→i`, `ş→s`, `ğ→g`, `ü→u`, `ö→o`, `ç→c`, ardından NFC normalize.
Hem kayıtlı ad hem sorgu aynı fonksiyondan geçer. Jest'li, cihaz gerektirmez.

**Kapsam kararı (benim çağrım):** arama son mesaj önizlemesine de bakacak.
Kullanıcı "ne yazmıştı" diye hatırlıyor olabilir ve önizleme zaten listede.
Mesaj içeriğinde arama DEĞİL — o Faz 4.

**Kabul:** yukarıdaki tablo üç satırda da ✅; "Özge" araması "ÖZGE" ve "ozge"
ile de gelir.

**Not:** bu fonksiyon Faz 4'te FTS'in normalize kolonunda yeniden kullanılacak —
şimdi doğru yazılması oraya da yarıyor.

### 0.2 Bayat yorumu düzelt

`chatRepository.ts:296-300` hâlâ "backend `clientMessageId` idempotency'si
teyitli değil, kendiliğinden tekrar göndermek mükerrer mesaj riski" diyor.
Yanlış: idempotency 2026-10-06'da kapandı, 2026-10-27'de yeniden teyit edildi.
Kanonik yorum `outboxPolicy.isEligible:429-432`. Bu yorum yanlış yerde
duruyor ve Faz 1'de ters yöne karar verdirir.

### 0.3 Dokunulmayacak olanı kayda geç

Backend 429 gövdesinin `errorCode` taşıdığını ve `code` üzerinden switch yapan
FE kodunun kaçıracağını uyardı. **Bizi kesmiyor:** `outboxPolicy.rawErrorCode`
zaten `data.code` ve `data.errorCode`'un ikisine de bakıyor
(`outboxPolicy.ts:153-159`), sınıflandırma `status === 429 || rawErrorCode(...)
=== "RATE_LIMITED"` (`:188`), `Retry-After` de `api.ts:585-587`'de
onurlandırılıyor. Değişiklik yok — teyit edildi diye yazıyorum ki tekrar
araştırılmasın.

---

## Faz 1 — Kalıcı gönderim kuyruğu (backend garantisi geldi, blokaj yok)

Bugün gönderim muhasebesi (deneme sayısı, backoff, `permanent`, `quota_charged`)
**bellekte** bir `Map` — process ile ölüyor. Sonucu: uygulamayı öldürüp açınca
backoff sıfırlanıyor, 2 saatten eski mesaj hiç denenmiyor, kullanıcı balona elle
basmak zorunda.

Backend cevabı bunu açtı: `(senderId, clientMessageId)` üzerinde filtreli UNIQUE
index, mükerrer istek 200 + var olan mesaj, kota bir kez, push bir kez, garanti
**730 gün** (mesaj satırının kendisine dayanıyor, TTL tablosuna değil).

### 1.1 v7 migration — ölü tabloyu değiştir

`outbox` tablosu v1'den beri şemada ama hiç yazılmadı; tek dokunan yer
`DELETE FROM outbox`. `payload_json NOT NULL` taşıdığı için olduğu gibi
kullanmak mesaj gövdesinin **ikinci bir kopyasını** üretir — notlardaki "aynı
kolona iki yazıcı iki format" tuzağının aynısı.

Karar: tabloyu düşür, yerine yalnız **muhasebe** taşıyan tablo. Mesaj gövdesi
tek kaynakta — `messages` satırında — kalır.

```sql
DROP TABLE outbox;
CREATE TABLE send_attempts (
  client_message_id  TEXT PRIMARY KEY,
  attempts           INTEGER NOT NULL DEFAULT 0,
  first_seen_at_ms   INTEGER NOT NULL,
  next_eligible_at_ms INTEGER NOT NULL DEFAULT 0,
  permanent          INTEGER NOT NULL DEFAULT 0,
  quota_charged      INTEGER NOT NULL DEFAULT 0,
  origin             TEXT,
  last_error         TEXT
);
```

**Beraberinde güncellenecek üç yer** (yoksa açılışta SQL hatası):
`chatRepository.ts:740`, `chatRepository.ts:1152`, `chatDb.ts:106`.

### 1.2 `attempts` Map'i bu tablonun önbelleği olsun

Map kalıyor — kaldırma gerekçesi hâlâ geçerli: sayaç mesaj alanı olsaydı
`messageEquality`'ye girmesi gerekirdi ve her deneme artışı balonu + LegendList'i
yapısal değişim sayıp yeniden çizdirirdi (commit-storm sınıfı). Değişen tek şey:
`touchEntry` / `noteFailure` / `chargeQuotaOnce` yazarken diske de yazar,
`flushOutbox` turun başında eksik kayıtları diskten doldurur.

**`quota_charged`'ın kalıcı olması asıl kazanç:** bugün restart sonrası bu bayrak
kayboluyor ve ack'i görülmemiş bir mesajın başarılı tekrarı kotayı **ikinci kez**
düşürüyor.

### 1.3 2 saatlik yaş sınırını kaldır

`OUTBOX_DISK_MAX_AGE_MS = 2sa` (`outboxPolicy.ts:129`) dayanağını kaybetti —
730 günlük garanti karşısında gece yazılan mesajın sabah gitmemesi için sebep
yok. Sınır `MAX_ATTEMPTS` + `MAX_AGE_MS` olsun; ikisi de artık diskte yaşıyor,
yani anlamlı.

### 1.4 `failStalePendingSends` davranışı

`pending → failed` çevirmeye devam (balonda "tekrar dene" çıksın, kullanıcı
asılı spinner görmesin) ama sessiz devam ettirme artık açık — `isEligible`
kaydı diskten okuyacağı için backoff ve `permanent` restart'ı atlatıyor.

### 1.5 Boot sırası: önce yakalama, sonra gönderim

Backend'in açık ricası. Bugün yarısı var: `flushOutbox` uçuştaki delta turunu
**bekliyor** (`outbox.ts:468-475`) ama tur **açmıyor**. Delta'nın 10 saniyelik
tabanı (`chatDeltaSync.ts:216`) o turu bastırırsa beklenecek bir şey olmuyor ve
gönderim yakalamadan önce gidiyor.

Etkisi tam da backend'in tek sapması: mükerrer istek rate limit slotu yiyor
(sayaç Redis middleware'inde, controller'a girmeden atomik olarak artıyor —
düzeltilmeyecek, çünkü middleware'in amacı DB'ye hiç dokunmadan reddetmek).
Zararsız ama ücretsiz de değil.

**Yapılacak:** `flushOutbox` uçuşta tur yoksa ve son tur eskiyse turu kendisi
başlatsın (tek seferlik, `MIN_PULL_INTERVAL_MS`'e saygılı).

### 1.6 Sesli mesajın yerel dosya ömrü — kalıcı kuyruğun gerçek riski

Kuyruk kalıcı olunca kuyrukta **günlerce** bekleyen sesli mesaj mümkün hale
geliyor. `_localUri` cache dizininde ve iOS orayı haber vermeden siliyor.

İki dal:
- `mediaUrl` yazılmışsa (`setVoiceMediaUrl`) sorun yok — 3. adımdan devam,
  dosya gerekmiyor.
- Yazılmamışsa: dosya yok → `messageToDescriptor` null dönüyor → bugün sessizce
  kalıcı hataya düşüyor. Kullanıcıya **söylenmesi** gerekiyor ("ses kaydı
  bulunamadı, yeniden kaydet") ve balon o hale geçmeli.

S3 nesnesinin 7 günlük yetim temizliği de burada: `mediaUrl` var ama nesne
silinmişse `UT-6605` geliyor ve `needsVoiceReupload` zaten anahtarı düşürüp 1.
adımdan başlıyor — **dosya hâlâ varsa**. Yoksa yukarıdaki ikinci dal.

---

## Faz 2 — Mesaj dışı mutasyonlar da kaybolmasın

**Her mutasyon bugün zaten optimistic** — ekran (ve ayna sayesinde disk) anında
güncelleniyor. Ayrım optimistic olup olmamakta değil, yazının **başarısız olduktan
sonraki kaderinde**. Üç sınıf var:

| Sınıf | Hangi işler | Başarısızlıkta |
|---|---|---|
| Optimistic + kalıcı + kuyruklu | yalnız **mesaj gönderimi** | diskte `send_state`, restart'ı atlatır, yeniden denenir (Faz 1 tamamlıyor) |
| Optimistic + **geri alınan** | tepki, düzenleme, silme | UI eski haline döner, ayna da eski değeri diske yazar → **kullanıcının niyeti kaybolur** |
| Optimistic + sessiz (fire-and-forget) | `markRead`, `markMessageDelivered` | ne geri alınır ne denenir |

Bu fazın konusu **ikinci sınıf**. Bugün tepki / düzenleme / silme doğrudan REST'e
gidiyor ve offline'da değişiklik geri alınıyor (`ChatScreen.tsx:1355-1362`,
`:1411-1418`). Kullanıcı açısından: uçakta bastığın emoji, inince yok.

Üçüncü sınıf **bilinçli ve büyük ölçüde korunmuş durumda**, faz gerektirmiyor:
`upsertConversations`'ın (2) numaralı kuralı yerel "okundu"yu sunucunun bayat
`unreadCount`'una karşı koruyor (`chatRepository.ts:1222-1227`), ve sohbete
yeniden girmek `markRead`'i zaten tekrar çağırıyor (`ChatScreen.tsx:862-869`).
Kalan tek açık: çağrı hiç başarılı olmazsa **karşı tarafın** okundu tiki biz o
sohbete yeniden girene kadar gelmiyor. Küçük; kuyruğa almak bu kadar kazanç için
fazla makine olurdu.

Aynı `send_attempts` altyapısı `kind` kolonuyla bu üçünü de taşıyabilir.
Çakışma politikası son-yazan-kazanır; hepsi doğal olarak idempotent
(aynı emoji iki kez eklenmez, aynı içerik iki kez düzenlenmez).

**Backend'e sorulacak:** bu üç uçta mükerrer isteğin davranışı garanti mi, yoksa
yalnız `send`de mi? Faz 1'i bloke etmiyor, Faz 2'yi bloke ediyor.

**Öncelik notu:** bu fazı 3 ve 4'ten sonra yapmak da savunulabilir — etkisi
daha küçük. Sıralamayı ürün önceliğine göre kaydırabilirsin.

---

## Faz 3 — Arşivi tamamla (aramanın ön koşulu, atlanamaz)

**Bugünkü arşiv tam geçmiş değil.** Diskte yalnız yoldan geçenler var: açtığın
sohbetin son 60 satırı (`HOT_WINDOW`), elle yukarı kaydırdığın sayfalar ve
watermark'tan beri gelen delta. Hiç açmadığın bir sohbetin eski mesajları
**yok**.

Bu yüzden Faz 4 doğrudan yapılamaz: FTS5'i bugünkü arşive bağlamak "arama var
ama bazen bulamıyor" demek. Bir aramanın yapabileceği en kötü şey bu — kullanıcı
**sonucun yokluğuna** güvenemez hale gelir ve özellik güvenilmez damgası yer.
Yarım arama, aramasızlıktan kötüdür.

### 3.1 Geri doldurma (backfill) turu

Sohbet başına geçmişi arka planda sayfalayıp diske yazan, **devam ettirilebilir**
bir tur. Mevcut `fetchHistory` + `applyHistoryPage` yolunu kullanır, yeni uç
gerekmez.

Tasarım kararları (benim çağrılarım, hepsi değiştirilebilir):
- İlerleme `sync_state` satırında — zaten `oldest_loaded_sent_at_ms` ve
  `next_cursor` orada duruyor, yeni kolon gerekmiyor.
- Sıra: en son konuşulan sohbetten geriye. Kullanıcı en çok orada arar.
- Tetik: foreground + ekran boşta + (tercihen) Wi-Fi. Soğuk açılışı
  geciktirmez; ilk kareyle yarışmaz.
- Tavan: sohbet başına retention penceresi (730 gün) kadar; sunucu zaten fazlasını
  servis etmiyor.
- Bitince `meta`'ya "bu sohbet tam" damgası — arama bunu okuyup kapsamını
  kullanıcıya dürüstçe söyleyebilir.

### 3.2 Budama ile çakışmayı çöz

`pruneExpiredMessages` eski uçtan silerken `next_cursor`'ı null'luyor (haklı
olarak: cursor artık yerel aralığın altını gösteriyor). Backfill'in bunu
"geçmiş bitti" sanmaması gerekiyor — "tam" damgası cursor'dan ayrı tutulmalı.

**Riski küçük tutan şey:** backfill tamamen ek. Patlarsa ya da hiç koşmazsa
bugünkü davranış aynen kalır; yalnız arama kapsamı eksik kalır.

---

## Faz 4 — Arama (asıl özellik)

### 4.0 Önce doğrula (10 dakika, kod yazmadan)

expo-sqlite'ın bundle'ında **FTS5 derli mi?** Değilse bu fazın tasarımı
değişiyor (FTS yerine normalize kolon + `LIKE` + indeks, küçük arşivde kabul
edilebilir). `better-sqlite3`'te varsayılan açık, yani jest yanıltabilir —
doğrulama cihazda/simülatörde yapılmalı.

### 4.1 Türkçe'yi FTS'in tokenizer'ına bırakma

SQLite'ın `unicode61` tokenizer'ı `remove_diacritics` ile aksanı atıyor ama
Türkçe'nin `İ/ı` ayrımı aksan meselesi **değil** — `ı` (U+0131) ayrı bir harf.
Tokenizer semantiğine güvenmek, Faz 0'da düzelttiğimiz bug'ı SQL tarafında
yeniden üretmek olur.

Karar: aranabilir metni **JS'te** `foldTr` ile normalize edip ayrı bir kolona
yaz, FTS indeksini **o kolon** üzerine kur. Sorgu da aynı fonksiyondan geçer.
Böylece arama ile isim araması birebir aynı kuralı paylaşır ve tokenizer
sürümüne bağımlılık kalmaz.

### 4.2 Yazıcı kapısı tek olmalı

Mesajın diske indiği **dört** yol var (realtime, `messageSent`, history sayfası,
delta turu) ve hepsi `saveMessage`/`upsertMessage`'dan geçiyor. Normalize kolonu
ve FTS satırı oraya bağlanacak — dört çağrı yerine değil. (Bu dosyanın
tarihçesinde "aynı kolona iki yazıcı iki format" bir kez yaşandı; tek kapı
kuralı onun dersi.)

Backfill'in yazdığı milyonlarca satır için FTS'i satır satır beslemek yavaş
olabilir; o durumda backfill bitiminde tek seferlik `INSERT INTO fts SELECT ...`
daha hızlı. Ölçülüp seçilecek.

### 4.3 Kullanıcıya ne verilecek

- **Sohbet içinde ara:** o sohbetin başlığından açılır, eşleşmeler arasında
  ileri/geri.
- **Her yerde ara:** mevcut arama çubuğu artık üç şey döndürür — kişiler,
  sohbetler, **mesajlar**. Sonuçta kim/ne zaman + eşleşen kelimenin vurgulandığı
  satır.
- **Sonuca dokununca o mesajın yanına in.** Bu, yerel yolun en büyük avantajı:
  arşiv tam olduğu için "mesajın etrafındaki pencereyi getir" saf bir yerel okuma
  (`readAround(conversationId, sentAtMs, id)`). Sunucu tarafında böyle bir uç
  **yok** ve olsa bile her atlayış bir ağ turu olurdu.

### 4.4 Neden backend arama ucu değil

Faz 3 bittiğinde sunucuya gitmenin getirisi kalmıyor: sonuç aynı, üstüne ağ
gecikmesi, offline'da çalışmama ve yeni backend işi biniyor. Dahası 4.3'teki
"mesaja atla" sunucu yolunda ikinci bir uç daha istiyor. Yerel FTS, Faz 3'ün
bedeli ödendikten sonra her boyutta daha iyi.

Backfill'den **vazgeçilirse** karar tersine döner: o durumda tek dürüst arama
sunucu tarafındadır. Yani Faz 3 ile Faz 4 birlikte alınır ya da birlikte
bırakılır.

---

## Faz 5 — Medya offline

Gelen sesli mesaj her oynatmada imzalı URL ile ağdan çekiliyor
(`voicePlayback.ts:20-23` — URL'i saklamama gerekçesi doğru, 15 dakikada
eskiyor). Ama **dosyanın kendisi** de saklanmıyor: offline'da gelen sesli mesaj
hiç çalmıyor.

Yapılacak: ilk oynatmada dosyayı kalıcı dizine indir, `messages` satırına yerel
yolu yaz (kolon zaten var: `local_uri`), sonraki oynatmalar yereli kullansın.
LRU tavanı + logout'ta silme şart. Image/Video content type'ları ürüne girerse
aynı mekanizma onları da taşır.

---

## Faz 6 — Tazelik boşluğu (düşük öncelik)

Delta turu yalnız hub `connected` + foreground'da koşuyor. Hub bağlı kalıp bir
event kaçırırsa ekran, kullanıcı uygulamayı arkaya atıp dönene kadar bayat
kalıyor. Foreground'da seyrek periyodik bir tur (ya da uzun sohbet oturumlarında
tek tur) bu deliği kapatır. Bugün bilinen bir şikâyet üretmiyor — en sona.

---

## Sıranın gerekçesi

- **0 önce:** kullanıcıya şu an yanlış cevap veren tek şey orada, ve `foldTr`
  Faz 4'ün de parçası.
- **1 sonra:** blokajı kalkmış, etkisi en büyük ("mesajım gitmedi" sınıfı),
  kapsamı dar ve kendi başına bitiyor.
- **3, 4'ten önce:** atlanabilir değil. Yarım arama güveni kalıcı olarak
  bozuyor.
- **2 esnek:** 1'in altyapısını paylaşıyor, ürün önceliğine göre 3-4'ten önce
  ya da sonra.
- **5-6 en son:** ikisi de bilinen bir şikâyete bağlı değil.

## Test ve doğrulama notları

- Jest **node@24** ile koşmalı (`better-sqlite3` ABI); varsayılan node 20'de
  çıktısız SIGSEGV.
- Her migration için şema + geri uyumluluk testi; yayınlanmış migration asla
  düzenlenmez, yeni sürüm eklenir.
- Faz 1'de kritik test: "uygulama gönderim ortasında ölür → açılışta balon
  başarısız → ağ gelir → mesaj **bir kez** gider, kota **bir kez** düşer".
- Faz 4'te kısmi/tam indeks planı `EXPLAIN QUERY PLAN` ile assert edilmeli;
  `idx_messages_unsent`'te öğrenilen ders (planlayıcı kısmi indeksi ima
  kanıtlayamazsa tam taramaya döner) FTS sorgularında da geçerli.
