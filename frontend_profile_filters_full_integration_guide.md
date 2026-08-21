# Profil Alanları & Filtreler — Tam Frontend Entegrasyon Rehberi

**Tarih:** 2026-08-17
**Kapsam:** Register (kayıt), Edit Profile (profil düzenleme) ve Filter (keşif filtreleri)
ekranlarının backend sözleşmesi — hangi alan nerede var, hangi endpoint'e nasıl gider.

> **Bu doküman neden var:** Elimizde dolaşan eski bir denetim tablosu birçok alanı
> "backend'de yok" diye işaretliyordu. Kod kontrol edildi: **o alanların neredeyse hepsi
> zaten mevcut**, sadece frontend'e duyurulmamıştı. Bu rehber üç ekranın tam sözleşmesini
> tek yerde topluyor. Ayrıca bu sürümle **iki yeni filtre** eklendi (dil, dini görüş).

---

## 0. Genel kurallar

### Enum'lar JSON'da STRING

`Program.cs`'te `JsonStringEnumConverter` aktif. Tüm enum alanları **isimle** gider ve gelir:

```jsonc
{ "smokingStatus": "None" }   // ✅ doğru
{ "smokingStatus": 0 }        // ❌ hata alırsınız
```

Enum isimleri aşağıdaki bölümlerde birebir listelendi — bunlar C# enum üye adlarıdır,
Türkçe karşılıkları kullanıcıya gösterilecek etiketlerdir.

### Görüntü etiketleri backend'den gelir

Profil okuma yanıtlarında her enum alanının bir de `...Display` eşi var
(`smokingStatus` → `smokingStatusDisplay`). Bunlar `Accept-Language` header'ına göre
tr/en döner. **Etiketleri frontend'de hard-code etmeyin**, `Display` alanını kullanın.

Enum listelerini dinamik çekmek için `CommonController` endpoint'leri var
(`/api/common/GetReligiousViews` vb.).

### Hata yanıtları

Yapılandırılmış: `code` (ör. `UT-1006`), `message`, `action`. **Switch'i her zaman `code`
üzerinden yapın**, `message` metnine göre değil.

### Partial update ve "clear" semantiği

`PUT /api/profile/UpdateProfile` partial'dır: **göndermediğiniz alan değişmez.**
Bir alanı *temizlemek* için `null` göndermek yetmez — `null` "değiştirme" demektir.
Temizlemek için ilgili `clear...` bayrağını kullanın:

```jsonc
{ "clearReligiousView": true }   // dini görüşü kaldırır
{ "religiousView": null }        // hiçbir şey yapmaz
```

Mevcut clear bayrakları: `clearHobbies`, `clearSpokenLanguages`, `clearPets`,
`clearSmokingStatus`, `clearHasPets`, `clearZodiacSign`, `clearUsagePurpose`,
`clearAlcoholUsage`, `clearReligiousView`, `clearRelationshipIntent`.

⚠️ **Filtrelerde bu kural TERSİNE**: `PUT /api/swipe/UpdateFilters` premium alanlarda
*overwrite* semantiği kullanır — `null`/boş liste göndermek filtreyi **temizler**.
Tek istisna `dealbreakers`: orada `null` = "değiştirme".

---

## 1. Endpoint özeti

| Ekran | Method | Endpoint | Content-Type |
|---|---|---|---|
| Kayıt (tek adım) | `POST` | `/api/auth/RegisterAndComplete` | `multipart/form-data` |
| Profili oku | `GET` | `/api/profile/GetMyProfile` | — |
| Profili düzenle | `PUT` | `/api/profile/UpdateProfile` | `multipart/form-data` |
| Filtreleri oku | `GET` | `/api/swipe/Filters` | — |
| Filtreleri yaz | `PUT` | `/api/swipe/UpdateFilters` | `application/json` |

> Kayıt ve profil düzenleme **multipart** (fotoğraf taşıdıkları için).
> Filtre güncelleme düz **JSON**.

---

## 2. Alan matrisi

Üç ekranda hangi alanın olduğunu gösterir. ✅ = mevcut, ❌ = bilinçli olarak yok.

