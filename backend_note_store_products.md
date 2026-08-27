# Not paketleri — mağaza/RC kurulumu ve backend'de yapılacaklar

**Tarih:** 2026-08-27
**Kaynak sözleşme:** `backend_note_consumable_proposal.md` (§6 redeem, §7 kodlar) —
bu doküman onu **değiştirmiyor**, yalnızca §6.1'de "doldurulacak" kalan mağaza
tarafını kesinleştiriyor.
**Durum:** ASC ürünleri + RC offering'i oluşturuldu. Backend'de kalan iş
**ürün→kredi tablosu** ve **webhook'un consumable ürünleri tanıması**.

---

## TL;DR

- Ürün id'leri: **`note_2` · `note_4` · `note_6` · `note_8`** (öneri metnindeki
  `note_1/3/10` **geçersiz**, hiç oluşturulmadı).
- RC offering id'si: **`notes`** (öneride tekil `note` yazıyordu; RC'de çoğul
  açıldı, `superlikes` ile aynı kural). API tarafı id'si `ofrngd89e5e55aa`.
- Backend'in tek yeni bilgisi ürün→kredi eşlemesi. Uç, kodlar, idempotency
  kuralları §6'da yazıldığı gibi kalıyor — **yeni sözleşme yok**.
- ⚠️ Açık blokaj değişmedi: sandbox'ta `NON_RENEWING_PURCHASE` webhook'u
  inmediği sürece redeem 402 döner ve **hiçbir paket krediye dönüşmez.**

---

## 1. App Store Connect ürünleri

Dördü de **Consumable**.

| Product ID | Reference Name | Kredi | Fiyat (TR) | Birim |
|---|---|---|---|---|
| `note_2` | Note Pack 2 | 2 | ₺84,99 | ₺42,5 |
| `note_4` | Note Pack 4 | 4 | ₺149,99 | ₺37,5 |
| `note_6` | Note Pack 6 | 6 | ₺199,99 | ₺33,3 |
| `note_8` | Note Pack 8 | 8 | ₺249,99 | ₺31,3 |

**Neden 2/4/6/8:** not yazmak SuperLike'tan ağır bir aksiyon (kullanıcı yorum
yazıyor), tüketimi yavaş — 10–20'lik paketler aylarca kullanılmayan bakiye
demekti. 2'lik paket "bir dene" ürünü.

**Neden bu fiyatlar:** not başına maliyet SuperLike'ın ~%25 üstü. Çapa `note_4`:
`superlike_5` ile **aynı para**, bir adet az not. Birim fiyat 2→8 arasında
düşüyor (₺42,5 → ₺31,3), yani büyük paket hâlâ avantajlı.

> Fiyat bilgisi backend'i **ilgilendirmiyor** — burada yalnız kaydı tutuluyor.
> İstemci de fiyatı hiçbir yerde sabitlemiyor, daima RC'nin `priceString`ini
> gösteriyor; ASC'de fiyat değişmesi ne FE sürümü ne backend değişikliği ister.

---

## 2. RevenueCat

| | Değer |
|---|---|
| Offering identifier (SDK) | **`notes`** |
| Offering API id | `ofrngd89e5e55aa` |
| Package identifier'ları | `note_2` / `note_4` / `note_6` / `note_8` (custom) |
| Bağlı ürünler | Lit (iOS) → aynı adlı ASC ürünü |

**`current` offering'i premium'un** — `notes` default yapılmadı, yapılmamalı.
İstemci bu offering'i `offerings.all["notes"]` üzerinden okuyor
(`NOTE_OFFERING_ID`, `subscriptionService.ts`).

RC v2 REST'ten okumak gerekirse offering'in nesne id'si yukarıdaki
`ofrngd89e5e55aa`; ama **redeem doğrulaması offering'e bakmamalı**, satın alma
`transactionId` + `productId` üzerinden doğrulanıyor (§3).

---

## 3. Backend'de yapılacaklar

### 3.1 Ürün → kredi tablosu (tek zorunlu değişiklik)

`POST /api/swipe/Note/Redeem` içindeki eşleme:

| `productId` | `creditsAdded` |
|---|---|
| `note_2` | 2 |
| `note_4` | 4 |
| `note_6` | 6 |
| `note_8` | 8 |

