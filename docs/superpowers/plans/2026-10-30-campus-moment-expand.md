# Kampüs anı kartı — büyüyen kart + cam tik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kampüs anı kartına dokunmak profil açmak yerine kartı ekranın ortasına uçurup büyütsün; sağındaki cam tik beğeniyi göndersin, sonra Keşif'in alev süpürmesi oynarken kart örtünün altında küçülüp kapansın.

**Architecture:** Ölçü hesabı saf bir modülde (`campusExpandGeometry`), hareket ve cam tek bir overlay bileşeninde (`CampusMomentExpandOverlay`), kararın kendisi var olan `useCampusSurface.like`ta. Overlay şeridin ve haritanın KARDEŞİ olarak FeedScreen'de mount ediliyor; cam buton kart yerine oturduktan sonra, zamanlayıcıyla doğuyor.

**Tech Stack:** React Native, Reanimated (mevcut `useAnimatedStyle`/`withTiming` kalıbı), `@expo/ui/swift-ui` camı (`CardActionGlassButton`), `uiBus` alev köprüsü (`runFlameSweep`/`releaseFlameSweep`), Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-10-30-campus-moment-expand-design.md`

## Global Constraints

- **Cam, animasyonlu atanın altında doğamaz.** `CardActionGlassButton` uçan/büyüyen kartın ÇOCUĞU olamaz; kardeşi olacak ve kart oturduktan sonra mount edilecek.
- **Kapı zamanlayıcıyla açılır, `withTiming` callback'iyle DEĞİL** — kesilen animasyonun callback'i `finished:false` ile gelir ve bayrak hiç true olmaz (projede yazılı kural, eski `actionsReady`).
- **Yeni alev katmanı kurulmayacak.** `<FireFlame />` `AppNavigator.tsx:2246`'da global; yalnız `runFlameSweep` çağrılacak.
- **Beğeni yolu değişmiyor:** `useCampusSurface.like(moment)` — kotayı, paywall'ı (`CAMPUS_LIKE_LIMIT`), kart-düşüren kodları ve `refreshCampus`i o yönetiyor.
- **Kart oranı 3:4** (`CARD_ASPECT = 3 / 4`, `CampusMomentsStrip`).
- **Kendi anım dokunulamaz** (UT-7422): `isMine` kartta `onPress` verilmiyor, bu kural korunacak.
- Yorumlar Türkçe ve "neden"i anlatır — dosyaların mevcut dili.

## Review Focus

1. **Kota bitmişken tik** → paywall açılmalı, alev OYNAMAMALI ve overlay kapanmamalı (aksi hâlde kullanıcı kararını harcamış sanır). → Task 5 testi.
2. **Çift tik** → tek beğeni isteği, ikinci basış yutulmalı. → Task 3 testi (`busy`).
3. **Ölçüm alınamadığında** (`measureInWindow` geri çağırmazsa) kart yine açılmalı — ortada doğup büyüyerek. → Task 1 + Task 2 testleri.
4. **Overlay açıkken an listeden düşerse** (süresi doldu / `UT-7424` ile silindi) overlay kapanmalı; ölü bir kart ekranda kalmamalı. → Task 4 testi.
5. **Hedef dikdörtgen ekrandan taşmamalı** — küçük telefonda (SE) cam butonun sütunu kartı kırpmamalı. → Task 1 testi.

---

### Task 1: Ölçü hesabı — `campusExpandGeometry`

**Files:**
- Create: `src/features/campus/campusExpandGeometry.ts`
- Test: `tests/features/campus/campusExpandGeometry.test.ts`

**Interfaces:**
- Produces:
  - `export interface ExpandRect { x: number; y: number; width: number; height: number }`
  - `export interface ExpandGeometryArgs { screenW: number; screenH: number; topInset: number; bottomInset: number; start: ExpandRect | null; }`
  - `export function campusExpandGeometry(args: ExpandGeometryArgs): { start: ExpandRect; target: ExpandRect }`

- [ ] **Step 1: Write the failing tests**

```ts
const BASE = { screenW: 393, screenH: 852, topInset: 59, bottomInset: 34 };

it('hedef kutu 3:4 oranını koruyor', () => {
  const { target } = campusExpandGeometry({ ...BASE, start: null });
  expect(target.width / target.height).toBeCloseTo(3 / 4, 3);
});

it('hedef SAĞDA cam sütunu kadar yer bırakıyor — kart ekranın ortasında DEĞİL', () => {
  const { target } = campusExpandGeometry({ ...BASE, start: null });
  const leftGap = target.x;
  const rightGap = BASE.screenW - (target.x + target.width);
  expect(rightGap).toBeGreaterThan(leftGap);
  expect(rightGap).toBeGreaterThanOrEqual(BUTTON_COLUMN);
});

