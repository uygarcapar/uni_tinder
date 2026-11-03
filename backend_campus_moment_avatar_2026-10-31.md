# Kampüs anları — DTO'ya **`mainPhotoUrl`** · ✅ **YAPILDI (2026-10-31)**

> **Durum: KAPANDI, aynı gün.** Backend uyguladı:
> - `CampusMomentDto.MainPhotoUrl` (nullable) — `CampusDtos.cs:131`.
> - `CampusQueryService`: sayfa kurulduktan sonra `LoadMainPhotosAsync` ile TEK
>   ek sorgu (≤52 satır, `LoadLikeBlockedAsync` deseni). Kendi anım listeden
>   önce çözülüyor ki avatar haritasına o da girsin (§2.4 karşılandı).
> - `CampusMomentService.CreateAsync` yanıtı da dolduruyor.
>   `LoadPosterAsync`e EKLENMEDİ: o yolu presence/geofence tetiği kullanıyor ve
>   orada avatar hiç okunmuyor.
> - Kural tek kaynaktan: `PhotoVisibility.VisibleMainUrl` — akıştaki
>   `author.mainPhotoUrl` ile birebir (yalnız onaylı foto; ana foto onaylı
>   değilse ilk onaylıya düşüyor; hiçbiri yoksa `null`). SQL'e elle çevirilip
>   kuralın ikinci kopyası doğurulmamış.
> - Adres `Photo.PhotoImageUrl` — mutlak CDN/S3, **imzasız ve her yanıtta aynı
>   dize**, yani §2.2–2.3 karşılandı. Gizlilik kapısı yok (§2.5).
> - Testler: `CampusMomentAvatarTests.cs` (7) + `DtoContractTests` snapshot'ında
>   tek alan farkı.
>
> **İstemcide bunun üzerine yapılanlar:**
> - `CampusMomentDto.mainPhotoUrl` eklendi — **opsiyonel** (`canLike` ile aynı
>   gerekçe: alanı taşımayan eski yanıtlar diskte/bellekte olabiliyor).
> - Avatar `campusAvatarUri` ile çözülüyor ve **üç durum ayrı**: dize → avatar;
>   `null` → avatar HİÇ çizilmiyor (anın fotoğrafına düşmek moderasyon kararını
>   delerdi); `undefined` (eski yanıt) → anın fotoğrafına düşülüyor.
> - **Geçici yedek SİLİNDİ**: kendi anımı `getMyProfile` ile çözen
>   `useOwnFeedAvatar` dalı kalktı (sunucu kendi anımı da dolduruyor).
> - Anın moderasyonu avatarı bağlamıyor — iki alan ayrı yaşıyor, testle çivili.

**Tek maddelik talep.** `CampusMomentDto`, anın fotoğrafının yanında kullanıcının
**profilindeki ana fotoğrafın** adresini de döndürsün: `mainPhotoUrl`. Mevcut
alanların hiçbiri değişmiyor, süzgeç/sıralama/kota kuralları aynı.

Kardeş alan **akışta zaten var** (`FeedPostDto.author.mainPhotoUrl`) ve aynı işi
görüyor; kampüs ucunda yok.

---

## 1. Gözlem — istek ve neden karşılanamadı

