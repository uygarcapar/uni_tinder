import { frameWindow, centerCropRect } from '@/shared/components/cropper/cropGeometry';
import { cameraChrome, footerStrip, previewWindow } from '@/shared/components/camera/cameraLayout';

describe('previewWindow', () => {
  const phone = { screenW: 393, screenH: 852, insetTop: 59, headerH: 123, footerH: 140 };

  it("'fill' bugünkü yerleşimi birebir korur", () => {
    expect(previewWindow({ ...phone, frame: 'fill' }))
      .toEqual({ left: 0, top: 59, winW: 393, winH: 653 });
  });

  it("'photo' 3:4 ve kampüs penceresiyle AYNI tepeden başlıyor (üste dayalı)", () => {
    const w = previewWindow({ ...phone, frame: 'photo' });
    const fill = previewWindow({ ...phone, frame: 'fill' });
    expect(w.winW).toBe(393);
    expect(w.winH).toBeCloseTo(524, 0);
    // Tepe = güvenli alanın hemen altı, kampüs penceresiyle birebir.
    expect(w.top).toBe(fill.top);
    expect(w.left).toBe(0);
  });

  it("'photo' penceresi kırpıcınınkiyle AYNI BOYUTTA (tipik telefon) — kırpmaya geçişte ölçek sıçramaz", () => {
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
    expect(w.top).toBe(20);
    expect(w.top + w.winH).toBeLessThanOrEqual(667 - 112);
  });

  it("'photo' 3:4 tam genişliğe sığmıyorsa daralır, yatayda ortalanır, yine taşmaz", () => {
    // Kısa ekran: tepe ile şerit arası 600 - 59 - 140 = 401 → en 300.75.
    const short = { ...phone, screenH: 600 };
    const w = previewWindow({ ...short, frame: 'photo' });
    expect(w.top).toBe(59);
    expect(w.winH / w.winW).toBeCloseTo(4 / 3, 5);
    expect(w.top + w.winH).toBeLessThanOrEqual(600 - 140);
    expect(w.left).toBeCloseTo((393 - w.winW) / 2, 5);
    expect(w.left).toBeGreaterThan(0);
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
    expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: true, cropping: false }))
      .toEqual({ shutter: false, flash: false, flip: false, retake: false, reset: false, crop: true, confirm: true, hint: false });
  });

  it('canlı akışta deklanşör ve flaş var, onay yok', () => {
    expect(cameraChrome({ previewOnly: false, frozen: false, allowCrop: true, cropping: false }))
      .toEqual({ shutter: true, flash: true, flip: true, retake: false, reset: false, crop: false, confirm: false, hint: false });
  });

  it('kare donunca yeniden-çek ve onay gelir, deklanşör gider', () => {
    expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: true, cropping: false }))
      .toEqual({ shutter: false, flash: false, flip: false, retake: true, reset: false, crop: true, confirm: true, hint: false });
  });

  it('kırpma kancası yoksa kırpma butonu HİÇ çizilmez (kampüs)', () => {
    expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: false, cropping: false }).crop).toBe(false);
    expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: false, cropping: false }).crop).toBe(false);
  });

  it('kırpma kipinde yeniden-çek gider, sıfırla + ipucu gelir, kırp ve onay kalır', () => {
    expect(cameraChrome({ previewOnly: false, frozen: true, allowCrop: true, cropping: true }))
      .toEqual({ shutter: false, flash: false, flip: false, retake: false, reset: true, crop: true, confirm: true, hint: true });
    expect(cameraChrome({ previewOnly: true, frozen: true, allowCrop: true, cropping: true }).reset).toBe(true);
  });
});

describe('footerStrip', () => {
  it('deklanşör şeridi: kontrol ortada, üstte ve altta EŞİT boşluk', () => {
    expect(footerStrip({ insetBottom: 34, controlH: 72 })).toEqual({ footerGap: 34, footerH: 140 });
  });

  it('galeri: deklanşör yok, şerit yalnız ok kadar — pencere 24pt aşağı uzanır', () => {
    const camera = footerStrip({ insetBottom: 34, controlH: 72 });
    const gallery = footerStrip({ insetBottom: 34, controlH: 48 });
    expect(gallery).toEqual({ footerGap: 34, footerH: 116 });
    const phone = { screenW: 393, screenH: 852, insetTop: 59, headerH: 123 };
    const winCam = previewWindow({ ...phone, footerH: camera.footerH, frame: 'fill' });
    const winGal = previewWindow({ ...phone, footerH: gallery.footerH, frame: 'fill' });
    expect(winGal.winH - winCam.winH).toBe(24);
    expect(winGal.top).toBe(winCam.top);
  });

  it('güvenli alanı olmayan cihazda boşluk tabanı 20', () => {
    expect(footerStrip({ insetBottom: 0, controlH: 48 })).toEqual({ footerGap: 20, footerH: 88 });
  });
});
