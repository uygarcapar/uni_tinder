# Backend soruları — 2026-10-29 · **HEPSİ CEVAPLANDI (aynı gün)**

Sorular aşağıda olduğu gibi duruyor; her maddenin altına **CEVAP** ve **istemcide ne
yapıldı** eklendi. Açık kalan işler en sonda tek tabloda.

## Özet

| # | Konu | Durum |
|---|---|---|
| 1-2-3 | Anı fotoğrafı 403 | **Kök neden bulundu:** kova policy'sinde `campus/*` öneki yok. Kod/sürüm değişikliği gerekmiyor, **policy'ye ikinci statement** eklenecek. |
| 2 | URL sabitliği | **Zaten sağlanıyor** — imza yok, `ObjectKey` sabit GUID. Endişe konusuz. |
| 4 | Moderasyondaki anın URL'i | Dördüncü bir hâl çıktı: **redde nesne siliniyor, DTO yine URL üretiyor → 404.** İstemci bu dalı kapattı; backend'den `null` istendi. |
| 5 | Ödünç profil ucu | **Çalışmıyor teyit edildi** (beğeni yoksa 404). `GET /api/campus/moments/{id}/profile` gerekli. |
| 6 | UT-7415 muafiyeti | Ortam değişkeni `Campus__TestUserIds__0`. **Bizden id listesi bekleniyor.** |
| 7 | Koordinatlar | **Bizim gözlemimiz eskimiş** — canlı doğru (yeniden ölçüldü). Yalnız `okan.edu.tr` açık. |
| 8 | Kendi gönderinin avatarı | **Hata teyit edildi**, düzeltilecek. İstemci yedeği o zaman silinecek. |
| 9 | Bildirim feed'inde `mode` | Hâlâ açık: kolon + migration gerekiyor. |
| 10 | E2E ortamı | **Cevap: prod** — ayrı instance yok; izolasyon katmanı tasarlandı. |

---

Her maddede aynı üç satır var: **Gözlem** (cihazdan ölçülmüş), **Soru/Talep**,
**Neden önemli** (cevap gelmezse ne bozuk kalıyor).

---

## 1. 🔴 BLOKAJ — Kampüs anı fotoğrafları **403** veriyor

**Gözlem.** Paylaşım akışının tamamı çalışıyor (upload-url → S3 PUT → `POST /moments` →
listede görünüyor, başlıkta "1 an" yazıyor) **ama hiçbir fotoğraf gösterilemiyor.**
İstemciye konan teşhis şunu yazdı:

```
Download marked as failed because of invalid response status code 403
https://universitytinder-media.s3.us-east-1.amazonaws.com/…
```

Yani `photoUrl` kovanın **çıplak nesne adresi**, imza parametresi yok. Paylaşımdan
**4 dakika** sonra denendi — "imza süresi doldu" ile açıklanamaz.

**Talep.** `GET /api/campus/moments` ve `POST /api/campus/moments` yanıtlarındaki
`photoUrl` okunabilir olsun. Sözleşmenin **§4**'ü zaten iki seçenek veriyordu:

- **(a)** presigned **GET** URL, ömrü anın `expiresAt`ini AŞSIN (≥25 saat),
- **(b)** opak key ile CDN üstünden imzasız servis. ← **mümkünse bu** (gerekçe 2. madde)

⚠️ Yükleme için verilen presigned **PUT** adresi okumaya yaramıyor; GET ayrı imza ister.

**Neden önemli.** Özelliğin tamamı buna bağlı: kullanıcı fotoğraf paylaşıyor, kendi anını
bile göremiyor. İstemci tarafında yapılabilecek bir şey yok — imzayı istemci atamaz.

