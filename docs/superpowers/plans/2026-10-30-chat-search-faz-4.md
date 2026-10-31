# Faz 4 — Mesajlarda arama

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kullanıcı tüm sohbet arşivinde mesaj arayabilsin, sonuca dokununca o mesajın yanına insin — tamamen yerelden, offline dahil.

**Architecture:** Aranabilir metin JS'te `foldTr` ile katlanıp `messages.content_folded` kolonuna yazılıyor; FTS5 indeksi **o kolonun** üzerine kuruluyor, böylece arama ile isim araması birebir aynı Türkçe kuralını paylaşıyor ve tokenizer semantiğine bağımlılık kalmıyor. Yazıcı **tek kapı**: `saveMessage`/`upsertMessage` — mesajın diske indiği dört yol (realtime, `messageSent`, geçmiş sayfası, delta turu) zaten oradan geçiyor.

**Tech Stack:** expo-sqlite 56.0.6 (senkron API), FTS5, Redux Toolkit, jest (`PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest` — node 20 segfault veriyor).

**Spec:** `chat_local_first_roadmap_2026-10.md` → "Faz 4 — Arama (asıl özellik)" (satır 245-300).

## Roadmap 4.0 — CEVAPLANDI, tasarım değişmiyor

FTS5 **derleniyor**: `node_modules/expo-sqlite/ios/ExpoSQLite.podspec:42`, `android/build.gradle:31` ve `spm.config.json:41` üçü de `-DSQLITE_ENABLE_FTS5=1` veriyor; kapatma bayrağı (`expo.sqlite.enableFTS = 'false'`) projede **hiçbir yerde yok** (`ios/Podfile.properties.json`, `android/gradle.properties` tarandı). Bu, cihazda tek bir probe koşmaktan daha güçlü bir cevap: mekanizmanın kendisi.

**Ama bir tasarım kısıtı doğuruyor.** O bayrak bir gün kapatılırsa `CREATE VIRTUAL TABLE … USING fts5` migration zincirini patlatır → `openChatDb` atar → ayna kendini devre dışı bırakır → sohbet local-first yolunu TAMAMEN kaybeder (V7 yorumundaki `DROP TABLE` dersinin aynısı, bedeli toplam). O yüzden:

- **Sürümlü zincir yalnız `ALTER TABLE ADD COLUMN` taşıyor** — atması imkânsız.
- **FTS sanal tablosu zincirin DIŞINDA**, açılışta `sqlite_compileoption_used('ENABLE_FTS5')` kapısının ardında, `IF NOT EXISTS` ile yaratılıyor. Yoksa arama `content_folded` üzerinde `LIKE`'a düşüyor: doğru, yalnız yavaş.

## Global Constraints

- **Yayınlanmış migration ASLA düzenlenmez**, yeni sürüm eklenir. Son sürüm **v9**; bu fazınki **v10**.
- **Yazıcı TEK KAPI.** `content_folded` ve FTS satırı `saveMessage`/`upsertMessage` içinde yazılır, dört çağrı yerinde DEĞİL. (Bu dosyanın tarihçesinde "aynı kolona iki yazıcı iki format" bir kez yaşandı.)
- **Türkçe katlama tek kaynak:** `@/shared/utils/foldTr`. FTS'in `unicode61` tokenizer'ına Türkçe bırakılmıyor — `ı` (U+0131) aksan değil, ayrı harf.
- **Bir yorum ya da test, kırılsa yakalayacağından fazlasını iddia etmeyecek.** Bu işin baskın kusur sınıfı: önceki üç fazda 15+ bulgu, çoğu kodun vermediği garantiyi iddia eden yorumlar ve pin'lediğini söylediği satır silinince hâlâ geçen testler.
- **Rate limit:** arama tamamen yerel, ağa HİÇ çıkmıyor. Ön koşul görevindeki backfill değişiklikleri ise `messaging_default` = 200 istek/60sn, TÜM `MessagesController`'da paylaşımlı kovayı kullanıyor (mutasyon kuyruğu 20, backfill 80 rezerv ediyor).
- Yeni i18n anahtarı girerse `src/shared/i18n/translations/tr.ts` ve `en.ts` **aynı commit'te**.
- Türkçe yorumlar, çevre dosyaların ses ve yoğunluğuyla.

