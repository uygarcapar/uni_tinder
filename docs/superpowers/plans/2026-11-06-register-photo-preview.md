# Kayıtta Fotoğraf Önizlemesi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kayıt akışının fotoğraf adımında galeri ve kamera yollarının ikisi de,
kampüs anlarındaki çekim-sonrası önizleme ekranının aynısına çıksın; o ekranda
kırpma butonu olsun, sol alttaki açıklama yazısı olmasın.

**Architecture:** `CameraCaptureOverlay` genişletiliyor — ayrı bir önizleme
ekranı AÇILMIYOR. Overlay üç yeni ayar alıyor: pencere şekli (`frame`), hazır
bir kareyle kamerasız giriş (`source`, galeri yolu) ve bir kırpma kancası
(`crop`). Pencere geometrisi ile hangi chrome'un çizileceği saf bir modüle
(`cameraLayout.ts`) çıkarılıyor ve orada test ediliyor; overlay'in kendisi
dallanmayı o modülden okuyor. Kırpıcıyı overlay değil `photoPicker` açıyor.

**Tech Stack:** React Native / Expo (expo-camera, expo-image,
expo-image-picker, expo-image-manipulator), TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-register-photo-preview-design.md`

## Global Constraints

- **Yüklenen kare her zaman 3:4** — `OUTPUT_W=900`, `OUTPUT_H=1200`,
  `OUTPUT_QUALITY=0.85` (`src/shared/components/cropper/cropGeometry.ts`).
- **`CameraView`in `pictureSize="Photo"` / `ratio="4:3"` propları DEĞİŞMEZ.**
- **`launchImageLibraryAsync` seçenekleri DEĞİŞMEZ** — özellikle
  `allowsEditing: false` (PHPicker'ı seçen bayrak), `orderedSelection: true`,
  `shouldDownloadFromNetwork: true` ve `quality`nin HİÇ geçilmemesi.
- **Kampüs anları yolu davranış olarak değişmez:** `frame` verilmeyen oturum
  bugünkü tam-kanama penceresini alır, `crop` verilmeyen oturumda kırpma butonu
  çizilmez, `commitHint` duruyor.
- **Gizleme/animasyon `opacity` ya da `transform` ile YAPILMAZ** — ata
  zincirindeki ikisi de `GlassView` efektini sessizce düşürüyor; ekranın
  kayması `top` ile yapılıyor.
- **Commit mesajlarında Claude atfı YOK** (ne `Co-Authored-By` ne gövdede anma).
- Test komutu dosya hedefli çalıştırılır: `npx jest <path>`.

## Review Focus

Spec'in ima ettiği ama hiçbir görevin doğal akışında sınanmayan girdiler. Her
biri, sahibi olan görevin adımlarına test olarak eklendi.

1. **Galeri fotoğrafı 3:4 değil** (yatay ya da 9:16). 3:4 pencerede `cover` ile
   ortadan kesiliyor; o kesimin `fitPhotoForUpload`ın `centerCropRect`iyle aynı
   olması gerekiyor, yoksa önizleme yalan söyler. → Görev 1.
2. **Native boyut `0` geliyor** (`asset.width === 0`). Kırpma kancası ölçüyü
   kendisi okumazsa kırpıcı 0×0 geometriyle açılır. → Görev 4.
3. **Üst üste iki kırpma.** İkinci tur bir öncekinin çıktısını diskte bırakırsa
   her kırpma bir dosya sızdırır. → Görev 4.
4. **Galeri sırasının ORTASINDA overlay sökülüyor** (`unavailable`). Döngü
   askıda kalmamalı, kalan fotoğraflar bugünkü kırpıcı yoluna düşmeli. → Görev 4.
5. **Kırptıktan sonra ✕.** Atılan dosya kırpılmış olandır; ham kaynak kırpma
   anında zaten unutulmuştur, iki kez unutulmamalı. → Görev 4.

---

### Task 1: Saf pencere ve chrome geometrisi

**Files:**
- Create: `src/shared/components/camera/cameraLayout.ts`
- Test: `tests/shared/components/camera/cameraLayout.test.ts`

**Interfaces:**
- Consumes: `frameWindow` (`src/shared/components/cropper/cropGeometry.ts`),
  `centerCropRect` (aynı dosya — yalnız testte).
- Produces:
  ```ts
  export type PreviewFrame = 'fill' | 'photo';

  export function previewWindow(a: {
    frame: PreviewFrame;
    screenW: number; screenH: number;
    insetTop: number; headerH: number; footerH: number;
  }): { left: number; top: number; winW: number; winH: number };

  export function cameraChrome(a: {
    previewOnly: boolean; frozen: boolean; allowCrop: boolean;
  }): {
    shutter: boolean; flash: boolean; flip: boolean;
    retake: boolean; crop: boolean; confirm: boolean;
  };
  ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('previewWindow', () => {
  const phone = { screenW: 393, screenH: 852, insetTop: 59, headerH: 123, footerH: 140 };

  it("'fill' bugünkü yerleşimi birebir korur", () => {
    expect(previewWindow({ ...phone, frame: 'fill' }))
      .toEqual({ left: 0, top: 59, winW: 393, winH: 653 });
  });

  it("'photo' 3:4 ve ekranın tam ortasında", () => {
    const w = previewWindow({ ...phone, frame: 'photo' });
    expect(w.winW).toBe(393);
    expect(w.winH).toBeCloseTo(524, 0);
    // Merkez EKRANIN merkezi — kırpıcıyla aynı (CropperOverlay > winCY).
    expect(w.top + w.winH / 2).toBeCloseTo(852 / 2, 0);
    expect(w.left + w.winW / 2).toBeCloseTo(393 / 2, 0);
  });

  it("'photo' penceresi kırpıcının penceresiyle ÇAKIŞIYOR (tipik telefon)", () => {
    const preview = previewWindow({ ...phone, frame: 'photo' });
    const cropper = frameWindow({
      screenW: 393, screenH: 852,
      headerH: 59 + 56, footerH: 34 + 32 + 52,
      aspectW: 3, aspectH: 4,
    });
    expect(preview.winW).toBeCloseTo(cropper.winW, 0);
    expect(preview.winH).toBeCloseTo(cropper.winH, 0);
  });

  it("'photo' penceresi deklanşör şeridine TAŞMIYOR (küçük cihaz)", () => {
    // headerH = insetTop + CHROME_GAP + GLASS_ICON_CLEAR_SIZE = 20 + 16 + 48
    // footerH = 2 * max(insetBottom, 20) + SHUTTER = 40 + 72
    const se = { screenW: 375, screenH: 667, insetTop: 20, headerH: 84, footerH: 112 };
    const w = previewWindow({ ...se, frame: 'photo' });
    expect(w.top + w.winH).toBeLessThanOrEqual(667 - 112);
    expect(w.top).toBeGreaterThanOrEqual(88);
  });

  // Review Focus 1: 3:4 pencerede `cover`, fitPhotoForUpload'ın kesimiyle AYNI.
  it("3:4 olmayan kaynakta görünen kesim centerCropRect ile aynı", () => {
    const w = previewWindow({ ...phone, frame: 'photo' });
    const rect = centerCropRect({ srcW: 4000, srcH: 3000, aspectW: 3, aspectH: 4 });
    // cover: kaynağın pencereyi dolduran ölçeği; görünen kaynak bölgesinin
    // en/boy oranı kesme dikdörtgeninin oranına eşit olmalı.
    expect(rect.width / rect.height).toBeCloseTo(w.winW / w.winH, 3);
  });
});

