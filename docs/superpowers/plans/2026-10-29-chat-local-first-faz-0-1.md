# Chat local-first Faz 0 + Faz 1 — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat aramasının Türkçe harf bug'ını kapatmak ve gönderim kuyruğunu
process ömründen kurtarıp kalıcı hale getirmek.

**Architecture:** Arama tarafı tek saf fonksiyon (`foldTr`) ve onu kullanan tek
çağrı yeri. Kuyruk tarafı: bugün bellekte yaşayan `attempts` haritası, yeni bir
`send_attempts` tablosunun önbelleğine dönüşüyor. Mesaj gövdesi tek kaynakta —
`messages` satırında — kalıyor; yeni tablo yalnız muhasebe (deneme sayısı,
backoff, `permanent`, `quota_charged`) taşıyor. Balona YENİ ALAN EKLENMİYOR.

**Tech Stack:** TypeScript, expo-sqlite (senkron API), Redux Toolkit, jest +
better-sqlite3 (expo-sqlite mock'u üzerinden gerçek SQL).

**Spec:** [chat_local_first_roadmap_2026-10.md](../../../chat_local_first_roadmap_2026-10.md)

## Global Constraints

- SQL parametreleri **pozisyonel** (`?`). İsimli parametre (`:x`/`$x`/`@x`)
  KULLANILMAZ — expo-sqlite bind anahtarlarını native'e aynen geçiriyor.
- Yayınlanmış migration **asla düzenlenmez**; yeni sürüm eklenir.
  `PRAGMA user_version` parametrelenemez, sayı literali olarak gömülür.
- `send_state <> 'sent'` terimi sorgularda mantıksal fazlalık ama
  `idx_messages_unsent` kısmi indeksini açan anahtar — **silinmez**.
- Testler node@24 ile koşar:
  `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest <yol>`
  (varsayılan node 20'de better-sqlite3 ABI uyuşmazlığı → çıktısız SIGSEGV).
- Commit mesajlarında Claude atfı YOK: `Co-Authored-By` trailer'ı eklenmez,
  gövdede Claude'dan söz edilmez.
- Yorumlar Türkçe ve mevcut dosyaların yoğunluğunda: "ne" değil **"neden"**.
- `MessageDto`'ya yeni alan eklenmez. Deneme sayacı mesaj alanı olursa
  `messageEquality`'ye girmesi gerekir ve her artış balonu + LegendList'i yapısal
  değişim sayıp yeniden çizdirir (commit-storm sınıfı).
- Ayna (`chatMirrorMiddleware`) hata yutar: SQL hatası sohbeti kilitlemez.
  Yeni yazımlar da bu sözleşmeye uyar.

## Review Focus

- **Logout'ta `send_attempts` boşalmazsa** sonraki kullanıcı önceki kullanıcının
  gönderim muhasebesini devralır (gizlilik + yanlış backoff). → Task 2.
- **`quota_charged` restart'ı atlatmazsa** ack'i görülmemiş mesajın başarılı
  tekrarı kotayı ikinci kez düşürür — kullanıcı hak kaybeder. → Task 3.
- **Boş / yalnız boşluk sorgu** tüm listeyi döndürmeli; katlama eklenirken
  `!q` kısa devresi kaybolursa liste bomboş görünür. → Task 1.
- **v6 → v7 yükseltmede** mevcut mesaj ve sohbet satırları kaybolmamalı;
  `DROP TABLE outbox` komşu tabloya dokunmamalı. → Task 2.
- **Ses dosyası düşmüş + `mediaUrl` da yoksa** mesaj sessizce sonsuza dek
  başarısız kalıyor; kullanıcıya "yeniden kaydet" denmeli. → Task 6.

---

### Task 1: `foldTr` + chat aramasının Türkçe davranışı

Bugün [MessagesScreen.tsx:694-696](../../../src/features/chat/screens/MessagesScreen.tsx#L694-L696)
`toLowerCase()` kullanıyor ve kullanıcının **doğru yazdığı** ad bulunmuyor:
`İrem`+`irem` ✗, `Işıl`+`ışıl` ✗.

Kod tabanında `toLocaleLowerCase("tr")` konvansiyonu var (CityPickerModal,
FeedUniversitySheet) ama o da yanlış: `I`→`ı` olduğu için `ELIF`+`elif` ✗.
Doğru çözüm arama için **agresif katlama** — `i/ı/İ/I` tek harfe iner, aksan
düşer; böylece klavyesinde Türkçe harf olmayan kullanıcı da bulur.

**Files:**
- Create: `src/shared/utils/foldTr.ts`
- Modify: `src/features/chat/screens/MessagesScreen.tsx:694-696`
- Test: `tests/shared/foldTr.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `foldTr(value: string | null | undefined): string` — Faz 4'te FTS'in
  normalize kolonu da bunu kullanacak.

- [ ] **Step 1: Write the failing test**

```ts
import { foldTr } from '@/shared/utils/foldTr';

describe('foldTr', () => {
  it.each([
    ['İrem', 'irem'],
    ['Işıl', 'ışıl'],
    ['Işıl', 'isil'],
    ['Özge', 'ozge'],
    ['Şule', 'sule'],
    ['ELIF', 'elif'],
    ['Elif İnci', 'inci'],
    ['Çağla', 'cagla'],
    ['ÜMİT', 'umit'],
    ['Gülşah', 'gulsah'],
  ])('%s içinde "%s" bulunuyor', (name, query) => {
    expect(foldTr(name).includes(foldTr(query))).toBe(true);
  });

  it('ilgisiz adı eşleştirmiyor', () => {
    expect(foldTr('Ayşe').includes(foldTr('ali'))).toBe(false);
  });

  it('null/undefined için boş string', () => {
    expect(foldTr(null)).toBe('');
    expect(foldTr(undefined)).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/shared/foldTr.test.ts`
Expected: FAIL — `Cannot find module '@/shared/utils/foldTr'`

- [ ] **Step 3: Implement `foldTr(value: string | null | undefined): string` in `src/shared/utils/foldTr.ts`**

Algoritma (doğrulanmış): `normalize("NFC")` → harf haritası ile tek geçiş →
`toLowerCase()`. Harita: `ı İ I i → i`, `ş Ş → s`, `ğ Ğ → g`, `ü Ü → u`,
`ö Ö → o`, `ç Ç → c`, `â → a`, `î → i`, `û → u`.

`toLocaleLowerCase("tr")` KULLANILMAZ — gerekçesi yorum olarak yazılacak
(`ELIF`+`elif` karşı örneği), yoksa bir sonraki okuyan "konvansiyona uymamış"
diye geri çevirir.

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/shared/foldTr.test.ts`
Expected: PASS (13 test)

- [ ] **Step 5: Write the failing test for the search filter**

`tests/features/chat/messagesSearch.test.ts` — süzgeç mantığını saf fonksiyon
olarak sınar. Önce `MessagesScreen`'deki `matches` kapanışını
`src/features/chat/conversationSearch.ts`'e taşı:
`conversationMatchesQuery(conversation: { partnerDisplayName?: string | null; lastMessagePreview?: string | null }, query: string): boolean`

Testler:
- `İrem` adlı sohbet `irem` sorgusuyla eşleşir
- son mesaj önizlemesindeki kelime eşleşir (`lastMessagePreview: 'yarın görüşürüz'` + `goru`)
- **boş sorgu ve yalnız boşluk sorgusu `true` döndürür** (Review Focus)
- ilgisiz sorgu `false` döndürür

- [ ] **Step 6: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/messagesSearch.test.ts`
Expected: FAIL — `conversationMatchesQuery` yok

- [ ] **Step 7: Implement `conversationMatchesQuery` and wire it into `MessagesScreen`**

`conversationsByTab` içindeki `matches` kapanışı yerine bu fonksiyon çağrılır.
`searchQuery` katlanmış hali **bir kez** hesaplanır (satır başına değil) —
memo'nun içinde, `for` döngüsünden önce.

- [ ] **Step 8: Run the chat test suite**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat tests/shared/foldTr.test.ts`
Expected: PASS, mevcut testlerde regresyon yok

- [ ] **Step 9: Commit**

```bash
git add src/shared/utils/foldTr.ts src/features/chat/conversationSearch.ts \
        src/features/chat/screens/MessagesScreen.tsx \
        tests/shared/foldTr.test.ts tests/features/chat/messagesSearch.test.ts
git commit -m "fix(chat): aramada Türkçe harf katlaması"
```

---

### Task 2: v7 migration + `send_attempts` depo API'si

`outbox` tablosu v1'den beri şemada ama hiç yazılmadı; tek dokunan yer
`DELETE FROM outbox`. `payload_json NOT NULL` taşıdığı için olduğu gibi
kullanmak mesaj gövdesinin ikinci kopyasını üretir. Düşürülüp yerine yalnız
muhasebe taşıyan tablo gelir.

**Files:**
- Modify: `src/features/chat/db/migrations.ts` (V7 ekle, `MIGRATIONS` dizisine kaydet)
- Modify: `src/features/chat/chatRepository.ts` (yeni fonksiyonlar + `:740` ve `:1152` outbox referansları)
- Modify: `src/features/chat/db/chatDb.ts:106` (wipe listesi)
- Test: `tests/features/chat/sendAttempts.test.ts`

**Interfaces:**
- Consumes: `getChatDb()` (`db/chatDb.ts`), `ChatDbDriver`
- Produces:
  - `SendAttemptRow = { client_message_id: string; attempts: number; first_seen_at_ms: number; next_eligible_at_ms: number; permanent: number; quota_charged: number; origin: string | null; last_error: string | null }`
  - `readSendAttempts(): SendAttemptRow[]`
  - `upsertSendAttempt(row: SendAttemptRow): void`
  - `deleteSendAttempts(clientMessageIds: string[]): void`
  - `pruneOrphanSendAttempts(): number` — `messages`'ta karşılığı
    `send_state <> 'sent'` olmayan satırları siler, silinen sayısını döndürür

- [ ] **Step 1: Write the failing test**

`tests/features/chat/sendAttempts.test.ts` — `outboxDiskDiscovery.test.ts`'in
başlığındaki mock düzenini (`jest.mock('expo-sqlite')`, `__resetAllDatabases`,
`openChatDb()`) birebir kullanır. Testler:

```ts
it('yazıp geri okuyor', () => { /* upsert → readSendAttempts */ });
it('aynı cmid ikinci yazımda GÜNCELLENİYOR, satır çiftlenmiyor', () => {});
it('deleteSendAttempts yalnız verilen cmid’leri siliyor', () => {});
it('pruneOrphanSendAttempts gönderilmiş mesajın kaydını siliyor, bekleyeni bırakıyor', () => {});
it('clearAllChatData send_attempts’i de boşaltıyor', () => {});   // Review Focus
it('v6 veritabanı v7’ye yükselince mesaj ve sohbet satırları duruyor', () => {});  // Review Focus
```

Son test için: `openChatDb()` öncesi ham sürücüyle v6 şemasını kur, mesaj +
sohbet satırı yaz, `PRAGMA user_version = 6` damgala, sonra `runMigrations` koş
ve satırların durduğunu + `send_attempts`'in var olduğunu doğrula.

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/sendAttempts.test.ts`
Expected: FAIL — `readSendAttempts` yok

- [ ] **Step 3: Add V7 migration in `src/features/chat/db/migrations.ts`**

```sql
DROP TABLE outbox;
CREATE TABLE send_attempts (
  client_message_id   TEXT PRIMARY KEY,
  attempts            INTEGER NOT NULL DEFAULT 0,
  first_seen_at_ms    INTEGER NOT NULL,
  next_eligible_at_ms INTEGER NOT NULL DEFAULT 0,
  permanent           INTEGER NOT NULL DEFAULT 0,
  quota_charged       INTEGER NOT NULL DEFAULT 0,
  origin              TEXT,
  last_error          TEXT
);
```

Yorumda: tablonun NEDEN gövde taşımadığı (tek kaynak `messages`) ve `outbox`'ın
neden düşürüldüğü (hiç yazılmadı, `payload_json NOT NULL` ikinci kopya
dayatıyordu).

- [ ] **Step 4: Implement the five repository functions in `chatRepository.ts`**

`pruneOrphanSendAttempts` sorgusu `messages` ile `NOT EXISTS` kurar ve
`send_state <> 'sent'` terimini **aynen** taşır (kısmi indeks kapısı).
`clearAllChatData` (`:1152`) ve `destroyChatDb` (`chatDb.ts:106`) listelerinde
`outbox` → `send_attempts`. `chatRepository.ts:740` (sohbet başına silme) da
aynı şekilde güncellenir.

- [ ] **Step 5: Run test to verify it passes**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/sendAttempts.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full chat suite — şema değişikliği her testi etkiler**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/chat/db/migrations.ts src/features/chat/chatRepository.ts \
        src/features/chat/db/chatDb.ts tests/features/chat/sendAttempts.test.ts
git commit -m "feat(chat): send_attempts tablosu (v7), ölü outbox tablosu düşürüldü"
```

---

### Task 3: Outbox muhasebesini diske bağla

`attempts` haritası kalıyor (gerekçe Global Constraints'te) ama artık diskin
önbelleği. Asıl kazanç `quota_charged`: bugün restart'ta kayboluyor ve ack'i
görülmemiş mesajın başarılı tekrarı kotayı ikinci kez düşürüyor.

**Files:**
- Modify: `src/features/chat/outboxPolicy.ts` (saf dönüştürücüler)
- Modify: `src/features/chat/outbox.ts` (`touchEntry`, `noteFailure`, `markPermanent`, `chargeQuotaOnce`, `pruneAttempts`, `flushOutbox`, `resetOutbox`)
- Modify: `src/features/chat/chatRepository.ts:296-300` (bayat yorum)
- Test: `tests/features/chat/outboxPersistence.test.ts`

**Interfaces:**
- Consumes: Task 2'nin beş fonksiyonu; `AttemptEntry` (mevcut)
- Produces:
  - `attemptEntryFromRow(row: SendAttemptRow): AttemptEntry` (outboxPolicy, saf)
  - `attemptRowFromEntry(clientMessageId: string, entry: AttemptEntry): SendAttemptRow` (outboxPolicy, saf)
  - `loadAttemptsFromDisk(): void` (outbox)
  - `rememberAttempt(clientMessageId: string, entry: AttemptEntry): void` (outbox — Map + disk)
  - `peekAttempt(clientMessageId: string): AttemptEntry | undefined` (outbox)

- [ ] **Step 1: Write the failing test for the pure converters**

`tests/features/chat/outboxPersistence.test.ts`:
- `attemptRowFromEntry` → `attemptEntryFromRow` gidiş-dönüşü kaydı birebir
  koruyor (`permanent`/`quota_charged` boolean ↔ 0/1 dönüşümü dahil)
- bilinmeyen `origin` değeri `"throw"`a düşüyor (ileri uyumluluk)

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/outboxPersistence.test.ts`
Expected: FAIL — `attemptRowFromEntry` yok

- [ ] **Step 3: Implement the two converters in `outboxPolicy.ts`**

- [ ] **Step 4: Write the failing test for the disk round trip**

Aynı dosyada, `openChatDb()` kurulumuyla:
- `rememberAttempt(cmid, { ...quotaCharged: true })` → `resetOutbox()` (process
  ölümünü taklit eder) → `loadAttemptsFromDisk()` → `peekAttempt(cmid)!.quotaCharged === true`
  **(Review Focus: kota iki kez düşmesin)**
- `rememberAttempt` ile yazılan `nextEligibleAt` restart sonrası `isEligible`'ı
  hâlâ bloke ediyor (backoff restart'ı atlatıyor)
- `pruneAttempts` Map'ten düşen kaydı **diskten de** siliyor

- [ ] **Step 5: Run test to verify it fails**

Expected: FAIL — `loadAttemptsFromDisk` yok

- [ ] **Step 6: Implement the disk wiring in `outbox.ts`**

`touchEntry`/`noteFailure`/`markPermanent`/`chargeQuotaOnce` mutasyondan sonra
`rememberAttempt` çağırır. `flushOutbox` turun başında bir kez
`loadAttemptsFromDisk()` (yüklendi bayrağıyla). `pruneAttempts` Map temizliğiyle
birlikte `deleteSendAttempts` çağırır. `resetOutbox` **diske dokunmaz** —
logout temizliği `clearAllChatData`'nın işi (Task 2) ve `resetOutbox` testlerde
de process ölümünü taklit etmek için kullanılıyor.

`MAX_TRACKED = 200` tahliyesi Map'te kalır, diskte kalmaz: disk sınırını
`pruneOrphanSendAttempts` çiziyor.

- [ ] **Step 7: Fix the stale comment in `chatRepository.ts:296-300`**

"idempotency teyitli değil, kendiliğinden tekrar göndermek mükerrer mesaj
riski" cümlesi yanlış. Kanonik yorum `outboxPolicy.isEligible:429-432`.
Yeni metin: garanti `(senderId, clientMessageId)` filtreli UNIQUE index'e
dayanıyor, 2026-10-27'de yeniden teyit edildi, ömrü mesaj satırının ömrü
(retention 730 gün). `pending → failed` çevirmenin gerekçesi **değişmiyor**:
kullanıcı asılı spinner görmesin, balonda buton çıksın.

- [ ] **Step 8: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/features/chat/outboxPolicy.ts src/features/chat/outbox.ts \
        src/features/chat/chatRepository.ts tests/features/chat/outboxPersistence.test.ts
git commit -m "feat(chat): gönderim muhasebesi diske yazılıyor, kota çift düşmüyor"
```

---

### Task 4: 2 saatlik yaş sınırını kaldır + geç gönderim bildirimi

**Tasarım notu — yol haritasına düzeltme.** Haritada bu sınırın "dayanağını
kaybettiği" yazıyor; kodu okuyunca gerekçesi idempotency DEĞİL bir ürün kararı
çıktı ([outboxPolicy.ts:121-128](../../../src/features/chat/outboxPolicy.ts#L121-L128)):
*"kullanıcının sabah yazıp gitmediğini gördüğü bir mesajı akşam habersiz
göndermek doğru olmaz."* Bu argüman idempotency garantisinden bağımsız ve hâlâ
geçerli.

Sorun sınırın kendisi değil, **"habersiz"** kelimesi. Kararım (değiştirilebilir):
sınırı kaldır, ama sessiz tur bir saatten eski bir mesajı başarıyla
gönderdiğinde kullanıcıya söyle. Böylece hem mesaj kaybolmuyor hem sürpriz
olmuyor.

**Files:**
- Modify: `src/features/chat/outboxPolicy.ts` (`OUTBOX_DISK_MAX_AGE_MS` kaldır, `LATE_SEND_NOTICE_MS` ekle)
- Modify: `src/features/chat/outbox.ts` (`readFailedOutboxFromLocal` çağrısı, `sendOutgoing` başarı dalı)
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts` (`chat.send.lateDelivered`)
- Modify: `tests/features/chat/outboxDiskDiscovery.test.ts` (`yaş sınırından eski mesajı döndürmüyor` testi)
- Test: `tests/features/chat/outboxPersistence.test.ts` (ek testler)

**Interfaces:**
- Consumes: Task 3'ün seam'leri
- Produces: `LATE_SEND_NOTICE_MS = 60 * 60_000`;
  `isLateDelivery(sentAtMs: number, nowMs: number): boolean` (outboxPolicy, saf)

- [ ] **Step 1: Update the existing age-limit test**

`outboxDiskDiscovery.test.ts`'teki `yaş sınırından eski mesajı döndürmüyor`
testi artık yanlış davranışı sınıyor. Yerine: **iki gün önceki başarısız mesaj
da arşivden dönüyor** (`readFailedOutboxFromLocal()` parametresiz).

- [ ] **Step 2: Write the failing test for `isLateDelivery`**

`outboxPersistence.test.ts`: 1 saatten eski `sentAt` → `true`, 10 dakikalık →
`false`, tam sınır (`=== LATE_SEND_NOTICE_MS`) → `false`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/outboxDiskDiscovery.test.ts tests/features/chat/outboxPersistence.test.ts`
Expected: FAIL (biri eski sabite, biri olmayan fonksiyona)

- [ ] **Step 4: Remove `OUTBOX_DISK_MAX_AGE_MS`, add `isLateDelivery`**

`outbox.ts:490`'daki çağrı `readFailedOutboxFromLocal()` olur (yaş süzgeci yok;
`limit` varsayılanı duruyor). Sınırın neden kaldırıldığı ve yerine ne konduğu
yorumda yazılır — eski yorumdaki ürün argümanı silinmez, **cevaplanır**.

- [ ] **Step 5: Add the i18n key and wire the notice**

`chat.send.lateDelivered` — TR: `'Bekleyen mesajın gönderildi'`,
EN: `'Your pending message was sent'`. `sendOutgoing`'in başarı dalında, yalnız
`mode === "silent"` ve `isLateDelivery(...)` iken `showInfoToast({ message, variant: 'info' })`.
Tur başına **en fazla bir** bildirim (yirmi mesajlık kuyruk yirmi toast
açmasın).

- [ ] **Step 6: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/chat/outboxPolicy.ts src/features/chat/outbox.ts \
        src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts \
        tests/features/chat/outboxDiskDiscovery.test.ts tests/features/chat/outboxPersistence.test.ts
git commit -m "feat(chat): bekleyen mesajın yaş sınırı kalktı, geç gönderim bildiriliyor"
```

---

### Task 5: Boot sırası — gönderimden önce yakalama turu

Bugün `flushOutbox` uçuştaki delta turunu **bekliyor**
([outbox.ts:468-475](../../../src/features/chat/outbox.ts#L468-L475)) ama tur
**açmıyor**. Delta'nın 10 saniyelik tabanı o turu bastırırsa beklenecek bir şey
olmuyor ve gönderim yakalamadan önce gidiyor. Backend'in açık ricası bu adım;
karşılığı rate limit slotu (mükerrer istek sayaca yazılıyor, düzeltilmeyecek).

**Files:**
- Modify: `src/features/chat/chatDeltaSync.ts` (yeni dışa açık fonksiyon)
- Modify: `src/features/chat/outbox.ts:468-475`
- Test: `tests/features/chat/chatDeltaSync.test.ts` (mevcut dosyaya ek)

**Interfaces:**
- Consumes: `inFlightPull()`, `pullChanges()` (mevcut)
- Produces: `pullBeforeSend(getActiveConversationId?: () => string | null): Promise<PullResult | null>`
  — uçuşta tur varsa onu döndürür; yoksa ve son turdan beri
  `MIN_PULL_INTERVAL_MS` geçmişse **yeni tur başlatır**; aksi halde `null`.

- [ ] **Step 1: Write the failing test**

`chatDeltaSync.test.ts`'e ekle:
- uçuşta tur varken `pullBeforeSend` **yeni istek atmıyor**, aynı turu döndürüyor
- tur yok ve son tur eski → `chatService.getChanges` **bir kez** çağrılıyor
- tur yok ama son tur 10 saniyeden yeni → `null`, istek yok

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/chatDeltaSync.test.ts`
Expected: FAIL — `pullBeforeSend` yok

- [ ] **Step 3: Implement `pullBeforeSend` in `chatDeltaSync.ts`**

`lastPullAt`'i `fire()` ile paylaşır (iki yol aynı tabanı görmeli).
`__resetDeltaSyncForTests` bu alanı zaten sıfırlıyor.

- [ ] **Step 4: Replace the wait block in `flushOutbox`**

`const pull = inFlightPull()` yerine `pullBeforeSend(...)`. `try/catch` aynen
kalır: yakalama turu patlarsa gönderim turu yine koşar.

- [ ] **Step 5: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/chat/chatDeltaSync.ts src/features/chat/outbox.ts \
        tests/features/chat/chatDeltaSync.test.ts
git commit -m "feat(chat): gönderim turundan önce yakalama turu garanti"
```

---

### Task 6: Ses kaydı düşmüşse kullanıcıya söyle

Kuyruk kalıcı olunca sesli mesaj **günlerce** kuyrukta bekleyebiliyor ve
`_localUri` iOS'un sildiği cache dizininde. `mediaUrl` yazılmışsa sorun yok
(3. adımdan devam). Yazılmamışsa `messageToDescriptor` null dönüyor ve mesaj
sessizce sonsuza dek başarısız kalıyor; kullanıcı neden olduğunu bilmiyor.

**Files:**
- Modify: `src/features/chat/outbox.ts:399-417` (`retryFailedMessage`'ın null dalı)
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts`
- Test: `tests/features/chat/outboxPersistence.test.ts` (ek)

**Interfaces:**
- Consumes: `messageToDescriptor` (mevcut), `rememberAttempt` (Task 3)
- Produces: — (davranış değişikliği)

- [ ] **Step 1: Write the failing test**

- `localUri` ve `mediaUrl`'ün **ikisi de yok** olan sesli satır: `markPermanent`
  sonrası kayıt **diskte** `permanent = 1` (Task 3 sayesinde kalıcı), yani
  sonraki turlar denemiyor **(Review Focus)**
- `mediaUrl` VAR, `localUri` yok → tanım üretiliyor, kalıcı hata **değil**

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/outboxPersistence.test.ts`
Expected: FAIL

- [ ] **Step 3: Update the null branch and the i18n text**

`markPermanent` çağrısı `rememberAttempt` üzerinden diske iner (Task 3'te
bağlandıysa bedava). `interactive` modda gösterilen metin
`chat.voice.sendFailed` (`'Sesli mesaj gönderilemedi'`) yerine yeni anahtar
`chat.voice.recordingGone` — TR: `'Ses kaydı bulunamadı, yeniden kaydet'`,
EN: `'Voice recording is missing, please record again'`. Genel gönderim hatası
metni olduğu gibi kalır; bu ayrı bir sebep.

- [ ] **Step 4: Run tests**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/outbox.ts src/shared/i18n/translations/tr.ts \
        src/shared/i18n/translations/en.ts tests/features/chat/outboxPersistence.test.ts
git commit -m "feat(chat): düşmüş ses kaydı kullanıcıya bildiriliyor"
```

---

## Bu planın KAPSAMINDA OLMAYANLAR

- Faz 2 (tepki/düzenleme/silme kuyruğu) — `send_attempts`'in `kind` kolonu
  gerekecek, yani v8. Backend'e üç ucun mükerrer-istek garantisi sorulmadan
  başlanmaz.
- Faz 3-6 (backfill, arama, medya önbelleği, periyodik tazelik).
- `CityPickerModal` / `FeedUniversitySheet` gibi diğer `toLocaleLowerCase("tr")`
  kullanan aramalar. `foldTr` onları da düzeltir ama bu planın konusu chat;
  ayrı ve küçük bir tur.
- Cihaz testi: Task 4'ün toast'ı ve Task 6'nın metni simülatörde görülmeli;
  jest ikisinin de mantığını kapsıyor, görünümünü kapsamıyor.
