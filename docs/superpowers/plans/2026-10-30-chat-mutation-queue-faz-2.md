# Faz 2 — Tepki ve silme için kalıcı mutasyon kuyruğu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offline'da verilen tepki ve silme emirleri geri alınmak yerine diske yazılsın, ağ gelince bir kez uygulansın; yalnız kalıcı reddedilince geri alınsın.

**Architecture:** Yeni `pending_mutations` tablosu (v9) emrin KENDİSİNİ taşıyor (`payload_json`), çünkü tepki niyeti `messages` satırından türetilemiyor — ayna optimistik sonucu zaten yazmış durumda ve hangi parçanın bizim olduğu ayırt edilemiyor. PK `(message_id, kind)`: aynı mesaja aynı türden ikinci emir ESKİSİNİ EZER (son-yazan-kazanır), yani kuyruk birikmiyor, tek terminal niyet tutuyor. Tur diski okur, hafızada hiç durum tutmaz — `send_attempts`'in soğuk-açılış tuzağı (Map okunmadan kota ikinci kez düşmesi) burada tasarımla yok.

**Tech Stack:** expo-sqlite (senkron API), Redux Toolkit, jest (`PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest` — node 20 better-sqlite3'te segfault veriyor).

**Spec:** `chat_local_first_roadmap_2026-10.md` → "Faz 2 — Mesaj dışı mutasyonlar da kaybolmasın" (satır 169-201).

## Global Constraints

- **Düzenleme bu fazın DIŞINDA — sebebi backend DEĞİL.** Backend idempotency düzeltmesi 2026-10-30'da indi ve doğrulandı (`ChatService.cs:1959-2016`: sanitize + uzunluk pencerenin üstüne taşınmış, `msg.Content == sanitized` kısa devresi `EditedAt`'e dokunmadan dönüyor, pencere kontrolü altta; `ChatServiceEditIdempotencyTests.cs`'te sekiz test). Asıl sebep şu: **istemcide düzenleme özelliği HİÇ YOK** — `api.ts`'te edit ucu sabiti yok, `chatService`'te metot yok, `ChatScreen`'de el yok. Uygulama düzenlemeyi yalnız hub'dan ALIYOR (`chat/messageEdited`). Kuyruğa alınacak bir eylem olmadığı için `kind` birliği bu fazda `'reaction' | 'delete'`; backend tarafı artık hazır, özellik yazıldığı gün `'edit'` eklenecek.
- **Yayınlanmış migration ASLA düzenlenmez**, yeni sürüm eklenir (`db/migrations.ts` başındaki kural).
- **Rate limit:** tepki + silme uçları `messaging_default` = **200 istek/60sn, TÜM `MessagesController`'da paylaşımlı** (geçmiş sayfalama, `/changes`, backfill aynı kovada). 429 slot HARCAMIYOR.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Önceki iki fazın baskın kusur sınıfı buydu.
- Tüm metinler i18n anahtarı üzerinden; yeni anahtar eklenirse `tr` ve `en` İKİSİ de aynı commit'te.

## Review Focus

1. **Offline'da üst üste tepki değiştirme** — 😀 sonra ❤️ sonra geri 😀: diskte TEK satır kalmalı, `desired` son emoji, `base` İLK emrin gördüğü sunucu değeri (ara değer DEĞİL; yoksa flush yanlış emojiyi silmeye çalışır). → Task 2.
2. **Silmenin tırmanması** — offline'da "benden sil" sonra "herkesten sil": `forEveryone` true'ya çıkar, bir daha false'a DÖNMEZ. Ters sıra da aynı sonucu verir. → Task 2.
3. **Hiç gönderilmemiş mesaja mutasyon** — `message_id` optimistik istemci kimliği; sunucuda böyle bir mesaj yok. Tur bunu ATLAMALI (sonsuza kadar 404 denemesin), mesaj kaybolursa satır BUDANMALI. → Task 3.
4. **Offline'da kalıcı reddedilen tepki** — sistem mesajına tepki (UT-6731): ağ gelince emoji yerinden kalkar VE sebebi söylenir; satır silinir, ebediyen denenmez. → Task 3.
5. **Flush'ın ortasında uygulamanın ölmesi** — satır diskte kalır ve emir bir kez DAHA ateşlenir. Sunucu tarafı idempotent olduğu için (backend 2026-10-29 teyidi: tepki ve silme garantiyi veriyor) sonuç değişmez; test bunu pin'lemeli. → Task 1 (satır hayatta kalıyor) + Task 3 (yeniden ateşleniyor).

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/features/chat/db/migrations.ts` | V9: `pending_mutations` tablosu (ekleme) |
| `src/features/chat/db/rows.ts` | `PendingMutationRow`, `MutationKind` tipleri (ekleme) |
| `src/features/chat/chatRepository.ts` | tablonun TÜM SQL'i (ekleme — chat'in başka hiçbir dosyası chatDb'yi import etmiyor) |
| `src/features/chat/pendingMutationPolicy.ts` | **yeni, saf**: birleştirme, sınıflandırma, backoff, tur tavanları |
| `src/features/chat/pendingMutations.ts` | **yeni**: turu koşan taraf — disk + chatService + dispatch |
| `src/features/chat/screens/ChatScreen.tsx:1337-1443` | `handlePickReaction` / `handleDelete` yeniden bağlanıyor |
| `src/shared/store/chatFlags.ts` | `CHAT_MUTATION_QUEUE_ENABLED` |
| `src/navigation/AppNavigator.tsx:836,1453,1894` | tetikleyiciler — `flushOutbox`'ın yanına |

---

### Task 1: v9 tablosu + depo API'si

**Files:**
- Modify: `src/features/chat/db/migrations.ts` (V9 + `MIGRATIONS` kaydı)
- Modify: `src/features/chat/db/rows.ts` (`SendAttemptRow`'un yanına, satır 192 civarı)
- Modify: `src/features/chat/chatRepository.ts` (`pruneOrphanSendAttempts` bloğunun ardına)
- Test: `tests/features/chat/pendingMutationsRepo.test.ts`

**Interfaces:**
- Consumes: `getChatDb`, `ChatDbDriver` (`db/chatDb.ts`)
- Produces:
  ```ts
  export type MutationKind = 'reaction' | 'delete';
  export interface PendingMutationRow {
    message_id: string;
    kind: MutationKind;
    conversation_id: string;
    payload_json: string;
    attempts: number;
    first_seen_at_ms: number;
    next_eligible_at_ms: number;
    last_error: string | null;
  }
  // chatRepository.ts
  export function readPendingMutations(): PendingMutationRow[];          // first_seen_at_ms ASC
  export function upsertPendingMutation(row: PendingMutationRow): void;  // ON CONFLICT(message_id, kind)
  export function deletePendingMutation(messageId: string, kind: MutationKind): void;
  export function pruneOrphanPendingMutations(): number;                 // silinen satır sayısı
  export function readMessageSendState(messageId: string): SendState | null;
  ```

Şema:
```sql
CREATE TABLE pending_mutations (
  message_id          TEXT NOT NULL,
  kind                TEXT NOT NULL,
  conversation_id     TEXT NOT NULL,
  payload_json        TEXT NOT NULL,
  attempts            INTEGER NOT NULL DEFAULT 0,
  first_seen_at_ms    INTEGER NOT NULL,
  next_eligible_at_ms INTEGER NOT NULL DEFAULT 0,
  last_error          TEXT,
  PRIMARY KEY (message_id, kind)
);
```

V9 yorumunda gerekçelenecek üç karar (hiçbiri koddan okunamıyor):
- **`payload_json` neden var** — `send_attempts` kasten gövdesiz, çünkü gövdenin tek kaynağı `messages` satırı. Burada öyle değil: tepki niyeti (`desired`) `messages.reactions`'tan türetilemez, ayna optimistik listeyi zaten yazdı ve hangi emojinin BİZİM niyetimiz olduğu ile sunucudan gelmiş olanı ayırt edilemez.
- **`permanent` kolonu neden YOK** — gönderimde kalıcı başarısızlık balonu "tekrar dene" hâlinde bırakıyor, yani satırın yaşaması gerekiyor. Tepkide/silmede kullanıcıya sunulan tekrar yolu YOK: kalıcı ret geri alma + toast demek, satır aynı anda silinir. Kolon olsaydı hiçbir şeyin temizlemediği bir çöp hâli üretirdi.
- **PK neden `(message_id, kind)`** — ayrı `op_id` + UNIQUE indeks aynı kısıtın iki kopyası olurdu. Birleştirme (son-yazan-kazanır) PK çatışmasının kendisi.

- [ ] **Step 1: Testleri yaz** — `tests/features/chat/pendingMutationsRepo.test.ts`

```ts
it('upsert aynı (message_id, kind) için satır ÇOĞALTMIYOR, ezip güncelliyor', () => {
  upsertPendingMutation(row({ payload_json: '{"desired":"😀","base":null}' }));
  upsertPendingMutation(row({ payload_json: '{"desired":"❤️","base":null}', attempts: 3 }));
  const all = readPendingMutations();
  expect(all).toHaveLength(1);
  expect(all[0].payload_json).toBe('{"desired":"❤️","base":null}');
  expect(all[0].attempts).toBe(3);
});

it('aynı mesajın tepki ve silme emirleri AYRI satırlar', () => {
  upsertPendingMutation(row({ kind: 'reaction' }));
  upsertPendingMutation(row({ kind: 'delete', payload_json: '{"forEveryone":true}' }));
  expect(readPendingMutations()).toHaveLength(2);
});

it('readPendingMutations first_seen_at_ms ASC sıralı dönüyor', () => { /* 3 satır, karışık sırada yaz */ });

// Review Focus 5: flush ortasında ölüm — satır diskte kalıyor.
it('satır yeni bir bağlantıda da okunuyor (kalıcı, process ömürlü değil)', () => {
  upsertPendingMutation(row({}));
  __resetChatDbForTests();   // aynı dosyaya yeniden bağlan; migration'lar tekrar koşar
  expect(readPendingMutations()).toHaveLength(1);
});

it('pruneOrphanPendingMutations mesajı OLMAYAN satırı siliyor, olanı bırakıyor', () => {
  insertMessage('msg-var');
  upsertPendingMutation(row({ message_id: 'msg-var' }));
  upsertPendingMutation(row({ message_id: 'msg-yok' }));
  expect(pruneOrphanPendingMutations()).toBe(1);
  expect(readPendingMutations().map((r) => r.message_id)).toEqual(['msg-var']);
});

// Ayırt edici: prune yalnız YOKLUĞA bakıyor, gönderim durumuna BAKMIYOR.
// (`send_attempts`'in aksine — orada 'sent' olmak satırı yetim yapıyor,
// burada gönderilmiş olmak mutasyonun ÖN KOŞULU.)
it('pruneOrphanPendingMutations gönderilmiş mesajın satırını SİLMİYOR', () => {
  insertMessage('msg-1', 'sent');
  upsertPendingMutation(row({ message_id: 'msg-1' }));
  expect(pruneOrphanPendingMutations()).toBe(0);
});

it('readMessageSendState pending mesajı pending, olmayanı null döndürüyor', () => { /* … */ });
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat/pendingMutationsRepo.test.ts`
Expected: FAIL — `upsertPendingMutation is not a function`

- [ ] **Step 3: V9'u, tipleri ve beş depo fonksiyonunu yaz**

`MIGRATIONS` dizisine `{ version: 9, up: (db) => db.exec(V9) }`. Depo fonksiyonları `upsertSendAttempt` kalıbını izliyor (`ON CONFLICT … DO UPDATE SET … = excluded.…`). `pruneOrphanPendingMutations` yalnız `NOT EXISTS (SELECT 1 FROM messages WHERE messages.id = pending_mutations.message_id)` — `send_state` terimi YOK, gerekçesi yukarıdaki testin yorumunda.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/db/migrations.ts src/features/chat/db/rows.ts src/features/chat/chatRepository.ts tests/features/chat/pendingMutationsRepo.test.ts
git commit -m "feat(chat): pending_mutations tablosu (v9) — tepki/silme emirleri diske"
```

---

### Task 2: Saf politika — birleştirme, sınıflandırma, tempo

**Files:**
- Create: `src/features/chat/pendingMutationPolicy.ts`
- Test: `tests/features/chat/pendingMutationPolicy.test.ts`

**Interfaces:**
- Consumes: `PendingMutationRow`, `MutationKind` (Task 1); `chatErrorCodeOf`, `chatErrorEffect` (`@/shared/constants/responseCodes`)
- Produces:
  ```ts
  export interface ReactionPayload { desired: string | null; base: string | null }
  export interface DeletePayload { forEveryone: boolean }

  /** Mevcut satır varsa onunla birleştirir; `base` HER ZAMAN eskisinden korunur. */
  export function coalesceReaction(
    existing: ReactionPayload | null, desired: string | null, serverBase: string | null,
  ): ReactionPayload;

  /** `forEveryone` yalnız TIRMANIR. */
  export function coalesceDelete(existing: DeletePayload | null, forEveryone: boolean): DeletePayload;

  export type MutationOutcome = 'done' | 'retry' | 'rejected';
  /** `kind` gerekiyor: silmede UT-6720 (mesaj yok) BAŞARI, tepkide ret. */
  export function classifyMutationError(err: unknown, kind: MutationKind): MutationOutcome;

  export function nextEligibleAt(attempts: number, nowMs: number): number;
  export const MAX_OPS_PER_FLUSH = 20;
  export const MUTATION_RATE_RESERVE = 20;
  /** `remaining === null` (bilinmiyor) → DEVAM. Bilinmemek tükenmek değil. */
  export function shouldStopFlush(remaining: number | null, opsDone: number): boolean;
  ```

Backoff: `send`in eğrisiyle aynı aile — 2sn tabanlı üstel, 5 dakika tavanlı (`2_000 * 2 ** attempts`, `min(…, 300_000)`).

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 1
it('üst üste tepki değişimi: desired son değer, base İLK emrin gördüğü sunucu değeri', () => {
  const a = coalesceReaction(null, '😀', '❤️');       // sunucuda ❤️ varken 😀 seçildi
  const b = coalesceReaction(a, '👍', '😀');          // ikinci dokunuş; "sunucu" artık optimistik 😀 görüyor
  expect(b).toEqual({ desired: '👍', base: '❤️' });   // base ARA DEĞERE kaymadı
});

it('tepkiyi kaldırma emri desired:null olarak birleşiyor, base korunuyor', () => {
  expect(coalesceReaction({ desired: '😀', base: '❤️' }, null, '😀')).toEqual({ desired: null, base: '❤️' });
});

it('ilk emirde base sunucudan geleni alıyor', () => {
  expect(coalesceReaction(null, '😀', null)).toEqual({ desired: '😀', base: null });
});

// Review Focus 2
it('silme yalnız tırmanıyor: true geldiyse sonraki false onu DÜŞÜRMÜYOR', () => {
  expect(coalesceDelete({ forEveryone: true }, false)).toEqual({ forEveryone: true });
  expect(coalesceDelete({ forEveryone: false }, true)).toEqual({ forEveryone: true });
});

it('silmede UT-6720 BAŞARI, tepkide ret', () => {
  const gone = { response: { data: { errorCode: 'UT-6720' } } };
  expect(classifyMutationError(gone, 'delete')).toBe('done');
  expect(classifyMutationError(gone, 'reaction')).toBe('rejected');
});

it('kalıcı sınıflar rejected: sistem mesajına tepki, geçersiz emoji, kapalı sohbet, erişim yok', () => {
  // UT-6731 REACTION_ON_SYSTEM, UT-6730 REACTION_BAD_EMOJI (ikisi de
  // actionRejected/inputInvalid), UT-6740 CONVERSATION_CLOSED, UT-6713
  // CONVERSATION_NOT_FOUND (conversationGone).
  for (const code of ['UT-6731', 'UT-6730', 'UT-6740', 'UT-6713'])
    expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'reaction')).toBe('rejected');
});

