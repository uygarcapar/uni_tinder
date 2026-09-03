# İstek — kapalı sohbette **kimin kapattığı** dönsün (`deactivatedByUserId`)

Tarih: 2026-08-28
Uçlar: `GET /api/messages/conversations`, `DELETE /api/messages/conversations/{id}`,
`POST /api/messages/conversations/{id}/restore`, hub event `ConversationDeactivated`
İlgili sözleşme: unmatch + rematch (2026-08-15) — `restorableUntil` üç durumlu

---

## 0. Tek cümlelik talep

Kapalı bir sohbet için **kimin kapattığını** okuyabilelim: sohbet listesi DTO'suna
`deactivatedByUserId` (kapalı değilse `null`) eklensin, aynı alan
`ConversationDeactivated` hub event'ine de konsun.

---

## 1. Ürün kuralı — "Geri Al" yalnız kaldıran uçta

Ürün kararı (2026-08-28): eşleşmeyi kaldıran taraf pencere açıkken geri alabilir;
**karşı taraf geri alamaz**. Karşı taraf kapanmış sohbete girip 3 noktaya
bastığında "Eşleşmeyi Geri Al" tuşu **hiç görünmemeli** — kendisine ait olmayan
bir kararı geri almayı teklif etmiyoruz.

Bu kural backend'de zaten uygulanıyor: karşı tarafın `restore` çağrısı reddediliyor.
Eksik olan, **FE'nin bunu çağrı yapmadan bilmesi**.

---

## 2. Sorun — kapatanın kim olduğu yanıtta hiç yok

Bugün elimizdeki tek ipucu `restorableUntil` ve o damga **yalnız unmatch
yanıtında** kesin. Sohbet listesi DTO'su alanı taşımıyor, yani:

| Durum | `restorableUntil` | FE ne bilir |
|---|---|---|
| Kendi unmatch'imizin yanıtı | dolu / `null` | Pencere kesin |
| `ConversationDeactivated` event'i geldi | (alan yok) | "Karşı taraf kapattı" — event'in kendisinden çıkarılıyor |
| **Uygulama yeniden açıldı / event kaçtı** | **`undefined`** | **Hiçbir şey** |

Üçüncü satır bir bug üretiyordu: alan `undefined` iken FE, canlı bir pencereyi
gizlememek için butonu **gösteriyordu** — kapatan taraf kendisi olmasa bile. Yani
karşı taraf sohbete girip 3 noktaya bastığında "Eşleşmeyi Geri Al" çıkıyor, basınca
sunucu haklı olarak reddediyor ve kullanıcıya "süre dolmuş olabilir" deniyordu.
İki kez yanlış: buton hiç olmamalıydı, gerekçe de yanlıştı.

`ConversationDeactivated` event'i bu boşluğu kapatmıyor çünkü **anlık**: uygulama
kapalıyken düşen event kullanıcıya hiç ulaşmıyor, açılışta okunan tek şey liste
DTO'su ve orada `isActive: false` dışında bilgi yok.

---

## 3. FE'nin geçici çözümü ve neden yetmiyor

Bugün (2026-08-28) FE, kapatanın kim olduğunu **istemcide** damgalıyor:
`conversationDeactivated({ byMe: true })` yalnız kendi unmatch akışımızda
geçiliyor, hub event'i ve kapalı sohbete gönderim reddi bayrağı `false` yapıyor.
Bayrak persist ediliyor ve her `GET /conversations` merge'ünde korunuyor.

Kapanan senaryolar: karşı tarafın event'i kaçırması, uygulamayı yeniden açması,
cold start. Bu üçü sorunun büyük kısmıydı.

**Kapanmayan tek senaryo — çok cihaz.** Kullanıcı eşleşmeyi telefonundan
kaldırıp tabletinden sohbete girerse tabletin bayrağı "bilinmiyor" olur ve
**kendi kapattığı sohbette geri alma tuşunu göremez** (pencere hâlâ açıkken).
Yerel bayrak cihazlar arasında senkronlanamaz — bu bilgi sunucuda.

Aynı boşluk, uygulamayı **silip yeniden kuran** kullanıcıda da var: persist
temizlenir, kapatan biz olsak da bayrak kaybolur.

---

## 4. İstenen değişiklik

### D1 — Liste DTO'su (asıl talep)

`GET /api/messages/conversations` içindeki her kayda:

```jsonc
{
  "conversationId": "…",
  "isActive": false,
  "restorableUntil": "2026-08-29T09:12:00Z",

  "deactivatedByUserId": "…"   // YENİ: sohbeti kapatan kullanıcı; isActive:true iken null
}
```

- `isActive: true` → **`null`**. (Rematch/restore sonrası da `null`'a dönmeli —
  sohbet "hiç kesintiye uğramamış" sayılıyor, bkz. `ConversationRestored`.)
- `isActive: false` → kapatanın **userId**'si.
- Engelleme/şikayet yoluyla kapanmışsa da engelleyenin id'si dönsün; FE bu
  durumda zaten geri alma teklif etmiyor (`restorableUntil: null`), alan yalnız
  metin seçimini doğrulaştırır.

**Neden ham `userId`, bool değil?** `deactivatedByMe: bool` de işimizi görürdü ama
kullanıcı-bağımlı bir alan; aynı sohbet iki tarafa iki farklı değerle dönerdi ve
cache'lenebilirliği bozardı. `userId` ile FE karşılaştırmayı kendi tarafında yapar
(`deactivatedByUserId === myUserId`) — wire sözleşmesindeki diğer alanlarla da
tutarlı kalır.

### D2 — Hub event'i

`ConversationDeactivated` payload'ına aynı alan eklensin:

```jsonc
{ "conversationId": "…", "deactivatedByUserId": "…", "restorableUntil": null }
```

Event bugün karşı tarafa gidiyor, dolayısıyla alan pratikte hep "öteki" olacak —
ama event **kendi diğer cihazlarımıza** da giderse (bkz. D3) tek ayırt edici alan
bu olur. FE tanımadığı alanı yok sayar, mevcut istemcileri kırmaz.

### D3 — Kendi cihazlarımıza event (opsiyonel, D1'in tamamlayıcısı)

`ConversationDeactivated` bugün yalnız karşı tarafa gidiyor. Unmatch eden
kullanıcının **diğer cihazlarına** da gitmesi (`Clients.User`, `SubscriptionChanged`
deseninde) çok cihaz senaryosunu anlık çözer. D1 zaten cold start'ta çözüyor, bu
madde "tablet açıkken" halini kapatıyor — küçük ama D1 olmadan tek başına yetmez.

### D4 — `restorableUntil`ı listede de döndürmek (varsa kolay)

`deactivatedByUserId` geldiğinde FE, kapatan biz isek pencereyi göstermek için
damgaya bakıyor; damga listede yoksa "süre bilinmiyor" metnine düşüyor
(`chat.unmatch.restoreMessageUnknown`). Alan listeye de eklenirse kalan süre
cold start'ta da doğru yazılır. Zorunlu değil, mevcut davranış bozulmuyor.

---

## 5. FE tarafında hazır olan / sonra yapılacak

Bugünkü sürüm alan gelmeden de doğru çalışıyor — talep **regresyon düzeltmesi
değil, ödünç kapatma**:

- `shouldOfferRestore(restorableUntil, deactivatedByMe)` üç durumlu bayrağı zaten
  okuyor (`src/features/chat/restoreWindow.ts`).
- Alan gelmeye başladığında FE'de değişecek tek yer, bayrağın kaynağı:
  yerel `byMe` damgası yerine `deactivatedByUserId === myUserId`. Bayrak sunucudan
  türetildiği an istemci damgası düşer, çok cihaz ve yeniden kurulum senaryoları
  kendiliğinden kapanır.
- `undefined` (alan hiç gelmedi) hâli **korunacak**: alanı göndermeyen sunucu
  sürümüne karşı bugünkü yerel bayrak yedek olarak kalır.

---

## 6. Bilinçli olarak istemediklerimiz

- **Karşı tarafa restore hakkı YOK.** Talep yalnız bilgi; yetki kuralı aynı kalsın.
- **Kapatanın adı/kimliği kullanıcıya gösterilmeyecek.** Alan yalnız "ben miyim"
  karşılaştırması için; arayüzde "X eşleşmeyi kaldırdı" gibi bir metin yok
  (unmatch sessiz ve simetrik — ürün kararı).
- **Yeni uç istemiyoruz.** `GET /conversations/{id}/deactivation-info` gibi ek bir
  çağrı, sohbet açılışına ikinci bir istek koyar; bilgi zaten listede olmalı.
- **Yeni hata kodu istemiyoruz.** Karşı taraf restore denerse mevcut ret yeterli —
  alan geldiğinde o ekrana zaten hiç ulaşılmıyor.
