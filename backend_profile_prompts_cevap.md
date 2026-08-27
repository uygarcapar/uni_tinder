# Prompt'lar — FE'den backend'e cevap

**Tarih:** 2026-08-24
**Yanıtlanan:** "Profil Prompt'ları — Backend'den FE'ye cevap" (§1–5)
**Önceki:** `backend_profile_prompts_proposal.md`

---

## TL;DR

- **§3 `promptIndex`: evet, istiyoruz** — ama düz `{promptIndex: 1}` yerine foto
  moderasyonuyla simetrik bir **dizi**. Gerekçe §1'de; bizde okuma yolu zaten hazır.
- **D1'de kapatılmamış bir delik var:** `ProfileCompletionCalculator` ve `UT-6004`.
  Bio 100 puanın 10'u — ML sıralaması gibi bu da sessizce bozulur, üstelik
  **kullanıcıya görünür**. §2.
- D1'den türeyen ikinci soru: 0 prompt'lu kullanıcılar Faz 2'de vektörsüz kalıyor. §2.2
- D2, D3 aynen kabul. Faz 1'e başlıyoruz.

---

## 1. §3'ün cevabı — evet, ama dizi olarak

`promptIndex` işimize yarıyor. Okuma yolunu doğruladık, **plumbing gerekmiyor:**
kayıt/tamamlama uçları `validateStatus: () => true` ile çağrılıyor
(`profileSlice.ts:48`), yani 400 gövdesi elimize olduğu gibi geçiyor ve
`buildSubmitError` zaten `data.result`'ı **kalem kalem** okuyor
(`profileSlice.ts:28`) — bugün `result.photos[]` için yaptığı şeyin aynısı.

Bu yüzden düz bir sayı yerine **foto emsaliyle aynı şekli** istiyoruz:

```json
{
  "isSuccess": false,
  "code": "UT-2205",
  "message": "...",
  "result": {
    "prompts": [
      { "index": 0, "code": "UT-2205" },
      { "index": 2, "code": "UT-2206" }
    ]
  }
}
```

Üst seviye `code` en ağır/ilk hata olarak dursun — yalnız onu okuyan istemciler
kırılmasın. Alan adı önemli değil (`index` / `promptIndex` fark etmez), **dizi
olması** önemli. Dört gerekçe:

1. **Tek round-trip.** Kullanıcı 3 slotu birden dolduruyor. İkisi hatalıysa düz
   sayıyla iki tur atılır: kullanıcı birini düzeltir, kaydeder, ikinci hatayı
   görür. Dizi ile ikisi de aynı anda inline çizilir.
2. **`UT-2201`'in index'i yok** (sayı 1–3 dışı). Dizi boş kalır, üst seviye kod
   tek başına anlamlı olur — nullable bir `promptIndex` alanı taşımaya gerek kalmaz.
3. **Simetri.** `buildSubmitError` bugün `result.photos[]` okuyor; `result.prompts[]`
   aynı fonksiyona ek satır olarak giriyor. İki farklı hata şekli taşımak istemiyoruz.
4. **`UT-2202` için index olmazsa kurtarma yapamıyoruz** — aşağıdaki senaryo yüzünden.

### ⚠️ `UT-2203` (aynı prompt iki kez) hangi index'i döndürsün?

Sözleşmede yazılsın: **büyük olan (sonraki) index.** Kullanıcının önce yazdığı
cevap dursun, çakışan ikincisi işaretlensin. Aksi hâlde FE yanlış slotu kırmızıya
boyar.

### ⚠️ `UT-2202` sandığınızdan sık gelecek — ve index'e ihtiyacımız var

Katalog `staticGet` ile **uygulama oturumu boyunca** cache'leniyor, TTL yok
(`src/shared/services/staticCache.ts:12`). Yani uygulamayı arka planda açık
tutan bir kullanıcının katalogu saatlerce bayat kalabiliyor. Siz bir prompt'u
`isActive: false` yaptığınızda o kullanıcı **hâlâ listede görüyor**, seçiyor,
`UT-2202` yiyor.

Bu bizim tarafımızda çözülecek (kodu görünce `bustStaticCache` + katalog
yenileme + o slotu sıfırlama), ama **hangi slotu sıfırlayacağımızı bilmemiz
gerekiyor** — kullanıcının diğer iki cevabını silmeden. `promptIndex`'i asıl
gerekli kılan senaryo bu.

