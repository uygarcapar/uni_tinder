# Frontend — Premium Akışı (uçtan uca, tek doküman)

**Tarih:** 2026-08-18
**Kime:** Frontend (`uni_tinder`, branch `master`)
**Backend durumu:** Tamamlandı ve canlıda. Bu akış için backend'de bekleyen iş yok.
**Bu doküman:** 2026-08-11 sürümünün yerini alır — aşağıdaki §0'daki maddeler değişti,
eski dokümana göre kodladıysan onları düzeltmen gerekiyor.

---

## 0. 11 Ağustos dokümanına göre ne değişti

| # | Konu | Eski | Yeni |
|---|---|---|---|
| 1 | `sync` / `reconcile` **enum değerleri** | `source: "Db"`, `reason: "WebhookLanded"` | `source: "db" \| "rc_rest" \| "none"`, `reason: "WEBHOOK_LANDED" \| "RC_REST_CONFIRMED" \| "NOT_FOUND_IN_RC" \| "RC_REST_UNAVAILABLE" \| "RC_REST_ERROR"` |
| 2 | Yeni `reason` | — | `RC_REST_UNAVAILABLE` (backend'de RC REST anahtarı yok — kullanıcı hakkında hüküm değil) |
| 3 | `sync` artık premium **kapatabiliyor** | sadece açardı | RC "artık entitlement yok" derse downgrade eder → `isActivelyPremium: false` dönebilir |
| 4 | **Undo / geri alma** | free 3/gün, premium 3/gün | free **0 (tamamen premium'a özel)**, premium **sınırsız** |
| 5 | **Mesafe filtresi** | iki tarafta da sınırsız | free tavan **50 km**, premium tavan **100 km** (üstü sessizce clamp'lenir, hata dönmez) |
| 6 | **SuperLike premium grant** | kota `= 5` (kullanılmamış free hak yanardı) | kota `+= 5`, tavan 6 → `superLikesRemaining` `weeklySuperLikeLimit`'i **aşabilir** |
| 7 | Deck'te "seni beğendi" rozeti | dokümante değildi | normal like yalnız **premium**'a görünür; superlike herkese görünür |
| 8 | SuperLike redeem hata ayrımı | sadece HTTP status | ek olarak `code`: `UT-6101` (retry) / `UT-6102`, `UT-6103` (retry yok) |
| 9 | Consumable satın almalar | — | SuperLike paketleri abonelik **değil**; `/subscription/status`'u hiç etkilemez |

---

## 1. Mimarinin tek kuralı

Satın almayı **RevenueCat SDK** yapar, premium hakkını **backend** verir. Frontend hiçbir
zaman kendi kararıyla premium açmaz.

```
[1] Kullanıcı paketi seçer
        │
        ▼
[2] RC SDK purchasePackage()          ← ödeme burada (Apple / Google)
        │
        ├──────────────► [3] RC → Apple/Google doğrular
        │                        │
        │                        ▼
        │                [4] RC ⇒ POST /api/webhooks/revenuecat   (sunucu→sunucu)
        │                        │
        │                        ▼
        │                [5] Backend: Subscription kaydı + UserProfile.IsPremium = true
        │                             (+ SuperLike kotası artırılır)
        ▼
[6] FE: POST /api/subscription/sync   ← "webhook indi mi?" doğrulaması (retry'lı)
        │
        ▼
[7] FE: premium UI'ı aç + premium'a bağlı cache'leri tazele
```

**Kritik nokta:** [2] başarılı dönse bile premium **henüz açık değildir**. [4] webhook'u
saniyeler sürebilir. Bu yüzden [6] zorunludur — RC SDK'nın `customerInfo`'suna bakıp premium
UI açmak yanlıştır; backend gating'i hâlâ free görür ve kullanıcı "premium aldım ama
çalışmıyor" der.

**Source of truth:** `GET /api/subscription/status` → `isActivelyPremium`. UI'daki premium
rozetleri, paywall kararları ve feature kilitleri hep buna göre.

---

## 2. Endpoint'ler

Hepsi `Authorization: Bearer <jwt>` ister (`plans` hariç, o anonim).
Tümü zarflı döner: `{ isSuccess, message, result, statusCode, code?, action? }`.

| Method | Endpoint | Ne zaman çağrılır |
|---|---|---|
| `GET` | `/api/subscription/plans` | Paywall ekranı açılırken |
| `GET` | `/api/subscription/status` | App açılışında, paywall açılışında, foreground'a dönüşte |
| `POST` | `/api/subscription/sync` | **Satın alma ve restore sonrası** (retry'lı) |
| `POST` | `/api/subscription/reconcile` | RC SDK premium diyor ama backend demiyorsa |
| `POST` | `/api/swipe/SuperLike/Redeem` | SuperLike **paketi** satın alındıktan sonra |
| `GET` | `/api/swipe/Stats` | Kota göstergeleri (swipe / superlike / undo / recovery) |
| `GET` | `/api/messages/conversations/{id}/quota` | Sohbet kotası göstergesi |

**Rate limit:** `subscription/*` sınıf seviyesinde **60 istek / 60 saniye** (kullanıcı başına).
Aşarsan `429` + `X-RateLimit-Limit` header'ı. Aşağıdaki backoff bu limite göre ayarlandı,
`status`/`sync`'i saniyede bir dövmeyin.

### GET /api/subscription/plans

Server-controlled UI metadata döner; **fiyat dönmez**. Fiyatı RC paketinden
(`product.priceString`) okuyun — locale/para birimi doğru olsun.

```jsonc
{
  "result": {
    "plans": [
      { "productId": "premium_weekly",  "period": "weekly",  "entitlement": "premium",
        "displayName": "Haftalık Premium", "highlight": null,           "sortOrder": 1 },
      { "productId": "premium_monthly", "period": "monthly", "entitlement": "premium",
        "displayName": "Aylık Premium",    "highlight": null,           "sortOrder": 2 },
      { "productId": "premium_yearly",  "period": "yearly",  "entitlement": "premium",
        "displayName": "Yıllık Premium",   "highlight": "En Avantajlı", "sortOrder": 3 }
    ]
  }
}
```

Eşleştirme: backend `productId` ↔ RC paketinin `product.identifier`. `sortOrder`'a göre sırala,
`highlight` doluysa rozet göster. RC'de olmayan bir plan geldiyse o kartı gizle (katalog
eksikliğidir, crash etmeyin). `period` değerleri: `weekly | monthly | yearly | lifetime`.

### GET /api/subscription/status

```jsonc
{
  "result": {
    "isActivelyPremium": true,          // ⬅️ TEK karar alanı — UI bunu kullanır
    "premiumExpiresAt": "2026-09-18T10:00:00Z",
    "productId": "premium_monthly",
    "status": "Active",                 // Active | Cancelled | Expired | BillingIssue
    "autoRenewEnabled": true,
    "purchasedAt": "2026-08-18T10:00:00Z",
    "cancelledAt": null,
    "isTrial": false,
    "trialEndsAt": null,
    "gracePeriodEndsAt": null,
    "provider": "AppStore",             // AppStore | PlayStore | RevenueCat
    "originalTransactionId": "…",
    "latestTransactionId": "…"
  }
}
```

`isActivelyPremium` dışındaki alanlar **bilgilendirme** içindir. Gating için asla
`status === "Active"` veya `premiumExpiresAt` karşılaştırması yazmayın — `isActivelyPremium`
zaten expiry'yi hesaplıyor (`premiumExpiresAt == null` → süresiz premium, admin grant'i).

Ekranda gösterim önerisi:

| Durum | Kullanıcıya |
|---|---|
| `status: Active`, `autoRenewEnabled: true` | "Premium — {tarih}'te yenilenecek" |
| `status: Cancelled` + `isActivelyPremium: true` | "Premium — {tarih}'te sona erecek" (iptal edilmiş, dönem sürüyor) |
| `status: BillingIssue`, `gracePeriodEndsAt` dolu | "Ödeme alınamadı — {tarih}'e kadar erişimin sürüyor" + ödeme yöntemi güncelle CTA |
| `isTrial: true` | "Deneme — {trialEndsAt}'te ücretli döneme geçer" |
| `isActivelyPremium: false` | Paywall |

> SuperLike paketi gibi **consumable** satın almalar bu endpoint'i hiç etkilemez
> (`isConsumable` işaretli kayıtlar abonelik sorgusundan dışlanır). Paket alan free
> kullanıcı free kalır — sadece SuperLike kredisi artar.

### POST /api/subscription/sync

Body yok. Satın alma/restore sonrası "webhook indi mi?" sorusunu cevaplar. Backend önce kendi
DB'sine bakar; aktif premium görmezse **RevenueCat REST'e** sorar ve bulursa DB'ye yazıp
premium'u açar. Yani webhook hiç gelmese bile bu endpoint kullanıcıyı kurtarır.

```jsonc
{
  "result": {
    "synced": true,
    "source": "db",                 // db | rc_rest | none        ⚠️ küçük harf
    "reason": "WEBHOOK_LANDED",     // ⚠️ SCREAMING_SNAKE
    "status": { /* yukarıdaki status objesi */ }
  }
}
```

FE kararı — **sadece bu iki alanla** switch yapın, `message` metnine bakmayın:

| `synced` | `reason` | Ne yap |
|---|---|---|
| `true` | `WEBHOOK_LANDED` | Backend DB'sinde zaten premium → aç, retry'ı bitir |
| `true` | `RC_REST_CONFIRMED` | RC REST'ten doğrulandı ve yazıldı → aç, retry'ı bitir |
| `false` | `NOT_FOUND_IN_RC` | RC'de de aktif abonelik yok → retry'a devam; tükenirse §4 |
| `false` | `RC_REST_ERROR` | RC'ye ulaşılamadı (geçici) → retry'a devam |
| `false` | `RC_REST_UNAVAILABLE` | Backend config eksiği (RC REST anahtarı yok). Kullanıcı hakkında hüküm **değil** → retry'a devam, tükenirse §4 mesajı + bize bildir |

> **Yeni davranış — `sync` premium'u kapatabilir.** RC kullanıcıyı tanıyor ve aktif entitlement
> yoksa backend downgrade eder; `status.isActivelyPremium` `false` döner. Bu yüzden `sync`
> yanıtındaki `status`'u her zaman state'e yazın, "sadece true ise güncelle" yapmayın.
> Local'de premium görünen kullanıcı için RC'ye **saatte bir** revalidasyon yapılır — iptal/iade
> sonrası kapanma anında değil, en geç ~1 saat içinde yansır. Bu kasıtlı.

### POST /api/subscription/reconcile

`sync` ile aynı işi yapar; farkı body'de RC SDK snapshot'ını audit'e gönderebilmen. RC SDK
"premium" diyor ama `status` "değil" diyorsa bunu çağır.

```jsonc
// body (tamamı opsiyonel)
{
  "rcLatestTransactionId": "2000000123456789",
  "rcOriginalTransactionId": "2000000123456789",
  "rcEntitlements": ["premium"]
}
```

Yanıt `sync` ile birebir aynı.

---

## 3. Satın alma akışı — implementasyon

```ts
async function purchasePremium(pkg: PurchasesPackage) {
  // 1) Ödeme — RC SDK
  try {
    await Purchases.purchasePackage(pkg);
  } catch (e: any) {
    if (e.userCancelled) return { ok: false, cancelled: true };
    throw e;                       // gerçek hata → kullanıcıya göster
  }

  // 2) Backend doğrulaması — ZORUNLU. Webhook gecikebilir.
  const status = await syncWithRetry();

  if (status.isActivelyPremium) {
    await refreshPremiumDependentCaches();   // §5
    return { ok: true, status };
  }

  // 3) Ödeme alındı ama backend hâlâ göremiyor → kullanıcıyı boşlukta bırakma
  return { ok: false, pending: true };
}
```

### `syncWithRetry` — backoff

Webhook'un inmesi tipik olarak 1-5 saniye. Sabit aralıkla dövmeyin (rate limit 60/dk), artan
aralıkla deneyin:

```ts
const DELAYS_MS = [0, 1500, 3000, 5000, 8000];   // toplam ~17.5 sn, 5 deneme

async function syncWithRetry() {
  let last;
  for (const delay of DELAYS_MS) {
    if (delay) await sleep(delay);
    const res = await api.post("/api/subscription/sync");
    last = res.result;
    setSubscriptionStatus(last.status);          // her turda state'e yaz (downgrade de gelebilir)
    if (last.synced) return last.status;         // ✅ çık
  }
  return last.status;                            // hâlâ değil → pending UI
}
```

Retry sırasında ekranda **bloklayıcı bir "Doğrulanıyor…" göstergesi** olsun; kullanıcı o an
başka satın alma denemesin.

### Restore (Satın alımları geri yükle)

```ts
await Purchases.restorePurchases();   // veya Purchases.logIn(backendUserId) sonrası
const status = await syncWithRetry(); // aynı fonksiyon
```

Restore'da premium açılmazsa sebep genellikle **kimlik uyuşmazlığıdır**: satın alma anonim RC
id'siyle (`$RCAnonymousID:…`) yapılmış, backend user'ına bağlanmamış. Backend bunu `TRANSFER` /
`SUBSCRIBER_ALIAS` webhook'larıyla otomatik devralıyor — ama bunun çalışması için **login
olduktan sonra mutlaka `Purchases.logIn(backendUserId)`** çağrılmalı. `backendUserId`, JWT'deki
user id ile aynı olmak zorunda.

> ⚠️ Anonim satın alma + `logIn` hiç çağrılmazsa premium hiçbir zaman doğru hesaba bağlanmaz.
> "Premium çalışmıyor" şikâyetlerinin en sık ikinci sebebi bu.

### Identity — sıralama kuralı

| An | Çağrı |
|---|---|
| App açılış (login'den önce) | `Purchases.configure({ apiKey })` |
| Login / register başarılı | `Purchases.logIn(backendUserId)` |
| Logout | `Purchases.logOut()` |

`logIn`'i satın almadan **önce** yapmak en temizi — o zaman TRANSFER'e hiç gerek kalmaz.

---

## 4. Kullanıcıya ne diyeceğiz (pending durumu)

`syncWithRetry` tükendi ve premium hâlâ açılmadıysa **"satın alma başarısız" DEMEYİN** — para
çekildi. Şunu gösterin:

> "Ödemen alındı, hesabına işleniyor. Bu genelde birkaç saniye sürer. Ekranı kapatıp
> açtığında premium aktif olacak."

Yanına **"Tekrar dene"** butonu koyun → `POST /api/subscription/sync`.
Ayrıca app her foreground'a döndüğünde premium değilken **bir kez** `sync` çağırın (döngü
kurmayın) — gecikmiş webhook'lar böyle kendiliğinden yakalanır.

---

## 5. Premium açıldıktan sonra tazelenecekler

Backend premium flip'inde discovery candidate pool'unu invalidate ediyor, ama FE cache'lerini
siz tazelemelisiniz:

- `GET /api/subscription/status` → premium state
- `GET /api/swipe/Stats` → tüm kota göstergeleri (swipe/superlike/undo/recovery) tek seferde
- Discovery deck'ini yeniden çek (free 30 swipe cap'i kalkar, mesafe tavanı 100 km'ye çıkar,
  "seni beğendi" rozetleri görünür olur)
- Profil ekranı (`isPremium` alanı)
- Filtre ekranı (`GET /api/swipe/Filters` → `isPremium`; premium alanların kilidi açılır)
- Açık bir sohbet varsa kota bilgisi (`GET /api/messages/conversations/{id}/quota`)

---

## 6. Premium ne açıyor — güncel gating tablosu

Backend'in gerçekten uyguladığı kurallar (`SwipeLimits` + `Discovery` default'ları):

