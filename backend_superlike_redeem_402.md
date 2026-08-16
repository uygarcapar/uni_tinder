# SuperLike redeem sürekli `402 / UT-6101` — `NON_RENEWING_PURCHASE` webhook'u işlenmiyor

**Tarih:** 2026-08-12 · **Ortam:** iOS dev-client, StoreKit **sandbox**
**Kullanıcı (`app_user_id`):** `4188b96b-5112-4437-a21a-f4326a5d5a33`

---

## 1. Tek cümlelik durum

Aynı kullanıcının **abonelik** webhook'u backend'e iniyor ve işleniyor
(`/sync` → `WEBHOOK_LANDED`, `source: db`), ama aynı dakikalarda yapılan **consumable**
(SuperLike paketi) satın almaları için `POST /api/swipe/SuperLike/Redeem` **istisnasız
`402 / UT-6101`** dönüyor. Yani sorun sandbox, kimlik ya da webhook transport'u değil —
`NON_RENEWING_PURCHASE` olayının işlenmesinde.

---

## 2. Kontrol grubu — bu raporun ana kanıtı

Aynı oturumda, aynı `app_user_id` ile, aynı webhook endpoint'ine:

| | Abonelik (`premium_weekly`) | Consumable (`superlike_5` / `_10`) |
|---|---|---|
| RC event | `INITIAL_PURCHASE` | `NON_RENEWING_PURCHASE` |
| Backend'e ulaştı mı | ✅ `reason: WEBHOOK_LANDED`, `source: db` | ❌ Redeem hep `UT-6101` = "henüz doğrulanmadı" |
| Sonuç | `isActivelyPremium: true`, `status: Active` | Kredi hiç yazılmıyor |

Sandbox ortamı, `app_user_id`, RC projesi, webhook URL'i, cihaz ve zaman **aynı**.
Tek değişen **event tipi**. Dolayısıyla:

- ❌ Sandbox event filtresi (`AllowSandboxEvents`) — elendi, abonelik event'i kabul edildi
- ❌ `app_user_id` eşleşmemesi — elendi, aynı id ile premium açıldı
- ❌ RC REST anahtarı / proje hatası — elendi
- ❌ Webhook URL / imza / erişim sorunu — elendi
- ✅ Geriye kalan: **`NON_RENEWING_PURCHASE` event'i ya hiç gelmiyor ya da persist edilmiyor**

---

## 3. Ham cihaz logu

```
[iap] sl-satın-alma-bitti — productId=superlike_5 · transactionId=2000001220300570 · kaynak=purchase-result
      geçmiş=["superlike_5#o1_fpkssajtQNEdWgAWhMItMw","superlike_10#o1_jvSiD0ZoaGqSDSzS8DZqFw",
              "superlike_5#o1_SCV5QuQRj16OBapU7SROVg","superlike_10#o1_-yMovrq-8QWgDq4I7PiSjg",
              "superlike_5#o1_LonF32X9u_w59OA7GJu5jQ"]
POST /api/swipe/SuperLike/Redeem
[iap] redeem-hata — http=402 · code=UT-6101 · tx=2000001220300570 · productId=superlike_5
      · mesaj=Satın alma henüz doğrulanmadı. Birkaç saniye sonra tekrar dene.
[iap] redeem-hata — http=402 · code=UT-6101 · tx=o1_-yMovrq-8QWgDq4I7PiSjg · productId=superlike_10
[iap] redeem-hata — http=402 · code=UT-6101 · tx=2000001220300369 · productId=superlike_10
[iap] redeem-hata — http=402 · code=UT-6101 · tx=o1_LonF32X9u_w59OA7GJu5jQ · productId=superlike_5

# ... aynı anda, aynı kullanıcı, aynı oturum:
[iap] status    — isPremium=true · ham_isActivelyPremium=true · status=Active · ürün=premium_weekly
                  · bitiş=2026-08-12T13:59:54 · provider=AppStore
[iap] reconcile — synced=true · reason=WEBHOOK_LANDED · source=db · isPremium=true
```

Kuyruk her açılışta yeniden deniyor, deneme sayacı `@5`'e ulaştı — yani bu **saatler
süren kalıcı bir durum**, dokümandaki 1-3 sn'lik webhook yarışı değil.

---

## 4. Gönderdiğimiz transaction id'ler — iki farklı format, ikisi de 402

RevenueCat iOS SDK aynı satın alma için **iki farklı id** veriyor ve biz güvende olmak
için ikisini de ayrı ayrı redeem ediyoruz:

| Kaynak | Örnek | Sonuç |
|---|---|---|
| `purchasePackage()` sonucu (`transaction.transactionIdentifier`) — **Apple'ın numerik id'si** | `2000001220300570`, `2000001220300369` | `402 UT-6101` |
| `customerInfo.nonSubscriptionTransactions[].transactionIdentifier` — **RC'nin kendi id'si** | `o1_LonF32X9u_w59OA7GJu5jQ`, `o1_-yMovrq-8QWgDq4I7PiSjg` | `402 UT-6101` |

**İkisi de eşleşmiyor.** Eğer webhook inip receipt satırı yazılmış olsaydı, bu iki
formattan en az birinin tutması beklenirdi. Bu, backend'de bu satın almalara ait
**hiç kayıt olmadığına** işaret ediyor.

