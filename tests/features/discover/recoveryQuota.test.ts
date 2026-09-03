/**
 * Kurtarma erişiminin TEK yorumlama noktası.
 *
 * 2026-08-31'de kurtarma kota/kredi ekonomisinden çıkıp premium ayrıcalığı oldu:
 * free `0`, premium `-1` (sınırsız). `/Stats` alanları silinmedi ama hepsi sabit
 * sinyale döndü, yani sözleşmenin en kolay yanlış uygulanan yeri artık ALAN
 * SEÇİMİ: sınırsızlık YALNIZ `remainingMissedMatchRecovery`den okunur.
 */

import { resolveRecoveryAccess } from '@/features/discover/recoveryQuota';

describe('resolveRecoveryAccess', () => {
  it('premium: -1 = SINIRSIZ', () => {
    const a = resolveRecoveryAccess({ remainingMissedMatchRecovery: -1 });

    expect(a.unlimited).toBe(true);
    expect(a.unknown).toBe(false);
  });

  it('free: 0 = hak yok (satın da alınamaz)', () => {
    const a = resolveRecoveryAccess({ remainingMissedMatchRecovery: 0 });

    expect(a.unlimited).toBe(false);
    expect(a.unknown).toBe(false);
  });

  // Bu alan premium'da da 0 dönüyor ve ASLA -1 olmuyor (backend testle
  // kilitledi). Sınırsızlık sinyali sanılırsa sessizce hep "hak yok" denir ve
  // abone kendi ödediği ekranda paywall görür.
  it('dailyMissedMatchRecoveryLimit sınırsızlığa ETKİ ETMEZ', () => {
    const a = resolveRecoveryAccess({
      remainingMissedMatchRecovery: -1,
      // Premium'da da 0 — sınırsızlığı bozmamalı.
      dailyMissedMatchRecoveryLimit: 0,
    } as any);

    expect(a.unlimited).toBe(true);
  });

  it('ölü alanlar (kredi/kota) karara girmez', () => {
    // Eski ekonomiden kalma bir yanıt: krediler dolu ama remaining 0.
    // Karar remaining'den — "10 kredin var" demek artık yanlış.
    const a = resolveRecoveryAccess({
      remainingMissedMatchRecovery: 0,
      quotaRecoveryRemaining: 2,
      purchasedRecoveries: 10,
    } as any);

    expect(a.unlimited).toBe(false);
    expect(a.unknown).toBe(false);
  });

  // `unknown` ≠ "hak yok": sinyal gelmemişken ne "Sınırsız" yazılır ne de satış
  // teklifi çizilir — ikisi de olmayan bir durumu iddia eder.
  it('sinyal hiç gelmediyse `unknown`', () => {
    expect(resolveRecoveryAccess(null).unknown).toBe(true);
    expect(resolveRecoveryAccess(undefined).unknown).toBe(true);
    expect(resolveRecoveryAccess({}).unknown).toBe(true);
    expect(
      resolveRecoveryAccess({ remainingMissedMatchRecovery: null }).unknown,
    ).toBe(true);
    // `unknown` iken sınırsız DEĞİL.
    expect(resolveRecoveryAccess({}).unlimited).toBe(false);
  });
});
