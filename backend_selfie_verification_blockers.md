# Selfie doğrulama — FE entegrasyonunda çıkan backend bulguları

Tarih: 2026-09-06
Kaynak sözleşme: `docs/frontend_selfie_verification_full_guide.md` (2026-09-03)
FE durumu: akış uçtan uca yazılmış, `origin/master` üzerinde (`59934e1` + sonrası)
Backend durumu: kod büyük ölçüde tamam, **flag kapalı**, aşağıdaki 2 madde eksik

---

## 0. Özet

| # | Bulgu | Ağırlık | Kimde |
|---|---|---|---|
| 1 | `DataTransferAbroad` policy registry'de **yok** → rıza adımı kapanamıyor | 🔴 **Blocker** | Backend |
| 2 | `ProfileCardDto`'da `IsSelfieVerified` **yok** → rozet başkalarına görünmüyor | 🔴 **Ciddi** | Backend |
| 3 | `SelfieVerification:Enabled = false` → `/start` 404 | ⚙️ Konfig | Backend/DevOps |
| 4 | Test cihazında `UT-6505` sonrası giriş 24 sa gizleniyor | ⚠️ Test tuzağı | FE çözdü, bilgi amaçlı |
| 5 | Gölge mod / eşik izleme | 📋 Planlı | Backend |

**1 numara olmadan flag açılsa bile hiçbir kullanıcı doğrulamayı tamamlayamaz.
2 numara olmadan da doğrulayan kullanıcının rozetini kendisinden başkası görmez** —
yani özelliğin kullanıcı için tek somut çıktısı çalışmıyor.

Kalan her şeyi (11 sebep kodu, resx tr/en, havuz, sıfırlama, bildirim, rate limit,
DI, migration) kontrol ettim — hepsi doğru ve eksiksiz.

---

## 1. 🔴 BLOCKER — `DataTransferAbroad` için policy metni yok

### Durum

`PrivacyController.cs:35-42` — `_policyRegistry`:

```csharp
private static readonly Dictionary<ConsentType, (string Version, string FileName)> _policyRegistry = new()
{
    [ConsentType.PrivacyPolicy]          = ("2.0", "privacy-policy-v2.0.md"),
    [ConsentType.TermsOfService]         = ("1.0", "terms-of-service-v1.0.md"),
    [ConsentType.BiometricVerification]  = ("1.0", "biometric-verification-v1.0.md")
    //  ❌ DataTransferAbroad YOK
};
```

`wwwroot/legal/` içeriği:

```
biometric-verification-v1.0.md   ✅
privacy-policy-v1.0.md
privacy-policy-v2.0.md
terms-of-service-v1.0.md
                                 ❌ data-transfer-abroad dosyası yok
```

Yani `GET /api/privacy/policy/DataTransferAbroad` → **404** (`PrivacyController.cs:72-81`,
"Bilinmeyen policy türü").

### Neden bu akışı tamamen kilitliyor

`SelfieVerificationService.StartAsync` **iki** rıza arıyor
(`SelfieVerificationService.cs:84-86`):

```csharp
await EnsureConsentAsync(userId, ConsentType.BiometricVerification, ct);
await EnsureConsentAsync(userId, ConsentType.DataTransferAbroad, ct);
```

FE bu yüzden iki metni de çekiyor ve iki ayrı onay kutusu gösteriyor. Zincir:

```
/start → UT-6501 → FE rıza adımını açar
  ├─ GET /policy/BiometricVerification  → 200 { version:"1.0", contentMarkdown }  ✅
  └─ GET /policy/DataTransferAbroad     → 404                                     ❌
       └─ FE i18n yedek metnini gösterir (ekran kilitlenmesin diye), kutu işaretlenebilir
            └─ kullanıcı "Onaylıyorum"a basar
                 └─ SelfieConsentStep.handleAccept: version YOK
                      └─ "Onayların kaydedilemedi." — ÇIKIŞ YOK
```

FE'nin sürümü uydurması **bilerek engellendi** — rehber §3.3:

> `version` **sunucudan geldiği gibi** taşınır. Sabit kodlama: metin güncellenince
> yeniden rıza gerekir, sabit kodlanmış sürüm bunu sessizce atlar.

