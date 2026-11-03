# Kampüs anları — **profil kartı ucu** + Fire/Spark & Not'un `CampusMoment` kaynağı

> ## 🔄 REVİZYON (2026-11-01, backend bulgusu üzerine)
>
> **Talep A büyük ölçüde ZATEN VAR** — `GET /api/campus/moments/{id}/profile`
> master'da (`CampusController.cs:153`, 9a04d4a ve devamı): aynı
> `ProfileCardDto`, aynı `mode` anlamı, kapılar istendiği gibi (UT-7421 /
> UT-7422 / kampüs-mod-moderasyon), hepsi gövdeli hata ve testli. İstemci bu
> ucu bilmiyordu; **ödünç uçtan (404) bu uca geçmek bizim işimiz.**
>
> Talep A'dan **GEÇERLİ KALAN** iki madde:
> - **`availableModes` doldurulmuyor** → §2.1. İstemcide bu alan "kart hangi
>   modda açılacak"ın tek girdisi; boş gelirse kart **salt okunur** düşüyor,
>   yani aksiyonların hiçbiri çizilmiyor. Yüzeyi tek başına ölü bırakan alan bu.
> - **Kartın hâlini belirleyen alanlar** → §2.2 (`hasLikedMe`, `isMatched`,
>   `myLikeDate`). Yeni karar: kart akıştaki kuralı devralıyor.
>
> **Talep B aynen geçerli ve asıl iş** — ayrıca backend'in bulgusu bir ürün
> riskini açığa çıkardı: **Not bir `Like` satırı yazıyor**, yani kaynak
> damgalanmazsa kampüsten atılan Not bugün **Rewind'e yakalanıyor** (§3.2).
>
> **Yanıtlanan tasarım sorusu:** idempotency **`(actor, momentId)`** — tür YOK.
> An başına **TEK** ücretli aksiyon; ikincisi `UT-7424` (§3.3). Şema
> değişmiyor.

**İki maddelik talep.** Kampüs anının sahibinin profil kartını veren bir uç
(bugün YOK) ve o karttan atılacak **Fire/Spark** ile **Not**'un kampüs kaynağını
taşıması (bugün yalnız `Like` taşıyor).

Üçüncü madde bir **ürün kararı** ve backend'i ilgilendiren yanı tek cümle:
**kampüsün günlük karar kotası emekliye ayrılıyor** (§4).

---

## 1. Ürün kararı — kampüs anları artık bir VİTRİN

Bugün: şeritteki küçük karta basınca kart büyüyor ve sağında **cam bir tik**
duruyor; günlük 1 karar (free) oradan veriliyor.

Olacak:

- büyüyen kart **yalnız fotoğraf** — tik yok,
- **avatar ya da isim/yaşa** basınca kişinin **profil kartı** açılıyor,
- o kartta **yalnız Fire/Spark ve Not** var — **tik (like) ve X (pass) YOK.**

Yani kampüs şeridi "bugün kampüste kim var"ı gösteren bir vitrin; aksiyon
profilde ve **ücretli/kredili** aksiyonlar (Fire/Spark, Not). Düz beğeni ve geçme
kampüsten tamamen kalkıyor.

> **İstemci bugün ne yapıyor:** hiçbir şey — **tik yerinde duruyor.** Uç gelene
> kadar kaldırılırsa kampüste beğeni verecek yol kalmıyor (şeridin context
> menüsü yalnız sil/şikâyet). Geçiş TEK TURDA yapılacak: uç geldiği gün tik
> kalkar, dokunuş profili açar.

---

## 2. Talep A — `GET /api/campus/moments/{momentId}/profile` · ✅ **VAR**

```
GET /api/campus/moments/{momentId}/profile?mode=Dating
→ ProfileCardDto   (feed'in POST author profile'ı ile AYNI şekil)
```

Uç master'da ve kapıları istendiği gibi. Kalan iki madde aşağıda.

### 2.1 `availableModes` DOLDURULSUN — **yüzeyi tek başına ölü bırakan alan**

Feed'in author-profile'ı bu listeyi veriyor, kampüs ucu vermiyor. İstemcide
kartın hangi modda açılacağı **yalnız** bu listeden karar veriliyor
(`feedCardMode > resolveCardMode`) ve kural üç dallı:

1. Keşif'te seçili mod listede varsa **o**,
2. yoksa listedeki **ilk** uygun mod,
3. **liste boşsa kart SALT OKUNUR** — Fire/Spark da Not da çizilmiyor.

Yani alan boş gelirse profil açılıyor ama **hiçbir aksiyon yok**; talebin
tamamı bu tek alana bakıyor.

⚠️ **İstemci bir "uygunluk hesabı" YAPMIYOR ve yapmamalı:** karşı tarafın açık
modlarını ve tercihlerini bilmiyor. Liste sunucudan gelen tek doğru.

