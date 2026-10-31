# Kampüs Anları — sözleşme: talep + yanıt + kararlar

**Durum (2026-10-21): KAPANDI.** İki tarafta da açık soru yok. §A kararının üç sonucu
kabul edildi, itirazımız yok — istemci ona göre yazılıyor.

---

## 1. Kapanış: §A kararı ve üç sonucu

### Karar (bizim verdiğimiz)

- **Kampüs `Pass`'i `SwipeAction` satırı YAZMASIN** — öneriniz kabul. Geçmek sınırsız
  olduğu için kullanıcı anlara hızlıca bakarak kendi Keşif havuzunu hiçbir kota
  harcamadan boşaltır, ertesi gün boş destesinin sebebini de göremezdi.
- **Kampüs beğenisinin Keşif destesini kalıcı tüketmesi DOĞRU** — "aynı like" derken
  kastettiğimiz buydu.

Simetrinin bozulması kabul: beğeni kullanıcının **vermek istediği** bir sinyal, geçme
yalnızca "bunu gördüm".

### Üç sonucu da kabul (§A.1)

| sonuç | neden doğru | istemcide |
|---|---|---|
| **`Pass` → `POST /api/campus/moments/{id}/pass`** | `PassHandler`'ın beş yan etkisi de satırdan türüyor. En görüneni "kaçırdığın eşleşme" bildirimi: kullanıcıya **olmayan bir kaybı** duyurup **olmayan bir çözümü** (rewind) gösterirdik. `ImpressionLog` kirlenmesi de gerçek — kampüs anı hiç impression olarak loglanmadı | "Geç" aksiyonu yeni uca gider. **Beğeni yolu hiç değişmiyor** (`/api/swipe/Like` + `source` + `momentId`) |
| **`SwipeAction.Source` + Rewind yalnız `Discovery`** | Bunu biz kaçırmıştık ve **sessiz veri kaybıydı**: kampüsten beğenen premium kullanıcı Keşif'te rewind'e basınca kampüs beğenisi silinir, kampüs-yerel satır kalır → kota harcanmış, an listede yok, beğeni yok. Kullanıcı başka bir kartı geri aldığını sanır | Kampüs kartında **rewind affordance'ı yok**. Zaten tasarımda da yoktu, artık gerekçesi yazılı |
| **`Pass` rate limit'li (`campus_decision`)** | Kotasız bir yazma ucu döngü korumasız kalamaz | `UT-7430` dalı; kullanıcıya görünen bir sınır değil, sessizce geri çekilme |

### Bir gözlem (itiraz değil, bilgi)

Kampüs beğenisinin geri alınamaması + free kullanıcının **günde tek** kararı =
yanlışlıkla verilen bir beğeni 24 saat geri alınamaz. Kabul ediyoruz, çünkü alternatifi
(kampüs kararına undo) kota iadesi + kampüs-yerel satır silme + yeni uç demek.

İstemci tarafında riski azaltan şey zaten var: bu yüzeyde **kaydırma jesti yok**, karar
yalnız butonlardan veriliyor (Keşif'teki aynı karar). Yanlış dokunma olasılığı düşük.
`momentId`'nin idempotency anahtarı olması da çift dokunuşu zararsız kılıyor.

---

## 2. Buna bağlı bir netleştirme (sormamıştınız, biz söylüyoruz)

> ⚠️🔴 **BU BÖLÜM GEÇERSİZLEŞME TALEBİNDE (2026-10-30).** Aşağıdaki süzme kuralını
> isteyen biziz ve **geri alınmasını istiyoruz**: karar verilmiş anlar listede KALSIN,
> yerine DTO'da `canLike: false` gelsin. Gerekçe (kullanıcının tek kararını `UT-7424`
> yiyen birine harcamaması) artık istemcide karşılanıyor — karar verilmiş kartta beğeni
> butonu çizilmiyor. Talebin tamamı: `backend_campus_decided_moments_2026-10-30.md`.

Kararlar ikiye ayrılınca §3'teki "zaten karar verilmiş anlar dönmesin" kuralının hangi
tabloyu okuyacağı belirsizleşiyor. İstediğimiz davranış:

| durum | kampüs listesinde görünsün mü |
|---|---|
| Kampüste **beğendi** | Hayır (kampüs-yerel satır) |
| Kampüste **geçti** | Hayır (kampüs-yerel satır) |
| Keşif'te **beğendi** | **Hayır** — görünürse kullanıcı günlük tek kararını `UT-7424` yiyen birine harcar |
| Keşif'te **geçti** | **Evet, görünsün** — kampüs ayrı bir bağlam ("şu an burada"), Keşif'teki geçme burayı kapatmamalı |

