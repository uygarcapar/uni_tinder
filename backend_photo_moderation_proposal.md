# Fotoğraf moderasyonu — mevcut durum denetimi ve backend sözleşme önerisi

**Tarih:** 2026-08-24
**Durum:** FE denetimi tamamlandı. Backend tarafında **sözleşme kararı bekleniyor**.
**İlgili:** `backend_missed_match_recovery.md` (aynı doküman düzeni), ClickUp "API Contract — Master".

---

## 1. Yönetici özeti

Moderasyon FE'de çalışıyor: her fotoğraf ayrı değerlendiriliyor, `Review`/`Pending`
akışı engellemiyor, rozet + karartma çiziliyor, ana fotoğraf ihlali inline çözülüyor.
Ancak sözleşme üç yerde eksik ve bu eksikler **ürün riski** üretiyor:

| # | Boşluk | Sonuç |
|---|---|---|
| K1 | Asenkron kararın kullanıcıya ulaşacağı bir kanal yok | `Review` → `Rejected` geçişini kullanıcı **asla öğrenmiyor**. Fotoğrafı sessizce gizli kalıyor. |
| K2 | Profil görünürlüğü sunucu tarafında tanımlı değil | Moderasyon sonrası görünür fotoğraf sayısı 2'nin altına düşen profil keşifte kalmaya devam ediyor; karşı taraf boş/eksik kart görüyor. |
| K3 | Fotoğraf DTO'sunun iki farklı şekli var | FE her cold-boot'ta savunmacı bir birleştirme yapıyor, olasılıkla **fazladan bir istek** atıyor. |

Öneri: tek kanonik `moderation` bloğu, `PhotoModerationChanged` hub olayı,
sunucu tarafında `profileVisibility` sözleşmesi ve bir itiraz ucu. Üçü de
geriye uyumlu fazlarla çıkabilir (§6).

---

## 2. Mevcut durum — FE'nin bildiği sözleşme

### 2.1 Durumlar ve kodlar

`src/features/profile/photoModeration.ts` kanonik FE katmanı.

