# İstek — `GET /api/messages/conversations` yanıtına `isUnlimited` eklensin

Tarih: 2026-08-27
Uç: `GET /api/messages/conversations`
İlgili sözleşme: chat quota modeli (2026-08-02) — `GET /api/messages/conversations/{id}/quota`

---

## 0. Tek cümlelik talep

Sohbet listesi yanıtındaki **her kayda**, quota ucundaki `isUnlimited` ile
**birebir aynı anlamı taşıyan** bir `isUnlimited` alanı eklensin.

---

## 1. Neden

Sohbet listesinde partner adının yanına **"Sınırlı"** rozeti çiziyoruz: bu
sohbette ücretsiz mesaj hakkı sayılıyor, yani kullanıcı sohbete girmeden önce
hangi sohbetin cap'e tabi olduğunu görüyor.

Bugün bu bilgi **listede yok**. Kota yalnız `GET .../{id}/quota` ile, yani
**sohbet başına bir istekle** öğrenilebiliyor. Elimizdeki iki seçenek de
kabul edilebilir değil:

- **Satır başına `/quota`.** 30 sohbetlik bir liste = 30 istek, üstelik her
  odak tazelemesinde. Bunu yapmıyoruz.
- **Yalnız daha önce açılmış sohbetleri işaretlemek.** FE'de şu an bu var
  (`quotaByConv` yedeği), ama kısmi: bu map persist edilmiyor, cold start'ta
  liste **rozetsiz** açılıyor ve kullanıcı sohbetlere girdikçe rozetler
  birer birer beliriyor. Aynı listede iki sohbet aynı durumdayken biri
  işaretli biri işaretsiz görünüyor — rozet bu hâliyle bilgi değil gürültü.

Alan liste yanıtına girdiğinde rozet ilk frame'den itibaren **tüm satırlarda**
doğru olur ve ek istek maliyeti sıfırdır.

---

## 2. İstenen alan

`ConversationListItem` (liste yanıtındaki eleman) için:

```jsonc
{
  "conversationId": "…",
  "partnerUserId": "…",
  "partnerDisplayName": "…",
  "unreadCount": 2,
  "isActive": true,
  "partnerIsOnline": false,
  "restorableUntil": null,

  "isUnlimited": false   // YENİ
}
```

**Anlamı `GET .../{id}/quota`daki `isUnlimited` ile AYNI olmalı** — yani
2026-08-02 kuralı:

> Taraflardan **en az biri** aktif premium ise sohbet sınırsız.
> `isUnlocked = true` (legacy kayıt / destek grant'i) → yine sınırsız.

Aynı sohbet için `liste.isUnlimited` ile `quota.isUnlimited` **hiçbir zaman
farklı olmamalı**. İki uç aynı hesabı iki ayrı yerde yapıyorsa er ya da geç
ayrışır; ortak bir hesaplama/parça üzerinden dönmesi tercihimiz.

Tip: `bool` (nullable değil). FE alanı **üç durumlu** okuyor:

| Değer | FE davranışı |
|---|---|
| `false` | "Sınırlı" rozeti çizilir |
| `true` | rozet yok |
| alan hiç yok / `null` | **BİLMİYORUZ** — rozet çizilmez, `quotaByConv` yedeğine düşülür |

Yani alan inmeden önceki sürüm kırılmıyor; eski istemciler de tanımadıkları
alanı yok sayıyor. İki yönde de güvenli deploy.

---

## 3. Performans — asıl dikkat noktası

Alanın **liste sorgusunun kendi içinde** üretilmesi gerekiyor. Sohbet başına
ayrı bir premium/quota lookup (N+1) yapılırsa bu talebin tüm anlamı kaybolur:
istek sayısını FE'den backend'e taşımış oluruz.

Pratikte iki girdi yetiyor:

1. Sohbetin iki tarafının aktif premium bayrağı (`UserProfiles.IsPremium`) —
   liste zaten partner kaydına join'liyor (`partnerDisplayName`,
   `partnerProfileImageUrl`, `partnerIsOnline` oradan geliyor), aynı join'e bir
   kolon daha eklenmesi yeterli.
2. Sohbetin `isUnlocked` bayrağı — konuşma kaydının kendisinde.

`isUnlimited = self.IsPremium || partner.IsPremium || conversation.IsUnlocked`

Mesaj **sayımı gerekmiyor** (bkz. §4), yani `COUNT(*)` maliyeti yok.

---

## 4. İstenmeyenler (kapsamı küçük tutmak için)

Bunları **istemiyoruz**, eklenmesin:

- `remainingMessages` / `messageCount` / `freeMessageLimit` — rozet sayı
  yazmıyor, yalnız "sınırlı mı" diye soruyor. Sayı, sohbete girildiğinde zaten
  `/quota` ile geliyor. Listede sayı taşımak her satır için `COUNT` demek.
- `requiresPremium` — cap'in **dolup dolmadığı** liste rozetini değiştirmiyor.
- `hasPremiumParticipant` — `isUnlimited` bunu zaten kapsıyor
  (`isUnlocked` farkı liste için önemsiz).
- Ayrı bir "toplu quota" ucu (`POST /quota/batch` gibi). Yeni uç istemiyoruz;
  tek bir bool, zaten çekilen listede.

---

## 5. Bayatlama — bilinen ve kabul edilen

Partner aboneliğini bıraktığında sohbet anında cap'e düşer ama bizim
listemizdeki `isUnlimited` bir sonraki `/conversations` çekimine kadar bayat
kalır. Bu **kabul edilebilir**:

- Liste her odaklanmada (`useFocusEffect`) tazeleniyor, pencere kısa.
- Rozet bir **kapı değil**, bilgilendirme: yanlış tarafa düşse bile kullanıcı
  yine sohbete girebiliyor ve orada `/quota` kanonik cevabı veriyor. Gönderim
  reddi zaten 402 / hub `Error` ile korunuyor.
- Kendi aboneliğimiz değişince FE hiç beklemiyor: premium'ken **hiçbir** satırda
  rozet çizilmiyor (tek kaynak `subscriptionSlice`, hub `SubscriptionChanged`
  ile anında düşüyor).

Yani partner aboneliği için ekstra bir realtime event **istemiyoruz**.

---

## 6. FE tarafında hazır olan

- `ConversationListItemDto.isUnlimited?: boolean` tipe eklendi.
- `MessagesScreen` → `isLimitedByConvId`: önce `conv.isUnlimited`, alan yoksa
  `quotaByConv` yedeği, premium kullanıcıda hiç hesaplanmıyor.
- Rozet: ad ile aynı satırda, Beğeniler'deki "Beğenenleri gör" pill'iyle aynı
  dolgu (`litPlus`); kapalı sohbette çizilmiyor.

Alan yayına alındığında FE'de **hiçbir değişiklik gerekmiyor** — yedek dal
kendiliğinden devre dışı kalır, sonra temizlenir.