Yani süzme: **kampüs-yerel satır VEYA aynı moddaki mevcut `Like`.** `Pass` satırları
süzmeye hiç girmesin.

---

## 3. Yanıtınızın istemcide neye dönüştüğü

Hepsi uygulandı; bilgi amaçlı.

| konu | sonuç | istemcide |
|---|---|---|
| **§1 poligon yok** | Faz A ~15 pilot kampüs, Faz B kapsam büyür | Değişiklik **gerekmedi** — `polygon: null` dalı zaten ana kapıydı (4 kalıcı `isApproximate` kaydı için). Faz A'da çoğunluk, Faz B'de azınlık olur |
| **alias domain** | Yanıt kanonik domain döner | 🔴 **Bizde hata yakalandı:** poligon önbelleğini yanıttaki `domain` ile anahtarlıyorduk → alias domain'li kullanıcıda her açılış ıska (sessiz hata). Anahtar artık İSTENEN domain, testle çivilendi |
| **soru 1 — Keşif kotası** | Tüketilmiyor | Bu yüzeyde optimistic `remainingSwipes` düşürmesi atlanacak |
| **soru 2 — poligon** | MultiPolygon, ≤120 nokta, sunucuda sadeleştirilmiş | Zaten destekleniyor + testli (delikli poligon ve MultiPolygon dahil) |
| **soru 3 — imza ömrü** | (b): imzasız, tahmin edilemez, 24 saat sabit | `expiresAt` sonrası URL gösterilmiyor (süzme zaten vardı) |
| **soru 4 — silme** | Hak geri gelmiyor | Metin: "Kaldırırsan bugün yeniden paylaşamazsın" |
| **soru 5 — RESTRICTED** | Aynı kısıt, ayrı kod, görmeyi engellemiyor | — |
| **§5 moderasyon düzeltmesi** | UT-63xx yüz kontrolleri içeriyor, kampüste yalnız içerik güvenliği | Yanlış referans koddan temizlendi — o hat bağlansaydı manzara/kedi fotosu olan her an reddedilirdi |
| **§B konum geçmişi** | Geçmiş yok; makullük kontrolü bir hız tümseği | Beklentimiz düzeltildi. `UT-7415`'in kod yorumuna "bu bir yakaladık kodu değil" yazıldı ki ileride kimse ona güvenmesin |
| **UT-7411** | Sınıra uzaklık ≥ accuracy **+ mutlak 100 m tavanı** | Aynı tavan istemciye de eklendi. Olmasaydı "+" çıkar, kullanıcı fotoğrafı seçip kırpar, ancak gönderirken reddedilirdi |
| **yeni kodlar** | `UT-7415`, `UT-7424` | Eklendi; `ALREADY_DECIDED` kartı sessizce düşürüyor |
| **§2 pencere** | Akış penceresi (İstanbul 20:30) | İki kota metinlerde aynı saate bağlanmayacak |
| **§3 kendi anım** | Yalnız ilk sayfada, cursor dışında | Sonraki sayfalarda `isMine` beklenmiyor |

**İstemcide şu an hazır olan:** kampüs sınırı kararının tamamı (poligon + delik +
MultiPolygon + `isApproximate` kapısı + belirsizlik eşiği), UT-74xx ailesi, tipler,
sorgu anahtarları, 32 test. Uçlar indiği an bağlanacak.

---

## 4. Sıra

§2, §3, §7 poligon beklemiyor — onlar çıkar çıkmaz ekranların okuma ve karar yolu
bağlanabilir. §1 kendi faz planıyla ilerlesin; `enabled: false` dalı bizde zaten çalışıyor.

---

---

# Aşağısı talebin ORİJİNAL hâli — dondurulmuş

> Sorular yukarıda cevaplandı; bu bölüm kayıt için duruyor.

**Bağlam:** 2026-10-21'de kampüs koordinatlarını düzelttiniz (203/207 gerçek kampüs). O veri
bu özelliği mümkün kıldı: akış ekranındaki tam ekran kampüs haritasının üstünde, 24 saat
yaşayan tek-fotoğraflık "anlar" ve onlar üzerinden eşleşme. Kampüste olmayan paylaşamıyor.

---

## 0. Ürün kuralları (ürün tarafında karara bağlandı, sözleşme bunlara göre)

