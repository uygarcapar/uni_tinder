# Chat / Mesajlaşma — Frontend Entegrasyon Rehberi

> **Kaynak:** backend `master` @ 3f6b7cf · **Tarih:** 2026-07-26
> **Kapsam:** SignalR real-time hub (mesaj gönder/al, typing, presence, read/delivered receipt),
> REST endpoint'leri, sohbet listesi, geçmiş (offset + cursor pagination), reply/edit/delete/reaction,
> media (voice/image/video), chat quota ekonomisi (30-mesaj cap + unlock), okundu/iletildi state machine,
> bildirimler, optimistic UI reconcile, hata kodları, tam TypeScript tipleri.

Bu doküman chat özelliğinde **frontend'in dokunduğu her şeyi** içerir. Premium/paywall detayları için:
[`docs/frontend_premium_integration_guide.md`](frontend_premium_integration_guide.md).

---

## 0. TL;DR — 12 satırda akış

1. Login sonrası **tek bir SignalR bağlantısı** aç: `/hubs/match?access_token=<JWT>`. Match + chat + bildirim hepsi bu tek hub'dan akar.
2. Bağlantı kurulunca backend seni **tüm conversation grupların**a ve **partner presence grupların**a otomatik ekler. Ekstra join gerekmez (yeni match hariç).
3. Sohbet listesi: **`GET /api/messages/conversations`** — son mesaj, unread sayısı, partner online durumu hepsi tek response'ta.
4. Sohbet aç → geçmiş: **`GET /api/messages/conversations/{id}/history-cursor`** (yeni client'lar cursor kullanmalı, offset legacy).
5. Mesaj gönder: **Hub `SendMessage(convId, content, clientMessageId)`** (tercih edilen) veya REST `POST /api/messages/send`. `clientMessageId` (UUID) optimistic UI + retry idempotency için **zorunlu pratik**.
6. Gönderen kendi çağrısına **`MessageSent`** ack alır → optimistic mesajı reconcile et. Karşı taraf + senin diğer cihazların **`ReceiveMessage`** alır.
7. Mesaj görününce **`MarkMessagesAsRead(convId)`** çağır → karşı taraf **`MessagesRead`** alır (lastReadMessageId'ye kadar hepsi okundu).
8. Yazarken **`StartTyping` / `StopTyping`** → karşı taraf **`UserStartedTyping` / `UserStoppedTyping`** alır. Debounce et.
9. Partner online/offline: **`UserStatusChanged`** event'i (sadece eşleştiklerin için, gizlilik).
10. Quota: iki taraf da premium değilse **sohbet başına 30 mesaj cap**. Aşılınca gönderim `CHAT_QUOTA_EXHAUSTED` / HTTP 402 döner → paywall + unlock akışı.
11. Reply/edit/delete/reaction/media hepsi REST + hub broadcast ile senkron. `MessageEdited`, `MessageDeleted`, `ReactionsChanged` event'lerini dinle.
12. Offline'ken gelen mesajlar **push notification** ile bildirilir (in-app feed'de gösterilmez, sohbet ekranında yaşar).

---

## 1. Mimari — tek bağlantı, iki taşıma yolu

```
                     ┌──────────────────────────────────────────────┐
                     │              MatchHub  (/hubs/match)          │
   [Mobil/Web]       │  ── real-time: mesaj, typing, presence,       │
       │  WS         │     read/delivered receipt, match, bildirim   │
       ├────────────►│                                               │
       │             │  Gruplar (bağlanınca otomatik):               │
       │             │   conv:{conversationId}       → mesaj fanout  │
       │             │   presence-of:{partnerId}     → online/offline│
       │  HTTPS      └──────────────────────────────────────────────┘
       ├────────────►┌──────────────────────────────────────────────┐
       │  REST       │        MessagesController (/api/messages)     │
       │             │  ── history, list, send (hub'a alternatif),   │
       │             │     edit/delete/reaction/search/media/quota   │
       │             └──────────────────────────────────────────────┘
```

**Kim neyin sahibi:**

| İş | Yol | Not |
|----|-----|-----|
| Mesaj gönderme | Hub `SendMessage` **veya** REST `POST /send` | İkisi de aynı `ChatService.SendMessageAsync` çağırır → **tek fanout kaynağı**, duplicate yok. |
| Mesaj alma (real-time) | Hub `ReceiveMessage` | Her iki gönderim yolu da bu event'i tetikler. |
| Geçmiş yükleme | REST `history-cursor` / `history` | Hub'da geçmiş yok. |
| Read/delivered receipt | Hub (tercih) veya REST | İkisi de aynı serviste. |
| Typing / presence | Sadece Hub | REST karşılığı yok. |
| Edit/delete/reaction | REST çağrısı → Hub broadcast | Çağrı REST, sonuç hub event'i ile herkese yayılır. |

> **Kritik:** Mesaj gönderiminin fanout'u backend'de tek yerden (`ChatService`) yapılır. Hub `SendMessage`
> kullansan da, REST `POST /send` kullansan da conversation grubundaki **herkes** `ReceiveMessage` alır —
> senin diğer cihazların dahil. Yani asla ikisini birden aynı mesaj için çağırma.

---

## 2. Bağlantı kurulumu (SignalR)

### 2.1 URL ve auth

Hub URL'i: **`/hubs/match`**. WebSocket transport `Authorization` header taşıyamadığı için JWT
**query string** ile gider: `?access_token=<JWT>`. Backend sadece `/hubs/*` path'inde query'den token okur.

```ts
import {
  HubConnectionBuilder,
  HubConnection,
  LogLevel,
  HttpTransportType,
} from "@microsoft/signalr";

function buildConnection(getToken: () => string): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${API_BASE}/hubs/match`, {
      accessTokenFactory: () => getToken(), // her (re)connect'te taze token
      // İsteğe bağlı: sadece WebSocket'e zorla (mobile'da long-polling fallback istenmezse)
      // transport: HttpTransportType.WebSockets,
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // exponential-ish backoff
    .configureLogging(LogLevel.Warning)
    .build();
}
```

**Server timeout'ları** (client'ın uyması gerekenler, `Program.cs`):
- `KeepAliveInterval` = 15 sn → server ping aralığı
- `ClientTimeoutInterval` = 60 sn → client bu sürede ping görmezse bağlantı ölü sayılır
- `MaximumReceiveMessageSize` = 8 KB → hub metoduna gönderdiğin payload cap'i (Content max 2000 char zaten)

### 2.2 Reconnect ve lifecycle

Bağlanınca backend `OnConnectedAsync`:
- Seni **tüm aktif conversation grupların**a (`conv:{id}`) ekler → mesaj/typing/read receipt akmaya başlar.
- Her partner'ının **presence grubu**na (`presence-of:{partnerId}`) ekler → online/offline event'leri gelir.
- İlk bağlantıysan (multi-tab değilse) partner'larına senin online olduğunu broadcast eder.

> Conversation listesi backend'de **5 dakika cache**'li. Reconnect sırasında son 5 dk içinde oluşan
> **yeni bir match** varsa grup listesinde olmayabilir → o match için `JoinConversation` çağır (bkz. §7).

```ts
connection.onreconnecting((err) => setConnState("reconnecting"));
connection.onreconnected(async (connId) => {
  setConnState("connected");
  // Reconnect'te kaçırılmış mesajlar olabilir → açık sohbetin geçmişini yeniden çek (cursor'un başından)
  // ve unread sayaçlarını tazele.
  await refetchActiveConversation();
  await refreshUnreadCounts();
});
connection.onclose((err) => setConnState("disconnected"));

await connection.start();
```

> **Kaçırılan mesaj garantisi:** SignalR "en fazla bir kez" teslim eder; disconnect anında gelen mesaj
> kaybolabilir. Reconnect sonrası **her zaman** açık sohbetin geçmişini yeniden çek. Kalıcı kaynak DB'dir,
> hub sadece canlı taşıma. Offline'ken gelen mesaj ayrıca push ile bildirilir.

---

## 3. Server → Client event'leri (dinlenecekler)

Tümü `connection.on("<EventName>", handler)` ile dinlenir.

| Event | Ne zaman | Payload (özet) |
|-------|----------|----------------|
| `ReceiveMessage` | Sohbete yeni mesaj düştü (herhangi biri gönderdi) | `MessageDto` (tam) |
| `MessageSent` | **Senin** gönderdiğin mesajın ack'i (sadece caller'a) | `MessageDto` (tam) |
| `MessagesRead` | Karşı taraf (veya sen başka cihazda) mesajları okudu | `{ conversationId, readAt, readByUserId, count, lastReadMessageId, lastReadSentAt }` |
| `MessageDelivered` | Bir mesaj alıcının cihazına ulaştı (✓✓) | `{ messageId, conversationId, deliveredAt, deliveredToUserId }` |
| `MessageEdited` | Bir mesaj düzenlendi | `MessageDto` (güncel) |
| `MessageDeleted` | Bir mesaj silindi | `{ messageId, conversationId, forEveryone, deletedAt }` |
| `ReactionsChanged` | Bir mesajın reaction'ları değişti | `{ messageId, conversationId, reactions: MessageReactionDto[] }` |
| `UserStartedTyping` | Partner yazmaya başladı | `{ conversationId, userId }` |
| `UserStoppedTyping` | Partner yazmayı bıraktı | `{ conversationId, userId }` |
| `UserStatusChanged` | Bir partner online/offline oldu | `{ userId, isOnline, connectedAt? , lastSeen? }` |
| `UserStatusResponse` | `CheckUserOnline` cevabı | `{ userId, isOnline }` |
| `MatchNotification` | Yeni match oluştu | `{ matchId, conversationId, matchedUserId, matchedUserName, matchedUserPhoto, matchedAt }` |
| `IncomingLike` | Biri seni beğendi (henüz match yok) | `{ likerUserId, likerDisplayName, likerPhotoUrl, isSuperLike, likedAt }` |
| `NewNotification` | Genel in-app bildirim | `{ id, type, title, body, relatedEntityId }` |
| `ForceLogout` | Aynı hesap başka cihazda login oldu | `{ reason: "new_login_elsewhere", at }` |
| `Error` | Hub metodu hata döndü | `{ code, message? }` |

```ts
function registerHandlers(conn: HubConnection, store: ChatStore) {
  conn.on("ReceiveMessage", (m: MessageDto) => store.upsertMessage(m));
  conn.on("MessageSent", (m: MessageDto) => store.reconcilePending(m)); // §5.2
  conn.on("MessagesRead", (e: MessagesReadEvent) => store.applyReadReceipt(e));
  conn.on("MessageDelivered", (e: MessageDeliveredEvent) => store.applyDelivered(e));
  conn.on("MessageEdited", (m: MessageDto) => store.upsertMessage(m));
  conn.on("MessageDeleted", (e: MessageDeletedEvent) => store.applyDeleted(e));
  conn.on("ReactionsChanged", (e: ReactionsChangedEvent) =>
    store.setReactions(e.messageId, e.reactions)
  );
  conn.on("UserStartedTyping", (e) => store.setTyping(e.conversationId, e.userId, true));
  conn.on("UserStoppedTyping", (e) => store.setTyping(e.conversationId, e.userId, false));
  conn.on("UserStatusChanged", (e) => store.setPresence(e.userId, e.isOnline, e.lastSeen));
  conn.on("MatchNotification", (e: MatchNotificationDto) => store.onNewMatch(e)); // §7
  conn.on("ForceLogout", () => authService.hardLogout());
  conn.on("Error", (e: HubError) => handleHubError(e)); // §9
}
```

---

## 4. Client → Server hub metotları (çağrılacaklar)

`connection.invoke("<Method>", ...args)`.

| Metot | Argümanlar | Etki |
|-------|-----------|------|
| `SendMessage` | `(conversationId: string, content: string, clientMessageId?: string)` | Mesaj gönderir. Caller `MessageSent` alır; grup `ReceiveMessage` alır. Not: hub SendMessage yalnızca **text** destekler; reply/media için REST `POST /send` kullan. |
| `MarkMessagesAsRead` | `(conversationId: string)` | Okunmamışları okundu işaretler, `MessagesRead` broadcast eder. |
| `MarkMessageDelivered` | `(messageId: string)` | Tek mesajı ✓✓ delivered yapar, `MessageDelivered` broadcast eder. |
| `StartTyping` | `(conversationId: string)` | `UserStartedTyping` broadcast (5 sn server TTL). |
| `StopTyping` | `(conversationId: string)` | `UserStoppedTyping` broadcast. |
| `CheckUserOnline` | `(targetUserId: string)` | `UserStatusResponse` ile cevap döner. |
| `JoinConversation` | `(conversationId: string)` | Yeni match'te gruba katılmak için (§7). |

> **Reply, media, image caption gibi zengin gönderimler hub `SendMessage`'da yok** — o metot 3 argümanlı
> ve sadece text. Reply/media için REST `POST /api/messages/send` kullan (aşağıda). Fanout yine hub'dan gelir.

---

## 5. Mesaj gönderme + optimistic UI

### 5.1 clientMessageId neden zorunlu (pratikte)

- **Idempotency:** Zayıf bağlantıda retry yaparsan, aynı `clientMessageId` ile ikinci istek yeni mesaj yaratmaz — backend mevcut mesajı döner (DB'de filtered unique index).
- **Optimistic reconcile:** Gönderdiğin anda listeye "pending" mesaj koyarsın; server `MessageSent`/`ReceiveMessage` içinde `clientMessageId`'yi geri yansıtır → hangi optimistic mesajı gerçek mesajla değiştireceğini bilirsin.

Her gönderimde bir UUID üret (ör. `crypto.randomUUID()`).

### 5.2 Optimistic akış (hub yolu)

```ts
async function sendText(convId: string, content: string) {
  const clientMessageId = crypto.randomUUID();

  // 1) Optimistic mesajı hemen ekle
  store.addPending({
    clientMessageId,
    conversationId: convId,
    content,
    sentAt: new Date().toISOString(),
    status: "sending",
    senderId: store.myUserId,
  });

  try {
    // 2) Hub üzerinden gönder
    await connection.invoke("SendMessage", convId, content, clientMessageId);
    // MessageSent event'i reconcilePending()'i tetikleyecek (aşağıda)
  } catch (err) {
    store.markPending(clientMessageId, "failed"); // UI "yeniden dene" gösterir
  }
}

// reconcile: server'dan tam MessageDto geldiğinde optimistic'i değiştir
function reconcilePending(m: MessageDto) {
  if (m.clientMessageId && store.hasPending(m.clientMessageId)) {
    store.replacePending(m.clientMessageId, { ...m, status: "sent" });
  } else {
    store.upsertMessage(m); // clientMessageId yoksa veya başka cihazdan → normal upsert
  }
}
```

> **Dikkat — çift event:** Kendi gönderdiğin mesaj için hem `MessageSent` (ack) hem `ReceiveMessage`
> (grup fanout) gelebilir. Her ikisi de aynı `clientMessageId`/`id` taşır. Store'un **id bazlı upsert**
> yapsın (aynı `id` iki kez eklenmesin) — idempotent merge şart.

### 5.3 REST yolu (reply / media / hub kapalıyken)

```
POST /api/messages/send
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "conversationId": "GUID",
  "content": "merhaba",           // text zorunlu; media'da caption (boş olabilir)
  "clientMessageId": "GUID",      // optional ama önerilir
  "replyToMessageId": "GUID",     // optional — quote
  "contentType": 0,               // 0=Text 1=Image 2=Voice 3=Video
  "mediaUrl": "https://<bucket>.s3.<region>.amazonaws.com/..."  // media'da zorunlu
}
```

Başarılı cevap: `ResponseDto { isSuccess: true, result: MessageDto }`. Fanout yine hub'dan gelir; REST cevabı
+ `ReceiveMessage`'ı **id ile** dedup et.

**Rate limit:** `POST /send` → kullanıcı başına **30 mesaj/dk** (hub `SendMessage` de aynı bucket). Aşılınca
hub'da `Error{ code: "RATE_LIMITED" }`, REST'te 429.

---

## 6. Media gönderimi (voice / image / video)

3 adım: presigned URL al → S3'e yükle → `mediaUrl` ile mesaj gönder.

```ts
// 1) Presigned PUT URL
const { result } = await api.post("/api/messages/upload-url", {
  conversationId: convId,
  contentType: "image/jpeg",   // "image/jpeg" | "image/png" | "audio/mp4" | "audio/aac"
  sizeBytes: file.size,
});
// result: { uploadUrl, mediaUrl, expiresAt }

