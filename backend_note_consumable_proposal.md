# Not (Note) — yorumlu, hedefli beğeni · FE'den backend'e sözleşme önerisi

**Tarih:** 2026-08-25 · **Cevaplandı:** 2026-08-26
**Durum:** ✅ **Sözleşme kapandı.** Backend Faz 1–5'i master'a aldı; D1–D8'in
tamamı cevaplandı (§9) ve FE bağlandı. Kod ailesi **UT-63xx değil UT-64xx** (§7).
**Kalan tek blokaj:** `note_2/4/6/8` mağaza ürünleri açılmadı + consumable satın
alması sandbox'ta uçtan uca doğrulanmadı → redeem (Faz 2) mock'la test ediliyor.
**İlgili:** `backend_recovery_consumable_kararlar.md` (aynı consumable motoru),
`backend_profile_prompts_cevap.md` (prompt sözleşmesi), ClickUp "API Contract — Master".

---

## TL;DR

- Yeni ürün: **Not** — kartın *belirli bir içeriğine* (ana foto / diğer fotolar /
  bir prompt cevabı) yazılan kısa yorumla birlikte gönderilen beğeni.
- **Ayrı bir consumable.** Kotası yok, satın alınır. SuperLike ve kurtarma paketiyle
  aynı redeem motorunu kullanır — yeni mekanik yok, yeni **config** var (§6).
- Not **like sayılır**: swipe kaydı yazılır, karşı taraf da beğenmişse **eşleşme olur**.
  Ayrı bir "beğenmedim ama yorum yaptım" durumu YOK.
- Alıcı, notu **blursuz** görür: kim gönderdiyse Likes ekranında doğrudan görünür,
  free/premium fark etmez. Bu ürünün satın alınma sebebi bu.
- İhtiyaç duyulan uçlar: `POST /api/swipe/Note`, `POST /api/swipe/Note/Redeem`,
  `WhoLikedMe`/`LikerProfile` içinde `note` bloğu, `Stats` içinde 3 alan.
- Kod ailesi: **UT-64xx** (§7). UT-63xx istenmişti, backend o aileyi aynı gün foto
  moderasyonuna vermişti; not ailesi `9874f4d` ile UT-64xx'e taşındı.
- **8 açık karar** §9'da. En kritiği **D4 (hedef anlık görüntü / snapshot)** —
  index ile taşınırsa notlar zamanla yanlış fotoğrafı gösterir.

---

## 1. Ürün — ne yapıyoruz

Hinge modeli. Bugün kartta yalnızca "tüm profile" atılan bir beğeni var; kullanıcı
neyi beğendiğini söyleyemiyor. Not bunu değiştiriyor:

| | Bugün | Not ile |
|---|---|---|
| Hedef | Profil (bütün) | Tek bir içerik birimi: ana foto · N. foto · bir prompt cevabı |
| Mesaj | Yok | 1–240 karakter serbest metin |
| Alıcı ne görüyor | Free'de bulanık kart, isim yok | **Blursuz** kart + yorum + hangi içeriğe yazıldığı |
| Maliyet | Günlük like kotası | **Satın alınan kredi** (consumable) |
| Eşleşme | Karşılıklı like → match | Aynı — not da like'tır |

FE'de yorum kutusu şu üç yere çıkıyor (uygulandı):

1. Ana fotoğrafın altında,
2. Her ek fotoğrafın altında (`SectionPhoto`),
3. Her prompt cevabının altında.

> Not: kartın sağ üstündeki yuvarlak kalp butonu **kaldırıldı**. O buton hiçbir
> zaman bir uca bağlı değildi (`SwipeCard.tsx`'te "henüz hiçbir şeye bağlı değil"
> notuyla duruyordu); yerini bu yorum kutusu aldı.

---

## 2. `POST /api/swipe/Note` — gönderim

### 2.1 İstek

```json
{
  "targetUserId": "9f1c…",
  "swipeType": "note",
  "comment": "Bu cevabı çok sevdim, aynısını ben de yazardım.",
  "target": {
    "kind": "Photo",
    "photoIndex": 0,
    "promptKey": null
  }
}
```

