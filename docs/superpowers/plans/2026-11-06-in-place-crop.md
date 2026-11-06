# Önizlemede Yerinde Kırpma — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kamera ekranının donmuş-kare önizlemesinde kırp'a basınca ekran değişmeden, fotoğraf kıpırdamadan 3:4 çerçeve inip kırpma yapılabilsin; ✓ ile kaydedilen kare önizlemede pencereyi doldursun.

**Architecture:** `CropperOverlay`ın jest/kadraj mantığı ortak bir hook'a (`useCropGestures`), çerçeve çizimi ortak bir bileşene (`CropFrame`), görüntü kesme işi bir yardımcıya (`applyCrop`) çıkarılıyor; kırpıcı bunları kullanacak şekilde davranışı DEĞİŞMEDEN yeniden yazılıyor. `CameraCaptureOverlay` aynı parçalarla kendi kırpma kipini kazanıyor; kip geometrisi saf bir modülde (`cropStage.ts`) ve testli. Köprü kancası `crop(shot, rect)` oluyor; `photoPicker` kırpıcıyı açmak yerine `applyCrop` ile ara kare üretiyor.

**Tech Stack:** React Native / Expo, Reanimated, react-native-gesture-handler, expo-image, expo-image-manipulator, TypeScript, Jest (+ @testing-library/react-native).

**Spec:** `docs/superpowers/specs/2026-11-06-in-place-crop-design.md`

## Global Constraints