it('silmede DELETE_SYSTEM (UT-6725) ve DELETE_NOT_OWNER rejected', () => {
  for (const code of ['UT-6725', 'UT-6704'])
    expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'delete')).toBe('rejected');
});

it('ağ hatası ve 5xx retry — kodsuz gövde kalıcı SAYILMIYOR', () => {
  expect(classifyMutationError(new Error('Network Error'), 'reaction')).toBe('retry');
  expect(classifyMutationError({ response: { status: 503, data: {} } }, 'delete')).toBe('retry');
});

it('429 retry — slot harcamadığı için ceza yok', () => { /* status 429 */ });

it('nextEligibleAt üstel ve 5 dakikada tavanlanıyor', () => {
  expect(nextEligibleAt(0, 1_000)).toBe(3_000);
  expect(nextEligibleAt(10, 1_000)).toBe(301_000);
});

// Review Focus: bilinmeyen bütçe turu ÖLDÜRMEMELİ (Faz 3'te bu hatayı yaptık).
it('shouldStopFlush: remaining null iken DEVAM, rezervin altında DUR', () => {
  expect(shouldStopFlush(null, 0)).toBe(false);
  expect(shouldStopFlush(MUTATION_RATE_RESERVE - 1, 0)).toBe(true);
  expect(shouldStopFlush(500, MAX_OPS_PER_FLUSH)).toBe(true);
});
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**