// 2) Dosyayı doğrudan S3'e PUT et (backend'e değil!)
await fetch(result.uploadUrl, {
  method: "PUT",
  headers: { "Content-Type": "image/jpeg" },
  body: file,
});

// 3) Mesajı canonical mediaUrl ile gönder
await api.post("/api/messages/send", {
  conversationId: convId,
  content: "",                       // caption opsiyonel
  clientMessageId: crypto.randomUUID(),
  contentType: 1,                    // Image
  mediaUrl: result.mediaUrl,         // §5.3'teki mediaUrl (uploadUrl DEĞİL)
});
```

> `mediaUrl` mutlaka backend'in beklediği S3 bucket prefix'iyle başlamalı (`https://{bucket}.s3.{region}.amazonaws.com/`);
> başka URL SSRF/exfil koruması nedeniyle reddedilir (`ArgumentException` → 400).

---

## 7. Yeni match anında sohbete katılma

Match olur olmaz partner **anında mesaj** atabilir. Bağlantı zaten açıksa ama grup listesi bu yeni
conversation'ı içermiyorsa `ReceiveMessage`'ı kaçırırsın. Çözüm:

```ts
conn.on("MatchNotification", async (m: MatchNotificationDto) => {
  store.onNewMatch(m);
  if (m.conversationId) {
    await conn.invoke("JoinConversation", m.conversationId);
    // artık conv:{id} + presence-of:{partner} gruplarındasın → mesaj/presence akar
  }
});
```

