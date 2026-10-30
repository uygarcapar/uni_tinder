# E2E otomasyonu — backend ön koşulları (2026-10-29, **v3**)

> **v3 notu.** Backend §0'ı cevapladı: **ayrı ortam yok, e2e üretime vuruyor.** Bu cevap
> iki şeyi birden değiştirdi — aşağıdaki **§-1 güvenlik maddesi** (cevabın doğrudan
> sonucu, e2e'den bağımsız ve ondan daha acil) ve **§4'ün eskimesi** (kampüs poligon
> verisi artık var). §1'in şekli de belirlendi: backend e-posta desenine bağlı bir
> izolasyon katmanı tasarladı.

---

## -1. 🔴🔴 GÜVENLİK — `080539` DEV kod bypass'ı **ÜRETİMDE CANLI**

Bu madde e2e'nin bir parçası değil; e2e ölçümünün **yan ürünü** ve sırası burada olduğu
için değil, en acil olduğu için başta.

**Ölçüm (bu repodan, 2026-10-29).** `https://api.lit.4ourstack.com` üzerinde
`send-verification` → `verify-email` akışında **`080539` sabit kodu gerçek bir
`emailVerifiedToken` döndürüyor** (`@bilgiedu.net` için teyit edildi).

**Backend'in cevabı bunu bir açığa çeviriyor:** v2'de bu bulgunun iki okuması vardı ve
"host aslında dev/staging ise sorun yok" diyorduk. Backend "**ayrı bir non-prod instance
yok, e2e üretime vuruyor**" dedi — yani okuma (a) doğru: **bypass üretimde.**

**Sonucu.** `@bilgiedu.net` (ve desteklenen diğer alan adları) için e-posta sahipliği
doğrulaması fiilen yok: adresi bilen herkes, o adrese erişmeden hesap açabilir /
doğrulayabilir. Üniversite e-postası bu üründe **kimlik kapısının kendisi** — kampüs
eşleşmesi, mod havuzları, okul rozeti hepsi ona dayanıyor.

**Sorular:**
1. Bypass üretimde **bilerek mi** açık (ör. inceleme/demo hesapları için)?
2. Değilse: kapatılması ne kadar sürer, bir ortam bayrağına mı bağlı?
3. Açık kalacaksa hangi daraltma var — yalnız belirli alan adları, yalnız belirli
   adresler, hız sınırı?

**İstemci tarafında yapılacak iş yok** — bu tamamen sunucu kapısı. E2E tohumlayıcısı
bypass'ı kullanıyor; kapanırsa tohumlama gerçek e-posta okumaya ya da başka bir muafiyete
geçmek zorunda (bkz. §1'deki izolasyon planı, ikisi aynı işaretçiye bağlanabilir).

---


İstemci tarafında uçtan uca bir UI otomasyon katmanı kuruldu (Appium +
WebdriverIO, iOS simülatörü). Bot, uygulamayı bir insan gibi kullanıyor:
sıfırdan kayıt oluyor, keşifte karar veriyor, mesaj atıyor, sonunda açtığı
hesapları siliyor.

> **v2 notu.** Backend kodu okundu ve ilk sürümdeki üç madde düzeltildi:
> hız sınırı maddesi **düştü**, kampüs maddeleri **birleşti**, yüz kontrolü
> maddesinin önüne bir **ortam sorusu** girdi. Ayrıntılar yerinde.

---

## 0. ✅ CEVAPLANDI — e2e **üretime** vuruyor

Repoda tek bir API adresi var: **`https://api.lit.4ourstack.com`** — kök
`.env` bunu kullanıyor, e2e de başka bir adres verilmediği için aynısını
kullanıyor. Ayrı bir dev/staging instance'ı repoda **yok**.

Ölçülen: **`080539` DEV kod bypass'ı bu host'ta çalışıyor**
(`send-verification` → `verify-email` gerçek bir `emailVerifiedToken`
döndürdü). Bunun iki okuması var:

| Okuma | Sonuç |
|---|---|
| **(a)** Host üretim, DEV bypass orada canlı | `080539` tek başına bir kimlik doğrulama açığı. Bu, e2e kararından **daha öncelikli** ve aşağıdaki §1'in cevabını da değiştiriyor. |
| **(b)** Host aslında dev/staging, yalnız alan adı üretim görünümlü | Sorun yok, §1'de A da B de güvenli. |

**İstemci tarafından ayırt edilemiyor.** Cevap gelene kadar §1'deki A
seçeneği uygulanmamalı — (a) ise, e-posta desenine muafiyet üretimde
**kalıcı ve desen-şekilli bir delik** açar (üstelik desen bu dokümanda
yazılı).

> **✅ CEVAP: okuma (a) — host ÜRETİM.** "Ayrı bir non-prod instance yok. E2E,
> uygulamanın kendi `.env`indeki adrese — yani üretime — vuruyor; `deploy/` altında
> staging stack'i yok." Paylaşımlı sunucu + MSSQL Express 3.5 GB sınırı yüzünden ikinci
> instance kısa vadede masada değil.
>
> **İki sonucu var:**
> 1. `080539` bypass'ı üretimde → **§-1**'e taşındı, e2e'den bağımsız ele alınmalı.
> 2. §1'de çıplak A seçeneği (desen muafiyeti) tek başına uygulanamaz — backend bunun
>    yerine **izolasyon katmanı** tasarladı (`2026-10-29-e2e-hesap-izolasyonu-design.md`):
>    e2e hesapları üretimde kalıcı olarak izole (birbirlerini görürler, gerçek
>    kullanıcılara hiç görünmezler), yüz kontrolü muafiyeti e-posta desenine, kampüs test
>    muafiyeti de aynı işaretçiye bağlanıyor. Yani A'nın deliği izolasyonla kapatılıyor.

---

## 1. 🔴 BLOKAJ — kayıtta yüz kontrolü

**Belirti.** `POST /api/auth/register-and-complete` → `HTTP 400`:

> "1. fotoğraf ana fotoğraf olarak seçilmiş ama net bir yüz göremedik.
> Yüzünün açık ve aydınlık göründüğü bir kare seç."

**Neden blokaj.** Test fixture'ları üretilmiş karelerdir (düz renk + büyük
numara) ve bilerek öyle: başarısız bir koşunun ekran görüntüsünde hangi botun
kartı olduğu gözle okunabilsin diye. Gerçek yüz fotoğrafı kullanmak
istemiyoruz — sahte hesaplara gerçek kişilerin görüntüsünü koymak doğru değil.

**Kapı İKİ YERDE** (backend incelemesinden):

| Yer | Neyi kesiyor | Bizi nasıl vuruyor |
|---|---|---|
| `PhotoProcessingPipeline.cs:128-165` | Kayıt yolu | **Şu anki blokaj.** Hem API bot üretimi hem UI kayıt akışı (Step15 aynı galeriyi kullanıyor) |
| `ProfileController.cs:2328` | Sonradan "ana yap" | İleride profil düzenleme senaryosunu kesecek |

İkisi de `PhotoModerationOptions.MainPhotoRequiresExactlyOneFace`e bakıyor.
Seçilecek muafiyet **ikisini birden** kapsamalı; kapsamıyorsa profil düzenleme
senaryosunu baştan kapsam dışı bırakırız.

**İçerik moderasyonu ayrı katman ve fixture'lar oradan sorunsuz geçiyor** —
yani gevşetilmesi gereken tek şey yüz kontrolü, başka hiçbir şey.

**Seçenekler** (tercih §0'ın cevabına bağlı):

| Seçenek | Kapsam | Ne zaman uygun |
|---|---|---|
| A | E-postası `e2e.*@bilgiedu.net` desenine uyanlarda yüz kontrolü atlansın. `register-and-complete` o noktada e-postayı elinde tutuyor (teyit edildi) | **Yalnız §0 → (b) ise.** Üretimde desen-şekilli kalıcı delik olur |
| **B (prod ise tercih)** | Ortam bayrağı: `Moderation__MainPhotoRequiresExactlyOneFace=false`, **yalnız non-prod instance'ta** | Her durumda güvenli; ayrı instance gerektiriyor |
| C | Fixture hash'leri allowlist'e (hash'leri verebiliriz) | Dar ama bakım yükü var; fixture her değiştiğinde güncellenmeli |

**Ayrı instance kısa vadede mümkün değilse** e2e hesap açmayı tamamen bırakır
ve var olan tek bir test hesabıyla **yalnız ölçüm** moduna döner; kayıt ve
çok-kullanıcılı akışlar beklemeye alınır. (İstemci tarafı buna hazır:
`flows/loginAsBot.ts` + `specs/smoke/02-authenticated-tree-dump.e2e.ts`.)

**Doğrulama.** Muafiyet açıldıktan sonra istemci tarafında tek komut yeter:
```
npm run e2e:seed -- --bots 6     # 6 hesap açar
npm run e2e:seed -- --purge      # hepsini siler
```

---

## 2. ✅ ÇÖZÜLDÜ — `/api/campus/boundary` token istiyor

Anonim çağrı **401**. Backend `CampusQueryService.cs:121-147`'te kullanıcıyı
yükleyip `enabled`ı kullanıcı bazlı bayraktan hesaplıyor — yani anonimleştirmek
alanı anlamsızlaştırırdı. **Aksiyon gerekmiyor:** istemci token'lı yola geçti
(`seed/interactions.ts > resolveCampusFix`, bot token'ıyla) ve
`src/shared/constants/api.ts`'teki yanıltıcı "anonim" yorumu düzeltildi.

---

## 3. ~~`send-verification` hız sınırı~~ — DÜŞTÜ

İlk sürümde "IP başına cooldown gevşetilsin" denmişti; yanlıştı. Cooldown
**e-posta başına 60 sn** (`EmailVerificationCodeService.cs:29`), IP limiti
ayrı ve 20/dk.

Tohumlayıcı her bot için `(runId, seed, slot)`'tan türeyen **ayrı adres**
üretiyor ve aynı adrese ikinci kez hiç çağırmıyor → e-posta cooldown'u hiç
tetiklenmiyor. Bir koşu ~14 auth isteği atıyor ve botları **sırayla**
yaratıyor → 20/dk tavanının altında. **Aksiyon gerekmiyor.**

---

## 4. 🟡 Kampüs senaryoları — veri girilene kadar PARK

İlk sürümdeki iki ayrı madde (makullük kontrolü + "poligonu olan okula
yönelelim") tek bir gerçeğe indi:

`Utility/Resources/campus-boundaries.json` şu an **boş** (`campuses: []`,
Faz A). Yani **hiçbir domainde poligon yok**, `IsFeatureEnabled` her yerde
false ve `TestUserIds` bu kapıyı bilerek aşmıyor. "Poligonu olan bir okula
yönelelim" diye bir seçenek **yok**; kampüs senaryoları config'le açılamaz.

**İstemci tarafı buna hazır ve koşuyu kırmıyor:** tohumlayıcı `/api/campus/me`
→ `enabled:false` görünce anı atlıyor, kampüs spec'leri `skip` ediyor.

**Aksiyon:** Faz A verisi girildiğinde haber verilmesi yeterli. O noktada
`UT-7415` (makul olmayan hareket) muafiyeti yeniden gündeme gelir — e2e
hesaplarının `Campus__TestUserIds` listesine eklenmesi; hesap id'lerini koşu
başında verebiliriz.

> **✅ GÜNCELLEME — yukarıdaki "dosya boş" tespiti ESKİMİŞ.** Backend:
> `campus-boundaries.json`da **180 domain var ve hepsi poligonlu.** Yani kampüs
> senaryolarının önündeki veri engeli kalktı; `IsFeatureEnabled` artık poligonu olan
> okullarda açılabiliyor.
>
> **Kalan tek engel muafiyetin BAĞLANMA BİÇİMİ.** `Campus__TestUserIds__0` bir ortam
> değişkeni (`CampusOptions.cs:82-104`), yani "hesap id'lerini koşu başında veririz"
> fiilen **işlemiyor**: tohumlayıcı her koşuda yeni hesap açıyor, ortam değişkeni ise
> sunucu yeniden başlatılmadan değişmiyor. İki yol var:
>   - **(1) beklemek:** §1'deki izolasyon planı kampüs muafiyetini de **e-posta desenine**
>     bağlıyor → id yapıştırma tamamen ortadan kalkıyor. **Tercihimiz bu.**
>   - **(2) şimdilik:** elle açtığımız SABİT birkaç test hesabının id'sini bir kez
>     gönderip config'e koydurmak; kampüs senaryoları yalnız o hesaplarla koşar.
>
> Ayrıca test hesabının **poligonu olan bir kampüse ait olması** şart — tohumlayıcının
> e-posta alan adı (`bilgiedu.net`) bu kümede, yani ek iş yok.

---

## 5. 🟡 Kota tohumlaması — dev ucu yok, kabul

Paywall senaryosunun dokuz tetikleyicisinden ikisi (sohbet kotası 402,
kaçırılan eşleşme kurtarma) kotayı doldurmayı gerektiriyor. `SeedController`
ADMIN rollü ve profil odaklı; kota için uygun bir uç yok.

**Aksiyon gerekmiyor.** O iki tetikleyici haftalık/elle koşuya düşürüldü;
kalan yedi tetikleyici normal koşuda kapsanıyor.

---

## Teyit edilenler (aksiyon gerekmiyor)

- ✅ `080539` DEV kod bypass'ı `@bilgiedu.net` için çalışıyor — ⚠️ ama bkz. §0
- ✅ `bilgiedu.net` desteklenen üniversite alan adları arasında
- ✅ `register-and-complete` multipart sözleşmesi istemciyle birebir uyuşuyor
  (istek sunucuya ulaşıyor, yalnız yüz kontrolünde duruyor)
- ✅ İçerik moderasyonu ayrı katman; düz renk fixture'lar oradan geçiyor
- ✅ Hesap silme `DELETE /api/privacy/account` ile çalışıyor; temizlik bu uca
  bağlı (`/api/user/DeleteUser` ve `/api/privacy/deactivate` BİLEREK
  kullanılmıyor)

---

## Özet — backend'den beklenen (v3)

1. 🔴🔴 **§-1:** `080539` bypass'ı üretimde açık mı, bilerek mi? (e2e'den bağımsız,
   en acil madde)
2. 🔴 **§1:** yüz kontrolü muafiyeti — **iki kapıyı da** kapsasın
   (`PhotoProcessingPipeline.cs:128-165` + `ProfileController.cs:2328`). Şekli belli:
   izolasyon planındaki e-posta deseni.
3. 🟡 **§4:** kampüs muafiyetinin e-posta desenine bağlanması (izolasyon planının
   parçası). Poligon verisi artık var, engel yalnız bu.

**§0 cevaplandı** (üretim). **§2, §3, §5 kapalı.**

## Özet — bizden beklenen

- İzolasyon planı uygulanana kadar **yeni bir istemci işi yok**; koşu bugün de
  çalışıyor (kayıt hariç) ve kampüs spec'leri kendiliğinden `skip` ediyor.
- §1 muafiyeti açıldığı an doğrulama tek komut:
  `npm run e2e:seed -- --bots 6` / `--purge`.
