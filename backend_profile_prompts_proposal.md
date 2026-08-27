# Profil prompt'ları — bio'nun yerine geçen sözleşme önerisi

**Tarih:** 2026-08-24
**Durum:** FE tarafı planlandı, **hiç kod yazılmadı.** Backend sözleşme kararı bekleniyor.
**İlgili:** `backend_photo_moderation_proposal.md` (aynı doküman düzeni),
`frontend_profile_filters_full_integration_guide.md` §4–5, ClickUp "API Contract — Master".

---

## 1. Yönetici özeti

`bio` alanı üründen kaldırılıyor. Yerine **en fazla 3 prompt** geliyor:

> **Hayatta en çok şundan zevk alırım**
> _sabaha karşı boş sahilde yürümekten_

Prompt = katalogdan seçilen cümle başlangıcı (sunucu sahibi). Cevap = kullanıcının
serbest metni. Kullanıcı hem kayıt akışında hem profil düzenlemede dolduruyor.

FE'yi yazmadan önce sözleşmenin netleşmesi gerekiyor, çünkü **mevcut desenlerin
hiçbiri bu veri şeklini karşılamıyor:**

| # | Boşluk | Sonuç |
|---|---|---|
| B1 | Multipart'ta `{anahtar, cevap}` çifti listesi göndermenin bir deseni yok | `Hobbies` gibi tekrar eden anahtar çift taşıyamaz; sözleşme yazılmazsa FE ile BE farklı şekiller uydurur |
| B2 | `UpdateProfile`'da boş string "değiştirme" demek, "temizle" değil (`profileSlice.ts:219`) | Kullanıcı prompt'unu **silemez** — 3'ten 2'ye inen istek sessizce 3'ü korur |
| B3 | Prompt metni kimin dilinde çözülecek tanımlı değil | Türk kullanıcının profilini İngilizce istemcide açan kişi Türkçe soru görür; cevap çevrilirse kullanıcının cümlesi bozulur |

Öneri: `/api/common/prompts` kataloğu, kart DTO'sunda `promptDisplay` + ham `answer`,
multipart'ta indeksli anahtar, `Prompts` alanı için **tam liste (replace)** semantiği.
Bio ise üç fazda düşürülüyor (§5).

---

## 2. Alınmış ürün kararları

Bunlar karar bekleyen sorular değil, **verilmiş kararlar** — backend'in tasarımı
buna göre yapması isteniyor:

| Konu | Karar |
|---|---|
| Adet | Kullanıcı başına **en fazla 3** |
| Kayıt akışı | **En az 1 zorunlu**, 3'e kadar opsiyonel. Kalanlar profil düzenlemeden eklenir |
| Seçim modeli | Tek havuzdan serbest seçim, **aynı prompt iki kez seçilemez** |
| Sıra | Kullanıcının doldurduğu sıra korunur, kartta o sırayla çizilir |
| Bio | **Tamamen kaldırılıyor** — kolon ve DTO alanı düşecek, mevcut metinler taşınmıyor (§5, KVKK uyarısı dahil) |
| Cevap uzunluğu | **150 karakter** öneriliyor (bio 500'dü — 3×500 kartı metin duvarına çevirir) |

---

## 3. Bugünkü durum — FE'nin bildiği bio sözleşmesi

| Nerede | Ne yapıyor | Dosya |
|---|---|---|
| Kayıt | **Hiç toplanmıyor.** Step12 boyu alıp `bio: ""` yazıyor | `src/features/auth/screens/RegisterStep12Screen.tsx:109` |
| Kayıt payload'u | `put("Bio", profile.bio)` — boş olduğu için multipart'a **hiç eklenmiyor** | `src/features/profile/profileSlice.ts:243` |
| Profil düzenleme | Tek çok satırlı alan, `z.string().max(500)` | `src/features/profile/components/EditProfileForm.tsx:2030`, `src/shared/schemas/formSchemas.ts:201` |
| Kart | "Beni böyle tanırsın" kutusu, `profile.bio &&` guard'lı | `src/features/discover/components/SwipeCard.tsx:2278` |
| Profil tamamlama | Dolu/boş ikili satır (`max: 1`) | `src/features/profile/screens/ProfileScreen.tsx:1408` |

Yani bugün bio'yu **yalnız profil düzenlemeye giren kullanıcılar** dolduruyor;
kayıttan gelen herkesin bio'su boş. Prompt'un kayıt akışına konmasının gerekçesi bu.

---

## 4. Önerilen sözleşme

### 4.1 Katalog — `GET /api/common/prompts`

Diğer `/api/common/*` uçlarıyla **birebir aynı desen** (bkz. `commonQueries.ts`
`HobbyGroupOption`): kategoriye gruplu, `enumName` gönderilen değer,
`display` çift dilli obje.

```json
{
  "isSuccess": true,
  "result": [
    {
      "category": "AboutMe",
      "categoryEnumName": "AboutMe",
      "categoryDisplay": { "tr": "Hakkımda", "en": "About me" },
      "prompts": [
        {
          "id": 1,
          "enumName": "MostEnjoyInLife",
          "name": "What I enjoy most in life",
          "display": {
            "tr": "Hayatta en çok şundan zevk alırım",
            "en": "What I enjoy most in life"
          },
          "maxLength": 150,
          "isActive": true
        }
      ]
    }
  ]
}
```

Kurallar:

1. **`display` her zaman `{tr, en}` objesi olsun**, sunucuda çözülmüş tek string
   değil. Katalog `staticGet` ile uygulama oturumu boyunca cache'leniyor
   (`src/shared/services/staticCache.ts`); tek dilde dönerse kullanıcı dil
   değiştirdiğinde cache elle busted edilmek zorunda kalır. Çift dilli objede
   bu problem hiç doğmuyor.
2. **`maxLength` prompt başına gelsin.** Bugün hepsi 150 olacak; ileride "en
   sevdiğim üç şey" gibi daha uzun bir prompt eklenirse istemci sürümü
   çıkmadan çalışsın. FE alan yoksa 150'ye düşer.
3. **Katalogdan prompt çıkarmak hard-delete OLMASIN.** `isActive: false` ile
   işaretlensin ve uçtan **dönmeye devam etsin**. Aksi hâlde o prompt'u
   cevaplamış kullanıcıların kaydı yetim kalır ve kartta çözülemez.
   `isActive: false` olan prompt seçim listesinde gösterilmez ama mevcut cevap
   çizilmeye devam eder.
4. Sıralama sunucudan gelen sırayla çizilir — kategori içi sıra deterministik olsun.

`API_ENDPOINTS`'e eklenecek satır: `GET_PROMPTS: "/api/common/prompts"`.

### 4.2 Okuma — profil ve kart DTO'ları

**Kendi profilim** (`GET /api/profile/GetMyProfile`) — düzenleme ekranı için
ham anahtar gerekiyor:

```json
"prompts": [
  { "promptKey": "MostEnjoyInLife", "answer": "sabaha karşı boş sahilde yürümekten" },
  { "promptKey": "MyIdealSunday",   "answer": "üç kahve ve hiçbir plan" }
]
```

**Kart DTO'su** (`ProfileCardDto`) — kartın soruyu ayrıca çözmesi gerekmesin:

```json
"prompts": [
  {
    "promptKey": "MostEnjoyInLife",
    "promptDisplay": "Hayatta en çok şundan zevk alırım",
    "answer": "sabaha karşı boş sahilde yürümekten"
  }
]
```

#### ⚠️ Bu bölümün en kritik maddesi — hangi dil?

`promptDisplay`, DTO'daki diğer `*Display` alanlarıyla aynı kuralı izlemeli:
**isteği atan kullanıcının diline göre sunucuda çözülür**
(`src/shared/types/index.ts:250` — "`*Display` alanları backend tarafından
KULLANICININ DİLİNE göre çözülmüş düz string'lerdir").

Yani: **prompt metni izleyicinin dilinde, cevap her zaman ham.** İngilizce
istemcide Türk bir profil açıldığında soru İngilizce, cevap kullanıcının yazdığı
Türkçe cümle olarak kalır. **`answer` hiçbir koşulda çevrilmesin veya
normalize edilmesin** (büyük/küçük harf, noktalama dahil).

`promptKey` kartta da gerekiyor: ileride prompt'a özel ikon/renk eşlemesi
yapılacak (`relationshipIntent` + `relationshipIntentDisplay` ikilisiyle aynı
gerekçe).

#### Alanın eklenmesi gereken uçlar

Kart şeklindeki DTO tek yerde üretilmiyor — **dördü de** güncellenmeli, yoksa
bazı ekranlarda bölüm boş çizilir:

| Uç | Ekran |
|---|---|
| `GET /api/swipe/GetPotentialMatches` | Keşif destesi |
| `GET /api/swipe/LikerProfile/{id}` | "Beni beğenenler" kartı |
| `GET /api/swipe/MissedMatches` | Kaçırılan eşleşme listesi |
| `GET /api/profile/GetMyProfile` | Profil önizleme (`PreviewModal`) |

#### Boş liste normal bir durum

Migration sonrası **mevcut kullanıcıların hepsi 0 prompt'la başlıyor**.
`prompts` boş dizi ya da `null` gelebilir; FE bölümü hiç çizmez. Bu geçici bir
hâl değil, kalıcı olarak geçerli bir durum (§4.6).

### 4.3 Yazma — multipart indeksli anahtar

Üç uç da `multipart/form-data`: `register-and-complete`, `CompleteProfile`,
`UpdateProfile`. `Hobbies` gibi tekrar eden anahtar deseni **çift taşıyamaz**
(hangi cevabın hangi anahtara ait olduğu kaybolur).

**Öneri — ASP.NET Core model binder'ının yerel desteklediği indeksli şekil:**

```
Prompts[0].PromptKey = MostEnjoyInLife
Prompts[0].Answer    = sabaha karşı boş sahilde yürümekten
Prompts[1].PromptKey = MyIdealSunday
Prompts[1].Answer    = üç kahve ve hiçbir plan
```

FE garantisi: indeksler **0'dan başlar ve boşluksuzdur**, en fazla 3 eleman.
Dizideki sıra = kartta çizilecek sıra; backend `DisplayOrder = index` olarak
saklasın ve okuma uçlarında **aynı sırayla** döndürsün.

Alternatif olarak tek bir `PromptsJson` string alanı da kabul edilebilir, ama
indeksli şekil tercih ediliyor: model binding, doğrulama ve hata mesajları
alan bazında çalışır (`Prompts[1].Answer` doğrudan hangi slotun hatalı olduğunu
söyler).

### 4.4 Kısmi güncelleme ve silme — `Prompts` gönderilirse **tam liste**

`UpdateProfile` partial ve FE'nin `put()` yardımcısı boş değerleri hiç
eklemiyor (`profileSlice.ts:219`). Bu yüzden semantik açıkça yazılmalı:

| İstek | Anlam |
|---|---|
| `Prompts[*]` alanları **hiç yok** | Prompt'lara dokunma (kullanıcı yalnız boyunu değiştirdi) |
| `Prompts[*]` **var** | Gelen liste **kullanıcının tam prompt setidir** — eskisi silinir, yenisi yazılır |

#### ⚠️ Anahtar bazlı birleştirme (merge) YAPILMASIN

"Gelen anahtarları güncelle, gelmeyenlere dokunma" mantığı kurulursa **prompt
silmek imkânsız hâle gelir**: 3'ten 2'ye inen kullanıcının isteği eski üçüncü
prompt'u olduğu yerde bırakır ve kullanıcı sildiğini sanır. Bu, bugün
`DisplayName`'de yaşanan tuzağın aynısı (boş isim sessizce yutuluyor,
bkz. `formSchemas.ts` yorumu) — tekrarlamayalım.

Replace semantiği + "en az 1" kuralı birlikte çalıştığı için boş liste hiç
gönderilmiyor; bu yüzden `PromptsCleared` gibi ek bir sentinel alana **gerek yok**.
Kullanıcı son prompt'unu silmek isterse FE zaten engelliyor ("en az bir tane
kalmalı").

### 4.5 Doğrulama ve hata kodları

| Kural | İhlalde |
|---|---|
| 1 ≤ adet ≤ 3 | 400 |
| `promptKey` katalogda var ve `isActive` | 400 |
| Aynı `promptKey` iki kez | 400 |
| `answer` trim sonrası boş değil | 400 |
| `answer` uzunluğu ≤ `maxLength` (150) | 400 |

**Hata kodu ailesi:** kullanılan bloklar bizde `UT-10xx` (oturum), `UT-3001`,
`UT-60xx` / `UT-61xx` (swipe + consumable). Profil prompt'ları için ayrı bir
blok isteniyor — öneri **`UT-22xx`**. ⚠️ **DOLDURULACAK:** bu blok boş mu,
backend teyit etsin.

Kodların ayrı olması önemli: FE hangi slotun reddedildiğini kullanıcıya inline
gösterecek, düz "profil güncellenemedi" mesajına düşmeyecek.

#### ⚠️ Karakter sınırı hangi birimde sayılıyor?

Sözleşmede **açıkça yazılsın.** İstemci canlı sayaç gösteriyor; sunucu farklı
birimle sayarsa kullanıcı "148/150" görürken 400 yer:

| Birim | "👨‍👩‍👧 kahve" kaç sayılır |
|---|---|
| UTF-16 code unit (C# `string.Length`) | 13 |
| Code point (`[...s].length`) | 9 |
| Grapheme (görünen karakter) | 7 |

**Öneri: code point.** JS'te `[...answer].length`, C#'ta
`new StringInfo(...)` yerine code point sayımı — ikisi de tek satır, emoji'de
sapmıyor. Hangisi seçilirse seçilsin FE aynısını uygular; karar backend'in.

Ayrıca `answer` içinde satır sonu: FE tek satırlık bir alan sunacak, ama
yapıştırma yoluyla `\n` gelebilir. Öneri: sunucu ardışık boşluk/satır sonlarını
tek boşluğa indirsin (bu, §4.2'deki "cevabı normalize etme" kuralının tek
istisnası ve kart düzenini koruyor).

### 4.6 "En az 1" kuralının kapsamı — global invariant DEĞİL

Kural yalnız iki yerde geçerli:

1. Kayıt (`register-and-complete` / `CompleteProfile`) — 0 prompt ile kayıt kapanmaz.
2. `UpdateProfile` isteğinde `Prompts` **gönderildiyse** — boş liste 400.

**Migration sonrası mevcut kullanıcıların hepsinin 0 prompt'u olacak.** Bu
kullanıcılar boyunu veya hobisini değiştirdiğinde `UpdateProfile` 400 dönmemeli.
Yani "her profilin en az 1 prompt'u olmalı" bir DB/servis invariant'ı olarak
kurulmasın — o kullanıcıları FE profil tamamlama satırıyla dürtecek.

---

## 5. Bio'nun kaldırılması

Karar: **tamamen silinsin.** Ama tek seferde değil — sahada `bio` yazan
sürümler var. Üç faz:

| Faz | Backend | FE | Not |
|---|---|---|---|
| 1 | `prompts` eklenir, `bio` aynen durur | Prompt'lar yazılır/okunur, bio alanı UI'dan kaldırılır | Geriye uyumlu, eski sürümler etkilenmez |
| 2 | `UpdateProfile` gelen `Bio` alanını **sessizce yok sayar** (400 DÖNMESİN) | — | Eski sürümler hâlâ `Bio` gönderiyor |
| 3 | Kolon + DTO alanı düşürülür | — | **Force-update eşiği bu sürümün üstüne çıktıktan sonra** |

Faz 2'deki "sessizce yok say" davranışının bizde emsali var: `UpdateUser`'ın
gövdesindeki `Email` 2026-08-22'den beri aynı şekilde yutuluyor
(`src/shared/constants/api.ts:26`). Aynı deseni izleyelim.

**Faz 3'te kart tarafı kırılmıyor** — doğrulandı: `SwipeCard` bio kutusunu
`profile.bio &&` guard'ıyla çiziyor (`SwipeCard.tsx:2278`), alan gelmeyince kutu
hiç render edilmez. Eski sürümlerde bölüm sessizce kaybolur, hata oluşmaz.

### ⚠️ KVKK / veri kaybı — migration öncesi çözülmeli

Bio metinleri kullanıcının yazdığı kişisel veri ve **taşınmıyor**. Bu bilinçli
bir karar, ama iki şey Faz 3'ten önce netleşmeli:

1. `GET /api/privacy/my-data` export'unda bio yer alıyor mu? Alıyorsa kolon
   düşmeden önce mevcut metinlerin bir kereye mahsus export'a girip girmeyeceği
   kararı gerekiyor.
2. Dolu bio'su olan kullanıcılara "profilindeki metin kaldırılıyor" duyurusu
   yapılacak mı, yapılacaksa kaç gün önce?

⚠️ **DOLDURULACAK** — karar KVKK/ürün tarafında.

Faz 3 öncesi bir sayı da isteniyor: **kaç kullanıcının bio'su dolu?**
Tek sorgu; sayı düşükse duyuru tartışması gereksiz yere büyümez.

---

## 6. Moderasyon — serbest metin yüzeyi 1'den 3'e çıkıyor

Bugün bio için FE'de moderasyon yüzeyi **yok**; sunucuda var mı bilmiyoruz.
Prompt'larla birlikte serbest metin hem üçe katlanıyor hem de kartta **öne
çıkan bir bölüm** hâline geliyor (bio gibi aşağıda değil).

Sorular:

1. Prompt cevapları metin moderasyonundan geçecek mi?
2. Geçecekse **senkron mu** (istek 400 + reasonCode ile geri döner) **asenkron mı**
   (fotoğraflardaki gibi `Review` → sonra karar)?
3. Asenkronsa fotoğraf moderasyonundaki K1 problemi burada da doğar: kullanıcı
   cevabının reddedildiğini **asla öğrenmez**. `backend_photo_moderation_proposal.md`
   §1'de önerilen hub olayı kanalı prompt'ları da kapsamalı.

**FE önerisi: Faz 1'de senkron ret yeter.** İstek `UT-22xx` ailesinden bir
reasonCode ile 400 dönsün, FE ilgili slotun altına inline hata yazsın. Asenkron
moderasyon gerekirse fotoğraf tarafıyla aynı `moderation` bloğu şekli
kullanılsın — iki farklı moderasyon sözleşmesi taşımak istemiyoruz.

Ayrıca **şikâyet payload'u**: bir kullanıcı prompt cevabı yüzünden şikâyet
edilirse `POST /api/moderation/report` hangi prompt'un şikâyet edildiğini
taşıyabilmeli (opsiyonel `promptKey` alanı). Yoksa moderatör hangi metne
bakacağını bilmiyor.

---

## 7. Kapsam dışı — backend'in **eklememesi** istenenler

Sözleşme yazılırken "madem varız" diye eklenmesi muhtemel üç şey; üçü de
bilinçli olarak dışarıda:

| Şey | Neden hayır |
|---|---|
| `thingsInCommon`'a prompt eşleşmesi | Aynı **soruyu** seçmek ortak nokta değil. Cevap benzerliği ise semantik karşılaştırma ister, bu fazın işi değil |
| Prompt bazlı keşif filtresi | Filtre ekranında yeri yok, istenmedi. `SWIPE_FILTERS` sözleşmesi değişmesin |
| Chat'ten belirli bir prompt'a cevap verme | Hinge'de var, bizde **şimdilik yok**. Mesaj DTO'suna `replyToPromptKey` gibi alan eklenmesin — ileride istenirse ayrı bir doküman olur |

---

## 8. Backend'den beklenen kararlar

| # | Karar | Durum |
|---|---|---|
| K1 | Katalog uç yolu `/api/common/prompts` onaylanıyor mu | Bekliyor |
| K2 | Prompt havuzunun ilk içeriği — kaç prompt, hangi kategoriler, tr/en metinler | ⚠️ **DOLDURULACAK** (ürün + backend birlikte) |
| K3 | Multipart şekli: indeksli `Prompts[i].PromptKey/Answer` onaylanıyor mu | Bekliyor |
| K4 | `Prompts` gönderilirse **replace** semantiği onaylanıyor mu (merge değil) | Bekliyor |
| K5 | Karakter sayım birimi (öneri: code point) | Bekliyor |
| K6 | `UT-22xx` hata kodu bloğu boş mu | ⚠️ **DOLDURULACAK** |
| K7 | Metin moderasyonu var mı, senkron mu | Bekliyor |
| K8 | Bio Faz 3 tarihi + KVKK duyuru kararı + dolu bio sayısı | ⚠️ **DOLDURULACAK** |

**K1, K3, K4, K5 netleşirse FE başlayabilir** — katalog içeriği (K2) mock'la
ilerletilebilir, ama alan adları sabitlenmeden kod yazmak istemiyoruz.

---

## 9. FE tarafı (bilgi amaçlı — backend'in beklemesine gerek yok)

Dokunulacak yerler:

| Dosya | Değişiklik |
|---|---|
| `src/shared/constants/api.ts` | `GET_PROMPTS` sabiti |
| `src/shared/queries/commonQueries.ts` | `PromptOption` / `PromptGroupOption` tipleri + query |
| `src/shared/types/index.ts` | `ProfileState.prompts`, `PotentialMatch.prompts`; `bio` alanları kaldırılır |
| `src/shared/schemas/formSchemas.ts` | `bio` şeması çıkar, `promptsSchema` girer (1–3, cevap ≤150) |
| `src/features/profile/components/EditProfileForm.tsx` | Bio bölümü → 3 slotlu prompt bölümü + seçim modal'ı |
| `src/features/profile/profileSlice.ts` | `put("Bio", …)` çıkar, indeksli prompt append'i girer (2 uçta) |
| `src/features/auth/registrationFlow.ts` | Yeni adım — `RegisterStep17`, Hobiler'den (Step13) sonra |
| `src/features/discover/components/SwipeCard.tsx` | "Beni böyle tanırsın" kutusu → prompt bölümleri |
| `src/features/profile/screens/ProfileScreen.tsx` | Tamamlama satırı: `bio` (max 1) → `prompts` (max 3) |
| `src/shared/i18n/translations/{tr,en}.ts` | `bio*` anahtarları çıkar, prompt metinleri girer |

Yeni kayıt adımı Hobiler'den sonraya konuyor: fotoğraf adımı (Step15) akışın
sonunda ve en yüksek terk noktası — iki ağır adımı arka arkaya koymak istemiyoruz.
Rota adı `RegisterStep17` olacak (numaralar tarihsel, akış sırası
`REGISTRATION_FLOW` dizisinden okunuyor).

Efor tahmini: **~2 gün**, backend'in işiyle paralel. Kritik yol FE değil, §8'deki
kararlar.

---

## Özet

| # | Öneri |
|---|---|
| 1 | `GET /api/common/prompts` — hobilerle aynı desen, `display: {tr,en}`, soft-delete |
| 2 | Kart DTO'sunda `promptKey` + `promptDisplay` (izleyicinin dili) + ham `answer` |
| 3 | Yazma multipart'ta indeksli: `Prompts[0].PromptKey` / `Prompts[0].Answer` |
| 4 | `Prompts` gönderildiyse **tam liste** — merge yok, yoksa silme imkânsız |
| 5 | 1–3 adet, tekrarsız, cevap ≤150 karakter; sayım birimi sözleşmede yazılı |
| 6 | "En az 1" global invariant değil — 0 prompt'lu eski kullanıcılar 400 almasın |
| 7 | Bio üç fazda düşer; Faz 2'de `Bio` sessizce yok sayılır (400 değil) |
| 8 | Metin moderasyonu için Faz 1'de senkron ret yeterli; asenkron olursa fotoğrafla aynı şekil |