`JoinConversation` idempotent'tir ve backend'in 5-dk conversation cache'ini invalidate eder.

---

## 8. Okundu / İletildi state machine

Bir mesajın alıcı tarafındaki yaşam döngüsü:

```
   gönderildi          cihaza ulaştı            görüldü
   (SentAt)     ──►    (DeliveredAt, ✓✓)  ──►   (ReadAt, mavi ✓✓)
```

| Alan | Kim set eder | Nasıl |
|------|--------------|-------|
| `sentAt` | Server (gönderim anı) | Her mesajda dolu |
| `deliveredAt` | Alıcı cihaz | `ReceiveMessage` handler'ında `MarkMessageDelivered(messageId)` çağır |
| `readAt` | Alıcı, sohbeti açınca | `MarkMessagesAsRead(convId)` çağır |

**Alıcı tarafı davranışı:**

```ts
conn.on("ReceiveMessage", async (m: MessageDto) => {
  store.upsertMessage(m);
  if (m.senderId !== store.myUserId) {
    // Cihaza ulaştı → delivered işaretle (idempotent)
    conn.invoke("MarkMessageDelivered", m.id).catch(() => {});
    // Sohbet ekranı açık ve görünürse → okundu işaretle
    if (store.isConversationVisible(m.conversationId)) {
      conn.invoke("MarkMessagesAsRead", m.conversationId).catch(() => {});
    }
  }
});
```

