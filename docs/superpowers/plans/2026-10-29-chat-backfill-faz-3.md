# Chat Faz 3 — Arşivi geri doldurma (backfill) Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her sohbetin sunucuda duran tüm geçmişini arka planda, devam
ettirilebilir ve **kullanıcının kendi okumalarına yer bırakacak** biçimde diske
indirmek — böylece yukarı kaydırma ağa çıkmayı bırakır ve Faz 4'ün araması
yarım cevap vermez.

**Architecture:** Saf seçim/tempo kararları `backfillPolicy.ts`'te, yan etkili
tur `chatBackfill.ts`'te. Tur **Redux'u hiç görmez**: `chatService
.getMessageHistory` + `repo.applyHistoryPage` ile doğrudan diske yazar.
İlerleme `sync_state`'te ama **ekranın cursor'ından AYRI kolonlarda** (v8),
çünkü budama ekranın cursor'ını NULL'luyor. Tempo sabit tavanla değil
**sunucunun bildirdiği kalan kotayla** ayarlanır.

**Tech Stack:** TypeScript, expo-sqlite (senkron API), axios, jest +
better-sqlite3 (`expo-sqlite` mock'u üzerinden gerçek SQL).

**Spec:** [chat_local_first_roadmap_2026-10.md](../../../chat_local_first_roadmap_2026-10.md) — Faz 3

## Backend'den gelen ve bu planı belirleyen kısıt (2026-10-29)

`MessagesController` sınıf seviyesinde `[RateLimit("messaging_default")]`
taşıyor: **200 istek / 60 saniye, tüm controller'da PAYLAŞIMLI** — mesaj
geçmişi sayfalama, `/changes`, reveal-history, silme ve tepkiler aynı kovada.
Partition kullanıcı başına.

Sonuçları:
- Sabit 400 ms aralık sürdürülürse dakikada 150 istek, yani kovanın %75'i.
  Kullanıcı o sırada kendi sohbetini açıyorsa **o** 429 yer. Bu yüzden tempo
  sabit olamaz.
- Sayaç handler'dan ÖNCE, sonuçtan bağımsız yazılıyor; ama **429 slot
  harcamıyor**, yani 429 fırtınası kendini uzatmıyor.
- Sunucu her yanıtta `X-RateLimit-Remaining` ve 429'da `Retry-After` +
  `retryAfterSeconds` döndürüyor. Tempo bunlardan okunur.
- 429 gövdesi `errorCode: "RATE_LIMIT_EXCEEDED"` taşıyor, UT-67xx DEĞİL.

## Global Constraints

- **Backfill Redux'a DOKUNMAZ.** `fetchHistory` thunk'ı KULLANILMAZ: onun
  `fulfilled`'ı hem aynadan geçip diske yazıyor hem de o sohbetin Redux
  bucket'ını doldururdu — kullanıcının hiç açmadığı yüzlerce sohbet için
  bellekte mesaj dizisi ve gereksiz render. Tur `chatService.getMessageHistory`
  çağırıp `repo.applyHistoryPage(conversationId, page, { append: true })` ile
  yazar. Ekran gerektiğinde diski zaten okuyor (`loadOlderLocalFirst`).
- **AKTİF sohbet atlanır.** `applyHistoryPage`'in bitişiklik değişmezi var
  (`gapRefused`); aynı sohbete ekran ve backfill aynı anda sayfa eklerse
  reddedilen sayfa üretilir.
- İlerleme **`sync_state`'in yeni kolonlarında**, `next_cursor`'da DEĞİL:
  `pruneExpiredMessages` onu NULL'luyor (ölçüldü) ve paylaşılsa her budama
  devam noktasını yok ederdi.
- **Kullanıcının okumaları önce gelir.** Kalan kota rezervin altına inince tur
  durur; backfill hiçbir koşulda kullanıcının 429 yemesine sebep olmaz.
- `MessageDto`/`AttemptEntry`e yeni alan eklenmez.
- SQL parametreleri **pozisyonel** (`?`); tüm SQL `chatRepository.ts`'te;
  `chatBackfill.ts` SQL yazmaz.
- Yayınlanmış migration ASLA düzenlenmez; yeni sürüm eklenir.
  `PRAGMA user_version` sayı literali.
- `send_state <> 'sent'` terimi, gönderilmemiş satırları süzen sorgularda
  kaldırılmaz (kısmi indeks kapısı).
- Testler node@24 ile:
  `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest <yol>`
  (varsayılan node 20'de better-sqlite3 ABI → çıktısız SIGSEGV).
- Commit mesajlarında Claude atfı YOK.
- Yorumlar Türkçe, çevre dosyaların yoğunluğunda: **neden**, ne değil.
- **Yorum ve test yalnız kırılınca yakalayacağı şeyi iddia eder.** Faz 0-1
  dalında kusurların çoğu koddaki hata değil kod hakkındaki yanlış iddiaydı
  (altı kez). Her yorum ve test adı bu ölçüye tutulur.
- Kill-switch: `CHAT_BACKFILL_ENABLED` (`src/shared/store/chatFlags.ts`).

### Kararlar (benim çağrılarım, değiştirilebilir)

- **Wi-Fi kapısı YOK.** `networkStatus` yalnız `isOfflineNow()` veriyor;
  bağlantı tipi için kasten daraltılmış o modülü genişletmek gerekir. Backfill
  METİN satırı indiriyor (medya değil) — sayfa başına birkaç KB. Gerçek kısıt
  bant genişliği değil rate limit; onu Task 2 çözüyor.
- **Sıra:** en son konuşulan sohbetten geriye (`last_message_at_ms DESC`).
- **Rezerv 80 istek.** Kalan kota 80'in altına inerse tur durur: kullanıcının
  bir sohbet açıp yukarı kaydırması ~10-20 istek, `/changes` turu 1-50 sayfa.
  80 bunu rahatça soğuruyor ve 200'lük kovanın %60'ını backfill'e bırakıyor.
- **Aralık 1000 ms** (dakikada 60 istek): rezerv kapısı zaten güvenlik ağı,
  aralık onun ne sıklıkta yoklanacağını belirliyor.

## Review Focus

- **Boot'ta ilk kareyi geciktirmek:** tur senkron ya da boot'la aynı tick'te
  başlarsa soğuk açılış yavaşlar. → Task 5.
- **Aktif sohbete çakışmak:** ekran yukarı kaydırırken aynı sohbete backfill
  sayfası eklenirse `applyHistoryPage` `gapRefused` döndürür. → Task 4.
- **Budamanın "tamamlandı" sanılması:** `next_cursor = NULL` (budamadan)
  "sunucuda daha eski yok" ile karıştırılırsa sohbet yarım kalır ve bir daha
  denenmez — Faz 4'ün aramasını sessizce yarım yapar. → Task 1.
- **Boş/tek sayfalık sohbet sonsuza dek yeniden denenir:** ilk sayfası
  `hasMore: false` dönen sohbet "tamam" işaretlenmezse her tur ona istek atar.
  → Task 3 + Task 4.
- **Kota bilgisi hiç gelmezse tur agresifleşir:** `X-RateLimit-Remaining`
  header'ı yoksa (eski sunucu, proxy kırpması) rezerv kapısı "bilmiyorum"u
  "bol var" sanmamalı. → Task 2.

---

### Task 1: v8 migration + backfill ilerleme kolonları ve depo API'si

`sync_state`'in mevcut kolonları ekranın sayfalamasına ait ve `next_cursor`
budama tarafından NULL'lanıyor (ölçüldü). Backfill kendi cursor'unu ve kendi
"tamam" damgasını taşır.

**Files:**
- Modify: `src/features/chat/db/migrations.ts` (V8 ekle, `MIGRATIONS` dizisine kaydet)
- Modify: `src/features/chat/chatRepository.ts` (üç fonksiyon)
- Test: `tests/features/chat/backfillProgress.test.ts`

**Interfaces:**
- Consumes: `getChatDb()`, `ChatDbDriver`
- Produces:
  - `BackfillTarget = { conversationId: string; cursor: string | null }`
  - `readBackfillTargets(limit: number): BackfillTarget[]` — `backfill_done`
    NULL ya da 0 olan sohbetler, `conversations.last_message_at_ms DESC`
    sırada, en çok `limit` tane
  - `setBackfillCursor(conversationId: string, cursor: string | null): void`
  - `markBackfillDone(conversationId: string): void`

- [ ] **Step 1: Write the failing test**

`tests/features/chat/backfillProgress.test.ts` — `tests/features/chat/sendAttempts.test.ts`'in
mock düzenini (`jest.mock('expo-sqlite')`, `__resetAllDatabases`, `openChatDb()`)
birebir kullanır. Testler:

```ts
it('readBackfillTargets son konuşulan sohbetten geriye sıralıyor', () => {});
it('markBackfillDone edilen sohbet targets listesinde ÇIKMIYOR', () => {});
it('setBackfillCursor yazdığı cursor targets ile geri geliyor', () => {});
it('limit tavanına uyuyor', () => {});
it('sync_state satırı HİÇ YOKKEN de hedef döndürüyor (cursor null)', () => {});
it('pruneExpiredMessages backfill_cursor ve backfill_done’a DOKUNMUYOR', () => {});
it('v7 veritabanı v8’e yükselince mesaj/sohbet/sync_state satırları duruyor', () => {});
```

v7 fixture'ı **dışa açık `MIGRATIONS` dizisinin 1-7. girdileri** koşularak
kurulur, ardından `PRAGMA user_version = 7` damgalanır — elle yazılmış DDL
kopyası ikinci bir şema kaynağı olur.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/backfillProgress.test.ts`
Expected: FAIL — `readBackfillTargets` yok

- [ ] **Step 3: Add V8 in `src/features/chat/db/migrations.ts`**

```sql
ALTER TABLE sync_state ADD COLUMN backfill_cursor TEXT;
ALTER TABLE sync_state ADD COLUMN backfill_done INTEGER NOT NULL DEFAULT 0;
```

Yorumda: kolonların NEDEN `next_cursor`'dan ayrı olduğu (budama onu NULL'luyor)
ve `backfill_done`'un neden `has_more`'dan türetilemediği (budama sonrası cursor
kaybolur, `has_more` kalır; ikisi birlikte "yarım ama cursor'suz" durumunu
ayırt edemez).

- [ ] **Step 4: Implement the three functions in `chatRepository.ts`**

`readBackfillTargets` `conversations` ile LEFT JOIN kurar (sync_state satırı
henüz olmayan sohbet de hedeftir).

- [ ] **Step 5: Run test to verify it passes**

Expected: PASS (7 test)

- [ ] **Step 6: Run the full chat suite — şema değişikliği her testi etkiler**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/chat/db/migrations.ts src/features/chat/chatRepository.ts \
        tests/features/chat/backfillProgress.test.ts
git commit -m "feat(chat): backfill ilerleme kolonları (v8) ve hedef sorgusu"
```

---

### Task 2: Rate limit bütçesi yan kanalı

Backfill'in kullanıcıyı 429'a sokmaması için kalan kotayı bilmesi gerekiyor.
Sunucu `X-RateLimit-Remaining` header'ını her yanıtta döndürüyor, ama
**istemci onu şu an göremiyor**: `api.interceptors.response.use((response) =>
response.data, …)` başarı dalında yanıtın geri kalanını atıyor
(`src/shared/services/api.ts:545`).

Çağrı yerlerinin dönüş şeklini değiştirmek ONLARCA dosyayı etkiler ve bu
planın konusu değil. Bunun yerine interceptor header'ları küçük bir modül
içi deftere **yazar** ve `response.data` döndürmeye aynen devam eder — katkı
toplamsal, hiçbir çağrı yeri değişmez.

**Files:**
- Create: `src/shared/services/rateLimitBudget.ts`
- Modify: `src/shared/services/api.ts:544-545` (başarı dalına tek satır)
- Test: `tests/shared/services/rateLimitBudget.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `recordRateLimitHeaders(headers: Record<string, unknown> | undefined): void`
  - `remainingNow(): number | null` — bilinmiyorsa `null`
  - `__resetRateLimitBudgetForTests(): void`

- [ ] **Step 1: Write the failing test**

```ts
it('header’dan kalan kotayı okuyup saklıyor', () => {});
it('header yoksa null kalıyor — "bilmiyorum" ile "bol var" KARIŞMIYOR', () => {});
it('sayıya çevrilemeyen değeri null sayıyor', () => {});
it('her yanıtta değeri GÜNCELLİYOR (en taze olan geçerli)', () => {});
it('x-ratelimit-remaining büyük/küçük harf farkına dayanıklı', () => {});
```

İkinci test Review Focus'un "kota bilgisi hiç gelmezse" maddesi: `null`
döndürmek şart, `Infinity` ya da `200` varsaymak değil — Task 3 bunu "temkinli
davran" diye yorumluyor.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/shared/services/rateLimitBudget.test.ts`
Expected: FAIL — modül yok

- [ ] **Step 3: Implement `src/shared/services/rateLimitBudget.ts`**

`networkStatus.ts`'in modül-içi tek-kaynak kalıbı; React aboneliği YOK
(kimse render etmiyor, yalnız backfill okuyor).

- [ ] **Step 4: Call it from the response interceptor**

`api.ts`'in başarı dalı: `recordRateLimitHeaders(response.headers)` çağrılır,
ardından `response.data` AYNEN döndürülür. Yorumda neden yan kanal olduğu
(dönüş şeklini değiştirmek onlarca çağrı yerini kırardı).

- [ ] **Step 5: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/shared/services/rateLimitBudget.test.ts tests/shared`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/services/rateLimitBudget.ts src/shared/services/api.ts \
        tests/shared/services/rateLimitBudget.test.ts
git commit -m "feat(api): kalan rate limit kotası yan kanaldan okunabiliyor"
```

---

### Task 3: Saf tempo ve seçim politikası

**Files:**
- Create: `src/features/chat/backfillPolicy.ts`
- Test: `tests/features/chat/backfillPolicy.test.ts`

**Interfaces:**
- Consumes: `BackfillTarget` (Task 1)
- Produces:
  - `BACKFILL_PAGE_SIZE = 50`
  - `MAX_REQUESTS_PER_ROUND = 30` (birim İSTEK, "başarılı sayfa" değil —
    backend'in kovası denemeyi sayıyor; 5xx/ağ hatası da bir slot yakıyor)
  - `MAX_PAGES_PER_CONVERSATION = 6`
  - `PAGE_DELAY_MS = 1000`
  - `RATE_LIMIT_RESERVE = 80`
  - `BACKFILL_BOOT_DELAY_MS = 10_000` (Task 5 kullanıyor)
  - `selectBackfillTargets(targets: BackfillTarget[], activeConversationId: string | null): BackfillTarget[]`
  - `shouldStopRound(opts: { attemptsThisRound: number; offline: boolean; remaining: number | null }): boolean`
    — sayaç DENEME sayar (çağıran her istekten ÖNCE artırır)
  - `isConversationComplete(page: { hasMore: boolean; nextCursor: string | null }): boolean`
    — `hasMore === false` **veya** `nextCursor === null`

- [ ] **Step 1: Write the failing test**

```ts
it('aktif sohbeti listeden eliyor, diğerlerinin sırasını koruyor', () => {});
it('aktif sohbet yoksa listeyi aynen döndürüyor', () => {});
it('tur tavanı dolunca duruyor', () => {});
it('offline olunca duruyor', () => {});
it('kalan kota rezervin ALTINDA olunca duruyor', () => {});
it('kalan kota rezervin TAM ÜSTÜNDE olunca durmuyor', () => {});
it('kalan kota BİLİNMİYORSA (null) ve hiç deneme yapılmamışsa DURMUYOR — prob dalı', () => {});
it('kalan kota BİLİNMİYORSA ve bir deneme zaten yapıldıysa duruyor — BAŞARISIZ denemede de', () => {});
it('hasMore false olan sayfa sohbeti TAMAM sayıyor', () => {});
it('nextCursor null olan sayfa da TAMAM sayıyor (hasMore true gelse bile)', () => {});
```

Kota bilinmiyorken kural **prob**: tur TEK bir denemeye izin verir, o
denemenin yanıtı bütçeyi doldurur ve sonrası rezerve göre karar verir.
"Bilinmiyorsa hiç başlama" tek başına backfill'i soğuk açılışta ASLA
çalıştırmazdı (`remainingNow()` hiçbir API yanıtı görmeden `null` kalıyor ve
Mesajlar'a hiç girmeyen kullanıcı o yanıtı üretmeyebilir). Prob BAŞARISIZ
olursa ikinci bir deneme SATIN ALINMIYOR: hata (ağ/5xx) bütçe hakkında
hiçbir şey öğretmediği için `attemptsThisRound` yine 1'e çıkar ve tur
kapanır.

`nextCursor` gelmeyen sayfayı tamam saymanın BEDELİ kalıcı: `backfill_done`
tek yönlü bir mandal ve hiçbir tam senkron yolu ona dokunmuyor. Söken iki yol
`clearAllChatData()` (logout) ve `chat/historyRevealed` →
`repo.clearBackfillDone` (gizli arşiv açılması). "Bir sonraki tam senkronda
düzelir" YANLIŞTI; Faz 4 arama kapsamını dürüstçe söylemek için
`backfill_done` sayısını okuyacak.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/backfillPolicy.test.ts`
Expected: FAIL — modül yok

- [ ] **Step 3: Implement `src/features/chat/backfillPolicy.ts`**

Saf: store, ağ, timer, SQL YOK. Dosya başına `outboxPolicy.ts`'teki gibi
"neden ayrı dosya" notu.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS (9 test)

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/backfillPolicy.ts tests/features/chat/backfillPolicy.test.ts
git commit -m "feat(chat): backfill tempo ve seçim politikası"
```

---

### Task 4: Backfill turu

**Files:**
- Create: `src/features/chat/chatBackfill.ts`
- Test: `tests/features/chat/chatBackfill.test.ts`

**Interfaces:**
- Consumes: Task 1'in üç fonksiyonu + `BackfillTarget`; Task 2'nin
  `remainingNow()`; Task 3'ün sabitleri ve üç saf fonksiyonu;
  `chatService.getMessageHistory`; `repo.applyHistoryPage`; `isOfflineNow()`
- Produces:
  - `runBackfillRound(getActiveConversationId: () => string | null): Promise<BackfillRoundResult>`
  - `BackfillRoundResult = { ran: boolean; pages: number; messages: number; completed: string[] }`
  - `__resetBackfillForTests(): void`

- [ ] **Step 1: Write the failing test**

`chatService` mock'lanır, SQLite gerçek. Testler:

```ts
it('sayfayı DİSKE yazıyor ve Redux bucket’ı BOŞ kalıyor', () => {});
it('cursor ilerliyor, bir sonraki tur kaldığı yerden devam ediyor', () => {});
it('hasMore false gelince sohbeti tamam işaretliyor ve bir daha istemiyor', () => {});
it('AKTİF sohbeti atlıyor', () => {});
it('tur ortasında offline olursa duruyor ve ilerleme diskte kalıyor', () => {});
it('kalan kota rezervin altına inince tur ortasında duruyor', () => {});
it('istek patlarsa o sohbeti bırakıp tura devam ediyor, cursor GERİ GİTMİYOR', () => {});
it('429 alınca turu kesiyor ve cursor’a dokunmuyor', () => {});
it('aynı anda iki tur koşmuyor (in-flight)', () => {});
it('bayrak kapalıyken hiç istek atmıyor', () => {});
```

Birinci test "Redux'a dokunmuyor"u iddia ediyor, o yüzden onu YAKALAMALI:
import denetimiyle değil, tur sonunda `store.getState().chat.messagesByConv`'ın
BOŞ kalmasıyla doğrula.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/chatBackfill.test.ts`
Expected: FAIL — `runBackfillRound` yok

- [ ] **Step 3: Implement `runBackfillRound` in `src/features/chat/chatBackfill.ts`**

Tur: hedefleri oku → `selectBackfillTargets` → her hedef için en çok
`MAX_PAGES_PER_CONVERSATION` sayfa, aralarında `PAGE_DELAY_MS` → her sayfadan
sonra `applyHistoryPage(..., { append: true })` + `setBackfillCursor` →
`isConversationComplete` ise `markBackfillDone`. `shouldStopRound({ …,
remaining: remainingNow() })` her isteğin ÖNCESİNDE çağrılır, sonrasında
DEĞİL: sayfadan sonra bakmak turun İLK isteğini hiç denetlemiyor ve bir istek
patlayıp `break`'e düştüğünde offline/kota okumasını tamamen atlıyordu.
`inFlight` guard'ı `chatDeltaSync.pullChanges`'teki kalıbın aynısı.

İstek hatasında cursor'a DOKUNMA (bir sonraki tur aynı yerden dener) ve turu
öldürme — o sohbeti bırak, sıradakine geç. 429 ayrı dal: **turu kes**, çünkü
kova paylaşımlı ve devam etmek kullanıcının okumalarını da 429'a sokar.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS (10 test)

- [ ] **Step 5: Run the chat suite**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/chatBackfill.ts tests/features/chat/chatBackfill.test.ts
git commit -m "feat(chat): geçmişi geri dolduran arka plan turu"
```

---

### Task 5: Bayrak + tetikleyiciler

**Files:**
- Modify: `src/shared/store/chatFlags.ts` (`CHAT_BACKFILL_ENABLED`)
- Modify: `src/features/chat/chatMirrorMiddleware.ts` (boot tetiği, teardown)
- Test: `tests/features/chat/chatBackfill.triggers.test.ts`

**Interfaces:**
- Consumes: `runBackfillRound`, `__resetBackfillForTests` (Task 4),
  `BACKFILL_BOOT_DELAY_MS` (Task 3)
- Produces: `startBackfill(deps: { getActiveConversationId: () => string | null }): () => void`
  (`chatBackfill.ts`'te; söken fonksiyonu döner, `startDeltaSync` kalıbı)

- [ ] **Step 1: Write the failing test**

```ts
it('boot’ta SENKRON tur BAŞLATMIYOR — ilk kare gecikmez', () => {});
it('gecikme dolunca turu başlatıyor', () => {});
it('söken fonksiyon çağrılınca bekleyen turu iptal ediyor', () => {});
it('bayrak kapalıyken no-op dönüyor', () => {});
```

Birinci test Review Focus'un boot maddesi: `startBackfill` çağrıldığı tick'te
`chatService.getMessageHistory` çağrılmamış olmalı.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/chatBackfill.triggers.test.ts`
Expected: FAIL — `startBackfill` yok

- [ ] **Step 3: Implement `startBackfill` and add `CHAT_BACKFILL_ENABLED`**

Bayrağın yorumu diğerlerinin kalıbında: ne yaptığı ve kapatmanın neyi geri
aldığı (tur durur, yazılmış satırlar kalır, veri kaybı yok).

- [ ] **Step 4: Wire into `startChatMirror`**

`hydrateConversationList` ve `startDeltaSync`'ten SONRA. `stopChatMirror`
söken fonksiyonu çağırır.

- [ ] **Step 5: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/store/chatFlags.ts src/features/chat/chatBackfill.ts \
        src/features/chat/chatMirrorMiddleware.ts \
        tests/features/chat/chatBackfill.triggers.test.ts
git commit -m "feat(chat): backfill bayrağı ve boot tetiği"
```

---

## Bu planın KAPSAMINDA OLMAYANLAR

- **Faz 4 (arama):** FTS5, normalize kolon, arama ekranı, mesaja atlama. Bu
  plan onun ön koşulunu üretir, kendisini değil.
- **Outbox drenajını rezerve bağlamak.** Backend aynı uyarıyı gönderim kuyruğu
  için de yaptı ve Task 2'nin yan kanalı onu da besleyebilir — ama bu dalın
  konusu değil, ayrı ve küçük bir tur (`flushOutbox`'ın mevcut `MAX_PER_FLUSH`
  tavanı şimdilik yerinde duruyor).
- Kullanıcıya ilerleme göstergesi — backfill sessiz. Faz 4'te arama kapsamını
  dürüstçe söylemek gerekirse `backfill_done` sayısı o zaman okunur.
- Wi-Fi kapısı ve `networkStatus`'a bağlantı tipi eklemek.
- Medya (sesli mesaj dosyaları) indirmek — Faz 5.
- Cihaz testi: turun gerçek bir arşivde ne kadar sürdüğü ölçülmeli; rezerv ve
  aralık o ölçüme göre ayarlanabilir.
