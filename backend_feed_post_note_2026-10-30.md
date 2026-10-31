# Akış gönderisine **not** — üçüncü not hedefi (`FeedPost`) (talep, 2026-10-30)

**Özet.** Not (yorumlu beğeni) bugün iki şeye yazılabiliyor: bir **fotoğrafa** ya da bir
**prompt cevabına**. Buna üçüncü hedefi ekliyoruz: **akış gönderisi.** Kullanıcı akışta
okuduğu gönderinin satırındaki butona basıp notu yazacak, not alıcıya *"gönderine not
bıraktı"* diye düşecek ve gönderinin metni notun yanında görünecek.

**Yeni uç YOK.** Gönderim yine `POST /api/swipe/Note`; kota, kredi, paywall ve hata
tablosu aynen bugünkü gibi. Değişen üç şey var: (A) akış satırında butonun **kapısı**,
(B) gönderim gövdesindeki **hedef**, (C) alıcının gördüğü **not nesnesi**.

İstemci tarafı sunucu hazır olmadan çıkabilir: `note` alanı gelmezse buton **hiç
çizilmiyor**, yani özellik sessizce kapalı kalıyor.

---

## 1. Neden sözleşme değişiyor

İki şeyi istemci **türetemiyor**, o yüzden ikisi de sunucudan gelmek zorunda:

1. **Butonun çizilip çizilmeyeceği.** Akış satırı (`FeedPostDto`) yazarın hangi modlarının
   izleyiciye uygun olduğunu, yazarın izleyiciyi beğenmiş olup olmadığını ya da eşleşmiş
   olup olmadığını taşımıyor; o bilgi ancak kart açılınca
   `GET /api/feed/posts/{id}/author-profile` ile geliyor. Listede her satır için o ucu
   çağırmak mümkün değil. Üstelik **not kişi başına tek sefer** gidiyor
   (`UT-6404 ALREADY_SWIPED`), yani "bu kişiye daha önce beğeni/not gitti mi" de kapının
   parçası ve istemcide yok (`WhoLikedMe` kümesi yalnız ilk sayfayı tutuyor).

   Emsali aynı DTO'da var: `reply: { state, conversationId }`. Orada da karar sunucuda ve
   istemci yeniden hesaplamıyor. Aynı kalıbı istiyoruz.

2. **Notun bağlamı.** Notun hedefi gönderi ama gönderi silinebiliyor, süresi doluyor
   (`createdAt + 15 gün`) ya da moderasyondan kalkıyor. Hedef kalıcı olarak `postId` ile
   tutulursa alıcı bir gün bağlamsız bir not okur. Bu tam olarak `photoIndex` için
   koyduğumuz kuralın aynısı (öneri dokümanı §9-D4): **hedefi gönderim anında çözüp anlık
   görüntü olarak saklamak.**

---

## 2. Sorular (ölçemediğimiz üç şey)

1. `POST /api/swipe/Note` bugün tanımadığı bir `target.kind` gelirse ne dönüyor —
   `UT-6403 INVALID_TARGET` mı, 400 mü? İstemci yeni türü ancak (A) kapısı açıkken
   gönderiyor, yani normal yolda hiç olmaması gerekiyor; yine de eski istemci / bayat
   liste hâli için bilmek istiyoruz.
