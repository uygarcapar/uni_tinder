# Kalan üç local-first açığı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roadmap bittikten sonra bilerek açık bırakılan üç boşluğu kapatmak: okundu bildiriminin kaybolabilmesi, engellenen kişinin sesinin diskte kalması, ve reddedilen düzenlemenin yanlış rozet bırakması.

**Architecture:** Üçü de mevcut makineye ekleme — yeni tablo, yeni tur, yeni migration YOK. Biri mutasyon kuyruğuna dördüncü tür, biri var olan silme transaction'ına bir satır, biri var olan payload'a bir alan.

**Spec:** `chat_local_first_roadmap_2026-10.md` → Faz 2'nin "üçüncü sınıf" notu (satır ~185-191). Diğer ikisi inceleme bulgusu.

## Kullanıcı bilerek bir kararı tersine çeviriyor — kaydı

Roadmap `markRead`/`markMessageDelivered`'i **kasten** kuyruk dışında bıraktı: *"Küçük; kuyruğa almak bu kadar kazanç için fazla makine olurdu."* Bugün iki telafisi var ve ikisi de çalışıyor — sohbete yeniden girmek `markRead`'i tekrar çağırıyor (`ChatScreen.tsx:1065`), ve `upsertConversations`'ın (2) numaralı kuralı yerel "okundu"yu sunucunun bayat `unreadCount`'una karşı koruyor. Kalan açık dar: **çağrı hiç tutmazsa** karşı tarafın tiki biz o sohbete yeniden girene kadar gelmiyor.

Kullanıcı kapatılmasını istedi. Kapsam `markRead` ile SINIRLI:

- **`markMessageDelivered` kuyruğa ALINMIYOR.** Görünen her okunmamış mesaj için ateşleniyor (`ChatScreen.tsx:1053`); kuyruğa almak sohbet başına onlarca satır üretir ve paylaşımlı kotayı bir tik için yakar. Roadmap'in tarif ettiği açık da zaten `markRead`e ait.

## Global Constraints

- **Migration YOK, yeni tablo YOK.** `pending_mutations.kind` TEXT; dördüncü tür oraya giriyor.
- **Rate limit kovası PAYLAŞIMLI:** `messaging_default` = 200 istek/60sn, TÜM `MessagesController`'da. Geçmiş sayfalama, backfill (80 rezerv), mutasyon kuyruğu (20 rezerv) ve periyodik tazelik turu aynı kovadan içiyor.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Bu işin baskın kusur sınıfı — yedi fazda 40+ bulgu, ve son üç dalda **sekiz test** "pin'lediğini söylediği satır silinince hâlâ geçiyor" diye yakalandı. Her testi konusunu KIRARAK doğrula.
- **Asla `git checkout`/`restore`/`stash`/`reset` çalıştırma.** Kullanıcının ~40 commit'lenmemiş dosyası ve kendi stash'i bu ağaçta; önceki dallarda iki ajan bu yüzden olay çıkardı. Testi kırarak doğrularken dosyayı EDİTÖRLE değiştir ve geri al.
- Türkçe yorumlar, çevre dosyaların ses ve yoğunluğuyla.

## Review Focus

1. **`markRead` SOHBET anahtarlı, kuyruğun PK'sı `(message_id, kind)`.** Hedef kimliği oraya yazılırsa turun `readMessageSendState(message_id) !== 'sent'` kapısı onu ASLA `sent` görmez ve satır **sonsuza dek atlanır** — görünürde kuyrukta duran, hiç gönderilmeyen bir emir. Kapının bu türü muaf tutması gerekiyor. → Task 1.
2. **Okundu emri birikmemeli.** Aynı sohbete tekrar girmek yeni satır ÜRETMEMELİ; `(target, kind)` PK'sı bunu zaten veriyor ama coalescing'in payload'ı ezmesi doğrulanmalı. → Task 1.
3. **Engelleme silmesi dosyaları AYNI transaction'da götürmeli.** Bugün açılış süpürgesine bırakılıyor; o yolun kendi yorumu "gizlilik aksiyonu, disk değil" diyor, yani bir sonraki soğuk açılışa kadar beklemek iddiayla çelişiyor. → Task 2.
4. **Reddedilen düzenleme rozeti de geri almalı.** `revertEdit` bugün `content`i `base`e döndürüyor ama `editedAt`e dokunmuyor: mesaj orijinal metniyle ama "düzenlendi" rozetiyle kalıyor. Hem Redux hem disk dalında. → Task 3.
5. **`editedAt`'in ÖNCEKİ değeri taşınmalı**, `null` varsayılmamalı: daha önce bir kez düzenlenmiş mesajın ikinci düzenlemesi reddedilirse rozet HAKLI olarak kalmalı. → Task 3.

---

### Task 1: `markRead` kuyruğa giriyor

**Files:**
- Modify: `src/features/chat/db/rows.ts` (`MutationKind`), `src/features/chat/pendingMutationPolicy.ts`, `src/features/chat/pendingMutations.ts`, `src/features/chat/screens/ChatScreen.tsx:1065`
- Test: `tests/features/chat/pendingMutations.test.ts`, `tests/features/chat/pendingMutationPolicy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MutationKind = 'reaction' | 'delete' | 'edit' | 'read';
  /** Okundu emrinin gövdesi YOK — hedef ve tür her şeyi söylüyor. */
  export interface ReadPayload { /* boş */ }
  export function enqueueMarkRead(conversationId: string): void;
  ```