describe('cameraChrome', () => {
  it('galeri yolunda deklanşör/flaş/çevir/yeniden-çek YOK', () => {
    expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: true }))
      .toEqual({ shutter: false, flash: false, flip: false, retake: false, crop: true, confirm: true });
  });

  it('canlı akışta deklanşör ve flaş var, onay yok', () => {
    expect(cameraChrome({ previewOnly: false, frozen: false, allowCrop: true }))
      .toEqual({ shutter: true, flash: true, flip: true, retake: false, crop: false, confirm: false });
  });

  it('kare donunca yeniden-çek ve onay gelir, deklanşör gider', () => {
    expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: true }))
      .toEqual({ shutter: false, flash: false, flip: false, retake: true, crop: true, confirm: true });
  });

  it('kırpma kancası yoksa kırpma butonu HİÇ çizilmez (kampüs)', () => {
    expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: false }).crop).toBe(false);
    expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: false }).crop).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/shared/components/camera/cameraLayout.test.ts`
Expected: FAIL — `cameraLayout` modülü yok.

- [ ] **Step 3: Implement `previewWindow` and `cameraChrome` in `src/shared/components/camera/cameraLayout.ts`**

`'fill'` dalı bugünkü `CameraCaptureOverlay > layout` hesabını birebir taşır
(`top = insetTop`, `winH = Math.max(160, screenH - insetTop - footerH)`,
tam genişlik, `left = 0`). `'photo'` dalı `frameWindow`u 3:4 ile çağırır ve
sonucu ekran merkezine oturtur. `headerH`/`footerH` girdileri KAMERA ekranının
kendi ölçüleri — gerekçe spec'teki "Pencere" kararında.

Her iki fonksiyon da saf; `useWindowDimensions`/`insets` okumaz.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/shared/components/camera/cameraLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/components/camera/cameraLayout.ts tests/shared/components/camera/cameraLayout.test.ts
git commit -m "feat(camera): önizleme penceresi ve chrome kararı saf modüle çıktı"
```

