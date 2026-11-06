# Keşif Çıkış Uçuşu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keşif'te beğen/geç kartı yana uçursun (alevsiz), alev yalnız Fire/Spark ve notta kalsın, geri al alevsiz soldan kayarak gelsin.

**Architecture:** Çıkışın tek kapısı (`commitExit`) duruyor; altında iki model ayrışıyor — `left`/`right` → hıza duyarlı `withTiming` uçuşu, devir uçuşun callback'inde; `up` (Fire) → bugünkü alev süpürmesi, değişmiyor. Hız → süre eşlemesi saf bir modüle çıkıyor ve node'da test ediliyor (bu kod tabanının yerleşik kalıbı: geometri/zamanlama saf modülde, bileşen onu okur).

**Tech Stack:** React Native · Reanimated 3 (`withTiming`, `runOnJS`) · Gesture Handler · Jest (node ortamı, saf modül testleri)

**Spec:** [docs/superpowers/specs/2026-11-06-discover-exit-flight-design.md](../specs/2026-11-06-discover-exit-flight-design.md)

## Global Constraints

- Jest **node@24 ister**: varsayılan node 20'de çıktısız SIGSEGV. Komutlardan önce PATH'e node@24 konmalı.
- Commit mesajlarında Claude atfı YOK (ne trailer ne gövdede isim).
- Dosya-içi notlar bu kod tabanında sözleşme: kaldırılan/değişen bir davranışın notu aynı commit'te güncellenir.
- Kapsam yalnız `DiscoverScreen` + `SwipeWrapper`. `LikerSwipeModal` (Beğenenler) etkilenmiyor.
- Uçuş sabitleri: `FLY_OUT_MS_SLOW = 180`, `FLY_OUT_MS_FAST = 120`, hız eşiği `2500` (jestteki `VELOCITY_THRESHOLD`'un aynısı), easing `Easing.out(Easing.cubic)`, mesafe `EXIT_CLEAR_DISTANCE` (zaten `SwipeWrapper`'da), overshoot YOK.
- Buton kilitleri: Fire `1300`, geç/beğen `250`.

## Review Focus

1. **Bozuk hız değeri** (`NaN`, `Infinity`, negatif): süre iki tavan arasında kalmalı, `withTiming` `NaN` süreyle çağrılmamalı → Task 1 testi.
2. **Uçuş yarıda kesilirse** (deste tazelendi, sekme değişti): `withTiming` callback'i `finished === false` geliyor; `onSwipe` ÇAĞRILMAMALI, yoksa sökülmüş ağaçtan deste ilerler → Task 2 adımı.
3. **`tx` sıfırlamasının yeri**: uçuş dalında sıfırlanırsa kart devir commit'ine kadar bir kare ekranın ortasına döner → Task 2, `resetAfterExit` ayrımı.
4. **`overlayDragX`in devir anındaki değeri**: 150'de bırakılırsa yeni alt kart bir kare tam parlak doğar → Task 2, `resetAfterExit()` → `onSwipe()` sırası.
5. **Geri al'da `commitRewind` sırası**: `pendingRewind.current` set edilmeden çağrılırsa sessiz no-op — basış hiçbir şey yapmaz → Task 4 adımı.

---

### Task 1: Uçuş süresinin saf modülü

**Files:**
- Create: `src/features/discover/exitFlight.ts`
- Test: `tests/features/discover/exitFlight.test.ts`

**Interfaces:**
- Produces: `flyOutDurationMs(velocityX: number): number` — bırakış hızından uçuş süresi. `FLY_OUT_MS_SLOW`, `FLY_OUT_MS_FAST`, `FLY_OUT_VELOCITY_FULL` sabitleri de buradan export ediliyor.

- [ ] **Step 1: Write the failing test** — `tests/features/discover/exitFlight.test.ts`

```ts
import {
  flyOutDurationMs,
  FLY_OUT_MS_FAST,
  FLY_OUT_MS_SLOW,
  FLY_OUT_VELOCITY_FULL,
} from '@/features/discover/exitFlight';

describe('flyOutDurationMs', () => {
  it('hızsız bırakışta (buton yolu) en uzun süre', () => {
    expect(flyOutDurationMs(0)).toBe(FLY_OUT_MS_SLOW);
  });

  it('eşik hızında en kısa süre', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL)).toBe(FLY_OUT_MS_FAST);
  });

  it('eşiğin üstünde daha da kısalmıyor', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL * 4)).toBe(FLY_OUT_MS_FAST);
  });

  it('yön fark etmiyor — hızın büyüklüğü okunuyor', () => {
    expect(flyOutDurationMs(-FLY_OUT_VELOCITY_FULL)).toBe(FLY_OUT_MS_FAST);
  });

  it('arada doğrusal', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL / 2)).toBe(
      (FLY_OUT_MS_SLOW + FLY_OUT_MS_FAST) / 2,
    );
  });

  it('bozuk hız en uzun süreye düşüyor', () => {
    expect(flyOutDurationMs(NaN)).toBe(FLY_OUT_MS_SLOW);
    expect(flyOutDurationMs(Infinity)).toBe(FLY_OUT_MS_FAST);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/features/discover/exitFlight.test.ts`