### Bilgi — `UpdateProfile` yolunda ufak bir fark (bizim işimiz)

Kayıt yolunun aksine `UpdateProfile` `api.put` ile gidiyor
(`profileService.ts:140`), yani 400 interceptor'da reject oluyor ve gövde
`error.response.data`'da kalıyor. Erişilebilir; `EditProfileForm` tarafında
küçük bir okuma eklenecek. **Sizden bir şey gerekmiyor**, sözleşme aynı.

---

## 2. D1 — ML sinyali doğru yakalanmış, ama iki delik açık kaldı

`BioEmbeddingJson` / `CompatibilityScoreCalculator` / HNSW tarafını görmemiştik,
düzeltme yerinde. 4 fazlı plan ve Faz 3/4'ün takvimsiz bırakılması kabul.

Ama listelediğiniz altı bağımlılıktan **biri FE'ye taşıyor** ve fazlamada karşılığı yok:

### 2.1 🔴 `ProfileCompletionCalculator` + `UT-6004`

Bio, profil doluluğunun 100 puanında 10 puan. Bu sayı bizde **iki yerde** görünüyor:

| Yer | Kaynak |
|---|---|
| Profil ekranındaki yüzde halkası | **Sunucu** — `profileCompletionPercentage` (`ProfileScreen.tsx:838`) |
| Hemen altındaki maddeli liste ("Fotoğraflar 4/6", "Hobiler 7/10", "Bio ✓") | **İstemci** — `completionMetrics` (`ProfileScreen.tsx:1393`) |

Ve doluluk yalnız kozmetik değil: `UT-6004 / ProfileIncomplete` keşif destesini
**boşaltan** bir kod (`responseCodes.ts:78`, aksiyon `completeProfile`).

İki somut bozulma:

1. **Faz 1'de:** `ProfileCompletionCalculator` prompt'ları saymazsa, 3 prompt
   dolduran kullanıcının listesinde "Prompt'lar 3/3 ✅" yazarken **yüzde halkası
   kıpırdamaz.** Aynı ekranda iki çelişen sayı.
2. **Faz 4'te:** kolon düşünce **herkes aynı anda 10 puan kaybeder.** `UT-6004`
   bir eşiğe bağlıysa, eşiğin hemen üstündeki kullanıcılar **toplu hâlde ve
   sessizce** keşiften düşer — D1'de ML için tarif ettiğiniz sessiz bozulmanın
   kullanıcıya görünen versiyonu.

**İstenen:**
- Bio'nun 10 puanı **prompt'lara devredilsin ve bu Faz 1'e girsin** (ML fazına
  değil) — çünkü kullanıcı prompt'u Faz 1'de doldurmaya başlıyor.
- `UT-6004`'ün bir doluluk eşiği var mı, varsa kaç? ⚠️ **DOLDURULACAK.** Varsa
  Faz 4 öncesi bir "kaç kullanıcı eşiğin 10 puan içinde" sorgusu istiyoruz —
  §5'teki "dolu bio sayısı" sorgusuyla aynı gerekçe.

### 2.2 0 prompt'lu kullanıcılar Faz 2'de vektörsüz kalıyor

D1 "tüm kullanıcılar için bir kereye mahsus backfill" diyor. Ama migration
sonrası **mevcut kullanıcıların hepsi 0 prompt'la başlıyor** (öneri §4.6) ve
0 prompt'tan embedding üretilemiyor.

Soru: Faz 2'de bio kaynağı kapatılınca, henüz prompt doldurmamış kullanıcının
vektörü ne olacak — eski bio vektörü mü kalacak, yoksa boşalıp **HNSW aday
aramasından düşecekler mi**? İkincisi ise Faz 2, bio'yu hiç doldurmamış
kullanıcıları da (kayıttan gelen herkes, öneri §3) sıralamada kör noktaya atar.

Faz 2'nin "prompt verisi biriksin" beklemesi tam olarak bunu çözüyor olabilir —
öyleyse teyit yeterli, ek iş istemiyoruz.

### 2.3 KVKK — bir satır

