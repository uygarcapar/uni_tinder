# Kampüs anları — **karar verilmiş anlar listede KALSIN** · ✅ **YAPILDI (2026-10-30)**

> **Durum: KAPANDI, aynı gün.** Backend uyguladı:
> - `CampusQueryService` süzmesi kalktı (`decidedMomentIds`/`likedUserIds` alt
>   sorguları çıkarıldı); kalan süzgeçler talepteki gibi aynı — 24 saat, mod,
>   moderasyon, görünürlük, kendi anımın başa sabitlenmesi, cursor.
> - `canLike: boolean` eklendi (zorunlu, non-nullable), kural istediğimiz
>   biçimde eski süzgecin birebir tersi ve tek yerde (`LoadLikeBlockedAsync`);
>   `isMine` satırı daima `false`. Hesap sayfa başına iki küçük sorgu (≤51
>   kayıt), filtre alt sorgusu DEĞİL.
> - `UT-7424` duruyor (istediğimiz gibi).
> - `myDecision` **eklenmedi** — talepte "biri yeterli" dediğimiz için beklenen
>   sonuç; istemci `canLike` okuyor (§2.3).
>
> **İstemcide bunun üzerine yapılanlar:**
> - `canLike` okunuyor (`isMomentDecided`: `canLike === false` → oturum kümesi);
>   `myDecision` dalı **silindi**.
> - **`UT-7424` artık kartı DÜŞÜRMÜYOR** (`CAMPUS_DROP_CARD_CODES`ten çıktı):
>   kod geldiğinde kart yerinde kalıyor, karar verilmiş işaretlenip liste
>   tazeleniyor. Süzme varken kartı düşürmek doğruydu; artık ürün kuralını
>   kullanıcının dokunuşuyla bozardı. Testle çivili.
> - Oturum ömürlü tutma (`likedMoments` + `mergeKeptMoments`) **kaldı ama rolü
>   değişti**: artık kalıcılık değil, beğeni ile tazelemenin inmesi arasındaki
>   bayat listede tikin çizilmemesi için optimistik ara katman. Yüzeyin yalnız
>   yeni sunucuyla konuştuğundan emin olunca üçü birden silinebilir.

**Tek maddelik talep.** `GET /api/campus/moments` karar verdiğim anları **süzmeyi
bıraksın**, onun yerine DTO'da "bu an için karar verilmiş mi" bilgisini döndürsün.
Kota/karar kuralları ve diğer tüm süzgeçler aynı kalıyor.

> Kardeş talep (aynı uç, ayrı kural): `backend_campus_mode_gate_2026-10-30.md` —
> isteyenin KAPALI modunda liste boş dönsün. Sırayla ya da birlikte yapılabilir.

⚠️ **Bu, `backend_campus_moments_2026-10.md` §2'de BİZİM istediğimiz kuralın geri
alınmasıdır.** O tablo "kampüs-yerel satır VEYA aynı moddaki mevcut `Like` süzülsün"
diyordu ve gerekçesi şuydu: *"görünürse kullanıcı günlük tek kararını `UT-7424` yiyen
birine harcar."* Gerekçe hâlâ geçerli ama artık **istemcide** karşılanıyor — karar
verilmiş kartta beğeni butonu hiç çizilmiyor. Yani süzmenin koruduğu şeyi buton kapısı
koruyor; süzme yalnızca kartı kaybediyor.

---

## 1. Gözlem — kullanıcının gördüğü şey

Kullanıcı şeritte birini beğeniyor, kart büyüyor, cam tike basıyor, kutlama oynuyor ve
**kart şeritten kayboluyor.** Kullanıcının bildirdiği hata birebir şu: *"beğendikten
sonra birinin kartı kaybolmasın, kalsın orada hep."*

Kaybolma bizim süzgecimizin sonucu: beğeni → `refreshCampus()` → liste tazeleniyor ve
karar verilmiş an **artık dönmüyor**. Ekranda bu "işlem başarılı" gibi değil **veri
kaybı** gibi okunuyor:

- kampüs şeridi "bugün kampüste kimler var" sorusunun cevabı; beğenmek o kişiyi
  kampüsten silmiyor, yalnız benim ona bir sinyal verdiğim anlamına geliyor;
- başlıktaki sayaç da düşüyor ("7 an" → "6 an"), yani kullanıcı kendi kararıyla
  **başka insanların** kaybolduğunu görüyor;
