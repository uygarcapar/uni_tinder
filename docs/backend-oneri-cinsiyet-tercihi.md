# Öneri: Cinsiyet tercihini tek alana indirelim + profil cinsiyeti düzenlenebilir olsun

**Kimden:** Frontend
**Konu:** `PreferredGendersFlags` emekliye ayrılsın, `InterestedInFlags` tek kaynak olsun
**İlgili commit:** `445edf3` (FilterUpdateDto.InterestedIn eklendi)

---

## TL;DR — üç isteğimiz var

| # | İstek | Aciliyet |
|---|---|---|
| 1 | `HardFilterStage`'deki `hasGenderFilter` dalı kaldırılsın, cinsiyet filtresi her zaman `InterestedInFlags`'ten yürüsün | Yüksek |
| 2 | `InterestedIn = []` semantiği düzeltilsin — şu an kullanıcıyı uygulamadan siliyor | **Acil / bug** |
| 3 | `ProfileUpdateDto`'ya `Gender` eklensin — kullanıcı kendi cinsiyetini kayıttan sonra değiştiremiyor | Orta |

**Sıralama uyarısı (önemli):** `Genders` alanını DTO'lardan silmeden önce mutlaka 1. maddeyi
yapın. Detay aşağıda, "Yapılış sırası" bölümünde.

---

## 1. Bağlam: aynı işi yapan iki alan

`445edf3` sonrası filtre ekranında cinsiyete göre süzen **iki** alan var:

| Alan | Nereye yazılıyor | Nerede okunuyor |
|---|---|---|
| `Genders` | `PreferredGendersFlags` (`FiltersHandler.cs:94`) | Yalnızca `HardFilterStage.cs:148,312` |
| `InterestedIn` | `InterestedInFlags` (`FiltersHandler.cs:95-96`) | `HardFilterStage.cs:317-321` + `:350-352`, `CandidatePoolRefreshService.cs:194-198` |

### Sorun 1a: AND'lenmiyorlar, biri diğerini eziyor

`HardFilterStage.cs:309-322` if/else kuruyor:

```csharp
if (PreferredGendersFlags > 0)  allowed = FlagsToGenders(PreferredGendersFlags);
else                            allowed = InterestedInFlags'e uyan kategoriler;
```

Kullanıcı "Cinsiyet"ten tek chip seçtiği an `InterestedInFlags` dışa dönük filtrelemede
tamamen devre dışı kalıyor. Ama şunlar hâlâ `InterestedInFlags`'e bağlı:

