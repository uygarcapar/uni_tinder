# Akış yazar kartı: aksiyon kümesi + "beni beğenmiş" hâli — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Akıştan açılan yazar kartında X'i kaldırmak, yazar beni daha önce beğenmişse Fire+not yerine kabul/reddet göstermek ve Fire butonunun not kutusuyla çakışmasını bitirmek.

**Architecture:** İki saf fonksiyon kararın tamamını taşıyor — `feedCardActions` üç hâle çıkıyor, `authorLikedMe` hâli sunucu bayrağı ile yerel kümenin OR'undan çözüyor; `LikerSwipeModal` X için `allowLike`'ın birebir ikizi olan bir `allowPass` opt-out'u kazanıyor; `SwipeCard`'ın önizleme aksiyon kolonu not kutusunu içine alarak Keşif kapağıyla aynı dizilime geliyor; `FeedScreen` yalnız bu üçünü birbirine bağlıyor.

**Tech Stack:** React Native · TypeScript · Redux Toolkit · TanStack Query · Jest + @testing-library/react-native

**Spec:** `docs/superpowers/specs/2026-10-28-feed-card-liked-me-actions-design.md`

## Global Constraints

- Test komutu **node@24 ister**: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` olmadan jest çıktısız SIGSEGV veriyor (better-sqlite3 ABI).
- Yeni propların varsayılanı **bugünkü davranışı korumak zorunda**: `LikerSwipeModal` ve `SwipeCard` Beğeniler, sohbet kartı, profil önizlemesi ve Keşif destesi tarafından da kullanılıyor.
- `allowPass` varsayılanı **`true`** — `allowLike`'ın birebir ikizi.
- Kapatılan aksiyonun handler'ı `SwipeCard`'a **`undefined`** geçer; "çizilsin ama basılmasın" yasak (ölü buton).
- Aksiyon kolonu **`Animated.View` olmamalı** ve ata zincirinde `opacity < 1` ya da kimliksel olmayan transform bulunmamalı — cam efekti sessizce hiç render edilmiyor.
- `hasLikedMe` selector'ü **`store.getState()`** ile okunur, `useAppSelector` ile DEĞİL (render churn).
- Yorumlar ve test adları **Türkçe**, çevresindeki kodun yoğunluğuyla aynı.
- Wire değerleri PascalCase (`"Dating"` | `"Friends"`); swipe yönleri `"left"` | `"right"` | `"up"`.

## Review Focus

Spec'in ima ettiği ama hiçbir task'ın testinin kendiliğinden yakalamadığı girdiler. Her biri sahibi olan task'a test olarak eklendi:

1. **`hasLikedMe` ile mod yokluğu çakışması** — sunucu "bu kişi beni beğenmiş" diyor ama `resolveCardMode` null döndü (yazarın açık modu yok). Kart SALT OKUNUR kalmalı; beğenilmiş hâli modsuzluğu ezmemeli, yoksa sunucunun reddedeceği bir kabul butonu çizilir. → Task 1.
2. **`userId` yokken tespit** — `profile.userId` null/undefined (eksik payload). Yerel küme `false` döner ama `profile.hasLikedMe === true` dalı hâlâ açık; kart kabul/reddet gösterip `onSwipe` hiç ateşlenmez (`LikerSwipeModal > handleSwipe` `userId` yoksa yalnız kartı kapatıyor) → basılınca hiçbir şey yapmayan iki buton. Tespit `userId` **gerektirmeli**. → Task 1 (`authorLikedMe`).
3. **`hasLikedMe` alanının string gelmesi** — sunucu `"true"`, `"false"` ya da `1` gönderirse katı `=== true` false kalır (sessiz kapanma, güvenli taraf); `Boolean(...)` ile gevşetilirse `"false"` string'i **true** olur. Katılık test altında olmalı. → Task 1 (`authorLikedMe`).
4. **X kapalıyken panelin dibindeki satır** — `onPass` gidince `showActionsRow` (`!hideActions && !!(onPass || onLike)`) normal hâlde **false** olur ve o satırla birlikte **şikayet · engelle** ikonları da giderdi. Mevcut kod bunu zaten çözüyor: `showModerationRow = showModeration && !showActionsRow` (`SwipeCard.tsx:2888`) → ikonlar kendi ortalanmış satırına geçiyor. Test bu davranışı **kilitliyor**, değiştirmiyor. → Task 2.
5. **`hideNote` unutulması** — ana fotoğrafın kutusu bırakılmazsa kolona eklenen kutuyla birlikte **iki** not kutusu çıkar (ikisi de index 0'ı hedefler) ve o iki daire aynı köşede üst üste biner — yani bu işin düzelttiği hatanın aynısı. → Task 3.

---

## File Structure

| Dosya | Sorumluluk | Durum |
|---|---|---|
| `src/features/feed/feedCardMode.ts` | Kartın modu · hâli (`authorLikedMe`) · hangi aksiyonların çizildiği — hepsi saf | Değişiyor |
| `tests/features/feed/feedCardMode.test.ts` | Yukarıdakinin testleri | Değişiyor |
| `src/features/discover/components/LikerSwipeModal.tsx` | Kart sheet'i; aksiyonların açma/kapama kapıları | Değişiyor |
| `src/features/discover/components/SwipeCard.tsx` | Kartın kendisi; önizleme aksiyon kolonu | Değişiyor |
| `tests/features/discover/components/SwipeCardPreviewActions.test.tsx` | Önizleme kolonu + not kutusu testleri | Değişiyor |
| `src/features/feed/screens/FeedScreen.tsx` | Tespit + prop bağlama + karar sonrası rozet | Değişiyor |
| `jest.setup.ts` | `@expo/ui/swift-ui/modifiers` mock'unda eksik `accessibilityIdentifier` | **Plansız ama zorunlu çıktı** — `FireGlassButton` onu her zaman çağırıyor ve hiçbir test `SwipeCard`'ı `onFire` ile render etmemiş olduğu için boşluk hiç yüzeye çıkmamış. Task 2'nin testleri onsuz hiç çalışmıyor. |

---

### Task 1: Aksiyon kuralı üç hâle çıkıyor + tespit saf fonksiyona iniyor

**Files:**
- Modify: `src/features/feed/feedCardMode.ts:57-70`
- Test: `tests/features/feed/feedCardMode.test.ts:64-91`

**Interfaces:**
- Consumes: `AppMode` (`@/features/discover/modeTheme`), mevcut `resolveCardMode` / `normalizeModes` (değişmiyor)
- Produces:
  ```ts
  type FeedCardActions = {
    like: boolean;   // tik (kabul)
    pass: boolean;   // X (reddet)
    fire: boolean;   // Fire/Spark
    note: boolean;   // not kutuları
  };
  function feedCardActions(mode: AppMode | null, hasLikedMe: boolean): FeedCardActions;

  /**
   * Yazar beni daha önce beğenmiş mi. İki kaynağın OR'u, SAF: yerel kümeyi
   * bir yüklem olarak alıyor, böylece Redux'a da store'a da bağlı değil.
   */
  function authorLikedMe(
    profile: unknown,
    likedLocally: (userId: string) => boolean,
  ): boolean;
  ```
  ⚠️ `authorLikedMe` **ayrı bir fonksiyon** ve `feedCardActions`'a gömülü DEĞİL: biri "hangi butonlar", diğeri "hangi hâl". Birleştirmek saf kuralı payload şekline bağlardı.

- [ ] **Step 1: Mevcut `feedCardActions` suite'ini yeni sözleşmeye göre yaz**

`tests/features/feed/feedCardMode.test.ts` içindeki `describe("feedCardActions")` bloğunu bununla değiştir:

```ts
describe("feedCardActions", () => {
  it("NORMAL (Flört): yalnız Fire ve not — X ve tik YOK", () => {
    expect(feedCardActions("Dating", false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("NORMAL (Arkadaş): Flört'le AYNI küme — fark yalnız butonun adında", () => {
    expect(feedCardActions("Friends", false)).toEqual({
      like: false, pass: false, fire: true, note: true,
    });
  });

  it("BEĞENİLMİŞ: kabul + reddet — Fire ve not YOK (iki modda da)", () => {
    const expected = { like: true, pass: true, fire: false, note: false };
    expect(feedCardActions("Dating", true)).toEqual(expected);
    expect(feedCardActions("Friends", true)).toEqual(expected);
  });

  it("mod yoksa hiçbiri — beğenilmiş olsa BİLE kart salt okunur", () => {
    // Review Focus #1: sunucu "beni beğenmiş" derken yazarın açık modu
    // olmayabilir. Beğenilmiş hâli modsuzluğu EZMEMELİ, yoksa sunucunun
    // reddedeceği bir kabul butonu çizilir.
    const none = { like: false, pass: false, fire: false, note: false };
    expect(feedCardActions(null, false)).toEqual(none);
    expect(feedCardActions(null, true)).toEqual(none);
  });

  it("like ve pass her hâlde BİRLİKTE — tek başına X'e dönüş yolu kapalı", () => {
    // Bu işin düzelttiği hata tam olarak tek başına duran bir X'ti.
    for (const mode of ["Dating", "Friends", null] as const) {
      for (const liked of [true, false]) {
        const a = feedCardActions(mode, liked);
        expect(a.like).toBe(a.pass);
      }
    }
  });
});

/**
 * "Yazar beni beğenmiş mi" — kartın HANGİ HÂLDE doğacağını belirleyen tespit.
 *
 * İki kaynağın OR'u (bkz. DiscoverScreen'deki aynı kalıp): sunucunun bayrağı
 * VEYA yerel "beni beğenenler" kümesi. Yanlış pozitif, zaten bekleyen birine
 * Fire yakılmasını önlerken; yanlış negatif, kullanıcıya hiçbir şey yapmayan
 * iki buton gösteriyor.
 */
describe("authorLikedMe", () => {
  const noneLocal = () => false;
  const allLocal = () => true;

  it("sunucu bayrağı true ise beğenilmiş", () => {
    expect(authorLikedMe({ userId: "u1", hasLikedMe: true }, noneLocal)).toBe(true);
  });

  it("bayrak yoksa yerel kümeye düşüyor", () => {
    expect(authorLikedMe({ userId: "u1" }, allLocal)).toBe(true);
    expect(authorLikedMe({ userId: "u1" }, noneLocal)).toBe(false);
  });

  it("yüklem YALNIZ profilin userId'si ile çağrılıyor", () => {
    const spy = jest.fn(() => false);
    authorLikedMe({ userId: "u1" }, spy);
    expect(spy).toHaveBeenCalledWith("u1");
  });

  /**
   * Review Focus #2: `userId` YOKSA tespit kapalı. Aksi halde kabul/reddet
   * çizilir ama `LikerSwipeModal > handleSwipe` userId'siz yalnız kartı
   * kapatıyor — basılınca hiçbir şey yapmayan iki buton.
   */
  it.each([undefined, null, ""])("userId yoksa (%p) false — bayrak true OLSA BİLE", (userId) => {
    expect(authorLikedMe({ userId, hasLikedMe: true }, allLocal)).toBe(false);
  });

  /**
   * Review Focus #3: bayrak KATI `=== true`. Gevşetilirse ("Boolean(...)")
   * sunucudan gelen "false" string'i true olur ve kullanıcıya yanlış hâl
   * gösterilir. Katı karşılaştırmanın güvenli tarafı: bilinmiyorsa normal kart.
   */
  it.each(["true", "false", 1, 0, {}])(
    "bayrak boolean değilse (%p) yok sayılıyor",
    (hasLikedMe) => {
      expect(authorLikedMe({ userId: "u1", hasLikedMe }, noneLocal)).toBe(false);
    },
  );

  it("profil yoksa false — kart henüz yüklenmemiş", () => {
    expect(authorLikedMe(null, allLocal)).toBe(false);
    expect(authorLikedMe(undefined, allLocal)).toBe(false);
  });
});
```

Import satırına `authorLikedMe` ekle.

- [ ] **Step 2: Testi çalıştır, başarısız olduğunu gör**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/feed/feedCardMode.test.ts
```

Beklenen: FAIL — `pass` alanı dönmüyor, ikinci argüman yok sayılıyor ve `authorLikedMe` tanımlı değil.

- [ ] **Step 3: `FeedCardActions` tipine `pass` ekle ve `feedCardActions(mode, hasLikedMe)` imzasını uygula**

`src/features/feed/feedCardMode.ts`. Dal sırası ÖNEMLİ — mod kapısı en başta:

```ts
export function feedCardActions(
  mode: AppMode | null,
  hasLikedMe: boolean,
): FeedCardActions {
  if (mode == null) return { like: false, pass: false, fire: false, note: false };
  if (hasLikedMe) return { like: true, pass: true, fire: false, note: false };
  return { like: false, pass: false, fire: true, note: true };
}
```

- [ ] **Step 4: `authorLikedMe(profile, likedLocally)` fonksiyonunu ekle**

Aynı dosya. `profile`'ı `unknown` alıp içeride daraltıyor; `userId` string ve boş değilse yüklemi onunla çağırıyor, bayrak karşılaştırması katı `=== true`.

⚠️ Dal sırası: `userId` kapısı **önce**. Bayrak true olsa bile userId yoksa `false` dönmeli (Review Focus #2) — "bayrağa bakıp erken dön" yazımı o testi kırar.

- [ ] **Step 5: Fonksiyonların doc bloğunu üç hâli anlatacak şekilde yeniden yaz**

`feedCardMode.ts:38-56`'daki "── Kural (istek) ──" bloğu. Yazılması gerekenler:
- **Normal**: yalnız Fire/Spark + not. X **yok** ve gerekçesi — akışta kart karşı taraftan gelen bir sinyale cevap değil, sen kendi isteğinle profile giriyorsun; reddedilecek bir şey yok. Tik de yok (bedelsiz beğeni gürültüsü, 2026-10-22 kuralı).
- **Beğenilmiş**: kabul + reddet. Fire ve not **yok** — karşı taraf seni zaten beğenmiş, yükseltecek bir şey yok (`LikerSwipeModal > allowFire` varsayılanının gerekçesinin aynısı).
- **Mod yok**: hiçbiri; bu kapı `hasLikedMe`'yi **ezer**.
- ⚠️ `like`/`pass` bir **çift**; ayrı ayrı açılabilir iki bayrak gibi davranmak tek başına duran X'e dönüş yolu.
- ⚠️ Normal hâlde iki mod aynı kümeyi alıyor; fark yalnız **adda ve renkte** (`modeFireNameKey` · `modeFireTint`).
- ⚠️ Arkadaş'ta düz beğeninin tarihçesi: 2026-10-22'de açıldı, 2026-10-28'de bir kez kapatılıp aynı turda geri alındı, sonra "yalnız beğenilmiş hâlinde" olarak yerine oturdu. Testin işi bu salınımı dondurmak.

Ayrıca `pass` alanına satır içi yorum: "X (reddet) çizilsin mi — `like` ile birlikte açılır."

`authorLikedMe`'nin doc bloğunda yazılması gerekenler: iki kaynağın OR'u ve **neden ikisi birden** (sunucu bayrağı tam kapsama verir ama dönüp dönmediği bilinmiyor; yerel küme yalnız ilk sayfayı tutuyor — `getWhoLikedMe(1,10,10,mode)`, bkz. `swipeSlice > applyWhoLikedMe`); yüklem olarak alınmasının gerekçesi (saf kalsın, `store`a bağlanmasın); katı `=== true`'nun gerekçesi; `userId` kapısının gerekçesi.

- [ ] **Step 6: Testi çalıştır, geçtiğini gör**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/feed/feedCardMode.test.ts
```

Beklenen: PASS (resolveCardMode ve normalizeModes suite'leri dahil, 25+ test).

- [ ] **Step 7: Commit**

```bash
git add src/features/feed/feedCardMode.ts tests/features/feed/feedCardMode.test.ts
git commit -m "feat(feed): kart aksiyonlari uc hale cikti — normal / begenilmis / modsuz"
```

---

### Task 2: X'in opt-out kapısı

**Files:**
- Modify: `src/features/discover/components/LikerSwipeModal.tsx:98-112` (prop destructure), `:380-422` (SwipeCard props), `:71-97` (prop doc blokları)
- Test: `tests/features/discover/components/SwipeCardPreviewActions.test.tsx`

**Interfaces:**
- Consumes: Task 1'in `pass` alanı (Task 4 bağlıyor)
- Produces: `LikerSwipeModal` prop `allowPass?: boolean` — **varsayılan `true`**. Kapalıyken `onPass` `SwipeCard`'a `undefined` geçer.

- [ ] **Step 1: `SwipeCard` seviyesinde ters yön testini yaz**

`SwipeCardPreviewActions.test.tsx`'teki `describe('SwipeCard previewMode cover actions')` bloğunun sonuna, mevcut `'onLike verilmezse tik çizilmiyor, X duruyor'` testinin ikizi olarak:

```tsx
  /**
   * X OPT-OUT — akışın NORMAL kartı (bkz. feedCardActions): `onPass`
   * verilmiyor ve X HİÇBİR yerde çizilmiyor. Akışta kart karşı taraftan gelen
   * bir sinyale cevap değil; reddedilecek bir şey yok.
   */
  it('onPass verilmezse X çizilmiyor', () => {
    const tree = renderCard({ onFire: () => {} });
    expect(tree.queryByText('chrome:likes.passButton')).toBeNull();
  });

  /**
   * Review Focus #4: `onPass` gidince panelin dibindeki X/tik satırı da
   * düşüyor (`showActionsRow` ikisine bağlı) — ŞİKAYET ve ENGELLE onunla
   * birlikte kaybolmamalı, kartın en alttaki moderasyon girişi orası.
   * `showModerationRow = showModeration && !showActionsRow` (SwipeCard:2888)
   * bunu zaten çözüyor; bu test o davranışı KİLİTLİYOR.
   */
  it('X gitse de şikayet/engelle duruyor', () => {
    const tree = renderCard({
      onFire: () => {},
      onReport: () => {},
      onBlock: () => {},
    });
    expect(tree.getByLabelText('profile.card.reportAccount')).toBeTruthy();
    expect(tree.getByLabelText('profile.card.blockAccount')).toBeTruthy();
  });
```

⚠️ `ModerationIconButton` etiketini nasıl taşıyorsa ona göre uyarla (`getByLabelText` tutmazsa bileşeni bu dosyadaki diğer mock'lar gibi düz bir `Text`'e indir). Testin iddiası sabit: iki ikon **var**.

- [ ] **Step 2: Testi çalıştır**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/discover/components/SwipeCardPreviewActions.test.tsx
```

Beklenen: **ikisi de PASS**. İkisi de guard, driver değil — `SwipeCard` tarafında değişiklik gerekmiyor: X zaten `onPass &&` ile korumalı (`:3946` · `:5665`) ve moderasyon dalı zaten `!showActionsRow` koşulunda (`:2888`). Bu task'ın gerçek değişikliği `LikerSwipeModal`'da; testler oradaki kapının `SwipeCard` tarafında bir gerilemeyle sessizce etkisizleşmesini engelliyor.

⚠️ `'X gitse de şikayet/engelle duruyor'` FAIL ederse DUR: `showModerationRow` beklediğimden farklı davranıyor demektir, önce onu anla.

- [ ] **Step 3: `LikerSwipeModal`'a `allowPass` ekle**

`LikerSwipeModal.tsx`:
- Destructure'a `allowPass = true` (satır 107'deki `allowLike = true`'nun yanına).
- `SwipeCard`'a geçen `onPass` satırını (`:409`) `allowLike`'ınkiyle **aynı kalıba** çevir:
  ```tsx
  onPass={allowPass ? () => triggerAction("left") : undefined}
  ```
- `allowLike`'ın hemen üstüne `@param allowPass` doc bloğu: varsayılan AÇIK ("seni beğenenler"de X kartın iki anlamlı cevabından biri); akışın **normal** kartı kapatıyor (orada reddedilecek bir sinyal yok), **beğenilmiş** kartı açıyor — orada `allowLike` ile birlikte kabul/reddet çiftini kuruyor. `undefined` vermek ŞART (ölü buton).
- `allowLike`'ın mevcut doc bloğundaki "Akışın FLÖRT kartı kapatıyor" cümlesini güncelle: tik akışta **yalnız beğenilmiş** kartta var.

- [ ] **Step 4: Testleri ve tip kontrolünü çalıştır**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/discover/components/SwipeCardPreviewActions.test.tsx
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "LikerSwipeModal|SwipeCard"
```

Beklenen: jest PASS; grep çıktısı boş.

- [ ] **Step 5: Commit**

```bash
git add src/features/discover/components/LikerSwipeModal.tsx tests/features/discover/components/SwipeCardPreviewActions.test.tsx
git commit -m "feat(card): allowPass opt-out — X artik kapatilabiliyor, moderasyon kaliyor"
```

---

### Task 3: Not kutusu önizleme kolonuna giriyor

**Files:**
- Modify: `src/features/discover/components/SwipeCard.tsx:3891-3977` (önizleme bloğu + kolon)
- Test: `tests/features/discover/components/SwipeCardPreviewActions.test.tsx`

**Interfaces:**
- Consumes: `noteHandler(target)` (`:3393`), `photoNoteTarget(0)`, `NoteBox` (`:1233`), `COVER_ACTION_SIZE`, `COVER_ACTION_GAP`
- Produces: davranış değişikliği yok — kolonun içeriği değişiyor. Sonraki task bir şey tüketmiyor.

**⚠️ Bu task'ın testi driver DEĞİL, guard.** Taşıma RTL'de gözlemsel olarak eşdeğer (kutu yine var, yine index 0'ı hedefliyor, sayısı aynı); değişen tek şey **yerleşim**. Tek gerçek yeni iddia "**tam bir** kutu" — `hideNote` unutulursa iki kutu çıkar (Review Focus #5). Çakışmanın kendisi **cihazda** doğrulanır.

- [ ] **Step 1: Mükerrer kutu testini yaz**

`describe('SwipeCard previewMode note boxes')` bloğunun sonuna:

```tsx
  /**
   * Review Focus #5: kutu artık AKSİYON KOLONUNUN İÇİNDE (Keşif kapağıyla aynı
   * dizilim: tik · X · Fire · not). Ana fotoğrafın kendi kutusu `hideNote` ile
   * bırakılmazsa index 0'ı hedefleyen İKİ kutu çıkar — ve o iki daire aynı
   * köşede üst üste biner (bu işin düzelttiği hata).
   *
   * Fixture'da tek fotoğraf, prompt yok → doğru sayı TAM 1.
   */
  it('Fire ile birlikte TEK not kutusu var (mükerrer yok)', () => {
    const tree = renderCard({ onNote: () => {}, onFire: () => {} });
    expect(tree.getAllByText('glyph:note.boxLabel')).toHaveLength(1);
  });

  /**
   * Kolon not İÇİN de doğuyor: Keşif'teki koşulun (`!!onNote &&
   * allPhotos.length > 0`) aynısı. `hideActions` yalnız karar butonlarını
   * kaldırıyor, notu değil — yoksa kutu taşındığı yerle birlikte kaybolurdu.
   */
  it('hideActions iken kutu hâlâ çiziliyor', () => {
    const tree = renderCard({ hideActions: true, onNote: () => {} });
    expect(tree.getAllByText('glyph:note.boxLabel')).toHaveLength(1);
  });
```

- [ ] **Step 2: Testi çalıştır — taşımadan ÖNCEKİ durumu kaydet**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/discover/components/SwipeCardPreviewActions.test.tsx
```

Beklenen: ilk test PASS (bugün de tek kutu var — bu bir guard), ikinci test PASS. İkisi de geçmiyorsa taşımaya başlamadan sebebini anla.

- [ ] **Step 3: Kutuyu kolona taşı**

`SwipeCard.tsx:3891-3977`:
1. Ana fotoğrafın `SectionPhoto` çağrısına (`:3892`) **`hideNote`** ekle ve `onNotePress`'i kaldır — kutu artık kolonda.
2. Kolonun görünme koşuluna (`:3918`) not terimini ekle; Keşif'in `:4343`'teki koşuluyla aynı biçim:
   ```
   (!hideActions && !!(onPass || onLike || (!hideFire && onFire))) ||
   (!!onNote && allPhotos.length > 0)
   ```
   ⚠️ Not terimi `hideActions`'ın **DIŞINDA** — gerekçe Step 1'in ikinci testinde.
3. Fire butonundan **sonra** `NoteBox`'ı ekle (sıra: tik · X · Fire · **not**):
   ```tsx
   {!!onNote && allPhotos.length > 0 && (
     <NoteBox onPress={noteHandler(photoNoteTarget(0))} onPhoto />
   )}
   ```
4. Kolonun doc bloğunu (`:3901-3917`) güncelle: sıranın artık dördüncü halkası var ve **neden** — iki daire (`NoteBox onPhoto` ve `FireGlassButton`) `COVER_ACTION_SIZE` çapında, aynı cam kabuğu kullanıyor ve ikisi de fotoğrafın sağ alt köşesine çiviliydi; biri fotoğrafın İÇİNDEKİ tam genişlikte katmandan (`alignSelf: flex-end`), diğeri fotoğrafın KARDEŞİ olan kolondan geliyordu. Çakışma buydu. Kolona almak çakışmayı yapısal olarak imkânsız kılıyor.
5. `SectionPhoto > hideNote` prop'unun doc bloğunu (`:1338-1348`) güncelle: "ARTIK TEK MÜŞTERİSİ var" cümlesi yanlışlaşıyor — **iki** müşterisi var (Keşif kapağı + önizlemenin ana fotoğrafı), ikisi de aynı gerekçeyle: kutuyu o bağlamda **aksiyon kolonu** çiziyor.

- [ ] **Step 4: Testleri ve tip kontrolünü çalıştır**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx jest tests/features/discover/components/SwipeCardPreviewActions.test.tsx
npx tsc --noEmit -p tsconfig.json 2>&1 | grep SwipeCard
```

Beklenen: jest PASS (tüm suite — özellikle mevcut `'kutuya basmak ana fotoğrafın hedefiyle çağırıyor (index 0)'` testi, hedef taşınırken kaymamalı); grep boş.

- [ ] **Step 5: Commit**

```bash
git add src/features/discover/components/SwipeCard.tsx tests/features/discover/components/SwipeCardPreviewActions.test.tsx
git commit -m "fix(card): not kutusu onizleme aksiyon kolonuna girdi — Fire ile cakisma bitti"
```

---

### Task 4: FeedScreen bağlama — tespit, proplar, rozet

**Files:**
- Modify: `src/features/feed/screens/FeedScreen.tsx:995-1010` (cardMode/cardActions), `:1193-1205` (handleAuthorSwipe), `:2977-3006` (LikerSwipeModal propları), `:1020-1034` (fireQuotaExhausted doc)
- Test: yok (aşağıdaki nota bak)

**Interfaces:**
- Consumes: Task 1 `feedCardActions(mode, hasLikedMe)` + `authorLikedMe(profile, likedLocally)`; Task 2 `allowPass`; `hasLikedMe(state, userId)` ve `removeWhoLikedMe` (`@/features/discover/swipeSlice`); mevcut `store` (`@/shared/store`), `dispatch` (`FeedScreen.tsx:385`)
- Produces: son task

**⚠️ Birim testi yok ve bu bilinçli:** `FeedScreen` mount etmek akış sorgularını, haritayı, SignalR'ı ve altı sheet'i birlikte ayağa kaldırmak demek. Kararın da tespitin de kendisi Task 1'de saf fonksiyonlarda ve orada test altında; buradaki iş saf plumbing. Doğrulama: `tsc` + cihaz testi.

- [ ] **Step 1: Tespiti bağla**

`FeedScreen.tsx`, `cardMode` useMemo'sunun (`:995`) hemen ardına:

```ts
const authorHasLikedMe = useMemo(
  () =>
    authorLikedMe(authorProfile.data, (userId) =>
      // `store.getState()` — `useAppSelector` DEĞİL (bkz. swipeSlice.ts:137,
      // render churn). Değer kart açılırken bir kez çözülüyor: hâlin kart
      // ortasında değişmesi kullanıcının elindeki butonları altından çeker.
      hasLikedMe(store.getState(), userId),
    ),
  [authorProfile.data],
);
```

Import satırlarını ekle: `authorLikedMe` (mevcut `../feedCardMode` importuna), `store` (`@/shared/store`), `hasLikedMe` + `removeWhoLikedMe` (`@/features/discover/swipeSlice`).

⚠️ Tespitin kuralları (bayrak katılığı, `userId` kapısı, OR'un gerekçesi) `authorLikedMe`'nin içinde ve orada test altında — burada **tekrar edilmiyor**.

- [ ] **Step 2: `cardActions`'ı yeni imzaya bağla ve doc bloğunu güncelle**

`:1010`: `feedCardActions(cardMode, authorHasLikedMe)`, deps `[cardMode, authorHasLikedMe]`. Üstündeki doc bloğu üç hâli tek tabloda anlatsın (spec'teki tablonun aynısı).

- [ ] **Step 3: Propları bağla**

`:2977-3006` içindeki `LikerSwipeModal`:
- `allowPass={cardActions.pass}` ekle — yorumu: X yalnız **beğenilmiş** kartta; normal kartta reddedilecek bir sinyal yok.
- `allowLike={cardActions.like}` yorumunu güncelle: tik = **kabul**, yalnız beğenilmiş kartta.
- `allowFire` / `onNote` satırlarının yorumlarına: beğenilmiş kartta ikisi de kapanıyor çünkü karşı taraf seni zaten beğenmiş, yükseltecek bir şey yok.
- `:2960-2976`'daki "YAZAR KARTI" blok yorumunu üç hâle göre yeniden yaz (şu an "(a) aksiyon alınabiliyor / (b) alınamıyor" ikilisi; (a) artık ikiye ayrılıyor).
- `:1020-1034`'teki `fireQuotaExhausted` doc'u: kapı artık **yalnız normal** kartta anlamlı — beğenilmiş kartta Fire hiç çizilmiyor.

- [ ] **Step 4: Karar sonrası rozeti düş**

`handleAuthorSwipe` (`:1193`) içine, mevcut `invalidateQueries` çağrılarının yanına:

```ts
// Kabul ya da reddetten sonra rozet ANINDA düşsün — Keşif'teki aynı kalıp
// (`DiscoverScreen.tsx:2537` · `2711`). Kapı `hasLikedMe`: kümede olmayan bir
// id için sayacı düşürmek, sayfalanmamış toplamı sessizce bozar
// (bkz. swipeSlice > removeWhoLikedMe'nin notu).
if (hasLikedMe(store.getState(), _userId)) {
  dispatch(removeWhoLikedMe(_userId));
}
```

`_userId` parametresi artık kullanıldığı için adını `userId`'ye çevir.

⚠️ `direction === "block"` dalı değişmiyor. Engelleme de bu fonksiyondan geçiyor ve engellenen bir liker'ın rozetten düşmesi doğru — ayrı dal gerekmez.

- [ ] **Step 5: Tip kontrolü ve tüm test suite'i**

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "FeedScreen|feedCardMode|LikerSwipeModal|SwipeCard"
npx jest tests/features/feed tests/features/discover
```

Beklenen: grep çıktısı boş; jest PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/feed/screens/FeedScreen.tsx
git commit -m "feat(feed): yazar beni begenmisse kart kabul/reddet gosteriyor"
```

---

## Cihaz doğrulaması (plan sonu, kod değil)

Birim testlerin ulaşamadığı üç şey — bitirmeden önce cihazda bak:

1. **Fire–not çakışması gitti**: akıştan normal bir profile gir, ana fotoğrafın sağ altında **iki ayrı daire** dikey dizilmiş olmalı (Fire üstte, not altta), üst üste binmemiş.
2. **Cam kabuklar render ediliyor**: kolondaki her iki daire de cam; düz/kayıp görünüyorsa ata zinciri kuralı ihlal edilmiş.
3. **Beğenilmiş hâli**: Beğeniler'de seni bekleyen birinin akıştaki gönderisine gir — tik/X olmalı, Fire ve not **olmamalı**. Kabul edince eşleşme kutlaması gelmeli ve Beğeniler rozeti anında düşmeli.