- [ ] **Step 3: `pendingMutationPolicy.ts`'i yaz** — yan etki YOK, store/ağ/zamanlayıcı import etmiyor (`backfillPolicy.ts` ile aynı sözleşme). `classifyMutationError` sınıflandırmayı `chatErrorEffect`'e devrediyor: `conversationGone | messageGone | actionRejected | inputInvalid | clientBug` → `rejected`, `null` → `retry`; tek istisna `kind === 'delete' && effect === 'messageGone'` → `done`.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/pendingMutationPolicy.ts tests/features/chat/pendingMutationPolicy.test.ts
git commit -m "feat(chat): mutasyon kuyrugu politikasi — birlestirme, siniflandirma, tempo"
```

---

### Task 3: Turu koşan taraf

**Files:**
- Create: `src/features/chat/pendingMutations.ts`
- Test: `tests/features/chat/pendingMutations.test.ts`

**Interfaces:**
- Consumes: Task 1'in beş depo fonksiyonu; Task 2'nin tamamı; `chatService.addReaction/removeReaction/deleteMessage`; `reactionsChanged`, `messageEdited` (`chatSlice`); `remainingNow` (`@/shared/services/rateLimitBudget`); `isOfflineNow` (`@/shared/services/networkStatus`); `showInfoToast`
- Produces:
  ```ts
  export function enqueueReaction(args: {
    messageId: string; conversationId: string; desired: string | null; serverBase: string | null;
  }): void;
  export function enqueueDelete(args: {
    messageId: string; conversationId: string; forEveryone: boolean;
  }): void;
  export interface FlushResult { ran: boolean; done: number; retried: number; rejected: number }
  export async function flushPendingMutations(trigger: string): Promise<FlushResult>;
  export function __resetPendingMutationsForTests(): void;
  ```

Tur, satır başına:
1. `readMessageSendState(message_id) !== 'sent'` → **ATLA** (optimistik kimlik sunucuda yok). Satır KALIR: mesaj gönderilince sıradaki tur onu alır.
2. `next_eligible_at_ms > now` → atla.
3. `kind === 'reaction'`: `base && base !== desired` ise `removeReaction(messageId, base)`; `desired` varsa `addReaction(messageId, desired)`. Sunucu tam listeyi dönüyor → `reactionsChanged` ile kanonikleştir.
4. `kind === 'delete'`: `deleteMessage(messageId, forEveryone)`.
5. `done` → satırı sil. `retry` → `attempts + 1`, `nextEligibleAt`, `last_error`. `rejected` → satırı sil + geri al + toast.

Geri alma (`rejected`): tepkide listeden BENİM emojim çıkarılır, `base` varsa geri konur; silmede `messageEdited` ile anlık görüntü yazılır. **Diğer kullanıcıların sayıları bu geri almada tazelenmiyor** — sonraki hub event'i ya da geçmiş sayfası düzeltir. Kuyruk anlık görüntü tutsaydı o görüntü de bayat olurdu; dosya yorumunda böyle yazılacak, "tam geri alma" İDDİA EDİLMEYECEK.

Tek-uçuş kilidi: eşzamanlı tur yok (`flushOutbox`'ın `inFlight` kalıbı). `isOfflineNow()` → `{ ran: false }`.

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 3
it('gönderilmemiş mesajın mutasyonu AĞA ÇIKMIYOR ve satır diskte KALIYOR', async () => {
  insertMessage('cmid-1', 'pending');
  enqueueReaction({ messageId: 'cmid-1', conversationId: 'c1', desired: '😀', serverBase: null });
  const r = await flushPendingMutations('test');
  expect(addReaction).not.toHaveBeenCalled();
  expect(r.done).toBe(0);
  // Ayırt edici: satır SİLİNMEDİ — mesaj gönderilince emir hâlâ uygulanacak.
  expect(readPendingMutations()).toHaveLength(1);
});

it('mesaj gönderildikten sonra aynı satır uygulanıyor', async () => {
  // ilk turda pending, sonra 'sent' yapıp ikinci tur
  expect(addReaction).toHaveBeenCalledWith('msg-1', '😀');
  expect(readPendingMutations()).toHaveLength(0);
});

it('base varsa önce remove sonra add çağrılıyor', async () => { /* çağrı sırası assert */ });

it('desired null iken yalnız remove çağrılıyor, add HİÇ çağrılmıyor', async () => { /* … */ });

it('sunucunun döndüğü liste kanonik hale geliyor', async () => {
  addReaction.mockResolvedValue([{ emoji: '😀', count: 2, userIds: ['me', 'other'] }]);
  await flushPendingMutations('test');
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
    type: 'chat/reactionsChanged',
    payload: expect.objectContaining({ reactions: [{ emoji: '😀', count: 2, userIds: ['me', 'other'] }] }),
  }));
});

// Review Focus 4
it('kalıcı ret: satır silinip tepki geri alınıyor VE sebep söyleniyor', async () => {
  addReaction.mockRejectedValue({ response: { data: { errorCode: 'UT-6731' } } });
  const r = await flushPendingMutations('test');
  expect(r.rejected).toBe(1);
  expect(readPendingMutations()).toHaveLength(0);           // ebediyen denenmiyor
  expect(showInfoToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  // Ayırt edici: geri alma gerçekten listeden ÇIKARIYOR.
  expect(lastReactionsDispatched()).toEqual([]);
});

it('ağ hatası: satır KALIYOR, attempts artıyor, backoff yazılıyor, toast YOK', async () => {
  addReaction.mockRejectedValue(new Error('Network Error'));
  await flushPendingMutations('test');
  const [row] = readPendingMutations();
  expect(row.attempts).toBe(1);
  expect(row.next_eligible_at_ms).toBeGreaterThan(Date.now());
  expect(showInfoToast).not.toHaveBeenCalled();
});

it('backoff dolmamış satır atlanıyor', async () => { /* next_eligible_at_ms gelecekte */ });

it('silmede UT-6720 BAŞARI sayılıyor: satır siliniyor, geri alma YOK', async () => {
  deleteMessage.mockRejectedValue({ response: { data: { errorCode: 'UT-6720' } } });
  const r = await flushPendingMutations('test');
  expect(r.done).toBe(1);
  expect(readPendingMutations()).toHaveLength(0);
  expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'chat/messageEdited' }));
});

// Review Focus 5
it('başarıdan sonra ikinci tur aynı emri TEKRAR göndermiyor', async () => {
  await flushPendingMutations('test');
  await flushPendingMutations('test');
  expect(addReaction).toHaveBeenCalledTimes(1);
});

it('offline iken tur koşmuyor ve hiçbir satıra dokunmuyor', async () => {
  (isOfflineNow as jest.Mock).mockReturnValue(true);
  expect((await flushPendingMutations('test')).ran).toBe(false);
  expect(readPendingMutations()[0].attempts).toBe(0);
});

it('bütçe rezervin altındayken tur KISILIYOR, kalan satırlar diskte duruyor', async () => {
  // remainingNow → MUTATION_RATE_RESERVE - 1, iki satır kuyrukta
  expect(addReaction).not.toHaveBeenCalled();
  expect(readPendingMutations()).toHaveLength(2);
});

it('MAX_OPS_PER_FLUSH tavanı aşılmıyor', async () => { /* 25 satır → 20 çağrı */ });

it('eşzamanlı iki flush çağrısı emri iki kez göndermiyor', async () => {
  await Promise.all([flushPendingMutations('a'), flushPendingMutations('b')]);
  expect(addReaction).toHaveBeenCalledTimes(1);
});

it('tur başında yetim satırlar budanıyor', async () => { /* mesajı olmayan satır → silinmiş */ });
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**

- [ ] **Step 3: `pendingMutations.ts`'i yaz**

`enqueue*` fonksiyonları mevcut satırı `readPendingMutations()` içinden bulup Task 2'nin `coalesce*`'ına veriyor, sonucu `upsertPendingMutation` ile yazıyor; **`attempts` ve `next_eligible_at_ms` yeni emirde SIFIRLANIR** (yeni niyet eski backoff'u miras almaz), `first_seen_at_ms` mevcut satırdan korunur.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/pendingMutations.ts tests/features/chat/pendingMutations.test.ts
git commit -m "feat(chat): mutasyon kuyrugu turu — tepki/silme bir kez uygulaniyor"
```