`"1.0"` yazsaydık `accept-consent` kaydı geçerdi (`AcceptConsentDto.Version`
serbest string), `/start` de açılırdı — ama KVKK kanıt kaydında kullanıcının
**hiç görmediği** bir metne rıza vermiş görünürdü. Bu yüzden FE tarafında
kapatmıyoruz.

### İstenen

1. `wwwroot/legal/data-transfer-abroad-v1.0.md` eklensin.
   İçeriğinde geçmesi gerekenler (rehber §8, FE metinleri buna göre yazıldı):
   - Karşılaştırmanın **AWS `us-east-1` (ABD)** üzerinde yapıldığı
   - Aktarılan verinin **selfie karesi + ana fotoğraf**, saklanmadığı
     (bellekte işlenip atılıyor)
   - Hukuki dayanak: **KVKK m.9 açık rıza**
   - Rızanın **geri alınabildiği**; geri alınınca rozetin kalkacağı ama hesabın
     ve eşleşmelerin etkilenmeyeceği

2. Registry'ye eklensin:

```csharp
[ConsentType.DataTransferAbroad] = ("1.0", "data-transfer-abroad-v1.0.md")
```

3. Doğrulama: `GET /api/privacy/policy/DataTransferAbroad` → `200`,
   gövdede `version` + `contentMarkdown`.

### Not — bu rıza tipi selfie'ye özel değil

`ConsentType.DataTransferAbroad` enum'da zaten vardı (`PrivacyRecords.cs:11`) ve
yorumu "AWS region" diyor. Yani foto moderasyonu da aynı bölgeye veri gönderiyor
ama bu rızayı **istemiyor** — `EnsureConsentAsync` çağrısı yalnız selfie akışında.
Bu bilinçli bir ayrım mı (biyometrik = özel nitelikli, moderasyon değil), yoksa
foto moderasyonunda da aranması mı gerekiyor? Karar sizin, FE tarafını
etkilemiyor — sadece not düşüyorum.

---

## 2. 🔴 `ProfileCardDto`'da `IsSelfieVerified` yok — rozet başkalarına görünmüyor

### Durum

Rehber §9.2 rozetin **keşif kartında ve profil detayında** görünmesini istiyor ve
"`isSelfieVerified` alanı `UserDto`'da" diyor. `UserDto` için doğru
(`UserDto.cs:45` + `MappingConfig.cs:60` ✅) — **ama keşif kartı `UserDto`
kullanmıyor.**

Keşif kartı, beğenenler listesi ve kaçan eşleşmeler `ProfileCardDto` alıyor.
Onun doğrulama alanları (`ProfileCardDto.cs:47-50`):

```csharp
public bool IsVerified { get; set; }
public bool IsMailVerified { get; set; }
public bool IsPhotosVerified { get; set; }
public bool IsPremium { get; set; }
//  ❌ IsSelfieVerified YOK
```

Sonuç: kullanıcı doğrulamayı geçiyor, rozeti **yalnızca kendi profil ekranında**
görüyor. Kartta, beğenenlerde, profil detayında hiç görünmüyor. Bu akışı yapma
sebebi tam olarak rozetin başkalarına görünmesi olduğu için, özellik bu hâliyle
kullanıcı gözünde sonuçsuz kalıyor.

### İstenen

1. `ProfileCardDto`'ya alan eklensin:

```csharp
/// <summary>
/// Selfie (foto) doğrulama rozeti. IsVerified bileşimine KATILMAZ — ayrı rozet.
/// </summary>
public bool IsSelfieVerified { get; set; }
```