- **Kimin onu göreceği** — `HardFilterStage.cs:350-352` (reciprocity)
- **ML öneri havuzu** — `CandidatePoolRefreshService.cs:194-198`
  (`PreferredGendersFlags`'i hiç bilmiyor)

Sonuç: "Cinsiyet = Kadın seçtim ama öneriler hâlâ erkek üretiyor" tarzı tutarsızlık.
UI'da ise iki bölüm eşit ağırlıkta, bağımsız iki filtre gibi duruyor.

### Sorun 1b: `PreferredGendersFlags` yapısal olarak eksik

`SD.cs:37-53` — `GenderType` 15 değer. `RegisterStep7`'de kullanıcı kategori + alt cinsiyet
seçiyor, DB'ye alt cinsiyetin kendisi gidiyor (`TransMale`, `Genderfluid`, `Agender`, ...).

`HardFilterStage.cs:362` `FlagsToGenders` **ham ordinal** eşliyor; filtre ekranı ise 4 chip
sunuyor. Somut sonuç:

> Deniz kayıt olurken "Erkek" kategorisinden **Trans Erkek** seçti → DB'de `TransMale`.
> Bir kullanıcı filtrede **Cinsiyet = "Erkek"** işaretlerse → `allowed = [Male]` →
> **Deniz hiçbir zaman karşısına çıkmaz.**
> Aynı kullanıcı **İlgi Alanı = "Erkek"** işaretlerse → `CategoriesOf(TransMale) = {Men}` →
> **Deniz çıkar.** ✅

`GenderCategoryHelper.CategoriesOf` doğrusunu yapıyor:
`TransMale → {Men}`, `Transgender → {Men, Women}`, 8 NB varyantı → `{NonBinary}`.

Ek olarak:

- `HardFilterStage.cs:338-352`'deki NonBinary görünürlük telafisi bu yolda işe yaramıyor —
  `:313`'teki `allowed.Contains(...)` AND'li olduğu için NB adaylar zaten eleniyor.
- FE'de `GenderType.Other` chip'i var ama `CommonController.GetGenders` 3 kategori döndüğü
  için kimse `Other` olarak kayıt olamıyor → tek başına seçilirse 0 aday.

Bu filtreyi düzgün çalıştırmanın tek yolu ya 15 chip'i tek tek listelemek ya da chip'leri
kategori gruplarına map'lemek — ki ikincisi zaten `InterestedIn`'in kendisi.

### Sorun 1c: Ürün standardı da bu yönde

Tinder / Hinge / Bumble / OkCupid'in hepsinde kimlik listesi geniş (20-50+ seçenek) ama
**gösterme filtresi her zaman 3 kova** (Erkek / Kadın / Herkes-NonBinary). Granüler cinsiyet
filtresi hiçbirinde yok — çünkü pratikte bir dışlama aracına dönüşüyor ve trans kullanıcıları
görünmez yapıyor. `PreferredGendersFlags`'in mevcut davranışı tam olarak bu.

Register akışınız zaten doğru ayrımı yapıyor: **Step7 = kim olduğun** (15 değer),
**Step10 = kimi görmek istediğin** (3 kategori). Filtre ekranı Step10'un devamı olmalı,
Step7'nin kopyası değil.

---

## İstek 1: `hasGenderFilter` dalı kaldırılsın

`HardFilterStage.cs:309-322` sadeleşsin — `PreferredGendersFlags` hiç okunmasın, cinsiyet
filtresi her koşulda `InterestedInFlags`'ten yürüsün:

```csharp
// Cinsiyet filtresi — tek kaynak: InterestedInFlags (kategori bazlı)
var allowed = Enum.GetValues<GenderType>()
    .Where(g => (currentUser.InterestedInFlags &
                 GenderCategoryHelper.GenderCategoryFlags(g)) != 0)
    .ToList();
query = query.Where(p => allowed.Contains(p.User.Gender));
```

Bununla `:148`'deki `hasGenderFilter` ve `:362`'deki `FlagsToGenders` de ölü kod olur.

**Neden bu yol:** DB'de `PreferredGendersFlags` ne yazarsa yazsın artık okunmaz, yani
migration veya veri temizliği gerekmez. Mevcut kullanıcıların kayıtlı değerleri kendiliğinden
etkisizleşir.

**Not:** `HardFilterStageTests` içinde 9 test `me.PreferredGendersFlags = 1 << (int)GenderType.Female`
kuruyor (satır 97, 134, 191, 229, 256, 281, 317, 346, 376). Bunların `InterestedInFlags`
üzerinden yeniden yazılması gerekecek. `:164`'teki test (`= 0` → fallback) zaten yeni davranışı
test ediyor.

### Yapılış sırası — dikkat

`Genders` alanını `FilterUpdateDto` / `FilterResponseDto`'dan **silmeden önce** yukarıdaki dal
kaldırılmalı. Aksi halde:

1. DTO'dan alan silinir → FE'nin gönderdiği `genders` sessizce yok sayılır
   (`JsonSerializerOptions` default'u unknown member'ı atıyor)
2. Eski kullanıcıların DB'deki `PreferredGendersFlags`'i dolu kalır
3. `HardFilterStage.cs:148` if-dalına girmeye devam eder
4. → **Kullanıcının artık göremediği, kapatamadığı görünmez bir filtre kalıcı olur**

Önerilen sıra:

| Faz | İş | Sonuç |
|---|---|---|
| 1 | `hasGenderFilter` dalı kaldırılır | `PreferredGendersFlags` etkisizleşir, veri temizliği gerekmez |
| 2 | FE Cinsiyet bölümünü siler | UI sadeleşir |
| 3 | (opsiyonel, sonra) `Genders` DTO alanları + `GendersToFlags` + kolon migration ile düşürülür | Ölü kod temizlenir |

**Eğer 1. fazı yapmayacaksanız** `Genders` alanı DTO'da kalmalı ve silinmemeli — o durumda FE
Apply'da bir kez `genders: []` gönderip eski kayıtları temizleyecek. Bu da çalışır ama
kullanıcı Apply'a basana kadar eski filtre yürürlükte kalır. 1. faz daha temiz.

---

## İstek 2: `InterestedIn = []` semantiği — acil

`FilterUpdateDto.InterestedIn` XML yorumu **"boş liste = herkes (7)"** diyor, ama
`FiltersHandler.cs:95-96` şunu yapıyor:

```csharp
if (filterDto.InterestedIn != null)
    profile.InterestedInFlags = GenderCategoryHelper.InterestedInToFlags(filterDto.InterestedIn);
```

`InterestedInToFlags([])` → **0**. 7'ye düşen hiçbir fallback yok.

Ve `0` "herkes" değil, **"hiç kimse"** demek — üç yerden birden:

- `HardFilterStage.cs:317-321` → `allowed` boş liste → kullanıcı sıfır aday görür
- `CandidatePoolRefreshService.cs:194-198` → öneri havuzu boş kalır
- `HardFilterStage.cs:350-352` → başkalarının sorgusunda `p.InterestedInFlags & cgCatFlags` = 0
  → kullanıcı **herkesin destesinden düşer**

Yani boş dizi kullanıcıyı iki yönlü olarak uygulamadan siliyor. `Profile.cs:52`'de default'un
`7` olması ve register'da min-1 dayatılması (`interestedInSchema`) tam da bu yüzden.

**İstediğimiz:** ya yorumun dediği gibi `Count == 0` → `7` yazılsın, ya da boş liste 400 ile
reddedilsin. İkisi de olur, sizin tercihiniz — yeter ki kod ve yorum aynı şeyi söylesin.

**FE tarafında şimdilik guard koyduk:** üç seçenek de kapalıyken Apply kilitli ve boş dizi hiç
gönderilmiyor. Ama tek koruma FE'de kalmasın.

> Not: `genders: []` güvenli (flags 0 = filtre yok), `interestedIn: []` değil. İki alanın
> boş-dizi semantiği zıt — bu asimetri de tek alana inmek için ayrı bir gerekçe.

---

## İstek 3: `ProfileUpdateDto.Gender` eklensin

Kullanıcı **kendi cinsiyetini kayıttan sonra hiçbir yerden değiştiremiyor**:

- `ProfileUpdateDto`'da `Gender` alanı yok
- `ProfileController` cinsiyeti hiçbir yerde güncellemiyor
- FE'de de (`EditProfileForm`, `profileService`) alan yok

Yani Step7'de yanlış seçen ya da kimliği zamanla değişen kullanıcı kilitli kalıyor. Bu,
`InterestedIn`'in başına gelenin aynısı — o filtreye taşınarak çözüldü, bu hâlâ açıkta.
Sektörde kimlik alanı her zaman düzenlenebilir; özellikle trans kullanıcılar için kritik.

**İstediğimiz:**

```csharp
// ProfileUpdateDto
public GenderType? Gender { get; set; }

// ProfileController
if (updateDto.Gender.HasValue)
{
    user.Gender = updateDto.Gender.Value;
    await _candidatePool.InvalidatePoolAsync(userId);  // ← önemli
}
```

`InvalidatePoolAsync` şart: cinsiyet değişince reciprocity etkileniyor
(`HardFilterStage.cs:350-352` viewer'ın kategorisine bakıyor), eski havuz geçersiz kalır.
`FiltersHandler` zaten aynı şeyi yapıyor.

---

## FE'de bizim yapacaklarımız

1. Filtre modalından "Cinsiyet" bölümünü kaldırıyoruz (chip'ler + `genderOptions`).
2. Edit Profile'a cinsiyet seçimi ekliyoruz — `RegisterStep7Screen`'deki kategori + alt cinsiyet
   picker'ının aynısı, ortak component'e çıkarılarak.
3. `activeFilterCount`'tan `genders` kontrolünü çıkarıyoruz.
4. `discover.filters.gender.*` çevirilerini siliyoruz.
5. Boş `interestedIn` guard'ı zaten eklendi (İstek 2'nin FE tarafı).

Küçük bir soru: Edit Profile'daki picker için `GET /api/common/genders`'ı kullanalım mı?
Şu an FE'de liste hardcoded (`RegisterStep7Screen.GENDER_CATEGORIES`) ve endpoint hiç
çağrılmıyor. Endpoint'e geçersek liste tek kaynaktan yönetilir.

---

## Özet karar tablosu

| Konu | Önerimiz |
|---|---|
| Cinsiyet tercihi kaç alan? | Tek — `InterestedInFlags` |
| `PreferredGendersFlags` | Emekli. Önce okuma dalı kaldırılsın, DTO/kolon temizliği sonra |
| `Genders` DTO alanı hemen silinsin mi? | **Hayır** — önce `hasGenderFilter` dalı kalksın, yoksa görünmez filtre kilitlenir |
| `interestedIn: []` | Ya `7` yazılsın ya 400 dönsün. Şu anki davranış (0) hesabı karartıyor |
| Kendi cinsiyeti düzenleme | `ProfileUpdateDto.Gender` + `InvalidatePoolAsync` |