Expected: FAIL — modül bulunamıyor.

- [ ] **Step 3: Implement `flyOutDurationMs` in `src/features/discover/exitFlight.ts`**

`'worklet'` direktifiyle yazılacak: UI thread'inden (jest `onEnd`) çağrılıyor. Sabitler: `FLY_OUT_MS_SLOW = 180`, `FLY_OUT_MS_FAST = 120`, `FLY_OUT_VELOCITY_FULL = 2500`. Dosya başına, sayıların NEDEN bu olduğunu anlatan bir not (uçuş geri geldi, sabit süre sert fiskede kartı tutuyormuş gibi oluyordu).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/features/discover/exitFlight.test.ts`
Expected: PASS (6 test)

- [ ] **Step 5: Commit**

```bash
git add src/features/discover/exitFlight.ts tests/features/discover/exitFlight.test.ts
git commit -m "feat(discover): çıkış uçuşunun hıza duyarlı süresi için saf modül"
```

---

### Task 2: SwipeWrapper — beğen/geç uçuşu

**Files:**
- Modify: `src/features/discover/components/SwipeWrapper.tsx`

**Interfaces:**
- Consumes: `flyOutDurationMs` (Task 1).
- Produces: `onSwipe(direction, userId, matching?)` sözleşmesi daralıyor — `matching` artık yalnız `"up"` yönünde `true` olabiliyor (Task 3 buna dayanıyor).

- [ ] **Step 1: `collapseUnderCover` → `resetAfterExit(opts: { keepTx?: boolean })`**