| Alan | Tip | Zorunlu | Not |
|---|---|---|---|
| `targetUserId` | guid | ✔ | Mevcut `Like`/`SuperLike` ile aynı |
| `swipeType` | `"note"` | ✔ | Mevcut uçların deseni (`"like"`, `"superlike"`) korunuyor |
| `comment` | string | ✔ | Trim sonrası **boş olamaz**; üst sınır §9-D7 |
| `target.kind` | `"Photo"` \| `"Prompt"` | ✔ | PascalCase enum — wire sözleşmesi gereği (`backend_api_wire_format`) |
| `target.photoIndex` | int | `kind=Photo` ise | 0 = ana fotoğraf. Profilin **görünür** foto dizisindeki index |
| `target.promptKey` | string | `kind=Prompt` ise | Katalog `enumName`'i (`ProfilePromptCard.promptKey` ile aynı) |

`kind` ile birlikte gelmeyen alan `null` gönderilir; backend dolu gelirse **yok
saysın**, 400 atmasın (ileride üçüncü bir hedef türü eklendiğinde eski istemciler
kırılmasın).

### 2.2 Yanıt (200)

```json
{
  "isSuccess": true,
  "code": null,
  "result": {
    "isMatch": false,
    "matchId": null,
    "remainingNotes": 4,
    "remainingPurchasedNotes": 4,
    "showPaywall": false,
    "paywallType": null,
    "paywallMessage": null
  }
}
```

- `remainingNotes` = kota + kredi **toplamı**, tabanı 0.
- `remainingPurchasedNotes` = yalnız satın alınan kredinin kalanı.
- İkisinin semantiği SuperLike'ın `remainingSuperLikes` / `remainingPurchasedSuperLikes`
  ikilisiyle **birebir aynı** olsun — FE bakiyeyi tek bir yardımcıyla yazıyor
  (`consumableRedeem.patchStatsBalance`), ayrışırsa ikinci bir kod yolu doğar.
- `isMatch` / `matchId`: mevcut `Like` yanıtındaki alanlarla aynı isim ve anlam.

### 2.3 Bakiye bittiğinde

**HTTP 402** + `code: "UT-6401"` + `result.showPaywall: true`,
`result.paywallType: "NOTE_BALANCE"`.

