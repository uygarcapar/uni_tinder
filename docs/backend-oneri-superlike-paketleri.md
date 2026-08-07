# Öneri: Superlike consumable paketleri için redeem endpoint'i

**Kimden:** Frontend
**Konu:** App Store'da satılacak 5/10/15/20'lik superlike paketlerinin kullanıcı bakiyesine işlenmesi
**İlgili FE dosyaları:** `src/features/discover/components/SuperLikePurchaseModal.tsx`, `src/features/discover/swipeQueries.ts`, `src/features/profile/subscriptionService.ts`

---

## TL;DR

| # | İstek | Aciliyet |
|---|---|---|
| 1 | `POST /api/swipe/SuperLike/Redeem` — consumable satın alımını doğrulayıp `productId`'ye göre 5/10/15/20 kredi ekler; `transactionId` bazında **idempotent** | Yüksek |
| 2 | `GET /api/swipe/Stats` yanıtına satın alınmış kredi bakiyesi (`purchasedSuperLikes`) eklensin; `superLikesRemaining` toplamı yansıtsın | Yüksek |
| 3 | Tüketim sırası: önce haftalık ücretsiz kota, sonra satın alınan kredi; **satın alınan krediler süresiz** (haftalık reset'te sıfırlanmaz) | Yüksek — UI'daki "asla süresi dolmaz" metniyle sözleşme |
| 4 | RevenueCat webhook'u işlenmeden redeem gelirse **402** dönülsün (FE 3 sn bekleyip tekrar dener — chat_unlock'taki desenin aynısı) | Orta |

Akış, halihazırda çalışan **chat_unlock** consumable akışının birebir kopyası olsun;
FE'de ve backend'de ikinci bir desen icat etmeyelim.

---

## 1. Bağlam

App Store Connect'te 4 **consumable** IAP açılıyor (RevenueCat üzerinden satılacak):

| Product ID | Kredi |
|---|---|
| `superlike_5` | 5 |
| `superlike_10` | 10 |
| `superlike_15` | 15 |
| `superlike_20` | 20 |

Consumable'lar abonelik gibi entitlement üretmez; satın alma "olmuş" sayılır sayılmaz
karşılığının backend'de kullanıcı bakiyesine yazılması gerekir. Şu an superlike bakiyesi
tamamen sunucu otoritesinde (`GET /api/swipe/Stats` → `superLikesRemaining`,
`weeklySuperLikeLimit`, `superLikeCountResetAt`) ve yalnızca haftalık kotadan besleniyor —
satın alınan paketi işleyecek bir yol yok.

`chat_unlock` için bu problem zaten çözülmüş durumda:
FE satın almayı yapıyor → RevenueCat `nonSubscriptionTransactions`'tan `transactionId`
alıyor → `POST /api/messages/conversations/{id}/unlock { transactionId }` ile redeem
ediyor → webhook henüz işlenmemişse 402 alıp 3 sn sonra tekrar deniyor. Superlike için
aynı sözleşmeyi istiyoruz.

---

## 2. İstenen sözleşme

### 2.1 `POST /api/swipe/SuperLike/Redeem`

```json
// request
{ "transactionId": "2000000123456789", "productId": "superlike_10" }
```

Başarıda:

```json
{
  "isSuccess": true,
  "result": {
    "creditsAdded": 10,
    "purchasedSuperLikes": 12,
    "superLikesRemaining": 15
  }
}
```

- **Idempotency:** Aynı `transactionId` ikinci kez gelirse kredi **tekrar eklenmez**,
  mevcut bakiyeyle 200 dönülür (FE retry'ları ve çift tıklamalar için). Hata değil.
- **Doğrulama:** `transactionId`, RevenueCat webhook'uyla (`NON_RENEWING_PURCHASE` /
  non-subscription transaction) gelen kayıtla eşleşmeli ve o kullanıcıya ait olmalı.
  Kredi miktarı client'ın gönderdiği `productId`'den değil, **webhook'taki productId'den**
  türetilsin (client'a güvenmeyelim); ikisi çelişirse webhook kazanır.
- **Webhook yarışı:** Webhook henüz işlenmediyse **402** dönülsün. FE 3 sn bekleyip bir
  kez daha dener (chat_unlock ile aynı). 404/400 FE'de kalıcı hata olarak loglanıyor,
  o yüzden "henüz yok" durumu için özellikle 402.

### 2.2 `GET /api/swipe/Stats` genişletmesi

Mevcut alanlara ek:

```json
{
  "superLikesRemaining": 15,      // haftalık kalan + satın alınmış toplam
  "purchasedSuperLikes": 12,      // yeni: satın alınmış, süresiz kredi
  "weeklySuperLikeLimit": 3,
  "superLikeCountResetAt": "…"
}
```

`superLikesRemaining`'in toplamı yansıtması önemli: FE'deki tüm tüketim/gösterim mantığı
(optimistic decrement, kota-bitti modalı) bu tek alandan okuyor; toplamı FE'de ikinci kez
hesaplamak istemiyoruz.

### 2.3 Tüketim sırası ve süre

- `POST /api/swipe/SuperLike` önce **haftalık ücretsiz kotadan** düşsün, kota bitince
  satın alınan krediden. (Tersi olursa kullanıcı parayla aldığını harcarken bedava hakkı
  reset'te yanar — şikâyet konusu.)
- Satın alınan kredilerin **süresi dolmasın** ve haftalık reset'te sıfırlanmasın.
  Satın alma ekranındaki mevcut i18n metni kullanıcıya "anında hesabına eklenir, asla
  süresi dolmaz" diyor; bu bir ürün sözü.
- Premium olup olmamak kredi kullanımını etkilemesin; paketler herkese satılıyor.

---

## 3. FE tarafında ne yapılacak

Endpoint gelince FE'de yapılacaklar (bilgi amaçlı):

1. `subscriptionService.ts`'e `purchaseSuperlikePack()` eklenir — `chat_unlock`'taki
   `getChatUnlockPackage`/`purchaseChatUnlock` deseninin kopyası, RC offering `superlikes`.
2. `SuperLikePurchaseModal` gerçek RC paketlerine bağlanır (15'li eklenir, sabit ₺
   fiyatlar `priceString` ile değiştirilir).
3. Satın alma başarısında `Redeem` çağrılır → 402'de 3 sn bekle + tek retry →
   `statsQuery` invalidate edilip yeni bakiye çekilir.
4. `DiscoverScreen`'deki kota-bitti akışı premium paywall yerine bu modala yönlendirilir.

---

## 4. Özet karar tablosu

| Karar | Seçim | Gerekçe |
|---|---|---|
| Doğrulama kaynağı | RC webhook, client değil | `productId` spoof edilemesin |
| Idempotency anahtarı | `transactionId` | Retry/çift tık kredi şişirmesin |
| Webhook yarışı | 402 + FE retry | chat_unlock ile aynı, FE'de hazır desen |
| Tüketim sırası | Önce haftalık kota, sonra kredi | Parayla alınan yanmasın |
| Kredi süresi | Süresiz | UI "asla süresi dolmaz" diyor |
| Bakiye alanı | `superLikesRemaining` toplamı içerir | FE tek alandan okuyor |
