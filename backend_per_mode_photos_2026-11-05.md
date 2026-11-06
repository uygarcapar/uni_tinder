# Mod başına fotoğraf — Flört ve Arkadaş profilleri ayrı fotoğraf taşısın (talep, 2026-11-05)

**Ürün kararı:** Kullanıcı Flört profilinde başka, Arkadaş profilinde başka fotoğraflar
kullanabilsin. Mod değiştirirken (ya da bir modu ilk kez açarken) o modun fotoğraflarını
seçsin.

Bu doküman **yeni bir alan ailesi** istiyor. Önce neden mevcut iki kalıptan birini aynen
izlediğini anlatıyor, sonra uç uç sözleşmeyi veriyor.

Kardeş doküman: `backend_feed_friends_only_2026-11-05.md` (akışın Arkadaş'a özel olması)
— ayrı iş, bağımlılık yok.

---

## 0. Kalıp — bu sistemde mod başına veri İKİ FARKLI şekilde taşınıyor

Bugün mod başına olan iki alan var (`prompts` ve niyet) ve ikisi de **iki ayrı şekil**
kullanıyor. Fotoğrafın da ikisini birden izlemesi gerekiyor, birini seçmesi değil:

| Taraf | Şekil | Gerekçe (mevcut koddan) |
|---|---|---|
| **İzleyici / kart okuma** (`ProfileCardDto`) | **Çökmüş.** Tek alan (`prompts`), içeriği `?mode=` parametresine göre değişiyor. | İzleyici karşı tarafın hangi modlarının açık olduğunu ÖĞRENMEMELİ — `EnabledMeetModes` bilerek hiçbir DTO'da dönmüyor, dönerse kimin flört piyasasında olduğu kampüse sızar. |
| **Sahip okuma/yazma** (`GET /api/profile`, `UpdateProfile`) | **Kardeş alanlara ayrık.** `Prompts` + `FriendsPrompts`, `RelationshipIntent` + `FriendshipIntents`. | `promptPayload.ts:30-40`: *"İKİ AYRI AD, tek alanda mod etiketi DEĞİL. Sunucuda her alan kendi modunun satırlarını FULL-REPLACE ediyor ve multipart'ta 'boş liste' ile 'alan gönderilmedi' ayırt edilemiyor — tek alan + `Mode` etiketi olsaydı, alanı tanımayan ESKİ bir istemcinin güncellemesi karşı modun cevaplarını sessizce silerdi."* |

**Fotoğraf için talebimiz bu ayrımın birebir aynısı.** Aşağıdaki A (izleyici) ve B (sahip)
bölümleri bundan türüyor.

⚠️ Fotoğrafın mod başına olacağı hiçbir mevcut dokümanda öngörülmemişti —
`two_mode_frontend_plan_2026-10.md`'de "foto/photo" geçmiyor, üstelik editörün kendi
yorumu bugün fotoğrafı **ortak alan** ilan ediyor (`EditProfileForm.tsx:1455-1462`:
*"Ortak alanlar (isim, fotoğraf, boy, yaşam tarzı) MODA GÖRE DEĞİŞMİYOR"*). Yani prior art
yok; yalnız izlenecek bir kalıp var.

---

## 1. (A) İzleyici tarafı — `ProfileCardDto.photos` MODA GÖRE dolsun

### Bugün

`ProfileCardDto` (= `PotentialMatch`) fotoğrafı **düz URL dizisi** olarak taşıyor —
`photoId` yok, `order` yok, moderasyon bloğu yok:

```ts
// src/shared/types/index.ts:591-625
export interface PotentialMatch {
  userId: string;
  displayName: string;
  profileImageUrl?: string;   // ana foto
  ...
  photos?: string[];          // photos[0] ANA FOTO (her yerde böyle varsayılıyor)
}
```

Aynı DTO üç uçta kullanılıyor: `GetPotentialMatches`, `WhoLikedMe`, `MissedMatches`, artı
`LikerProfile/{id}` ve akışın `author-profile`ı.

### Talep

**Yeni alan İSTEMİYORUZ.** Bu uçların hepsi `mode` parametresini zaten taşıyor
(`swipeService.ts:49-58`); sunucu `photos[]` ve `profileImageUrl`i **o modun fotoğraf
setinden** doldursun. İstemcide tek satır değişmez.

```
GET /api/swipe/GetPotentialMatches?...&mode=Friends
  → photos[] = kullanıcının ARKADAŞ fotoğrafları, photos[0] = o modun ana fotosu

GET /api/swipe/LikerProfile/{id}?mode=Dating
  → photos[] = FLÖRT fotoğrafları
```

⚠️ **`mode` gelmezse Dating** — mevcut sözleşmenin aynısı (`swipeService.ts:50-52`). Eski
istemci hiçbir şey fark etmez, bugünkü davranışı alır.

---

## 2. (B) Sahip tarafı — `friends` önekli kardeş alanlar

### 2.1 Okuma: `GET /api/profile`

Bugün tek liste dönüyor: `photosList[]`. Öğeler (TS tipi YOK, hepsi `any` — alanlar
yalnız okuma yerlerinden biliniyor):

```jsonc
"photosList": [
  {
    "photoId": 123,                  // number; istemci her yerde String()'e çeviriyor
    "photoImageUrl": "https://…",
    "order": 1,                      // 1 TABANLI
    "isMainPhoto": true,
    "moderation": { … },             // kanonik blok, ASLA null gelmez
    "updatedAt": "…"                 // opsiyonel, yalnız cache-bust için
  }
]
```

**Talep:** kardeş alan eklensin, `friendsPrompts`in yanındaki aynı isimlendirme:

```jsonc
"photosList":        [ … ],   // FLÖRT profilinin fotoğrafları (bugünkü alan, anlamı daralıyor)
"friendsPhotosList": [ … ]    // ARKADAŞ profilinin fotoğrafları — AYNI öğe şekli
```

⚠️ `photosList`in anlamının daralması **eski istemcilerde davranış değiştirmiyor**: eski
sürüm zaten tek liste görüyordu ve o liste Flört'ünki olarak kalıyor. Göç kuralı §5'te.

⚠️ `friendsPhotosList` **hiç gelmezse** istemci "Arkadaş'ın ayrı fotoğrafı yok" diye
okur ve `photosList`i gösterir — eksik alanın yeni bir kısıt uydurmaması kuralı
(`backend_friends_same_gender_2026-11.md` §7'deki aynı özen).

### 2.2 `photoId` GLOBAL benzersiz kalsın

İstemci fotoğraf URL'ine `?v=<photoId>-<timestamp>` ekliyor çünkü backend aynı kaydın
dosyasını **yerinde** değiştirebiliyor ve URL tek başına cache anahtarı değil
(`photoUri.ts:30-54`). İki mod arasında `photoId` çakışırsa bu anahtar çöker ve kullanıcı
yanlış modun fotoğrafını görür.

**`photoId` hesap genelinde benzersiz olsun, mod başına 1..6 diye yeniden başlamasın.**

### 2.3 Yazma: `PUT /api/profile/UpdateProfile`

Bugün dört multipart alanı var ve hepsi tek istekte gidebiliyor:

| alan | şekil | iş |
|---|---|---|
| `NewPhotos` | tekrarlı dosya parçaları | yükleme (listenin SONUNA ekleniyor) |
| `PhotoIdsToDelete` | photoId dizisi | silme |
| `PhotoOrders[i].PhotoId` / `.NewOrder` | indeksli çift, `NewOrder` **1 tabanlı** | sıralama — **TAM LİSTE**, kısmi yok |
| `NewMainPhotoId` | tek photoId | ana foto |

**Talep: dördünün `Friends` önekli ikizi.**

```
NewPhotos                 ·  FriendsNewPhotos
PhotoIdsToDelete          ·  FriendsPhotoIdsToDelete
PhotoOrders[i].*          ·  FriendsPhotoOrders[i].*
NewMainPhotoId            ·  FriendsNewMainPhotoId
```

⚠️ **TEK ALAN + `Mode` ETİKETİ İSTEMİYORUZ** ve sebebi somut: multipart'ta "boş liste" ile
"alan hiç gönderilmedi" ayırt edilemiyor. Tek alan olsaydı, bu alanları tanımayan **eski
bir istemcinin** sıradan bir profil güncellemesi karşı modun fotoğraflarını sessizce
silerdi. Prompt'larda tam olarak bu gerekçeyle iki ayrı ad seçilmişti; `PhotoOrders` zaten
indeksli multipart anahtarının repo içindeki adlandırılmış örneği (`promptPayload.ts:7-8`).

⚠️ **ALAN YOKSA O MOD HİÇ DOKUNULMAZ.** "Hepsini sil" diye bir hâl olmamalı — zaten
`UT-6304` (asgari foto) onu engelliyor, ama kural açıkça yazılsın.

### 2.4 Yanıt

Bugün `result = { profile, photos }` ve şekil koşulsuz (`profileService.ts:150-161`:
*"foto gönderilsin gönderilmesin"*). `photos[]` yüklenen fotoğrafların moderasyon
bloklarını taşıyor.

**Talep:** `photos[]` **hangi modun** fotoğrafları olduğunu söylesin. İki seçenek, ilki
tercihimiz:

1. Öğeye `mode: "Dating" | "Friends"` eklensin (düz, karışma yok).
2. Yanıt `photos` + `friendsPhotos` diye ayrılsın (okuma tarafıyla simetrik).

İstemci yüklenen fotoğrafın moderasyon sonucunu doğru listeye yazmak zorunda; bugün tek
liste olduğu için soru yoktu.

---

## 3. Moderasyon, görünürlük ve kota

### 3.1 Moderasyon FOTOĞRAF başına, mod başına DEĞİL

Kanonik `moderation` bloğunun mod boyutu yok ve olmasına gerek de yok: ret sebepleri
(`explicit_content`, `violence`, `main_photo_no_face` …) fotoğrafın kendisine ait.

**Talep:** blok olduğu gibi kalsın. Ama bir soru doğuyor — §6 soru 2.

### 3.2 Ana foto kuralı HER MODDA ayrı işlesin

Bugünkü kurallar (`photoModeration.ts:3-9`, `ProfileScreen.tsx:1875-1884`):
- ana foto **tek yüz** taşımak zorunda (`UT-6301`/`UT-6302`), yan fotolar serbest;
- yalnız **görünür** (`isVisibleToOthers`) bir foto ana yapılabilir;
- ana foto değişimi **`isSelfieVerified`i sıfırlıyor**.

**Talep:** üç kural da her modun kendi setinde ayrı ayrı işlesin. Üçüncüsü için karar
gerekiyor — §6 soru 3.

### 3.3 Görünürlük (`profileVisibility`) mod başına olmalı

`profileVisibility` bugün hesap seviyesinde tek:

```ts
{ state, visiblePhotoCount, requiredPhotoCount, reasonCode }
```

Mod başına fotoğrafla bu **belirsizleşiyor**: Flört'te 4 yayında fotoğrafı varken
Arkadaş'ta 1 tane olan kullanıcının `state`i ne? Bugün `HiddenInsufficientPhotos` tüm
profili gizliyor — oysa doğru davranış **yalnız Arkadaş destesinden düşmesi**.

**Talep:** `profileVisibility` mod başına dönsün. Şekil tercihimiz, mevcut kalıba sadık:

```jsonc
"profileVisibility":        { … },   // Flört (bugünkü alan)
"friendsProfileVisibility": { … }    // Arkadaş
```

⚠️ Alan gelmezse istemci bugünkü tek-blok davranışını sürdürür.

### 3.4 Azami/asgari sayı mod başına

`MAX_PROFILE_PHOTOS = 6` ve asgari (`requiredPhotoCount`, varsayılan 2) **her mod için
ayrı** sayılsın — yani kullanıcı toplam 12 fotoğraf taşıyabilir. Aksi (6'yı paylaşmak)
iki modu birbirinin rakibi yapar ve ürün kararının amacını bozar.

`UT-6303` / `UT-6304` mesajları zaten `{{max}}` / `{{min}}` interpolasyonlu, metin
değişmeden çalışır.

---

## 4. Mod başına fotoğrafın BELİRSİZLEŞTİRDİĞİ düz foto alanları

Aşağıdaki alanların hepsi tek bir foto URL'i taşıyor ve mod boyutu yok. Çoğu zaten mod
taşıyan bir bağlamda olduğu için sunucu çözebilir; **sorunlu olan ikisini işaretledik.**

| Alan | Nerede | Çözüm |
|---|---|---|
| `PotentialMatch.profileImageUrl` / `photos[]` | deste, WhoLikedMe, MissedMatches, LikerProfile | ✅ uç zaten `?mode=` alıyor → §1 |
| `FeedAuthorDto.mainPhotoUrl` | akış satırı | ✅ akış artık Arkadaş → Arkadaş fotosu |
| `CampusMomentDto.mainPhotoUrl` | kampüs anı avatarı | ✅ kampüs artık Arkadaş → Arkadaş fotosu |
| `IncomingLikeDto.likerPhotoUrl` | gelen beğeni (SignalR + push) | ⚠️ DTO'da `mode` **var** (`backend_incoming_like_mode_2026-10.md`) → o modun fotosu olsun |
| `MatchNotification` eşleşme fotosu | eşleşme modalı | ⚠️ olayda `mode` var → o modun fotosu olsun |
| **`ConversationListItemDto.partnerProfileImageUrl`** | **sohbet listesi avatarı** | ❗ **EN KESKİN BOŞLUK** — aşağıda |
| `LikerNote.target.photoUrl` | notun yazıldığı foto | ❗ anlık görüntü — aşağıda |

### 4.1 Sohbet listesi avatarı

`ConversationListItemDto` **`mode` alanını zaten taşıyor** (sohbetler mod başına ayrı,
`UNIQUE(A,B,Mode)`). Yani çözüm hazır: `partnerProfileImageUrl` o sohbetin modundaki ana
fotoyla doldurulsun. Yapılmazsa Arkadaş sohbetinde kullanıcının Flört fotosu görünür —
mod başına fotoğrafın en görünür kaçağı burası olur.

### 4.2 Nota konu olan fotoğraf

`LikerNote.target.photoUrl` zaten **gönderim anında dondurulmuş bir anlık görüntü**
olmalı (`noteTarget.ts:12-16`: *"`photoIndex` GÖNDERİM anahtarı, KALICI kimlik değil"*).
Mod başına fotoğrafla bu daha da kritik: notu yazan kişi **o modun** fotoğrafına yazdı ve
alıcı aynı kareyi görmeli, kullanıcı sonradan o modun fotolarını değiştirse bile. Mevcut
anlık-görüntü kuralı korunursa ek iş yok — **korunduğunu teyit edin.**

---

## 5. Göç ve geriye uyum

1. **Mevcut fotoğraflar Flört'ün sayılsın.** `photosList` olduğu gibi kalır,
   `friendsPhotosList` başlangıçta boştur.
2. **Arkadaş'ı AÇIK olan mevcut kullanıcılar.** Arkadaş profilleri bir anda fotoğrafsız
   kalmamalı — yoksa `HiddenInsufficientPhotos`a düşer ve sessizce Arkadaş destesinden
   çıkarlar. İki seçenek, ilki tercihimiz:
   - **Flört fotoğrafları Arkadaş'a KOPYALANSIN** (aynı dosyalar, yeni `photoId`ler ya
     da paylaşılan kayıt — §6 soru 2). Kullanıcı bugünküyle aynı yerde başlar, isterse
     değiştirir. Hiç kimse görünürlük kaybetmez.
   - `friendsPhotosList` boş geldiğinde sunucu **okuma anında** Flört'e düşsün (lazy).
     Veri kopyalamaz ama "hangi set gerçek" sorusunu her çağrıda yeniden sorar.
3. **Eski istemci sürümleri** yeni alanların hiçbirini göndermiyor → yeni alanlar hiç
   dokunulmuyor (§2.3 kuralı) → eski sürüm Flört fotoğraflarını düzenlemeye devam eder,
   Arkadaş seti olduğu gibi kalır. **Kırılma yok.**
4. **Kayıt akışı DEĞİŞMİYOR.** `CompleteProfile` / `register-and-complete` bugünkü
   `Photos` + `MainPhotoIndex` alanlarıyla kalsın; kayıtta toplanan fotoğraflar kaydın
   modunun seti olur. İkinci mod sonradan `/modes/{mode}/open` ile açılıyor (§6 soru 1).

---

## 6. Sorular — CEVAPLANDI (backend yanıtı, 2026-11-05)

> **Kapanan kararlar** (ayrıntı: backend reposunda `docs/backend_mode_photos_answer_to_fe.md`):
>
> - **(2) Kütüphane modeli KABUL.** `Photo` kütüphane satırı (dosya + içerik kararı),
>   yeni `ProfilePhotoSlot(ProfileId, Mode, PhotoId, Order, IsMainPhoto)` sunumu taşıyor.
>   `Mode` kolonu DB default 1 → backfill yok. **Bu dokümandaki wire sözleşmesi
>   değişmiyor.**
> - **(3) Selfie çapası KABUL, biçimi değişti.** Selfie kareleri hiçbir yerde
>   saklanmıyor ve saklanmayacak (rızalar işleme + yurt dışı aktarım için alınmış,
>   saklama için değil; biyometrik şablon tutmak yeni hukuki temel + DPIA demek). Çapa
>   **selfie'nin onayladığı fotoğraf** oluyor: `SelfieVerifiedPhotoId`, ana foto değişince
>   ona karşı `CompareFaces`. İstediğimiz her sonucu veriyor — mod başına ana foto
>   serbest, rozet düşmüyor, "hangi modun anası" sorusu doğmuyor.
> - **(1) `open` multipart olacak, ama olağan yol UCUZ:** kütüphane sayesinde kurulum
>   normalde sadece `PhotoIds[]` + `MainPhotoId` gönderiyor, dosya taşımıyor. Multipart
>   yalnız "kurulumda yepyeni kare" yolu için. **Idempotency (a) seçildi.**
> - **(4) `UT-2310`** teyit edildi. **(5)** yeni koda gerek yok.
> - **Düzeltme:** yan foto ↔ ana foto yüz karşılaştırması **varsayılan KAPALI**
>   (`VerifyFaceOnSecondaryPhotos = false`). Ana fotoğrafın tek kalıcı işi selfie
>   referansı — zincir §3.2'de yazdığımdan sade.

### ⚠️ §3.4 düzeltmesi — UT-6303/6304 metinleri

Backend katalogunda bu metinler **interpolasyonsuz** ve "6"/"2" sabit gömülü
(`Errors.cs:147-148`); yer tutucu + `max`/`min`/`scope` ekleniyor.

**Bizim tarafta durum farklı ve kayda geçsin:** istemci bu kodlarda sunucunun `message`ını
**hiç render etmiyor** — metin kendi katalogumuzdan geliyor ve değerleri kendimiz
besliyoruz (`ProfileScreen > photoErrorText`: `max: MAX_PROFILE_PHOTOS`,
`min: resolveRequiredPhotoCount(profileVisibility)`). Yani:

- Sunucu metninin düzelmesi bizde bir şeyi değiştirmiyor; **switch de değişmiyor.**
- Bizim `max`imiz zaten SLOT tavanı (mod başına 6) — doğru olan da bu, kullanıcı o modun
  ızgarasına bakıyor. `min` ise `profileVisibility`den geliyor, yani §3.3'teki mod başına
  görünürlük talebi inince **aktif modun bloğunu seçmem gerekiyor** (istemci işi, not
  edildi).
- **KÜTÜPHANE tavanı (12) bizde hiç metni yok.** Slot'lar dolu değilken kütüphane dolu
  olduğu için bir yükleme reddedilirse bugün gösterecek doğru bir cümlemiz yok.
  **İsteğimiz:** o hâli ayırt edebilmemiz için `scope`u yalnız metne gömmeyin, **yapısal
  alan olarak da** gönderin (`scope: "slot" | "library"` + `max`). Metninizi
  render etmediğimiz için tek ayırt etme yolumuz o.

---

## 6b. Tek açık soru — CEVABIMIZ

**Soruları siz cevapladınız (yukarıda); sizin tek sorunuz şu:**

> Yayında `open` ucuna **JSON** atan bir istemci sürümü var mı? Varsa `open-v2` olarak
> ayırırız.

**Cevap: hayır — ve dayanağı şu.**

| Olgu | Kaynak |
|---|---|
| `buildNumber = 37`, son dokunuş **2026-09-18** | `app.json`; o alanı değiştiren tek commit |
| `OPEN_PROFILE_MODE` + `openProfileMode` **2026-10-15**'te indi | `39c1af2` *"feat(discover): mod başlığı, seçici sheet ve mini kurulum akışı"* |
| `ios/` **gitignore'da** (CNG prebuild çıktısı), yani build numarasının kanonik kaynağı `app.json` | `git check-ignore ios` |

Yani `open` çağrısını içeren kod, son build numarası artışından **bir ay SONRA** girdi.
App Store Connect aynı sürüm+build ikilisini ikinci kez kabul etmediği için, 37'den sonra
bir yükleme yapıldıysa numaranın artmış olması gerekirdi — artmamış. Üstüne, bilinen
durum da bunu destekliyor: 1.0(36) 2026-09'da reddedildi, açılışta çökme hâlâ açık ve
cihaz doğrulaması bekliyor.

⚠️ **Sınır:** depo, App Store Connect / TestFlight'ta ne olduğunu kanıtlayamaz. Kesin
kontrol sizde ya da bizde: **ASC build listesinde 37'nin üstünde bir build var mı?** Yoksa
temiz demektir.

### Yine de `open-v2` yerine önerimiz: aynı uç İKİ content-type kabul etsin

Versiyonlamaya hiç girmeden riski sıfırlayan bir yol var: uç hem `application/json`
(fotoğrafsız) hem `multipart/form-data` kabul etsin. JSON gövde = "slot seçimi yok" →
mod açılır ama o modun fotoğrafı olmadığı için `HiddenInsufficientPhotos` kalır; yani §6
soru 1'in (c) şıkkı, **yalnız eski istemciler için**. Bu tam da istediğimiz bozulma
biçimi: eski sürüm zaten fotoğraf adımını çizemiyor, çizemediği için de seçim
gönderemiyor.

Kazancı: kalıcı bir `open-v2` yüzeyi açmıyoruz, ASC'de gözden kaçan bir build çıksa bile
kimse kırılmıyor, ve yeni istemci tek yoldan gidiyor.

---

## 7. İstemci tarafı akış — sözleşmenin neye hizmet ettiği

Backend'in karar verirken şekli görmesi için; bu bölüm talep değil, bağlam.

1. **Mod değiştirme** bugün iki girişten açılıyor (Keşif başlığındaki mod adı, Profil
   avatarına uzun basış) ve `ModeSelectorSheet` adlı **tek duraklı, içerikle boyutlanan**
   bir kart seçiciye düşüyor. Seçicide adım makinesi YOK — fotoğraf adımı oraya
   eklenmiyor.
2. Fotoğraf adımının yeri **`ModeSetupSheet`**: bugün kapalı bir modun profilini açarken
   niyet + prompt'ları toplayan sheet. Tam ekran, kaydırılabilir, bölüm yapılı, gönderim
   /hata/uçuş durumu zaten var ve `asksFriendsPool` koşullu bölüm için örnek teşkil
   ediyor.
3. O sheet'in kendi yorumu bugün *"ortak alanlar (isim, yaş, boy, **fotoğraflar**) zaten
   var ve SORULMUYOR"* diyor — bu talep tam olarak o cümleyi geçersiz kılıyor.
4. Kullanıcı o modun fotoğraflarını seçmeden modu açamayacak (ya da §6 soru 1'in (c)
   şıkkında açabilecek ama görünmez kalacak). Karar o sorudadır.

⚠️ İstemci tarafında en büyük iş sözleşme değil, **fotoğraf ızgarasının çıkarılması**:
bugün 6 slotluk sürükle-sırala ızgara `EditProfileForm` içine gömülü (~140 satır, dosya
137 KB) ve sheet'e taşınabilmesi için bileşene dönüşmesi gerekiyor. Backend'i
ilgilendirmiyor ama takvimi etkiliyor.

---

## 8. Özet — istenen alanlar tek bakışta

```
GET /api/profile
  + friendsPhotosList[]              (photosList ile AYNI öğe şekli)
  + friendsProfileVisibility         (profileVisibility ile aynı şekil)

PUT /api/profile/UpdateProfile  (multipart)
  + FriendsNewPhotos
  + FriendsPhotoIdsToDelete
  + FriendsPhotoOrders[i].PhotoId / .NewOrder
  + FriendsNewMainPhotoId
  → result.photos[] hangi moda ait olduğunu söylesin (§2.4)

ProfileCardDto (GetPotentialMatches · WhoLikedMe · MissedMatches · LikerProfile · author-profile)
  ~ photos[] ve profileImageUrl, isteğin `mode`una göre dolsun   (YENİ ALAN YOK)

ConversationListItemDto
  ~ partnerProfileImageUrl, sohbetin `mode`una göre dolsun       (YENİ ALAN YOK)

IncomingLikeDto · MatchNotification
  ~ foto alanı olayın `mode`una göre dolsun                      (YENİ ALAN YOK)

POST /api/profile/modes/{mode}/open
  ? fotoğrafı da alacak mı — §6 soru 1
```
