/**
 * Kamera ekranı yerleşimi ve chrome kararı — SAF fonksiyonlar, RN import'u yok.
 *
 * Çekim sonrası önizleme iki yoldan geliyor: canlı kamera (`fill`, bugünkü
 * tam ekran kutu) ve galeri/kamera fotoğrafı (`photo`, 3:4 kadraj). İkisi aynı
 * ekranda çizilir; bu dosya yalnız "hangi kutu" ve "hangi düğme" sorusunu
 * cevaplar, çizim bileşene aittir.
 */

import { frameWindow } from '@/shared/components/cropper/cropGeometry';

export type PreviewFrame = 'fill' | 'photo';

/**
 * Önizleme penceresi. `headerH`/`footerH` KAMERA ekranının kendi ölçüleri
 * (gerekçe spec'teki "Pencere" kararında). `photo` dalı `frameWindow`u kullanır,
 * dolayısıyla tipik bir telefonda kırpıcıyla aynı pencereyi verir.
 */
export function previewWindow(a: {
  frame: PreviewFrame;
  screenW: number;
  screenH: number;
  insetTop: number;
  headerH: number;
  footerH: number;
}): { left: number; top: number; winW: number; winH: number } {
  const { frame, screenW, screenH, insetTop, headerH, footerH } = a;

  if (frame === 'fill') {
    // Bugünkü `CameraCaptureOverlay` layout hesabı, birebir: kutu güvenli
    // alanın altından deklanşöre kadar, tam genişlik. Alt sınır 160 — çok
    // kısa bir ekranda önizleme kaybolmasın.
    return {
      left: 0,
      top: insetTop,
      winW: screenW,
      winH: Math.max(160, screenH - insetTop - footerH),
    };
  }

  // 3:4 kadraj: kırpıcıyla AYNI formül, sonuç ekranın tam ortasına oturur.
  const { winW, winH } = frameWindow({
    screenW,
    screenH,
    headerH,
    footerH,
    aspectW: 3,
    aspectH: 4,
  });
  return {
    left: (screenW - winW) / 2,
    top: (screenH - winH) / 2,
    winW,
    winH,
  };
}

/**
 * Önizleme anındaki düğmeler. `previewOnly` = galeri/kamera fotoğrafı (canlı
 * akış yok); `frozen` = bir kare ekranda donmuş ve onay bekliyor; `allowCrop`
 * = çağıranın kırpma kancası var mı.
 *
 * Kırpma düğmesi yalnız kanca varsa çizilir — kampüs akışında kırpıcı yok ve
 * boş bir düğme kullanıcıyı yanıltır.
 */
export function cameraChrome(a: {
  previewOnly: boolean;
  frozen: boolean;
  allowCrop: boolean;
}): {
  shutter: boolean;
  flash: boolean;
  flip: boolean;
  retake: boolean;
  crop: boolean;
  confirm: boolean;
} {
  const { previewOnly, frozen, allowCrop } = a;
  // Canlı akış: deklanşör, flaş, kamera çevirme. Yalnız kare canlıyken.
  const live = !previewOnly && !frozen;
  return {
    shutter: live,
    flash: live,
    flip: live,
    // Yeniden çekim yalnız canlı kameradan donmuş kareye özgü; galeri
    // fotoğrafının "yeniden çek"i yok.
    retake: !previewOnly && frozen,
    crop: allowCrop && frozen,
    confirm: frozen,
  };
}