| Özellik | Free | Premium |
|---|---|---|
| Günlük swipe (like) | **30** | Sınırsız (`remainingSwipes: -1`) |
| Pass (geç) | Sınırsız | Sınırsız |
| SuperLike | **1 — lifetime, yenilenmez** | **5 / 7 gün** (rolling cycle) |
| Undo / geri alma | **0 — özellik kapalı** | **Sınırsız** (`remainingUndos: -1`) |
| Kaçırılan eşleşme kurtarma | 2 / gün | 5 / gün |
| Mesafe filtresi tavanı | **50 km** | **100 km** |
| Gelişmiş filtreler | ❌ → **403** | ✅ |
| Sohbet mesaj limiti | **30 mesaj / sohbet** (iki taraf da free ise) | Sınırsız (**bir taraf** premium yeterli) |
| Deck'te "seni beğendi" bilgisi | ❌ (yalnızca superlike'lar görünür) | ✅ (`hasLikedMe`, `likedMeAt`) |

Notlar:

- **Undo artık tam premium özelliği.** Free kullanıcı ilk denemede `UNDO_LIMIT` paywall'ına
  düşer; "hakkın doldu" değil "Premium'a özel" mesajı döner. Paywall metinlerini buna göre
  güncelleyin ("sınırsız geri alma" vaadi artık doğru).