| Alan | Register | Edit Profile | Filter |
|---|:---:|:---:|:---:|
| Fotoğraflar (2–6) | ✅ | ✅ | ❌ |
| Bio | ✅ | ✅ | ❌ |
| Boy | ✅ | ✅ | ✅ aralık (premium) |
| Bölüm | ✅ | ✅ | ✅ premium |
| Sınıf | ✅ | ✅ | ✅ çoklu (premium) |
| Hobiler (max 10) | ✅ | ✅ | ✅ `preferredHobbies` (premium, sıralama) |
| Kullanım amacı | ✅ tek | ✅ tek | ✅ çoklu (premium) |
| İlişki niyeti | ✅ tek | ✅ tek | ✅ çoklu (premium, sıralama) |
| Sigara | ✅ | ✅ | ✅ çoklu (premium) |
| Alkol | ✅ | ✅ | ✅ çoklu (premium) |
| Burç | ✅ | ✅ | ✅ çoklu (premium) |
| **Dini görüş** | ✅ | ✅ | ✅ **YENİ** çoklu (premium) |
| **Diller** | ✅ | ✅ | ✅ **YENİ** çoklu (premium) |
| Evcil hayvan | ✅ | ✅ | ✅ çoklu + 3-mod (premium) |
| Cinsiyet (kendi) | ✅ | ✅ | — |
| İlgilendiğim cinsiyet | ✅ | ❌ (filtreye taşındı) | ✅ `interestedIn` (ücretsiz) |
| Konum | ✅ (lat/lon) | ✅ ayrı endpoint | ✅ şehir (premium) + mesafe |
| Görünürlük ayarları | ✅ 4 bayrak | ✅ 4 bayrak | ✅ farklı: üni allow/block |
| Üniversite tercihi | ❌ (mailden otomatik) | ❌ salt-okunur | ✅ premium |
| Ad / doğum tarihi | ✅ | ❌ **düzenlenemez** | ❌ (yaş aralığı var) |

**Notlar:**
- **Üniversite kullanıcıya sorulmaz** — doğrulanmış e-posta domain'inden otomatik atanır.
- **Ad ve doğum tarihi kayıttan sonra değiştirilemez** (kimlik/yaş tutarlılığı).
  Yaş filtresi `ageRangeMin`/`ageRangeMax` ile yapılır.
- **İlgilendiğim cinsiyet** profil düzenlemeden çıkarıldı, artık filtre ekranında
  (`interestedIn`) ve **ücretsiz**.

---

## 3. Enum değerleri

Aşağıdakiler API'ye gönderilecek **birebir** değerlerdir.

**`SmokingStatusType`** — `None` (Kullanmıyorum), `Smoker` (Kullanıyorum), `Occasional` (Arada sırada)

**`AlcoholUsageType`** — `None` (Kullanmıyorum), `Socially` (Sosyal içici), `Regularly` (Düzenli)

**`ReligiousViewType`** — `Muslim` (Müslüman), `Christian` (Hristiyan), `Jewish` (Musevi),
`Deist` (Deist), `Atheist` (Ateist), `Agnostic` (Agnostik), `Spiritual` (Spiritüel),
`Other` (Diğer), `PreferNotToSay` (Belirtmek istemiyorum)

**`AppUsagePurposeType`** — `Dating` (Flört), `Friendship` (Arkadaşlık),
`Networking` (Network), `JustLooking` (Öylesine)

**`RelationshipIntentType`** — `LongTerm` (Uzun süreli), `ShortTerm` (Kısa süreli),
`LongTermOpenToShort` (Uzun süreli, kısaya da açık),
`ShortTermOpenToLong` (Kısa süreli, uzuna da açık), `StillFiguringOut` (Henüz karar vermedim)

**`ZodiacType`** — `Aries`, `Taurus`, `Gemini`, `Cancer`, `Leo`, `Virgo`, `Libra`,
`Scorpio`, `Sagittarius`, `Capricorn`, `Aquarius`, `Pisces`