Tablo dışındaki her `productId` → **400 + `UT-6412`** (kalıcı hata; istemci
kuyruktan düşürür, sonsuz retry yapmaz).

⛔ **Ürün id'sinden kredi türetmeyin diye bir zorunluluk yok, ama istemci
türetiyor:** `creditsFromProductId` id'deki İLK sayı grubunu okuyor. Yani ileride
`note_12_2026` gibi bir id açılırsa istemci 12 gösterip backend 0 verir. Yeni
kademe gerekirse id deseni `note_<adet>` kalmalı.

### 3.2 Webhook

`NON_RENEWING_PURCHASE` olayları bu dört ürün için de işlenmeli — SuperLike
(`superlike_*`) ve kurtarma (`recovery_*`) ile aynı boru. Ürün öneki ürün
ailesini belirliyor:

| Önek | Kredi alanı | Redeem ucu |
|---|---|---|
| `superlike_` | SuperLike | `/api/swipe/SuperLike/Redeem` |
| `recovery_` | Kurtarma | `/api/swipe/Recovery/Redeem` |
| `note_` | **Not** | `/api/swipe/Note/Redeem` |

Bir ailenin transaction'ı başka ailenin ucuna gelirse **400 + o ailenin
`UNKNOWN_PRODUCT` kodu** dönmeli; sessizce kredi yazılmamalı.

### 3.3 Değişmeyenler (§6'dan)

1. **`transactionId` bazında idempotent** — tekrar denemede kredi eklenmez,
   `alreadyRedeemed: true` döner. İstemci her açılışta kuyruğu tekrar deniyor.
2. **Webhook yarışı → 402 + `UT-6411`** (geçici; istemci MMKV kuyruğuna yazar,
   backoff'la tekrar dener).
3. **Kalıcı hatalar → 400 + `UT-6412` (ürün tanınmıyor) / `UT-6413` (satın alma
   başka hesaba ait)** — kuyruktan düşürülür.

Kod sırası (`PENDING_WEBHOOK` → `UNKNOWN_PRODUCT` → `BELONGS_TO_ANOTHER_USER`)
istemcide config olarak duruyor; **sıra/anlam değişirse kalıcı bir hata "geçici"
sayılır** ve her açılışta sonuçsuz retry döngüsü doğar.

**Yanıt gövdesi** (§6 ile birebir, `note_4` örneği):

```json
{
  "isSuccess": true,
  "result": {
    "creditsAdded": 4,
    "purchasedNotes": 6,
    "notesRemaining": 6,
    "alreadyRedeemed": false
  }
}
```

---

## 4. Açık blokaj — sandbox webhook'u

2026-08-12 kaydımıza göre consumable redeem sandbox'ta `NON_RENEWING_PURCHASE`
webhook'u inmediği için 402 dönüyordu; kontrol grubu aynı `app_user_id` ile
abonelik `INITIAL_PURCHASE`'ünün indiğini gösteriyordu. Yani bugüne kadar
**hiçbir consumable satın alma uçtan uca krediye dönüşmedi** — SuperLike ve
kurtarma da dahil.

`RevenueCat:AllowSandboxEvents` prod'da kapalı olduğu için sandbox event'leri
reddediliyor (`SANDBOX RevenueCat event production'da reddedildi`).

**İstenen:** tek bir sandbox `note_2` satın almasının `notesRemaining`i gerçekten
2 artırdığı teyit edilsin. Bu doğrulanmadan ürünler canlıya alınmamalı — aksi
halde "para gitti, kredi gelmedi" yüzeyi üçe katlanır.

---

## 5. Kontrol listesi

- [ ] `note_2/4/6/8` ürün→kredi tablosu redeem ucuna eklendi
- [ ] Webhook `note_` önekli `NON_RENEWING_PURCHASE` olaylarını işliyor
- [ ] Yanlış aileye gelen transaction 400 + `UT-6412` dönüyor
- [ ] `AllowSandboxEvents` penceresi açıldı, tek satın alma uçtan uca doğrulandı
- [ ] Doğrulama sonrası FE'ye haber → ürünler ASC'de "Ready to Submit"e alınır

**FE tarafında yapılacak bir şey yok:** adet ürün id'sinden, fiyat RC'den
okunuyor; offering id'si `notes` olarak koda yazıldı. Kademe veya fiyat
değişikliği FE sürümü gerektirmez.