- kullanıcı "yanlış kişiye mi bastım" diye kontrol etmek istediğinde bakacak bir şey
  kalmıyor (kampüs kararı geri alınamıyor — §1'deki kabulümüz).

**Şu an istemcide ne var:** beğenilen anın kopyası **bellekte** tutuluyor ve listeye
geri karıştırılıyor (`mergeKeptMoments`). Bu bir yama ve sınırı açık: **oturum ömürlü.**
Uygulama kapanıp açılınca kart yine yok. Kalıcı çözüm sunucu tarafında.

---

## 2. Talep

### 2.1 Süzme kalkıyor

`GET /api/campus/moments` (ve varsa aynı listeyi besleyen her yer), **karar verilmiş
anları da döndürsün.** Yani §2'deki tablo şu hâle geliyor:

| durum | kampüs listesinde görünsün mü |
|---|---|
| Kampüste **beğendim** | **Evet** (yeni) — `canLike: false` ile |
| Kampüste **geçtim** | **Evet** (yeni) — `canLike: false` ile |
| Keşif'te **beğendim** (aynı mod) | **Evet** (yeni) — `canLike: false` ile |
| Keşif'te **geçtim** | Evet (değişmedi) — `canLike: true` |

Değişmeyen süzgeçler (bunlara dokunulmasını İSTEMİYORUZ):

- **24 saat**: `expiresAt` geçmiş an dönmesin (istemci de ayrıca süzüyor);
- **mod**: liste yine sorgunun modunda;
- **moderasyon**: başkasının reddedilmiş/bekleyen anı yine gelmesin;
- **engel/blok ilişkileri**, **kendi anımın başa sabitlenmesi**, **cursor penceresi**:
  hepsi aynı.

### 2.2 Yeni alan: `canLike`

```jsonc
{
  "id": "…",
  "userId": "…",
  // … mevcut alanlar
  "canLike": false        // yeni: bu an için BENİM bir kararım var mı
}
```

| alan | tip | anlamı |
|---|---|---|
| `canLike` | `boolean` (zorunlu, nullable değil) | `false` = bu kullanıcı için **aynı modda** zaten bir `Like`'ım var ya da bu ana kampüste karar verdim. `true` = beğeni gönderebilirim. |

İstemci bunu **tek bir şey için** kullanıyor: `false` ise büyüyen kartta cam tik hiç
çizilmiyor. Kart görünür, açılıyor, fotoğrafına bakılıyor — yalnız karar butonu yok.

**Kuralı birebir yazıyoruz** (süzgecin tersi olmak zorunda, yoksa listede tik'li ama
`UT-7424` yiyen kart doğar):

```
canLike = !(kampüs-yerel karar satırı var  ||  aynı modda mevcut Like satırı var)
```

- `Pass` (Keşif) `canLike`ı etkilemiyor — bugün de etkilemiyordu;
- kendi anımda (`isMine: true`) `canLike` **false** gelsin (kendine beğeni yok,
  `UT-7422`). İstemci zaten `isMine` kapısını ayrıca uyguluyor, yani ikisi birbirini
  tekrarlıyor — sorun değil, ama `true` gelmesi yanlış olur.

### 2.3 İsteğe bağlı (nice-to-have, bloke değil)

```jsonc
"myDecision": "Like"      // "Like" | "Pass" | null
```

Varsa kart üstünde "beğendin" gibi bir işaret çizebiliriz (şimdilik planlanmadı).
`canLike` olmadan **yalnız bunu** göndermeniz de bizim için yeterli: `canLike`ı
`myDecision === null` diye türetiriz. Yani ikisinden **biri** şart, ikisi birden şart
değil.

---

## 3. Neden `canLike`, neden istemci türetmiyor

İstemci "bu kişiyi beğenmiş miyim"i **bilemiyor**: Keşif kararları istemcide tutulmuyor,
kampüs kararları da `/campus/me`de sayı olarak geliyor (hangi kişi olduğu yok). Bugünkü
yamanın tek bildiği şey **bu oturumda bu cihazdan** verilen kararlar. Dolayısıyla:

- uygulama yeniden açılınca kart yine kaybolur (yamanın sınırı),
- ikinci bir cihazdan verilen karar hiç bilinmez → tik çizilir → `UT-7424` → istemci o
  kodda kartı **gerçekten** düşürüyor, yani kullanıcı kartı tam da kalmasını istediği
  yerden kendi dokunuşuyla kaybeder.

Tek doğru kaynak sunucu.

---

## 4. Yan etkiler — ikisini de kabul ediyoruz

| ne değişiyor | bizim duruşumuz |
|---|---|
| **Başlıktaki sayaç büyüyor** ("7 an · Kampüs" karar verilmişleri de sayar) | Doğru olan bu: sayaç "bugün kampüste kaç an var"ı söylüyor, "kaçına karar vermedim"i değil. |
| **Sayfa başına daha çok kayıt** (süzgeç kalkıyor, liste uzuyor) | Sorun değil; cursor sayfalama zaten var ve şerit sonsuz kaydırıyor. |
| **Günlük tek kararı olan free kullanıcı** artık karar veremeyeceği kartları da görüyor | İstenen bu. Kota bitince de kart görünmeye devam ediyor (o dalda tik basılınca paywall açılıyor — değişmedi). |

---

## 5. Geçiş — kırılmayan tarafta duruyoruz

- Alan **gelmezse** istemci bugünkü yamayla çalışmaya devam ediyor (oturum ömürlü
  tutma). Yani sürüm sırası serbest: önce backend ya da önce istemci, ikisi de güvenli.
- İstemci `canLike`ı **opsiyonel** okuyor: `canLike === false` ise tik yok; alan yoksa
  yamadaki küme karar veriyor. Eski sürümdeki istemciler de etkilenmiyor — onlar için
  listede fazladan kart görünür ve tik basılırsa `UT-7424` döner (bugünkü davranış).
- `UT-7424` dalı **kalsın**: iki cihaz yarışı, bayat liste ve eski istemciler için
  gerekli.

---

## 6. Özet

1. `GET /api/campus/moments` karar verilmiş anları **süzmesin** (§2 tablosu geri
   alınıyor — gerekçesi istemcide buton kapısıyla karşılanıyor).
2. DTO'ya **`canLike: boolean`** eklensin (ya da `myDecision`, biri yeterli).
3. 24 saat / mod / moderasyon süzgeçleri **aynı kalsın**.
4. `UT-7424` **kalsın**.