---

### Task 2: Köprü sözleşmesi

**Files:**
- Modify: `src/shared/components/camera/cameraBridge.ts` (`CameraRequest`, satır 32-73)

**Interfaces:**
- Consumes: `PreviewFrame` (Görev 1).
- Produces: `CameraRequest`a üç alan:
  ```ts
  /** Pencere şekli. Verilmezse 'fill' — kampüsün bugünkü tam kanama penceresi. */
  frame?: PreviewFrame;
  /** Dolu ise KAMERA HİÇ AÇILMAZ: ekran doğrudan bu kareyle donmuş başlar. */
  source?: CameraShot;
  /** Verilirse sağ üstte kırpma butonu çıkar. Dönen kare ekrandakinin YERİNE
   *  geçer; `null` = vazgeçildi, kare aynı kalır. */
  crop?: (shot: CameraShot) => Promise<CameraShot | null>;
  ```
  `CameraOutcome` DEĞİŞMİYOR.

- [ ] **Step 1: Add the three fields to `CameraRequest`**

Her birinin üstüne, dosyanın mevcut üslubunda, NEDEN var olduğunu yazan bir yorum
koy: `frame` için "kayıtta önizleme yüklenen karenin birebir aynısı olmalı",
`source` için "galeri fotoğrafı da kamera karesiyle AYNI ekranda onaylanıyor",
`crop` için "kırpıcıyı overlay DEĞİL çağıran açıyor — `PickedPhoto`, dosya
sahipliği ve `presentCropper` photoPicker'ın işi".

- [ ] **Step 2: Verify types compile**

Run: `npm run type-check`
Expected: hata yok.

- [ ] **Step 3: Verify the existing bridge tests still pass**

Run: `npx jest tests/shared/components/camera/cameraBridge.test.ts`
Expected: PASS (davranış değişmedi, yalnız tip eklendi).

- [ ] **Step 4: Commit**

```bash
git add src/shared/components/camera/cameraBridge.ts
git commit -m "feat(camera): köprüye frame/source/crop ayarları eklendi"
```

---

### Task 3: Overlay — kamerasız mod, 3:4 pencere, kırpma butonu

**Files:**
- Modify: `src/shared/components/camera/CameraCaptureOverlay.tsx`

**Interfaces:**
- Consumes: `previewWindow`, `cameraChrome` (Görev 1); `frame`, `source`, `crop`
  (Görev 2); `presentCropper` KULLANILMAZ.
- Produces: davranış; dışa açık bir API değişikliği yok.

- [ ] **Step 1: Yerleşimi `previewWindow`a devret**

`layout` memo'su `headerH` ve `footerGap`/`footerH`yi bugünkü gibi hesaplamaya
devam eder, pencereyi ise `previewWindow({ frame: session?.request.frame ?? 'fill', ... })`
ile alır ve `left`/`top`/`winW`/`winH`yi ondan döner. Pencereyi çizen `View`
(satır ~931) artık `layout.left`/`layout.top`u olduğu gibi kullanıyor, yani
değişmiyor.

