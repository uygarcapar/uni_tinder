import { frameWindow, centerCropRect } from '@/shared/components/cropper/cropGeometry';
import { cameraChrome, previewWindow } from '@/shared/components/camera/cameraLayout';

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