> ⚠️ **Dokümanda bir çelişki var:** §6.2 *"`transactionId`'yi RC
> `customerInfo.nonSubscriptionTransactions` içinden alın"* diyor, ama §3.8'deki örnek
> gövde `"transactionId": "2000000123456789"` — yani Apple'ın numerik id'si.
> `nonSubscriptionTransactions` iOS'ta **RC'nin `o1_…` id'sini** döndürüyor, Apple'ınkini
> değil (SDK tipinde `storeTransactionIdentifier` alanı yok). Backend hangisiyle
> eşleştiriyorsa doküman ona göre düzeltilmeli; biz de tek formata inebiliriz.

---

## 5. Frontend tarafında doğrulananlar

| Kontrol | Sonuç |
|---|---|
| İstek gövdesi | ✅ `{ transactionId, productId }` — §3.8 ile birebir |
| Auth | ✅ Aynı token'la `/subscription/*` çalışıyor |
| Kod ayrımı | ✅ `UT-6101` → retry+kuyruk, `UT-6102`/`UT-6103` → kalıcı (hiç gelmedi) |
| Retry politikası | ✅ 3 sn'de 1 retry, sonra kalıcı MMKV kuyruğu, her açılışta tekrar |
| Idempotency | ✅ Aynı `transactionId` tekrar denendiğinde sorun yok varsayımıyla çalışıyoruz |
| Ürün adları | ✅ RC offering'de `superlike_5/10/15/20` görünüyor, satın alma başarılı |

`UT-6102` (ürün tanımlı değil) ve `UT-6103` (transaction başka hesapta) **hiç dönmedi** —
yani ürün konfigürasyonu ve hesap eşleşmesi backend'e göre de sorunsuz.

---

## 6. Backend'den istediklerimiz

1. **RC dashboard → Customer `4188b96b-5112-4437-a21a-f4326a5d5a33` → Transactions**
   ekranında `superlike_10` (`2000001220300369`) ve `superlike_5` (`2000001220300570`)
   satın almaları görünüyor mu?
2. **Webhook delivery log:** Bu satın almalar için `NON_RENEWING_PURCHASE` event'i
   gönderildi mi, backend kaç HTTP kodu döndü? (Aynı ekranda `INITIAL_PURCHASE`'in
   200 aldığını görebiliyor olmalısınız — karşılaştırın.)
3. **Handler:** Backend'in webhook switch'i `NON_RENEWING_PURCHASE` case'ini işliyor mu,
   yoksa `default`'a mı düşüyor / exception mı atıyor? Consumable receipt satırı hangi
   tabloya, hangi alanla yazılıyor?
4. **Eşleştirme alanı:** Receipt satırı yazılıyorsa `transactionId` olarak RC payload'ının
   hangi alanı saklanıyor — `transaction_id`, `store_transaction_id` yoksa
   `original_transaction_id` mi? §4'teki iki formattan hangisini bekliyorsunuz?
5. **`UT-6101` hangi koşulda dönüyor:** "receipt satırı hiç yok" mu, yoksa "satır var ama
   `transactionId` eşleşmiyor" mu? Bu ikisi tamamen farklı düzeltme demek; log'dan
   ayırabilir misiniz?
6. **Ayırt edici kod isteği:** "Bu transaction backend'de hiç yok" için `UT-6101`den ayrı
   kalıcı bir kod (ör. `UT-6104`) dönerse, FE sonsuza kadar retry etmek yerine kullanıcıya
   doğru mesajı gösterip destek akışına yönlendirebilir. Şu an her 402 "birazdan
   yansıyacak" olarak okunuyor ve asla yansımıyor.

---

## 7. Şu an kredisi verilmemiş satın almalar

| Ürün | Apple transaction id | RC id |
|---|---|---|
| `superlike_10` | `2000001220300369` | `o1_-yMovrq-8QWgDq4I7PiSjg` |
| `superlike_5` | `2000001220300570` | `o1_LonF32X9u_w59OA7GJu5jQ` |

Cihaz geçmişinde ayrıca 24 saatlik pencerenin dışında kalan 3 consumable satın alma daha
var (`superlike_5`, `superlike_10`, `superlike_5`) — onların da kredisi yazılmamış olabilir.

**Manuel kredi yazmanıza gerek yok:** webhook/handler tarafı düzeldiği anda FE'nin kalıcı
kuyruğu bir sonraki açılışta bu transaction'ları kendiliğinden redeem edecek (endpoint
`transactionId` bazında idempotent olduğu için mükerrer kredi riski yok).

---

## 8. "Kapandı" kriteri

1. Yeni bir `superlike_5` satın alması → `POST /api/swipe/SuperLike/Redeem` → **200**,
   `creditsAdded: 5`
2. Aynı redeem tekrar → **200**, `creditsAdded: 0`, `alreadyRedeemed: true`
3. Bekleyen kuyruk (§7) bir sonraki açılışta boşalıyor, bakiye artıyor

---

## Ek: premium tarafı çözüldü

Bir önceki raporda bildirdiğimiz `/api/subscription/sync` → `NOT_FOUND_IN_RC` sorunu
**artık görülmüyor**: aynı cihaz ve sandbox'ta `WEBHOOK_LANDED` + `source: db` ile premium
anında açılıyor. Sizin tarafınızda bu aralıkta bir ayar değişikliği (ör.
`RevenueCat:AllowSandboxEvents`) yapıldıysa bilgi verir misiniz — yapılmadıysa önceki
başarısızlığın nedeni büyük olasılıkla süresi dolmuş bir sandbox aboneliğiydi
(sandbox'ta `weekly` = 3 dakika) ve backend'in `NOT_FOUND_IN_RC` cevabı **doğruydu**.
