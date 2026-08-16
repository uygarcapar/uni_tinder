# Frontend Entegrasyon Rehberi — Premium & SuperLike (Tam Akış)

> **Tarih:** 2026-08-11
> **Kapsam:** Premium abonelik, SuperLike kotası, SuperLike consumable paketleri, satın alma
> senkronizasyonu (`sync` / `reconcile`), RevenueCat webhook davranışı, tüm paywall'lar,
> restore/identity, trial & grace period, bildirimler, hata kodları, test senaryoları.
> **Durum:** Bu doküman koddan (master) doğrulanarak yazıldı. Aşağıdaki eski dokümanları
> **geçersiz kılar / birleştirir:**
> - `docs/frontend_superlike_pack_guide.md` (2026-08-07) — §1'deki 402/400 ayrımı değişti
> - `docs/frontend_revenuecat_env_handoff.md` (2026-08-10) — env kurulumu hâlâ geçerli, buraya özetlendi
> - `docs/frontend_chat_quota_premium_guide.md`

---

## İçindekiler

1. [Temel model — kim otorite?](#1-temel-model--kim-otorite)
2. [Ürün kataloğu ve RevenueCat kurulumu](#2-ürün-kataloğu-ve-revenuecat-kurulumu)
3. [Endpoint referansı (tam liste)](#3-endpoint-referansı-tam-liste)
4. [Premium satın alma akışı — uçtan uca](#4-premium-satın-alma-akışı--uçtan-uca)
5. [SuperLike sistemi — kota semantiği](#5-superlike-sistemi--kota-semantiği)
6. [SuperLike paketi satın alma + redeem](#6-superlike-paketi-satın-alma--redeem)
7. [Webhook tarafında ne oluyor](#7-webhook-tarafında-ne-oluyor)
8. [Premium'un açtığı tüm özellikler & paywall matrisi](#8-premiumun-açtığı-tüm-özellikler--paywall-matrisi)
9. [Restore, hesap değiştirme, anonim ID](#9-restore-hesap-değiştirme-anonim-id)
10. [Trial ve grace period](#10-trial-ve-grace-period)
11. [Bildirimler](#11-bildirimler)
12. [Cache / state yönetimi matrisi](#12-cache--state-yönetimi-matrisi)
13. [HTTP status & hata kodu matrisi](#13-http-status--hata-kodu-matrisi)
14. [Bilinen tuzaklar](#14-bilinen-tuzaklar)
15. [Test senaryoları](#15-test-senaryoları)
16. [Checklist](#16-checklist)

---

## 1. Temel model — kim otorite?

```
┌──────────┐   satın alma    ┌────────────┐   webhook (server→server)   ┌─────────┐
│  Store   │────────────────▶│ RevenueCat │────────────────────────────▶│ Backend │
│ ASC/Play │                 │            │                             │   DB    │
└──────────┘                 └────────────┘                             └─────────┘
                                   │  customerInfo (SDK cache)               ▲
                                   ▼                                        │
                              ┌──────────┐   GET /api/subscription/status    │
                              │  Mobil   │───────────────────────────────────┘
                              └──────────┘
```

**Kural:** Premium hakkının **tek otoritesi backend'dir** (`UserProfile.IsPremium` +
`PremiumExpiresAt`). RC SDK'nın `customerInfo`'su paralel bir cache'tir; UI'ı **backend
status'una göre** render edin.

- Backend `IsActivelyPremium()` = `IsPremium == true` **ve** (`PremiumExpiresAt == null`
  veya `PremiumExpiresAt > now`). Yani expire tarihi geçmiş kullanıcı, DB'de bayrak `true`
  kalsa bile premium değildir (saatlik job bayrağı ayrıca temizler).
- RC SDK premium diyor ama backend demiyorsa → `POST /api/subscription/reconcile`.
- **JWT içindeki `IsPremium` claim'i satın alma anında güncellenmez** — token yenilenene
  kadar eski değeri taşır. Gating için asla token claim'ini kullanmayın; `status` / `Stats`
  endpoint'lerini kullanın.

**Base URL (prod):** `https://api.lit.4ourstack.com`

---

## 2. Ürün kataloğu ve RevenueCat kurulumu

### 2.1 Ürün ID'leri (birebir bu şekilde olmalı)

| Tip | Product ID | Nerede tanımlı | Not |
|---|---|---|---|
| Abonelik | `premium_weekly` | ASC/Play + RC + backend `SubscriptionProducts` | entitlement: `premium` |
| Abonelik | `premium_monthly` | aynı | entitlement: `premium` |
| Abonelik | `premium_yearly` | aynı | `highlight: "En Avantajlı"` |
| Consumable | `superlike_5` | ASC/Play + RC offering `superlikes` | +5 kredi |
| Consumable | `superlike_10` | aynı | +10 kredi |
| Consumable | `superlike_15` | aynı | +15 kredi |
| Consumable | `superlike_20` | aynı | +20 kredi |

- **Entitlement adı:** `premium` (backend RC REST fallback'inde önce bu adı arar, yoksa
  süresi dolmamış ilk entitlement'ı kabul eder).
- **Offering:** SuperLike paketleri için ayrı offering, id `superlikes`
  (`EXPO_PUBLIC_REVENUECAT_SUPERLIKE_OFFERING_ID` ile override edilebilir).
- **Kredi map'i backend config'inden okunur** (`SwipeLimits:SuperLikePackCredits`) —
  yeni paket eklenir/isim değişirse **deploy gerekmeden** güncellenir. Yeni id açacaksanız
  bize haber verin, aynı gün config'e ekleriz.

### 2.2 Mobil env (build-time)

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_XXXX      # public key, appl_ ile başlar
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_XXXX  # public key, goog_ ile başlar
# opsiyonel (kodda default'ları var)
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=premium
EXPO_PUBLIC_REVENUECAT_SUPERLIKE_OFFERING_ID=superlikes
```

> ⚠️ `sk_...` secret key **mobil bundle'a girmez** — o yalnızca backend'in
> `RevenueCat:RestApiKey`'i. `EXPO_PUBLIC_*` değişkenleri build anında bundle'a gömülür,
> OTA update ile düzelmez → **yeni build şart**.

### 2.3 SDK identity — kritik

```ts
// Login sonrası, HER OTURUMDA:
await Purchases.logIn(backendUserId);   // app_user_id == backend UserId olmalı
// Logout'ta:
await Purchases.logOut();
```

Webhook `app_user_id`'yi backend `UserId` ile eşleştirir. `logIn` çağrılmazsa satın alma
`$RCAnonymousID:...` altında oluşur ve premium yanlış (veya hiçbir) hesaba yazılır.
Backend `TRANSFER` / `SUBSCRIBER_ALIAS` event'leriyle bunu kurtarmaya çalışır (§9) ama
birincil çözüm `logIn`'dir.

---

## 3. Endpoint referansı (tam liste)

### ⚠️ Önce şunu okuyun: HTTP status semantiği iki farklı

| Grup | Endpoint'ler | HTTP status davranışı |
|---|---|---|
| **A — "her zaman 200"** | `/api/swipe/*` action'larının çoğu (`SuperLike`, `Like`, `Undo`, `Stats`, `UpdateFilters`, `RecoverMissedMatch`…) | Gerçek HTTP **her zaman 200**. Gerçek sonuç gövdedeki `isSuccess` + `statusCode` alanlarındadır. |
| **B — gerçek status** | `/api/swipe/SuperLike/Redeem`, `/api/subscription/*`, `/api/messages/send` | Gerçek HTTP status kullanılır (200/400/402/403/…). |

Grup A'da `response.status === 200` kontrolü **hiçbir şey söylemez**; `body.isSuccess` ve
`body.statusCode`'a bakın. Grup B'de (özellikle Redeem'de) `response.status`'a bakın.

Tüm yanıtlar `ResponseDto` zarfındadır:

```jsonc
{
  "result": { /* asıl payload */ },
  "statusCode": 200,          // niyet edilen status (Grup A'da HTTP ile aynı olmayabilir)
  "isSuccess": true,
  "message": "…",             // kullanıcıya gösterilebilir metin (TR)
  "code": "UT-6101",          // makine-okunur kod — switch HER ZAMAN bunun üzerinden
  "action": null              // opsiyonel aksiyon etiketi ("Premium'u İncele")
}
```

JSON camelCase, enum'lar **string** olarak serialize edilir. Tarihler UTC ISO-8601.

---

### 3.1 `GET /api/subscription/plans` — plan kataloğu

**Auth:** gerekmez (`AllowAnonymous`).

```jsonc
{
  "isSuccess": true,
  "result": {
    "plans": [
      { "productId": "premium_weekly",  "period": "weekly",  "entitlement": "premium",
        "displayName": "Haftalık Premium", "highlight": null, "sortOrder": 1 },
      { "productId": "premium_monthly", "period": "monthly", "entitlement": "premium",
        "displayName": "Aylık Premium",    "highlight": null, "sortOrder": 2 },
      { "productId": "premium_yearly",  "period": "yearly",  "entitlement": "premium",
        "displayName": "Yıllık Premium",   "highlight": "En Avantajlı", "sortOrder": 3 }
    ]
  }
}
```

**Kullanım:** `displayName`, `highlight`, `sortOrder` server-controlled UI metadata'dır —
kampanya metnini deploy'suz değiştirebilmemiz için. **Fiyat buradan gelmez**; fiyatı
RC paketinin `priceString`'inden okuyun (locale/para birimi doğru olsun diye).

Eşleştirme: `plans[].productId` ↔ `offerings.current.availablePackages[].product.identifier`.

---

### 3.2 `GET /api/subscription/status` — canonical premium durumu

**Auth:** zorunlu. **Rate limit:** 60 istek / 60 sn (`/api/subscription/*` tümü için ortak).

```jsonc
{
  "isSuccess": true,
  "result": {
    "isActivelyPremium": true,
    "premiumExpiresAt": "2026-09-11T10:22:31Z",
    "productId": "premium_monthly",
    "status": "Active",                  // Active | Cancelled | Expired | BillingIssue | Paused
    "autoRenewEnabled": true,
    "purchasedAt": "2026-08-11T10:22:31Z",
    "cancelledAt": null,
    "isTrial": false,
    "trialEndsAt": null,
    "gracePeriodEndsAt": null,
    "provider": "AppStore",              // AppStore | PlayStore | RevenueCat
    "originalTransactionId": "2000000123456789",
    "latestTransactionId": "2000000987654321"
  }
}
```

**Gating için tek alan: `isActivelyPremium`.** `status === "Cancelled"` premium'un
bittiği anlamına gelmez — dönem sonuna kadar `isActivelyPremium: true` kalır (o durumda
"X tarihinde bitecek, yenilenmeyecek" mesajı gösterin).

**Ne zaman çağrılır:** app açılışında (login sonrası), premium ekranı açılırken,
foreground'a dönüşte, satın alma sonrası.

---

### 3.3 `POST /api/subscription/sync` — "webhook indi mi?" doğrulaması

**Auth:** zorunlu. **Body:** yok.

Satın alma / restore sonrası backend hâlâ premium göstermiyorsa bunu çağırın. Backend
önce local DB'ye bakar, aktif premium göremezse **RevenueCat REST API'ye** sorar; RC'de
aktif entitlement varsa DB'ye yazar ve premium'u **hemen** açar.

```jsonc
{
  "isSuccess": true,
  "result": {
    "synced": true,
    "source": "rc_rest",              // db | rc_rest | none
    "reason": "RC_REST_CONFIRMED",    // aşağıdaki tablo
    "status": { /* SubscriptionStatusDto — 3.2 ile aynı şema */ }
  }
}
```

| `reason` | `source` | Anlamı | FE ne yapmalı |
|---|---|---|---|
| `WEBHOOK_LANDED` | `db` | Webhook inmiş, DB'de aktif premium var | Bitti. Premium'u aç. |
| `RC_REST_CONFIRMED` | `rc_rest` | Webhook gecikti ama RC teyit etti, DB'ye yazıldı | Bitti. Premium'u aç. |
| `NOT_FOUND_IN_RC` | `rc_rest` / `none` | RC'de de aktif entitlement yok | Gerçekten premium değil. Retry'ı durdur. |
| `RC_REST_ERROR` | `db` | RC REST'e ulaşılamadı, local cevap dönüldü | Kısa bir süre sonra tekrar dene (max 3). |

> ℹ️ `synced: false` + `NOT_FOUND_IN_RC` gelirse sonsuz retry yapmayın. Backend RC'ye
> gereksiz yük binmesin diye aynı kullanıcı için **10 sn negative cache** tutar; o pencerede
> tekrar çağırmak RC'ye gitmez, aynı cevabı döner.

---

### 3.4 `POST /api/subscription/reconcile` — RC SDK ↔ backend uyuşmazlığı

**Auth:** zorunlu. **Body opsiyonel** (audit log'a düşer):

```jsonc
{
  "rcEntitlements": ["premium"],
  "rcLatestTransactionId": "2000000987654321",
  "rcOriginalTransactionId": "2000000123456789"
}
```

Yanıt `sync` ile **birebir aynı** şema. Şu an ikisi aynı flow'u çalıştırır; ayrı tutulma
sebebi semantik ve gelecekteki receipt cross-check'i.

**Ne zaman:** `Purchases.addCustomerInfoUpdateListener` tetiklendiğinde RC premium diyor
ama backend `isActivelyPremium: false` ise.

---

### 3.5 `GET /api/swipe/Stats` — tüm kotalar tek yerden

**Auth:** zorunlu. **Rate limit:** 120/60 sn (`/api/swipe/*` ortak).

```jsonc
{
  "isSuccess": true,
  "result": {
    "isPremium": true,
    "premiumExpiresAt": "2026-09-11T10:22:31Z",

    // ── Swipe (Like) kotası — Pass sayılmaz, her zaman sınırsız
    "totalSwipesToday": 12,
    "remainingSwipes": -1,            // -1 = sınırsız (premium)
    "dailySwipeLimit": -1,            // free → 30, premium → -1
    "swipeCountResetAt": "2026-08-11T00:00:00Z",
    "nextSwipeResetAt": "2026-08-12T00:00:00Z",
    "swipeResetInSeconds": 48231,

    // ── SuperLike
    "superLikesRemaining": 15,        // TOPLAM = tier kotası + satın alınan kredi (taban 0)
    "purchasedSuperLikes": 12,        // satın alınmış, SÜRESİZ kredi
    "quotaSuperLikesRemaining": 3,    // yalnız tier kotasından kalan
    "weeklySuperLikeLimit": 5,        // yalnız TIER tavanı (krediyi KAPSAMAZ)
    "superLikeCountResetAt": "2026-08-08T09:00:00Z",
    "nextSuperLikeResetAt": "2026-08-15T09:00:00Z",
    "superLikeResetInSeconds": 312000,   // free'de -1 (asla resetlenmez)

    // ── Undo / Rewind
    "remainingUndos": -1,             // free → 3'ten kalan, premium → -1
    "dailyUndoLimit": -1,             // free → 3, premium → -1
    "undoCountResetAt": "…", "nextUndoResetAt": "…", "undoResetInSeconds": 48231,

    // ── Kaçırılan eşleşme kurtarma
    "remainingMissedMatchRecovery": 5,   // free 2/gün, premium 5/gün
    "missedMatchRecoveryResetAt": "…", "nextMissedMatchRecoveryResetAt": "…",
    "missedMatchRecoveryResetInSeconds": 48231,

    // ── Bugünkü aktivite
    "likesToday": 12, "passesToday": 40, "superLikesToday": 1, "matchesToday": 2
  }
}
```

**Konvansiyonlar:**
- `-1` = **sınırsız** (`remainingSwipes`, `dailySwipeLimit`, `remainingUndos`, `dailyUndoLimit`).
- `superLikeResetInSeconds: -1` = **asla resetlenmez** (free tier). Bu durumda
  `nextSuperLikeResetAt` sentinel bir değerdir (`9999-12-31T23:59:59.9999999`) — parse edip
  ekrana basmayın, `-1` kontrolüyle geri sayımı tamamen gizleyin.
- `superLikesRemaining` **asla negatif gelmez** (taban 0, üç endpoint'te tek helper'dan geçer).
- `superLikesRemaining > weeklySuperLikeLimit` **olabilir** (3 kota + 12 kredi = 15 > 5).
  Backend clamp yapmaz — clamp satın alınan krediyi yakardı. Oran çizecekseniz payda
  `weeklySuperLikeLimit + purchasedSuperLikes` olmalı.

---

### 3.6 `GET /api/swipe/CheckSwipeLimit` — hafif kontrol

```jsonc
{ "isSuccess": true, "result": {
    "canSwipe": true,
    "dailySwipeLimit": -1, "weeklySuperLikeLimit": 5, "dailyUndoLimit": -1 } }
```

Deck açılışında hızlı kontrol için. Detay gerekiyorsa `Stats` kullanın.

---

### 3.7 `POST /api/swipe/SuperLike` — süper beğeni gönder

**Body:** `{ "targetUserId": "…" }` → **HTTP her zaman 200** (Grup A).

**Başarı:**
```jsonc
{
  "isSuccess": true, "statusCode": 200, "message": "Super Like gönderildi!",
  "result": {
    "isSuccess": true,
    "isMatch": false,
    "remainingSuperLikes": 14,           // TOPLAM (kota + kredi), Stats ile aynı semantik
    "remainingPurchasedSuperLikes": 12   // kredinin kalanı
  }
}
```

**Kota + kredi ikisi de bittiğinde:**
```jsonc
{
  "isSuccess": false, "statusCode": 400,
  "message": "Super like hakkın bitti! 💫",
  "result": {
    "isSuccess": false,
    "showPaywall": true,
    "paywallType": "SUPER_LIKE_LIMIT",
    "paywallMessage": "Super like paketi alarak hemen devam edebilirsin — satın alınan haklar süresiz ⭐",
    "remainingSuperLikes": 0,
    "remainingPurchasedSuperLikes": 0
  }
}
```

⚠️ **`showPaywall` premium kullanıcıda da `true` gelir** — premium'un da satın alabileceği
bir şey var (paket). Bu akışı premium abonelik modalına değil, **SuperLike paket modalına**
bağlayın. Premium için mesaj farklıdır:
> "Bu döngüdeki super like limitin doldu! 💫" / "7 günlük cycle dolduğunda kotan yenilenecek —
> ya da super like paketi alarak hemen devam edebilirsin ⭐"

**Diğer başarısızlıklar:** `"Bu kullanıcıyı zaten süper beğendiniz"` (dup),
`"Kullanıcı bulunamadı"` — bunlarda `showPaywall` gelmez.

> Like → SuperLike **upgrade'ine izin verilir** (aynı kişiye önce Like atıp sonra SuperLike
> atabilir). Mevcut SuperLike varsa reddedilir. Kota kontrolü duplicate kontrolünden
> **sonra** yapılır → dup istekte kota sızmaz.

---

### 3.8 `POST /api/swipe/SuperLike/Redeem` — paket kredisini hesaba yaz

**Bu endpoint Grup B'dir — gerçek HTTP status döner.** Detaylı akış §6'da.

**Body:**
```jsonc
{ "transactionId": "2000000123456789", "productId": "superlike_10" }
```
`productId` opsiyoneldir ve **yalnızca log/uyuşmazlık tespiti** içindir. Kredi miktarı
webhook'la gelen kayıttan türetilir — client spoof edemez.

| HTTP | `code` | Anlam | FE aksiyonu |
|---|---|---|---|
| `200` | — | Redeem başarılı **veya** idempotent tekrar | Bakiyeyi yanıttan güncelle, kuyruktan sil |
| `402` | `UT-6101` | Webhook henüz inmedi (**tek geçici durum**) | 3 sn bekle, 1 kez retry, sonra kuyruğa al |
| `400` | `UT-6102` | Ürün tanımlı değil (RC/ASC config hatası) | **Retry etme.** Destek'e yönlendir, bize bildir |
| `400` | `UT-6103` | Transaction başka hesaba ait (paylaşılan receipt) | **Retry etme.** "Bu satın alma bu hesaba ait değil" |
| `400` | — | `transactionId` boş | İstemci bug'ı |
| `401` | — | Token geçersiz | Login'e yönlendir |

> 🔴 **Değişiklik (eski dokümana göre):** "başka hesaba ait" durumu artık **402 değil 400 +
> `UT-6103`** döner. Eskiden 402 dönüyordu ve FE bunu webhook yarışı sanıp sonuçsuz retry
> döngüsüne giriyordu. **Karar her zaman `code` alanından verilmeli**, mesaj metninden değil.

**200 gövdesi:**
```jsonc
{
  "isSuccess": true,
  "message": "Super like paketin hesabına eklendi!",
  "result": {
    "creditsAdded": 10,          // idempotent tekrarda 0
    "purchasedSuperLikes": 12,   // toplam süresiz kredi
    "superLikesRemaining": 15,   // kota + kredi
    "alreadyRedeemed": false     // true → daha önce işlenmişti, hata DEĞİL
  }
}
```

---

### 3.9 `POST /api/swipe/Undo` — geri al (rewind)

HTTP her zaman 200. Free 3/gün, premium sınırsız.

```jsonc
// Başarı
{ "isSuccess": true, "result": {
    "undoneTargetUserId": "…", "undoneAction": "Like", "remainingUndosToday": -1 } }

// Limit doldu (free)
{ "isSuccess": false, "statusCode": 403, "result": {
    "showPaywall": true, "paywallType": "UNDO_LIMIT" } }
```

---

### 3.10 `PUT /api/swipe/UpdateFilters` — premium filtreler

HTTP her zaman 200. Free kullanıcı premium alanlardan **herhangi birini** gönderirse
istek **tümüyle** reddedilir (kısmi uygulama yok):

```jsonc
{
  "isSuccess": false, "statusCode": 403,
  "message": "Bu filtreler sadece Premium üyeler için!",
  "result": { "showPaywall": true, "paywallType": "PREMIUM_FILTERS" }
}
```

| Free'de serbest | Premium-only |
|---|---|
| `ageRangeMin/Max`, `maxDistance`, `genders`, `interestedIn` | `universityDomains`, `visibleOnlyToUniversityDomains`, `hiddenFromUniversityDomains`, `city`, `department`, `yearsOfStudy`, `heightMin/Max`, `zodiacSigns`, `smokingStatuses`, `hasPets`, `usagePurposes`, `relationshipIntents`, `hairColors`, `hairStyles`, `eyeColors`, `facialHairs`, `hasGlasses`, `preferredHobbies`, `dealbreakers` |

> 📌 **`maxDistance` artık premium-only DEĞİL.** Free kullanıcı da istediği mesafeyi
> serbestçe ayarlayabilir, üst sınır yok. Eski "free 50km cap" davranışı kaldırıldı —
> UI'da kilit ikonu varsa silin.

---

### 3.11 `POST /api/swipe/RecoverMissedMatch` — kaçırılan eşleşme

Free 2/gün, premium 5/gün. Limit dolunca `showPaywall: true`,
`paywallType: "MISSED_MATCH_RECOVERY_LIMIT"` (gövdede `statusCode: 403`, HTTP yine 200).

---

### 3.12 Chat kotası — `GET /api/messages/conversations/{id}/quota`

**Kural:** Taraflardan **en az biri** aktif premium ise sohbet **sınırsız**. İkisi de free
ise **konuşma başına 30 mesaj**.

```jsonc
{ "isSuccess": true, "result": {
    "conversationId": "…",
    "hasPremiumParticipant": false,
    "isUnlimited": false,        // ← UI bunu kullansın (hasPremiumParticipant || isUnlocked)
    "isUnlocked": false,         // legacy/manuel destek grant'i
    "messageCount": 30,
    "freeMessageLimit": 30,
    "remainingMessages": 0,      // isUnlimited ise null
    "requiresPremium": true,     // ← cap doldu, Premium modalını aç
    "bothPremium": false,        // DEPRECATED — kullanmayın
    "requiresUnlock": true       // DEPRECATED — kullanmayın
} }
```

### 3.13 `POST /api/messages/send` — kota dolduğunda **gerçek 402**

```jsonc
// HTTP 402
{
  "isSuccess": false, "statusCode": 402,
  "message": "Bu sohbette 30 mesaj sınırına ulaştın. Premium'a geç, sınırsız mesajlaş.",
  "result": { "showPaywall": true, "paywallType": "CHAT_QUOTA_EXHAUSTED" }
}
```

Buradaki 402 **retry sinyali değil** — Premium paywall'ını açın. (Redeem'deki 402 ile
karıştırmayın; sohbete özel satın alma akışı **kaldırıldı**, tek çıkış Premium'dur.)

---

## 4. Premium satın alma akışı — uçtan uca

```
Kullanıcı          FE                     RevenueCat            Backend
   │               │                          │                    │
   │  Premium ────▶│ GET /subscription/plans ─────────────────────▶│ (UI metadata)
   │  ekranı       │ getOfferings() ─────────▶│                    │ (fiyatlar)
   │               │                          │                    │
   │  plan seç ───▶│ purchasePackage(pkg) ───▶│                    │
   │               │                          │─ INITIAL_PURCHASE ▶│ ① premium aç
   │               │◀── customerInfo ─────────│    (webhook)       │   SuperLike kotası=5
   │               │                          │                    │   7-gün cycle başlat
   │               │ GET /subscription/status ────────────────────▶│
   │               │◀── isActivelyPremium: true ───────────────────│ ② UI'ı premium yap
```

### 4.1 Satın alma sonrası doğrulama politikası (önerilen)

Webhook genelde **1-3 sn** içinde iner, ama garanti değil. Şu sırayı uygulayın:

```ts
async function afterPurchase() {
  // 1) İyimser UI: RC customerInfo entitlement veriyorsa premium'u hemen aç
  //    (backend teyidi gelene kadar geçici).
  // 2) Backend teyidi:
  for (const delay of [0, 1500, 3000, 6000]) {     // toplam ~10 sn
    if (delay) await sleep(delay);
    const { result } = await api.post('/api/subscription/sync');
    if (result.status.isActivelyPremium) {
      queryClient.setQueryData(subKeys.status, result.status);
      queryClient.invalidateQueries(swipeKeys.stats);   // SuperLike kotası 5'e çıktı
      return true;
    }
    if (result.reason === 'NOT_FOUND_IN_RC') break;     // gerçekten yok, bekleme
  }
  // 3) Hâlâ yoksa: "Satın alman alındı, birkaç dakika içinde yansıyacak" göster,
  //    app açılışında /sync'i tekrar dene. Para alındı → kullanıcıyı asla boşta bırakma.
  return false;
}
```

> `sync` çağrısı **ücretsiz ve güvenlidir** — idempotenttir, aynı satırı günceller.
> Rate limit 60/dk olduğu için yukarıdaki backoff bol bol yeterli.

### 4.2 App açılış akışı

```ts
await Purchases.logIn(userId);                 // kimlik
const status = await getSubscriptionStatus();  // GET /api/subscription/status
if (!status.isActivelyPremium && rcSaysPremium()) {
  await api.post('/api/subscription/reconcile', {
    rcEntitlements: [...], rcLatestTransactionId, rcOriginalTransactionId
  });
}
await flushPendingSuperlikeRedeems();          // §6.3 — kuyruğu boşalt
```

---

## 5. SuperLike sistemi — kota semantiği

### 5.1 İki ayrı havuz

| Havuz | Kaynak | Süre | Reset |
|---|---|---|---|
| **Tier kotası** | Free: **1 (lifetime)** · Premium: **5** | — | Free: **asla** · Premium: **7 gün rolling** |
| **Satın alınan kredi** | `superlike_5/10/15/20` paketleri | **Süresiz** | Reset yok, premium'dan bağımsız |

- **Free tier lifetime'dır**: 1 hak biter, kullanıcı premium'a geçene kadar (veya paket
  alana kadar) yenilenmez. `superLikeResetInSeconds: -1` bunu bildirir → UI'da "yarın
  yenilenecek" **yazmayın**.
- **Premium 7-gün rolling cycle**: sayaç premium'un verildiği andan (`superLikeCountResetAt`)
  başlar; takvim haftası değil. `nextSuperLikeResetAt` gerçek tarihtir.
- **Free → Premium geçişinde** kota **anında 5'e** set edilir ve cycle o an başlar
  (webhook ve `/sync` yollarının ikisinde de). Renewal / cycle ortası sync'ler kotaya
  **dokunmaz**.
- **Premium bitince** mevcut `superLikeCount` **korunur** (geri alınmaz).

### 5.2 Tüketim sırası — önce kota, sonra kredi

```
POST /SuperLike
   ├─ tier kotası > 0?     ──evet──▶ kotadan düş  → 200
   ├─ hayır → kredi > 0?   ──evet──▶ krediden düş → 200
   └─ ikisi de 0 ──────────────────▶ isSuccess:false + SUPER_LIKE_LIMIT paywall
```

Sıra bilinçli: premium kotası 7 günde bir yenileniyor; önce kredi harcansaydı kullanıcının
**parayla aldığı** hak giderken bedava kota cycle dönüşünde yanardı. Her iki adım da tek
atomic SQL UPDATE — paralel istekler aynı hakkı iki kez harcayamaz.

### 5.3 FE'nin okuyacağı alanlar

| Amaç | Alan |
|---|---|
| Buton aktif/pasif, rozet sayısı | `superLikesRemaining` (tek kaynak) |
| "X tanesi satın alındı" detayı | `purchasedSuperLikes` |
| "Kotan yenilendi" ayrımı | `quotaSuperLikesRemaining` |
| Doluluk oranı paydası | `weeklySuperLikeLimit + purchasedSuperLikes` |
| Geri sayım | `nextSuperLikeResetAt` / `superLikeResetInSeconds` (`-1` → gösterme) |

Optimistic decrement yaparken `Stats.superLikesRemaining` ile
`SuperLike.result.remainingSuperLikes` **aynı semantiktedir** — ikisini de aynı sayaç
olarak kullanabilirsiniz.

---

## 6. SuperLike paketi satın alma + redeem

### 6.1 Neden ayrı bir redeem çağrısı var?

Webhook krediyi **bilerek yazmıyor**; sadece `Subscriptions` tablosuna receipt satırı
düşüyor. Krediyi `Redeem` endpoint'i yazıyor. Sebep:
1. Anonim `$RCAnonymousID` → identified `TRANSFER` yarışında webhook krediyi yanlış profile
   yazabilirdi.
2. Client'a **senkron** "bakiyen güncellendi" cevabı gerekiyor.

Bedeli: webhook ile redeem **yarışır** → 402 ve retry mekanizması (aşağıda).

### 6.2 Akış

```
purchasePackage(superlike_10)  ─────▶ RC ─── NON_RENEWING_PURCHASE webhook ──▶ Backend
        │                                                                        │ receipt satırı
        ▼                                                                        │
POST /api/swipe/SuperLike/Redeem { transactionId }  ─────────────────────────────▶│ receipt doğrula
        │                                                                        │ +10 kredi
        │◀───────────────── 200 { creditsAdded:10, superLikesRemaining:15 } ──────│
```

`transactionId`'yi RC `customerInfo.nonSubscriptionTransactions` içinden alın
(satın alma sonucundaki transaction).

### 6.3 Retry & kuyruk — "para alındı, kredi verilmedi" olmasın

```ts
const REDEEM_RETRY_DELAY_MS = 3000;

async function redeemSuperlikePack(transactionId: string, productId?: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await api.post('/api/swipe/SuperLike/Redeem',
                               { transactionId, productId },
                               { validateStatus: () => true });   // status'u biz yorumluyoruz

    if (res.status === 200) {
      pendingRedeems.remove(transactionId);          // creditsAdded 0 olabilir → hata değil
      return res.data.result;
    }

    if (res.status === 402) {                        // UT-6101 — webhook henüz inmedi
      if (attempt === 0) { await sleep(REDEEM_RETRY_DELAY_MS); continue; }
      pendingRedeems.add({ transactionId, productId });   // KALICI sakla (MMKV/AsyncStorage)
      throw new PendingWebhookError();
    }

    // 400 → kalıcı. code ile ayır:
    //   UT-6102 unknown_product → destek + bize bildir
    //   UT-6103 belongs_to_another_user → "bu satın alma bu hesaba ait değil"
    pendingRedeems.remove(transactionId);
    throw new PermanentRedeemError(res.data?.code, res.data?.message);
  }
}
```

**Kuyruk kuralı:** İkinci 402'den sonra `transactionId`'yi **kalıcı** saklayın ve şu
anlarda tekrar deneyin: app açılışı, `Stats` fetch'i, `CustomerInfoUpdate` listener'ı.
Endpoint **idempotenttir** — kaç kez denerseniz deneyin kredi bir kez eklenir.

### 6.4 Idempotency garantisi

- `SuperLikeRedemptions.TransactionId` üzerinde **UNIQUE index** var.
- Paralel çift istek: ikinci insert violation alır, eklenen kredi **geri alınır**,
  `alreadyRedeemed: true` + `creditsAdded: 0` ile 200 döner.
- **Refund → tekrar redeem ile bedava kredi üretilemez**: idempotency kontrolü satırın
  *varlığına* bakar, `revoked` durumuna değil.

### 6.5 Refund politikası (v1)

Refund'da **claw-back yok** — bakiye düşürülmez, sadece `revoked` işaretlenir + metrik/log
düşer (suistimal eşiğini geçen hesaplar manuel incelenir). Negatif bakiye FE'de "sınırsız"
olarak yorumlanacağı için bilinçli tercih. v2'de gerçek revoke gelirse bakiye 0'a
clamp'lenecek ve size haber verilecek → o zaman `CustomerInfoUpdate` listener'ına
`stats` invalidate eklemeniz gerekecek.

---

## 7. Webhook tarafında ne oluyor

`POST /api/webhooks/revenuecat` — RC → backend, `Authorization` header ile korunur.
Her event `SubscriptionEvents` tablosuna ham JSON olarak yazılır (idempotency +
replay/debug). Aynı `event.id` iki kez işlenmez.

| RC Event | Backend etkisi | `status.status` | Kullanıcıya etkisi |
|---|---|---|---|
| `INITIAL_PURCHASE` | Subscription Active, profile premium **açılır**, SuperLike kotası 5, cycle başlar | `Active` | Premium açık |
| `RENEWAL` | `expiresAt` ileri alınır, trial biter | `Active` | Değişmez (kota **sıfırlanmaz**) |
| `PRODUCT_CHANGE` | Plan değişir, trial biter | `Active` | Değişmez |
| `UNCANCELLATION` | `autoRenewEnabled: true`, `cancelledAt: null` | `Active` | "Yenileme tekrar açık" |
| `CANCELLATION` | `autoRenew: false`, `cancelledAt` set | `Cancelled` | **Premium dönem sonuna kadar açık kalır** |
| `EXPIRATION` | Premium **kapatılır** | `Expired` | Free'ye döner (SuperLike sayacı korunur) |
| `BILLING_ISSUE` | `gracePeriodEndsAt` set; premium **grace bitişine kadar açık kalır** | `BillingIssue` | "Ödeme alınamadı" uyarısı |
| `NON_RENEWING_PURCHASE` | Consumable receipt satırı yazılır (**kredi yazılmaz**) | — | `Redeem` çağrısını bekler |
| `TRANSFER` / `SUBSCRIBER_ALIAS` | Anonim id'deki abonelikler yeni `app_user_id`'ye taşınır | — | Premium doğru hesaba geçer |

**Gecikme kaynakları (FE'nin bilmesi gerekenler):**
- Webhook tipik **1-3 sn**, nadiren onlarca saniye. Bu yüzden `/sync` var.
- `EXPIRATION` gelmezse bile saatlik `expire-premium-subscriptions` job'ı süresi geçmiş
  premium bayraklarını temizler. Ancak **`isActivelyPremium` real-time hesaplanır** —
  `premiumExpiresAt` geçmişse job çalışmadan önce de premium kapalı görünür.
- Saatlik `subscription-reminder` job'ı trial/expiry bildirimlerini atar (§11).

**Sandbox uyarısı:** Production ortamında **sandbox event'leri reddedilir**
(`RevenueCat:AllowSandboxEvents` kapalı). Prod build'de sandbox satın alması yaparsanız
webhook düşmez → premium açılmaz, redeem sürekli 402 döner. Sandbox testini dev/staging'de
yapın; prod'da test gerekiyorsa bize söyleyin, ayarı **süreli** açalım.

---

## 8. Premium'un açtığı tüm özellikler & paywall matrisi

| Özellik | Free | Premium |
|---|---|---|
| Günlük beğeni (Like) | 30/gün | **Sınırsız** |
| Pass | Sınırsız | Sınırsız |
| SuperLike | **1 (lifetime)** | **5 / 7 gün** |
| Geri alma (Undo/Rewind) | 3/gün | **Sınırsız** |
| Kaçırılan eşleşme kurtarma | 2/gün | **5/gün** |
| "Seni kim beğendi" deck'te görünür mü | Yalnız **SuperLike**'lar | **Tüm** beğeniler (`hasLikedMe`, `likedMeAt`) |
| Gelişmiş filtreler (üniversite/şehir/bölüm/görsel/dealbreaker…) | ❌ | ✅ |
| Mesafe filtresi | ✅ (sınırsız) | ✅ (sınırsız) |
| Sohbet başına mesaj | 30 (iki taraf da free ise) | **Sınırsız** (bir taraf premium yeterli) |

### Paywall tipleri (`paywallType`)

| Sabit | Nereden gelir | Açılacak ekran |
|---|---|---|
| `SWIPE_LIMIT` | `POST /Like` (günlük 30 doldu) | Premium modalı |
| `SUPER_LIKE_LIMIT` | `POST /SuperLike` | **SuperLike paket modalı** (premium'da da!) |
| `UNDO_LIMIT` | `POST /Undo` | Premium modalı |
| `MISSED_MATCH_RECOVERY_LIMIT` | `POST /RecoverMissedMatch` | Premium modalı |
| `PREMIUM_FILTERS` | `PUT /UpdateFilters` | Premium modalı (filtre vurgulu) |
| `CHAT_QUOTA_EXHAUSTED` | `POST /messages/send` (HTTP 402) | Premium modalı (sohbet vurgulu) |

Bu string'ler backend'de sabit (`PaywallTypes`) — **elle yazmayın**, enum'a alın.

---

## 9. Restore, hesap değiştirme, anonim ID

### 9.1 Restore purchases

```ts
await Purchases.restorePurchases();
const { result } = await api.post('/api/subscription/sync');   // RC REST'ten teyit eder
```
`sync` local DB'de premium göremezse **RC REST'e sorar** ve varsa DB'ye yazar — yani
webhook hiç inmemiş eski satın almalar bu yolla kurtarılır.

### 9.2 Anonim satın alma → sonradan login

Kullanıcı `logIn` çağrılmadan satın alırsa RC kaydı `$RCAnonymousID:...` altında oluşur.
`Purchases.logIn(userId)` sonrası RC `TRANSFER` / `SUBSCRIBER_ALIAS` event'i gönderir;
backend eski id altındaki abonelikleri yeni `UserId`'ye taşır ve aktif olan varsa premium'u
uygular. Yine de **her zaman login sonrası `logIn` + `sync`** yapın.

### 9.3 Aynı cihazda hesap değiştirme

Store hesabı aynı kaldığı için RC entitlement'ı yeni backend kullanıcıya taşınabilir
(`TRANSFER`). Bu **beklenen** davranıştır. Ancak SuperLike paketi için:
transaction başka bir hesapta redeem edildiyse `400 UT-6103` alırsınız — bu **kalıcı**
hatadır, retry etmeyin.

---

## 10. Trial ve grace period

| Durum | `status` alanları | UI |
|---|---|---|
| Deneme sürüyor | `isTrial: true`, `trialEndsAt: <tarih>` | "Deneme sürümü — X tarihinde ücretli döneme geçecek" |
| Deneme bitti, ücretli başladı | `isTrial: false` (RENEWAL sonrası) | Normal premium |
| İptal edildi, dönem sürüyor | `status: "Cancelled"`, `autoRenewEnabled: false`, `isActivelyPremium: true` | "X tarihine kadar premium, otomatik yenilenmeyecek" |
| Ödeme sorunu | `status: "BillingIssue"`, `gracePeriodEndsAt: <tarih>` | "Ödeme alınamadı — X tarihine kadar premium'un açık, kartını güncelle" |
| Bitti | `status: "Expired"`, `isActivelyPremium: false` | Free UI |

Grace period boyunca `premiumExpiresAt` **grace bitişine taşınır**, yani
`isActivelyPremium` `true` kalır — kullanıcı ödeme sorununu çözene kadar hizmet kesilmez.

---

## 11. Bildirimler

Saatlik job iki tip push + in-app bildirim üretir:

| `NotificationKind` | Tetikleyici | Başlık / gövde |
|---|---|---|
| `TrialEndingSoon` | Trial bitişine **< 24 saat** | "Denemen bitmek üzere" / "X saat sonra sınırsız beğeni ve seni beğenenleri görme kapanıyor." |
| `PremiumExpiringSoon` | `autoRenew: false` **ve** bitişe **< 72 saat** | "Premium'un X gün sonra bitiyor" / "Sınırsız beğeni ve seni beğenenleri görme özelliğin kapanacak." |

Her ikisi de subscription başına **bir kez** gönderilir (`relatedEntityId` = subscription id).
Bildirime tıklanınca premium ekranını açın.

---

## 12. Cache / state yönetimi matrisi

| Olay | Invalidate / güncelle |
|---|---|
| Login | `subscription.status`, `swipe.stats` |
| App foreground | `subscription.status` (30 sn'den eskiyse) |
| Premium satın alma başarılı | `subscription.status` (sync yanıtından **doğrudan set**), `swipe.stats`, `swipe.filters`, discovery deck (**premium filtreler deck'i değiştirir**) |
| SuperLike paketi redeem | `swipe.stats` (redeem yanıtındaki bakiyeyle doğrudan set edilebilir) |
| SuperLike gönderildi | `swipe.stats` — veya yanıttaki `remainingSuperLikes` ile optimistic |
| `CustomerInfoUpdate` listener | `subscription.status`; RC premium + backend değil → `reconcile` |
| Premium expire push'u | `subscription.status`, `swipe.stats` |
| Sohbet açıldı | `messages.quota[conversationId]` |
| Mesaj gönderildi | `messages.quota[conversationId]` (kalan mesaj azalır) |

> Premium açıldığında **discovery deck'ini de tazeleyin** — backend candidate pool cache'ini
> premium flip'inde invalidate ediyor, eski deck stale kalır.

---

## 13. HTTP status & hata kodu matrisi

### Kodlar (`response.code`)

| Kod | Endpoint | Anlam | Retry? |
|---|---|---|---|
| `UT-6101` | `SuperLike/Redeem` | Webhook henüz inmedi | ✅ (3 sn, sonra kuyruk) |
| `UT-6102` | `SuperLike/Redeem` | Ürün tanımlı değil (config hatası) | ❌ |
| `UT-6103` | `SuperLike/Redeem` | Transaction başka hesaba ait | ❌ |

### Status'lar

| Status | Nerede | Anlam |
|---|---|---|
| `200` | Grup A endpoint'leri | **Her zaman** — gerçek sonuç `body.isSuccess` / `body.statusCode` |
| `200` | `Redeem` | Kredi yazıldı veya zaten yazılmıştı |
| `402` | `Redeem` | Webhook yarışı → retry |
| `402` | `messages/send` | Chat kotası doldu → **Premium paywall**, retry değil |
| `400` | `Redeem` | Kalıcı hata (`code`'a bak) |
| `401` | tümü | Token geçersiz/expired |
| `429` | `/api/subscription/*` (60/dk), `/api/swipe/*` (120/dk) | `{ errorCode: "RATE_LIMIT_EXCEEDED", retryAfterSeconds }` + `Retry-After` header |
| `5xx` | tümü | Backend hatası — exponential backoff |

---

## 14. Bilinen tuzaklar

1. **`response.status === 200` çoğu swipe endpoint'inde hiçbir şey söylemez.** `isSuccess`
   ve `statusCode` gövde alanlarına bakın. `Redeem` ve `messages/send` istisnadır.
2. **`superLikesRemaining` asla negatif gelmez** ama negatif gelirse bile "sınırsız" olarak
   yorumlamayın — `< 0` kontrolünüz varsa `<= 0` yapın.
3. **`superLikesRemaining > weeklySuperLikeLimit` normaldir.** Clamp etmeyin.
4. **`showPaywall: true` premium kullanıcıda da gelir** (SuperLike limiti). Premium modalı
   değil, paket modalı açın.
5. **JWT `IsPremium` claim'i stale'dir.** Satın alma sonrası token yenilenene kadar eski
   değeri taşır — gating'de kullanmayın.
6. **`superLikeResetInSeconds: -1` free tier'da "asla"** demektir; geri sayım göstermeyin.
7. **Prod build + sandbox satın alma = webhook düşmez.** Redeem sonsuz 402, premium hiç
   açılmaz. Bu bir bug değil, güvenlik ayarı.
8. **`Purchases.logIn(userId)` unutulursa** satın alma anonim ID'ye yazılır; kurtarma
   `TRANSFER` event'ine kalır.
9. **`UpdateFilters` kısmi uygulama yapmaz** — free kullanıcı bir premium alan gönderirse
   istekteki free alanlar da kaydedilmez.
10. **`bothPremium` / `requiresUnlock` chat alanları deprecated.** `isUnlimited` /
    `requiresPremium` kullanın.
11. **`maxDistance` artık premium-only değil** — eski kilit UI'ını kaldırın.
12. **Chat kotası konuşma başınadır**, kullanıcı başına değil; ve **bir taraf premium
    olunca** o sohbet iki taraf için de sınırsıza döner.

---

## 15. Test senaryoları

### Premium

| # | Senaryo | Beklenen |
|---|---|---|
| P1 | Sandbox'ta `premium_monthly` satın al | `/status` → `isActivelyPremium: true`, `status: "Active"` |
| P2 | Satın alma sonrası `Stats` | `remainingSwipes: -1`, `superLikesRemaining` **5'e yükselmiş** (kota grant'i) |
| P3 | Uçak modunda satın al → aç | `/sync` → `RC_REST_CONFIRMED` ile premium açılır |
| P4 | Store'dan aboneliği iptal et | `status: "Cancelled"`, `autoRenewEnabled: false`, **premium hâlâ açık** |
| P5 | Trial'lı ürün al | `isTrial: true`, `trialEndsAt` dolu |
| P6 | Trial bitişine <24 sa | `TrialEndingSoon` push'u gelir (bir kez) |
| P7 | Premium filtre kaydet (free) | `403` gövdesi + `PREMIUM_FILTERS` |
| P8 | Premium filtre kaydet (premium) | Kaydedilir, deck değişir |
| P9 | `restorePurchases` + `/sync` | Premium geri gelir |
| P10 | Premium expire olur | `isActivelyPremium: false`, SuperLike sayacı **korunur** |

### SuperLike

| # | Senaryo | Beklenen |
|---|---|---|
| S1 | 10'luk paket al → redeem | `creditsAdded: 10`, bakiye +10 |
| S2 | Aynı redeem'i tekrar | `200`, `creditsAdded: 0`, `alreadyRedeemed: true`, bakiye değişmez |
| S3 | Satın alma butonuna çift tık | Kredi **bir kez** eklenir |
| S4 | Uçak modu → satın al → aç → redeem | `402` → 3 sn → `200` (veya kuyruk → açılışta çözülür) |
| S5 | Kota 0 + kredi 0 iken SuperLike | `isSuccess:false`, `SUPER_LIKE_LIMIT` → paket modalı |
| S6 | Kota 0 + kredi 5 iken SuperLike | Başarılı, kredi 4'e düşer, **paywall açılmaz** |
| S7 | Kota 2 + kredi 5 iken SuperLike | Başarılı, `quotaSuperLikesRemaining` 1, **kredi 5'te kalır** |
| S8 | Premium, kotası bitmiş | Paywall **açılır** (paket modalı) |
| S9 | Premium cycle yenilenmesini bekle | Kota 5'e döner, `purchasedSuperLikes` **aynı** |
| S10 | Başka hesabın transaction'ı ile redeem | `400` + `UT-6103`, retry yok |
| S11 | Redeem sonrası app kapat/aç | Bakiye korunur (server-side) |
| S12 | Free kullanıcı 1 SuperLike attı | `superLikesRemaining: 0`, `superLikeResetInSeconds: -1` |

### Chat

| # | Senaryo | Beklenen |
|---|---|---|
| C1 | İki free kullanıcı 30 mesaj | 31. mesajda **HTTP 402** + `CHAT_QUOTA_EXHAUSTED` |
| C2 | Taraflardan biri premium olur | `isUnlimited: true`, mesaj gider |
| C3 | Sohbet açılışında quota | `remainingMessages` doğru azalıyor |

---

## 16. Checklist

**RevenueCat / Store tarafı**
- [ ] `premium` entitlement + 3 abonelik ürünü bağlı
- [ ] `superlikes` offering + 4 consumable (`superlike_5/10/15/20`)
- [ ] ASC/Play'de ürünler "Ready to Submit" veya onaylı
- [ ] Webhook URL `https://api.lit.4ourstack.com/api/webhooks/revenuecat` + Authorization header
      backend config'i ile birebir aynı

**Mobil build**
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `..._ANDROID_API_KEY` EAS'ta tanımlı
- [ ] `.env.example` repoda (ekip için)
- [ ] `eas build` alındı (OTA yetmez)

**Kod**
- [ ] `Purchases.logIn(userId)` login sonrası, `logOut()` çıkışta
- [ ] `GET /subscription/status` tek gating kaynağı (JWT claim **değil**)
- [ ] Satın alma sonrası `/sync` backoff döngüsü (§4.1)
- [ ] `CustomerInfoUpdate` listener → uyuşmazlıkta `/reconcile`
- [ ] Redeem: 402 → 3 sn retry → **kalıcı kuyruk**; 400 → `code` ile ayır
- [ ] Kuyruk app açılışında ve `Stats` fetch'inde boşaltılıyor
- [ ] Grup A endpoint'lerinde `body.isSuccess` kontrolü (HTTP status değil)
- [ ] `paywallType` enum'a alındı, elle string yok
- [ ] `SUPER_LIKE_LIMIT` → paket modalı (premium dahil), diğerleri → Premium modalı
- [ ] `superLikeResetInSeconds === -1` → geri sayım gizli
- [ ] `superLikesRemaining` clamp edilmiyor, oran paydası `weeklySuperLikeLimit + purchasedSuperLikes`
- [ ] `maxDistance` kilidi kaldırıldı
- [ ] Chat'te `isUnlimited` / `requiresPremium` kullanılıyor (deprecated alanlar değil)
- [ ] Premium açıldığında discovery deck'i tazeleniyor
- [ ] `429` yanıtında `retryAfterSeconds` ile backoff

---

## Sorular / değişiklik ihtiyaçları

Aşağıdakiler **backend config'inden** deploy'suz değiştirilebilir — ihtiyaç olursa söyleyin:
- SuperLike paket id'leri ve kredi miktarları (`SwipeLimits:SuperLikePackCredits`)
- Free/premium kota değerleri (`FreeDailySwipeLimit`, `FreeLifetimeSuperLikeLimit`,
  `PremiumWeeklySuperLikeLimit`, undo/recovery limitleri)
- Plan katalog metadata'sı (`SubscriptionProducts` — displayName / highlight / sıra)
- Rate limit eşikleri

Aşağıdakiler **kod değişikliği** ister:
- Free tier'a rolling SuperLike kotası vermek (şu an lifetime — kopyanız `isPremium`'a
  bakıyorsa bu değişirse **size haber vereceğiz**)
- Refund'da gerçek claw-back (v2)
- Chat kotasının konuşma başına 30'dan farklı olması
