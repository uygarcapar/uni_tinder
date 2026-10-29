import {
  BUTTON_COLUMN,
  campusExpandGeometry,
} from '@/features/campus/campusExpandGeometry';

/**
 * BÜYÜYEN KARTIN ÖLÇÜSÜ — saf hesap.
 *
 * Kart şeritteki yerinden ekranın ortasına uçup büyüyor; hedef dikdörtgen üç
 * kısıtın kesişimi: 3:4 oranı, güvenli alan ve SAĞDAKİ cam sütunu. Üçü bir
 * `useMemo`nun içinde gözle doğrulanamıyordu, o yüzden saf modül
 * (`campusStripBoxes` ve `cropGeometry` ile aynı gerekçe).
 *
 * Çivilenen asıl şey: kart ekranın ortasında DEĞİL — cam butonun sütunu
 * sağdan yer alıyor ve kart o kadar sola kayıyor. Hesap ortalarsa buton
 * kartın üstüne biner.
 */

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
    expect(target.y + target.height).toBeLessThanOrEqual(
      screen.screenH - BASE.bottomInset,
    );
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