> **✅ CEVAP.** İmzasız URL **bilinçli seçim** (sözleşmenin (b) şıkkı,
> `CampusPhotoUrlBuilder.cs:6-18`). Eksik olan kod değil **kovanın policy'si**:
> `deploy/s3-bucket-policy.json:10` yalnız `ProfilePhotos/*` önekini public okumaya
> açıyor; kampüs anları `campus/` önekine yazıyor (`CampusPhotoUrlBuilder.cs:30`) → 403.
> **Çözüm:** policy'ye `campus/*` için ikinci statement. Kod değişikliği, deploy, yeni
> uygulama sürümü gerekmiyor.
>
> **İstemcide yapılacak iş:** yok. Policy düzelince fotoğraflar kendiliğinden gelir;
> karttaki DEV teşhis etiketi düzeldiğini tek açılışta doğruluyor.

> **✅✅ UYGULANDI VE DOĞRULANDI — 2026-10-29.** Policy AWS Console'dan elle yazıldı
> (kova `universitytinder-media`, bölge `us-east-1`); canlıda tek statement vardı, o
> KORUNDU ve altına ikincisi eklendi:
>
> | Sid | Resource |
> |---|---|
> | `PublicReadProfilePhotosOnly` | `arn:aws:s3:::universitytinder-media/ProfilePhotos/*` (değişmedi) |
> | `PublicReadCampusMoments` | `arn:aws:s3:::universitytinder-media/campus/*` (**yeni**) |
>
> Cihazda teyit: **fotoğraflar geliyor.** Madde kapandı.
>
> ⚠️ **BACKEND'E NOT — repo ile canlı şu an AYRI:** `deploy/s3-bucket-policy.json` hâlâ
> yalnız `ProfilePhotos/*` taşıyor ve `BUCKET_ADI` placeholder'ında. Canlıya yazılan hâl
> yukarıdaki iki statement + `"Id": "unitinder-media-access"`. Dosya **aynen bu şekilde**
> commit edilmeli, yoksa runbook'u bir dahaki koşan kişi (`sed` + `put-bucket-policy`)
> kampüs statement'ini **silmiş** olur.

---

## 2. 🔴 Seçilen yol ne olursa olsun: **URL dizesi sabit kalmalı**

**Gözlem.** İstemcide fotoğrafın disk cache anahtarı **URL dizesinin kendisi**
(`expo-image`). Anlar şeridi her harita açılışında tazeleniyor.

**Soru/Talep.** Presigned yol (1a) seçilirse imza **her yanıtta yeniden üretilecek mi?**
Üretilirse `X-Amz-Date`/`X-Amz-Signature` her seferinde değişir, aynı fotoğraf **yeni bir
dosya** sayılır ve baştan indirilir — pratikte cache yok. İstenen: bir anın `photoUrl`i,
anın ömrü boyunca **birebir aynı dize** olsun (imza kayıt anında bir kez üretilip
saklansın ya da deterministik üretilsin).

**Neden önemli.** 20 kartlık bir şeritte her açılış 20 yeniden indirme = kullanıcının
mobil verisi + şeridin boş kutularla açılması.

> **✅ CEVAP — konu zaten kapalı.** URL birebir sabit: `PhotoUrl = _urls.ToUrl(moment
> .ObjectKey)` (`CampusQueryService.cs:328`), `ObjectKey` DB'de duran sabit bir GUID ve
> imza parametresi hiç yok. Her yanıtta bayt bayt aynı dize dönüyor → `expo-image` cache
> anahtarı tutuyor. Endişe (1a) seçilmediği için konu dışı.

---

## 3. Profil/sohbet medyası aynı kovadan mı geliyor?

**Gözlem.** Profil fotoğrafları ve avatarlar **sorunsuz görünüyor**, kampüs anları
görünmüyor; ikisi de aynı uygulamanın istemcisinden isteniyor.

**Soru.** Profil fotoları da `universitytinder-media` kovasında mı? Öyleyse onların
adresi nasıl üretiliyor (imzalı mı, CDN mi)? Değilse kampüs anları niye ayrı bir yola
düştü?