⚠️ Alan **eksik/boş** ile **`null`** arasında fark gözetilmiyor — ikisi de salt
okunur demek. Modu kapalı bir hedefte boş liste **doğru** cevap.

### 2.2 Kartın hâli — `hasLikedMe` · `isMatched` · `myLikeDate`

**Ürün kararı (2026-11-01): kampüs kartı akıştaki kuralı DEVRALIYOR.** Kural
saf bir fonksiyonda ve testli (`feedCardMode > authorLikedMe` +
`feedCardActions`), yeniden yazılmıyor:

| Hâl | Çizilen |
|---|---|
| Normal | **Fire/Spark + Not** (talebin özü) |
| Hedef beni beğenmiş (`hasLikedMe`) | kabul (tik) + reddet (X) — Fire boşa kredi yakardı |
| Eşleşmişiz (`isMatched`) | **hiçbiri** — sohbet zaten açık |
| Mod yok (§2.1) | hiçbiri |

Bu yüzden `ProfileCardDto`nun bu üç alanı kampüs ucunda da **akıştakiyle aynı
anlamda dolu** gelmeli. `myLikeDate` "ben zaten beğenmişim"i söylüyor ve
bekleyen kararı öldürüyor — eksikse kullanıcıya kendi beğenisi bir karar gibi
sunulur.

### 2.3 Neden `momentId` ile (kayıt — uç zaten böyle) İstemci bir dönem
`GET /api/swipe/LikerProfile/{userId}`'yi ödünç kullandı ve **404** aldı (backend
teyidi): o uç yalnız *beni beğenmiş* kullanıcılar için açık, kampüsteki rastgele
bir kişi o kümede değil. Çağrı bu yüzden sökülmüş durumda — kanca
(`useCampusMomentProfile`) kodda duruyor, uç gelince yalnız adresi değişecek.

Kapılar sunucuda kalsın: an **canlı
mı** (24 saat), **aynı kampüs mü**, **mod** eşleşiyor mu, moderasyondan geçmiş
mi. `userId` alan bir uç bunların hiçbirini soramaz ve kampüs listesinin
görünürlük kuralı istemciye kaçar. Akıştaki kardeşi de tam olarak böyle
(`/feed/posts/{postId}/author-profile` — gönderi kapsamlı, kullanıcı değil).

**Hata kodları** — uçta zaten böyle, kayıt için:

| Durum | Beklenen |
|---|---|
| An yok / süresi dolmuş | `UT-7421` (istemci kartı düşürüyor) |
| Kendi anım | `UT-7422` (bu yüzeyde profil açılmıyor) |
| Kampüs dışı / mod kapalı | mevcut kampüs kodu (liste ucuyla aynı) |

⚠️ Önceki turda "404 + gövdesiz hata olmasın" diye yazılmıştı; uç bunu zaten
karşılıyor. Gördüğümüz 404 **ödünç uçtan** (`/api/swipe/LikerProfile`)
geliyordu — istemci kampüs ucuna geçtiğinde kapanıyor.

---

## 3. Talep B — Fire/Spark ve Not `source: "CampusMoment"` taşısın · **ASIL İŞ**

Backend bulgusu: alanlar `SwipeRequestDto`da **duruyor ama `SuperLike`
okumuyor**; `Note` ise ayrı DTO (`NoteRequestDto`) kullanıyor ve alanlar orada
**hiç yok**.

### 3.1 İstenen gövde

`POST /api/swipe/Like` bu alanları **zaten kabul ediyor** (sözleşme:
`swipeService > SwipeSourceArgs`). Aynısı iki uç için daha isteniyor:

```jsonc
POST /api/swipe/SuperLike     // Fire (Dating) · Spark (Friends) — mode ile ayrışıyor
POST /api/swipe/Note
{
  "targetUserId": "8812",
  "mode": "Dating",
  "source": "CampusMoment",   // YENİ (Like'taki ile aynı anlam)
  "momentId": "4471"          // YENİ
}
```

`source` görüldüğünde beklenen, **Like'takinin birebir aynısı**:

1. Keşif'in günlük `remainingSwipes` kotası **tüketilmiyor**,
2. satıra `Source` yazılıyor → **Rewind o satırı SEÇMİYOR** (kampüs aksiyonu geri
   alınamaz; yoksa Keşif'te rewind'e basan kullanıcı farkında olmadan kampüsteki
   Fire'ını siler),
3. `momentId` **idempotency anahtarı** (§3.3).

⚠️ **Kredi KENDİ sayacından düşsün** — Fire/Spark ve Not'un mevcut consumable
kotaları. Kampüs bunlara ücretsiz bir arka kapı açmıyor; tek fark kaynağın
yazılması ve Keşif kotasının korunması.

⚠️ **Alan ya dolu gider ya HİÇ gitmez** (Like'taki sözleşme). Gönderilmediğinde
sunucu bugünkü davranışı birebir uygulamalı — Keşif'ten atılan Fire etkilenmiyor.

### 3.2 ⚠️🔴 NOT BİR `Like` SATIRI YAZIYOR — bu maddenin asıl ağırlığı

Backend'in tespiti: Not teknik olarak `SwipeActions`a bir **Like** satırı
yazıyor. Yani `source` damgalanmazsa **kampüsten atılan Not bugün Rewind'e
yakalanıyor**: Keşif'te rewind'e basan kullanıcı, farkında olmadan kampüste
yazdığı notu siler. Kredi yanmış, karşı taraftaki sinyal kaybolmuş, kullanıcı
hiçbirini görmüyor.

Bu, Like'ta damgalamayı gerektiren gerekçenin **aynısı** (madde 2) ve Not'ta
bedeli daha ağır: Not bir **yorum** taşıyor, yani silinen şey bir dokunuş değil
kullanıcının yazdığı metin.

### 3.3 Idempotency — **`(actor, momentId)`, tür YOK** (yanıt)

Sorulan soruya ürün kararı: **an başına TEK ücretli aksiyon.** Aynı kullanıcı
aynı ana hem Not hem Fire gönderemiyor; ikincisi **`UT-7424` AlreadyDecided**
ile dönüyor.

- Bugünkü `CampusMomentDecisions` anahtarı `(momentId, actor)` ile **uyumlu —
  şema değişmiyor, migration yok.**
- Gerekçe: Not zaten bir beğeni; üstüne Fire **ikinci bir sinyal değil, aynı
  sinyalin tekrarı** — iki kredi yakıp karşı tarafa tek şey söylerdi.
- İstemci tarafı: aksiyon atılmış anda butonlar **hiç çizilmiyor**, yani
  `UT-7424` normal akışta değil yalnız yarış/bayat-liste penceresinde görülür
  (karar başka cihazdan verilmiş olabilir). O pencerede kart yerinde kalıyor,
  yalnız butonlar düşüyor — `UT-7424`ün kampüs listesindeki bugünkü davranışının
  aynısı.

---

## 4. Kampüsün günlük karar kotası — **emekli**

Düz beğeni kampüsten kalktığı için `CampusQuotaDto.decisionsRemaining` /
`decisionLimit` ve `UT-7420` (günlük karar kotası doldu) **karşılıksız kalıyor.**

- Yeni aksiyonlara (Fire/Spark, Not) **uygulanmasın** — sınır kredinin kendisi.
- Alanlar DTO'da **kalabilir**, istemci okumayı bırakacak; silmek istiyorsanız
  istemci tarafı hazır olduğunda ayrı bir turda konuşalım.
- `POST /api/campus/moments/{id}/pass` **çağrılmayacak** (X kalkıyor). Ucu
  silmeyin, davranışı da değiştirmeyin — yalnız istemci artık göndermiyor.

---

## 5. Sıra — kim neyi yapıyor

**Backend (onaylı, başlanabilir):**
1. `availableModes` (§2.1) — **tek başına kapı**, bu olmadan yüzey ölü.
2. `hasLikedMe` / `isMatched` / `myLikeDate` akıştakiyle aynı anlamda dolu
   gelsin (§2.2).
3. `SuperLike` + `Note` → `source`/`momentId` (§3), idempotency
   **`(actor, momentId)`**, şema değişmiyor.
4. Kampüs karar kotası yeni aksiyonlara uğramasın (§4).

**İstemci (uç hazır olduğunda, tek tur):**
- ödünç `/swipe/LikerProfile` → `/campus/moments/{id}/profile` geçişi
  (`useCampusMomentProfile` duruyor, yalnız adres),
- büyüyen karttan **cam tik + alev süpürme bağlantısı** sökülüyor,
- avatar ve isim/yaş **dokunulabilir** oluyor → profil kartı,
- kart akıştaki aksiyon kuralını devralıyor (§2.2),
- kampüs kotası okunmayı bırakıyor.

⚠️ **Tik o güne kadar yerinde kalıyor:** şimdi sökülürse kampüste beğeni verecek
hiçbir yol kalmıyor (şeridin context menüsü yalnız sil/şikâyet).

---

## 6. Kapsam dışı

- Kartın **düzeni/aksiyon butonları** istemcinin işi; sunucudan buton/izin
  listesi istemiyoruz. İhtiyaç duyulan veri §2.1–2.2'deki alanlar.
- Eşleşme kuralları, Not'un hedef (`target`) sözleşmesi, Fire'ın kutlaması —
  hiçbiri değişmiyor.
- Kampüs listesinin kendisi (`/campus/moments`), `canLike`, mod kapısı ve
  `mainPhotoUrl` bu talebin dışında.

> ⚠️ `canLike` hakkında: düz beğeni kalkınca alan **anlamını yitiriyor**. Şimdilik
> DOKUNMAYIN — istemci tiki kaldırana kadar okuyor. Geçiş bittiğinde ölü alan
> olarak ayrıca konuşulur.