## Review Focus

1. **Silinmiş mesaj arama sonucunda çıkmamalı.** `deleted_at` / `deleted_for_everyone` satırda kalıyor (silme yumuşak). Süzme SORGU ANINDA yapılacak, indeksten çıkarılarak DEĞİL — yoksa geri alınan bir silme yeniden indeksleme ister. → Task 3.
2. **Metin olmayan mesaj indekslenmemeli.** Sesli mesajın `content`i boş/teknik; indekse girerse boş sonuçlar üretir. → Task 2.
3. **Arşivde ZATEN duran satırlar.** v10 kolonu NULL olarak ekliyor; mevcut mesajlar tek seferlik doldurulmadan arama onları hiç bulmaz — ve bu sessiz bir eksiklik, "arama bozuk" diye değil "o mesaj yok" diye görünür. → Task 2.
4. **Sorgu katlandıktan sonra boşalabilir.** Kullanıcı yalnız noktalama yazarsa (`"..."`) katlanmış sorgu boş kalır; o durumda arama TÜM mesajları döndürmemeli. `conversationMatchesQuery`'nin boş sorguda `true` dönmesi liste süzgeci için doğru, arama için YANLIŞ. → Task 3.
5. **FTS5 yokken arama sessizce boş dönmemeli.** Kapasite kapalıyken `LIKE` yoluna düşüyor; düşmezse kullanıcı "hiçbir şey bulunamadı" görür ve özelliğin bozuk olduğunu anlamaz. → Task 2 (kapasite) + Task 3 (sorgu dalı).

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `src/features/chat/db/migrations.ts` | V10: `messages.content_folded`, `sync_state.backfill_failures` |
| `src/features/chat/db/chatDb.ts` | FTS kapasite probe'u + sanal tablonun zincir dışı yaratımı |
| `src/features/chat/chatRepository.ts` | tek yazıcı kapısı, tek seferlik doldurma, `searchMessages`, `readAround` |
| `src/features/chat/backfillPolicy.ts` | ön koşul: kalıcı-hata muhasebesi (saf) |
| `src/features/chat/chatBackfill.ts` | ön koşul: `attempts` görünür, ikinci tetik |
| `src/features/chat/messageSearch.ts` | **yeni**: sorgu hazırlama + sonuç şekli (saf) |
| `src/features/chat/screens/MessagesScreen.tsx` | global aramaya "Mesajlar" bölümü |
| `src/features/chat/screens/ChatScreen.tsx` | mesaja atlama + vurgulama |

---

### Task 1: Faz 3'ten devreden üç ön koşul

**Neden burada:** üçü de "arşiv gerçekten tamamlanıyor mu, ölçebiliyor muyum" sorusuna ait. Kapanmadan arama "bulamadı"yı "yok" sanar — bu fazın tek amacı o yarım cevabı engellemekti.