Prompt cevapları embedding için OpenAI'a gidiyor. Bio için zaten öyleymiş, yani
**yeni bir veri sınıfı yok**; ama öneri §5'teki KVKK maddesi açıkken aydınlatma
metninin "profil metinleri üçüncü taraf model sağlayıcısına gönderilir"
kısmının prompt'ları da kapsadığı teyit edilsin. Yeni bir iş değil, kapsam kontrolü.

---

## 3. D2 ve D3 — kabul

**D2:** Gerekçe düzeltmesi doğru, teşekkürler. "Boş liste temsil edilemiyor"
demek, "kural engellediği için gönderilmiyor" demekten daha sağlam bir zemin.
`ClearPrompts` gerekmiyor; gerekirse `ClearHobbies` deseniyle ekleriz.
Boş liste gönderen istemcinin 400 değil "dokunma" alması bizim akışımızda
üretilmiyor — engel FE'de duruyor.

**D3:** Faz 1'de senkron ret + `UT-2206` tam istediğimiz şey. Asenkron kuyruk
olmadığı için foto tarafındaki K1 problemi burada doğmuyor — bu, prompt'ları
foto moderasyonundan **daha sağlam** bir yere koyuyor. Şikâyet payload'undaki
opsiyonel `promptKey` için de teşekkürler.

Tek not: deny-list'e takılan cevabın metni **istemciye geri dönsün** (kullanıcının
yazdığı hâliyle), ki inline hatayla birlikte düzeltebilsin. Cevabı sunucu
tarafında kırpıp/temizleyip döndürmeyin — `UT-2206` yiyen istek zaten
kaydedilmiyor, FE elindeki metni koruyor; sadece gövdenin cevabı **silmemesi**
yeterli.

---

## 4. §4 — kapsam dışı listesi

Karşılıklı mutabık. Ek yok.

---

## 5. Durum

| Konu | Durum |
|---|---|
| Faz 1 FE | ✅ Başlıyoruz — K1/K3/K4/K5/K6 sabit, katalog mock'la ilerliyor |
| §3 `promptIndex` | Dizi şekli isteniyor (§1) — Faz 1'e dahil edilebilirse çok iyi, edilemezse Faz 1'i bloklamaz |
| `ProfileCompletionCalculator` | ⚠️ **Faz 1'e alınması isteniyor** (§2.1) |
| `UT-6004` doluluk eşiği | ⚠️ **DOLDURULACAK** |
| Faz 2 vektör kapsaması | Teyit bekliyor (§2.2) |
| K2 katalog içeriği | Ürün tarafında, bizi bloklamıyor |
| Faz 3/4 takvimi | Bağlanmadı — Faz 1 benimsenme oranına göre konuşulacak |

---

## 6. Uygulama planı incelemesi

`docs/backend_profile_prompts_plan.md` okundu. Katalog şekli (§2.3), kart DTO'sundaki
`Prompts`/`PromptsRaw` ikilisi (§5.1), `OrderBy(DisplayOrder)`, N+1 notu ve Redis
kart invalidasyonu — hepsi FE'nin beklediği sözleşmeyi karşılıyor. `Localize()`'ta
üretilen alanın `StripLocalizedFields()`'ta temizlenmesi ve viewer-bağımsız cache
tuzağının yakalanmış olması özellikle iyi; bizim önerimizde bu yoktu.

Dört madde var. İlki Faz 1'i doğrudan etkiliyor.

### 6.1 🔴 Replace + `UNIQUE(ProfileId, PromptKey)` — en sık senaryoda çakışma riski

§4.2'deki blok tek `SaveChanges` içinde önce `RemoveRange`, sonra aynı anahtarlarla
`INSERT` yapıyor. §3.1'de ise `UNIQUE (ProfileId, PromptKey)` var.

**Senaryo — kullanıcıların en sık yapacağı düzenleme:** kullanıcı 1. prompt'unun
cevabındaki yazım hatasını düzeltiyor, prompt'u değiştirmiyor. Replace semantiği
gereği FE **aynı 3 anahtarı** geri gönderiyor. Sunucuda aynı `SaveChanges` içinde
`(profileId, MostEnjoyInLife)` hem siliniyor hem ekleniyor.

EF Core aynı batch içinde delete'lerin insert'lerden önce koşacağını **garanti
etmiyor** (bilinen bir sınırlama). Sıralama ters çıkarsa unique index ihlali →
kullanıcı bir harf düzeltirken 500 alır.