2. Üç doldurma noktasında set edilsin (`IsPhotosVerified`'ın hemen yanı):
   - `Services/Swipes/GetPotentialMatchesHandler.cs:541`
   - `Services/Swipes/GetWhoLikedMeHandler.cs:282`
   - `Services/Swipes/GetMissedMatchesHandler.cs:186`

   → `IsSelfieVerified = profile.IsSelfieVerified`

3. ⚠️ **`IsVerified` bileşimine KATILMASIN.** Sözleşme net:
   `IsVerified = mail ✓ && foto moderasyonu ✓`. Selfie ayrı bir rozet, ayrı bir
   iddia — birleştirilirse "fotoğrafı doğrulanmış" ile "maili doğrulanmış" aynı
   işarete düşer.

### Redis cache notu

`ProfileCardDto` Redis'te MessagePack ile saklanıyor (`profile_card:{id}`, 30 dk
TTL, `CandidatePoolService.cs:26`). Resolver **`ContractlessStandardResolver`**,
yani şema **isim tabanlı** — alan eklemek geriye dönük güvenli: eski cache
kayıtları `false` olarak deserialize olur, TTL dolunca kendiliğinden düzelir.
Ayrıca `InvalidateProfileCardAsync` zaten rozet değişiminde çağrılıyor
(`ProfileController.cs` — `cardPrivacyChanged` dalı), yani **doğrulama başarılı
olunca kartın invalidate edilmesi** gerekebilir; şu an bu dal yalnız profil
güncellemesinde çalışıyor.

> 💡 `SelfieVerificationService.EvaluateFramesAsync` içinde
> `profile.IsSelfieVerified = true` yazıldıktan sonra
> `_candidatePool.InvalidateProfileCardAsync(userId)` çağrılmazsa, rozet
> başkalarının kartında **30 dakikaya kadar** gecikmeli görünür. Kullanıcı
> "doğruladım ama rozet yok" der. Aynısı `ResetOnMainPhotoChangeAsync` için de
> geçerli — orada rozet **düşüyor** ve kartta 30 dk daha görünmeye devam eder ki
> bu güvenlik açısından daha kritik.

### FE tarafı hazır

`SelfieVerifiedBadge` üç durumlu çalışıyor: alan `undefined` gelirse **hiçbir şey
çizmiyor**. Rozeti kart/panel/şerit/beğenenler satırlarına şimdiden bağladım —
siz alanı ekler eklemez, FE'de deploy gerekmeden görünmeye başlar.

---

## 3. ⚙️ Flag kapalı — test için gereken

`appsettings.json.example:99` → `"Enabled": false`.

`StartAsync` ilk satırda `EnsureEnabled()` çağırıyor, yani `/start` → **404 UT-6505**.

FE bu kodu sözleşmeye uygun şekilde ele alıyor: **sessizce kapanır ve giriş
noktasını 24 saat gizler** (rehber §7.2). Yani şu an test edildiğinde görülen
davranış — *"modaldaki butona basınca bir şey olmuyor, modal kapanıyor, profil
ekranındaki satır da kayboluyor"* — **doğru davranış**, bug değil.

**İstenen:** staging'de `SelfieVerification:Enabled = true`. Blocker 1 ile
birlikte açılmalı, yoksa herkes rıza adımında kilitlenir.

Test sırasında faydalı olabilecek ikinci anahtar:
`CalibrationEndpointEnabled = true` (+ Development ortamı) — `/calibrate` ucu
ham Yaw/Pitch/Roll döndürüyor, eşik tartışması çıkarsa elimizde veri olur.

---

## 4. ⚠️ Bilgi — `UT-6505` istemcide 24 saat yapışıyor

FE, `UT-6505` alınca `appPrefs`'e 24 saatlik bir "gizle" penceresi yazıyor
(`selfieAvailability.ts`). Amaç doğru: flag kapalıyken kullanıcıya çalışmayan bir
giriş göstermemek.

Yan etkisi: **siz flag'i açtıktan sonra da test cihazı satırı 24 saat göstermez.**

FE tarafında çözdüm — dev build'lerde pencere atlanıyor, ayrıca `__DEV__` altında
"doğrulama kapalı" bilgisi log'a düşüyor. Sizin tarafınızda yapılacak bir şey yok,
sadece staging'de test ederken satırı göremeyen olursa sebebi bu **değil** artık.

**Backend'e bir öneri:** flag durumunu soracak bir uç olsaydı bu tahmin işi
tamamen kalkardı. Örneğin `GET /api/profile/me` yanıtına
`selfieVerificationAvailable: bool` eklenmesi. Zorunlu değil — mevcut iki kapılı
çözüm çalışıyor — ama ileride flag'i açıp kapatmak isterseniz istemcinin 24 saat
gecikmesi olmaz. Karar sizin.

---

## 5. 📋 Gölge mod / eşik izleme

