# Öneri: Premium satın almaları backend'e hiç ulaşmıyor (webhook + RC REST)

**Kimden:** Frontend
**Tarih:** 2026-08-11
**Konu:** RevenueCat'te aktif `premium` entitlement'ı olan kullanıcıda backend premium'u hiç açmıyor; SuperLike consumable redeem'leri de kalıcı 402
**İlgili FE dosyaları:** `src/features/profile/subscriptionSlice.ts`, `src/features/profile/pendingPremiumSync.ts`, `src/features/discover/superlikeRedeem.ts`

---

## TL;DR

| # | İstek | Aciliyet |
|---|---|---|
| 1 | Sandbox satın almaları için **staging ortamı** verilsin, ya da prod'da `RevenueCat:AllowSandboxEvents` test süresince açılsın | Yüksek — premium akışı uçtan uca hiç doğrulanamıyor |
| 2 | `RevenueCat:RestApiKey` konfigüre mi, doğru RC projesine mi bakıyor? `/sync` `source: "none"` dönüyor, yani REST bacağı çalışmıyor | Yüksek |
| 3 | RC dashboard → Integrations → Webhooks **delivery log**'u paylaşılsın: event'ler çıkıyor mu, endpoint hangi status'u dönüyor | Yüksek |

FE tarafında yapılacak iş **kalmadı**: satın alma kalıcı kuyruğa yazılıyor, her açılış
ve foreground'da `/sync` ile yeniden deneniyor. Backend premium'u gördüğü an premium,
SuperLike kotası ve bekleyen paket redeem'leri kendiliğinden oturur.

---

## 1. Kanıt

Tek bir cihaz oturumundan, aynı kullanıcı için:

```
[RevenueCat] appUserID = 0e016b76-6702-4d8b-ac7c-ff193a4dae25
             (backend userId: 0e016b76-6702-4d8b-ac7c-ff193a4dae25)
[RevenueCat] aktif entitlement'lar: ["premium"]  (aranan: "premium")
             productId: premium_weekly
[subscription] sync başarısız — reason: NOT_FOUND_IN_RC / source: none / deneme: 1
[superlike] 3 bekleyen redeem denenecek        ← üçü de kalıcı 402
```

Yani:

- **Kimlik eşlemesi doğru.** `appUserID` = backend `UserId`. Anonim satın alma
  (`$RCAnonymousID:…`) senaryosu elendi; `TRANSFER` beklemeye gerek yok.
- **RevenueCat satın almayı görüyor.** Aktif entitlement'ın adı da beklenen
  (`premium`), ürün `premium_weekly` — katalogla uyumlu.
- **Backend göremiyor.** `/api/subscription/status` premium dönmüyor,
  `/api/subscription/sync` `NOT_FOUND_IN_RC` diyor.

## 2. Neden `source: "none"` belirleyici

Dokümanın kendi tablosuna göre RC REST'e gerçekten sorulduğunda `source: "rc_rest"`
dönmesi bekleniyor. `source: "none"` geldiğine göre REST bacağı ya hiç çalışmadı ya da
sonucu yok sayıldı. RC'de entitlement'ın **var olduğunu** yukarıda kanıtladığımız için
"RC'de gerçekten yok" ihtimali kalmıyor.

Backend'in premium'u öğrenebileceği iki yol var ve şu an **ikisi de kapalı**:

| Yol | Durum | Kanıt |
|---|---|---|
| RevenueCat webhook | İnmiyor / reddediliyor | 3 consumable redeem'i kalıcı 402 (`NON_RENEWING_PURCHASE` de işlenmemiş) |
| RC REST fallback | Çalışmıyor | `/sync` → `source: "none"` |

## 3. En olası tek sebep

Uygulama **prod backend'e** (`lit.4fourstack.com`) bağlı, dev-client build'de yapılan
her StoreKit satın alması ise **sandbox**. Rehberin §7 ve "bilinen tuzaklar" #7 maddesi
bu kombinasyonu birebir tarif ediyor:

> Production ortamında sandbox event'leri reddedilir (`RevenueCat:AllowSandboxEvents`
> kapalı). Prod build'de sandbox satın alması yaparsanız webhook düşmez → premium
> açılmaz, redeem sürekli 402 döner.

Bu tek sebep her iki bacağı da açıklıyor (webhook reddi + REST sonucunun sandbox diye
yok sayılması). Doğrulanması için: aynı akışın **sandbox event'leri kabul eden** bir
ortamda tekrarlanması.

## 4. İstenen

1. Dev/staging ortamı — veya prod'da `AllowSandboxEvents`'in **süreli** açılması
   (rehberde "prod'da test gerekiyorsa söyleyin, süreli açalım" deniyor).
2. `RevenueCat:RestApiKey`'in tanımlı ve doğru RC projesine bakıyor olduğunun teyidi.
   REST fallback'i webhook gecikmelerine karşı tek emniyet supabı; kapalıyken tamamen
   webhook'a bağlıyız.
3. Webhook delivery log'u: event'ler RC'den çıkıyor mu, `Authorization` header'ı backend
   config'iyle birebir aynı mı, endpoint hangi status'u dönüyor.

## 5. Doğrulama senaryosu

Ayar açıldıktan sonra, FE'de hiçbir değişiklik gerekmeden:

| # | Adım | Beklenen |
|---|---|---|
| 1 | Premium satın al | `/sync` → `synced: true`, `reason: WEBHOOK_LANDED` veya `RC_REST_CONFIRMED` |
| 2 | `GET /api/swipe/Stats` | `isPremium: true`, `superLikesRemaining` **5'e çıkmış** (ilk grant) |
| 3 | Uygulamayı kapat/aç | Premium korunur (server-side) |
| 4 | Bekleyen 3 SuperLike paketi | Açılışta kuyruk boşalır, `creditsAdded > 0` |

Test hesabı: `0e016b76-6702-4d8b-ac7c-ff193a4dae25`