| kural | karar |
|---|---|
| Kim paylaşır | O kampüsün öğrencisi (domain) **ve** konumu kampüs sınırları içinde |
| Kim görür | Yalnız o kampüsün öğrencisi. **Görmek için kampüste olmak gerekmiyor** |
| Ömür | 24 saat, sonra kaybolur (arşiv yok) |
| Adet | **Günde 1 foto, değiştirilemez.** Silinebilir |
| Karar | Beğen/geç. Free **günde 1 beğeni**, premium sınırsız. Geçmek sınırsız |
| Filtre | **Yok.** Yaş/cinsiyet/mesafe uygulanmayacak. Tek ayrım **mod** (Dating/Friends) |
| Moderasyon | Hemen yayın, ihlalde düşür (mevcut UT-63xx akışı) |

---

## 1. `GET /api/campus/boundary` — **BLOKLAYICI**

Kampüs merkezlerini OSM kampüs **poligonundan** hesapladığınızı yazmıştınız. İstediğimiz o
poligonun istemciye açılması.

```jsonc
GET /api/campus/boundary          // domain parametresiz = kullanıcının kendi kampüsü
→ {
    "domain": "bogazici.edu.tr",
    "isApproximate": false,
    "circle":  { "lat": 41.08448, "lon": 29.05359, "radiusMeters": 820 },
    "polygon": { "type": "Polygon", "coordinates": [[[29.048,41.083], …]] },
    "version": "2026-10-21T00:00:00Z"
  }
```

### Neden İKİ geometri birden — bu talebin kalbi

- İşletim sistemi geofence'i **yalnız DAİRE** kabul ediyor (iOS `CLCircularRegion`, Android
  `Geofence.setCircularRegion`). Poligon geofence diye bir şey yok.
- Poligon ise tek doğru "kampüsteyim" cevabı. Boğaziçi Güney Kampüs'ü çevreleyen daire
  Bebek'in yarısını içine alıyor.

Tasarım: **daire UYANDIRIR, poligon KARAR VERİR, sunucu DOĞRULAR.** Daire yalnız işletim
sisteminin bizi uyandırma tetiği; kullanıcıya görünen hiçbir karar (push, paylaş butonu,
paylaşımın kabulü) dairenin tek başına sonucu değil.

### Alan notları

- `radiusMeters` **sunucuda [150, 5000]'e kırpılmış** gelsin. iOS 100 m altındaki bölgeleri
  güvenilir izlemiyor; 5 km üstü bir kampüs değil, bir ilçe.
- `polygon` `Polygon` **ya da** `MultiPolygon` olabilir (çok kampüslü üniversite). İstemci
  ikisini de okuyacak — hangisinin geleceğini bilmemiz yeterli.
- **Sadeleştirilmiş gelsin:** ham OSM poligonu 500+ nokta olabiliyor ve istemci her konum
  kontrolünde tarıyor. Douglas-Peucker ~10 m tolerans, **≤120 nokta** ideal.
- `version` monotonik olsun — istemci MMKV'de tutup bayatlığı anlayacak, her açılışta
  poligon çekmeyecek (haftalarca değişmiyor).
- **`isApproximate` ZORUNLU ve özelliğin ana kapısı.** Canlıda hâlâ 4 kayıt il merkezinde
  (`mgu`, `demiroglu.bilim`, `issb`, `topkapi`). O kayıtlarda poligon "il sınırı" olursa
  paylaşım kapısı bütün şehre açılır. Kural: **`isApproximate: true` ya da `polygon: null`
  → sunucu da istemci de özelliği o kampüste KAPALI sayar.** (Haritadaki
  `isApproximate → şehir ölçeği` kapısıyla aynı felsefe.)

### Sorular

1. Çok kampüslü üniversitede poligon hangi kampüs(ler)i kapsıyor — domain'in bağlı olduğu
   kampüs mü, hepsi mi (MultiPolygon)?
2. Sadeleştirme yapılabilir mi, yoksa ham poligon mu dönecek?

---

## 2. `GET /api/campus/me` — **BLOKLAYICI**

`/api/feed/me`nin ikizi: tek istekte kota + kapılar + bugünün durumu.

```jsonc
→ {
    "enabled": true,
    "universityDomain": "bogazici.edu.tr",
    "boundaryVersion": "2026-10-21T00:00:00Z",
    "postedToday": true,
    "myMomentId": "9381",           // null = bugün henüz paylaşmadı
    "quota": {
      "decisionsRemaining": 1,      // -1 = SINIRSIZ (premium)
      "decisionLimit": 1,
      "nextResetAt": "2026-10-22T17:30:00Z"
    },
    "photoMaxBytes": 5242880
  }
```