Rehber §14, flag açılmadan önce gölge mod ve `reasonCode` dağılımının izlenmesini
istiyor; kalibrasyon örnekleminin küçük olduğu (4 kişi, 35 kare, "zar zor
yapılmış" hareket verisi yok) not düşülmüş.

**FE'nin katkısı hazırlanıyor:** PostHog'a şu olay gidecek — yalnızca **kod**,
kare/similarity/ham poz **yok**:

```
selfie_verification_started  { }
selfie_verification_result   { verified, reasonCode, failedAtStep, challengeCode }
```

`challengeCode` = `challenges[failedAtStep - 1].code`, yani "hangi hareket hangi
kodla düştü". `failedAtStep` null geldiğinde (face_mismatch / analysis_failed /
attempt_expired) gönderilmiyor.

Sizin tarafta `SelfieVerificationAttempt` satırlarında zaten `FailureReasonCode`
ve `Similarity` var — eşik ayarı için asıl veri orada. FE tarafı yalnızca
**geçiş oranı** ve **hangi hareketin zorladığı** sorusunu cevaplıyor.

---

## 6. Kontrol ettim, sorun YOK (referans olsun diye)

Bunları tek tek doğruladım, aksiyon gerekmiyor:

| Konu | Durum |
|---|---|
| 11 sebep kodu | `SelfieFailureReasons` ✅ — FE'de 3'ü eksikti, **FE'de düzelttim** |
| resx metinleri tr + en | `EnumDisplay[.en].resx:607-618` ✅ 11'i de tam |
| Hareket havuzu 5'e indirilmiş | `SelfieChallengePool.Active` ✅ |
| Emekli enum üyeleri silinmemiş | ✅ doğru karar — eski `ChallengesJson` okunabilir kalıyor |
| `ResetOnMainPhotoChangeAsync` çağrılıyor mu | ✅ `ProfileController.cs:1371`, **iki yol da** kapsanmış: ana foto değiştirme (`:1311`) ve ana foto silinince terfi (`:1249`) |
| Sıfırlama bildirimi | ✅ `NotificationKind.SelfieVerificationReset` + `Notif_SelfieReset_*` resx tr/en |
| Bildirim alıcının dilinde | ✅ `IUserLanguageResolver` ile — tetikleyen request'in kültürü değil |
| DI kayıtları | ✅ `Program.cs:216, 228, 230` |
| Rate limit policy | ✅ `Program.cs:781` — `EnsurePolicy("selfie", 5, 3600)` |
| Hangfire retention job | ✅ `Program.cs:1101` + `/start`'ta lazy cleanup fallback |
| Migration | ✅ `20260828131430_SelfieVerification_Initial` |
| `IsSelfieVerified` `UserDto`'da | ✅ `UserDto.cs:45`, `IsVerified`'a katılmamış — doğru |
| Hata kodu → HTTP eşlemesi | ✅ `MapStatus` rehberdeki tabloyla birebir |
| `Code` alanı wire'da | ✅ `ResponseDto.Code` — FE `response.data.code` okuyor, tutuyor |
| Başarısız doğrulama 200 dönüyor | ✅ `verified:false` 4xx değil |
| `similarity` yanıtta yok | ✅ sadece DB'de |
| IDOR koruması | ✅ başkasının attempt'i "bulunamadı" ile aynı hatayı veriyor |
| `ConsumedAt` replay koruması | ✅ submit başında set ediliyor |

---

## 7. Aksiyon listesi

- [ ] **1** — `data-transfer-abroad-v1.0.md` yaz + registry'ye ekle *(blocker)*
- [ ] **2** — `ProfileCardDto.IsSelfieVerified` + 3 doldurma noktası *(rozet görünürlüğü)*
- [ ] **2b** — doğrulama başarılı olunca ve sıfırlanınca `InvalidateProfileCardAsync`
- [ ] **3** — staging'de `SelfieVerification:Enabled = true` *(1'den sonra)*
- [ ] **4** — *(opsiyonel)* profil yanıtına `selfieVerificationAvailable` ekle
- [ ] **5** — *(karar)* `DataTransferAbroad` rızası foto moderasyonunda da aransın mı

FE tarafı 1, 2 ve 3 dışında bir şey beklemiyor; kalan işler (eksik sebep kodları,
ipucu metinleri, rozet bağlantıları, analytics) bizde ve bitti.