**`PetType`** — `Dog` (Köpek), `Cat` (Kedi), `Bird` (Kuş), `Fish` (Balık), `Rabbit` (Tavşan),
`Hamster` (Hamster), `Reptile` (Sürüngen), `Horse` (At), `Exotic` (Egzotik),
`None` (Yok), `Allergic` (Hayvan sevmiyorum), `Other` (Diğer)

**`ClassYearType`** — `Preparatory` (Hazırlık, 0), `First`…`Sixth` (1–6)

**`InterestedInType`** — `Men` (Erkekler), `Women` (Kadınlar), `NonBinary`

**`GenderType`** (15 değer) — `Male`, `Female`, `NonBinary`, `Other`, `PreferNotToSay`,
`Transgender`, `TransMale`, `TransFemale`, `Genderfluid`, `Genderqueer`, `Agender`,
`Bigender`, `Intersex`, `TwoSpirit`, `Pangender`

**`LanguageType`** (34 değer) — `Turkish`, `English`, `German`, `French`, `Spanish`,
`Italian`, `Portuguese`, `Russian`, `Arabic`, `Persian`, `Kurdish`, `Chinese`, `Japanese`,
`Korean`, `Hindi`, `Urdu`, `Greek`, `Dutch`, `Swedish`, `Norwegian`, `Danish`, `Finnish`,
`Polish`, `Czech`, `Hungarian`, `Romanian`, `Bulgarian`, `Hebrew`, `Thai`, `Vietnamese`,
`Indonesian`, `Tagalog`, `Azerbaijani`, `Other`

`UniversityDepartment` ve `TurkeyCity` çok uzun — `/api/common/` endpoint'lerinden çekin.

---

## 4. Kayıt — `POST /api/auth/RegisterAndComplete`

`multipart/form-data`. Öncesinde e-posta doğrulama akışı tamamlanıp
`emailVerifiedToken` alınmış olmalı.

### Zorunlu alanlar

| Alan | Tip | Kısıt |
|---|---|---|
| `emailVerifiedToken` | string | Doğrulama adımından |
| `email` | string | Üniversite maili |
| `firstName` | string | 1–50 |
| `displayName` | string | ≤100 |
| `gender` | `GenderType` | |
| `dateOfBirth` | date | 18+ |
| `password` | string | ≥8 karakter |
| `height` | int | 140–220 |
| `department` | `UniversityDepartment` | |
| `yearOfStudy` | int | 0–6 (0=hazırlık) |
| `latitude` / `longitude` | double | Şehir bundan türetilir |
| `interestedIn` | `InterestedInType[]` | ≥1 |
| `hobbies` | `Hobbies[]` | 1–10 |
| `photos` | file[] | **2–6 adet** |

### Opsiyonel alanlar

`bio` (≤500), `sexualOrientation`, `ageRangeMin` (vars. 18), `ageRangeMax` (vars. 30),
`maxDistance` (vars. 50), `mainPhotoIndex` (vars. 0),
`smokingStatus`, `alcoholUsage`, `zodiacSign`, `usagePurpose`, `relationshipIntent`,
`religiousView`, `hasPets`, `pets` (≤8), `spokenLanguages` (≤15),
`showMyUniversity` / `showMeOnApp` / `showDistance` / `showAge` (hepsi vars. `true`).

> ⚠️ `city` / `district` **göndermeyin** — `latitude`/`longitude`'dan otomatik türetilir.
> `universityDomain` de göndermeyin — e-posta domain'inden atanır.

---

## 5. Profil düzenleme — `PUT /api/profile/UpdateProfile`

`multipart/form-data`. **Partial**: sadece değişen alanları gönderin.

**Düzenlenebilir:** `displayName`, `bio`, `language` (`"tr"`/`"en"`), `height` (140–220),
`department`, `yearOfStudy` (0–8), `gender`, `ageRangeMin`/`ageRangeMax`, `maxDistance`,
`hobbies` (≤10), `spokenLanguages` (≤15), `pets` (≤8), `smokingStatus`, `alcoholUsage`,
`zodiacSign`, `usagePurpose`, `relationshipIntent`, `religiousView`, `hasPets`,
`instagramUsername` (≤30), görünürlük bayrakları (4 adet).