| Alan | Değerler |
|---|---|
| Durum | `Approved` · `Rejected` · `Review` · `Pending` |
| Reason code | `main_photo_multiple_faces` · `main_photo_no_face` · `explicit_content` · `violence` · `hate_symbols` · `face_mismatch` · `face_compare_unavailable` · `under_review` · `provider_error` |
| Fatal (isteği 400'e düşüren) | `main_photo_multiple_faces` · `main_photo_no_face` |
| Kural | Ana fotoğraf → tam 1 kişi zorunlu · diğerleri serbest |

### 2.2 İki farklı yanıt şekli (bugünkü durum)

| Uç | Şekil |
|---|---|
| `CompleteProfile`, `UpdateProfile` (foto gönderilmişse), `register-and-complete` | `result.photos[] { status, reasonCode, reasonText }` |
| `GetMyPhotos` | `{ moderationStatus, rejectionReasonCode, rejectionReasonText, isVisibleToOthers }` |
| `GetMyProfile.result.photosList[]` | **Bilinmiyor** — rehber belgelemiyor |

`UpdateProfile` ayrıca **koşullu şekil** dönüyor: foto gönderildiyse
`result = { profile, photos }`, gönderilmediyse `result = düz profileDto`.
FE `unwrapProfileResult` ile ikisini de karşılıyor.

### 2.3 Doğrulanmamış varsayımlar

| Varsayım | Nerede | Risk |
|---|---|---|
| `photosList` moderasyon alanlarını taşımıyor olabilir | `profileService.withPhotoModeration` | Taşımıyorsa her profil çekiminde ikinci bir `GetMyPhotos` isteği |
| `GET /api/photo/GetMyPhotos` doğru yol | `api.ts:60` | Sabit önceden `/api/profile/...` idi, hiç çağrılmadığı için yanlışlığı fark edilmemişti. **Cihazda doğrulanmadı.** |
| `Review` ile `Pending` gerçekten ayrı | `photoModeration.ts` | Legacy `imageStatus` ikisini ayıramadığı için bilerek yok sayılıyor |

---

## 3. Denetim bulguları

### 3.1 Kritik

**B1 — Asenkron kararın kanalı yok.**
`Review`/`Pending`'de kalan bir fotoğraf dakikalar/saatler sonra `Rejected` olabiliyor.
O anda kullanıcı uygulamada değil. Bugün:
- SignalR olay listesinde foto moderasyonu **yok** (`MatchNotification`, `SubscriptionChanged`, `ForceLogout`, … arasında karşılığı yok).
- `NotificationType` birliğinde karşılığı **yok** (`Match` · `Like` · `SuperLike` · `MissedMatch` · `Message` · `System` · `TrialEndingSoon` · `PremiumExpiringSoon`).
- Push tarafında tetikleyici yok.

Sonuç: kullanıcı ancak profil ekranındaki foto ızgarasına inip rozeti görürse
öğreniyor. Pratikte öğrenmiyor; "neden az eşleşiyorum" olarak destek kuyruğuna dönüyor.

**B2 — Görünür fotoğraf sayısı minimumun altına düşerse sözleşme yok.**
`MIN_PROFILE_PHOTOS = 2`. Silme yolunda bu sınır korunuyor
(`profile.photos.minMessage`), ama **moderasyon kaynaklı düşüşte hiçbir kontrol yok**.
3 fotoğrafla kaydolan bir kullanıcının 2'si reddedilirse profili 1 görünür fotoğrafla
keşifte kalıyor. Bunun kararı istemcide sayı sayarak verilemez — sunucunun
"bu profil şu an gösterilebilir mi" cevabını vermesi gerekiyor.

**B3 — Reddedilen fotoğrafın yaşam döngüsü tanımsız.**
Backend'de siliniyor mu, gizli tutuluyor mu bilinmiyor. Bu iki şeyi belirsiz bırakıyor:
`MAX_PROFILE_PHOTOS = 6` tavanına sayılıyor mu, ve kullanıcı "değiştir" dediğinde
gerçekten yer açılıyor mu. FE bugün "Değiştir" derken fotoğrafı **siliyor** —
backend zaten sildiyse bu istek gereksiz, silmediyse doğru.

### 3.2 Orta

**B4 — `reasonText` Türkçe sabit.** Ürün çok dilli (`tr`/`en`). FE metni her zaman
`reasonCode`'dan üretiyor, doğru karar; ama sözleşmede yerelleştirilmiş metin
sunuluyormuş gibi bir alan durması yeni geliştiriciyi yanıltıyor.

**B5 — Bilinmeyen `reasonCode` sessizce genelleşiyor.** Backend yeni bir kod eklerse
FE `fallback.<status>` metnine düşüyor: bozulmuyor ama kullanıcı "neden" bilgisini
kaybediyor. Kod kataloğunun sürümlenmesi ve FE'ye önceden bildirilmesi gerekiyor
(`Errors.cs` için işleyen kural burada da geçerli olmalı).

**B6 — İtiraz yolu yok.** `face_compare_unavailable` ve `provider_error` kodlarının
varlığı yanlış pozitifin beklendiğini gösteriyor. Çıkışı olmayan red, destek talebine
dönüşüyor ve otomatik moderasyonun kalite ölçümü için gereken tek sinyali
(itiraz kabul oranı) de üretmiyor.

**B7 — `MAX_PROFILE_PHOTOS = 6` tavanı backend'de kontrol edilmiyor.**
`ProfileScreen.handleAddPhoto` yorumunda kayıtlı: istek 200 dönüyor, profil 7
fotoğrafa çıkıyor ve sonraki sıralama kaydı `NewOrder` `Range(1,6)` doğrulamasına
takılıp bozuluyor. Tek savunma hattı istemci. Moderasyonun kendisi değil ama
aynı uçta ve aynı denetimde çıktı.

### 3.3 Düşük / hijyen

**B8 —** `withPhotoModeration`'daki `alreadyHasModeration` kontrolü
"herhangi bir fotoğrafta `moderationStatus` var mı" diye bakıyor. Backend alanı
ekleyip yalnızca bazı fotoğraflarda doldurursa birleştirme atlanıyor ve o
fotoğraflar moderasyonsuz görünüyor. Kanonik DTO gelince bu dal tamamen siliniyor.

**B9 —** Birleştirme `photoId` ile yapılıyor (`order` ile **değil**) — doğru, çünkü
`order` silme/sıralama sonrası kayıyor. Kanonik DTO sonrası bu da gereksizleşiyor.

**B10 —** `getMyProfile` 10 sn TTL cache'liyor. Moderasyon durumu bu pencerede
değişirse bayat okunuyor. Yükleme sonrası `refreshPhotos` force çektiği için bugün
sorun çıkarmıyor; hub olayı geldiğinde cache'in bust edilmesi gerekecek.

---

## 4. Önerilen sözleşme

### 4.1 Durum makinesi

```
        ┌─────────┐   otomatik tarama temiz    ┌──────────┐
Upload →│ Pending │──────────────────────────► │ Approved │
        └────┬────┘                            └────┬─────┘
             │ belirsiz / eşik altı                 │ şikayet, yeniden tarama,
             ▼                                      │ politika sürümü değişimi
        ┌─────────┐   insan onayı                   ▼
        │ Review  │──────────────────────────► ┌──────────┐
        └────┬────┘                            │ Rejected │
             │ insan reddi ──────────────────► └────┬─────┘
             │                                      │ itiraz kabul
             └──────────────────────────────────────┘
```

Kritik nokta: **`Approved` terminal değil.** Şikayet üzerine yeniden değerlendirme ve
politika sürümü değişimi `Approved → Rejected` geçişi üretir. Sözleşme bunu
baştan kabul etmeli; yoksa FE "onaylandı" durumunu kalıcı sanıp önbelleğe alır.

### 4.2 Kanonik fotoğraf DTO'su

**Tek şekil, foto dönen HER uçta aynı.** `GetMyProfile.photosList[]`,
`GetMyPhotos`, `CompleteProfile`, `UpdateProfile`, `register-and-complete` —
istisnasız:

```jsonc
{
  "photoId": "9f1c…",
  "order": 1,
  "photoImageUrl": "https://…",
  "isMainPhoto": true,
  "moderation": {
    "status": "Rejected",              // Approved | Rejected | Review | Pending
    "reasonCode": "explicit_content",  // kanonik, sabit, snake_case
    "severity": "Hidden",              // Blocking | Hidden | Informational
    "isVisibleToOthers": false,
    "isAppealable": true,
    "appealState": "None",             // None | Pending | Accepted | Rejected
    "decidedAt": "2026-08-24T09:12:00Z",   // terminal değilse null
    "estimatedDecisionAt": null,           // terminal ise null
    "policyVersion": 3,
    "debugReasonText": "…"             // YALNIZCA log/destek. UI'da KULLANILMAZ.
  }
}
```

Sözleşme kuralları:

1. **`moderation` bloğu asla `null` gelmez.** Değerlendirilmemiş fotoğraf `Pending`'dir.
2. **`reasonCode` kanoniktir, `debugReasonText` değildir.** Metin istemcide üretilir
   (`Errors.cs` ↔ `responseCodes.ts` ile aynı kural). Adı `debugReasonText` olsun ki
   yanlışlıkla UI'a bağlanmasın.
3. **`severity` istemcinin davranışını belirler**, `status` değil:
   `Blocking` → akış duruyor, kullanıcı aksiyon almalı ·
   `Hidden` → foto gizli, akış devam ediyor ·
   `Informational` → yalnızca bilgi.
   Bugün FE bu ayrımı `FATAL_REASON_CODES` sabitini **elle taşıyarak** yapıyor;
   kod listesi backend'de değişirse istemci yanılır. Bu alan o sabiti siler.
4. **`isVisibleToOthers` türetilmez, sunucu söyler.** FE bugün alan yoksa
   `status === 'Approved'` diye türetiyor; gizleme kuralı ileride değişirse (ör. tüm
   profil askıya alındığında `Approved` foto da görünmez) türetme yanlışa düşer.
5. **`policyVersion`** yeniden değerlendirme ve itiraz muhakemesi için gerekli:
   "bu karar hangi kural setiyle verildi".

`imageStatus` legacy alanı **kaldırılmalı** (FE zaten yok sayıyor; `Review` ile
`Pending`'i ayıramıyor).

### 4.3 Uçlar

| Uç | Değişiklik |
|---|---|
| `GET /api/profile/GetMyProfile` | `photosList[]` → kanonik `moderation` bloğu **taşımalı**. Bu tek başına FE'deki birleştirme katmanını ve fazladan isteği siler. |
| `GET /api/photo/GetMyPhotos` | Yolun doğruluğu teyit edilmeli. Kanonik DTO gelirse bu uç FE'de **kullanılmayacak**. |
| `PUT /api/profile/UpdateProfile` | Koşullu şekil kaldırılmalı: foto gönderilsin gönderilmesin **her zaman** `{ profile, photos }`. Koşullu şekil FE'de `unwrapProfileResult` sarmalayıcısını zorunlu kılıyor. |
| `POST /api/photo/{photoId}/appeal` | **Yeni** — §4.6 |
| `GET /api/photo/moderation-policy` *(opsiyonel)* | Aktif `policyVersion` + kod kataloğu. İstemci bilinmeyen koda düştüğünde teşhis için. |

### 4.4 Olay ve bildirim kanalı (B1'in çözümü)

**SignalR:** `PhotoModerationChanged`

```jsonc
{ "photoId": "9f1c…", "moderation": { /* §4.2 ile BİREBİR aynı blok */ },
  "profileVisibility": { /* §4.5 */ } }
```

`SubscriptionChanged` için verilen kararın aynısı geçerli: **payload, ilgili
GET'in döndürdüğü blokla birebir aynı olmalı** ki istemci olayı aldığında ek
fetch atmasın. Farklı bir şekil dönerse olay yalnızca "git bak" sinyaline
dönüşüyor ve tasarruf kayboluyor.

**Bildirim akışı + push:** `NotificationType` birliğine eklenecekler:

| Tip | Push | Gerekçe |
|---|---|---|
| `PhotoRejected` | ✅ | Kullanıcı aksiyon almalı |
| `ProfileHiddenInsufficientPhotos` | ✅ | Profil keşiften düştü — en yüksek öncelik |
| `PhotoApproved` | ❌ | Yalnızca hub + rozetin düşmesi. İyi haber için push atmak gürültü. |
| `PhotoAppealResolved` | ✅ | Kullanıcının başlattığı bir işlemin sonucu |

Kural: **push yalnızca aksiyon gerektiren ya da kullanıcının başlattığı kararlarda.**
Sektör pratiği de bu; `Review → Approved` sessiz geçmeli.

**Toplu karar (batching):** kayıt sonrası 3 fotoğraf ayrı ayrı karara bağlanıyor.
Her biri için ayrı push atılmamalı — 60 sn'lik bir pencerede toplanıp tek bildirim
gönderilmeli, yoksa yeni kullanıcı ilk dakikasında üç bildirim alıyor.

### 4.5 Profil görünürlüğü (B2'nin çözümü)

Profil DTO'suna yeni blok. Karar **sunucuda** verilmeli; istemcinin görünür
fotoğraf sayması bir iş kuralının iki yere yazılması olur.

```jsonc
"profileVisibility": {
  "state": "HiddenInsufficientPhotos",  // Visible | HiddenInsufficientPhotos
                                        // | HiddenUnderReview | Suspended
  "visiblePhotoCount": 1,
  "requiredPhotoCount": 2,
  "reasonCode": "insufficient_visible_photos"
}
```

- `Visible` dışındaki her durumda profil **keşif havuzundan çıkarılır** ve mevcut
  eşleşmeler korunur (sohbet kapanmaz).
- İstemci `Visible` olmayan durumda kapatılamaz bir "fotoğraf ekle" akışı gösterir.
  Bu, kayıt sonundaki uyarıdan farklı olarak **engelleyicidir** — profil zaten
  gösterilmiyor, sürtünmenin maliyeti yok.
- `requiredPhotoCount` sunucudan gelmeli; `MIN_PROFILE_PHOTOS = 2` sabiti istemcide
  ikinci bir doğruluk kaynağı olarak kalmamalı.

### 4.6 İtiraz (B6'nın çözümü)

`POST /api/photo/{photoId}/appeal` → `202 Accepted`

```jsonc
// istek
{ "note": "…" }   // opsiyonel, ≤ 500 karakter
// yanıt
{ "appealState": "Pending", "estimatedDecisionAt": "2026-08-25T09:00:00Z" }
```

- **Fotoğraf başına bir itiraz** (`isAppealable: false` sonrası 409 → `UT-6205`).
- `explicit_content` / `violence` / `hate_symbols` için itiraz **insan** kuyruğuna
  düşer, otomatik yeniden taramaya değil.
- Sonuç `PhotoAppealResolved` bildirimi + `PhotoModerationChanged` olayı ile döner.
- **İtiraz kabul oranı** otomatik moderasyonun yanlış pozitif oranı için elimizdeki
  tek ölçüm; kod bazında raporlanmalı.

### 4.7 Hata kodları

`Errors.cs` kanonik kataloğuna `UT-62xx` ailesi. Foto/moderasyon için ayrı blok:

| Kod | HTTP | Anlam | İstemci davranışı |
|---|---|---|---|
| `UT-6201` | 400 | Ana fotoğrafta birden fazla kişi | "Başka fotoğrafı ana yap" |
| `UT-6202` | 400 | Ana fotoğrafta yüz yok | Yeni ana foto seçtir |
| `UT-6203` | 400 | Fotoğraf tavanı aşıldı (**B7**) | Sınır mesajı |
| `UT-6204` | 400 | Minimum fotoğraf altına düşülüyor | Silmeyi engelle |
| `UT-6205` | 409 | İtiraz zaten var / itiraz edilemez | Butonu gizle |
| `UT-6206` | 503 | Moderasyon sağlayıcısı erişilemez | Foto `Pending` kalır, yeniden dene |

`UT-6201`/`UT-6202` gövdesi bugünkü gibi `result.photos[]` taşımaya devam etmeli —
FE hangi fotoğrafın düştüğünü oradan okuyor.

---

## 5. Kurumsal gereklilikler

### 5.1 Hizmet seviyesi

| Aşama | Hedef | Aşılırsa |
|---|---|---|
| Otomatik karar | p95 < 30 sn | Foto `Pending` kalır, kullanıcı bilgilendirilir |
| İnsan incelemesi | p95 < 4 saat, tavan 24 saat | Escalation; **otomatik onay YOK** |
| İtiraz | < 48 saat | Escalation |

24 saati aşan incelemede fotoğrafın otomatik onaylanması **önerilmiyor**:
incelenmemiş içeriği yayına almak hukuki riski kullanıcı deneyimi uğruna kabul
etmek olur. Doğru davranış gizli tutup escalate etmek.

### 5.2 Denetim izi

Her karar için değiştirilemez kayıt: `photoId`, `userId`, `decision`,
`reasonCode`, `policyVersion`, sağlayıcı + model sürümü, skorlar,
`reviewerId` (insansa), `decidedAt`, tetikleyici (upload / şikayet / itiraz /
yeniden tarama). İtiraz muhakemesi ve düzenleyici talepler için gerekli;
sonradan üretilemez, baştan yazılmalı.

### 5.3 KVKK / GDPR

`face_mismatch` ve `face_compare_unavailable` kodlarının varlığı **yüz
karşılaştırması** yapıldığını gösteriyor. Yüz şablonu KVKK m.6 anlamında
**özel nitelikli kişisel veri**. Gerekenler:

- Açık rıza metni ve kayıt akışında gösterimi (bugün FE'de böyle bir onay yok).
- Yüz şablonunun saklama süresi ve karar sonrası imhası — ham fotoğraftan ayrı politika.
- Aydınlatma metninde otomatik karar alma ve itiraz hakkının belirtilmesi.

Bu madde ürün değil uyum konusu; hukuk tarafına ayrıca taşınmalı.

### 5.4 Güvenlik ve kötüye kullanım

- Sağlayıcı skorları ve eşik değerleri **istemciye dönmemeli** — sistemin
  oynanmasını kolaylaştırır. `severity` yeterli soyutlama.
- Reddedilen içeriğin **algısal hash'i** saklanmalı: aynı fotoğraf yeniden
  yüklendiğinde anında reddedilir, insan kuyruğunu tüketmez. Hash kalıcı,
  binary belirli bir süre sonra imha.
- Yükleme uçlarında kullanıcı bazlı hız sınırı (yükleme ve itiraz ayrı ayrı).

### 5.5 Gözlemlenebilirlik

`reasonCode` bazında: karar dağılımı, otomatik/insan oranı, karar süresi
histogramı, itiraz oranı ve **itiraz kabul oranı** (= yanlış pozitif vekili),
`provider_error` oranı. Bu metrikler olmadan eşiklerin doğru olup olmadığı
bilinemez.

---

## 6. Göç planı

Üç faz, her biri geriye uyumlu. FE her fazdan sonra bir şeyi siliyor.

| Faz | Backend | FE'nin sildiği/eklediği |
|---|---|---|
| **1** | Kanonik `moderation` bloğu tüm foto dönen uçlara eklenir; eski düz alanlar bir sürüm daha korunur | `withPhotoModeration` birleştirme dalı ve `getMyPhotos` **silinir**; `FATAL_REASON_CODES` sabiti `severity`'ye devredilir |
| **2** | `PhotoModerationChanged` hub olayı + `PhotoRejected` / `PhotoApproved` / `PhotoAppealResolved` bildirim tipleri | Hub aboneliği + profil cache bust; foto ızgarası dışında kalıcı giriş noktası |
| **3** | `profileVisibility` bloğu + itiraz ucu; `reasonText` → `debugReasonText`, `imageStatus` kaldırılır | Engelleyici "fotoğraf ekle" akışı; itiraz butonu; `MIN_PROFILE_PHOTOS` istemci kuralı gevşetilir |

Faz 1 tek başına B3, B8, B9, B10'u ve fazladan isteği çözüyor — en yüksek
getirili ve en ucuz adım o.

---

## 7. FE'de karşılığı

Sözleşme onaylanırsa istemci tarafında yapılacaklar:

| Parça | Yer |
|---|---|
| Kanonik bloğun okunması, `severity` ile davranış | `src/features/profile/photoModeration.ts` |
| Birleştirme katmanının silinmesi | `src/features/profile/profileService.ts` |
| Hub aboneliği + cache bust | `src/features/notifications/`, `profileService.bustProfileCache` |
| Profil başlığında kalıcı durum satırı | `src/features/profile/screens/ProfileScreen.tsx` |
| Engelleyici "fotoğraf ekle" akışı | `src/navigation/AppNavigator.tsx` (oturum kapısı deseniyle aynı yerde) |
| İtiraz aksiyonu | `ProfileScreen.handlePhotoPress` |
| Yeni metinler | `src/shared/i18n/translations/{tr,en}.ts` |

Kayıt akışındaki davranış **değişmiyor**: `Review`/`Pending` kullanıcıyı
durdurmuyor, tek bilgilendirme yapılıp uygulamaya giriliyor. Değişen tek şey,
kararın sonradan kullanıcıya ulaşabilir hâle gelmesi.

---

## 8. Karar bekleyen sorular

1. `GetMyProfile.photosList[]` şu an moderasyon alanlarını taşıyor mu?
   (Taşıyorsa FE'deki fallback bugün silinebilir.)
2. `GET /api/photo/GetMyPhotos` doğru yol mu?
3. `Review` ile `Pending` arasındaki fark nedir — "insan kuyruğunda" vs
   "otomatik tarama sırasında" ayrımı doğru mu?
4. Reddedilen fotoğraf sunucuda tutuluyor mu, siliniyor mu? `MAX_PROFILE_PHOTOS`
   tavanına sayılıyor mu?
5. `Approved → Rejected` geçişi (şikayet / yeniden tarama) bugün mümkün mü?
6. Fotoğraf tavanı (6) sunucuda neden doğrulanmıyor — bilinçli mi?
7. Yüz karşılaştırması için açık rıza alınıyor mu, şablon saklama süresi nedir?
8. Otomatik moderasyon sağlayıcısı hangisi ve `provider_error` oranı ne?
