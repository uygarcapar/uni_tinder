/**
 * Kırpma kipi sahnesi — SAF fonksiyonlar, RN import'u yok.
 *
 * Kamera ekranında donmuş kare üzerine 3:4 çerçeve bindiriliyor; bu dosya o
 * çerçevenin yerini ve kipe girişteki ölçekleri hesaplıyor. Çerçeve geometrisi
 * burada tek kaynak: kırpıcı ekranı ve kamera önizlemesi aynı sayıları kullanır.
 */
import { coverScale, maxZoom, type SourceRect } from '@/shared/components/cropper/cropGeometry';

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Pencerenin içinde 3:4 çerçeve. Genişlik pencereye ya da pencerenin 3:4
 * yüksekliğine sığan en büyük değer; iki eksende ortalı.
 *
 * NEDEN min(winW, winH·3/4): geniş ve KISA bir pencerede (ör. 393×400 → 300 geniş)
 * çerçeve taşmasın diye yüksekliğe göre daralıyor; dar ve uzun pencerede `winW`
 * bağlayıcı, yani tam genişlik kalıyor.
 */
export function cropFrameInWindow(a: { winW: number; winH: number }): Rect {
  const { winW, winH } = a;
  const width = Math.min(winW, (winH * 3) / 4);
  const height = (width * 4) / 3;
  return {
    left: (winW - width) / 2,
    top: (winH - height) / 2,
    width,
    height,
  };
}

/**
 * Kipe giriş ölçekleri.
 *
 * - baseScale: kaynağın çerçeveyi VE pencere genişliğini kaplayan taban ölçek.
 * - startScale: 1'in üstü; giriş görüntüsü önizlemedeki (pencereye cover) ile
 *   birebir aynı boyutta açılsın diye. Çerçeve bu ölçekte zaten dolu.
 * - maxScale: çıktının büyütülmemesi için tavan (bkz. maxZoom).
 *
 * NEDEN startScale >= 1: 1 altı bir değer çerçeveyi boşlukta bırakırdı; taban
 * zaten çerçeveyi kapsıyor, ölçek yalnız önizleme boyutuna çıkarmak için.
 */
export function cropStageScales(a: {
  srcW: number; srcH: number; winW: number; winH: number;
  frameW: number; frameH: number; outW: number;
}): { baseScale: number; startScale: number; maxScale: number } {
  const { srcW, srcH, winW, winH, frameW, frameH, outW } = a;
  const baseScale = Math.max(winW / srcW, coverScale(srcW, srcH, frameW, frameH));
  const startScale = Math.max(1, coverScale(srcW, srcH, winW, winH) / baseScale);
  const maxScale = Math.max(startScale, maxZoom(baseScale, frameW, outW));
  return { baseScale, startScale, maxScale };
}

/**
 * Kırpma dikdörtgeni kaynağın tamamı mı? Kullanıcı hiç kaydırmadan ✓'a basarsa
 * (ya da tam uzaklaştırırsa) çıktı kaynağın tamamından oluşur.
 */
export function isWholeSource(rect: SourceRect, srcW: number, srcH: number): boolean {
  return rect.originX === 0 && rect.originY === 0 && rect.width >= srcW && rect.height >= srcH;
}