FE bunu paywall'a değil doğrudan **Not paketi satın alma sheet'ine** bağlıyor
(SuperLike'ın 2026-08-11'deki davranışının aynısı: premium kullanıcı da paket
satın alabildiği için bu bir abonelik paywall'ı değil).

⚠️ Bakiye 0'ken **swipe kaydı yazılmamalı.** Kullanıcı kredi almaya gidip geri
döndüğünde aynı kartın hâlâ destede olması gerekiyor.

---

## 3. Alıcı tarafı — `WhoLikedMe` ve `LikerProfile`

Notun ürün değerinin tamamı burada. Her liker profiline **`note`** bloğu ekleniyor:

```json
{
  "profileId": "…",
  "userId": "…",
  "displayName": "Deniz",
  "photos": ["https://…"],
  "likedMeAt": "2026-08-25T09:12:44Z",
  "isSuperLike": false,
  "isNote": true,
  "note": {
    "comment": "Bu cevabı çok sevdim, aynısını ben de yazardım.",
    "sentAt": "2026-08-25T09:12:44Z",
    "target": {
      "kind": "Prompt",
      "photoUrl": null,
      "promptKey": "IdealFirstDate",
      "promptDisplay": "İdeal ilk buluşma",
      "promptAnswer": "Sahilde yürüyüş, sonra kahve."
    }
  }
}
```

| Kural | Neden |
|---|---|
| `isNote` **ayrı bir bayrak**, `isSuperLike`'ın yerine geçmez | İkisi aynı anda true olabilir mi sorusu D8'de; bugünkü FE ikisini bağımsız okuyor |
| `note.target.photoUrl` / `promptDisplay` / `promptAnswer` **anlık görüntü** | Gönderim anındaki içerik. Gerekçe D4 |
| `promptDisplay` **izleyicinin dilinde** çözülmüş | Diğer `*Display` alanlarıyla aynı kural (`backend_profile_prompts_cevap` §1) |
| `sentAt` ISO + `Z` | `backend_utc_dates` sözleşmesi |
| `note` yoksa alan **`null`**, boş nesne değil | FE `note != null` ile tek kontrol yapıyor |

### 3.1 Görünürlük — kritik

Bugün Likes ekranında free kullanıcıya kartlar **bulanık** geliyor; yalnız SuperLike'lar
net (`LikesScreen.tsx`: `showClear = alwaysClear || isPremium || item.isSuperLike`).

**Not gönderen kişi, alıcının tier'ından bağımsız olarak NET görünmeli.**

Bu FE'de tek satır (`|| item.isNote`) ama **sunucu tarafında da tutulmalı**: not
taşıyan liker kaydında `displayName`, `photos`, `age` alanları free kullanıcıya da
gerçek değerleriyle dönmeli. Bugün bulanıklaştırma yalnız görsel bir katmansa sorun
yok; sunucu bu alanları free'de kırpıyor/maskeliyorsa notun tamamı anlamsızlaşır.
**Teyit isteniyor.**

---

## 4. `Stats` — bakiye alanları

`GET /api/swipe/Stats` yanıtına üç alan:

| Alan | Tip | Anlam |
|---|---|---|
| `notesRemaining` | int? | Kota + kredi **toplamı**. Taban 0, `-1` (sınırsız) **asla** dönmez |
| `purchasedNotes` | int? | Satın alınmış, **süresiz** kredi |
| `quotaNotesRemaining` | int? | Yalnız tier kotasından kalan (D1'e bağlı; kota yoksa hep 0) |

Ayrıca metin sınırının sunucudan gelmesi isteniyor:

| Alan | Tip | Anlam |
|---|---|---|
| `noteMaxLength` | int? | Yorumun karakter tavanı. Gelmezse FE 240'a düşer |

Gerekçe: sınır ürün kararı, istemci sürümü değil. Bugün sabit yazılırsa sınırı
değiştirmek App Store turu gerektirir ve **eski istemciler 400 yemeye başlar** —
`weeklySuperLikeLimit`te tam olarak bu yaşandı (adı "weekly" kaldı, periyot tier'a
bağlandı, sabit metin yazan her yer yanlışlandı).

### 4.1 ⚠️ `notesRemaining` FE'de özellik anahtarı olarak KULLANILMIYOR

Bilerek: FE not kutusunu **her zaman** çiziyor ve bakiye 0/`null` iken satın alma
sheet'ini açıyor. Yani alan gelmese bile ekran bozulmuyor, yalnızca gönderim
denenmiyor. Backend'in alanları eklemesi FE sürümü gerektirmez.

---

## 5. Bildirim — `Note` tipi

Notun ulaştığı an, alıcının uygulamayı açtığı an olmayabilir.

- `NotificationType` birliğine **`Note`** ekleyin
  (bugünküler: `Match` · `Like` · `SuperLike` · `MissedMatch` · `Message` · `System` ·
  `TrialEndingSoon` · `PremiumExpiringSoon`).
- SignalR: mevcut `IncomingLike` olayına `isNote: true` + `notePreview` eklenebilir,
  ya da ayrı `IncomingNote` atılabilir. FE'nin tercihi **mevcut olaya alan eklemek**
  — `IncomingLike` zaten rozet sayacını ve `whoLikedMeIds` kümesini besliyor, ikinci
  bir olay iki ayrı yerde aynı state'i güncellerdi.
- Push gövdesinde yorumun ilk ~60 karakteri olsun; free kullanıcıya da **açık**
  (§3.1 ile aynı gerekçe).

---

## 6. `POST /api/swipe/Note/Redeem` — paket → kredi

SuperLike ve kurtarma ile **birebir aynı** sözleşme; FE'de yeni kod değil yeni
config yazıldı (`noteRedeem.ts`, 30 satır).

**İstek:** `{ "transactionId": "…", "productId": "note_4" }`

**Yanıt:**
```json
{
  "isSuccess": true,
  "result": {
    "creditsAdded": 4,
    "purchasedNotes": 6,
    "notesRemaining": 6,
    "alreadyRedeemed": false
  }
}
```

Zorunlu davranışlar (üçü de mevcut motorun dayandığı varsayımlar):

1. **`transactionId` bazında idempotent.** İstemci aynı transaction'ı açılışlarda
   tekrar tekrar dener; kredi bir kez eklenmeli, tekrarında `alreadyRedeemed: true`.
2. **Webhook yarışı 402 + `UT-6411`.** İstemci bunu kalıcı hata saymaz, MMKV
   kuyruğuna yazar.
3. **Kalıcı hatalar 400 + `UT-6412`/`UT-6413`.** Kuyruktan düşürülür.

### 6.1 Mağaza ürünleri

| Ürün id | Kredi | Fiyat (TR) | Birim |
|---|---|---|---|
| `note_2` | 2 | ₺84,99 | ₺42,5 |
| `note_4` | 4 | ₺149,99 | ₺37,5 |
| `note_6` | 6 | ₺199,99 | ₺33,3 |
| `note_8` | 8 | ₺249,99 | ₺31,3 |

**2026-08-27 güncellemesi:** kademeler ilk önerideki `note_1/3/10` değil,
**2/4/6/8**. Not SuperLike'tan daha ağır bir aksiyon (yorum yazmak gerekiyor),
tüketimi de daha yavaş — 10–20'lik paketler aylarca kullanılmayan bakiye
demekti. Küçük adetler giriş fiyatını da düşük tutuyor: 2'lik paket "bir dene"
ürünü.

**Fiyat kuralı: not başına maliyet SuperLike'ın ~%25 üstü.** Çapa `note_4`:
SuperLike 5'lik paket ₺149,99 (₺30,0/adet) ise not 4'lük paket de ₺149,99
(₺37,5/adet) — tam %25 fark, aynı parayla bir adet az not. Diğer kademeler bu
çizginin etrafında: **birim fiyat 2'den 8'e doğru düşüyor** (₺42,5 → ₺31,3),
aksi halde grid'de büyük paketin cazibesi kalmaz.

⚠️ Tablo SuperLike'ın ₺149,99 (5'lik) fiyatı varsayımıyla hesaplandı; SuperLike
fiyatı değişirse bu merdiven de kayar.

⚠️ **İstemci fiyatı hiçbir yerde sabitlemiyor** — kartta ve CTA'da daima RC'nin
locale'li `priceString`i var. Yani fiyatı sonradan oynatmak (hatta bölgesel
farklılaştırmak) FE sürümü gerektirmez; yanlış fiyat girilirse de uygulamada
"eski fiyat" gibi bir tutarsızlık oluşmaz.