**Neden önemli.** Çalışan bir örnek varsa 1. maddenin çözümü yeni bir tasarım değil,
**var olan yolun kampüs anlarına da uygulanması** — hem daha hızlı hem daha az riskli.

> **✅ CEVAP.** Evet, **aynı kova**. Profil fotoğrafları `ProfilePhotos/` önekinde ve
> policy onlara açık; kampüs anları farklı bir önek aldığı için düştü. Tahmin doğruydu:
> çözüm var olan yolu kampüse de uygulamak.

---

## 4. Moderasyonda bekleyen anın `photoUrl`i ne oluyor?

**Gözlem.** Sözleşme "kendi anım moderasyonda düşmüş olsa bile `moderation` bloğuyla
dönsün" diyor; `photoUrl`in o hâllerde ne olacağı yazılı değil.

**Soru.** `moderation.status = Pending` / reddedilmiş bir anda `photoUrl`:
(a) yine okunabilir mi geliyor, (b) boş/null mu, (c) 403 mü?

**Neden önemli.** İstemci bu üç hâli ayırt edip farklı şey göstermek zorunda: sahibi
"inceleniyor" rozetini görüyor ama kutu boşsa bunun moderasyondan mı yoksa bozuk bir
adresten mi olduğunu söyleyemiyoruz. (b) ise istemci bugünkü gri kutuyu çiziyor ve bu
**doğru** davranış; (c) ise 1. maddenin aynısı.

