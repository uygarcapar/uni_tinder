import {
  flyOutDurationMs,
  FLY_OUT_MS_FAST,
  FLY_OUT_MS_SLOW,
  FLY_OUT_VELOCITY_FULL,
} from '@/features/discover/exitFlight';

describe('flyOutDurationMs', () => {
  it('hızsız bırakışta (buton yolu) en uzun süre', () => {
    expect(flyOutDurationMs(0)).toBe(FLY_OUT_MS_SLOW);
  });

  it('eşik hızında en kısa süre', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL)).toBe(FLY_OUT_MS_FAST);
  });

  it('eşiğin üstünde daha da kısalmıyor', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL * 4)).toBe(FLY_OUT_MS_FAST);
  });

  it('yön fark etmiyor — hızın büyüklüğü okunuyor', () => {
    expect(flyOutDurationMs(-FLY_OUT_VELOCITY_FULL)).toBe(FLY_OUT_MS_FAST);
  });

  it('arada doğrusal', () => {
    expect(flyOutDurationMs(FLY_OUT_VELOCITY_FULL / 2)).toBe(
      (FLY_OUT_MS_SLOW + FLY_OUT_MS_FAST) / 2,
    );
  });

  it('bozuk hız en uzun süreye düşüyor', () => {
    expect(flyOutDurationMs(NaN)).toBe(FLY_OUT_MS_SLOW);
    expect(flyOutDurationMs(Infinity)).toBe(FLY_OUT_MS_FAST);
  });
});