RC offering id: **`notes`** (2026-08-27'de böyle açıldı; `superlikes` ile aynı
çoğul kural). Premium `current` offering'inden ayrı → `all["notes"]`.

⛔ Ürün id'sinde **adetten başka rakam olmamalı** — istemci krediyi id'den
okuyor (`creditsFromProductId`), `2026_note_4` sessizce 2026 kredi gösterir.

> **Ön koşul (SuperLike/kurtarmadan devralınan risk):** 2026-08-12 kaydımıza göre
> consumable redeem sandbox'ta `NON_RENEWING_PURCHASE` webhook'u inmediği için
> 402 dönüyordu ve **hiçbir consumable satın alması uçtan uca krediye dönmemişti.**
> Not paketlerini aynı boruya bağlamadan önce tek bir sandbox satın almasının
> gerçekten bakiyeyi artırdığı teyit edilsin. Düzeldiyse haber verin, aynen devam.

---

## 7. Hata kodları — **UT-64xx** (2026-08-26'da UT-63xx'ten taşındı)

### 7.1 Kaza raporu ve sonucu

Bu bölüm ilk yazıldığında **UT-63xx'in tamamı** isteniyordu. Gerekçe UT-62xx'in iki
anlam taşımasıydı: `RECOVERY_REDEEM_CODES` = `UT-6201/6202/6203` (FE kendi seçmişti)
ile backend'in 2026-08-24'te "UT-62xx boştu" diyerek verdiği foto moderasyonu
kodları çakışmıştı.

