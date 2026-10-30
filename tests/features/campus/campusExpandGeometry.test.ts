import { readFileSync } from 'fs';
import {
  BUTTON_COLUMN,
  campusExpandGeometry,
  campusExpandTransform,
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

/**
 * HAREKET ARTIK TRANSFORM — layout DEĞİL.
 *
 * Kart hedef ölçüsünde DOĞUYOR ve başlangıçta küçültülüp şeritteki yerine
 * taşınıyor; p=1'de dönüşüm kimliğe iniyor. Sebep akıcılık: `left/top/width/
 * height` her karede Yoga'dan geçiyor, `translate/scale` ise doğrudan
 * kompozitörde — "native smooth" olan tam bu fark.
 *
 * ⚠️ ÖLÇEK MERKEZDEN: RN `transform`u görünümün MERKEZİ etrafında uyguluyor,
 * bu yüzden öteleme MERKEZLER arasındaki fark (köşeler arasındaki değil).
 * Köşe farkı yazılırsa kart küçükken şeridin yanına düşüyor.
 */
describe('campusExpandTransform', () => {
  /**
   * ⚠️🔴 UI THREAD'DE KOŞUYOR → `"worklet"` DİREKTİFİ ŞART.
   *
   * Fonksiyon `useAnimatedStyle`in içinden çağrılıyor, yani JS thread'de
   * değil UI thread'de. İşaretlenmemiş bir fonksiyonu oradan çağırmak
   * uygulamayı FATAL ile düşürüyor:
   *   "[Worklets] Tried to synchronously call a non-worklet function".
   *
   * Direktif kaynak metninden aranıyor çünkü jest'in babel geçişi worklet
   * imzasını (`__workletHash`) iliştirmiyor — yani çalışma zamanından
   * doğrulanamıyor. Kaynak nöbetçisi bu sınıfı kapatan tek şey.
   */
  it('UI thread\'de koşuyor — `worklet` direktifi duruyor', () => {
    const source = readFileSync(
      'src/features/campus/campusExpandGeometry.ts',
      'utf8',
    );
    const fn = source.slice(source.indexOf('export function campusExpandTransform'));
    expect(fn.slice(0, fn.indexOf('return'))).toContain('"worklet"');
  });

  const start = { x: 20, y: 600, width: 167, height: 222 };
  const target = { x: 68, y: 200, width: 257, height: 342 };

  it('p=1 → kimlik dönüşümü (kart hedefinde)', () => {
    const t = campusExpandTransform(start, target, 1);
    expect(t.scale).toBeCloseTo(1, 5);
    expect(t.translateX).toBeCloseTo(0, 5);
    expect(t.translateY).toBeCloseTo(0, 5);
  });

  it('p=0 → kart ŞERİTTEKİ kareye birebir oturuyor', () => {
    const t = campusExpandTransform(start, target, 0);
    expect(t.scale).toBeCloseTo(start.width / target.width, 5);
    // Ölçek merkezden uygulandığı için merkezler çakışmalı.
    const targetCx = target.x + target.width / 2;
    const startCx = start.x + start.width / 2;
    expect(targetCx + t.translateX).toBeCloseTo(startCx, 5);
    const targetCy = target.y + target.height / 2;
    const startCy = start.y + start.height / 2;
    expect(targetCy + t.translateY).toBeCloseTo(startCy, 5);
  });

  it('p=0.5 → iki uç arasında', () => {
    const t = campusExpandTransform(start, target, 0.5);
    expect(t.scale).toBeGreaterThan(start.width / target.width);
    expect(t.scale).toBeLessThan(1);
  });
});