Turun dalı: `kind === 'read'` → `chatService.markRead(row.conversation_id)` → başarı satırı siliyor. **Geri alma YOK** — okundu bilgisinin geri alınacak optimistik bir karşılığı yok (rozet zaten yerelde düştü ve `upsertConversations` onu koruyor). Kalıcı ret de satırı siliyor, sessizce: kullanıcıya "okundu bildirimi gönderilemedi" demek bilgi değil gürültü.

`message_id` kolonuna sohbet kimliği yazılıyor ve bu yorumla belgeleniyor: kolon artık "hedef kimliği", türü `kind` söylüyor. **Send-state kapısı `kind === 'read'` için ATLANIYOR** (Review Focus 1).

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 1 — AYIRT EDİCİ: kapı muaf tutmazsa satır sonsuza dek atlanır.
it('read emri gönderim-durumu kapısına TAKILMIYOR ve sunucuya gidiyor', async () => {
  enqueueMarkRead('conv-1');
  await flushPendingMutations('test');
  expect(markRead).toHaveBeenCalledWith('conv-1');
  expect(readPendingMutations()).toHaveLength(0);
});

// Review Focus 2
it('aynı sohbete ikinci kez girmek satır ÇOĞALTMIYOR', () => {
  enqueueMarkRead('conv-1');
  enqueueMarkRead('conv-1');
  expect(readPendingMutations().filter((r) => r.kind === 'read')).toHaveLength(1);
});

it('ağ hatasında satır KALIYOR ve backoff yazılıyor', async () => { /* … */ });
it('kalıcı rette satır siliniyor ve TOAST YOK', async () => { /* … */ });
it('farklı sohbetler ayrı satırlar', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): okundu bildirimi kalici kuyruga girdi`

---

### Task 2: Engelleme silmesi sesi de götürüyor

**Files:**
- Modify: `src/features/chat/chatRepository.ts` (`removeConversationLocally`), `src/features/chat/mediaCache.ts` ya da çağıran
- Test: `tests/features/chat/mediaCache.test.ts`

Bugün önbellek dosyaları açılış süpürgesine (`reconcileMediaCacheDirectory`) bırakılıyor. `removeConversationLocally` engelleme/hesap silme yolu ve **kendi yorumu** ertelemeyi kabul edilemez ilan ediyor — o sohbetin önbellek dosyaları aynı anda gitmeli.

Dikkat: `chatRepository.ts` `mediaCache.ts`'i import EDEMEZ (döngü — Faz 5'te ölçüldü). Silinecek yolları döndürüp çağırana sildirmek ya da çağrı yerini middleware'e taşımak gerekiyor; hangisini seçtiğini gerekçesiyle yaz.

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 3
it('engelleme silmesi o sohbetin önbellek DOSYALARINI da siliyor', () => { /* … */ });
it('başka sohbetin dosyasına DOKUNMUYOR', () => { /* … */ });
it('dosya silme patlasa da satırlar gidiyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `fix(chat): engelleme silmesi onbellek dosyalarini da goturuyor`

---

### Task 3: Reddedilen düzenleme rozeti de geri alıyor

**Files:**
- Modify: `src/features/chat/pendingMutationPolicy.ts` (`EditPayload`, `coalesceEdit`), `src/features/chat/pendingMutations.ts` (`enqueueEdit`, `revertEdit`), `src/features/chat/screens/ChatScreen.tsx` (enqueue çağrısı)
- Test: `tests/features/chat/pendingMutationPolicy.test.ts`, `tests/features/chat/pendingMutations.test.ts`

`EditPayload` `baseEditedAt: string | null` kazanıyor. `coalesceEdit` onu `base` ile AYNI kuralla koruyor: ilk emrin gördüğü değer, sonraki birleştirmelerde kaymıyor. `revertEdit` hem Redux hem disk dalında `editedAt`i o değere döndürüyor.

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 4
it('reddedilen düzenleme editedAt'i de geri alıyor (Redux dalı)', async () => {
  // base editedAt null → ret → dispatch edilen editedAt null
});
it('soğuk store dalında da diske null yazılıyor', async () => { /* … */ });

// Review Focus 5 — AYIRT EDİCİ: null VARSAYILMAMALI
it('daha önce düzenlenmiş mesajın ikinci düzenlemesi reddedilince rozet KALIYOR', async () => {
  // baseEditedAt = '2026-01-01T00:00:00Z' → ret → o değere dönüyor, null'a DEĞİL
});
it('coalesceEdit baseEditedAt'i İLK emrinkinde tutuyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `fix(chat): reddedilen duzenleme duzenlendi rozetini de geri aliyor`

---

## Fazdan sonra açık kalanlar

- `markMessageDelivered` kasten kuyruk dışında (yukarıdaki gerekçe).
- Resim/video content type'ları ürüne girmedi.
- Hiçbiri cihazda koşmadı.