- [ ] **Step 2: `previewOnly` modunu ekle**

`const previewOnly = !!session?.request.source;` türet ve şunları kapat:
- `present()`: `setShot(request.source ?? null)` ve
  `setShowStill(!!request.source || Platform.OS !== 'ios')`.
- `CameraView` yalnız `!previewOnly` iken render edilir.
- 3.5sn `unavailable` zaman aşımı effect'i `previewOnly` iken kurulmaz
  (kamera hiç açılmayacak, oturumu kapatırdı).
- `pickDefaultLens` effect'i, `handleCapture`, `handleFlip`, `pausePreview`/
  `resumePreview` çağrıları `previewOnly` iken çalışmaz.
- `flipTap` jesti `previewOnly` iken `.enabled(false)`.

⚠️ `frozen` ZATEN doğru oluyor: `source` ile `shot` dolu başlıyor.

- [ ] **Step 3: Chrome dallanmasını `cameraChrome`a devret**

`const chrome = cameraChrome({ previewOnly, frozen, allowCrop: !!session?.request.crop })`.
Deklanşör satırı `chrome.shutter`, flaş katmanı `chrome.flash`, çevirme düğmesi
`chrome.flip`, yeniden-çek `chrome.retake`, onay satırı `chrome.confirm` ile
koşullanır. Bugünkü `frozen ? … : …` ikilisi bu bayraklara çevrilir.

- [ ] **Step 4: Kırpma butonunu ekle**

Başlığın sağ grubuna, "yeniden çek"in **soluna**: `MediaChromeIconButton`,
`systemImage="crop"`, `fallbackIcon={Crop}` (`@/shared/icons`),
`label={t('common.cropper.crop')}`, `disabled={busy}`, `chrome.crop` ile koşullu.

`handleCrop`:
```ts
const handleCrop = useCallback(async () => {
  const crop = sessionRef.current?.request.crop;
  if (!crop || !shot || busy) return;
  setBusy(true);
  setError(null);
  const next = await crop(shot);
  if (!sessionRef.current) return;   // kırpma sürerken ekran kapandı
  setBusy(false);
  if (next) {
    setShot(next);
    setShowStill(true);
  }
}, [busy, shot]);
```
⚠️ `busy` bilerek: kırpıcı açıkken bu ekranın düğmeleri ölü olmalı. Yan etkisi
onay okunun kırpıcının ARKASINDA göstergeye dönmesi — görünmüyor, kabul.
⚠️ `setShowStill(true)`: kırpılmış dosya artık pencerede ÇİZİLMEK zorunda,
`showStill`in iOS'taki varsayılan `false`u yalnız canlı akıştan donan kare için
geçerli.
⚠️ Ham dosyanın silinmesi kancanın işi (Görev 4) — burada `forgetPhoto` ÇAĞIRMA.

- [ ] **Step 5: Verify types and lint**

Run: `npm run type-check && npx eslint src/shared/components/camera`
Expected: hata yok.

- [ ] **Step 6: Verify nothing else regressed**

Run: `npx jest tests/shared/components/camera tests/shared/components/cropper tests/features/campus`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/shared/components/camera/CameraCaptureOverlay.tsx
git commit -m "feat(camera): kamerasız önizleme modu, 3:4 pencere ve kırpma butonu"
```

---

### Task 4: `photoPicker` — iki yeni akış

**Files:**
- Modify: `src/shared/utils/photoPicker.ts`
- Test: `tests/shared/utils/photoPicker.test.ts`

**Interfaces:**
- Consumes: `presentCameraCapture` + yeni `frame`/`source`/`crop` (Görev 2);
  mevcut `presentCropper`, `fitPhotoForUpload`, `measure`, `forgetPhoto`,
  `cropSequentially`, `captureAndCropPhoto`, `OUTPUT_W`/`OUTPUT_H`.
- Produces:
  ```ts
  export const captureAndPreviewPhoto: (options: {
    facing?: 'front' | 'back';
    /** Ölçekleme patlarsa satır içinde gösterilecek metin (çağıran `t`si). */
    failedMessage: string;
    /** Onay okunun erişilebilir adı. */
    commitLabel?: string;
  }) => Promise<PickedPhoto | null>;

  export const pickAndPreviewPhotos: (
    maxFiles: number,
    options: { failedMessage: string; commitLabel?: string },
  ) => Promise<PickedPhoto[]>;
  ```
  Mevcut `pickAndCropPhotos` / `captureAndCropPhoto` / `recropExistingPhoto`
  DEĞİŞMEDEN kalır (profil akışları ve yedek yollar kullanıyor).

- [ ] **Step 1: Write the failing tests**

`tests/shared/utils/photoPicker.test.ts` içine, mevcut mock kurulumunu
kullanarak. Önce ortak yardımcı — oturumun `crop`/`commit` kancalarını testin
eline veren tek şey bu, aşağıdaki testlerin hepsi onu kullanıyor:

```ts
/** Overlay'i taklit eder: isteği yakalar, `run` ile kancaları çalıştırır. */
const runSession = (
  run: (req: CameraRequest) => Promise<CameraOutcome>,
) => mockShoot.mockImplementation((req) => run(req));