**Fotoğraf yönetimi:** `newPhotos` (file[]), `photoIdsToDelete` (int[]),
`newMainPhotoId` (int), `photoOrders`.

**Düzenlenemez:** ad, doğum tarihi, e-posta, üniversite (§2'deki nota bakın).
`interestedIn` de burada değil — filtre ekranında.

Temizleme için §0'daki `clear...` bayraklarını kullanın.

---

## 6. Filtreler — `GET` / `PUT /api/swipe/Filters`

### Okuma: `GET /api/swipe/Filters`

Filtre ekranını bu yanıtla init edin. Kritik alanlar:

```jsonc
{
  "isPremium": false,
  "premiumExpiresAt": null,

  // Ücretsiz
  "ageRangeMin": 18, "ageRangeMax": 30, "maxDistance": 50,
  "genders": [], "interestedIn": ["Women"],

  // Premium
  "preferredCity": null, "preferredDepartment": null,
  "yearsOfStudy": [], "heightMin": null, "heightMax": null,
  "zodiacSigns": [], "smokingStatuses": [], "alcoholUsages": [],
  "spokenLanguages": [],   // ⭐ YENİ
  "religiousViews": [],    // ⭐ YENİ
  "hasPets": null, "pets": [],
  "usagePurposes": [], "relationshipIntents": [],
  "preferredHobbies": [],
  "hairColors": [], "hairStyles": [], "eyeColors": [], "facialHairs": [], "hasGlasses": null,

  // Üniversite (premium)
  "preferredUniversityDomains": [],        // ben kimi göreyim (max 3)
  "visibleOnlyToUniversityDomains": [],    // beni kim görsün (allowlist)
  "hiddenFromUniversityDomains": [],       // beni kim görmesin (blocklist)

  // UI'ı yönlendiren meta listeler — hard-code etmeyin, bunları okuyun
  "premiumOnlyFields": [...],
  "dealbreakerCapableFields": ["YearOfStudy","Height","Zodiac","Smoking","Pets",
                               "UsagePurpose","Alcohol","Language","Religion"],
  "rankingOnlyFields": ["HairColors","HairStyles","EyeColors","FacialHairs",
                        "HasGlasses","PreferredHobbies","RelationshipIntents"],
  "dealbreakers": []
}
```

**Üç meta listeyi mutlaka kullanın:**

- `premiumOnlyFields` — hangi kontrole kilit ikonu koyacağınızı söyler.
- `rankingOnlyFields` — bu filtreler **eleme yapmaz**, sadece sıralamayı etkiler.
  UI'da "bu tercih önerileri şekillendirir, profilleri engellemez" diye sunun
  (Tinder'ın boy filtresindeki şeffaflık yaklaşımı).
- `dealbreakerCapableFields` — hangi filtrelerin "olmazsa olmaz" toggle'ı olabileceği.

### Yazma: `PUT /api/swipe/UpdateFilters`

`application/json`. **Overwrite semantiği** — §0'daki uyarıya dikkat.

```jsonc
{
  "ageRangeMin": 20,
  "ageRangeMax": 28,
  "maxDistance": 50,
  "interestedIn": ["Women"],

  "spokenLanguages": ["English", "German"],   // ⭐ YENİ
  "religiousViews": ["Muslim", "Agnostic"],   // ⭐ YENİ

  "smokingStatuses": ["None"],
  "pets": ["Cat", "Dog"],

  "dealbreakers": ["Language", "Alcohol"]
}
```

**Mesafe tavanı:** ücretsiz 50 km, premium 100 km. Tavanın üstü **400 dönmez**,
sessizce clamp'lenir. `0 = sınırsız` semantiği kaldırıldı.

**Dealbreaker (`dealbreakers`)** — "olmazsa olmaz" işaretlenen filtreler. Listedeki filtre
aday tükense bile gevşetilmez; listede olmayan filtre keşif boşaldığında otomatik düşer
(Bumble'ın "see other people if I run out" davranışı).
Şehir/bölüm/üniversite bu listeye **dahil değil** — onlar her zaman katı.
`null` = değiştirme (diğer alanlardan farklı!), boş liste = hepsini esnet.

---

## 7. ⭐ YENİ: Dil ve dini görüş filtreleri

Bu sürümle eklendi. İkisi de **premium** ve **hard filtre** (eleme yapar).

### Dil — `spokenLanguages`

```jsonc
{ "spokenLanguages": ["English", "German"] }
```

**OR semantiği:** aday, seçilenlerden **en az birini** konuşuyorsa geçer.
"İngilizce **veya** Almanca bilen", "ikisini birden bilen" değil.

UI metni önerisi: *"Şu dillerden en az birini konuşsun"*.

| Adayın dilleri | `["English","German"]` filtresi |
|---|---|
| `["English"]` | ✅ geçer |
| `["Turkish","English"]` | ✅ geçer |
| `["Turkish"]` | ❌ elenir |
| `[]` (belirtmemiş) | ❌ elenir |

### Dini görüş — `religiousViews`

```jsonc
{ "religiousViews": ["Muslim", "Agnostic"] }
```

Seçilen görüşlerdeki adaylar gelir; **belirtmemiş adaylar elenir**
(alkol/sigara/burç filtreleriyle aynı semantik).

> ⚠️ **UI uyarısı:** Dini görüşünü belirtmemiş VE `PreferNotToSay` seçmiş kullanıcılar,
> bu filtre aktifken keşif havuzundan tamamen çıkar. Kullanıcıya bunu görünür kılın —
> aksi halde "neden kimse gelmiyor" şikâyeti gelir. Filtreyi dealbreaker yapmadan
> bırakmak (varsayılan) aday tükendiğinde otomatik gevşemesini sağlar.

### Dealbreaker isimleri

`dealbreakers` listesinde bu iki filtre için: `"Language"` ve `"Religion"`.

### Boş sonuç davranışı

İki filtre de `dealbreakerCapableFields` içinde. Dealbreaker **değilse**, aday havuzu
boşaldığında otomatik düşer ve kullanıcı profil görmeye devam eder. Dealbreaker **ise**,
sonuç sıfır olsa bile gevşemez — boş deck ekranını buna göre hazırlayın.

---

## 8. Test kontrol listesi

- [ ] Enum'lar **string** gönderiliyor (sayı değil)
- [ ] Kayıtta 2–6 fotoğraf zorunluluğu
- [ ] Kayıtta `city`/`district`/`universityDomain` **gönderilmiyor**
- [ ] Profil düzenlemede alan temizleme `clear...` bayrağıyla (null ile değil)
- [ ] Filtrede tersi: boş liste = temizle
- [ ] `dealbreakers: null` gönderilince mevcut ayar korunuyor
- [ ] `premiumOnlyFields` okunarak kilit ikonları çiziliyor (hard-code değil)
- [ ] `rankingOnlyFields` "engellemez, sıralar" diye sunuluyor
- [ ] Ücretsiz kullanıcı `maxDistance: 100` gönderince 400 almıyor (50'ye clamp'lenir)
- [ ] Dil filtresi OR mantığıyla çalışıyor
- [ ] Din filtresinin "belirtmemişleri eler" etkisi kullanıcıya anlatılıyor
- [ ] Ad/doğum tarihi düzenleme UI'da yok

---

## 9. Backend tarafında bu sürümde değişenler

Yeni migration: `AddLanguageAndReligiousFilters` — üç kolon (`SpokenLanguageFlags`,
`PreferredLanguageFlags`, `PreferredReligiousFlags`) + mevcut kullanıcılar için backfill.

Frontend'i etkileyen **tek** değişiklik: `FilterUpdateDto` ve `FilterResponseDto`'ya
`spokenLanguages` ve `religiousViews` alanlarının eklenmesi, ve
`dealbreakerCapableFields`'a `"Language"` / `"Religion"` girmesi.
**Mevcut alanların hiçbiri değişmedi** — geriye dönük uyumlu.