it('güvenli alanın içinde kalıyor — küçük telefonda da', () => {
  for (const screen of [{ screenW: 320, screenH: 568 }, BASE]) {
    const { target } = campusExpandGeometry({ ...BASE, ...screen, start: null });
    expect(target.x).toBeGreaterThanOrEqual(0);
    expect(target.y).toBeGreaterThanOrEqual(BASE.topInset);
    expect(target.y + target.height).toBeLessThanOrEqual(screen.screenH - BASE.bottomInset);
  }
});

it('ölçüm yoksa başlangıç = hedef (kart yerinde büyüyor, uçmuyor)', () => {
  const { start, target } = campusExpandGeometry({ ...BASE, start: null });
  expect(start).toEqual(target);
});

it('ölçüm varsa başlangıç verilen kare', () => {
  const measured = { x: 20, y: 600, width: 167, height: 222 };
  const { start } = campusExpandGeometry({ ...BASE, start: measured });
  expect(start).toEqual(measured);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/features/campus/campusExpandGeometry.test.ts`
Expected: FAIL — `campusExpandGeometry is not a function`

- [ ] **Step 3: Implement `campusExpandGeometry` ve `export const BUTTON_COLUMN = 96`**

Hedef: yükseklik `screenH - topInset - bottomInset` eksi dikey nefes payından, genişlik orandan türüyor; genişlik `screenW - BUTTON_COLUMN - yan pay`ı aşarsa ondan türeyip yükseklik orandan iniyor (iki kısıttan BAĞLAYICI olanı seçiliyor). Dikeyde güvenli alanın ortası, yatayda cam sütunu çıkarıldıktan sonra kalan alanın ortası. `start` null ise `target`in kopyası.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/features/campus/campusExpandGeometry.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add src/features/campus/campusExpandGeometry.ts tests/features/campus/campusExpandGeometry.test.ts
git commit -m "feat(campus): buyuyen kartin olcu hesabi — saf modul"
```

---

### Task 2: Kart dokunurken kendi karesini bildiriyor

**Files:**
- Modify: `src/features/campus/components/CampusMomentCard.tsx`
- Test: `tests/features/campus/components/CampusMomentCard.test.tsx`

**Interfaces:**
- Consumes: `ExpandRect` (Task 1)
- Produces: `onPress?: (moment: CampusMomentDto, frame: ExpandRect | null) => void`

- [ ] **Step 1: Write the failing test**

```tsx
it('karta basinca an VE olculen kare geliyor', () => {
  const { tree, onPress } = renderCard();
  fireEvent.press(tree.getByLabelText(/Ada/));
  expect(onPress).toHaveBeenCalledTimes(1);
  const [moment, frame] = onPress.mock.calls[0];
  expect(moment.id).toBe('1');
  // Jest ortaminda measureInWindow geri cagirmiyor → null, kart yine aciliyor.
  expect(frame === null || typeof frame.width === 'number').toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/features/campus/components/CampusMomentCard.test.tsx -t "olculen kare"`
Expected: FAIL — `onPress` tek argümanla çağrılıyor

- [ ] **Step 3: Kartın dış `View`ine ref ekle ve basışta ölç**

`onPress` artık doğrudan değil bir sarmalayıcıdan geçiyor: ref varsa `measureInWindow((x, y, width, height) => onPress(moment, { x, y, width, height }))`, ref ya da ölçüm yoksa `onPress(moment, null)`. ⚠️ Ölçüm asenkron ve geri çağırmayabilir — bir `setTimeout` güvencesi ile en geç bir sonraki tick'te `null`la çağır, iki kez çağırma.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/features/campus/components/CampusMomentCard.test.tsx`
Expected: PASS (tamamı)

- [ ] **Step 5: Commit**

```bash
git add src/features/campus/components/CampusMomentCard.tsx tests/features/campus/components/CampusMomentCard.test.tsx
git commit -m "feat(campus): kart basista kendi penceresini olcuyor"
```

---

### Task 3: Overlay — uçan kart, perde ve geç doğan cam tik

**Files:**
- Create: `src/features/campus/components/CampusMomentExpandOverlay.tsx`
- Test: `tests/features/campus/components/CampusMomentExpandOverlay.test.tsx`

**Interfaces:**
- Consumes: `campusExpandGeometry`, `ExpandRect` (Task 1)
- Produces:
  - `export const EXPAND_MS = 320` — hareketin süresi; cam kapısı bunu okuyor
  - props: `{ moment: CampusMomentDto | null; frame: ExpandRect | null; mode: AppMode; busy: boolean; onLike: () => void; onClose: () => void }`

- [ ] **Step 1: Write the failing tests**

```tsx
it('an yokken hicbir sey cizmiyor', () => {
  const { toJSON } = render(<CampusMomentExpandOverlay {...base} moment={null} />);
  expect(toJSON()).toBeNull();
});

it('CAM BUTON kart oturmadan YOK, oturunca VAR', () => {
  jest.useFakeTimers();
  const tree = render(<CampusMomentExpandOverlay {...base} />);
  expect(tree.queryByLabelText('Beğen')).toBeNull();
  act(() => { jest.advanceTimersByTime(EXPAND_MS); });
  expect(tree.getByLabelText('Beğen')).toBeTruthy();
});

it('tike basinca onLike, perdeye basinca onClose', () => {
  jest.useFakeTimers();
  const onLike = jest.fn(); const onClose = jest.fn();
  const tree = render(<CampusMomentExpandOverlay {...base} onLike={onLike} onClose={onClose} />);
  act(() => { jest.advanceTimersByTime(EXPAND_MS); });
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).toHaveBeenCalledTimes(1);
  fireEvent.press(tree.getByLabelText('Kapat'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('busy iken tik ikinci kez cagirmiyor', () => {
  jest.useFakeTimers();
  const onLike = jest.fn();
  const tree = render(<CampusMomentExpandOverlay {...base} busy onLike={onLike} />);
  act(() => { jest.advanceTimersByTime(EXPAND_MS); });
  fireEvent.press(tree.getByLabelText('Beğen'));
  expect(onLike).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/features/campus/components/CampusMomentExpandOverlay.test.tsx`
Expected: FAIL — modül yok

- [ ] **Step 3: Implement `CampusMomentExpandOverlay`**

Katmanlar, dıştan içe: tam ekran perde (`scrimAt`, basınca `onClose`, `accessibilityLabel` "Kapat") → `Animated.View` kart kopyası (`campusExpandGeometry`den gelen `start`tan `target`a `withTiming(EXPAND_MS)`; içinde `CampusMomentCard` yerine KARTIN GÖRSEL KOPYASI: fotoğraf + ad/yaş + saat) → **kardeş** olarak cam tik.

⚠️ Cam yalnız `settled` iken mount ediliyor; `settled` bir `setTimeout(EXPAND_MS)` ile açılıyor (gerekçe Global Constraints). Buton `CardActionGlassButton`: `variant="prominent"`, `name="checkmark"`, `tintColor={modeAccent(mode)}`, `label={t("campus.like")}`.

⚠️ **AŞAĞI ÇEKEREK KAPATMA da bu adımda** (tasarımda kabul edildi): karta bağlı dikey bir `Pan` jesti, eşiği geçince `onClose`. ⚠️ Jest kartın KENDİSİNDE, perdede değil — perde zaten dokununca kapanıyor ve iki yüzeye birden jest koymak çekişme yaratır.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/features/campus/components/CampusMomentExpandOverlay.test.tsx`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/features/campus/components/CampusMomentExpandOverlay.tsx tests/features/campus/components/CampusMomentExpandOverlay.test.tsx
git commit -m "feat(campus): buyuyen kart overlay'i — cam tik oturunca doguyor"
```

---

### Task 4: FeedScreen bağlantısı — profil yolu çıkıyor, overlay giriyor

**Files:**
- Modify: `src/features/feed/screens/FeedScreen.tsx` (`momentTarget` bloğu ~2011-2060, `LikerSwipeModal` bloğu ~2893)
- Modify: `src/features/campus/components/CampusMomentsStrip.tsx:378,395,542,553` (`onOpenProfile` → `onOpenCard`)
- Test: `tests/features/campus/components/CampusMomentsStrip.test.tsx` (yoksa oluştur)

**Interfaces:**
- Consumes: `CampusMomentExpandOverlay` (Task 3), kartın yeni `onPress` imzası (Task 2)
- Produces: şeridin prop'u `onOpenCard: (moment: CampusMomentDto, frame: ExpandRect | null) => void`

- [ ] **Step 1: Write the failing test**

```tsx
it('karta basinca onOpenCard an ve kareyle cagriliyor', () => {
  const onOpenCard = jest.fn();
  const tree = render(<CampusMomentsStrip {...base} moments={[moment()]} onOpenCard={onOpenCard} />);
  fireEvent.press(tree.getByLabelText(/Ada/));
  expect(onOpenCard).toHaveBeenCalledTimes(1);
  expect(onOpenCard.mock.calls[0][0].id).toBe('1');
});

it('KENDI anim dokunulamaz — onOpenCard cagrilmiyor', () => {
  const onOpenCard = jest.fn();
  const tree = render(<CampusMomentsStrip {...base} moments={[moment({ isMine: true })]} onOpenCard={onOpenCard} />);
  expect(tree.queryByLabelText(/Ada/)).toBeNull();
  expect(onOpenCard).not.toHaveBeenCalled();
});
```

```tsx
it('an listeden duserse overlay KAPANIYOR', () => {
  // FeedScreen'in effect'i: acik overlay'in ani `campus.moments` icinde yoksa kapanir.
  const { rerender, isOpen } = mountWithMoments([moment({ id: '1' })]);
  openCard('1');
  expect(isOpen()).toBe(true);
  rerender([]);                     // an suresi doldu / silindi
  expect(isOpen()).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/features/campus/components/CampusMomentsStrip.test.tsx`
Expected: FAIL — `onOpenCard` prop'u yok

- [ ] **Step 3: Şeridi ve FeedScreen'i bağla**

Şerit: `onOpenProfile` → `onOpenCard`, kart `onPress`i aynen devrediyor (`isMine` kapısı korunuyor).

FeedScreen: `momentTarget` artık `{ moment, frame }` tutuyor; `useCampusMomentProfile` çağrısı, `momentProfile.isError` toast effect'i, `handleMomentDecide` ve kampüs `LikerSwipeModal` bloğu **siliniyor** (gerekçe yorumu dosyada kalıyor: uç gelince geri gelecek). Yerine `CampusMomentExpandOverlay` — şeridin ve haritanın kardeşi olarak, `busy={campus.busyMomentId === momentTarget?.moment.id}`.

⚠️ **An listeden düşerse overlay kapanıyor:** `campus.moments` içinde `momentTarget.moment.id` yoksa `setMomentTarget(null)` (effect).

- [ ] **Step 4: Run checks**

Run: `npx jest tests/features/campus && npx tsc --noEmit -p .`
Expected: tamamı PASS, kampüs dosyalarında tip hatası yok

- [ ] **Step 5: Commit**

```bash
git add src/features/feed/screens/FeedScreen.tsx src/features/campus/components/CampusMomentsStrip.tsx tests/features/campus/components/CampusMomentsStrip.test.tsx
git commit -m "feat(campus): karta dokunus profil yerine buyuyen karti aciyor"
```

---

### Task 5: Tik → alev süpürmesi, örtü altında küçülme

**Files:**
- Modify: `src/features/feed/screens/FeedScreen.tsx` (Task 4'te eklenen tik işleyicisi)
- Test: `tests/features/campus/campusMomentLikeSweep.test.tsx`

**Interfaces:**
- Consumes: `runFlameSweep(onCovered, { hold: true })`, `releaseFlameSweep()` — `@/features/discover/flameSweep`
- Produces: `export function handleMomentLike(...)` gerekmiyor; davranış FeedScreen'in içinde, test `jest.mock('@/features/discover/flameSweep')` ile ölçülüyor

- [ ] **Step 1: Write the failing tests**

```tsx
it('tik: begeni gider, alev HOLD ile oynar, ortu kapaninca overlay kapanir ve dalga salinir', async () => {
  const { like, runFlameSweep, releaseFlameSweep, pressLike, covered } = setup();
  pressLike();
  expect(like).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  expect(runFlameSweep).toHaveBeenCalledWith(expect.any(Function), { hold: true });
  act(() => covered());              // ortu kapandi
  expect(releaseFlameSweep).toHaveBeenCalled();
});

it('KOTA BITMISKEN: paywall acilir, alev OYNAMAZ, overlay ACIK kalir', () => {
  const { like, runFlameSweep, pressLike, isOpen } = setup({ decisionsExhausted: true });
  pressLike();
  expect(like).toHaveBeenCalledTimes(1);   // paywall'i `like` aciyor
  expect(runFlameSweep).not.toHaveBeenCalled();
  expect(isOpen()).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/features/campus/campusMomentLikeSweep.test.tsx`
Expected: FAIL — alev hiç çağrılmıyor

- [ ] **Step 3: Tik işleyicisini yaz**

`campus.decisionsExhausted` ise yalnız `campus.like(moment)` (paywall onun içinde) ve çık — overlay açık kalıyor. Değilse: `campus.like(moment)` (beklenmiyor, paralel) + `runFlameSweep(onCovered, { hold: true })`; `onCovered` içinde overlay'i kapat (küçülme `start` karesine `withTiming`) ve `EXPAND_MS` sonra `releaseFlameSweep()`.

⚠️ `decisionsExhausted` `useCampusSurface`in dışa verdiği değerler arasında DEĞİL — bu adımda export edilecek (`src/features/campus/useCampusSurface.ts`, dönüş nesnesine tek satır).

- [ ] **Step 4: Run checks**

Run: `npx jest tests/features/campus && npx tsc --noEmit -p . && npx eslint src/features/campus src/features/feed/screens/FeedScreen.tsx`
Expected: testler PASS, tip ve lint hatası yok

- [ ] **Step 5: Commit**

```bash
git add src/features/feed/screens/FeedScreen.tsx src/features/campus/useCampusSurface.ts tests/features/campus/campusMomentLikeSweep.test.tsx
git commit -m "feat(campus): tik alev supurmesini oynatiyor, kart ortunun altinda kuculuyor"
```