const shot = (uri: string, width = 3000, height = 4000) => ({ uri, width, height });
```

```ts
describe('captureAndPreviewPhoto', () => {
  it('3:4 pencere, kırpma kancası ve commit ile açar; kırpıcı KENDİLİĞİNDEN açılmaz', async () => {
    mockShoot.mockResolvedValue({ status: 'committed' });
    await captureAndPreviewPhoto({ facing: 'front', failedMessage: 'x' });
    const req = mockShoot.mock.calls[0][0];
    expect(req.frame).toBe('photo');
    expect(req.facing).toBe('front');
    expect(typeof req.crop).toBe('function');
    expect(typeof req.commit).toBe('function');
    expect(req.commitHint).toBeUndefined();   // sol alt YAZISIZ
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('onaylanan ham kare fitPhotoForUpload ile 3:4 çıktıya çevrilir', async () => {
    runSession(async (req) => {
      await expect(req.commit!(shot('file:///raw.jpg'))).resolves.toBeNull();
      return { status: 'committed' };
    });
    const photo = await captureAndPreviewPhoto({ failedMessage: 'x' });
    expect(photo).toEqual({
      uri: expect.stringContaining('photo_'),
      mime: 'image/jpeg',
      fileName: expect.stringContaining('.jpg'),
    });
    // Ham kare, YENİ dosya yazıldıktan SONRA unutulur.
    expect(mockForget).toHaveBeenCalledWith('file:///raw.jpg');
  });

  it('ölçekleme patlarsa satır içi metin döner, ekran kapanmaz', async () => {
    // ImageManipulator mock'u renderAsync'te reddetsin.
    runSession(async (req) => {
      await expect(req.commit!(shot('file:///raw.jpg'))).resolves.toBe('ölçeklenemedi');
      return { status: 'cancelled' };
    });
    await expect(
      captureAndPreviewPhoto({ failedMessage: 'ölçeklenemedi' }),
    ).resolves.toBeNull();
  });

  it('overlay yoksa eski kırpıcı yoluna düşer', async () => {
    mockShoot.mockResolvedValue({ status: 'unavailable' });
    mockCamera.mockResolvedValue({ canceled: true, assets: null });
    await expect(captureAndPreviewPhoto({ failedMessage: 'x' })).resolves.toBeNull();
    expect(mockCamera).toHaveBeenCalled();
  });

  it('iptal → null, hiçbir dosya üretilmez', async () => {
    mockShoot.mockResolvedValue({ status: 'cancelled' });
    await expect(captureAndPreviewPhoto({ failedMessage: 'x' })).resolves.toBeNull();
  });
});

describe('pickAndPreviewPhotos', () => {
  it('galeri seçeneklerini DEĞİŞTİRMEDEN geçer', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });
    await pickAndPreviewPhotos(4, { failedMessage: 'x' });
    const options = mockLibrary.mock.calls[0][0];
    expect(options.allowsEditing).toBe(false);
    expect(options.allowsMultipleSelection).toBe(true);
    expect(options.selectionLimit).toBe(4);
    expect(options.orderedSelection).toBe(true);
    expect(options.shouldDownloadFromNetwork).toBe(true);
    expect(options.quality).toBeUndefined();
  });

  it('her fotoğrafı SIRAYLA önizler, ✕lenen atlanır', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    runSession(async (req) => {
      if (req.source!.uri === 'file:///b.jpg') return { status: 'cancelled' };
      await req.commit!(req.source!);
      return { status: 'committed' };
    });

    const photos = await pickAndPreviewPhotos(6, { failedMessage: 'x' });

    expect(photos).toHaveLength(2);
    expect(mockShoot).toHaveBeenCalledTimes(3);
    expect(mockShoot.mock.calls.map((c) => c[0].source.uri)).toEqual([
      'file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg',
    ]);
    // Her oturum 3:4 pencere ve kırpma kancasıyla açılıyor, sol alt yazısız.
    expect(mockShoot.mock.calls[0][0].frame).toBe('photo');
    expect(mockShoot.mock.calls[0][0].commitHint).toBeUndefined();
  });

  // Review Focus 4
  it('sıranın ortasında overlay sökülürse kalanlar kırpıcı yoluna düşer', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    runSession(async (req) => {
      if (req.source!.uri === 'file:///a.jpg') {
        await req.commit!(req.source!);
        return { status: 'committed' };
      }
      return { status: 'unavailable' };
    });
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));

    const photos = await pickAndPreviewPhotos(6, { failedMessage: 'x' });

    expect(photos).toHaveLength(3);
    // Kalan İKİSİ kırpıcıdan geçti — önizleme bir kez daha denenmedi.
    expect(mockPresent).toHaveBeenCalledTimes(2);
    expect(mockShoot).toHaveBeenCalledTimes(2);
  });
});

