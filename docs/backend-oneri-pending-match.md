# Öneri: Açılışta bekleyen match'i dönen bir endpoint

**Kimden:** Frontend
**Konu:** Uygulama kapalıyken oluşan match'ler için "It's Lit!" modalı hiç açılmıyor
**İlgili FE dosyaları:** `src/navigation/AppNavigator.tsx`, `src/features/notifications/components/MatchModal.tsx`

---

## TL;DR

| # | İstek | Aciliyet |
|---|---|---|
| 1 | `GET /api/swipe/PendingMatch` — son 24 saatte oluşmuş, modalı henüz gösterilmemiş **en yeni** match'i döner | Yüksek |
| 2 | `POST /api/swipe/PendingMatch/{conversationId}/seen` — o match'i "modal gösterildi" olarak işaretler | Yüksek |
| 3 | "Modal gösterildi" bayrağı, bildirimlerin `isRead` alanından **ayrı** tutulsun | Yüksek — aynı alan kullanılırsa özellik çalışmaz |

Payload, hub'ın halihazırda gönderdiği `MatchNotification` ile **birebir aynı şekilde** olsun;
FE'de iki ayrı yol açmayalım.

---

## 1. Bağlam: modal neden hiç açılmıyor

FE'de match modalını tetikleyen tek kaynak, SignalR hub'ının canlı `MatchNotification`
event'i (`AppNavigator.tsx`, `realtimeService.on('MatchNotification', ...)` →
`setPendingMatch(m)`).

Hub bağlantı kurulduğunda kaçırılmış event'leri replay etmiyor. Foreground'a dönüşte de
yalnızca `fetchConversations` / `fetchUnreadCount` / `fetchSubscriptionStatus` çekiliyor —
bunların hiçbiri modalı tetiklemiyor.

Sonuç, iki senaryoda da modal yok:

- **Push'a tap ile açılış** → FE `type === 'Match'` bildirimini doğrudan Chat ekranına
  yönlendiriyor. Modal devreye girmiyor (bu davranış kalsın, doğru).
- **İkona basıp açılış** → hub bağlanır, ama geçmiş match'i göndermez. Kullanıcı
  eşleştiğini yalnızca Mesajlar listesindeki yeni satırdan anlar.

Yani modal fiilen sadece "uygulama önplandayken match oldu" durumunda çalışıyor.

---

## 2. Neden mevcut `GET /api/notifications` yetmiyor

Feed'de `type = 'Match'` kayıtları var ve `isRead` alanı da mevcut. FE bunu okuyup modalı
kendi tetikleyebilirdi, ama üç yerde kırılıyor:

### 2a. `isRead`'i Bildirimler ekranı da tüketiyor

`NotificationsScreen`, karta tıklandığında `notificationsService.markRead(item.id)` çağırıyor;
`markAllRead` de var. Kullanıcı uygulamayı açıp önce Bildirimler sekmesine girerse match
okundu işaretlenir → modal bir daha **hiçbir zaman** açılmaz. Modalın kendi bayrağı gerekiyor:
bildirimi okumak, kutlamayı görmek demek değil.

### 2b. Feed item'ında modalın ihtiyacı olan alanlar yok

