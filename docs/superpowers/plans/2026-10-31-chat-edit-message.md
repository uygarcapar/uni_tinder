# Mesaj düzenleme — istemci tarafı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcı kendi metin mesajını düzenleyebilsin; düzenleme offline'da da kaybolmasın, pencere dolduğunda sessizce yutulmasın.

**Architecture:** Düzenleme, Faz 2'de kurulan **kalıcı mutasyon kuyruğunun üçüncü türü** oluyor (`kind: 'edit'`). Tablo, tur, backoff, kalıcı-ret yolu ve "pencereli bucket" korumaları olduğu gibi devralınıyor; yeni makine YOK. Ekran tarafında composer'ın mevcut `replyTo` şeridi düzenleme modunun kalıbı.

**Tech Stack:** React Native/Expo, expo-sqlite (senkron), Redux Toolkit, jest (`PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest`).

**Spec:** Bu iş roadmap'te yok — kaynağı backend'in 2026-10-30'da indirdiği idempotency sözleşmesi ve istemcide düzenleme özelliğinin hiç olmaması.

## Bu işin önkoşulu kapandı — doğrulandı

Backend `EditMessageAsync` düzeltmesi indi (`UniversityTinder/Services/ChatService.cs:1959-2016`, kendim okudum): `SanitizeContent` + uzunluk kontrolü pencere kontrolünün ÜSTÜNE taşındı, `msg.Content == sanitized` kısa devresi `EditedAt`'e dokunmadan ve fanout atmadan dönüyor, pencere kontrolü (`UT-6723`) kısa devrenin ALTINDA. `ChatServiceEditIdempotencyTests.cs`'te sekiz test var.

**Bu olmadan kuyruk kurulamazdı:** ack'i görülmemiş bir düzenlemenin retry'si `UT-6723` alır, kuyruk bunu "başarısız" sayar ve kullanıcı gitmiş bir düzenlemeyi gitmemiş sanırdı.

**İstemcide bugün HİÇBİR ŞEY yok** (tarandı): `api.ts`'te uç sabiti yok, `chatService`'te metot yok, `MessageActionSheet`'te eylem yok, `MutationKind = 'reaction' | 'delete'`. Uygulama düzenlemeyi yalnız hub'dan ALIYOR (`chat/messageEdited`).

## Global Constraints

- **Yeni mutasyon makinesi YOK.** `pending_mutations` tablosu, `pendingMutations.ts` turu, backoff, `MUTATION_MAX_ATTEMPTS`/`MUTATION_MAX_AGE_MS` tavanları ve `isWindowed` korumaları devralınıyor. Migration GEREKMİYOR — `kind` zaten TEXT.
- **`prependToBucket` tek kapı kuralı** (Faz 2 review turu 5) bozulmayacak; düzenleme zaten ekleme yapmıyor, mevcut satırı güncelliyor.
- **Pencere (15 dk) istemcide SAVUNMA, sunucuda KARAR.** Eylem penceresi dolmuş mesajda gösterilmeyecek, ama istemci saatine güvenilmeyecek: reddi sunucu veriyor ve `UT-6723` kalıcı ret olarak ele alınıyor.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Bu işin baskın kusur sınıfı — beş fazda 30+ bulgu, ve YALNIZ Faz 5'te dört test "pin'lediğini söylediği satır silinince hâlâ geçiyor" diye yakalandı.
- Yeni i18n anahtarı `tr.ts` ve `en.ts`'e **aynı commit'te**.
- Türkçe yorumlar, çevre dosyaların ses ve yoğunluğuyla.

## Review Focus

