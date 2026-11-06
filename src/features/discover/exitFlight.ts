/**
 * ── KARTIN ÇIKIŞ UÇUŞUNUN SÜRESİ (istek, 2026-11-06) ───────────────────────
 *
 * Beğen/geç'te kart yine ekranı terk ediyor (alev yalnız Fire/Spark ve notta
 * kaldı — sözleşme: flameSweep · SwipeWrapper > runCoveredExit). Uçuş SABİT
 * SÜRELİ DEĞİL: süresi parmağın bıraktığı hızdan geliyor.
 *
 * Gerekçe jestin kendisi: yatay swipe 2026-11-04'te geri geldi, yani kullanıcı
 * kartı bazen sertçe fiskeliyor bazen sürükleyip bırakıyor. Sabit süreli bir
 * uçuşta sert fiske "kart elimden çıktı ama ekran onu tutuyor" gibi
 * okunuyordu: parmak 3000 px/sn giderken kart 180 ms'lik kendi takvimiyle
 * yürüyor.
 *
 * Eşleme bilerek BASİT (doğrusal, iki uç arasında):
 *   • hız 0            → FLY_OUT_MS_SLOW. Buton yolunun (✓ / X) hızı yok,
 *     yani butonlar her zaman bu uçta.
 *   • |hız| ≥ FULL     → FLY_OUT_MS_FAST, daha da kısalmıyor. Tavan şart:
 *     hızla orantılı serbest bir süre, 8000 px/sn'lik bir fiskede kartı
 *     göz kırpışından kısa sürede yok ederdi.
 *
 * FLY_OUT_VELOCITY_FULL, jestin kendi hız kapısıyla (bkz. SwipeWrapper >
 * VELOCITY_THRESHOLD) AYNI SAYI, bilerek: o eşik "bu bir fiskeydi" diyen
 * sınır; en kısa uçuşun da tam orada başlaması, kararın ve hareketin aynı
 * şeyi söylemesi demek.
 */
export const FLY_OUT_MS_SLOW = 180;
export const FLY_OUT_MS_FAST = 120;
export const FLY_OUT_VELOCITY_FULL = 2500;

/**
 * Bırakış hızından uçuş süresi (ms).
 *
 * `'worklet'`: jestin `onEnd`inden, UI thread'inde çağrılıyor.
 *
 * Bozuk sayıya karşı sağlam olmak zorunda — döndürdüğü şey doğrudan
 * `withTiming`in `duration`ı ve oraya `NaN` gitmesi animasyonu sessizce
 * öldürüyor (kart ekranın ortasında donar, deste hiç ilerlemez). `NaN` en uzun
 * süreye düşüyor: yavaş olan güvenli olan.
 */
export function flyOutDurationMs(velocityX: number): number {
  "worklet";
  const speed = Math.abs(velocityX);
  // Number.isNaN: hem bozuk hız hem de 0/0 türü hesapların tek kapısı.
  const t = Number.isNaN(speed)
    ? 0
    : Math.min(1, speed / FLY_OUT_VELOCITY_FULL);
  return FLY_OUT_MS_SLOW + (FLY_OUT_MS_FAST - FLY_OUT_MS_SLOW) * t;
}
