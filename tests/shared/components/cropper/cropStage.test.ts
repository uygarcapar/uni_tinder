import { coverScale, toSourceRect } from '@/shared/components/cropper/cropGeometry';
import { cropFrameInWindow, cropStageScales, isWholeSource } from '@/shared/components/cropper/cropStage';

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
  // Yarım piksel tolerans: toSourceRect origin'i yuvarlıyor (296.33 → 296), tam orta 296.5.
  expect(Math.abs(rect.originX - (3000 - rect.width) / 2)).toBeLessThanOrEqual(0.5);
  const whole = toSourceRect({ srcW: 3000, srcH: 4000, winW: 393, winH: 524, baseScale: s.baseScale,
    scale: 1, tx: 0, ty: 0, aspectW: 3, aspectH: 4 });
  expect(isWholeSource(whole, 3000, 4000)).toBe(true);
});
