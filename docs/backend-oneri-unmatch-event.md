# Öneri: Unmatch / restore anında karşı tarafa hub event'i (`ConversationDeactivated` / `ConversationRestored`)

**Kimden:** Frontend
**Tarih:** 2026-08-14
**Konu:** Eşleşmeyi kaldıran taraf dışındaki kullanıcı, sohbetin kapandığını uygulama açıkken hiçbir şekilde öğrenemiyor — sohbet aktif görünmeye, composer yazılabilir kalmaya devam ediyor
**İlgili FE dosyaları:** `src/features/chat/realtimeService.ts`, `src/navigation/AppNavigator.tsx`,
`src/features/chat/chatSlice.ts`, `src/features/chat/screens/ChatScreen.tsx`,
`src/features/chat/screens/MessagesScreen.tsx`
**İlgili kontrat:** `frontend_chat_integration_guide.md` §3 (event tablosu), §14 (unmatch/restore), §17 (hata kodları)

---

## TL;DR

| # | İstek | Aciliyet |
|---|---|---|
| 1 | `DELETE /api/messages/conversations/{id}` → `conv:{id}` grubuna **`ConversationDeactivated { conversationId, deactivatedAt }`** | Yüksek |
| 2 | Aynı event, sohbeti kapatan **diğer** yollardan da yayınlansın: engelleme, hesap silme, yaptırım (ban/askı) | Yüksek — aksi halde aynı bug başka kapıdan geri gelir |
| 3 | `POST /api/messages/conversations/{id}/restore` → **`ConversationRestored { conversationId }`** | Orta |
| 4 | Hub `Error` payload'ına `conversationId` eklensin → `{ code, message?, conversationId? }` | Orta |

Event **sessiz** olsun: push bildirimi, in-app feed kaydı, sistem mesajı istemiyoruz.
Tek amacı istemcideki `isActive` durumunu senkronlamak. ("X seni sildi" bildirimi istemiyoruz.)

---

## 1. Gözlenen davranış

İki gerçek cihaz, aralarında aktif sohbet:

1. **B** kullanıcısı eşleşmeyi kaldırıyor (`DELETE /conversations/{id}`).
2. **A**'nın uygulaması açık ve sohbet ekranında. Hiçbir şey değişmiyor: Mesajlar listesinde
   sohbet aktif, "Kapalı" sekmesine düşmüyor, composer yazılabilir.
3. **A** mesaj yazıp gönderiyor → balon "gönderiliyor" durumunda **sonsuza kadar asılı kalıyor**.
4. Ancak uygulama tamamen kapatılıp açıldığında durum düzeliyor.

3. adımın sebebi: hub `SendMessage` bu durumda invoke'u reddetmiyor, ayrı bir
`Error{ code: "CONVERSATION_ERROR" }` event'i yayınlıyor; `MessageSent` ack'i hiç gelmediği için
optimistic balon `pending` kalıyor.

## 2. Neden mevcut yollar yetmiyor

**2a. Event yok.** §3'teki server→client event tablosunda unmatch'in karşılığı yok. §14 sadece
"sohbet `isActive=false` olur; karşı taraf kapalı görür" diyor — *ne zaman* göreceğini söylemiyor,
çünkü bunu bildiren bir sinyal yok.

**2b. `/conversations` pull'u ekrandaki kullanıcıya yetişmiyor.** FE listeyi boot'ta, ekran
odaklandığında, foreground'a dönüşte ve hub reconnect'te çekiyor. Kullanıcı sohbette oturuyorsa
bunların **hiçbiri** tetiklenmiyor. Periyodik yoklama eklemek istemiyoruz: aktif sohbet başına
dakikalık `GET /conversations` trafiği, tek bir event'in yerine geçmek için çok pahalı.

**2c. `Error{CONVERSATION_ERROR}` reaktif ve eksik.** Yalnız kullanıcı bir şey göndermeye
çalışırsa geliyor — yani hatayı ancak "mesajım gitmedi" deneyimini yaşadıktan sonra öğreniyor.
Üstelik payload'da `conversationId` yok (bkz. istek 4), FE aktif sohbet tahminine düşüyor.

**2d. 24 saatlik job'ın bıraktığı sistem mesajı çok geç.** §14'teki `ConversationDeleted` sistem
mesajı kalıcılaşma anında düşüyor; arada geçen 24 saat boyunca UI yanlış durumu gösteriyor.

## 3. İstenen sözleşme

```
// SERVER → CLIENT — grup: conv:{conversationId}
ConversationDeactivated {
  conversationId: string,     // GUID
  deactivatedAt:  string      // ISO-8601 UTC
}

ConversationRestored {
  conversationId: string
}
```