describe('önizleme kırpma kancası', () => {
  // Kancayı eline almanın yolu: bir oturum açıp `req.crop`u çağırmak.
  const withHooks = async (
    run: (req: CameraRequest) => Promise<void>,
  ): Promise<void> => {
    runSession(async (req) => { await run(req); return { status: 'cancelled' }; });
    await captureAndPreviewPhoto({ failedMessage: 'x' });
  };

  it('kırpılan kareyi OUTPUT ölçüleriyle döner', async () => {
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    await withHooks(async (req) => {
      await expect(req.crop!(shot('file:///raw.jpg'))).resolves.toEqual({
        uri: 'file:///cropped.jpg', width: 900, height: 1200,
      });
    });
  });

  // Review Focus 2
  it('native boyut 0 ise ölçüyü kendisi okur', async () => {
    (Image.getSize as jest.Mock).mockImplementation((_uri, ok) => ok(1200, 1600));
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    await withHooks(async (req) => {
      await req.crop!(shot('file:///raw.jpg', 0, 0));
    });
    expect(mockPresent).toHaveBeenCalledWith(
      expect.objectContaining({ srcWidth: 1200, srcHeight: 1600 }),
    );
  });

  it('kırpma iptal edilirse null döner ve HİÇBİR dosya unutulmaz', async () => {
    mockPresent.mockResolvedValue({ status: 'skipped' });
    await withHooks(async (req) => {
      await expect(req.crop!(shot('file:///raw.jpg'))).resolves.toBeNull();
    });
    expect(mockForget).not.toHaveBeenCalled();
  });

  // Review Focus 3
  it('üst üste iki kırpmada bir öncekinin dosyası unutulur', async () => {
    mockPresent
      .mockResolvedValueOnce(done('file:///crop1.jpg'))
      .mockResolvedValueOnce(done('file:///crop2.jpg'));
    await withHooks(async (req) => {
      const first = await req.crop!(shot('file:///raw.jpg'));
      await req.crop!(first!);
    });
    expect(mockForget).toHaveBeenCalledWith('file:///raw.jpg');
    expect(mockForget).toHaveBeenCalledWith('file:///crop1.jpg');
    expect(mockForget).not.toHaveBeenCalledWith('file:///crop2.jpg');
  });

  // Review Focus 5
  it('kırpılmış kare onaylanırsa fitPhotoForUpload ÇALIŞMAZ', async () => {
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    runSession(async (req) => {
      const cropped = await req.crop!(shot('file:///raw.jpg'));
      await expect(req.commit!(cropped!)).resolves.toBeNull();
      return { status: 'committed' };
    });
    const photo = await captureAndPreviewPhoto({ failedMessage: 'x' });
    // Kırpıcının çıktısı OLDUĞU GİBİ dönüyor — yeni bir photo_*.jpg yazılmadı.
    expect(photo).toEqual({
      uri: 'file:///cropped.jpg', mime: 'image/jpeg', fileName: 'photo.jpg',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/shared/utils/photoPicker.test.ts`
Expected: FAIL — `captureAndPreviewPhoto` / `pickAndPreviewPhotos` yok.

- [ ] **Step 3: Extract `openLibrary(limit)` from `pickAndCropPhotos`**

`launchImageLibraryAsync` çağrısını, bütün seçenekleri ve yorumlarıyla birlikte
modül içi bir yardımcıya taşı; `pickAndCropPhotos` ve `pickAndPreviewPhotos`
ikisi de onu çağırsın. Seçenekler TEK yerde kalmalı (Global Constraints).

- [ ] **Step 4: Implement the shared crop hook**

Modül içi fabrika: bir oturum boyunca "kırpıcıdan çıkmış nihai fotoğrafları"
URI'lerine göre tutan bir `Map<string, PickedPhoto>` kapanışı üretir ve
`CameraRequest['crop']` imzasında bir fonksiyon döner. Fonksiyon:
boyutu `shot`tan ya da `measure`dan alır → `presentCropper` → `done` değilse
`null` → `done` ise çıktıyı map'e yazar, **kaynağın dosyasını** `forgetPhoto`
ile unutur ve `{ uri, width: OUTPUT_W, height: OUTPUT_H }` döner.

- [ ] **Step 5: Implement the shared commit**

Aynı map'i okuyan bir `commit`: kare map'te varsa dosya ZATEN nihai (900×1200,
kalıcı dizinde) — olduğu gibi kullanılır; yoksa `fitPhotoForUpload`dan geçer ve
**başarıdan sonra** ham kaynak `forgetPhoto` ile unutulur. Sonuç bir dış
değişkene yazılır, dönüş `null`; `fitPhotoForUpload` null dönerse
`options.failedMessage` döner (ekran açık kalır, kullanıcı yeniden deneyebilir).

⚠️ Reddedilen karenin dosyası BURADA silinmez — onun sahibi overlay'in
`discard`ı (gerekçe `CameraCaptureOverlay > discard`).

- [ ] **Step 6: Implement `captureAndPreviewPhoto`**

`ensureCameraPermission()` → `presentCameraCapture({ facing, frame: 'photo',
commitLabel, crop, commit })`. `committed` → toplanan fotoğraf; `cancelled` /
`failed` → `null`; `unavailable` → `captureAndCropPhoto({ facing })`e devret
(sistem kamerası + kırpıcı yedeği). `captured` BU YOLDA GELMEZ (`commit`
verildi) — gelirse `devLog` + `forgetPhoto` + `null`.

`commitHint` GEÇİLMEZ — sol alt yazısı bu yüzden çizilmiyor.

- [ ] **Step 7: Implement `pickAndPreviewPhotos`**

`openLibrary(limit)` → her asset için SIRAYLA `presentCameraCapture({
frame: 'photo', source: { uri, width, height }, commitLabel, crop, commit })`.
`committed` → listeye ekle; `cancelled`/`failed` → o fotoğrafı atla;
`unavailable` → döngüyü kır ve KALAN asset'leri `cropSequentially`ye ver,
sonucu listeye ekle.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest tests/shared/utils/photoPicker.test.ts`
Expected: PASS — yeni testler ve mevcut 23 test birlikte.

- [ ] **Step 9: Commit**

```bash
git add src/shared/utils/photoPicker.ts tests/shared/utils/photoPicker.test.ts
git commit -m "feat(photo): önizleme yolları — galeri ve kamera aynı ekrana çıkıyor"
```

---

### Task 5: Kayıt ekranı + i18n

**Files:**
- Modify: `src/features/auth/screens/RegisterStep15Screen.tsx` (satır 272, 399-444)
- Modify: `src/shared/i18n/translations/tr.ts`, `src/shared/i18n/translations/en.ts`
- Test: `tests/shared/i18n/` altındaki mevcut paralellik testi (varsa) çalışır kalmalı

**Interfaces:**
- Consumes: `captureAndPreviewPhoto`, `pickAndPreviewPhotos` (Görev 4).
- Produces: davranış.

- [ ] **Step 1: `common.add` anahtarını ekle**

`tr.ts`: `add: 'Ekle'` — `common.save`in yanına. `en.ts`: `add: 'Add'`.
Ekranda YAZI olarak görünmüyor; yalnız onay okunun erişilebilir adı.

- [ ] **Step 2: `pickingRef` mandalını ikiye ayır**

`pickingRef` yerine `galleryPickingRef` ve `cameraPickingRef`. Gerekçeyi
yorumda bırak: tek mandal, kamera akışı bir kez sonuçlanmadan kalırsa SONRAKİ
her galeri dokunuşunu sessizce yutuyordu (satır 403-408'deki mevcut teşhis notu
bu yeni duruma göre güncellenir, `devLog` kancaları KORUNUR).

- [ ] **Step 3: İki akışı yeni fonksiyonlara bağla**

```ts
const newPhotos = await pickAndPreviewPhotos(remainingSlots, {
  failedMessage: t('common.cropper.failed'),
  commitLabel: t('common.add'),
});
```
```ts
const taken = await captureAndPreviewPhoto({
  facing: 'front',
  failedMessage: t('common.cropper.failed'),
  commitLabel: t('common.add'),
});
```
`E_NO_CAMERA_PERMISSION` dalı ve `alertCameraPermission` DEĞİŞMEZ.

- [ ] **Step 4: Verify**

Run: `npm run type-check && npx eslint src/features/auth src/shared/utils src/shared/i18n && npx jest tests/shared/i18n tests/shared/utils`
Expected: hepsi PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/screens/RegisterStep15Screen.tsx src/shared/i18n/translations/tr.ts src/shared/i18n/translations/en.ts
git commit -m "feat(auth): kayıt foto adımı önizleme ekranına geçti, picking mandalı ayrıldı"
```

---

### Task 6: Cihaz doğrulaması

**Files:**
- Modify (yalnız gerekirse): `App.tsx` satır 204-220

**Interfaces:**
- Consumes: Görev 1-5'in tamamı.

- [ ] **Step 1: Run the full suite**

Run: `npx jest tests/shared tests/features/auth tests/features/campus`
Expected: PASS

- [ ] **Step 2: Build and run on a real device**

Run: `npx expo run:ios --device`
⚠️ Simülatörde kamera donanımı yok; kamera yolu orada `unavailable`a düşer ve
bu görev doğrulanamaz.

- [ ] **Step 3: Walk the checklist**

1. Kayıt → galeriden 1 fotoğraf → önizleme açılıyor, sol alt BOŞ, kırpma butonu var.
2. Aynı akış → kırp → **kırpıcı önizlemenin ÜSTÜNDE açılıyor** → Kaydet →
   önizlemeye kırpılmış kare dönüyor → ok → fotoğraf ekleniyor.
3. Galeriden 3 fotoğraf → üç önizleme sırayla; ortadakine ✕ → o atlanıyor.
4. Kayıt → kamera → deklanşör → ekran KAPANMIYOR, kare donuyor; yeniden çek ve
   kırp çalışıyor; ok → fotoğraf ekleniyor.
5. Kampüs anları → ekran bugünkü hâlinde: tam kanama pencere, sol altta okul
   metni, kırpma butonu YOK.
6. Önizlemede görülen kadraj, ızgaraya eklenen küçük resmin kadrajıyla aynı.

- [ ] **Step 4: Adımı 2 başarısızsa z-sırasını düzelt**

Kırpıcı önizlemenin ALTINDA kalıyorsa `App.tsx`te `<CameraCaptureOverlay />`i
`<CropperOverlay />`in ÖNÜNE al ve satır 215-219'daki yorumu kodun yeni hâline
göre düzelt (yorum zaten "kırpıcı üstte kalmalı" diyor; bugünkü sırada bunu
yalnız `CropperOverlay`in `zIndex: 1`i sağlıyor).

- [ ] **Step 5: Commit (yalnız bir değişiklik olduysa)**

```bash
git add App.tsx
git commit -m "fix(app): kırpıcı kamera önizlemesinin üstünde kalıyor"
```