**`MessagesRead` işleme (gönderen tarafı):** Event `lastReadMessageId` + `lastReadSentAt` taşır. `sentAt <= lastReadSentAt`
olan **tüm** kendi mesajlarını "okundu" yap — sadece `count` kadar değil (race-safe):

```ts
function applyReadReceipt(e: MessagesReadEvent) {
  store.messages
    .filter(m => m.conversationId === e.conversationId
             && m.senderId === store.myUserId
             && new Date(m.sentAt) <= new Date(e.lastReadSentAt))
    .forEach(m => store.setReadAt(m.id, e.readAt));
}
```

> **Read receipt gizliliği:** Kullanıcı `ShowReadReceipts=false` yaptıysa (bkz. §12), okuduğu mesajlar
> DB'de `ReadAt` alır (unread sayacı için) **ama** karşı tarafa `MessagesRead` broadcast **edilmez**.
> Sadece kendi diğer cihazlarına gider. WhatsApp mantığı — partner "okundu" göremez.

---

## 9. Typing indicator

```ts
let typingTimer: ReturnType<typeof setTimeout> | null = null;

function onInputChange(convId: string, text: string) {
  if (!typingStarted) {
    conn.invoke("StartTyping", convId).catch(() => {});
    typingStarted = true;
  }
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    conn.invoke("StopTyping", convId).catch(() => {});
    typingStarted = false;
  }, 3000); // 3 sn boşluk → durdu say
}

function onSend() {
  conn.invoke("StopTyping", convId).catch(() => {});
  typingStarted = false;
}
```