Bu, prompt'u değiştiren nadir durumda değil, **cevabı düzenleyen her durumda**
tetiklenebilir — yani en sık akış.

**İstenen:** Faz 1 testlerine şu vaka eklensin — *"3 prompt'u olan kullanıcı aynı
3 anahtarla, yalnız bir cevabı değiştirerek `UpdateProfile` atıyor."* Yeşil geçmezse
iki çözümden biri: (a) anahtar bazlı diff ile mevcut satırı `UPDATE` etmek (dışa
dönük sözleşme yine replace kalır, sadece iç uygulama farklı), (b) delete ve insert'i
ayrı `SaveChanges`'lere bölüp tek transaction'a almak.

Sözleşme değişmiyor, FE'de değişiklik yok — ama Faz 1 bu vaka test edilmeden
canlıya çıkmasın.

### 6.2 🔴 `ProfileCompletionCalculator` Faz 2'de — cevabımızın §2.1'i planla doğrulandı

Plan §1 ve §6, `ProfileCompletionCalculator`'ı Faz 2'ye koyuyor ve Faz 2'nin
bağımlılığı *"Faz 1 canlıda, veri birikmiş"*.

Doluluk hesabının **veri birikmesiyle hiçbir ilgisi yok** — kullanıcı başına anlık
hesaplanıyor. ML tarafıyla aynı dosya kümesinde geçtiği için aynı faza düşmüş
görünüyor; ayrılması bedava.

Faz 1 boyunca oluşacak durum (cevabımız §2.1): kullanıcı 3 prompt'u dolduruyor,
profil ekranındaki **maddeli liste "Prompt'lar 3/3 ✅" derken yüzde halkası
kıpırdamıyor** — halka sunucudan, liste istemciden besleniyor. Aynı ekranda iki
çelişen sayı, Faz 2 belirsiz bir süre beklerken.

**İstenen: bio'nun 10 puanı Faz 1'e alınsın.** Embedding devri (§6) Faz 2'de kalabilir.

Ayrıca `UT-6004`'ün doluluk eşiği sorusu (cevabımız §2.1) planda karşılanmamış —
Faz 4'te herkes aynı anda 10 puan kaybedeceği için hâlâ açık.

### 6.3 `nvarchar(300)` bir güvenlik payı değil, tam sınır

§3.1 kolonu 300 seçip "iş kuralı 150, kolonda güvenlik payı" diyor. Pay yok:
astral düzlem emoji'si (😀 gibi) code point başına **tam 2** UTF-16 birimi —
150 code point = 300 birim, yani kolon tam sınırda dolar.

Bugün sorun değil çünkü tüm prompt'lar 150. Ama `PromptRules.MaxLengthFor(p)`
prompt başına **değişken** ve §2.3 bunu uçtan da yayınlıyor. İlk 200'lük prompt
eklendiğinde 400 birim gerekir, kolon 300'dür ve **geçerli bir cevap DB'de
truncation hatası verir** — tam olarak kolonun engellemek için seçildiği durum.

**İstenen:** kolon genişliği en büyük `MaxLengthFor` değerinden türetilsin
(`max × 2`) ve bu bağ bir yorumla yazılsın. Bugün 300 doğru, yarın sessizce yanlış olur.

### 6.4 `UT-2205` metni 150'yi sabitliyor

Aynı gerekçe: mesaj *"Cevabın en fazla 150 karakter olabilir"* sabit, `maxLength`
ise prompt başına değişken.

FE'de sorun çıkarmıyor — bizde UI metni koda bağlanır, `message` yalnız bilinmeyen
kod fallback'i (`responseCodes.ts` başlığı), ve limit sayısını katalogdaki
`maxLength`'ten okuyoruz (öneri §4.1/2). Yani metin bizde görünmüyor. Yalnız admin
paneli/log tarafında yanıltıcı olmasın diye not düşüyoruz.

### 6.5 §4.4'ün `promptIndex`'i — cevabımızın §1'i geçerli

Plan `Result`'a düz `{ promptIndex: 1 }` koymayı öneriyor. Bu doküman ondan sonra
yazıldı: **dizi şekli** istiyoruz (`result.prompts[]`), gerekçeler §1'de —
özellikle bayat katalog kaynaklı `UT-2202` kurtarması ve tek round-trip.
Planın §4.4'ü buna göre güncellensin.