- `-1 = sınırsız` konvansiyonu istemcide zaten var (`UNLIMITED`), premium'da `-1` dönsün.
- `nextResetAt` ISO+Z; istemci saati **sabit yazmıyor** (akışta "20:30" sabit yazılması
  kazası yaşandı).
- ⚠️ **`isInCampus` alanı İSTEMİYORUZ.** `/me` cache'lenen bir sorgu, konum saniyelik —
  ikisini aynı yanıta koymak bayat bir "kampüstesin" cevabı üretir. Konum her zaman anlık
  okumadan ve paylaşım anındaki sunucu doğrulamasından geliyor.

---

## 3. `GET /api/campus/moments` — **BLOKLAYICI**

```
GET /api/campus/moments?mode=Dating&cursor=<opaque>&pageSize=20
→ { "items": [CampusMomentDto], "nextCursor": "…"|null, "hasMore": true }
```

```jsonc
CampusMomentDto {
  "id": "4471",                 // STRING (mevcut wire kuralı)
  "userId": "8812",             // STRING — swipe hedefi
  "displayName": "Elif",
  "age": 21,                    // null = yaşını gizlemiş
  "photoUrl": "https://…",      // bkz. §4 imza ömrü
  "createdAt": "2026-10-21T09:12:00Z",
  "expiresAt": "2026-10-22T09:12:00Z",
  "mode": "Dating",             // PascalCase
  "isMine": false,
  "moderation": { … }           // KANONİK blok, foto uçlarıyla aynı şekil
}
```

- **Filtre yok, tek ayrım mod.** `mode=Friends` isteği yalnız Friends profilinden atılmış
  anları döndürsün. Parametre verilmezse mevcut sözleşmedeki gibi Dating sayılsın.
- **Dönmeyecekler:** süresi dolmuş · moderasyonda düşmüş (başkasınınki) · kullanıcının
  zaten karar verdiği anlar. Üçü de dönerse kullanıcı günde 1 olan hakkını zaten
  karar verdiği birine harcar.
- **Kendi anım dönsün** — `isMine: true` ile ve listenin **başında**. Moderasyonda düşmüş
  olsa bile kendi anım `moderation` bloğuyla dönsün ki neden görünmediğini bilsin.
- Sıralama `createdAt` DESC. Skor/popülerlik yok.

---

## 4. Foto yükleme — presigned S3

```
POST /api/campus/moments/upload-url   { "contentType": "image/jpeg", "sizeBytes": 318244 }
→ { "uploadUrl": "https://…", "objectKey": "campus/…", "expiresAt": "…" }
```

Sesli mesajdaki (`/api/messages/upload-url`) kalıbın aynısı — istemcide hazır, multipart
yoluna göre daha ucuz.

⚠️ **İmzalı OKUMA ömrü — atlanması kolay ama kritik.** Sesli mesajdaki 15 dakikalık imza
buraya UYMUYOR: an 24 saat yaşıyor, liste disk cache'inde tutuluyor ve cache anahtarı
URL'in kendisi. 15 dakikada bir yeni URL istemek her kart için ayrı istek demek. İki
seçenekten biri:

- **(a) tercih edilen:** `photoUrl`, anın `expiresAt`inden sonra biten tek imzalı URL
  (≥25 saat).
- (b) CDN üstünden imzasız ama tahmin edilemez (opak key) yol.

---

## 5. `POST /api/campus/moments` — **sunucu tarafı konum doğrulaması**

```jsonc
POST /api/campus/moments
{
  "objectKey": "campus/…",
  "mode": "Dating",
  "latitude": 41.08510, "longitude": 29.05030,
  "accuracyMeters": 12.4,
  "isMocked": false,
  "capturedAt": "2026-10-21T09:11:58Z"
}
```

> ### Bu bölüm sözleşmenin en önemli kısmı
>
> "Kampüsteyim" kontrolü **hem istemcide hem sunucuda** yapılacak, ama **otorite sunucu.**
> İstemcideki kontrol yalnız arayüz kararı: paylaş butonunu çizip çizmemek. Bir istemci
> kontrolü jailbreak'li cihazda, konum sahteciliği uygulamasıyla ya da basitçe HTTP
> isteğini elle kurarak atlatılır.
>
> **iOS mock konum bayrağı VERMİYOR** (Android `isMocked` veriyor). Yani istemciden gelen
> "sahte değil" bilgisi iOS'ta hiçbir şey kanıtlamıyor. Sunucunun reddetmesi gereken
> durumlar:

| kontrol | kod |
|---|---|
| Nokta poligon dışında | `UT-7410 OUT_OF_CAMPUS` |
| `accuracyMeters` kampüsün iç yarıçapından büyük (içeride olduğu kanıtlanamıyor) | `UT-7411 LOW_ACCURACY` |
| `isMocked: true` | `UT-7412 MOCKED_LOCATION` |
| `capturedAt` şimdiden >60 sn sapmış | `UT-7413 STALE_FIX` |
| Kampüs poligonu yok / `isApproximate` | `UT-7414 CAMPUS_UNAVAILABLE` |
| Bugün zaten paylaşılmış | `UT-7403 ALREADY_POSTED_TODAY` |

**Ek olarak makullük kontrolü istiyoruz:** `POST /api/profile/location` heartbeat geçmişi
sizde duruyor. Son heartbeat'i 400 km uzakta olan bir kullanıcının 30 saniye sonra kampüste
bitmesi fiziksel değil. iOS'ta mock bayrağı olmadığı için **tek gerçek savunma bu.**

---

## 6. `DELETE /api/campus/moments/{id}`

Günde 1 foto, değiştirilemez — ama silinebilir.

🔴 **Karara bağlanması gereken:** silmek günün hakkını geri veriyor mu?
**Önerimiz: hayır** (`postedToday` true kalsın). Aksi hâlde "sil + yeniden at" sonsuz bir
değiştirme kanalı olur ve "değiştirilemez" kuralı anlamını yitirir. İstemci metni de buna
göre yazılacak ("Kaldırırsan bugün yeniden paylaşamazsın"), o yüzden cevabınızı bekliyoruz.

---

## 7. Karar — **mevcut `/api/swipe/*` uçlarının genişletilmesi** (BLOKLAYICI)

Ürün kararı net: *bu yüzeydeki beğeni, karttaki beğeninin aynısı olsun.* Yani karar
`POST /api/swipe/Like` ve `POST /api/swipe/Pass`a gidecek; eşleşme, Beğeniler ekranı,
`MatchNotification` → eşleşme modali **birebir aynı** kalacak. Yeni bir eşleşme türü
İSTEMİYORUZ.

Tek sorun: sunucu isteğin bu yüzeyden geldiğini bilmezse günde 1 karar kotasını zorlayamaz.
**Talebimiz gövdeye iki opsiyonel alan:**

```jsonc
POST /api/swipe/Like
{ "targetUserId": "8812", "swipeType": "like", "mode": "Dating",
  "source": "CampusMoment",     // ← YENİ, opsiyonel. Yoksa bugünkü davranış aynen.
  "momentId": "4471" }          // ← YENİ, opsiyonel (denetim + idempotency)
```

Beklenen davranış:

1. Swipe satırı **bugünküyle aynı** yazılsın — karşılıklı beğenide aynı eşleşme, aynı
   `MatchNotification`.