**Server tarafı safety net:** Typing 5 sn Redis TTL'e sahip; `StopTyping`'i kaçırsan ya da disconnect
olsan bile backend otomatik "durdu" broadcast eder. Yine de client'ın `StopTyping` göndermesi UX için önemli.

**Rate limit:** Typing 60 start/stop / dk. Debounce (yukarıdaki 3 sn) bunu rahat karşılar.

---

## 10. Presence (online / offline)

- Online durumu **sadece eşleştiğin kullanıcılar** için görünür (yabancının presence'ini alamazsın — gizlilik).
- Sohbet listesinde her partner'ın anlık durumu `partnerIsOnline` alanında **hazır gelir** (ekstra sorgu yok).
- Canlı değişimler `UserStatusChanged` event'i ile gelir (`isOnline`, offline'da `lastSeen`).
- Tek seferlik sorgu gerekirse `CheckUserOnline(userId)` → `UserStatusResponse`.

```ts
conn.on("UserStatusChanged", (e) => {
  store.setPresence(e.userId, e.isOnline, e.lastSeen ?? null);
});
```

> Multi-tab: kullanıcı 3 tab açsa bile partner'a **tek** "online" broadcast gider; son tab kapanınca **tek**
> "offline" gider. Client tarafında ekstra debounce gerekmez.

---

## 11. Conversation listesi & geçmiş

### 11.1 Liste

```
GET /api/messages/conversations
→ ConversationListItemDto[]
```

Her item: `conversationId`, `matchId`, `partnerUserId`, `partnerDisplayName`, `partnerProfileImageUrl`,
`lastMessagePreview`, `lastMessageAt`, `unreadCount`, `isActive`, `partnerIsOnline`. `lastMessageAt` DESC sıralı.

`isActive=false` → sohbet unmatch edilmiş/kapatılmış (bkz. §14).

### 11.2 Geçmiş — cursor pagination (yeni client'lar için)

```
GET /api/messages/conversations/{id}/history-cursor?pageSize=30
GET /api/messages/conversations/{id}/history-cursor?cursor=<opaque>&pageSize=30
→ { conversationId, messages: MessageDto[], nextCursor, hasMore }
```

- İlk istek: cursor yok → **en yeni** `pageSize` mesaj (DESC).
- Sonraki (yukarı scroll): önceki response'un `nextCursor`'ını gönder → daha eski mesajlar.
- `nextCursor == null` ⇒ daha eski mesaj yok.
- Cursor **opaque** base64 — parse etme, sadece "aldığın cursor → sıradaki istek" olarak taşı.

```ts
async function loadOlder(convId: string, cursor: string | null) {
  const q = new URLSearchParams({ pageSize: "30" });
  if (cursor) q.set("cursor", cursor);
  const { result } = await api.get(
    `/api/messages/conversations/${convId}/history-cursor?${q}`
  );
  // messages en yeni→eski; UI'da reverse edip üste ekle
  store.prependMessages(convId, result.messages.slice().reverse());
  return result.nextCursor as string | null;
}
```

### 11.3 Geçmiş — offset pagination (legacy)

```
GET /api/messages/conversations/{id}/history?page=1&pageSize=30
→ { conversationId, messages, totalCount, page, pageSize, hasMore }
```

Yeni ekranlarda cursor'u tercih et (offset büyük sohbetlerde yavaşlar + race'te mesaj kaçırır).

### 11.4 Arama

```
GET /api/messages/conversations/{id}/search?q=keyword&limit=50
→ { conversationId, matches: MessageDto[], totalCount }
```

`q` en az 2 karakter. System mesajları ve silinmişler dahil edilmez.

---

## 12. Chat quota ekonomisi (30-mesaj cap + unlock)

**Kural:** İki taraf da **aktif premium** değilse, sohbet başına **30 mesaj** gönderim limiti vardır.
(`FreeMessageLimit = 30` — canonical backend değeri.) Limit dolunca gönderim reddedilir; sohbet ancak
**Chat Unlock consumable** ile ya da iki tarafın da premium olmasıyla açılır.

### 12.1 Durum sorgulama

```
GET /api/messages/conversations/{id}/quota
→ ChatQuotaStatusDto {
    conversationId, isUnlocked, bothPremium,
    messageCount, freeMessageLimit,
    remainingMessages,  // bothPremium || isUnlocked ise null (sınırsız)
    requiresUnlock      // true ise paywall göster
  }
```

Sohbet açılışında bunu çek → `remainingMessages` düşükse counter/uyarı göster ("3 mesaj kaldı").

### 12.2 Limit dolunca (gönderim reddi)

**Hub yolu:** `Error` event'i gelir:
```json
{ "code": "CHAT_QUOTA_EXHAUSTED", "message": "...", "paywallType": "CHAT_QUOTA_EXHAUSTED", "showPaywall": true }
```

**REST yolu:** HTTP **402 Payment Required**:
```json
{ "isSuccess": false, "message": "...", "result": { "showPaywall": true, "paywallType": "CHAT_QUOTA_EXHAUSTED" } }
```