Modal `matchedUserName` ve `matchedUserPhoto` istiyor; feed item'ında `title` / `body` /
`relatedEntityId` var. FE bunları conversations listesinden eşleştirmek zorunda kalır — yani
modal iki ayrı fetch'in yarışına bağlanır. Modal zaten fotoğraf yüklenene kadar açılmıyor
(`MatchModal.tsx`, `imagesReady` gate'i), üstüne bir de conversations beklemesi girsin
istemiyoruz.

### 2c. Feed sayfalı

Match sonrası gelen mesaj/beğeni bildirimleri, match kaydını ilk sayfadan aşağı itebilir.
FE'nin "kaç sayfa geriye bakayım" diye karar vermesi gerekir.

---

## 3. İstenen sözleşme

### 3.1 `GET /api/swipe/PendingMatch`

Bekleyen match varsa:

```json
{
  "isSuccess": true,
  "result": {
    "conversationId": "…",
    "matchId": "…",
    "matchedUserId": "…",
    "matchedUserName": "Elif",
    "matchedUserPhoto": "https://…",
    "matchedAt": "2026-07-24T09:12:31Z"
  }
}
```

Yoksa `result: null` (404 değil — 404'ü FE hata olarak logluyor).

**Alan adları hub'ın `MatchNotification` payload'ı ile birebir aynı olsun.** FE'de bu şekil
`chatSlice.matchNotification` reducer'ında da kullanılıyor; aynı objeyi hem modala hem
reducer'a verebilelim istiyoruz.

**Seçim kuralı:** aşağıdaki koşulları sağlayan kayıtlar içinden `matchedAt` en yeni olan **tek**
kayıt:

- `matchedAt >= now - 24 saat`
- modal-gösterildi bayrağı `false`
- eşleşme hâlâ geçerli (karşı taraf unmatch/silme yapmamış, hesap aktif)

24 saatten eski veya işaretlenmiş kayıtlar hiç dönmesin. Süreyi backend'de sabit tutalım;
FE'de ikinci bir filtre olmasın.

> **Neden tek kayıt:** Kullanıcı 3 gün sonra dönüp 5 match biriktirmişse üst üste 5 modal
> açmak istemiyoruz — her modal blur + 110 parçalı konfeti mount ediyor, cold start'ta bu
> ciddi bir render yükü. En yeniyi gösteriyoruz, gerisini kullanıcı Mesajlar listesinde görüyor.

**İsteğe bağlı ek alan:** `pendingCount` (24 saat içindeki, gösterilmemiş toplam match sayısı).
Varsa modalda "ve 2 eşleşme daha" satırı gösterebiliriz. Yoksa da özellik çalışır.

### 3.2 `POST /api/swipe/PendingMatch/{conversationId}/seen`

Modal ekranda görüldüğü anda FE çağırır. Idempotent olsun — aynı `conversationId` için ikinci
çağrı 200 dönsün, hata değil.

**Önemli:** Bu çağrı, dönülen kaydı işaretlemenin yanında, 24 saatlik penceredeki **diğer tüm**
gösterilmemiş match'leri de işaretlesin. Aksi halde kullanıcı uygulamayı bir sonraki açışında
sırayla ikinci, üçüncü match'in modalını görür — "birikmiş kutlamalar" istemiyoruz.

Kullanıcının başkasının `conversationId`'sini işaretleyememesi için sahiplik kontrolü gerekli.

### 3.3 Bayrak nerede dursun

`Match` (veya `Conversation`) tablosunda, match'i **gören taraf başına** bir alan gerekiyor —
tek bir bool yetmez, çünkü iki kullanıcı uygulamayı farklı zamanlarda açıyor:

```
MatchModalShownForUserA  bool
MatchModalShownForUserB  bool
```

veya ayrı bir `MatchModalSeen(MatchId, UserId, SeenAt)` tablosu. Hangisi şemanıza uyuyorsa.

Bildirimin `isRead` alanına dokunulmasın; iki bayrak birbirinden bağımsız kalsın.

---

## 4. FE tarafında ne yapılacak

Endpoint gelince FE'de yapılacaklar (backend'i beklemiyor, bilgi amaçlı):

1. `API_ENDPOINTS`'e iki endpoint eklenir, `swipeQueries` veya `notificationsService`'e
   servis metodları yazılır.
2. Boot'ta mevcut **match gate**'i açıldığında (`AppNavigator.tsx`, `matchGateOpen`) tek bir
   `GET PendingMatch` atılır. Bu gate zaten NavigationContainer hazır + conversations fetch'i
   bitmiş + `InteractionManager` kuyruğu boşalmış olmasını bekliyor; yani modal, ekranlar
   otururken değil oturduktan sonra mount oluyor.
3. Dönen obje `setPendingMatch`'e verilir — canlı hub event'i ile aynı kod yolu.
4. Modal görününce `POST …/seen` atılır. İstek hata dönerse modal yine de kapanır; aynı
   match'in sonsuza kadar tekrar açılmaması için FE ayrıca lokal bir guard tutar.
5. Push'a tap ile açılış yolu değişmez — orada doğrudan Chat'e gidiliyor, modal atlanıyor.
   O durumda da `seen` çağrılır ki sonraki açılışta modal patlamasın.

---

## 5. Özet karar tablosu

| Karar | Seçim | Gerekçe |
|---|---|---|
| Kaç match gösterilsin | En yeni **1** tanesi | Üst üste modal + konfeti cold start'ta ağır |
| Geriye bakma penceresi | **24 saat** | Günlük kullanan kimseyi kaçırmaz, bir hafta sonra dönene bayat kutlama göstermez |
| "Görüldü" bayrağı | Bildirimin `isRead`'inden **ayrı**, kullanıcı başına | Bildirimler ekranı `isRead`'i tüketiyor, özelliği sessizce öldürür |
| Payload şekli | Hub'ın `MatchNotification`'ı ile aynı | FE'de tek kod yolu |
| Boş durum | `result: null`, 200 | 404 FE'de hata olarak loglanıyor |