İstek: şeritteki kartın altındaki satırda, **adın solunda yuvarlak bir avatar**
dursun (alt tab bar'daki profil ikonu gibi). Avatar **kullanıcının profilindeki
ana fotoğraf** olacak.

İstemci bunu şu an **veremiyor**: `CampusMomentDto` yalnız `photoUrl` taşıyor ve
o **ANIN fotoğrafı** — o gün kampüste çekilmiş kare. Profil ana fotoğrafı için
DTO'da alan yok.

Ne yapılmadı ve neden:

- **Kart başına profil çekmek yok.** Kampüsün kendi profil ucu yok; profil ödünç
  uçtan geliyor (`/api/swipe/LikerProfile/{id}` ile aynı `ProfileCardDto`) ve
  **tam kartı** getiriyor. 20 kartlık bir şerit için 20 ağır istek demek — bir
  avatar bunu hak etmiyor.
- **`userId`den adres kurmak yok.** Uygulamanın hiçbir yerinde foto adresi
  istemcide kurulmuyor; §4'teki imza kuralı da buna izin vermiyor.

**İstemcide şu an ne var** (alan gelene kadar):

| Kart | Avatar kaynağı |
|---|---|
| Kendi anım (`isMine: true`) | **Gerçek ana fotoğraf** — `getMyProfile` (akışla aynı sorgu anahtarı, ek istek yok) |
| Başkasının anı | **Anın fotoğrafı** (`photoUrl`) — yedek |

Yani başkasının kartında avatar, büyük fotoğrafın küçük bir kopyası olarak
duruyor. Çalışıyor ama istenen bu değil.

---

## 2. Talep

`GET /api/campus/moments` ve `POST /api/campus/moments` yanıtlarındaki
`CampusMomentDto`ya tek alan:

```jsonc
CampusMomentDto {
  "id": "4471",
  "userId": "8812",
  "displayName": "Elif",
  "age": 21,
  "photoUrl": "https://…",        // ANIN fotoğrafı — DEĞİŞMİYOR
  "mainPhotoUrl": "https://…",    // YENİ: profilin ANA fotoğrafı, null olabilir
  "createdAt": "…",
  "expiresAt": "…",
  "mode": "Dating",
  "isMine": false,
  "canLike": true,
  "moderation": { … }
}
```

**Kurallar:**

1. **Nullable.** Ana fotoğrafı olmayan / moderasyonda düşmüş kullanıcıda `null`.
   İstemci `null`da avatarı **hiç çizmiyor** (boş gri daire kırık avatar gibi
   okunuyor) — yer tutucu bir adres göndermeyin.
2. **Mutlak adres.** §4'teki `photoUrl` kuralının aynısı: ya anın `expiresAt`ini
   aşan imzalı URL (≥25 saat) ya da opak CDN yolu. Göreli yol gelirse istemci API
   tabanına bağlıyor ama bu **yedek dal**, sözleşme değil.
3. **İmza ömrü boyunca sabit dize.** `photoUrl` için 2026-10-29 ekinde istenen
   şeyin aynısı: liste disk cache'inde ve cache anahtarı URL'in kendisi. Her
   yanıtta yeni imza = her tazelemede yeniden indirme.
4. **Kendi anımda da dolu gelsin.** Akışta sunucu kendi gönderimin
   `author.mainPhotoUrl`unu null bırakıyor ve istemci bu yüzden bir yedek yol
   taşımak zorunda kaldı (`useOwnFeedAvatar`). Aynı boşluğu burada açmayın.
5. **Gizlilik kapısı yok.** Ana fotoğraf kartın kendisinde zaten görünüyor
   (`photoUrl`), avatar yeni bir bilgi ifşa etmiyor. `age`/`universityDisplay`
   gibi gizlenebilir bir alan **değil**.

---

## 3. Geldiği gün istemcide ne olacak

`CampusMomentFace > CampusMomentCaption` içindeki sıra şuna iniyor:

```ts
moment.mainPhotoUrl ?? (moment.isMine ? ownAvatar : null) ?? campusPhotoUri(moment)
```

Yani **yedek yollar kendiliğinden ölü kalıyor**, silinmeleri ayrı ve risksiz bir
tur. İstemci tarafında sürüm kapısı/geçiş gerekmiyor: alan eksik gelen eski
yanıtlar bugünkü davranışa düşüyor.

---

## 4. Kapsam dışı

- Avatarın **boyutu/kırpımı** istemcinin işi (20pt daire) — sunucudan thumbnail
  varyantı **istemiyoruz**; tek adres yeter.
- `displayName`/`age` kuralları değişmiyor.
- Bu talebin karar/kota/mod süzgeçleriyle (`canLike`, mod kapısı) ilgisi yok.