Her ikisinde de → o `paywallType`'a uygun paywall aç.

### 12.3 Unlock akışı

1. Kullanıcı Chat Unlock consumable'ı **RevenueCat SDK ile** satın alır (backend satın almaz).
2. Purchase başarılı → `transactionId` ile backend'i çağır:

```
POST /api/messages/conversations/{id}/unlock
{ "transactionId": "<RC transaction id>" }
```

3. Cevaplar:
   - **200** → kilit açıldı, gönderime devam.
   - **402** → satın alma henüz webhook ile doğrulanmadı → birkaç sn backoff ile **retry** et.
   - **403** → bu sohbetin katılımcısı değilsin.

Idempotent: aynı `transactionId` iki kez unlock yapmaz. Detaylı RC akışı için premium rehberi.

---

## 13. Reply / Edit / Delete / Reaction

### 13.1 Reply
`POST /api/messages/send` içinde `replyToMessageId` ver (§5.3). Yanıtlanan mesaj aynı sohbette ve silinmemiş
olmalı. Dönen `MessageDto.replyTo` bir `ReplyPreviewDto` taşır (kim, önizleme, tip, silinmiş mi).

### 13.2 Edit (15 dk pencere, sadece text, sadece kendi mesajın)
```
PATCH /api/messages/{id}
{ "content": "düzeltilmiş metin" }
→ MessageDto (editedAt dolu)  +  hub "MessageEdited"
```
UI `editedAt` doluysa "(düzenlendi)" göstersin. Pencere dolduysa / media / başkasının mesajı → 400.

### 13.3 Delete
```
DELETE /api/messages/{id}?forEveryone=true
→ MessageDto  +  hub "MessageDeleted"
```
- `forEveryone=false` (default): sadece sende gizlenir ("delete for me"), partner görmeye devam eder.
- `forEveryone=true`: herkeste "Bu mesaj silindi" — `content` boşalır, `mediaUrl` null olur.
- Idempotent; `forEveryone` tek yönlü upgrade (false→true olur, tersi olmaz).

`MessageDeleted` event'inde `forEveryone` alanına göre UI davranışını seç.

### 13.4 Reaction
```
POST   /api/messages/{id}/reactions      { "emoji": "❤️" }
DELETE /api/messages/{id}/reactions?emoji=❤️
→ MessageReactionDto[]  +  hub "ReactionsChanged"
```
Emoji 1–16 karakter. Aynı kullanıcı aynı emoji'yi iki kez eklerse idempotent. `ReactionsChanged` event'i
mesajın **tüm** reaction'larının güncel halini taşır → `store.setReactions(messageId, reactions)` ile replace et.

---

## 14. Unmatch / restore / kapatılmış sohbet

```
DELETE /api/messages/conversations/{id}
→ { restorableUntil }   // soft unmatch, 24 saat geri alınabilir
```
- Sohbet `isActive=false` olur; karşı taraf "kapalı" görür ama "kalıcı silindi" **görmez** (24 saat).
- Sadece unmatch eden taraf geri alabilir:
```
POST /api/messages/conversations/{id}/restore
→ 200 (başarı) veya 400 (pencere doldu / bulunamadı)
```
- Kapalı sohbette: mesaj gönderilemez (`CONVERSATION_ERROR` / 400), typing akmaz, mark-read no-op.
- 24 saat sonra backend job kalıcı yapar + "Bu sohbet sonlandırıldı." **system message** bırakır.

---

## 15. System mesajları & i18n

`isSystemMessage=true` mesajlar: `senderId=null`, `systemMessageType` ∈ `MatchCreated | IceBreakerSent | ConversationDeleted`.
`localizationKey` doluysa (`system.match_created` vb.) UI **`content` yerine bu key'i** locale'e göre çevirsin;
`content` sadece fallback. Bu mesajlara reaction/edit/delete uygulanmaz.

`isSenderDeleted=true` (senderId null + system değil) → KVKK ile hesabı silinmiş kullanıcı; UI "Silinmiş Kullanıcı" göstersin.

---

## 16. Bildirimler (offline / arka plan)

Sen offline'ken (veya sohbet kapalıyken) gelen mesajlar **push notification** ile bildirilir.

### 16.1 Device token kaydı
```
POST /api/notifications/devices
{ "token": "<FCM token>", "platform": 0 /*iOS/Android enum*/, "appVersion": "1.2.0" }
```
Login sonrası / push izni alınınca kaydet. Logout'ta:
```
DELETE /api/notifications/devices/{token}
```

### 16.2 In-app bildirim feed'i
```
GET  /api/notifications?page=1&pageSize=30       → { items: AppNotificationDto[], totalCount, hasMore }
GET  /api/notifications/unread-count             → { unreadCount }
PUT  /api/notifications/{id}/read
PUT  /api/notifications/read-all
```
> **Önemli:** `NotificationKind.Message` bildirimleri bu feed'de **görünmez** — mesajlar sohbet ekranında
> yaşar, notification center'ı doldurmaz. Feed'de match/like/superlike/system/missed-match yaşar.
> `relatedEntityId` deep-link target'ıdır (conversationId / matchId / userId).