1. **Offline'da 15 dakikadan uzun bekleyen DEĞİŞTİRİLMİŞ düzenleme.** Sunucu `UT-6723` döndürür; bu MEŞRU bir ret. Kuyruk geri almalı VE sebebini söylemeli — sessizce düşürmek, fazın tam tersini yapar. → Task 2.
2. **Aynı içerikle retry BAŞARILI sayılmalı.** Backend kısa devresi 200 + DTO dönüyor; istemci bunu hata sanarsa kullanıcı gitmiş düzenlemeyi gitmemiş görür. → Task 2.
3. **Eylem, düzenlenemeyecek mesajda GÖRÜNMEMELİ** — başkasının mesajı, sistem mesajı, silinmiş, metin olmayan, pencere dolmuş, VE henüz gönderilmemiş (optimistik kimlikli). Hep başarısız olacak bir seçenek sunmak, hiç sunmamaktan kötü. → Task 3.
4. **Optimistik düzenleme restart'ı atlatmalı.** Kuyrukta olduğu için diskte; balon kapanıp açılınca yeni metni göstermeli, eskiye dönmemeli. → Task 3.
5. **Boş ya da yalnız boşluk içerik gönderilmemeli** (backend `EmptyContent` atar) ve **2000 karakter** üstü de (sunucu `ContentTooLong`). İkisi de ağa çıkmadan kesilmeli. → Task 1.

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/shared/constants/api.ts` | `MESSAGES_EDIT` ucu |
| `src/features/chat/chatService.ts` | `editMessage` |
| `src/features/chat/db/rows.ts` | `MutationKind`'a `'edit'` |
| `src/features/chat/pendingMutationPolicy.ts` | `EditPayload`, `coalesceEdit`, sınıflandırmada `UT-6723` |
| `src/features/chat/pendingMutations.ts` | `enqueueEdit` + turun edit dalı + geri alma |
| `src/features/chat/components/MessageActionSheet.tsx` | "Düzenle" eylemi ve kapıları |
| `src/features/chat/screens/ChatScreen.tsx` | düzenleme modu (composer) + optimistik dispatch |

---

### Task 1: Uç, servis, tip ve politika

**Files:**
- Modify: `src/shared/constants/api.ts`, `src/features/chat/chatService.ts`, `src/features/chat/db/rows.ts`, `src/features/chat/pendingMutationPolicy.ts`
- Test: `tests/features/chat/pendingMutationPolicy.test.ts` (mevcut dosyaya ekleme)

**Interfaces:**
- Produces:
  ```ts
  // api.ts
  MESSAGES_EDIT: (msgId: string) => `/api/messages/${msgId}`,
  // chatService.ts — PATCH; sunucu MessageDto döner
  async editMessage(messageId: string, content: string): Promise<MessageDto>
  // rows.ts
  export type MutationKind = 'reaction' | 'delete' | 'edit';
  // pendingMutationPolicy.ts
  export interface EditPayload { content: string; base: string }
  /** Son yazan kazanır; `base` İLK emrin gördüğü içerik, hep korunur. */
  export function coalesceEdit(existing: EditPayload | null, content: string, serverBase: string): EditPayload;
  export const EDIT_MAX_LENGTH = 2000;
  /** Ağa çıkmadan kesilecek haller: boş/yalnız boşluk, tavan üstü, değişmemiş. */
  export function editRejectReason(content: string, base: string): 'empty' | 'tooLong' | 'unchanged' | null;
  ```

`classifyMutationError`'a `kind === 'edit'` dalı: `UT-6723` (pencere doldu) **`rejected`** — meşru ret, geri alınmalı. Diğer edit kodları (`UT-6721` sistem, `UT-6722` silinmiş, `UT-6724` metin değil, `UT-6703` sahiplik) zaten `actionRejected` üzerinden `rejected`'a düşüyor; doğrula, yeniden tanımlama.

- [ ] **Step 1: Testleri yaz**

```ts
it('coalesceEdit son içeriği alıyor, base İLK emrinkini koruyor', () => {
  const a = coalesceEdit(null, 'ikinci', 'orijinal');
  const b = coalesceEdit(a, 'ucuncu', 'ikinci');
  expect(b).toEqual({ content: 'ucuncu', base: 'orijinal' });
});

// Review Focus 5
it('editRejectReason: boş, yalnız boşluk, tavan üstü ve DEĞİŞMEMİŞ içeriği kesiyor', () => {
  expect(editRejectReason('', 'a')).toBe('empty');
  expect(editRejectReason('   ', 'a')).toBe('empty');
  expect(editRejectReason('x'.repeat(EDIT_MAX_LENGTH + 1), 'a')).toBe('tooLong');
  expect(editRejectReason('ayni', 'ayni')).toBe('unchanged');
  expect(editRejectReason('yeni', 'eski')).toBeNull();
});

// Review Focus 1
it('UT-6723 edit için rejected — pencere dolması MEŞRU ret', () => {
  expect(classifyMutationError({ response: { data: { errorCode: 'UT-6723' } } }, 'edit')).toBe('rejected');
});