`deactivatedBy` (kapatan kullanıcının id'si) eklenirse FE kullanır ama **zorunlu değil**:
"sen mi kapattın, o mu" ayrımını istemci zaten kendi aksiyonundan biliyor.
`restorableUntil` **istemiyoruz** — geri alma yalnız kapatan tarafta ve o taraf değeri REST
cevabından zaten alıyor.

### 3.1 Kimin alacağı

`Clients.Group($"conv:{conversationId}")` — yani her iki taraf ve **tüm cihazları**. Kapatan
tarafın diğer cihazları da böylece aynı anda düzelir (bugün onlar da bayat kalıyor).

> **Dikkat — sıralama:** Unmatch işlemi sırasında grup üyeliği bozuluyorsa (connection'lar
> `conv:{id}` grubundan çıkarılıyor ya da conversation cache invalidate edilip yeniden
> kuruluyorsa) event **grup bozulmadan önce** yayınlanmalı; sonra yayınlanırsa kimseye gitmez.
> Bu riski almak istemezseniz `Clients.Users([userAId, userBId])` da bizim için aynı işi görür.

Event, DB transaction **commit edildikten sonra** atılsın: istemci event'i alır almaz
`GET /conversations` ile doğrulama yapıyor, commit'ten önce atılan event bayat liste döndürür.

### 3.2 Hangi noktalarda yayınlanmalı (istek 2)

Sohbeti kapatan her yol aynı event'i atsın — FE tarafında hepsinin sonucu aynı:

| Tetikleyen | Bugünkü davranış | İstenen |
|---|---|---|
| `DELETE /conversations/{id}` (unmatch) | sessiz | `ConversationDeactivated` |
| Kullanıcı engelleme | sessiz | `ConversationDeactivated` (engellenen tarafa) |
| Hesap silme (KVKK) | sistem mesajı, gecikmeli | `ConversationDeactivated` |
| Ban / askı (yaptırım) | sessiz | `ConversationDeactivated` |
| `POST /conversations/{id}/restore` | sessiz | `ConversationRestored` |

## 4. `Error` payload'ına `conversationId` (istek 4)

Bugün: `{ code, message?, paywallType?, showPaywall? }`. Hangi sohbetin hata verdiği yazmıyor,
bu yüzden FE "hata aktif sohbete aittir" varsayımıyla çalışıyor. Tek alanlık ekleme bu tahmini
kaldırır ve arka plandaki bir sohbetten gelen hatayı da doğru hedefe yazmamızı sağlar.
`CHAT_QUOTA_EXHAUSTED` ve `RATE_LIMITED` için de aynı şekilde faydalı.

## 5. FE tarafında durum

**Hazır olan:** `chatSlice.conversationDeactivated` reducer'ı — sohbeti `isActive=false` yapıp
"gönderiliyor"da asılı balonları başarısıza çeviriyor. Event geldiğinde bağlanması tek satır:

```ts
realtimeService.on('ConversationDeactivated', ({ conversationId }) =>
  dispatch(conversationDeactivated({ conversationId })),
);
```

**Şu an yürürlükte olan geçici çözümler** (backend beklemeden konuldu):

- `Error{ CONVERSATION_ERROR | FORBIDDEN }` → sohbeti yerel pasife çek + `fetchConversations(force)`
- REST gönderiminde 403/404 → aynısı; 400 → listeyi sunucudan doğrulat
- Mesajlar ve Chat ekranlarında odaklanma başına liste doğrulaması (15sn staleness gate'li)
- Hub gönderimlerine 12 sn ack zaman aşımı (balon sonsuza kadar "gönderiliyor"da kalmasın)

Event geldiğinde bunların hepsi **yedek katman** olarak kalabilir; ack zaman aşımı zaten ayrı bir
güvenlik ağı (kaçan `Error` event'i, ölü soket vb.). Kapanmayan tek boşluk şu:
**kullanıcı sohbette oturup hiçbir şey göndermiyorsa durumu ancak ekrandan çıkıp girince ya da
uygulamayı arka plandan geri getirince görüyor.** Onu yalnız bu event kapatır.

## 6. Kabul kriterleri

- [ ] A ve B sohbette; B unmatch eder → A'nın ekranı **saniyeler içinde** kapalı duruma geçer
      (composer kilitli, Mesajlar listesinde "Kapalı" sekmesine düşer) — A hiçbir şey göndermeden.
- [ ] B'nin ikinci cihazı da aynı anda güncellenir.
- [ ] B restore eder → A'da sohbet tekrar aktif olur (`ConversationRestored`).
- [ ] Event **push üretmez**, bildirim feed'ine kayıt düşmez, sistem mesajı oluşturmaz.
- [ ] Event, DB commit'inden sonra ve grup üyeliği bozulmadan önce yayınlanır.
- [ ] Kapalı sohbete gönderimde dönen `Error` payload'ı `conversationId` taşır.

## 7. Özet karar tablosu

| Karar | Seçim | Gerekçe |
|---|---|---|
| Taşıma | Hub event (`conv:{id}` grubu) | Kullanıcı ekranda kalırken tek gerçek-zamanlı yol; polling pahalı |
| Payload | `{ conversationId, deactivatedAt }` | FE'nin ihtiyacı bu kadar; `restorableUntil` kapatan tarafta zaten var |
| Bildirim | **Yok** — sessiz event | "Seni sildi" bildirimi istenmiyor; amaç yalnız UI senkronu |
| Kapsam | Unmatch + engelleme + silme + yaptırım | Hepsi aynı sonucu doğuruyor, tek event ile karşılanır |
| Zamanlama | Commit sonrası, grup bozulmadan önce | Bayat liste / kimseye ulaşmayan event riskini kaldırır |