- **Mesafe tavanı sessiz clamp'lenir.** Free kullanıcı `maxDistance: 100` gönderirse hata
  almaz, 50 yazılır. Slider'ı tier'a göre sınırlayın (free 1-50, premium 1-100) ve premium'a
  geçişte kullanıcının değerini yeniden okuyun. `maxDistance: 0` artık "sınırsız" **değil** —
  tavana çekilir.
- Aday tükendiğinde backend arka planda yarıçapı tavanın ötesine genişletebilir; bu **kasıtlı
  olarak kullanıcıya bildirilmez**, `wasRadiusExpanded`/`appliedRadiusKm` alanları deprecated
  ve her zaman `false`/`null` döner. UI'da kullanmayın.

### Kota göstergeleri — `GET /api/swipe/Stats`

```jsonc
{
  "result": {
    "remainingSwipes": -1,               // -1 = sınırsız (premium)
    "dailySwipeLimit": -1,               // free → 30, premium → -1
    "superLikesRemaining": 6,            // ⬅️ FE'nin okuduğu TEK superlike alanı (kota + kredi)
    "quotaSuperLikesRemaining": 6,       // yalnız tier kotası
    "purchasedSuperLikes": 0,            // consumable krediler (süresiz)
    "weeklySuperLikeLimit": 5,           // free → 1 (lifetime), premium → 5
    "remainingUndos": -1,                // free → 0, premium → -1
    "dailyUndoLimit": -1,                // free → 0, premium → -1
    "remainingMissedMatchRecovery": 5,   // free → 2, premium → 5
    "isPremium": true,
    "premiumExpiresAt": "2026-09-18T10:00:00Z",
    "nextSwipeResetAt": "2026-08-19T00:00:00Z",  "swipeResetInSeconds": 48000,
    "nextSuperLikeResetAt": "2026-08-25T10:00:00Z", "superLikeResetInSeconds": 575214,
    "nextUndoResetAt": "…",  "undoResetInSeconds": 0,
    "likesToday": 12, "passesToday": 30, "superLikesToday": 1, "matchesToday": 2
  }
}
```