---

### Task 4: ChatScreen'i kuyruğa bağla

**Files:**
- Modify: `src/features/chat/screens/ChatScreen.tsx:1337-1398` (`handlePickReaction`), `:1405-1443` (`handleDelete`)
- Modify: `src/shared/store/chatFlags.ts`
- Modify: `src/shared/i18n/translations/tr.ts`, `src/shared/i18n/translations/en.ts` (yeni anahtar gerekiyorsa — İKİSİ de aynı commit'te)
- Test: `tests/features/chat/chatMutationHandlers.test.ts`

**Interfaces:**
- Consumes: `enqueueReaction`, `enqueueDelete`, `flushPendingMutations` (Task 3); `CHAT_MUTATION_QUEUE_ENABLED`
- Produces: davranış değişikliği — yeni dışa açık arayüz yok

İki el de aynı şekle dönüyor: optimistik dispatch (bugünkü gibi) → `enqueue*` → `void flushPendingMutations('interactive')`. **Başarısızlıkta artık geri alma YOK** — geri almanın tek sahibi tur (Task 3, `rejected` dalı). `handlePickReaction`'ın `serverBase`'i, `applyReactionPick`'in girdisi olan `prev` listesinden BENİM emojim olarak hesaplanıyor.

Bayrak kapalıyken bugünkü yol harfiyen duruyor (doğrudan REST + başarısızlıkta geri alma).

- [ ] **Step 1: Testleri yaz**

```ts
it('tepki: optimistik dispatch + kuyruğa yazma + tur tetikleme', async () => { /* … */ });

it('tepki ağ hatasında ARTIK GERİ ALINMIYOR — emoji yerinde kalıyor', async () => {
  // Ayırt edici iddia: bu fazın tamamı bu satır. Eski kodda prev listesi geri
  // dispatch ediliyordu (ChatScreen.tsx:1377-1383).
  expect(dispatchedReactionPayloads()).toHaveLength(1);
});

it('serverBase benim mevcut emojimden hesaplanıyor, başkasının emojisinden DEĞİL', async () => {
  // prev: [{emoji:'❤️',userIds:['other']},{emoji:'😀',userIds:['me']}] → base '😀'
});

it('silme: optimistik dispatch + kuyruğa yazma, Alert YOK', async () => { /* … */ });

it('bayrak kapalıyken eski yol: REST doğrudan, hata geri alıyor, kuyruğa YAZILMIYOR', async () => {
  // AYRI DOSYA gerekiyor — bayrak modül yüklenirken okunuyor
  // (chatBackfill.killSwitch.test.ts'teki aynı kısıt).
});
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**

- [ ] **Step 3: İki eli ve bayrağı yaz** — `CHAT_MUTATION_QUEUE_ENABLED = true`, chatFlags.ts'in diğer bayrakları gibi "kapatmak neyi geri getirir" gerekçesiyle belgelenerek.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**

- [ ] **Step 5: Commit**

```bash
git add src/features/chat/screens/ChatScreen.tsx src/shared/store/chatFlags.ts src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts tests/features/chat/chatMutationHandlers.test.ts
git commit -m "feat(chat): tepki ve silme kuyruga bagli — basarisizlikta geri alinmiyor"
```

---

### Task 5: Tetikleyiciler + kill switch

**Files:**
- Modify: `src/navigation/AppNavigator.tsx:836,1453,1894` (`flushOutbox`'ın yanına)
- Test: `tests/features/chat/pendingMutations.killSwitch.test.ts`

**Interfaces:**
- Consumes: `flushPendingMutations` (Task 3), `CHAT_MUTATION_QUEUE_ENABLED` (Task 4)
- Produces: —

Üç tetik, `flushOutbox`'ın BİREBİR yanında: `online` (`OUTBOX_ONLINE_DELAY_MS` gecikmeli), `reconnect`, `foreground`. Ayrı bir zamanlayıcı KURULMUYOR — mutasyonlar gönderimle aynı anlarda anlamlı hale geliyor ve ikinci bir tempo kaynağı paylaşılan rate limit kovasında iki bağımsız tüketici demek olurdu.

- [ ] **Step 1: Testleri yaz**

```ts
// Bayrak modül yüklenirken okunduğu için AYRI dosya.
it('bayrak kapalıyken flushPendingMutations ran:false ve hiçbir uca istek gitmiyor', async () => {
  insertMessage('msg-1', 'sent');
  upsertPendingMutation(row({ message_id: 'msg-1' }));   // boş kuyrukta iddia hiçbir şey ispatlamaz
  const r = await flushPendingMutations('test');
  expect(r.ran).toBe(false);
  expect(addReaction).not.toHaveBeenCalled();
  expect(readPendingMutations()).toHaveLength(1);        // satır KORUNUYOR — geri almak veri kaybettirmiyor
});
```

- [ ] **Step 2: Testi koştur, BAŞARISIZ olduğunu gör**

- [ ] **Step 3: Bayrak kapısını `flushPendingMutations`'ın başına, üç tetiği AppNavigator'a ekle**

- [ ] **Step 4: Chat + shared paketinin TAMAMINI koştur**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/features/chat tests/shared`
Expected: PASS — Faz 1/3'ten gelen 592 test dahil hepsi yeşil

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.tsx src/features/chat/pendingMutations.ts tests/features/chat/pendingMutations.killSwitch.test.ts
git commit -m "feat(chat): mutasyon kuyrugu tetikleyicileri + CHAT_MUTATION_QUEUE_ENABLED"
```

---

## Fazdan sonra açık kalanlar

- **Düzenleme** — backend tarafı hazır ve doğrulandı, ama istemcide özellik yok. Yazılırsa iş sırası: `MESSAGES_EDIT` ucu + `chatService.editMessage` + ChatScreen'de el, SONRA `kind: 'edit'` ve `{ content, base }` payload'ı. Tablo ve tur değişmiyor. Tek yeni davranış kararı: offline'da 15 dakikadan uzun bekleyen DEĞİŞTİRİLMİŞ içerik `UT-6723` alır — bu meşru bir ret, `rejected` dalına düşer (geri al + söyle).
- **Cihaz testi** — kalıcı ret toast'ı (uçak modunda sistem mesajına tepki) ve geri almanın görsel sonucu simülatörde doğrulanmadı.
- **`markRead` / `markMessageDelivered`** kasten kuyruk dışında (roadmap satır 185-191): mevcut iki mekanizma açığı büyük ölçüde kapatıyor, kalan açık bu makineyi hak etmiyor.