### 16.3 Bildirim tercihleri
```
GET /api/notifications/preferences         → NotificationPreferencesDto
PUT /api/notifications/preferences         (full replace — tüm alanlar zorunlu)
```
Alanlar: `matchAlerts, messageAlerts, likeAlerts, superLikeAlerts, systemAlerts, missedMatchAlerts,
skipPushWhenOnline, showReadReceipts`. `showReadReceipts=false` → §8'deki read-receipt gizliliği devreye girer.
`skipPushWhenOnline=true` → aktif bağlıyken push gönderilmez (sadece SignalR).

### 16.4 Unread rozetleri (mesaj)
```
GET /api/messages/unread-count               → { unreadCount }            // toplam
GET /api/messages/unread-per-conversation    → [{ conversationId, unreadCount }]  // sadece >0 olanlar
```

---

## 17. Hata kodları

### Hub `Error` event kodları
| code | Anlam | Frontend aksiyonu |
|------|-------|-------------------|
| `INVALID_CONVERSATION_ID` | Geçersiz GUID | İstemci bug'ı — logla |
| `INVALID_CLIENT_MESSAGE_ID` | clientMessageId GUID değil | UUID üret |
| `RATE_LIMITED` | 30 msg/dk (veya typing/read limiti) aşıldı | Kısa süre bekle, backoff |
| `CHAT_QUOTA_EXHAUSTED` | 30-mesaj cap doldu | Paywall + unlock (§12) |
| `FORBIDDEN` | Bu sohbete yetkin yok | Ekranı kapat |
| `INVALID_INPUT` | Boş içerik / validasyon | Kullanıcıya göster |
| `CONVERSATION_ERROR` | Sohbet kapalı / bulunamadı | Listeyi tazele |
| `JOIN_FAILED` | JoinConversation başarısız | Retry / reconnect |

### REST HTTP kodları
| Kod | Durum |
|-----|-------|
| 200 | OK — `ResponseDto.result` içinde veri |
| 400 | Validasyon / iş kuralı (`result.message`) |
| 402 | Chat quota doldu **veya** unlock henüz doğrulanmadı (retry) |
| 403 | Yetki yok (sohbet üyesi değilsin) |
| 404 | Sohbet/mesaj bulunamadı |
| 429 | Rate limit (send: 30/dk, mark-read, device_register) |

Tüm REST cevapları `ResponseDto` zarfında: `{ isSuccess, result, message, statusCode }`.

---

## 18. TypeScript tipleri

```ts
// ---- Enum'lar ----
export enum MessageContentType { Text = 0, Image = 1, Voice = 2, Video = 3, System = 99 }
export enum SystemMessageType { MatchCreated = 0, IceBreakerSent = 1, ConversationDeleted = 2 }
export enum NotificationKind {
  Match = 0, Message = 1, Like = 2, SuperLike = 3, System = 4,
  MissedMatch = 5, TrialEndingSoon = 6, PremiumExpiringSoon = 7,
}
export enum DevicePlatform { iOS = 0, Android = 1 } // backend enum sırasını doğrula

// ---- Çekirdek mesaj DTO ----
export interface MessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderDisplayName: string | null;
  senderProfileImageUrl: string | null;
  content: string;
  sentAt: string;              // ISO 8601 UTC
  readAt: string | null;
  isSystemMessage: boolean;
  systemMessageType: SystemMessageType | null;
  clientMessageId: string | null;
  isSenderDeleted: boolean;
  contentType: MessageContentType;
  mediaUrl: string | null;
  deliveredAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  deletedForEveryone: boolean;
  replyTo: ReplyPreviewDto | null;
  reactions: MessageReactionDto[];
  localizationKey: string | null;
}

export interface ReplyPreviewDto {
  id: string;
  senderId: string | null;
  senderDisplayName: string | null;
  contentPreview: string;
  contentType: MessageContentType;
  isDeleted: boolean;
}

export interface MessageReactionDto {
  emoji: string;
  count: number;
  userIds: string[];
}

// ---- Liste & geçmiş ----
export interface ConversationListItemDto {
  conversationId: string;
  matchId: number;
  partnerUserId: string;
  partnerDisplayName: string;
  partnerProfileImageUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isActive: boolean;
  partnerIsOnline: boolean;
}

export interface ChatHistoryCursorResponseDto {
  conversationId: string;
  messages: MessageDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ChatHistoryResponseDto {
  conversationId: string;
  messages: MessageDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface MessageSearchResultDto {
  conversationId: string;
  matches: MessageDto[];
  totalCount: number;
}

// ---- Quota ----
export interface ChatQuotaStatusDto {
  conversationId: string;
  isUnlocked: boolean;
  bothPremium: boolean;
  messageCount: number;
  freeMessageLimit: number;
  remainingMessages: number | null;  // sınırsızsa null
  requiresUnlock: boolean;
}

// ---- Hub event payload'ları ----
export interface MessagesReadEvent {
  conversationId: string;
  readAt: string;
  readByUserId: string;
  count: number;
  lastReadMessageId: string | null;
  lastReadSentAt: string | null;
}
export interface MessageDeliveredEvent {
  messageId: string;
  conversationId: string;
  deliveredAt: string;
  deliveredToUserId: string;
}
export interface MessageDeletedEvent {
  messageId: string;
  conversationId: string;
  forEveryone: boolean;
  deletedAt: string;
}
export interface ReactionsChangedEvent {
  messageId: string;
  conversationId: string;
  reactions: MessageReactionDto[];
}
export interface UserStatusChangedEvent {
  userId: string;
  isOnline: boolean;
  connectedAt?: string;
  lastSeen?: string;
}
export interface MatchNotificationDto {
  matchId: number;
  conversationId: string | null;
  matchedUserId: string;
  matchedUserName: string;
  matchedUserPhoto: string | null;
  matchedAt: string;
}
export interface HubError { code: string; message?: string; paywallType?: string; showPaywall?: boolean }

// ---- Bildirimler ----
export interface AppNotificationDto {
  id: string;
  title: string;
  body: string;
  type: NotificationKind;
  relatedEntityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationPreferencesDto {
  matchAlerts: boolean;
  messageAlerts: boolean;
  likeAlerts: boolean;
  superLikeAlerts: boolean;
  systemAlerts: boolean;
  missedMatchAlerts: boolean;
  skipPushWhenOnline: boolean;
  showReadReceipts: boolean;
}

// ---- Genel REST zarfı ----
export interface ResponseDto<T = unknown> {
  isSuccess: boolean;
  result: T;
  message?: string;
  statusCode: number;
}
```