⚠️ **Free kullanıcıda SuperLike hiç yenilenmez.** O yüzden `nextSuperLikeResetAt` =
`"9999-12-31T23:59:59.9999999"` (DateTime.MaxValue) ve `superLikeResetInSeconds` = **-1** döner.
FE bunu countdown'a sokmasın; -1 gördüğünde "yenilenmez, paket alarak devam et" göster.
Premium'da bu alanlar 7 günlük cycle'ın bitişini verir.

⚠️ **`superLikesRemaining` > `weeklySuperLikeLimit` olabilir** (ör. 6 > 5). Free'de kullanılmamış
1 hak premium'a devrediyor (tavan 6), ayrıca satın alınan krediler de bu toplamın içinde. Yani:

```js
// ❌ progress bar taşar / "6/5" absürtlüğü
`${remaining}/${weeklySuperLikeLimit}`
// ✅ ya sadece sayıyı göster, ya paydayı (weeklySuperLikeLimit + purchasedSuperLikes) kur
`${remaining} SuperLike`
```

`superLikesRemaining` **asla negatif dönmez** (taban 0). Negatif görürseniz bug'dır, "sınırsız"
diye yorumlamayın.

### Paywall tetikleyicileri

Backend `showPaywall: true` + makine-okunur `paywallType` döner. UI hangi ekranı açacağına buna
göre karar verir — mesaj metnine göre **asla** karar vermeyin.