Gövde aynı (`resetCardExpandState()`, `scrollY = 0`, `overlayDragX = 0`, `overlayOpacity = 1`), `tx.value = 0` yalnız `keepTx` yokken. Fonksiyonun notu güncelleniyor: artık "örtü altında" değil "örtü altında VEYA ekran dışında" çalışıyor; `keepTx`in gerekçesi (uçan kart hâlâ üst kart, `tx = 0` onu bir kare merkeze geri getirir; sıfırlamayı `!isTopCard` effect'i yapıyor, `SwipeWrapper.tsx:846`).

- [ ] **Step 2: `flyOut(direction, velocityX)` ekle**

JS tarafında bir fonksiyon (`runCoveredExit`in kardeşi): `tx.value = withTiming(sign * EXIT_CLEAR_DISTANCE, { duration, easing: Easing.out(Easing.cubic) }, (finished) => { if (finished) runOnJS(finishFlight)(direction) })` — `duration = flyOutDurationMs(velocityX)`. Aynı süreyle `overlayOpacity.value = withTiming(0, { duration })` (rozet ekran katında, kartla uçmuyor). `finishFlight`: `resetAfterExit({ keepTx: true })` sonra `onSwipe(direction, profile.userId)` — bu sıra zorunlu (Review Focus 4). `Easing` import'u `react-native-reanimated`'dan eklenecek.

- [ ] **Step 3: `runCoveredExit`i ikiye ayır**

`direction === "up"` → bugünkü gövde aynen (eşleşme dalı + `runFlameSweep({ hold: true, mode })`). Aksi hâlde → `flyOut`. Uçuş dalında `willMatch` **okunmuyor**. Çift çıkış kilidi (`flameCoverUnsub.current` kontrolü) uçuş dalında `exitPending` ile zaten var; uçuş için ayrı ref tutulmuyor.

- [ ] **Step 4: `commitExit` hızı taşısın**

`commitExit(direction, velocityX = 0)`; `runOnJS(runCoveredExit)(direction, velocityX)`. Jest `onEnd`i `event.velocityX`i geçiyor, `programmaticSwipe` (buton) dalı geçmiyor → 0 → `FLY_OUT_MS_SLOW`.

- [ ] **Step 5: Notları yeniden yaz**

Dosya başındaki "KARTIN ÇIKIŞ UÇUŞU TAMAMEN KALDIRILDI" notu ve `horizontalPan`in "⚠️ AMA ÇIKIŞ MODELİ ESKİYE DÖNMEDİ" paragrafı artık yanlış. İkisi de şunu anlatacak: uçuş 2026-11-06'da **beğen/geç için** geri geldi, Fire/not alev modelinde kaldı, `exitHandoff`/overshoot/65 ms devir geri GELMEDİ (devir uçuşun sonunda). `EXIT_CLEAR_DISTANCE` notundaki "bugün tek müşterisi GİRİŞ" cümlesi de düzeltilecek.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: hatasız.

- [ ] **Step 7: Mevcut testler yeşil**

Run: `npx jest tests/features/discover`
Expected: PASS (uçuş dalını kapsayan test yok; kırmızı çıkan olursa bu değişikliğin sonucudur, düzeltilir).

- [ ] **Step 8: Commit**

```bash
git add src/features/discover/components/SwipeWrapper.tsx
git commit -m "feat(discover): beğen/geç kartı yine yana uçuyor, alev Fire ve notta kaldı"
```

---

### Task 3: DiscoverScreen — eşleşme dalı ve buton kilidi

**Files:**
- Modify: `src/features/discover/screens/DiscoverScreen.tsx`

**Interfaces:**
- Consumes: Task 2'nin daralan `matching` sözleşmesi.

- [ ] **Step 1: Buton kilidini ikiye ayır**

`BUTTON_SWIPE_LOCK_MS` (240. satır) yerine `FIRE_BUTTON_LOCK_MS = 1300` ve `SWIPE_BUTTON_LOCK_MS = 250`. `handlePassButton` ve `handleLikeButton` ikincisini, Fire butonu birincisini kullanıyor. Notu güncelle: iki sayının AYRI olmasının sebebi iki ayrı çıkış modeli (uçuş 120-180 ms, alev ~800 ms).

- [ ] **Step 2: `handleSwipe`in notunu daralt**

`matching` dalı (`runMatchCurtain` + `deckHoldRef`) **kodda duruyor** ama artık yalnız Fire'dan geliyor. Nottaki "beğeniye de aynen uyuyor" cümlesi düzeltilecek: beğenide kart uçtuğu için perde beklenmiyor, karar 2026-11-06'da kullanıcıyla alındı ("kart uçsun sonra modal gelsin") — 2026-10-13'teki isteğin bilinçli geri alınması.

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: hatasız.

- [ ] **Step 4: Commit**

```bash
git add src/features/discover/screens/DiscoverScreen.tsx
git commit -m "feat(discover): eşleşmeli beğenide de kart uçuyor, perde arkadan geliyor"
```

---

### Task 4: DiscoverScreen — geri al alevsiz

**Files:**
- Modify: `src/features/discover/screens/DiscoverScreen.tsx`

- [ ] **Step 1: Alev kapısını kaldır**

`startRewindUnderCover`, `rewindFlameUnsub`, `rewindCovered`, `tryCommitRewind` siliniyor. `handleRewind`'daki `startRewindUnderCover()` çağrısı kalkıyor; yuva yolunda sıra **`pendingRewind.current = undoneUserId;` sonra `commitRewind();`** (ters sırada `commitRewind` sessiz no-op — Review Focus 5). `warmRewind` yolu değişmiyor, `handleRewindSlotReady` artık doğrudan `commitRewind` çağırıyor.

- [ ] **Step 2: Temizlik effect'ini güncelle**

Unmount cleanup'ında `rewindFlameUnsub` satırları kalkıyor; `matchCurtainUnsub` ve `deckHoldRef` duruyor (Fire dalı hâlâ kullanıyor).

- [ ] **Step 3: `commitRewind`in ölü satırını temizle**

`pendingRelease.current = true` — geri al dalında bekleyen dalga kalmadı, `releaseFlameSweep()` no-op. Satır siliniyor ve `commitRewind`in notu "alev" yerine "ölçüm" diliyle yeniden yazılıyor: tek kapı kartın ölçülü olması, giriş kayması (`cardEntryX` → `pendingEntryKick`) değişmiyor.

- [ ] **Step 4: `runFlameSweep` import'u hâlâ kullanılıyor mu kontrol et**

Not dalı (`handleSendNote`) kullanmaya devam ediyor — import kalıyor. `runMatchCurtain` de kalıyor.

- [ ] **Step 5: Type-check ve testler**

Run: `npm run type-check && npx jest tests/features/discover`
Expected: hatasız / PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/discover/screens/DiscoverScreen.tsx
git commit -m "feat(discover): geri al alevsiz — kart soldan kayarak geliyor"
```

---

## Cihaz doğrulaması (son adım, insan ortağıyla)

Simülatör yetmez — jest hızı ve alev birlikte ölçülüyor:

1. Sola/sağa kaydır → kart uçuyor, alev yok, arkadaki kart açılıyor.
2. Hızlı fiske ↔ yavaş sürükleyip bırakma → uçuş süresi gözle farklı.
3. ✓ / X butonları → aynı uçuş; art arda iki basış çalışıyor (1.3 sn ölü pencere yok).
4. Seni beğenmiş birine sağa kaydır → kart uçuyor, sonra MatchModal perdesi.
5. Aşağı çek (Fire) → kart yerinde, alev süpürüyor, değişim örtü altında.
6. Not gönder → alev, bugünkü gibi.
7. Geri al → alev yok, kart soldan kayarak geliyor; beyazlık/sıçrama yok.
8. Destenin sonunda geri al (`warmRewind` yolu) → kart yine kayarak geliyor.
9. Uçuş sırasında sekme değiştir / filtre kaydet → kart gidiyor, deste bozulmuyor.