**Files:**
- Modify: `src/features/chat/db/migrations.ts` (V10'un `backfill_failures` yarısı)
- Modify: `src/features/chat/backfillPolicy.ts`, `src/features/chat/chatBackfill.ts`
- Modify: `src/navigation/AppNavigator.tsx` (ikinci tetik)
- Test: `tests/features/chat/backfillPolicy.test.ts`, `tests/features/chat/chatBackfill.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // backfillPolicy.ts
  export const BACKFILL_MAX_FAILURES = 3;
  /** Üst üste bu kadar kalıcı hata almış sohbet turdan DÜŞER. */
  export function isConversationShelved(failures: number): boolean;
  // chatRepository.ts
  export function bumpBackfillFailure(conversationId: string): void;
  export function clearBackfillFailures(conversationId: string): void;
  // chatBackfill.ts — BackfillRoundResult'a eklenen alan
  attempts: number;   // bu turda ATILAN istek sayısı (başarılı sayfa DEĞİL)
  ```

- [ ] **Step 1: Testleri yaz**

```ts
it('üst üste BACKFILL_MAX_FAILURES hata alan sohbet seçilmiyor', () => {
  expect(isConversationShelved(BACKFILL_MAX_FAILURES - 1)).toBe(false);
  expect(isConversationShelved(BACKFILL_MAX_FAILURES)).toBe(true);
});

it('başarılı sayfa sayacı sıfırlıyor', () => { /* bumpBackfillFailure ×2 → clear → readBackfillTargets failures 0 */ });

it('rafa kalkan sohbet turda SLOT YAKMIYOR', async () => {
  // Ayırt edici: muhasebe olmasaydı her turda bir istek giderdi.
  expect(getMessageHistory).not.toHaveBeenCalledWith(
    expect.objectContaining({ conversationId: 'conv-bozuk' }),
  );
});

it('BackfillRoundResult.attempts atılan isteği sayıyor, başarılı sayfayı değil', async () => {
  // iki sayfa: ilki 200, ikincisi 500 → pages 1, attempts 2
  expect(result.pages).toBe(1);
  expect(result.attempts).toBe(2);
});
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**
- [ ] **Step 3: V10'un `backfill_failures` kolonunu, saf `isConversationShelved`'ı, iki depo fonksiyonunu, `attempts` alanını ve `foreground` tetiğini yaz**

İkinci tetik `AppNavigator.tsx`te `flushPendingMutations('foreground')`ın yanına; backfill'in boot tetiği KALIYOR. Gerekçe yoruma: büyük arşiv tek tetikle onlarca açılış sürüyordu.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**
- [ ] **Step 5: Commit** — `feat(chat): backfill kalici-hata muhasebesi, attempts gorunur, ikinci tetik`

---

### Task 2: v10 kolonu, FTS kapasitesi, tek yazıcı kapısı, tek seferlik doldurma

**Files:**
- Modify: `src/features/chat/db/migrations.ts` (V10'un `content_folded` yarısı)
- Modify: `src/features/chat/db/chatDb.ts`, `src/features/chat/chatRepository.ts`
- Test: `tests/features/chat/messageSearchIndex.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // chatDb.ts
  export function isFtsAvailable(): boolean;   // sqlite_compileoption_used('ENABLE_FTS5')
  // chatRepository.ts
  export function backfillContentFolded(limit: number): number;  // doldurulan satır sayısı
  ```

V10 (yalnız kolon ekleme — atması imkânsız):
```sql
ALTER TABLE messages ADD COLUMN content_folded TEXT;
ALTER TABLE sync_state ADD COLUMN backfill_failures INTEGER NOT NULL DEFAULT 0;
```

FTS tablosu **zincir dışında**, `openChatDb` içinde kapasite kapısının ardında:
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_folded, message_id UNINDEXED, tokenize='unicode61'
);
```

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 2
it('metin olmayan mesaj indekslenmiyor', () => {
  saveMessage({ id: 'v1', contentType: ContentType.Voice, content: '' }, 'c1');
  expect(ftsRowsFor('v1')).toHaveLength(0);
});

it('metin mesajı katlanmış haliyle indeksleniyor', () => {
  saveMessage({ id: 'm1', content: 'IŞIK Çağrı' }, 'c1');
  expect(readContentFolded('m1')).toBe('isik cagri');
});

// Tek kapı: dört yazma yolunun hepsi aynı sonucu vermeli.
it('upsertMessage (delta yolu) da kolonu dolduruyor', () => { /* … */ });

it('düzenlenen mesajın katlanmış kolonu ve FTS satırı güncelleniyor', () => {
  saveMessage({ id: 'm1', content: 'eski' }, 'c1');
  saveMessage({ id: 'm1', content: 'YENİ' }, 'c1');
  expect(readContentFolded('m1')).toBe('yeni');
  expect(ftsRowsFor('m1')).toHaveLength(1);   // çoğalmadı
});

// Review Focus 3
it('backfillContentFolded arşivde duran NULL satırları dolduruyor', () => {
  insertRawMessage('eski-1', 'Çağrı');   // kolon NULL, migration öncesi satırı taklit eder
  expect(backfillContentFolded(100)).toBe(1);
  expect(readContentFolded('eski-1')).toBe('cagri');
});

it('backfillContentFolded tavanı aşmıyor ve doldurulmuş satırı tekrar saymıyor', () => { /* 5 NULL satır, limit 2 → 2, sonra 2, sonra 1, sonra 0 */ });

// Review Focus 5
it('FTS5 yokken açılış PATLAMIYOR, isFtsAvailable false dönüyor', () => {
  // Ayırt edici: sanal tablo zincirin dışında olmasaydı migration geri alınır
  // ve openChatDb atardı — yani sohbet local-first'ü tamamen kaybederdi.
});
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**
- [ ] **Step 3: V10'u, kapasite probe'unu, tek yazıcı kapısını ve doldurmayı yaz**
- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**
- [ ] **Step 5: Commit** — `feat(chat): aranabilir katlanmis kolon + FTS indeksi (v10), tek yazici kapisi`

---

### Task 3: Arama sorgusu ve mesaj penceresi

**Files:**
- Create: `src/features/chat/messageSearch.ts` (saf)
- Modify: `src/features/chat/chatRepository.ts`
- Test: `tests/features/chat/messageSearch.test.ts`, `tests/features/chat/messageSearchRepo.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // messageSearch.ts — saf; store/ağ/DB import ETMİYOR
  export const MIN_SEARCH_LENGTH = 2;
  /** Katlar, kırpar; aranamayacak kadar kısa/boşsa null. */
  export function prepareSearchQuery(raw: string): string | null;
  export interface MessageSearchHit {
    messageId: string; conversationId: string; sentAtMs: number;
    content: string; partnerDisplayName: string | null;
  }
  // chatRepository.ts
  export function searchMessages(
    foldedQuery: string,
    opts: { conversationId?: string; limit: number; offset?: number },
  ): MessageSearchHit[];
  export function readAround(
    conversationId: string, sentAtMs: number, messageId: string,
    before: number, after: number,
  ): MessageDto[];
  ```

- [ ] **Step 1: Testleri yaz**

```ts
// Review Focus 4
it('yalnız noktalamadan oluşan sorgu null dönüyor — her şeyi döndürmüyor', () => {
  expect(prepareSearchQuery('...')).toBeNull();
  expect(prepareSearchQuery('   ')).toBeNull();
  expect(prepareSearchQuery('a')).toBeNull();       // MIN_SEARCH_LENGTH
  expect(prepareSearchQuery('  IŞık ')).toBe('isik');
});

// Review Focus 1
it('silinmiş mesaj sonuçlarda ÇIKMIYOR, ama indekste KALIYOR', () => {
  saveMessage({ id: 'm1', content: 'bulunacak' }, 'c1');
  applyDeleted({ messageId: 'm1', forEveryone: true, deletedAt: now });
  expect(searchMessages('bulunacak', { limit: 10 })).toHaveLength(0);
  // Ayırt edici: süzme sorguda olmasaydı geri alınan silme yeniden
  // indeksleme isterdi — indeks satırı duruyor.
  expect(ftsRowsFor('m1')).toHaveLength(1);
});

it('sonuçlar en yeniden eskiye sıralı', () => { /* üç mesaj, sent_at_ms DESC */ });
it('conversationId verilince yalnız o sohbette arıyor', () => { /* … */ });
it('limit/offset sayfalıyor', () => { /* … */ });
it('Türkçe katlama arama ile isim aramasıyla AYNI: "ISIK" → "ışık" buluyor', () => { /* … */ });

it('readAround hedefin iki yanından pencere getiriyor ve hedefi İÇERİYOR', () => {
  // 10 mesaj, 5.'yi hedefle, before 2 / after 2 → 5 satır, ortadaki hedef
});
it('readAround arşivin başındaki mesajda da patlamıyor (before yetersiz)', () => { /* … */ });
```

- [ ] **Step 2: Testleri koştur, BAŞARISIZ olduklarını gör**
- [ ] **Step 3: `messageSearch.ts`'i ve iki depo fonksiyonunu yaz**

`searchMessages` iki SQL şekli taşıyor: `isFtsAvailable()` ise FTS `MATCH`, değilse `content_folded LIKE ?`. İkisi de aynı sıralama, aynı süzgeçler (silinmiş hariç), aynı sonuç şekli.

- [ ] **Step 4: Testleri koştur, GEÇTİKLERİNİ gör**
- [ ] **Step 5: Commit** — `feat(chat): yerel mesaj aramasi + mesaj penceresi okumasi`

---

### Task 4: Global aramada "Mesajlar" bölümü

**Files:**
- Modify: `src/features/chat/screens/MessagesScreen.tsx`
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts`
- Test: `tests/features/chat/messagesScreenSearch.test.tsx`

Arama aktifken liste üçüncü bir bölüm kazanıyor: kişiler/sohbetler (bugünkü `conversationsByTab`) + **mesajlar**. Satırda kim, ne zaman, ve eşleşen kelimenin vurgulandığı içerik. Sorgu `prepareSearchQuery`den geçiyor; `null` dönerse mesaj bölümü HİÇ GÖSTERİLMİYOR (bugünkü sohbet süzgeci aynen çalışmaya devam ediyor — boş sorguda hepsini göstermesi orada doğru).

- [ ] **Step 1: Testleri yaz**

```ts
it('sorgu eşiğin altındayken mesaj bölümü görünmüyor, sohbet süzgeci çalışıyor', () => { /* … */ });
it('eşik üstünde mesaj sonuçları listeleniyor', () => { /* … */ });
it('sonuç yokken "mesaj bulunamadı" satırı çıkıyor — bölüm sessizce kaybolmuyor', () => { /* … */ });
it('arama kapanınca mesaj bölümü kalkıyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): global aramada mesaj sonuclari`

---

### Task 5: Sonuca dokununca mesaja atlama

**Files:**
- Modify: `src/features/chat/screens/ChatScreen.tsx`, `src/features/chat/chatSlice.ts`
- Test: `tests/features/chat/chatScreenJumpToMessage.test.tsx`

Sonuç satırına dokunmak `ChatScreen`i `targetMessageId` + `targetSentAtMs` ile açıyor; ekran `readAround` ile pencereyi yerelden okuyup hedefe kaydırıyor ve kısa süre vurguluyor. **Ağ turu YOK** — roadmap 4.3'ün "yerel yolun en büyük avantajı" dediği şey bu.

- [ ] **Step 1: Testleri yaz**

```ts
it('hedefli açılışta pencere YERELDEN okunuyor, geçmiş ucu çağrılmıyor', () => {
  expect(getMessageHistory).not.toHaveBeenCalled();
});
it('hedef mesaj listede ve vurgulanmış', () => { /* … */ });
it('arşivde olmayan hedefte normal açılışa düşüyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): arama sonucundan mesaja atlama`

---

### Task 6: Sohbet içinde ara (ayrılabilir — burada durulabilir)

**Files:**
- Modify: `src/features/chat/screens/ChatScreen.tsx`
- Modify: `src/shared/i18n/translations/tr.ts`, `en.ts`
- Test: `tests/features/chat/chatScreenInlineSearch.test.tsx`

Sohbet başlığından açılan arama; `searchMessages({ conversationId })` ile eşleşmeler, aralarında ileri/geri gezinme. Her atlayış Task 5'in penceresini kullanıyor.

- [ ] **Step 1: Testleri yaz**

```ts
it('başlıktan arama açılıyor ve yalnız bu sohbette arıyor', () => { /* conversationId geçiliyor */ });
it('ileri/geri eşleşmeler arasında dönüyor ve sayaç doğru', () => { /* "2/5" */ });
it('eşleşme yokken ileri/geri bir şey yapmıyor', () => { /* … */ });
```

- [ ] **Step 2-4: RED → yaz → GREEN**
- [ ] **Step 5: Commit** — `feat(chat): sohbet icinde arama`

---

## Fazdan sonra açık kalanlar

- **Backfill'in FTS'i toplu beslemesi** — roadmap 4.2 "ölçülüp seçilecek" diyor. Bu plan satır satır tek kapıdan besliyor; backfill'in milyon satırında yavaş kalırsa tur bitiminde tek seferlik `INSERT INTO messages_fts SELECT …` eklenecek. Ölçülmeden yapılmıyor.
- **Cihaz testi** — FTS5'in derlendiği build bayraklarından doğrulandı ama gerçek cihazda arama hiç koşmadı.
- Faz 5 (medya offline) ve Faz 6 (tazelik) kapsam dışı.
