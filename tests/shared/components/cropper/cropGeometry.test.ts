import {
  clamp,
  coverScale,
  maxOffset,
  maxZoom,
  toSourceRect,
} from '@/shared/components/cropper/cropGeometry';

// Kırpma penceresi: 3:4, tipik bir telefonda ~360x480 pt.
const WIN_W = 360;
const WIN_H = 480;

const rectFor = (
  srcW: number,
  srcH: number,
  overrides: Partial<{ scale: number; tx: number; ty: number }> = {},
) => {
  const baseScale = coverScale(srcW, srcH, WIN_W, WIN_H);
  return toSourceRect({
    srcW,
    srcH,
    winW: WIN_W,
    winH: WIN_H,
    baseScale,
    scale: overrides.scale ?? 1,
    tx: overrides.tx ?? 0,
    ty: overrides.ty ?? 0,
    aspectW: 3,
    aspectH: 4,
  });
};

describe('clamp', () => {
  it('sınırların dışını içeri çeker', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('coverScale', () => {
  it('dikey kaynakta genişlik eksenini bağlayıcı seçer', () => {
    // 3000x6000 (çok uzun) → pencereyi doldurmak için genişlik belirleyici.
    expect(coverScale(3000, 6000, WIN_W, WIN_H)).toBeCloseTo(WIN_W / 3000);
  });

  it('yatay kaynakta yükseklik eksenini bağlayıcı seçer', () => {
    expect(coverScale(4000, 3000, WIN_W, WIN_H)).toBeCloseTo(WIN_H / 3000);
  });

  it('kare kaynakta yükseklik bağlayıcıdır (pencere 3:4)', () => {
    expect(coverScale(2000, 2000, WIN_W, WIN_H)).toBeCloseTo(WIN_H / 2000);
  });

  it('tam 3:4 kaynakta iki eksen de aynı ölçeği verir', () => {
    const s = coverScale(900, 1200, WIN_W, WIN_H);
    expect(s).toBeCloseTo(WIN_W / 900);
    expect(s).toBeCloseTo(WIN_H / 1200);
  });

  it('geçersiz boyutta 1 döner', () => {
    expect(coverScale(0, 100, WIN_W, WIN_H)).toBe(1);
  });
});

describe('maxOffset', () => {
  it('pencereden büyük görüntüde yarı taşmayı verir', () => {
    expect(maxOffset(500, 360)).toBe(70);
  });

  it('pencereye tam oturan görüntüde 0 döner (negatif değil)', () => {
    expect(maxOffset(360, 360)).toBe(0);
    expect(maxOffset(300, 360)).toBe(0);
  });
});

describe('maxZoom', () => {
  it('büyük kaynakta upscale sınırına kadar izin verir', () => {
    // 3024x4032, 360pt pencere → baseScale ≈ 0.119, tavan ≈ 3.36
    const baseScale = coverScale(3024, 4032, WIN_W, WIN_H);
    expect(maxZoom(baseScale, WIN_W, 900)).toBeCloseTo(3024 / 900, 5);
  });

  it('küçük kaynakta 2.0 tabanına oturur', () => {
    // 400x600 → hesaplanan tavan 1'in altında kalır, kullanıcı çerçeveyi hiç
    // ayarlayamazdı. Hafif upscale, kullanılamaz ekrandan iyi.
    const baseScale = coverScale(400, 600, WIN_W, WIN_H);
    expect(maxZoom(baseScale, WIN_W, 900)).toBe(2);
  });

  it('tavanı 8 ile sınırlar', () => {
    expect(maxZoom(0.0001, WIN_W, 1)).toBe(8);
  });
});

describe('toSourceRect', () => {
  it('tam 3:4 kaynakta tüm görüntüyü döndürür', () => {
    expect(rectFor(900, 1200)).toEqual({
      originX: 0,
      originY: 0,
      width: 900,
      height: 1200,
    });
  });

  it('yatay kaynakta tam yüksekliği alır ve yatayda ortalar', () => {
    const rect = rectFor(4000, 3000);
    expect(rect.originY).toBe(0);
    expect(rect.height).toBe(3000);
    expect(rect.width).toBe(2250); // 3000 * 3/4
    expect(rect.originX).toBe((4000 - 2250) / 2);
  });

  it('dikey kaynakta tam genişliği alır ve dikeyde ortalar', () => {
    const rect = rectFor(3000, 6000);
    expect(rect.originX).toBe(0);
    expect(rect.width).toBe(3000);
    expect(rect.height).toBe(4000); // 3000 * 4/3
    expect(rect.originY).toBe((6000 - 4000) / 2);
  });

  it('sağa sonuna kadar kaydırınca originX 0 olur', () => {
    const srcW = 4000;
    const srcH = 3000;
    const baseScale = coverScale(srcW, srcH, WIN_W, WIN_H);
    const maxTx = maxOffset(srcW * baseScale, WIN_W);
    expect(rectFor(srcW, srcH, { tx: maxTx }).originX).toBe(0);
  });

  it('sola sonuna kadar kaydırınca sağ kenara yaslanır', () => {
    const srcW = 4000;
    const srcH = 3000;
    const baseScale = coverScale(srcW, srcH, WIN_W, WIN_H);
    const maxTx = maxOffset(srcW * baseScale, WIN_W);
    const rect = rectFor(srcW, srcH, { tx: -maxTx });
    expect(rect.originX).toBe(srcW - rect.width);
  });

  it('yakınlaştırınca daha küçük bir alan kırpar', () => {
    const wide = rectFor(4000, 3000);
    const zoomed = rectFor(4000, 3000, { scale: 2 });
    expect(zoomed.width).toBeLessThan(wide.width);
    expect(zoomed.width).toBe(Math.round(wide.width / 2));
  });

  it('geçersiz boyutta çökmez', () => {
    const rect = toSourceRect({
      srcW: 0, srcH: 0, winW: WIN_W, winH: WIN_H,
      baseScale: 0, scale: 1, tx: 0, ty: 0, aspectW: 3, aspectH: 4,
    });
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  /**
   * Asıl sözleşme: dönen dikdörtgen HER ZAMAN tam sayı, HER ZAMAN tam 3:4 ve
   * HER ZAMAN kaynağın içinde. iOS'ta CGImage.cropping(to:) taşan dikdörtgeni
   * hata vermeden küçültüyor — orandan sapmış bir JPEG sessizce üretilirdi.
   */
  it('rastgele girdilerde sınır/oran/tamsayı sözleşmesini korur', () => {
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let i = 0; i < 500; i++) {
      const srcW = Math.round(200 + rand() * 8000);
      const srcH = Math.round(200 + rand() * 8000);
      const baseScale = coverScale(srcW, srcH, WIN_W, WIN_H);
      const scale = 1 + rand() * (maxZoom(baseScale, WIN_W, 900) - 1);
      const pps = baseScale * scale;
      const mx = maxOffset(srcW * pps, WIN_W);
      const my = maxOffset(srcH * pps, WIN_H);

      const rect = toSourceRect({
        srcW, srcH, winW: WIN_W, winH: WIN_H,
        baseScale, scale,
        tx: (rand() * 2 - 1) * mx,
        ty: (rand() * 2 - 1) * my,
        aspectW: 3, aspectH: 4,
      });

      expect(Number.isInteger(rect.originX)).toBe(true);
      expect(Number.isInteger(rect.originY)).toBe(true);
      expect(Number.isInteger(rect.width)).toBe(true);
      expect(Number.isInteger(rect.height)).toBe(true);

      expect(rect.originX).toBeGreaterThanOrEqual(0);
      expect(rect.originY).toBeGreaterThanOrEqual(0);
      expect(rect.originX + rect.width).toBeLessThanOrEqual(srcW);
      expect(rect.originY + rect.height).toBeLessThanOrEqual(srcH);

      // Tam sayıya yuvarlama nedeniyle 1 px'lik sapma kabul edilir; resize
      // aşamasında görünür bir esneme üretmiyor.
      expect(Math.abs(rect.height - (rect.width * 4) / 3)).toBeLessThanOrEqual(1);
    }
  });
});