2. Aynı kişiye ikinci not bugün hangi kodla dönüyor — `UT-6404 ALREADY_SWIPED` mi? Akış
   kapısını buna göre kuracağız (bkz. 3.1'deki `AlreadySwiped`).
3. `WhoLikedMe` / `LikerProfile` not nesnesindeki `target` alanı şu an yalnız
   `Photo`/`Prompt` mı dönüyor, yoksa eski akış-yanıtı döneminden kalan `FeedPost` kayıtları
   var mı? (İstemcide o dalın okuma kodu hâlâ duruyor.)

---

## 3. Talep

### 3.1 (A) Akış satırında kapı — `FeedPostDto.note`

`GET /api/feed/posts` (ve `/api/feed/mine`) yanıtındaki her gönderiye:

```jsonc
"note": {
  "state": "Ok",                    // aşağıdaki listeden
  "availableModes": ["Dating"]      // yalnız state = "Ok" iken anlamlı
}
```

`state` değerleri ve anlamları:

| state | ne demek | istemci |
|---|---|---|
| `Ok` | not atılabilir | **buton çizilir** |
| `AlreadySent` | bu gönderiye not atılmış | çizilmez |
| `AlreadySwiped` | yazara daha önce beğeni/not gitmiş (başka gönderi ya da Keşif) | çizilmez |
| `NoMode` | karşılıklı uygun mod yok | çizilmez |
| `LikedMe` | yazar izleyiciyi zaten beğenmiş | çizilmez |
| `Matched` | zaten eşleşilmiş | çizilmez |
| `OwnPost` | kendi gönderisi | çizilmez |
| `Anonymous` | anonim gönderi | çizilmez |
| `Restricted` | moderasyon/kısıt | çizilmez |

- `availableModes` bugünkü `author-profile` yanıtındaki alanla **aynı anlamda** (karşılıklı
  uygun modlar). Notun hangi modda gideceğini istemci bu listeden seçiyor ve butonun
  rengi/adı o modun vurgusunu alıyor.
- **Alan hiç gelmezse buton çizilmiyor.** Yani sunucu tarafı açılana kadar istemci sürümü
  beklemek gerekmiyor; `availableModes`in `author-profile`a eklenirken kullandığımız aynı
  gerekçe: *olmayan bir hakkı varsaymak, kullanıcıya reddedilecek bir buton göstermek
  olurdu.*
- İstemci **yalnız `Ok`a bakıyor** (beyaz liste). Listeye yeni bir değer eklenmesi eski
  istemcileri bozmuyor — bilmediği değer "çizme" tarafına düşüyor. Değerlerin ayrı ayrı
  dönmesi istemci için şart değil, teşhis ve analitik için istiyoruz.
- **Anonim gönderide `Ok` DÖNMEMELİ.** Buton anonim bir gönderide çizilirse hem gönderene
  (yazarın aksiyon alınabilir biri olduğu) hem alıcıya (notun hangi gönderiden geldiği)
  kimlik sızar. Bu, akışın anonim kuralının yanında duran bir güvenlik maddesi — `reply`de
  bilerek `Ok` döndürdüğümüz hâlin tersi.

### 3.2 (B) Gönderim — `POST /api/swipe/Note`

Gövdedeki `target` üçüncü türü tanısın; null'lar bugünkü gibi **açıkça** yazılıyor:

```jsonc
{
  "userId": "<yazarın userId'si>",
  "comment": "…",
  "mode": "Dating",
  "target": {
    "kind": "FeedPost",
    "photoIndex": null,
    "promptKey": null,
    "postId": "<gönderi id>"
  }
}
```

- **Gönderi metni (ve konusu) gönderim anında anlık görüntü olarak saklansın.** Alıcı
  tarafı bunu okuyacak (C). `postId`yi saklayıp metni sonra çözmek, gönderi silindiğinde /
  süresi dolduğunda / moderasyondan kalktığında notu bağlamsız bırakır.
- Kota ve bakiye davranışı **aynı**: aynı consumable, `remainingNotes` /
  `remainingPurchasedNotes` aynı alanlar, günlük beğeni kotasından düşmeme kuralı aynı.
- `mode` alanı bugünkü anlamıyla gidiyor (swipe satırı o modun altına yazılıyor).
- Hata kodları mevcut tablo. Bu hedefe özgü iki hâl:
  - **`UT-6403 INVALID_TARGET`** — `postId` yok, silinmiş, süresi dolmuş, moderasyondan
    kalkmış, anonim bir gönderi, ya da **bu gönderiye zaten not atılmış**. İstemci bu
    kodda composer'ı kapatıp akış listesini tazeliyor (satır bayat demektir).
  - **`UT-6404 ALREADY_SWIPED`** — yazara daha önce beğeni/not gitmiş. Normal yolda
    görülmemeli (kapı `AlreadySwiped` ile kapatıyor); bayat liste için duruyor.
- Yeni kod istemiyoruz. `UT-6403`ün kapsamı genişliyor; o kadar.

### 3.3 (C) Alıcı tarafı — not nesnesindeki `target`

`WhoLikedMe` / `LikerProfile` kayıtlarındaki `note.target`:

```jsonc
"target": {
  "kind": "FeedPost",
  "postId": "<gönderi id>",
  "excerpt": "Yarın kütüphane kaçta açılıyor?",   // anlık görüntü
  "postTopic": "Advice",                          // varsa; yoksa null
  "postDeleted": false
}
```

- `excerpt` **gönderim anındaki** metin. Uzunluk sınırı sizde; istemci iki satırda
  kırpıyor, yani ilk ~150 karakter yeterli.
- `postDeleted: true` → istemci metni yine basıyor ve altına "gönderi kaldırıldı" satırını
  ekliyor. Notun kendisi her hâlde okunabilir kalmalı: kullanıcının ödediği şey o.
- `postTopic` PascalCase enum anahtarı (akışın bugünkü `topic` alanıyla aynı değer
  kümesi), istemci kendi etiketine çeviriyor.

---

## 4. Değişmeyen şeyler

- Yeni uç yok, yeni consumable yok, yeni kota yok.
- Gönderi **kalbi** (`likeCount` / `likedByMe`) bu işin dışında: o içeriğe tepki, eşleşme
  üretmiyor. Not kişiye gidiyor. İkisi bağımsız kalıyor.
- `isMatch` davranışı aynı (bu uçta hep `false`, eşleşme SignalR `MatchNotification` ile).
- Akış yanıt uçlarına dokunulmuyor.

## 5. Sıra

(A) tek başına çıkabilir — istemci butonu çizer ama gönderim (B) olmadan `UT-6403` alır,
o yüzden **(A) ve (B) birlikte** çıkmalı. (C) bir tur sonra gelebilir: o zamana kadar
alıcı notu "gönderine not bıraktı" başlığıyla ama gönderi metni olmadan görür — eksik ama
yanlış değil.