---

## 19. Endpoint & event referans tablosu

### REST (`/api/messages`)
| Method | Path | Amaç |
|--------|------|------|
| GET | `/conversations` | Sohbet listesi |
| GET | `/conversations/{id}/history-cursor` | Geçmiş (cursor, önerilen) |
| GET | `/conversations/{id}/history` | Geçmiş (offset, legacy) |
| POST | `/send` | Mesaj gönder (reply/media dahil) |
| GET | `/conversations/{id}/quota` | Quota durumu |
| POST | `/conversations/{id}/unlock` | Chat unlock redeem |
| POST | `/conversations/{id}/mark-read` | Okundu (hub'a alternatif) |
| GET | `/unread-count` | Toplam okunmamış |
| GET | `/unread-per-conversation` | Sohbet başına okunmamış |
| DELETE | `/conversations/{id}` | Unmatch (soft) |
| POST | `/conversations/{id}/restore` | Unmatch geri al (24h) |
| PATCH | `/{id}` | Mesaj düzenle |
| DELETE | `/{id}?forEveryone=` | Mesaj sil |
| POST | `/{id}/reactions` | Reaction ekle |
| DELETE | `/{id}/reactions?emoji=` | Reaction sil |
| POST | `/{id}/delivered` | Delivered işaretle (hub'a alternatif) |
| GET | `/conversations/{id}/search?q=` | Sohbet içi arama |
| POST | `/upload-url` | Media presigned URL |

### REST (`/api/notifications`)
| Method | Path | Amaç |
|--------|------|------|
| GET | `/` | Bildirim feed'i |
| GET | `/unread-count` | Okunmamış bildirim sayısı |
| PUT | `/{id}/read` · `/read-all` | Okundu işaretle |
| POST/DELETE | `/devices` · `/devices/{token}` | Push token kaydı |
| GET/PUT | `/preferences` | Bildirim tercihleri |

### Hub (`/hubs/match`)
**Çağır (invoke):** `SendMessage`, `MarkMessagesAsRead`, `MarkMessageDelivered`, `StartTyping`, `StopTyping`, `CheckUserOnline`, `JoinConversation`
**Dinle (on):** `ReceiveMessage`, `MessageSent`, `MessagesRead`, `MessageDelivered`, `MessageEdited`, `MessageDeleted`, `ReactionsChanged`, `UserStartedTyping`, `UserStoppedTyping`, `UserStatusChanged`, `UserStatusResponse`, `MatchNotification`, `IncomingLike`, `NewNotification`, `ForceLogout`, `Error`

---

## 20. Kontrol listesi (implementasyon)

- [ ] Login sonrası tek SignalR bağlantısı (`?access_token`), `withAutomaticReconnect`.
- [ ] `onreconnected` → açık sohbetin geçmişini + unread sayaçlarını tazele.
- [ ] Tüm §3 event handler'ları kayıtlı; store **id bazlı idempotent upsert**.
- [ ] Her gönderimde `clientMessageId` (UUID) + optimistic pending + `MessageSent` reconcile.
- [ ] `ReceiveMessage`'da: `MarkMessageDelivered`, sohbet görünürse `MarkMessagesAsRead`.
- [ ] `MessagesRead`'i `lastReadSentAt`'e göre uygula (count'a göre değil).
- [ ] Typing debounce (3 sn) + `onSend`'de `StopTyping`.
- [ ] `MatchNotification` → `JoinConversation`.
- [ ] Quota: sohbet açılışında `GET /quota`; 402 / `CHAT_QUOTA_EXHAUSTED` → paywall + unlock.
- [ ] Media: upload-url → S3 PUT → `mediaUrl` ile send.
- [ ] Edit/delete/reaction event'leri store'a uygulanıyor.
- [ ] `isActive=false` sohbette gönderim/typing kapalı; restore CTA.
- [ ] System mesajlarda `localizationKey` çevirisi; `isSenderDeleted` → "Silinmiş Kullanıcı".
- [ ] Push token kaydı (login) + silme (logout); `Message` tipi feed'den ayrı.
- [ ] `ForceLogout` → hard logout.
```