2. `source == "CampusMoment"` iken **kampüs günlük karar kotası** uygulansın (free 1,
   premium sınırsız). Dolunca `isSuccess: false` + `UT-7420 DECISION_QUOTA` **ve**
   `showPaywall: true` + `paywallType: "CAMPUS_LIKE_LIMIT"`. (Akış kotasının aksine bu hak
   Plus'la kalkıyor, yani gerçek paywall.)
3. **`Pass` kotasız** — geçmek sınırsız.
4. 🔴 **CEVAP BEKLEYEN SORU: Keşif'in günlük `remainingSwipes` kotası tüketilsin mi?**
   - "Tüketilmesin" ise istemci optimistic sayaç düşürmesini bu yüzeyde atlayacak.
   - "Tüketiliyor" ise kullanıcıya iki ayrı kota göstermek yanıltıcı olur, ürün tarafında
     yeniden konuşmamız gerekir.
   Hangi cevabı verirseniz verin **istemci ona göre yazılacak** — bilinmeden yazılırsa
   kullanıcı Keşif sayacının gözle düştüğünü görüp hakkını kaybettiğini sanar.
5. `momentId` verildiyse ve o an silinmiş/süresi dolmuşsa `UT-7421 MOMENT_GONE`.

**`/Like` gövdesini genişletmek mümkün değilse** alternatif
`POST /api/campus/moments/{id}/decision { "decision": "Like" }` — ama o zaman
eşleşme/Beğeniler/eşleşme modali yolunun birebir aynı kaldığının yazılı garantisi gerekir.
Ürün kararı birinci seçeneği istiyor.

---

## 8. Push — `POST /api/campus/presence`

```jsonc
POST /api/campus/presence
{ "state": "Enter", "latitude": …, "longitude": …, "accuracyMeters": …,
  "isMocked": false, "capturedAt": "…" }
→ { "inCampus": true, "momentCountToday": 7 }
```

İstemci kampüs sınırına girdiğinde (uygulama kapalıyken de — geofence) bunu çağıracak.
**Bildirim kararı sizde, cihazda yerel bildirim değil.** Üç sebep:

1. Bildirim ancak **görülecek bir şey varsa** anlamlı: "bugün kampüste 7 an var". Cihaz kaç
   an olduğunu bilmiyor. **Öneri: `momentCountToday == 0` ise push atmayın** — boş bir
   yüzeye davet eden bildirim, bildirim kapattıran en hızlı şeydir.
2. Sınırlama sunucu işi. **Öneri: kampüs başına günde 1 push.** Kampüse günde altı kez
   giren öğrenci altı bildirim almamalı.
3. `campusAlerts` tercihi (§10) sizde duruyor.

Yeni bildirim tipi: **`CampusMomentsNearby`**, `data.campusDomain` alanıyla.
(`relatedEntityId` kullanılmıyor — istemci dedupe anahtarına `campusDomain`ı ekleyecek.)

---

## 9. Hata kodu ailesi — **UT-74xx**

UT-62xx rezerve/yasak, UT-73xx akış dolu. UT-74xx boş:

```
UT-7401 DISABLED                 403   özellik kapalı
UT-7402 PROFILE_INCOMPLETE       403
UT-7403 ALREADY_POSTED_TODAY     409
UT-7404 PHOTO_REJECTED           400   moderasyon senkron reddi
UT-7405 PHOTO_TOO_LARGE          400
UT-7406 INVALID_UPLOAD_KEY       400
UT-7407 RESTRICTED               403   (akış kısıtıyla aynı kısıt mı? — soru)
UT-7410 OUT_OF_CAMPUS            403
UT-7411 LOW_ACCURACY             400
UT-7412 MOCKED_LOCATION          403
UT-7413 STALE_FIX                400
UT-7414 CAMPUS_UNAVAILABLE       404
UT-7420 DECISION_QUOTA           403   + showPaywall
UT-7421 MOMENT_GONE              404
UT-7422 OWN_MOMENT_DECISION      400
UT-7430 RATE_LIMITED             429
```

Mevcut kurallar geçerli: `message` kullanıcının dilinde ve gösterime hazır gelsin (istemci
i18n'i yedek), **switch her zaman `code` üzerinden** — HTTP status üzerinden asla.

---

## 10. Bildirim tercihi

`GET/PUT /api/notifications/preferences` → yeni boolean **`campusAlerts`** (varsayılan
`true`). ⚠️ Moderasyon/kaldırma bildirimleri bu anahtardan **muaf** olsun — kullanıcı
tercihi kapatsa da fotosunun kaldırıldığını duymalı (`photoModerationAlerts`taki aynı özen).

---

## 11. SignalR — yeni event gerekmiyor

- Eşleşme zaten `MatchNotification` ile geliyor; `source` farkı eşleşmeyi değiştirmediği
  için o yol hiç dokunulmadan çalışıyor.
- Moderasyon düşüşü için mevcut **`PhotoModerationChanged`** yeniden kullanılsın. Payload'da
  moment id taşınabilirse istemci tek kartı yamar; taşınmazsa listeyi tazeler — ikisi de
  kabul.
- "Yeni an paylaşıldı" canlı event'i **istemiyoruz** — hem gürültü hem boşuna soket trafiği.

---

## İstemcide hazır olan / devam eden

- Kampüs sınırı kontrolü (point-in-polygon, `MultiPolygon` + `isApproximate` kapısı dahil)
  ve testleri — poligon formatı netleştiği an bağlanacak.
- UT-74xx kod ailesi ve tipler.
- Tam ekran harita, "+" butonunun yeri, alttan açılan modal tasarımı.
- Geofence + Always izni akışı (yeni native bağımlılık, tek rebuild'e bağlı).

## Cevap bekleyen sorular (özet)

1. **§7/4 — kampüs beğenisi Keşif kotasını tüketiyor mu?** (en kritik)
2. §1 — çok kampüslü üniversitede poligon hangi kampüs? Sadeleştirme yapılabilir mi?
3. §4 — imzalı okuma ömrü ≥25 saat olabilir mi?
4. §6 — silmek günün hakkını geri veriyor mu? (önerimiz: hayır)
5. §9 — `UT-7407 RESTRICTED` akıştaki kısıtla aynı kısıt mı, ayrı mı?

## Aciliyet

§1, §2, §3, §7 **bloklayıcı** — bunlar gelmeden ekran bağlanamıyor. §4-§6 paylaşım yolunu,
§8-§10 push yolunu açıyor; ikisi de paralel ilerleyebilir.

---

## Ek talep (2026-10-22): "an paylaşabilirsin" bildirimi

**Ne isteniyor:** kullanıcı kampüse girdiğinde ve **o gün henüz an paylaşmamışsa**
bir bildirim gelsin, içeriği "an paylaş" olsun.

Bugünkü `CampusMomentsNearby` bunu karşılamıyor: o bildirim **"bakılacak an var"**
diyor ve `momentCountToday > 0` koşuluyla atılıyor. Yani kampüse ilk varan kişi —
yani paylaşımı başlatacak kişi — **hiçbir bildirim almıyor**. Yüzeyin boş kalmasının
en olası sebebi tam bu: ilk anı paylaşacak kişiye haber gitmiyor.

### İstemci tarafı hazır, değişiklik gerekmiyor

- `POST /api/campus/presence` **zaten** `state: "Enter"` + poligonla doğrulanmış
  koordinatla çağrılıyor (geofence görevinden; sınır doğrulaması cihazda da yapılıyor,
  daire yalnız uyandırıyor).
- Yönlendirme kurulu: `CampusMomentsNearby` → akış + tam ekran harita + anlar sheet'i.
- **Metin istemcide YAZILMIYOR**: `title` + `body` sunucudan geldiği gibi basılıyor
  (projenin kuralı). Yani bu bildirimin sözleri sizde.

### İki seçenek — tercihimiz (2)

1. **Yeni tip** `CampusMomentPrompt`. Temiz ama istemcide union + yönlendirme +
   dedupe anahtarı + `CAMPUS_NOTIFICATION_TYPES` güncellemesi gerekiyor.
2. **Mevcut tipin ikinci bir gerekçesi** — `CampusMomentsNearby` korunur, sunucu
   `momentCountToday === 0 && !postedToday` iken de atar ve **metni ona göre seçer**
   ("kampüstesin, ilk anı sen paylaş"). İstemcide **hiçbir değişiklik gerekmiyor**:
   yönlendirme aynı ekrana gidiyor ve metin zaten sizden geliyor.

(2)'yi öneriyoruz. Tek karşı argüman bildirim istatistiklerinde iki niyetin aynı tipte
toplanması; gerekiyorsa payload'a ayırt edici bir alan ekleyin, istemci onu okumasa da
olur.

### Koşullar (ikisinde de aynı)

| koşul | sebep |
|---|---|
| `state === "Enter"` ve poligonla doğrulanmış | daire kampüs yanındaki mahalleyi de kapsıyor |
| `postedToday === false` | paylaşmış kullanıcıya "paylaş" demek anlamsız; hak günde 1 |
| kampüs başına **günde en fazla 1** | kampüse gün içinde birkaç kez girip çıkmak normal (ders arası) |
| `campusAlerts` tercihi açık | kullanıcının kapatma hakkı |
| yüzey o kampüste açık (`enabled`, `!isApproximate`) | kapalı kampüste bildirim = olmayan bir özelliğin reklamı |

⚠️ **Günde 1 sınırı `CampusMomentsNearby` ile PAYLAŞILMALI, ayrı sayılmamalı:** aynı
gün hem "paylaş" hem "bakılacak an var" gitmesi iki bildirim demek ve ikincisinin
değeri birincisini aşmıyor.

### Test için gereken: makullük kontrolü muafiyeti

Geliştirici tarafında kampüse gitmeden test edebilmek için istemciye **DEV-only** bir
konum simülasyonu eklendi (release'de kod ölü): konum kampüsün merkezine —
`GET /api/campus/boundary` yanıtındaki `circle.lat/lon`'a — sabitleniyor, yani
`POST /moments` ve `POST /presence` gövdesine kampüsün koordinatı yazılıyor ve
**UT-7410 (OUT_OF_CAMPUS) aşılıyor**.

Aşılamayan tek şey **UT-7415 (IMPLAUSIBLE_MOVEMENT)**: sunucu son heartbeat'i
geliştiricinin gerçek şehrinden görüyor ve "400 km'yi 30 saniyede geçmiş" diyor.

**Talep:** test hesapları için makullük kontrolünü atlayan bir muafiyet (hesap bayrağı
ya da ortam bazlı). Hangisi size uygunsa. Bu olmadan paylaşım akışının sunucu tarafı
yalnız fiilen kampüste olunarak test edilebiliyor.

### Hatırlatma: yüzey bayrağı hâlâ kapalı

`GET /api/campus/me` → `enabled: false` dönüyor, yani istemcide sheet hiç açılmıyor.
Test hesaplarımızda açılması ilk sırada — bildirim talebinin de, paylaşım akışının da
önkoşulu.

---

# EK — 2026-10-29: `photoUrl` **403 veriyor**, §4 uygulanmamış

Paylaşım akışının tamamı çalışıyor (upload-url → S3 PUT → `POST /moments` → liste),
**ama hiçbir anın fotoğrafı gösterilemiyor.** Kart çiziliyor, ad/saat doğru, yerinde
yalnız boş bir zemin duruyor.

## Kanıt

İstemciye DEV-only bir teşhis kondu (`CampusMomentCard`, release'de çizilmiyor) ve kartın
üstünde şunu yazdı:

```
YÜKLENEMEDİ
Download marked as failed because of invalid response status code 403
https://universitytinder-media.s3.us-east-1.amazonaws.com/…
```

Yani `photoUrl` **kovanın çıplak nesne adresi**. Kova gizli olduğu için GET 403 dönüyor.
Fotoğraf paylaşıldıktan **4 dakika sonra** denendi — "imza süresi doldu" ile
açıklanamaz; adres zaten imza taşımıyor.

## İstenen (yeni bir şey değil — §4'ün kendisi)

`GET /api/campus/moments` ve `POST /api/campus/moments` yanıtlarındaki `photoUrl`
**okunabilir** olmalı, iki seçenekten biriyle:

- **(a) tercih edilen:** presigned **GET** URL, ömrü anın `expiresAt`ini AŞSIN (≥25 saat).
  ⚠️ Yükleme için verilen presigned **PUT** URL'i okumaya yaramıyor; ayrı imza gerekiyor.
- (b) nesneleri CDN üstünden imzasız ama tahmin edilemez (opak key) servis etmek.

Kısa ömürlü imza (ör. 15 dk) **işe yaramaz**: an 24 saat yaşıyor, liste disk cache'inde
duruyor ve cache anahtarı URL'in kendisi — kart birkaç saat sonra kendiliğinden kararır.
Gerekçenin tamamı §4'te.

## Doğrulama

Aynı teşhis etiketi düzeltmeden sonra imzayı özetliyor (`host` + `X-Amz-Signature` var mı
+ `X-Amz-Expires`), yani tek bir açılışta hem 403'ün bittiği hem de ömrün yeterli olduğu
görülebiliyor. Beklenen: imza VAR ve `X-Amz-Expires ≥ 90000` (25 saat).

## İstemci tarafında ne yapıldı

Hiçbir şey — yapılamaz, imzayı istemci atamaz. Yalnız iki şey eklendi:
1. göreli/boş `photoUrl` gelirse artık API tabanına bağlanıyor (bu vaka DEĞİL, adres
   mutlak geliyordu),
2. yukarıdaki DEV teşhisi — bu rapor onun çıktısı.

## ⚠️ Hangi seçenek seçilirse seçilsin: **URL'İN KENDİSİ SABİT KALMALI**

İstemcide fotoğrafın disk cache anahtarı **URL dizesinin kendisi** (expo-image). Presigned
yolunda (a) imza HER YANITTA yeniden üretilirse `X-Amz-Date`/`X-Amz-Signature` değişir →
aynı fotoğraf her liste tazelemesinde **yeni bir dosya** sayılır ve baştan indirilir. Anlar
şeridi her harita açılışında tazeleniyor, yani bu pratikte "cache yok" demek.

İstenen: bir anın `photoUrl`i, anın ömrü boyunca **birebir aynı dize** olsun — imza kayıt
anında bir kez üretilip saklansın (ya da deterministik üretilsin), her istekte yeniden
imzalanmasın. Seçenek (b) (opak key'li CDN yolu) bu sorunu tanım gereği taşımıyor; bu
yüzden mümkünse **(b) tercih edilir.**