- Çıktı 3:4 — `OUTPUT_W=900`, `OUTPUT_H=1200`, `OUTPUT_QUALITY=0.85` (`cropGeometry.ts`). Kırpma çerçevesi 3:4.
- Ara kırpma dosyası YENİDEN ÖLÇEKLENMEZ ve `STEP_QUALITY = 0.95`, JPEG ile kaydedilir; nihai ölçekleme yalnız `fitPhotoForUpload`ta.
- `CropperOverlay`ın görünür/hissedilen davranışı DEĞİŞMEZ (kip dışı pinch-bakış, Kırp/Sıfırla/Kaydet, `adjusted`, ara dosya temizliği, mevcut sabitler: `MIN_SCALE=1`, `SPRING={damping:20,stiffness:180,mass:0.9}`, `MAX_SCALE_STEP=1.25`, `TAP_SLOP=24`).
- Ata zincirinde `opacity < 1` veya `transform` olan görünüm `MediaChromeIconButton`ın ATASI olamaz — dönüştürülen fotoğraf ve opaklığı animasyonlu `CropFrame` düğmelerin KARDEŞİ.
- Dosya sahipliği: overlay ✕ / yeniden çek'te ekrandaki kareyi siler; `photoPicker` `cancelled`da hiçbir şey silmez; kırpma kancası BİR ÖNCEKİ dosyayı yalnız kesim başarılıysa siler; commit kaynağı `fitPhotoForUpload` yeni dosyayı yazdıktan SONRA siler.
- Kampüs anları değişmez: `crop` kancası yok → kırp düğmesi yok, kırpma kipi yok.
- **Çalışma ağacında kullanıcının ilgisiz commit'lenmemiş değişiklikleri var** (discover/feed dosyaları vb.). `git add -A` / `git add .` YASAK; yalnız görevin dosyaları açık yolla stage'lenir. Commit mesajlarında Claude atfı YOK.
- Tek dosya testi: `npx jest <path>`. Tam takım: `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx jest` (node 20'de tam takım sessizce çöküyor). `npm run type-check` bugün 8 hata veriyor (MessagesScreen 1, LikesScreen 2, ProfileScreen 2, toaster.ts 1, swipeStatsPremium.test 2) — yeni hata EKLENMEZ.

## Review Focus

1. **Kaynak ölçüsü 0** (`CameraShot` izin veriyor): kırp'a basınca ölçü okunmadan kipe girilirse `s0` yanlış olur ve fotoğraf sıçrar. → Görev 4 (`resolveShotSize` testi).
2. **3:4 olmayan kaynak** (yatay 4:3 ya da 9:16 galeri fotoğrafı): kipe giriş görüntüsü önizlemeyle aynı olmalı, çerçeve her zaman dolu olmalı. → Görev 1 (değişmez testi üç oranla).
3. **Dokunmadan ✓**: çerçevede görünen orta bölüm kesilir, fotoğrafın tamamı DEĞİL; tamamı seçiliyse dosya üretilmez. → Görev 1 (`isWholeSource` + başlangıç dikdörtgeni testi).
4. **Kesim başarısız** (`applyCrop` fırlatır): kare aynı kalır, hiçbir dosya silinmez. → Görev 2 (yardımcı `release` + fırlatma) ve Görev 5 (kanca `null`, `forgetPhoto` yok).
5. **Kırpılmış kareyi tekrar kırpma**: önceki ara dosya silinir, son kare silinmez, commit onu ölçekler. → Görev 5.

---

### Task 1: Saf kırpma kipi geometrisi + chrome'un kırpma kipi

**Files:**
- Create: `src/shared/components/cropper/cropStage.ts`
- Modify: `src/shared/components/camera/cameraLayout.ts` (`cameraChrome`)
- Test: `tests/shared/components/cropper/cropStage.test.ts`, `tests/shared/components/camera/cameraLayout.test.ts`

**Interfaces:**
- Consumes: `coverScale`, `maxZoom`, `toSourceRect`, `SourceRect` (`cropGeometry.ts`).
- Produces:
  ```ts
  export type Rect = { left: number; top: number; width: number; height: number };
  /** Pencerenin içinde 3:4, genişlik min(winW, winH·3/4), iki eksende ortalı. */
  export function cropFrameInWindow(a: { winW: number; winH: number }): Rect;
  /** baseScale = max(winW/srcW, coverScale(src, frame)); startScale = max(1, coverScale(src, win)/baseScale); maxScale = max(startScale, maxZoom(baseScale, frameW, outW)). */
  export function cropStageScales(a: {
    srcW: number; srcH: number; winW: number; winH: number;
    frameW: number; frameH: number; outW: number;
  }): { baseScale: number; startScale: number; maxScale: number };
  /** Dikdörtgen kaynağın tamamı mı (originX/Y = 0, en/boy ≥ kaynak). */
  export function isWholeSource(rect: SourceRect, srcW: number, srcH: number): boolean;
  ```
  `cameraChrome` girdisine `cropping: boolean`, çıktısına `reset: boolean` ve `hint: boolean` eklenir.

- [ ] **Step 1: Write the failing tests**

`cropStage.test.ts`:
```ts
const win = { winW: 393, winH: 653 }; // iPhone 15 'fill' penceresi

it('çerçeve pencerenin içinde 3:4, ortalı', () => {
  expect(cropFrameInWindow(win)).toEqual({ left: 0, top: 64.5, width: 393, height: 524 });
  expect(cropFrameInWindow({ winW: 375, winH: 535 })).toEqual({ left: 0, top: 17.5, width: 375, height: 500 });
  expect(cropFrameInWindow({ winW: 393, winH: 400 })).toEqual({ left: 46.5, top: 0, width: 300, height: 400 });
});

// Review Focus 2 — kipe giriş görüntüsü önizlemenin (pencereye cover) aynısı.
it.each([[3000, 4000], [4000, 3000], [1080, 1920]])('başlangıç ölçeği önizlemeyle birebir (%i×%i)', (srcW, srcH) => {
  const f = cropFrameInWindow(win);
  const s = cropStageScales({ srcW, srcH, ...win, frameW: f.width, frameH: f.height, outW: 900 });
  expect(s.startScale).toBeGreaterThanOrEqual(1);
  expect(srcW * s.baseScale * s.startScale).toBeCloseTo(srcW * coverScale(srcW, srcH, 393, 653), 6);
  // ölçek 1'de bile çerçeve dolu
  expect(srcW * s.baseScale).toBeGreaterThanOrEqual(f.width - 1e-6);
  expect(srcH * s.baseScale).toBeGreaterThanOrEqual(f.height - 1e-6);
  expect(s.maxScale).toBeGreaterThanOrEqual(s.startScale);
});

it('3:4 kaynakta başlangıç ≈1.246', () => {
  const s = cropStageScales({ srcW: 3000, srcH: 4000, ...win, frameW: 393, frameH: 524, outW: 900 });
  expect(s.startScale).toBeCloseTo(653 / 524, 3);
});

// Review Focus 3 — dokunmadan ✓ = çerçevedeki orta bölüm.
it('başlangıç kadrajı ortadaki bölümü keser, tamamını değil', () => {
  const s = cropStageScales({ srcW: 3000, srcH: 4000, ...win, frameW: 393, frameH: 524, outW: 900 });
  const rect = toSourceRect({ srcW: 3000, srcH: 4000, winW: 393, winH: 524, baseScale: s.baseScale,
    scale: s.startScale, tx: 0, ty: 0, aspectW: 3, aspectH: 4 });
  expect(isWholeSource(rect, 3000, 4000)).toBe(false);
  expect(rect.width).toBeCloseTo(3000 / s.startScale, 0);
  expect(rect.originX).toBeCloseTo((3000 - rect.width) / 2, 0);
  const whole = toSourceRect({ srcW: 3000, srcH: 4000, winW: 393, winH: 524, baseScale: s.baseScale,
    scale: 1, tx: 0, ty: 0, aspectW: 3, aspectH: 4 });
  expect(isWholeSource(whole, 3000, 4000)).toBe(true);
});
```
`cameraLayout.test.ts`: mevcut dört `cameraChrome` testine `cropping: false` girdisi ve beklenen nesnelere `reset: false, hint: false` eklenir; yeni test:
```ts
it('kırpma kipinde yeniden-çek gider, sıfırla + ipucu gelir, kırp ve onay kalır', () => {
  expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: true, cropping: true }))
    .toEqual({ shutter: false, flash: false, flip: false, retake: false, reset: true, crop: true, confirm: true, hint: true });
  expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: true, cropping: true }).reset).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/shared/components/cropper/cropStage.test.ts tests/shared/components/camera/cameraLayout.test.ts`
Expected: FAIL — `cropStage` modülü yok; `cameraChrome` `reset`/`hint` dönmüyor.

- [ ] **Step 3: Implement `cropStage.ts` and extend `cameraChrome`**

Saf, RN import'u yok, Türkçe NEDEN yorumlarıyla. `cameraChrome`: `cropping` iken `retake: false`, `reset: true`, `hint: true`; `cropping` yalnız `frozen && allowCrop` iken anlamlı — dışında `reset`/`hint` false. Overlay henüz `cropping` geçmiyor: çağrıya `cropping: false` ekle (davranış değişmez).

- [ ] **Step 4: Run to verify pass** — aynı komut; PASS. Ardından `npm run type-check` (8, yeni yok).

- [ ] **Step 5: Commit**
```bash
git add src/shared/components/cropper/cropStage.ts src/shared/components/camera/cameraLayout.ts src/shared/components/camera/CameraCaptureOverlay.tsx tests/shared/components/cropper/cropStage.test.ts tests/shared/components/camera/cameraLayout.test.ts
git commit -m "feat(cropper): yerinde kırpma kipi geometrisi saf modülde"
```

---

### Task 2: `applyCrop` yardımcısı

**Files:**
- Create: `src/shared/components/cropper/applyCrop.ts`
- Test: `tests/shared/components/cropper/applyCrop.test.ts`

**Interfaces:**
- Consumes: `SourceRect` (`cropGeometry.ts`), `ImageManipulator`, `SaveFormat`.
- Produces:
  ```ts
  export const STEP_QUALITY = 0.95;
  /** Kaynaktan `rect`i keser, YENİDEN ÖLÇEKLEMEDEN STEP_QUALITY JPEG kaydeder.
   *  Ölçü SONUÇTAN okunur. Hata fırlatır; ImageRef/context her durumda release. */
  export function applyCrop(uri: string, rect: SourceRect): Promise<{ uri: string; width: number; height: number }>;
  ```

- [ ] **Step 1: Write the failing tests** (global `expo-image-manipulator` mock'unu `mockImplementationOnce` ile ez — `jest.setup.ts:274`)
```ts
it('dikdörtgeni keser, ölçeklemez, 0.95 JPEG kaydeder, ölçüyü sonuçtan okur', async () => {
  // context.crop / renderAsync / saveAsync / release spy'ları; saveAsync → { uri: 'file:///step.jpg', width: 2400, height: 3200 }
  const out = await applyCrop('file:///src.jpg', { originX: 10, originY: 20, width: 2400, height: 3200 });
  expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///src.jpg');
  expect(ctx.crop).toHaveBeenCalledWith({ originX: 10, originY: 20, width: 2400, height: 3200 });
  expect(ctx.resize).not.toHaveBeenCalled();
  expect(ref.saveAsync).toHaveBeenCalledWith({ compress: 0.95, format: 'jpeg' });
  expect(out).toEqual({ uri: 'file:///step.jpg', width: 2400, height: 3200 });
  expect(ref.release).toHaveBeenCalled();
  expect(ctx.release).toHaveBeenCalled();
});

// Review Focus 4
it('render patlarsa fırlatır ve context yine bırakılır', async () => {
  // renderAsync reddetsin
  await expect(applyCrop('file:///src.jpg', rect)).rejects.toThrow();
  expect(ctx.release).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure** — `npx jest tests/shared/components/cropper/applyCrop.test.ts` → FAIL (modül yok).
- [ ] **Step 3: Implement** — gövde bugünkü `CropperOverlay.handleApplyCrop`ın görüntü işleme kısmının (try/finally + release) birebir taşınmış hâli; o fonksiyonun ölçü-sonuçtan-okunur ve release gerekçe yorumları da taşınır. `CropperOverlay` bu görevde DEĞİŞMEZ.
- [ ] **Step 4: Run to verify pass** — PASS.
- [ ] **Step 5: Commit**
```bash
git add src/shared/components/cropper/applyCrop.ts tests/shared/components/cropper/applyCrop.test.ts
git commit -m "feat(cropper): kırpma uygulama yardımcısı ayrı modülde"
```

---

### Task 3: Ortak jest hook'u + `CropFrame`; `CropperOverlay` onları kullanıyor (davranış AYNI)

**Files:**
- Create: `src/shared/components/cropper/useCropGestures.ts`, `src/shared/components/cropper/CropFrame.tsx`
- Modify: `src/shared/components/cropper/CropperOverlay.tsx`
- Test: `tests/shared/components/cropper/useCropGestures.test.ts`

**Interfaces:**
- Consumes: `applyCrop`, `STEP_QUALITY` (Görev 2); `clamp`, `maxOffset` (`cropGeometry.ts`); `Rect` (Görev 1).
- Produces:
  ```ts
  export type CropTransform = { s: number; tx: number; ty: number };
  export function useCropGestures(o: {
    cropping: boolean;      // pan + çift dokunuş + KALICI kadraj
    peek: boolean;          // kip dışında pinch-bakış (kırpıcı true, kamera false)
    srcW: number; srcH: number;
    baseScale: number; maxScale: number;
    clampW: number; clampH: number;   // öteleme sınır kutusu (yatay, dikey)
    focusX: number; focusY: number;   // çerçeve merkezi, JEST KOORDİNAT uzayında
  }): {
    gesture: ComposedGesture;
    imageStyle: ReturnType<typeof useAnimatedStyle>;
    gridStyle: ReturnType<typeof useAnimatedStyle>;
    latest: React.MutableRefObject<CropTransform>;   // JS aynası (Fabric bayat okuma notu taşınır)
    resetTransform: (animated: boolean, to?: CropTransform) => void; // "ev"i de `to`ya (vars. 1/0/0) çeker
  };
  export function CropFrame(p: { visible: boolean; frame: Rect; area: { width: number; height: number };
    gridStyle: ReturnType<typeof useAnimatedStyle> }): JSX.Element; // pointerEvents none; opaklık 180ms
  ```
  `CornerTicks` `CropFrame.tsx`e taşınır.

- [ ] **Step 1: Write the failing hook test** (`renderHook` + `act`, gerçek Reanimated mock'u)
```ts
it('resetTransform hedefe çeker ve JS aynasını günceller', () => {
  const { result } = renderHook(() => useCropGestures({ cropping: true, peek: false, srcW: 3000, srcH: 4000,
    baseScale: 0.131, maxScale: 3, clampW: 393, clampH: 524, focusX: 196.5, focusY: 326.5 }));
  act(() => result.current.resetTransform(false, { s: 1.25, tx: 0, ty: 0 }));
  expect(result.current.latest.current).toEqual({ s: 1.25, tx: 0, ty: 0 });
  act(() => result.current.resetTransform(false));
  expect(result.current.latest.current).toEqual({ s: 1, tx: 0, ty: 0 });
});
```
- [ ] **Step 2: Run to verify failure** — `npx jest tests/shared/components/cropper/useCropGestures.test.ts` → FAIL (modül yok).
- [ ] **Step 3: Extract** — `CropperOverlay`daki paylaşılan değerler, `latest`/`commit`, `clampTranslate`, `settleBack`, pan/pinch/doubleTap, `imageStyle`, `gridStyle`, `edgeHaptic`, `resetTransform` hook'a; NEDEN yorumlarıyla birlikte, mantık DEĞİŞMEDEN. Tek kural farkı parametrelerden: pinch `.enabled(cropping || peek)`; `settleBack`ın kip-dışı dalı yalnız `peek` iken anlamlı. Karartma + ızgara + tırnaklar `CropFrame`e; `area` = karartmanın kapsadığı kutu (kırpıcıda ekran).
- [ ] **Step 4: Rewire `CropperOverlay`** — hook (`peek: true`, `focusX/Y = winCX/winCY`, `clampW = screenW`, `clampH = layout.winH`), `<CropFrame area={{width: screenW, height: screenH}} …/>`, `handleApplyCrop` → `applyCrop` (+ `STEP_QUALITY` sabiti oradan). `present()` sıfırlaması `resetTransform(false)` + kalan bayraklar. Dışa davranış, sabitler ve düğmeler AYNI.
- [ ] **Step 5: Verify** — `npx jest tests/shared/components/cropper tests/shared/utils/photoPicker.test.ts` PASS; `npm run type-check` (8); `npx eslint src/shared/components/cropper` 0 hata.
- [ ] **Step 6: Commit**
```bash
git add src/shared/components/cropper/useCropGestures.ts src/shared/components/cropper/CropFrame.tsx src/shared/components/cropper/CropperOverlay.tsx tests/shared/components/cropper/useCropGestures.test.ts
git commit -m "refactor(cropper): jestler ve çerçeve ortak parçalara çıktı, davranış aynı"
```

---

### Task 4: Kamera ekranında kırpma kipi + köprü sözleşmesi

**Files:**
- Create: `src/shared/components/camera/shotSize.ts`
- Modify: `src/shared/components/camera/cameraBridge.ts` (`crop`), `src/shared/components/camera/CameraCaptureOverlay.tsx`, `src/shared/i18n/translations/tr.ts`, `src/shared/i18n/translations/en.ts`
- Test: `tests/shared/components/camera/shotSize.test.ts`

**Interfaces:**
- Consumes: Görev 1 (`cropFrameInWindow`, `cropStageScales`, `isWholeSource`, `cameraChrome` `cropping`), Görev 3 (`useCropGestures` `peek:false`, `CropFrame`), `toSourceRect`, `SourceRect`.
- Produces:
  ```ts
  // cameraBridge.ts
  crop?: (shot: CameraShot, rect: SourceRect) => Promise<CameraShot | null>;
  // shotSize.ts
  /** >0 ise kendi ölçüsü; değilse Image.getSize; okunamazsa null. */
  export function resolveShotSize(shot: CameraShot): Promise<{ width: number; height: number } | null>;
  ```
  i18n: `common.cropper.hint` = `'İki parmakla büyüt · sürükle'` / `'Pinch to zoom · drag'`; `common.cropper.apply` = `'Kırpmayı kaydet'` / `'Save crop'`.
  ⚠️ `photoPicker`ın bugünkü tek-parametreli kancası yeni imzaya ATANABİLİR (TS fazla parametreyi kabul eder); bu görev sonunda ✓ hâlâ eski kırpıcıyı açar — Görev 5 düzeltiyor.

- [ ] **Step 1: Write the failing test** (Review Focus 1)
```ts
it('ölçü varsa okumaz', async () => {
  await expect(resolveShotSize({ uri: 'a', width: 3000, height: 4000 })).resolves.toEqual({ width: 3000, height: 4000 });
  expect(Image.getSize).not.toHaveBeenCalled();
});
it('ölçü 0 ise Image.getSize okur', async () => { /* getSize → 1200×1600 */ });
it('okunamazsa null', async () => { /* getSize hata callback'i */ });
```
- [ ] **Step 2: Run to verify failure** — `npx jest tests/shared/components/camera/shotSize.test.ts` → FAIL.
- [ ] **Step 3: Implement `resolveShotSize`, bridge signature, i18n keys** — köprünün `crop` yorumu yeni sözleşmeyi anlatır (overlay kendi kırpma kipini açar, ✓'de rect ile çağırır, kırpıcıyı kimse açmaz).
- [ ] **Step 4: Overlay — kırpma kipi.** Kararlar (spec "Kamera ekranında kırpma kipi"):
  - State: `cropping`, `cropSrc: {w,h} | null`. Geometri: `frame = cropFrameInWindow({winW, winH})` (pencere = `layout`), `scales = cropStageScales({...cropSrc, winW, winH, frameW, frameH, outW: OUTPUT_W})`.
  - Hook: `useCropGestures({ cropping, peek: false, srcW, srcH, baseScale, maxScale, clampW: winW, clampH: frame.height, focusX: winW/2, focusY: winH/2 })` — jest dedektörü PENCERENİN içinde, koordinatlar pencereye göre.
  - **Kırp** (`handleCrop`, kip kapalıyken): oturum-kimlik kapısı ve R9 deseni korunur; `busy` → `resolveShotSize(shot)` → null ise devLog + çık → `cropSrc` yaz, `setShowStill(true)`, `resetTransform(false, { s: startScale, tx: 0, ty: 0 })`, `setCropping(true)`. Kip açıkken kırp = ✕.
  - **✕** (kip açıkken): `setCropping(false)`; kare ve dosya değişmez; oturum KAPANMAZ.
  - **⟲**: `resetTransform(true, { s: startScale, tx: 0, ty: 0 })`.
  - **✓**: `rect = toSourceRect({ srcW, srcH, winW: frame.width, winH: frame.height, baseScale, scale/tx/ty: latest.current, aspectW: 3, aspectH: 4 })`; `isWholeSource` → kipi kapat, bitti. Değilse `busy` + `await crop(shot, rect)` (try/catch/finally, oturum-kimlik kapısı); kare dönerse `setShot(next)`, `setShowStill(true)`, `setCropping(false)`; `null`/hata → `setError(t('common.cropper.failed'))`, kipte KAL.
  - Çizim: kip açıkken penceredeki `cover` `Image` yerine `GestureDetector(gesture)` > kaynak oranında (`srcW·baseScale × srcH·baseScale`), pencere merkezine oturtulmuş, `imageStyle`lı `Animated.View` > `Image contentFit="fill"`. `CropFrame visible={cropping} frame={frame} area={{width: winW, height: winH}}` pencerenin içinde. Kip kapalıyken bugünkü çizim AYNEN.
  - Chrome: `cameraChrome({..., cropping})`; `chrome.reset` → `MediaChromeIconButton systemImage="arrow.counterclockwise" fallbackIcon={RotateCcw} label={t('common.cropper.reset')}` (yeniden çek'in yerinde); kırp düğmesi `active={cropping}`; onay düğmesi kipte `checkmark` / `Check`, `accessibilityLabel={t('common.cropper.apply')}`, `onPress={handleApplyCrop}`; `chrome.hint` → pencerenin alt bandında ortalı, `onMediaAt(0.7)`, 13pt metin `t('common.cropper.hint')`.
  - Opacity/transform yalnız fotoğrafta ve `CropFrame`te; düğmelerin atası değil.
- [ ] **Step 5: Verify** — `npx jest tests/shared/components/camera tests/shared/components/cropper tests/shared/utils/photoPicker.test.ts tests/features/campus` PASS; `npm run type-check` (8); `npx eslint src/shared/components/camera src/shared/i18n` 0 hata.
- [ ] **Step 6: Commit**
```bash
git add src/shared/components/camera/shotSize.ts src/shared/components/camera/cameraBridge.ts src/shared/components/camera/CameraCaptureOverlay.tsx src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts tests/shared/components/camera/shotSize.test.ts
git commit -m "feat(camera): önizlemede yerinde kırpma kipi"
```

---

### Task 5: `photoPicker` kancası `applyCrop` ile — kırpıcı önizleme yolunda açılmıyor

**Files:**
- Modify: `src/shared/utils/photoPicker.ts` (`createPreviewSession`, modül başı yorumu)
- Test: `tests/shared/utils/photoPicker.test.ts`

**Interfaces:**
- Consumes: `applyCrop` (Görev 2), yeni `crop(shot, rect)` (Görev 4), `fitPhotoForUpload`, `forgetPhoto`.
- Produces: `createPreviewSession(failedMessage)` → `{ crop, commit, result }`; `crop` artık `applyCrop(shot.uri, rect)`; "nihai dosya" haritası KALKAR; `commit` her kareyi `fitPhotoForUpload`dan geçirir.

- [ ] **Step 1: Rewrite the hook tests** — `describe('önizleme kırpma kancası')` içindeki dört eski test (`OUTPUT ölçüleriyle döner`, `native boyut 0 ise ölçüyü kendisi okur`, `kırpma iptal edilirse null`, `kırpılmış kare onaylanırsa fitPhotoForUpload ÇALIŞMAZ`) kaldırılır (ölçüm artık overlay'de — Görev 4). `jest.mock('@/shared/components/cropper/applyCrop', () => ({ applyCrop: jest.fn() }))`, `const mockApply = applyCrop as jest.MockedFunction<typeof applyCrop>`, `const RECT = { originX: 300, originY: 400, width: 2400, height: 3200 }`; mevcut `withHooks` yardımcısı `req.crop!(shot, RECT)` çağıracak şekilde kullanılır. Yeni testler:
```ts
it('seçilen dikdörtgeni keser, önceki dosyayı unutur, yeni kareyi döner', async () => {
  mockApply.mockResolvedValue({ uri: 'file:///crop1.jpg', width: 2400, height: 3200 });
  await withHooks(async (req) => {
    await expect(req.crop!(shot('file:///raw.jpg'), RECT)).resolves.toEqual({ uri: 'file:///crop1.jpg', width: 2400, height: 3200 });
  });
  expect(mockApply).toHaveBeenCalledWith('file:///raw.jpg', RECT);
  expect(mockForget).toHaveBeenCalledWith('file:///raw.jpg');
  expect(mockPresent).not.toHaveBeenCalled();
});
// Review Focus 4
it('kesim patlarsa null döner ve hiçbir dosya unutulmaz', async () => { /* mockApply reject → null; mockForget hiç */ });
// Review Focus 5
it('üst üste iki kırpmada önceki ara dosya unutulur, sonuncusu kalır', async () => {
  /* raw → crop1 → crop2; forget: raw, crop1; not crop2; toHaveBeenCalledTimes(2) */
});
it('kırpılmış kare onaylanınca fitPhotoForUpload\'dan geçer ve ara kare sonra unutulur', async () => {
  /* commit(crop1) → ImageManipulator.manipulate('file:///crop1.jpg') çağrıldı; sonuç photo_*.jpg; forget crop1 */
});
```
- [ ] **Step 2: Run to verify failure** — `npx jest tests/shared/utils/photoPicker.test.ts` → yeni testler FAIL (kanca hâlâ kırpıcıyı açıyor).
- [ ] **Step 3: Implement** — `crop`: `try { next = await applyCrop(shot.uri, rect) } catch → devLog + return null`; başarıda `forgetPhoto(shot.uri)` ve `{ uri, width, height }`. Harita ve `OUTPUT_W/H` dönüşü kalkar; `commit` = `fitPhotoForUpload` → başarısızsa `failedMessage`, başarılıysa kaynağı unut + topla. Modül başı "İKİ ÖNİZLEME YOLU" yorumu kırpmanın artık overlay'de yapıldığını söyler. Yedek yollar (`captureWithSystemCamera`, `cropSequentially`, `captureAndCropPhoto`, `recropExistingPhoto`) DEĞİŞMEZ.
- [ ] **Step 4: Verify** — `npx jest tests/shared/utils/photoPicker.test.ts` PASS; tam takım (node 24) PASS; `npm run type-check` (8).
- [ ] **Step 5: Commit**
```bash
git add src/shared/utils/photoPicker.ts tests/shared/utils/photoPicker.test.ts
git commit -m "feat(photo): önizleme kırpması overlay'de, kanca yalnız keser"
```

---

### Task 6: Cihaz doğrulaması (kullanıcı)

Simülatörde kamera yok; ajanlar cihaza dokunamıyor. Kontrol yürütücü tam takımı node 24'te koşturur, aşağıdaki liste kullanıcıya verilir (spec "Doğrulama > Cihazda" 1–8): kipe girişte sıçrama yok; uzaklaş/sürükle/kenar titreşimi; ✓ sonrası pencereyi dolduran kırpılmış kare ve doğru küçük resim; ✕ ve ⟲; galeri (kayıt + profil); tekrar kırpma; **regresyon**: profil "Düzenle" ve Keşif mod kurulumu eski kırpıcıda birebir eskisi gibi (kip dışı pinch-bakış dahil); kampüs değişmedi.