> **✅ CEVAP — sorduğumuz üç şıktan hiçbiri, DÖRDÜNCÜSÜ.** `photoUrl` moderasyon
> durumundan bağımsız **her zaman dolu** (`CampusQueryService.cs:328`). Ama:
> **Pending** → nesne S3'te duruyor, policy düzelince normal görünür.
> **Rejected** → `RemovedAt` yazılırken **S3 nesnesi siliniyor**
> (`CampusModerationService.cs:74`), DTO yine URL üretiyor → **404**. Yani okunabilir bir
> dize ama ölü nesne.
>
> **KARARIMIZ: evet, düzeltin — reddedilmiş anda `photoUrl: null` dönsün.** Gerekçe:
> "dize var ama 404" hâli istemcide hiçbir şeye yaramıyor, yalnız her kart açılışında
> kesin başarısız bir indirme ve yeniden deneme turu doğuruyor.
>
> **İstemcide YAPILDI (null'u beklemeden):**
> - `status === "Rejected"` ise istek **hiç kurulmuyor** (`CampusMomentCard > photoUri`).
>   Bu dal null gelmeye başlasa da kalacak — eski sürümler ve yoldaki cache'lenmiş
>   yanıtlar hâlâ ölü dizeyi taşıyor.
> - Rozet ayrıştı: reddedilmiş an artık **"Yayınlanamadı"** diyor, "İnceleniyor" demiyor.
>   Önceki hâli karar verilmiş bir ana "bekliyor" diyordu — nesne silindiği için o kart
>   bir daha asla dolmayacak, kullanıcıya sonuç söylenmeli. Ayrım `status` üzerinden;
>   `isVisibleToOthers` ikisinde de `false`.

---

## 5. An sahibinin profilini veren uç — **ödünç alınmış durumda**

**Gözlem.** Kampüs sözleşmesinde an sahibinin profil kartını veren uç yok. İstemci
şimdilik `GET /api/swipe/LikerProfile/{userId}` çağırıyor.

**Talep.** `GET /api/campus/moments/{id}/profile` → aynı `ProfileCardDto`.

**Neden önemli.** Ödünç alınan ucun adı "beni beğenenler" kümesine kapalı olduğunu
düşündürüyor; akış aynı ihtiyaç için ayrı bir uç almıştı
(`/api/feed/posts/{id}/author-profile`). Kampüs anında karta dokunmak profil açıyor —
uç bu kümede 403/404 dönerse kart hiç açılmıyor.

**Doğrulama sorusu (uç açılana kadar):** `LikerProfile`, kullanıcıyı beğenmemiş biri için
de 200 dönüyor mu?

> **✅ CEVAP: HAYIR — ödünç uç çalışmayacak.** `GetLikerProfileDetailHandler.cs:66-71`'de
> sert bir güvenlik kapısı var: liker gerçekten current user'a Like/SuperLike atmış
> olmalı, yoksa `ProfileNotFound` → **404**. Yani kampüs anında karta dokunmak, bizi
> beğenmemiş biri için profili **hiç açmıyor**. Endişe teorik değil, kesin.
>
> **Durum:** `GET /api/campus/moments/{id}/profile` talebi açık ve **blokaj**.
> **İstemcide:** uç gelene kadar davranış bozuk ama sessiz değil — 404'te kart açılmıyor,
> toast çıkıyor (`retry:false`). Uç açılınca tek satırlık değişiklik.

---

## 6. Test hesapları için **UT-7415 (IMPLAUSIBLE_MOVEMENT)** muafiyeti

**Gözlem.** Geliştirme sırasında kampüste olmayı simüle ediyoruz; sunucu son heartbeat'i
gerçek şehirden görüp "400 km'yi 30 saniyede geçmiş" diyor ve paylaşımı reddediyor.
Muafiyetin sunucuda var olduğu söylenmişti ama **bizim userId'lerimiz iletilmedi.**

**Soru/Talep.** Muafiyet hesap bayrağı mı, ortam bazlı mı? Hesap bayrağıysa şu id'lere
açılmasını istiyoruz: **(id listesi buraya)**.

**Neden önemli.** Bu olmadan paylaşım akışının sunucu tarafı yalnız fiilen kampüste
olunarak test edilebiliyor.

> **✅ CEVAP.** Ortam değişkeni: `Campus__TestUserIds__0=<userId>` (`CampusOptions.cs
> :82-104`). Aynı liste hem UT-7415'i atlatıyor hem flag'i açık sayıyor.
> **İkinci kapı:** test hesabı, poligonu olan bir kampüse ait olmak zorunda — poligon
> verisi artık var (`campus-boundaries.json`, 180 domain, hepsi poligonlu; E2E
> dokümanındaki "dosya boş" notu eskimiş).
>
> **BİZDE KALAN İŞ: id listesini göndermek.** ⚠️ 10. maddedeki izolasyon tasarımı bu elle
> yapıştırma işini e-posta desenine bağlayarak ortadan kaldıracak — acil değilse o
> katmanı beklemek daha az bakım demek.

---

## 7. Üniversite koordinatları **canlıya çıkmadı**

**Gözlem.** Talep yanıtlandı (131 kayıt dolduruldu, 31'i ≥1 km düzeltildi) ama
`api.lit.4ourstack.com` hâlâ eski veriyi dönüyor: 131 kayıt `isApproximate: true`,
Sultanahmet yığını 29, `cankaya.edu.tr` hâlâ `39.83, 32.68`. Önbellek değil (`?cb=` +
`no-cache` ile bayt bayt aynı gövde).

**Soru.** Dağıtım ne zaman? Ayrıca iki küçük istek duruyor:
(a) `okan.edu.tr` teyit edilene kadar `isApproximate: true` olsun,
(b) canlıdaki 31 sapmalı kayıt (18 km'ye kadar) şu an `false` damgalı — düzeltilene kadar
`true` olsunlar.

**Neden önemli.** İstemci kapıyı veriye bağlamış durumda (`isApproximate` → zoom 14 / 11);
yanlış `false` damgası kampüsü kadraj dışında bırakıyor. İstemcide yapılacak iş yok.

> **✅ CEVAP: GÖZLEMİMİZ ESKİMİŞ — veri canlıda.** Backend'in ölçümünü **biz de
> doğruladık** (2026-10-29, `/api/common/universities`):
>
> | | bizim eski gözlemimiz | şu an canlı (yeniden ölçüldü) |
> |---|---|---|
> | `isApproximate: true` | 131 | **4** |
> | en kalabalık koordinat | Sultanahmet'te 29 | **3** |
> | `cankaya.edu.tr` | `39.83, 32.68` | **`39.81845, 32.5624`** |
>
> Ölçümümüz deploy'dan (`c5892ce`) önceye aitmiş. **(b) konusuz:** 31 sapmalı kayıt
> düzeltilmiş. **Açık kalan tek şey (a):** `okan.edu.tr` hâlâ `40.83, 29.334` ve
> `isApproximate: false` — teyit edilene kadar `true` olması talebi duruyor.

---

## 8. Akışta **kendi gönderimin avatarı** boş geliyor

**Gözlem.** `author.mainPhotoUrl` kendi gönderilerimizde `null` dönüyor; başkalarının
gönderilerinde dolu.

**Soru/Talep.** Kasıtlı mı? Değilse doldurulsun.

**Neden önemli.** İstemci bir yedek koydu (kendi profil fotoğrafını yerelden çiziyor),
yani ekran bozuk değil — ama yedek, anonim gönderi kuralıyla kesiştiği için ekstra bir
kapı taşıyor. Alan dolu gelirse o katman silinebilir.

> **✅ CEVAP: hata, kasıtlı değil — düzeltilecek.** `FeedQueryService.cs:313` foto
> sorgusundan kendi gönderilerimizi dışlıyor
> (`.Where(r => !r.Post.IsAnonymous && r.Post.AuthorId != viewer.UserId)`), sonra satır
> 336'daki `photos.TryGetValue` ıskalıyor → `PhotosList` boş → `VisibleMainUrl` null.
> Bildirdiğimiz tablonun aynısı. (`/api/feed/posts/mine` etkilenmiyor.)
>
> **İstemcide:** yedek katman (`useOwnFeedAvatar`) **düzeltme canlıya çıkınca silinecek**
> — önce değil; eski sürümlerle konuşan istemci alanı yine null görüyor.

---

## 9. In-app bildirim feed'inde `mode` (IncomingLike talebinin **C** maddesi)

**Gözlem.** A ve B yapıldı (hub guard'ı ve push yönlendirmesi mod ayrımını okuyor). **C**
yapılmadı: `extraData` kalıcı değil, `AppNotification`a kolon + migration gerekiyormuş ve
backend onay bekliyordu.

**Soru.** C yapılacak mı, yapılacaksa ne zaman?

**Neden önemli.** C olmadan bildirim listesindeki eski beğeni satırları mod bilgisi
taşımıyor; kullanıcı Arkadaş modundayken Flört beğenisine dokunup yanlış listeye düşüyor.

> **✅ CEVAP: yapılmadı, hâlâ gerekli.** `AppNotification.cs:134-161` — `Mode` kolonu yok;
> `extraData` hiçbir yerde kalıcı değil, yalnız push payload'ına girip orada kalıyor.
> Durum raporumuz doğruymuş: kolon + migration gerekiyor. **Açık madde.**

---

## 10. E2E otomasyonu — **önce cevaplanması gereken ortam sorusu**

**Gözlem.** İstemcide uçtan uca UI otomasyonu kuruldu (Appium + WebdriverIO, iOS
simülatörü); bot sıfırdan kayıt olup akışları gerçek isteklerle sürüyor.

**Soru.** Bot hangi ortama vursun — prod mu, ayrı bir test ortamı mı? Ayrı ortam varsa
adresi ve test hesabı/temizlik kuralları nedir?

**Neden önemli.** Ayrıntılı ön koşul listesi `backend_e2e_preconditions_2026-10.md`de ama
hepsi bu tek cevaba bağlı: prod'a vuracaksa oluşturulan hesapların silinmesi ve hız
sınırı davranışı ayrı konuşulmalı.

> **✅ CEVAP: PROD — ayrı ortam yok.** Non-prod instance yok, E2E uygulamanın kendi
> `.env`indeki adrese yani üretime vuruyor; `deploy/` altında staging stack'i yok.
> Paylaşımlı sunucu + MSSQL Express 3.5 GB sınırı yüzünden ikinci instance kısa vadede
> masada değil.
>
> Bunun yerine bugün tarihli bir tasarım + uygulama planı açıldı
> (`2026-10-29-e2e-hesap-izolasyonu-design.md`): e2e hesapları **prod'da kalıcı olarak
> izole** edilecek (birbirlerini görsünler, gerçek kullanıcılara hiç görünmesinler), yüz
> kontrolü muafiyeti e-posta desenine bağlanacak, kampüs test muafiyeti de aynı
> işaretçiye — yani **6. maddedeki elle id yapıştırma işi de bitecek**.
>
> **İstemcide:** ön koşul listesinin geri kalanı işlenebilir; cevap "prod, izolasyon
> katmanıyla".
>
> **⚠️🔴 BU CEVABIN BİR YAN SONUCU VAR VE E2E'DEN DAHA ACİL.** Ön koşul dokümanında
> ölçülmüş bir bulgu vardı: `080539` DEV kod bypass'ı bu host'ta çalışıyor
> (`send-verification` → `verify-email` gerçek bir `emailVerifiedToken` döndürüyor). O
> bulgunun iki okuması vardı ve "host dev/staging ise sorun yok" diyorduk. Cevap "host
> üretim" olduğuna göre okuma kesinleşti: **e-posta sahipliği doğrulaması üretimde
> fiilen devre dışı** — adresi bilen herkes o adrese erişmeden hesap açabiliyor.
> Üniversite e-postası bu üründe kimlik kapısının kendisi (kampüs, mod havuzları, okul
> rozeti hepsi ona dayanıyor).
>
> **Soru: bilerek mi açık, değilse kapatılması neye bağlı?** Ayrıntı ve sorular
> `backend_e2e_preconditions_2026-10.md` → **§-1**.

---

## Cevaplardan sonra — kimde ne kaldı

### Backend
| # | İş | Not |
|---|---|---|
| 1 | `deploy/s3-bucket-policy.json`e `campus/*` statement'i | **BLOKAJ** — özellik bunsuz çalışmıyor; kod/deploy gerekmiyor |
| 4 | Reddedilmiş anda `photoUrl: null` | Kararımız "evet"; istemci ölü dizeye karşı zaten korundu |
| 5 | `GET /api/campus/moments/{id}/profile` | **BLOKAJ** — ödünç uç 404 veriyor |
| 7a | `okan.edu.tr` → `isApproximate: true` | Teyit edilene kadar |
| 8 | `FeedQueryService.cs:313` foto sorgusu | Düzeltilecek dendi |
| 9 | `AppNotification.Mode` kolonu + migration | Onay bekliyordu |
| 10 | E2E izolasyon planının uygulanması | Tasarım açıldı |

### İstemci
| # | İş | Durum |
|---|---|---|
| 1-2-3 | — | **Yok.** Policy düzelince görünür; DEV etiketi doğrulamayı yapıyor |
| 4 | Rejected dalı + "Yayınlanamadı" rozeti | **YAPILDI** |
| 5 | Ödünç uç yerine yeni uç | Uç açılınca tek satır |
| 6 | userId listesini göndermek | **BİZDE** — ya da 10'daki e-posta desenini beklemek |
| 7 | — | Yok, kapı veriye bağlı |
| 8 | `useOwnFeedAvatar` yedeğini silmek | Düzeltme **canlıya çıkınca** |
| 9 | Bildirim satırına mod devri | Kolon gelince |
| 10 | E2E ön koşullarının geri kalanı | Başlanabilir |