it('edit için ağ hatası retry, kalıcı edit kodları rejected', () => {
  expect(classifyMutationError(new Error('Network Error'), 'edit')).toBe('retry');
  for (const code of ['UT-6721', 'UT-6722', 'UT-6724', 'UT-6703'])
    expect(classifyMutationError({ response: { data: { errorCode: code } } }, 'edit')).toBe('rejected');
});
```

- [ ] **Step 2-4: RED → yaz → GREEN.** `pendingMutationPolicy.ts` SAF kalıyor.
- [ ] **Step 5: Commit** — `feat(chat): duzenleme ucu, servisi ve kuyruk politikasi`

---

### Task 2: Turun düzenleme dalı

**Files:**
- Modify: `src/features/chat/pendingMutations.ts`
- Test: `tests/features/chat/pendingMutations.test.ts` (mevcut dosyaya ekleme)

**Interfaces:**
- Produces:
  ```ts
  export function enqueueEdit(args: {
    messageId: string; conversationId: string; content: string; serverBase: string;
  }): void;
  ```

Tur dalı: `kind === 'edit'` → `chatService.editMessage(messageId, payload.content)` → sunucunun döndürdüğü DTO ile `messageEdited` dispatch'i (kanonikleştirme, tepkideki kalıbın aynısı). `rejected` → `base`'e geri dön + toast. Geri alma, tepkininkiyle **aynı dürüstlük sınırına** tabi: mesaj Redux'ta yüklü değilse dispatch YOK (bkz. dosya başı notu).

- [ ] **Step 1: Testleri yaz**

```ts
it('edit emri sunucuya içerikle gidiyor ve dönen DTO kanonikleştiriliyor', async () => { /* … */ });

// Review Focus 2 — AYIRT EDİCİ: backend kısa devresi 200 döner, hata DEĞİL.
it('aynı içerikle retry 200 dönünce BAŞARI sayılıyor, satır siliniyor', async () => {
  editMessage.mockResolvedValue({ id: 'm1', content: 'yeni', editedAt: null });
  const r = await flushPendingMutations('test');
  expect(r.done).toBe(1);
  expect(readPendingMutations()).toHaveLength(0);
});

// Review Focus 1
it('UT-6723: satır siliniyor, içerik base'e DÖNÜYOR ve sebep söyleniyor', async () => {
  editMessage.mockRejectedValue({ response: { data: { errorCode: 'UT-6723' } } });
  const r = await flushPendingMutations('test');
  expect(r.rejected).toBe(1);
  expect(lastEditedDispatched().content).toBe('orijinal');
  expect(showInfoToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
});

it('ağ hatasında satır KALIYOR, attempts artıyor, toast YOK', async () => { /* … */ });
it('enqueueEdit aynı mesaja ikinci emirde base'i koruyor, backoff'u sıfırlıyor', () => { /* … */ });
it('gönderilmemiş mesajın düzenlemesi ağa ÇIKMIYOR, satır kalıyor', async () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): mutasyon turu duzenlemeyi de uyguluyor`

---

### Task 3: Ekran — eylem ve düzenleme modu

**Files:**
- Modify: `src/features/chat/components/MessageActionSheet.tsx`, `src/features/chat/screens/ChatScreen.tsx`
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts`
- Test: `tests/features/chat/chatScreenEdit.test.tsx`

Eylem sayfasına "Düzenle" — `canEdit = isOwn && !isSystemMessage && !deletedAt && contentType === Text && !pending && (now - sentAt < EDIT_WINDOW_MS)`. `actionRows` sayacı buna göre güncellenmeli (yükseklik ondan hesaplanıyor).

Composer `replyTo` şeridinin kalıbıyla bir `editing` hâli: şerit düzenlenen metni gösteriyor, input o metinle doluyor, gönder tuşu düzenlemeyi gönderiyor, ✕ iptal ediyor. Gönderince: `messageEdited` optimistik dispatch → `enqueueEdit` → `void flushPendingMutations('interactive')`. **Başarısızlıkta geri alma YOK** — geri almanın tek sahibi tur (Faz 2'de kurulan kural).

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 3 — her kapı ayrı
it.each([
  ['başkasının mesajı', { isOwn: false }],
  ['sistem mesajı', { isSystemMessage: true }],
  ['silinmiş', { deletedAt: NOW }],
  ['sesli', { contentType: ContentType.Voice }],
  ['pencere dolmuş', { sentAt: NOW - EDIT_WINDOW_MS - 1 }],
  ['henüz gönderilmemiş', { _pending: true }],
])('%s için Düzenle görünmüyor', (_ad, patch) => { /* … */ });

it('kendi taze metin mesajında Düzenle görünüyor', () => { /* … */ });
it('düzenleme modunda input mevcut metinle doluyor', () => { /* … */ });
it('gönderince optimistik dispatch + enqueueEdit + flush', () => { /* … */ });
it('iptal düzenleme modunu kapatıyor ve metni DEĞİŞTİRMİYOR', () => { /* … */ });

// Review Focus 4
it('düzenleme kuyruktayken ekran yeniden kurulunca YENİ metin görünüyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): mesaj duzenleme — eylem, composer modu, kuyruk`

---

## Fazdan sonra açık kalanlar

- **Düzenleme geçmişi** ("düzenlendi" rozeti dışında) kapsam dışı: `editedAt` DTO'da var ve balon onu zaten gösterebiliyor; eski sürümleri saklamak ürün kararı.
- Cihazda hiç koşmadı.
