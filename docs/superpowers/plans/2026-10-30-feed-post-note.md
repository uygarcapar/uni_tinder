# Akış gönderisine not — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Akış gönderisinin satırına not butonu eklemek; basınca Keşif'in not modalı açılıyor, not gönderiye hedeflenmiş olarak gidiyor ve alıcıya "gönderine not bıraktı" diye düşüyor.

**Architecture:** `NoteTarget` üçüncü hedef türünü (`FeedPost` + `postId`) alıyor; gönderim yine `POST /api/swipe/Note` ve `useNoteMutation` üzerinden, yani kota/paywall/hata tablosu tek. Butonun çizilme kararı istemcide hesaplanmıyor: sunucu `FeedPostDto.note.state` ile söylüyor (aynı DTO'daki `reply: { state }` kalıbı). Composer akış ekranında render edilmeye devam ediyor.

**Tech Stack:** React Native + Expo, TanStack Query, react-hook-form + zod, i18next, Jest + @testing-library/react-native.

**Spec:** [docs/superpowers/specs/2026-10-30-feed-post-note-design.md](../specs/2026-10-30-feed-post-note-design.md)

## Global Constraints

- Not tavanı `NOTE_MAX_LENGTH = 150`, **code point** cinsinden (`noteLength`/`clampNoteText`). Yukarı çıkarılmıyor.
- Buton yalnız `post.note?.state === "Ok"` iken çiziliyor. Başka her değer, bilinmeyen değer ve alanın hiç gelmediği hâl → çizilmiyor.
- Kart içinde `likedByMe` / `isMine` / `isAnonymous` ile **yeniden kural hesaplanmıyor**; kapı tek yerde.
- Notun modu `resolveCardMode(post.note.availableModes, selectedMode)`; Keşif'te seçili mod doğrudan kullanılmıyor.
- `noteTargetPayload` her türde tüm alanları **açıkça** yazıyor (`photoIndex`, `promptKey`, `postId` — ilgisiz olanlar `null`).
- Yeni uç yok; hata kodları mevcut `NOTE_SEND_CODES` tablosu.
- Jest **node@24** istiyor (node 20'de çıktısız SIGSEGV). Test komutu: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest <path>`.
- Tip kontrolü: `npm run type-check`.

## Review Focus

1. **`note` alanı hiç gelmeyen payload** (eski sunucu): buton çizilmemeli — Task 3.
2. **Bilinmeyen `state` değeri** (sunucu listeye yeni değer ekler): "çizme" tarafına düşmeli, istemci kırılmamalı — Task 2.
3. **`state: "Ok"` ama `availableModes` boş/eksik**: buton çizilmemeli, handler'a düşse de sessizce çıkmalı — Task 2 (`postNoteMode` + `postNoteRequest` testleri).
4. **`notesRemaining === null`** (backend bakiyeyi göndermiyor): composer değil paket sheet'i açılmalı, `paywallReason: "unknown_balance"` — Task 2 (`postNoteRequest`).
5. **`state: "Ok"` ama `author: null`** (anonim/bayat satır): gönderim denenmemeli, paywall da açılmamalı — Task 2 (`postNoteRequest` sıra değişmezi) + Task 5 (bağlantı).

---

### Task 1: Backend önerisi

**Files:**
- Create: `backend_feed_post_note_2026-10-30.md`

- [ ] **Step 1: Öneriyi yaz**

Depo kökündeki `backend_campus_mode_gate_2026-10-30.md` dosyasının biçimini izle (başlık, niyet, uç uç sözleşme blokları, hata kodları, geriye uyum). İçerik tasarım dokümanının "Sunucu sözleşmesi" bölümünün üç parçası: (A) `FeedPostDto.note = { state, availableModes }` ve `state` değerlerinin tam listesi + alan gelmezse özelliğin kapalı kalması, (B) `POST /api/swipe/Note` gövdesinde `target.kind = "FeedPost"` + `postId`, gönderi metninin sunucuda anlık görüntü olarak saklanması, `UT-6403` ve `UT-6404`ün bu hedefteki anlamı, (C) `WhoLikedMe`/`LikerProfile` not nesnesinde `target.kind = "FeedPost"` + `postId`/`excerpt`/`label`/`postDeleted`.

- [ ] **Step 2: Commit**

```bash
git add backend_feed_post_note_2026-10-30.md
git commit -m "docs(feed): gonderiye not icin backend onerisi"
```

---

### Task 2: Hedef sözleşmesi ve satır kapısı

**Files:**
- Modify: `src/shared/types/index.ts` (`NoteTarget`, `LikerNote.target`)
- Modify: `src/features/feed/feedTypes.ts` (`FeedPostDto`)
- Modify: `src/features/discover/noteTarget.ts`
- Create: `src/features/feed/feedPostNote.ts`
- Test: `tests/features/discover/noteTarget.test.ts` (yeni), `tests/features/feed/feedPostNote.test.ts` (yeni)

**Interfaces:**
- Consumes: `resolveCardMode(availableModes: unknown, selectedMode: AppMode): AppMode | null` (`src/features/feed/feedCardMode.ts`).
- Produces:
  - `NoteTarget = { kind: "Photo" | "Prompt" | "FeedPost"; photoIndex: number | null; promptKey: string | null; postId: string | null }`
  - `postNoteTarget(postId: string): NoteTarget`
  - `FeedPostNoteGate = { state: string; availableModes?: string[] }`, `FeedPostDto.note?: FeedPostNoteGate`
  - `canNotePost(note: FeedPostNoteGate | null | undefined): boolean`
  - `postNoteMode(note: FeedPostNoteGate | null | undefined, selectedMode: AppMode): AppMode | null`
  - `postNoteRequest(post: FeedPostDto, notesRemaining: number | null | undefined, selectedMode: AppMode): { action: "send" | "paywall" | "none"; userId: string | null; mode: AppMode | null; paywallReason: "empty_balance" | "unknown_balance" | null }` — **düz kayıt, ayrık birleşim DEĞİL** (TS daraltması bu projede çalışmıyor; `project_ts_discriminant_narrowing` kuralı)
  - `LikerNote.target.kind` üçüncü değeri + `postId?`, `excerpt?`, `label?`, `postDeleted?` alanları (okuma tarafı Task 6)

- [ ] **Step 1: Write the failing tests**

`tests/features/discover/noteTarget.test.ts`:

```ts
it('gonderi hedefinin payload"u postId tasiyor, digerleri acikca null', () => {
  expect(noteTargetPayload(postNoteTarget('p1'))).toEqual({
    kind: 'FeedPost', photoIndex: null, promptKey: null, postId: 'p1',
  });
});

it('foto ve prompt hedeflerinde postId acikca null', () => {
  expect(noteTargetPayload(photoNoteTarget(0)).postId).toBeNull();
  expect(noteTargetPayload(promptNoteTarget('Travel')).postId).toBeNull();
});

it('ayni gonderi ayni hedef, farkli gonderi degil', () => {
  expect(isSameNoteTarget(postNoteTarget('p1'), postNoteTarget('p1'))).toBe(true);
  expect(isSameNoteTarget(postNoteTarget('p1'), postNoteTarget('p2'))).toBe(false);
  expect(isSameNoteTarget(postNoteTarget('p1'), photoNoteTarget(0))).toBe(false);
});

it('gonderi hedefinin etiketi note.targetPost', () => {
  const t = jest.fn((k: string) => k);
  expect(noteTargetLabel(postNoteTarget('p1'), null, t)).toBe('note.targetPost');
});
```

`tests/features/feed/feedPostNote.test.ts` — `canNotePost`: `{ state: 'Ok' }` → true; `'AlreadySent' | 'AlreadySwiped' | 'NoMode' | 'LikedMe' | 'Matched' | 'OwnPost' | 'Anonymous' | 'Restricted'` → her biri false; bilinmeyen `'SomethingNew'` → false; `undefined` ve `null` → false. `postNoteMode`: `{ state:'Ok', availableModes:['Friends'] }` + seçili `Dating` → `'Friends'`; liste seçili modu içeriyorsa seçili mod; `availableModes: []` → `null`; alan eksik → `null`; `state !== 'Ok'` → `null`.

`postNoteRequest` (aynı dosya): bakiye 3 + `state:'Ok'` + `author` dolu → `{ action:'send', userId:'u1', mode:'Dating' }`; bakiye `0` → `{ action:'paywall', paywallReason:'empty_balance' }`; bakiye `null` → `{ action:'paywall', paywallReason:'unknown_balance' }`; `author: null` → `action:'none'`; `availableModes: []` → `action:'none'`; `state:'AlreadySent'` → `action:'none'`. **Sıra değişmezi:** `author`/mod kapısı bakiye kapısından ÖNCE — notu hiç gönderemeyeceği bir satırda kullanıcıya paywall göstermek yanlış olur; bu da ayrı bir test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/discover/noteTarget.test.ts tests/features/feed/feedPostNote.test.ts`
Expected: FAIL — `postNoteTarget` / `canNotePost` tanımlı değil.

- [ ] **Step 3: Tipleri genişlet**

`NoteTarget`a `"FeedPost"` ve `postId: string | null` ekle (JSDoc'ta: `postId` GÖNDERİM anahtarı, kalıcı kayıt sunucuda anlık görüntü — mevcut `photoIndex` uyarısının aynı gerekçesi). `LikerNote.target`a üçüncü kind + `postId?`/`excerpt?`/`label?`/`postDeleted?`. `FeedPostDto`ya `note?: FeedPostNoteGate` ekle; JSDoc'ta kararın SUNUCUDA olduğunu ve alan gelmezse butonun çizilmediğini yaz (`reply: { state }`'in notuna atıfla).

- [ ] **Step 4: `noteTarget.ts`i genişlet**

`postNoteTarget(postId)` kurucusu; `photoNoteTarget`/`promptNoteTarget` dönüşlerine `postId: null`; `noteTargetPayload`a `postId` satırı; `isSameNoteTarget`e gönderi dalı; `noteTargetLabel`a `kind === "FeedPost"` → `t("note.targetPost")` dalı.

- [ ] **Step 5: `feedPostNote.ts`i yaz**

`canNotePost`, `postNoteMode` ve `postNoteRequest`. Dosya başına kapının neden tek yerde olduğunu yaz: `FeedPostDto` yazarın modlarını/beğenilmişliğini taşımıyor, `whoLikedMeIds` yalnız ilk sayfayı tutuyor, ve not kişi başına tek gittiği için (`UT-6404 ALREADY_SWIPED`) istemcide türetilen bir kapı ölü buton üretir. `canNotePost` **beyaz liste** (`=== "Ok"`), kara liste değil: sunucu yeni bir `state` eklediğinde istemci "çizme" tarafında kalmalı.

- [ ] **Step 6: Run tests to verify they pass**

Run: aynı komut. Expected: PASS. Ayrıca `npm run type-check` temiz.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/index.ts src/features/feed/feedTypes.ts src/features/discover/noteTarget.ts src/features/feed/feedPostNote.ts tests/features/discover/noteTarget.test.ts tests/features/feed/feedPostNote.test.ts
git commit -m "feat(feed): gonderi not hedefi ve satir kapisi"
```

---

### Task 3: Satırdaki not butonu

**Files:**
- Modify: `src/features/feed/components/FeedPostCard.tsx`
- Test: `tests/features/feed/components/FeedPostCard.test.tsx`

**Interfaces:**
- Consumes: `canNotePost` (Task 2), `NoteGlyph` (`src/shared/components/NoteGlyph`).
- Produces: `FeedPostCardProps.onNote?: (post: FeedPostDto) => void`; buton `testID="feed-post-note"`, erişilebilirlik etiketi `t("feed.noteAccessibility")`.

- [ ] **Step 1: Write the failing tests**

`FeedPostCard.test.tsx` içindeki mevcut `post()` fabrikasını kullanarak:

```tsx
it('state Ok iken not butonu ciziliyor ve onNote cagriliyor', () => {
  const onNote = jest.fn();
  render(<FeedPostCard post={post({ note: { state: 'Ok', availableModes: ['Dating'] } })} onNote={onNote} />);
  fireEvent.press(screen.getByTestId('feed-post-note'));
  expect(onNote).toHaveBeenCalledTimes(1);
});

it('note alani hic gelmezse buton cizilmiyor', () => {
  render(<FeedPostCard post={post()} onNote={jest.fn()} />);
  expect(screen.queryByTestId('feed-post-note')).toBeNull();
});

it('AlreadySent ve AlreadySwiped hallerinde buton cizilmiyor', () => { /* iki state icin queryByTestId null */ });

it('onNote verilmezse buton cizilmiyor', () => { /* state Ok, prop yok */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/feed/components/FeedPostCard.test.tsx`
Expected: FAIL — `feed-post-note` bulunamıyor.

- [ ] **Step 3: Butonu ekle**

Aksiyon satırında, beğeni `Pressable`ının **hemen sağında**: `NoteGlyph`, kalbin `LIKE_HEART_BOX` ölçüsüyle hizalı, `colors.text` mürekkebi, yanında metin/sayı yok, `hitSlop` kalple aynı. Çizilme koşulu `canNotePost(post.note) && !!onNote`. Kalp ile arasına `marginLeft` — mevcut ölçü sabitleriyle aynı dilde yeni bir sabit (ör. `NOTE_BUTTON_MARGIN`) tanımla ve neden kalbin sayı payından ayrı olduğunu bir satırla yaz.

- [ ] **Step 4: Run tests to verify they pass**

Run: aynı komut. Expected: PASS (dosyadaki mevcut testler de geçmeye devam ediyor).

- [ ] **Step 5: Commit**

```bash
git add src/features/feed/components/FeedPostCard.tsx tests/features/feed/components/FeedPostCard.test.tsx
git commit -m "feat(feed): gonderi satirinda not butonu"
```

---

### Task 4: Composer'da gönderi önizlemesi

**Files:**
- Modify: `src/features/discover/components/NoteComposerModal.tsx`
- Test: `tests/features/discover/components/NoteComposerModal.test.tsx` (yeni)

**Interfaces:**
- Produces: `NoteComposerModalProps.postPreview?: { body: string; topicLabel?: string | null } | null`. Chip `testID="note-post-chip"`.

- [ ] **Step 1: Write the failing test**

Mock önsözünü `tests/features/discover/components/FilterModal.test.tsx:1-115`ten kopyala (reanimated, gesture-handler, lucide, svg, SFIcon, **AppModal**) — bu modal `AppModal` + `BottomSheetTextInput` kullanıyor ve mocksuz render edilemiyor.

```tsx
it('gonderi hedefinde gonderi chip"i ciziliyor, prompt chip"i cizilmiyor', () => {
  render(<NoteComposerModal visible target={postNoteTarget('p1')} postPreview={{ body: 'Yarin kutuphane kacta aciliyor?' }} onClose={jest.fn()} onSend={jest.fn()} />);
  expect(screen.getByTestId('note-post-chip')).toBeTruthy();
  expect(screen.getByText('Yarin kutuphane kacta aciliyor?')).toBeTruthy();
});

it('foto hedefinde gonderi chip"i cizilmiyor', () => { /* photoNoteTarget(0) + photoUri → queryByTestId null */ });

it('gonderi hedefinde yazi alani onizlemeli ust payi aliyor', () => {
  // input sarmalayicisinin paddingTop'u INPUT_PAD_TOP_WITH_PREVIEW
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/discover/components/NoteComposerModal.test.tsx`
Expected: FAIL — chip yok.

- [ ] **Step 3: `PostTargetChip`i ekle**

`PromptTargetChip`in kardeşi, aynı yerleşim sözleşmesiyle (kutunun çocuğu DEĞİL kardeşi, `top: -overhang`, `left: THUMB_LEFT`, alt kenarı kutunun `PREVIEW_INSET` kadar içinde, yüksekliği `onHeight` ile ölçülüyor). İçerik: varsa konu etiketi `CHIP_QUESTION_LINE` satırında `textMuted` ile (prompt chip'inin soru satırının yerinde), altında gönderi metni `numberOfLines={CHIP_ANSWER_MAX_LINES}`. Kontur/dolgu/yuvarlaklık prompt chip'iyle aynı sabitlerden.

- [ ] **Step 4: Chip'i ve üst payı bağla**

`showPromptChip`in yanına `showPostChip = shownTarget?.kind === "FeedPost" && !!shownPostPreview`. `postPreview` da hedefle birlikte null'a düştüğü için mevcut dondurma kalıbını uygula (`lastPhotoUri`/`lastPrompts` ile aynı `useRef` deseni) — kapanış animasyonunda chip kaybolup kutuyu zıplatmasın. Kutunun üst payı (`INPUT_PAD_TOP_WITH_PREVIEW`) ve `chipOverhang` hesabı iki chip için ortak. `useEffect` bağımlılığına `target?.postId` ekle: hedef değişince metin sıfırlanmalı.

- [ ] **Step 5: Run tests to verify they pass**

Run: aynı komut + `PATH=… npx jest tests/features/discover` (komşu testler bozulmasın). Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/discover/components/NoteComposerModal.tsx tests/features/discover/components/NoteComposerModal.test.tsx
git commit -m "feat(note): composer"da gonderi onizlemesi"
```

---

### Task 5: Akıştan gönderim

**Files:**
- Modify: `src/features/feed/screens/FeedScreen.tsx`
- Test: `tests/features/feed/feedPostNoteSend.test.tsx` (yeni)

**Interfaces:**
- Consumes: `postNoteRequest` / `postNoteMode` / `postNoteTarget` (Task 2), `FeedPostCardProps.onNote` (Task 3), `postPreview` (Task 4), `useNoteMutation`, `patchPostInCaches(qc, postId, patch)`, `NOTE_SEND_CODES`.
- Produces: `FeedScreen` içinde `handlePostNote(post)` ve `handleSendPostNote(comment)`; `noteRequest` durumu gönderi dalında `{ target, profile: null, post }` taşıyor.

- [ ] **Step 1: Write the failing test**

⚠️ `FeedScreen` bu projede **hiçbir testte render edilmiyor** (3320 satır, ağır mock yüzeyi). O ekranın testleri kaynak metnini okuyup değişmezleri doğruluyor — kalıp: `tests/features/feed/feedMapExpandState.test.ts:1-50` (`readFileSync` + regex, `@types/node` olmadığı için `require`). Karar mantığı zaten `postNoteRequest`te saf olarak test edildi (Task 2); burada doğrulanan şey **bağlantı**.

`tests/features/feed/feedPostNoteSend.test.ts` (`.tsx` değil — render yok):

```ts
const src = readFileSync('src/features/feed/screens/FeedScreen.tsx', 'utf8');

it('karar saf modulden geliyor, ekranda yeniden hesaplanmiyor', () => {
  expect(src).toMatch(/postNoteRequest\(/);
  // Kapi ekranda elle kurulmasin: gonderi dalinda notesRemaining karsilastirmasi YOK.
  expect(src).not.toMatch(/notesRemaining\s*<=\s*0[\s\S]{0,400}postNoteTarget/);
});

it('hedef postNoteTarget ile kuruluyor ve mod postNoteMode"dan geliyor', () => {
  expect(src).toMatch(/postNoteTarget\(\s*post\.id/);
  expect(src).toMatch(/postNoteMode\(/);
});

it('basarili gonderim satiri AlreadySent"e yamiyor', () => {
  expect(src).toMatch(/patchPostInCaches[\s\S]{0,200}AlreadySent/);
});

it('UT-6401 paket sheet"i, UT-6403 composer kapanisi + liste tazelemesi', () => {
  expect(src).toMatch(/NOTE_SEND_CODES\.NO_BALANCE[\s\S]{0,300}setNotePurchaseVisible\(true\)/);
  expect(src).toMatch(/NOTE_SEND_CODES\.INVALID_TARGET[\s\S]{0,400}feedKeys\.postsRoot/);
});

it('gonderi dalinda yazar profili cekilmiyor', () => {
  // Kart acilmiyor: handler authorProfile"a dokunmuyor.
  expect(src).not.toMatch(/handlePostNote[\s\S]{0,600}authorProfile/);
});

it('analitik yuzeyi feed_post', () => {
  expect(src).toMatch(/surface:\s*["']feed_post["']/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/feed/feedPostNoteSend.test.ts`
Expected: FAIL — `postNoteRequest` / `postNoteTarget` ekranda yok.

- [ ] **Step 3: `handlePostNote(post)`u yaz**

Mevcut `handleAuthorNote`in kardeşi, aynı dosyada ve onun hemen yanında. Kararı **`postNoteRequest(post, notesRemaining, selectedMode)`** veriyor; handler yalnız sonucu uygular: `action === "none"` → sessizce çık; `"paywall"` → `analytics.capture("note_paywall_shown", { reason: paywallReason, surface: "feed_post" })` + `setNotePurchaseVisible(true)`; `"send"` → `setNoteRequest({ target: postNoteTarget(post.id), post, profile: null })`. Kart AÇILMIYOR, `authorProfile` sorgusu tetiklenmiyor — iki sheet üst üste gelme sorunu da yok.

- [ ] **Step 4: `handleSendPostNote(comment)`u yaz**

`handleSendAuthorNote`in dallarını birebir koru: başarı → `analytics.capture("note_sent", { targetKind: "FeedPost", surface: "feed_post", mode })`, `setNoteRequest(null)`, toast, ve `patchPostInCaches(qc, post.id, (p) => ({ ...p, note: { ...p.note, state: "AlreadySent" } }))`. `UT-6401` → composer kapanır + paket sheet'i. `UT-6403` → composer kapanır, `qc.invalidateQueries({ queryKey: feedKeys.postsRoot })`, hata toast'ı. Gerisi inline hata (`setNoteError`), sheet açık, metin korunuyor.

Gönderi dalında `mode` **`postNoteMode(post.note, selectedMode)`den** geliyor, `cardMode`dan değil: kart açılmadığı için `cardMode` bu yolda çözülmüş olmuyor.

- [ ] **Step 5: `NoteComposerModal` ve karta bağla**

Listedeki `FeedPostCard`a `onNote={handlePostNote}`. `NoteComposerModal` çağrısına gönderi dalını ekle: `postPreview` (gönderi gövdesi + çözülmüş konu etiketi), `targetName` yazarın adı, `mode` yine `postNoteMode` sonucu, `onSend` hedefin türüne göre `handleSendPostNote` / `handleSendAuthorNote`. `photoUri` gönderi dalında `null`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/feed` + `npm run type-check`.
Expected: PASS, tip temiz.

- [ ] **Step 7: Commit**

```bash
git add src/features/feed/screens/FeedScreen.tsx tests/features/feed/feedPostNoteSend.test.ts
git commit -m "feat(feed): gonderiye not gonderimi"
```

---

### Task 6: Alıcı tarafı ve i18n

**Files:**
- Modify: `src/features/discover/components/LikeCard.tsx` (`LikeNoteBox`)
- Modify: `src/shared/i18n/translations/tr.ts`, `src/shared/i18n/translations/en.ts`
- Test: `tests/features/discover/likeNotePostTarget.test.tsx` (yeni)

**Interfaces:**
- Consumes: `LikerNote.target` gönderi alanları (Task 2).
- Produces: i18n anahtarları `note.targetPost`, `note.leftNoteOnPost`, `note.postRemoved`, `feed.noteAccessibility`, `note.codes.UT-6403` (varsa güncelleme).

- [ ] **Step 1: Write the failing test**

```tsx
it('gonderi hedefli notta "gonderine not birakti" ve gonderi metni ciziliyor', () => {
  // note = { comment: 'selam', target: { kind: 'FeedPost', postId: 'p1', excerpt: 'Yarin kutuphane...' } }
  expect(screen.getByText(tr.note.leftNoteOnPost)).toBeTruthy();
  expect(screen.getByText('Yarin kutuphane...')).toBeTruthy();
});

it('sunucu hazir label gonderirse o kullaniliyor', () => { /* target.label → i18n yerine o */ });

it('postDeleted iken kaldirildi satiri ekleniyor', () => { /* tr.note.postRemoved */ });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/discover/likeNotePostTarget.test.tsx`
Expected: FAIL — etiket çizilmiyor (bugün `target.label || null`).

- [ ] **Step 3: i18n anahtarlarını ekle**

`tr`: `targetPost: 'Gönderi'`, `leftNoteOnPost: 'Gönderine not bıraktı'`, `postRemoved: 'Gönderi kaldırıldı'`; `feed.noteAccessibility: 'Gönderiye not bırak'`. `en` karşılıkları: `'Post'`, `'Left a note on your post'`, `'Post removed'`, `'Leave a note on this post'`. İki dosya aynı anahtar kümesini taşıyor.

- [ ] **Step 4: `LikeNoteBox`u güncelle**

`FeedPost` dalında etiket `target.label || t("note.leftNoteOnPost")` (hazır metin yolu geriye uyum için duruyor, i18n yedeği yeni). `postDeleted` true iken alıntı bloğunun altına tek satır `t("note.postRemoved")`; yükseklik hesabına (`noteTextMaxHeight` terimleri) bu satırı mevcut `NOTE_TARGET_LABEL_LINE` kalıbıyla ekle. Dosya başındaki "FeedPost etiketi çeviri anahtarı DEĞİL" notunu yeni duruma göre düzelt — yoksa yorum kodla çelişir.

- [ ] **Step 5: Run tests to verify they pass**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest tests/features/discover` + `npm run type-check`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/discover/components/LikeCard.tsx src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts tests/features/discover/likeNotePostTarget.test.tsx
git commit -m "feat(note): gonderi hedefli notun alici gorunumu"
```

---

### Task 7: Bütün akışın doğrulanması

**Files:**
- Test: (yeni dosya yok)

- [ ] **Step 1: Tüm test takımını çalıştır**

Run: `PATH="$(brew --prefix node@24)/bin:$PATH" npx jest`
Expected: PASS (yeni testler dahil, mevcut testlerde gerileme yok).

- [ ] **Step 2: Tip ve lint**

Run: `npm run type-check && npm run lint`
Expected: ikisi de temiz.

- [ ] **Step 3: Tasarım ve planı commit'le**

```bash
git add docs/superpowers/specs/2026-10-30-feed-post-note-design.md docs/superpowers/plans/2026-10-30-feed-post-note.md
git commit -m "docs(feed): gonderiye not tasarimi ve plani"
```