| `paywallType` | Nereden gelir | HTTP |
|---|---|---|
| `SWIPE_LIMIT` | `GET /api/swipe/GetPotentialMatches` (deck payload'ı) / `POST /api/swipe/Like` | 200 (zarf içinde) |
| `SUPER_LIKE_LIMIT` | `POST /api/swipe/SuperLike` | 200 (zarf içinde) |
| `UNDO_LIMIT` | `POST /api/swipe/Undo` | 200 (zarf içinde) |
| `MISSED_MATCH_RECOVERY_LIMIT` | `POST /api/swipe/RecoverMissedMatch` | 200 (zarf içinde) |
| `PREMIUM_FILTERS` | Filtre kaydetme | **403** |
| `CHAT_QUOTA_EXHAUSTED` | Mesaj gönderme (REST **402** veya SignalR `Error` event'i) | **402** |

`SUPER_LIKE_LIMIT` özel: burada iki CTA var — **Premium'a geç** *veya* **SuperLike paketi al**
(§7). Diğerlerinde tek CTA: Premium.

`CHAT_QUOTA_EXHAUSTED` "Premium modalını aç" demek; eski Chat Unlock consumable akışı
**kaldırıldı** (`…/unlock` endpoint'i 404).

**SignalR tarafı** (`MatchHub`) — REST'ten farklı, `Error` event'i gelir:

```jsonc
// hub: on("Error", …)
{ "code": "CHAT_QUOTA_EXHAUSTED", "message": "…",
  "conversationId": "…", "paywallType": "CHAT_QUOTA_EXHAUSTED", "showPaywall": true }
```

### Sohbet kotası — `GET /api/messages/conversations/{id}/quota`

```jsonc
{
  "result": {
    "conversationId": "…",
    "hasPremiumParticipant": false,
    "isUnlimited": false,        // ⬅️ kanonik bayrak — UI bunu kullanır
    "messageCount": 28,
    "freeMessageLimit": 30,
    "remainingMessages": 2,      // isUnlimited ise null
    "requiresPremium": false,    // cap doldu → CHAT_QUOTA_EXHAUSTED paywall'ı
    "isUnlocked": false,         // legacy/destek grant'i
    "bothPremium": false,        // DEPRECATED — kullanma
    "requiresUnlock": false      // DEPRECATED — kullanma
  }
}
```

Kural: **taraflardan biri** premium olduğu anda sohbet sınırsıza döner (`isUnlimited: true`,
`remainingMessages: null`). Karşı taraf premium aldığında da açılır — bu yüzden sohbet ekranına
her girişte quota'yı tazeleyin.

### Premium-only filtre alanları (403 tetikleyenler)

Free kullanıcı bunlardan **herhangi birini** gönderirse filtre kaydı **403** +
`{ showPaywall: true, paywallType: "PREMIUM_FILTERS" }` döner ve **hiçbir alan kaydedilmez**
(kısmi kayıt yok — free alanlar da yazılmaz):

`universityDomain`, `universityDomains`, `visibleOnlyToUniversityDomains`,
`hiddenFromUniversityDomains`, `city`, `department`, `yearsOfStudy`, `heightMin`, `heightMax`,
`zodiacSigns`, `smokingStatuses`, `alcoholUsages`, `hasPets`, `pets`, `relationshipIntents`,
`hairColors`, `hairStyles`, `eyeColors`, `facialHairs`, `hasGlasses`, `preferredHobbies`,
`dealbreakers`

Free kullanıcının gönderebileceği alanlar: `ageRangeMin`, `ageRangeMax`, `maxDistance`
(50 km'ye clamp), `genders`, `interestedIn`.

> ⚠️ **Bilinen tutarsızlık:** `spokenLanguages` ve `religiousViews` premium-only olarak
> **yazılır** ama 403 listesinde değil — free kullanıcı gönderirse `200 OK` alır, değer
> sessizce yok sayılır. FE bu iki alanı free kullanıcıya hiç göndermesin (aksi halde kullanıcı
> "filtreyi kaydettim ama uygulanmıyor" der). Backend'de 403'e almamızı istersen söyle.

---

## 7. SuperLike paketi (consumable) — ayrı akış

Bu bir abonelik değil, tek seferlik kredi. Premium akışından farkı: satın almadan sonra
**redeem** çağırmak zorunda oluşun. Krediler **süresiz**, tier'dan bağımsız (free kullanıcı da
kullanabilir) ve önce tier kotası, o bitince satın alınan kredi harcanır.

```ts
await Purchases.purchasePackage(superlikePkg);          // superlike_5 | _10 | _15 | _20
const tx = /* RC customerInfo.nonSubscriptionTransactions'tan transactionId */;
await redeemWithRetry(tx, superlikePkg.product.identifier);
```

```jsonc
// POST /api/swipe/SuperLike/Redeem
{ "transactionId": "2000000987654321", "productId": "superlike_10" }
// productId opsiyonel ve SADECE log/uyuşmazlık tespiti için — kredi miktarı webhook kaydından
// türetilir (client spoof'layarak kredi şişiremez).
```

Bu endpoint diğer swipe endpoint'lerinden farklı olarak **gerçek HTTP status** kullanır:

| Status | `code` | Anlamı | FE |
|---|---|---|---|
| `200` | — | Kredi yüklendi | `result` ile bakiyeyi güncelle |
| `402` | `UT-6101` | Webhook henüz inmedi | **~3 sn sonra retry** (2-3 deneme) |
| `400` | `UT-6102` | Ürün tanımlı değil | Retry **etme**, "destekle iletişime geç" |
| `400` | `UT-6103` | Satın alma başka hesaba ait | Retry **etme**, hata göster |
| `401` | — | Auth yok | Login'e yönlendir |

```jsonc
// 200 result
{
  "creditsAdded": 10,          // idempotent tekrarda 0
  "purchasedSuperLikes": 10,   // toplam süresiz kredi
  "superLikesRemaining": 15,   // kota + kredi (Stats ile aynı semantik)
  "alreadyRedeemed": false     // true → daha önce işlenmiş; hata değil, 200 döner
}
```

402'yi 400'den ayırmazsanız kullanıcı parasını ödeyip kredisini alamaz. `transactionId` bazında
idempotenttir (aynı transaction iki kez kredi vermez; iade edilmiş transaction da tekrar kredi
vermez). Paket adetleri: `superlike_5`→5, `superlike_10`→10, `superlike_15`→15, `superlike_20`→20.

---

## 8. Teşhis — "premium çalışmıyor" derken hangi adım koptu?

Sırayla kontrol edin; ilk başarısız adım kök nedendir.

| # | Kontrol | Başarısızsa anlamı |
|---|---|---|
| 1 | Dev build konsolunda `[RevenueCat] API key missing/placeholder` **çıkmıyor** | Key build'e girmemiş → EAS env + **yeni build** ([handoff](frontend_revenuecat_env_handoff.md)) |
| 2 | Paywall'da 3 plan listeleniyor | RC katalog eksik: `premium` entitlement + `premium_weekly/monthly/yearly`, store'da ürünler onaylı mı |
| 3 | `purchasePackage()` hata atmadan dönüyor | Sandbox test kullanıcısı / store config sorunu |
| 4 | `POST /api/subscription/sync` → `synced: true` | `reason`'a bak: `NOT_FOUND_IN_RC` → RC'de abonelik user'a bağlı değil (`logIn` çağrıldı mı?) · `RC_REST_ERROR` → geçici · `RC_REST_UNAVAILABLE` → **backend config eksiği, bize bildir** |
| 5 | `GET /api/subscription/status` → `isActivelyPremium: true` | 4 geçip 5 geçmiyorsa **bize bildir** (backend) |
| 6 | Premium UI + limitler açıldı | FE cache tazelenmemiş → §5 |

Bize bildirirken şunları gönderin — logdan tek satırda bulunur:
**backend userId**, **RC app_user_id**, **transactionId**, satın alma zamanı (UTC),
`sync` yanıtının `source` + `reason` alanları.

### ⚠️ Sandbox testinde bilinmesi gereken

Production backend **sandbox satın almalarını varsayılan olarak reddeder** (gerçek kullanıcıyı
yanlışlıkla premium yapmamak için). TestFlight / sandbox hesabıyla production API'ye satın alma
yaparsanız premium açılmaz — bu bir bug değil, kasıtlı.

Sandbox testi yapılacaksa bize haber verin, `RevenueCat:AllowSandboxEvents` flag'ini süreli
olarak açalım (`AllowSandboxEventsUntil` ile pencere tanımlı; pencere dolduğunda otomatik
kapanır). Log'da şu satır görünüyorsa flag kapalı demektir:
`SANDBOX RevenueCat event production'da reddedildi`.

> Reddedilen sandbox event'i audit tablosuna yazılmaz, yani sonradan replay edilemez. Flag
> açıldıktan sonra satın almanın **tekrarlanması** gerekir.

---

## 9. Checklist

Build/config:
- [ ] `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (`appl_…`) EAS production env'de
- [ ] `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (`goog_…`) EAS production env'de
- [ ] `eas build --profile production --platform all` (OTA **yetmez**)

Kod:
- [ ] `Purchases.configure` app açılışında, `logIn(backendUserId)` login sonrasında, `logOut()` çıkışta
- [ ] Satın alma sonrası `sync` **backoff'lu retry** ile (§3); restore sonrası da aynı
- [ ] `sync` yanıtındaki `status` her turda state'e yazılıyor (downgrade de gelebilir)
- [ ] `reason` karşılaştırmaları **yeni SCREAMING_SNAKE** değerlerle (`WEBHOOK_LANDED` vb.)
- [ ] `source` karşılaştırmaları küçük harf (`db` / `rc_rest` / `none`)
- [ ] Premium gating **yalnızca** `isActivelyPremium` ile
- [ ] Paywall kararı **yalnızca** `paywallType` sabitleriyle
- [ ] `PREMIUM_FILTERS` → 403, `CHAT_QUOTA_EXHAUSTED` → 402 + SignalR `Error` handle ediliyor
- [ ] Undo butonu free'de paywall açıyor (artık 3/gün değil, **0**)
- [ ] Mesafe slider'ı tier'a göre: free max 50 km, premium max 100 km
- [ ] `superLikesRemaining`'i `weeklySuperLikeLimit`'e bölen/oranlayan kod yok
- [ ] SuperLike redeem'de 402 (`UT-6101`) → retry, 400 (`UT-6102`/`UT-6103`) → retry yok
- [ ] Pending durumunda "ödemen alındı, işleniyor" + Tekrar dene
- [ ] Foreground'a dönüşte premium değilse tek seferlik `sync`
- [ ] Premium açılınca §5 cache'leri tazeleniyor

Test:
- [ ] Sandbox premium satın alma → `isActivelyPremium: true`
- [ ] Sandbox SuperLike paketi → bakiye artıyor, `alreadyRedeemed` ikinci çağrıda `true`
- [ ] Restore → premium geri geliyor
- [ ] Free'de 30 swipe sonrası `SWIPE_LIMIT` paywall'ı
- [ ] Free'de ilk undo denemesi → `UNDO_LIMIT` paywall'ı
- [ ] Free'de premium filtre gönderimi → 403 + `PREMIUM_FILTERS`
- [ ] Free-free sohbette 30 mesaj sonrası 402 + Premium modalı; taraflardan biri premium alınca sınırsız
- [ ] Free'de mesafe 100 km kaydetme denemesi → 50'ye clamp'leniyor
- [ ] Kullanılmamış free SuperLike ile premium alma → `superLikesRemaining: 6`
- [ ] İptal edilmiş abonelik → dönem sonuna kadar premium açık kalıyor

---

## İlgili dokümanlar

- [frontend_revenuecat_env_handoff.md](frontend_revenuecat_env_handoff.md) — build/key kök nedeni ve çözümü
- [frontend_superlike_pack_guide.md](frontend_superlike_pack_guide.md) — SuperLike paket akışı detayı
- [frontend_superlike_premium_grant_guide.md](frontend_superlike_premium_grant_guide.md) — kota devri fix'i
- [frontend_chat_quota_premium_guide.md](frontend_chat_quota_premium_guide.md) — chat kotası kural değişikliği
- [frontend_rewind_filters_guide.md](frontend_rewind_filters_guide.md) — undo/rewind detayı
- [frontend_distance_cap_integration_guide.md](frontend_distance_cap_integration_guide.md) — mesafe tavanı
- [runbooks/subscription_support.md](runbooks/subscription_support.md) — destek/operasyon runbook'u
