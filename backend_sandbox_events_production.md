# Sandbox RevenueCat event'leri — production'da kabul edilmeli

**Tarih:** 2026-09-04
**Durum:** App Store submit'ini bloke ediyor
**İlgili:** `backend_note_store_products.md` §4 (o bölümdeki "açık blokaj" ARTIK
GEÇERSİZ — development'ta hak ekleme çalışıyor; bu doküman bir sonraki sorunu
tarif ediyor)

---

## TL;DR

Production backend'de `RevenueCat:AllowSandboxEvents` kapalı. Bu, **App Review
reviewer'ının satın almasının karşılıksız kalması** demek → ret.

İstenen: production sandbox event'lerini **kabul etsin ama `isSandbox` olarak
işaretlesin** — hak yazılsın, gelir raporuna girmesin.

---

## 1. Şu an ne çalışıyor

Development ortamında not / SuperLike / kurtarma paketleri uçtan uca çalışıyor:
satın alma → RevenueCat `NON_RENEWING_PURCHASE` → webhook → redeem → hak eklendi.
Bu tarafta yapılacak bir şey kalmadı.

## 2. Sorun

**StoreKit, App Store'dan indirilmemiş her build'i sandbox ortamına yönlendirir.**
Bu şunları kapsıyor:

- TestFlight build'leri (internal + external testçiler)
- **App Review reviewer'larının test ettiği build**

Yani reviewer production build'i çalıştırıyor, production backend'ine bağlanıyor,
ama satın alması **sandbox** ortamında gerçekleşiyor. RevenueCat webhook'u
backend'e `environment: "SANDBOX"` etiketiyle geliyor ve prod bunu reddediyor:

```
SANDBOX RevenueCat event production'da reddedildi
```

Sonuç zinciri:

```
Reviewer note_2 satın alır
  → RevenueCat NON_RENEWING_PURCHASE (environment: SANDBOX)
  → prod backend reddeder
  → hak eklenmez
  → reviewer "para gitti, ürün gelmedi" görür
  → Guideline 3.1.1 / 2.1 reddi
```

Aynı şey TestFlight testçileri için de geçerli — satın alma testini hiç kimse
gerçek build üzerinde yapamıyor.

## 3. Kontrol edilecek

- [ ] Production build hangi API base URL'ine bakıyor? (`EXPO_PUBLIC_API_BASE_URL`,
      EAS ortam değişkeni). Prod backend'e bakıyorsa sorun gerçek.
- [ ] Prod'da `RevenueCat:AllowSandboxEvents` gerçekten kapalı mı?
- [ ] Kapalıyken event nerede düşüyor — log'da görülüyor mu, sessizce mi atılıyor?

## 4. İstenen değişiklik

Production sandbox event'lerini **reddetmesin, işaretlesin**.

RevenueCat webhook payload'ında ortam bilgisi hazır geliyor:

```json
{
  "event": {
    "type": "NON_RENEWING_PURCHASE",
    "environment": "SANDBOX",
    "product_id": "note_2",
    "app_user_id": "...",
    "transaction_id": "..."
  }
}
```

Davranış:

| Alan | Sandbox event | Production event |
|---|---|---|
| Hak yazılması | **Evet** — normal akış | Evet |
| Gelir raporu / analitik | **Hayır** — dışarıda | Evet |
| Kayıtta işaret | `isSandbox = true` | `isSandbox = false` |

Redeem ucunun sözleşmesi (kodlar, idempotency, yanıt gövdesi) **değişmiyor** —
`backend_note_store_products.md` §3.3 aynen geçerli.

### Neden güvenli

Sandbox satın alması için Apple'ın **sandbox tester hesabı** gerekiyor. Normal
bir App Store kullanıcısı production build'de sandbox satın alma yapamaz —
bedava hak sömürüsü yüzeyi pratikte yok. Sektörde yaygın yaklaşım da bu.

Yine de tedirginlik varsa alternatif: sandbox event'leri kabul et ama yalnız
allowlist'teki `app_user_id`'ler için (reviewer + TestFlight hesapları). Daha
dar ama bakım gerektiriyor.

## 5. Doğrulama

- [ ] Prod backend'e bağlı bir TestFlight build'inde sandbox `note_2` satın al
- [ ] `notesRemaining` 2 artıyor
- [ ] Kayıt `isSandbox = true` olarak işaretlenmiş
- [ ] Gelir raporunda / analitikte görünmüyor
- [ ] Aynı test `superlike_*` ve `recovery_*` için de geçiyor

Bu doğrulanmadan App Store'a submit edilmemeli.