**Sonuç:** backend foto ailesini 2026-08-25'te `UT-63xx`'e taşıdı (`48a6f52`) —
yani bu doküman UT-63xx'i isterken o aile aynı gün dolmuştu. `UT-6301`–`UT-6303`
üçü de birebir çakışıyordu (foto tavanı ↔ not hedefi vb.), yani aynı kazanın
üçüncü tekrarı olurdu. Taşınan taraf **Not** oldu (`9874f4d`, 2026-08-26): foto
kodları canlıda dönüyor, not ürünü henüz hiçbir yerde yayında değildi.

**Not ailesi = UT-64xx.** İç yapı aynen korundu, yalnız prefix değişti. Geçiş
penceresi yok — eski numaralar not için hiç dönmedi.

### 7.2 Gönderim — UT-640x

| Kod | HTTP | Anlam | FE davranışı |
|---|---|---|---|
| `UT-6401` | 402 | Not bakiyesi yok | Satın alma sheet'i açılır |
| `UT-6402` | 400 | Yorum boş / sınırı aşıyor | Composer'da inline hata, metin **korunur** |
| `UT-6403` | 400 | Hedef geçersiz (index aralık dışı / bilinmeyen `promptKey`) | Composer kapanır, kart tazelenir |
| `UT-6404` | 409 | Bu kullanıcıya zaten swipe atılmış | Kart desteden düşürülür, kredi **harcanmaz** |
| `UT-6405` | 410 | Hedef kullanıcı erişilemez (silinmiş/engellenmiş) | Kart düşürülür, kredi **harcanmaz** |
| `UT-6406` | 400 | Yorum moderasyondan geçmedi | Composer'da inline hata, metin **korunur** |
| `UT-6407` | 429 | Suistimal freni (saatlik cap / arka arkaya moderasyon reddi) | Composer'da inline hata, metin **korunur**, kredi **harcanmaz** |

`UT-6407` bu önerinin ilk halinde yoktu; backend ekledi. `UT-6404`/`UT-6405`/`UT-6407`
için **kredi düşmemeli** — kullanıcının hatası değil.

### 7.3 Redeem — UT-641x

| Kod | HTTP | Anlam |
|---|---|---|
| `UT-6411` | 402 | Webhook henüz inmedi (tek **geçici** durum, retry edilir) |
| `UT-6412` | 400 | Ürün tanımlı değil |
| `UT-6413` | 400 | Bu satın alma bu hesaba ait değil |

Üçlünün UT-61xx/UT-62xx ile **aynı sırada** olması bilinçli: motor kodları
`{PENDING_WEBHOOK, UNKNOWN_PRODUCT, BELONGS_TO_ANOTHER_USER}` şeklinde config'ten
okuyor, sıra bozulursa yanlış aile "geçici" sayılır ve sonsuz retry döngüsü doğar.

---

## 8. Moderasyon

Not, **kullanıcıdan kullanıcıya giden ilk serbest metin yüzeyi** — eşleşme
gerektirmiyor, yani mesajlaşmadan farklı olarak karşı taraf onay vermeden ulaşıyor.

İstenenler:

1. **Metin moderasyonu gönderimde** (`UT-6406`). Reddedilen not kredi harcamamalı.
2. **Şikayet:** alıcı notu şikayet edebilmeli. Mevcut `ReportModal` akışına
   `reportType: "Note"` + `noteId` eklenebilir mi? Bunun için `note` bloğunda
   **`noteId`** alanı gerekiyor (§3'teki gövdeye eklenecek).
3. **Engelleme:** engellenen kullanıcının notu Likes listesinden **düşmeli**.

---

## 9. Kararlar — hepsi cevaplandı (2026-08-26)

**Sekiz önerinin sekizi de aynen kabul edildi.** Aşağıdaki tablo hem soruyu hem
kararı taşıyor. Backend'in eklediği tek fark D4'te: `promptDisplay` snapshot'a
YAZILMIYOR, okuma anında izleyicinin dilinde çözülüyor (snapshot'a yazılsaydı
gönderenin dilinde donardı). `comment` / `photoUrl` / `promptAnswer` snapshot.

| # | Soru | **Karar** (= FE'nin önerisi) |
|---|---|---|
| **D1** | Premium'a periyodik Not kotası verilsin mi? | **Evet, tier bazlı** (haftalık 1 / aylık 2 / yıllık 5) — kurtarmada aldığınız kararla aynı harita. Düz sabit vermek haftalık plana arbitraj yaratır. Harcama sırası: **önce kota, sonra kredi.** Verilmeyecekse `quotaNotesRemaining` hep 0 döner, FE'de değişiklik gerekmez. |
| **D2** | Not, **günlük like kotasından** da düşsün mü? | **Hayır.** Kullanıcı zaten para ödedi; ikinci kez kotadan düşürmek "aldığım şeyi kullanamıyorum" üretir. `Stats.remainingSwipes` **değişmemeli**, `likesToday` de artmamalı; ayrı bir `notesToday` sayacı isterseniz ekleyin. |
| **D3** | Not gönderdikten sonra aynı kullanıcıya normal like atılabilir mi? | **Hayır**, tek swipe. İkinci deneme `UT-6404`. |
| **D4** | Hedef, **index** ile mi **anlık görüntü** ile mi taşınsın? | **Anlık görüntü (snapshot), kesinlikle.** Gerekçe aşağıda. |
| **D5** | Not geri alınabilir mi (undo)? | **Hayır** — kredi iadesi kuyruğu açılır. Not gönderimi geri alınamaz, composer'da "gönder" öncesi onay yeterli. |
| **D6** | Alıcı notu pass'lerse kredi iade edilir mi? | **Hayır.** Teyit isteniyor, ürün tarafında yanlış beklenti oluşmasın. |
| **D7** | Karakter tavanı? | **240.** Mesajlaşma değil, bir açılış cümlesi. `Stats.noteMaxLength` ile sunucudan gelsin (§4). |
| **D8** | Aynı kişiye SuperLike **ve** not birlikte gönderilebilir mi? | **Hayır, ayrı ürünler.** Not zaten "öne çıkan beğeni" işlevini görüyor; ikisinin birleşimi hem UI'da hem kotada üçüncü bir durum yaratır. |

### D4 neden kritik

`photoIndex` ile taşınan bir not, gönderildikten **sonra** hedefin değişmesine açık:

1. Deniz'in 3. fotoğrafına not yazılır (`photoIndex: 2`).
2. Deniz 1. fotoğrafını siler → eski 3. foto artık index 1.
3. Alıcı Likes'ı açar → not, **hiç bahsi geçmeyen bir fotoğrafın** altında görünür.

Foto silme/sıralama bugün serbest, moderasyon da fotoğrafları **asenkron** gizleyebiliyor
(`Review → Rejected`, bkz. `backend_photo_moderation_proposal`) — yani index kayması
kullanıcı hiçbir şey yapmadan da oluşuyor. Aynısı prompt için de geçerli: cevap
düzenlenirse yorum bağlamını kaybeder.

**İstenen:** `POST /Note` gönderim anında hedefi çözüp `photoUrl` /
`promptDisplay` + `promptAnswer` değerlerini **kaydetsin**; `WhoLikedMe` bu
kopyaları döndürsün. İstek gövdesi index/key ile gelmeye devam edebilir — kalıcı
kayıt anlık görüntü olsun.

İkincil fayda: alıcı, gönderenin gördüğü fotoğrafı görür. Gönderen not yazdıktan
sonra fotoğrafını silse bile yorum anlamlı kalır.

---

## 10. Fazlar

| Faz | İçerik | Backend | FE |
|---|---|---|---|
| **1** | `Stats` alanları (§4) + `POST /Note` (§2) + `WhoLikedMe.note` (§3) | ✅ canlı | ✅ bağlandı (`NOTE_SEND_WIRED`) |
| **2** | `POST /Note/Redeem` (§6) + RC offering + 3 ürün | ✅ uç hazır | ⏳ ürünler açılmadı, mock'la test |
| **3** | `IncomingLike.isNote` + `NotificationType.Note` + push (§5) | ✅ canlı | ✅ bağlandı |
| **4** | Metin moderasyonu + `noteId` + şikayet (§8) | ✅ Faz 1'de geldi | ✅ bağlandı |

Faz 1 ve 2 birbirinden bağımsız değil: **Faz 2 olmadan kimsenin bakiyesi olmaz**,
yani Faz 1 tek başına çıkarsa özellik yalnızca D1'deki premium kotasıyla
kullanılabilir. D1 "evet" olduğu için premium kullanıcıda özellik bugün çalışır,
free kullanıcı ürünler açılana kadar yalnız paket sheet'ini görür.

⚠️ Faz 2'nin gerçek blokajı ürün tanımları değil, 2026-08-11'de teşhis edilen
sandbox sorunu: `RevenueCat:AllowSandboxEvents` prod'da kapalı → webhook
`NON_RENEWING_PURCHASE`ı işlemiyor → redeem KALICI 402 alıyor ve retry çözmüyor.
Not paketleri bağlanmadan önce SuperLike ile tek bir sandbox satın alması
doğrulanacak — SuperLike ve kurtarma paketleri de aynı blokajda.

---

## 11. FE'de bugün hazır olanlar

| Dosya | Ne yapıyor |
|---|---|
| `src/features/discover/noteTarget.ts` | Hedef modeli (`kind`/`photoIndex`/`promptKey`) + etiket çözümü |
| `src/features/discover/noteRedeem.ts` | Redeem config'i (kuyruk anahtarı, kod ailesi, stats alanları) |
| `src/features/discover/components/NoteComposerModal.tsx` | Yazma sheet'i, sayaç, bakiye rozeti |
| `src/features/discover/components/NotePurchaseModal.tsx` | Paket sheet'i (ortak `ConsumablePurchaseSheet` kabuğu) |
| `src/features/discover/components/SwipeCard.tsx` | Foto/prompt altındaki not kutuları; sağ üst kalp kaldırıldı |
| `src/features/discover/swipeService.ts` | `sendNote(targetUserId, comment, target)` |
| `src/features/discover/swipeQueries.ts` | `useNoteMutation` — bakiyeyi sunucu cevabından yazıyor (optimistic decrement YOK) |
| `src/features/discover/screens/LikesScreen.tsx` | Gelen notu blursuz kartta çiziyor (yorum + hedef) |

Sözleşme kapandıktan sonra eklenenler:

| Dosya | Ne yapıyor |
|---|---|
| `src/shared/services/moderationService.ts` | Şikayet gövdesine `noteId` |
| `src/shared/components/toaster/LikeToast.tsx` | `kind: 'note'` + önizleme satırı |
| `src/navigation/AppNavigator.tsx` | `IncomingLike.isNote` toast'u + `Note` push yönlendirmesi |
| `src/features/notifications/…` | `NotificationType.Note` + rozet + Likes hedefi |

### 11.1 Bilinçli olarak YAPILMAYANLAR

| Konu | Neden bekliyor |
|---|---|
| Notun `LikerSwipeModal`'da (liker detay kartı) gösterilmesi | **Artık sözleşme engeli yok:** `LikerProfile` yanıtı aynı `note` bloğunu taşıyor ve hedef anlık görüntüsü (`photoUrl` / `promptAnswer`) geliyor. Kalan iş tasarım: detay kartı `expanded={false}` çalıştığı için yorumu ve hedef fotoğrafını koyacak yer seçilmeli. Liste kartında yorum zaten çiziliyor, yani kayıp bilgi yok |
| Sandbox'ta gerçek satın alma testi | `AllowSandboxEvents` penceresi kapalı (§6); redeem mock'la doğrulandı |

Kapatılanlar: notun şikayet edilmesi (`noteId` Faz 1'de geldi → `ReportModal`
genişletildi) ve push/hub bağlanması (Faz 3 alanları canlı).
