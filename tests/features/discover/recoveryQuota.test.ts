/**
 * Kurtarma bakiyesinin payda kuralı.
 *
 * Sözleşmenin en kolay yanlış uygulanan yeri burası: **"kalan > tavan" artık
 * NORMAL.** Backend clamp yapmıyor (clamp'lemek parayla alınmış krediyi
 * yakardı), dolayısıyla payda tek yerden çözülmezse her ekran ayrı bir yanlış
 * oran üretir.
 */

import {
  resolveRecoveryBalance,
  spendRecoveryPatch,
} from '@/features/discover/recoveryQuota';

describe('resolveRecoveryBalance', () => {
  it('payda = tier tavanı + satın alınan kredi', () => {
    const b = resolveRecoveryBalance({
      remainingMissedMatchRecovery: 12,
      quotaRecoveryRemaining: 2,
      purchasedRecoveries: 10,
      dailyMissedMatchRecoveryLimit: 2,
    });

    expect(b.total).toBe(12);
    expect(b.exceedsTotal).toBe(false);
    expect(b.hasBalance).toBe(true);
  });

  it('free kullanıcı: tavan 0, hak yalnız krediden gelir', () => {
    const b = resolveRecoveryBalance({
      remainingMissedMatchRecovery: 3,
      quotaRecoveryRemaining: 0,
      purchasedRecoveries: 3,
      dailyMissedMatchRecoveryLimit: 0,
    });

    // Tavan 0 ama payda 3: kredi paydaya dahil, yoksa "3/0" çıkardı.
    expect(b.total).toBe(3);
    expect(b.exceedsTotal).toBe(false);
  });

  it('tier düşüşünde kalan paydayı aşar — oran gösterimi kapatılır', () => {
    // Yıllıktan aylığa düşen kullanıcı: eski tier'ın kotası duruyor (5),
    // yeni tavan 2, kredi yok. "5/2" yazmak yerine oransız gösterime düşülür.
    const b = resolveRecoveryBalance({
      remainingMissedMatchRecovery: 5,
      quotaRecoveryRemaining: 5,
      purchasedRecoveries: 0,
      dailyMissedMatchRecoveryLimit: 2,
    });

    expect(b.total).toBe(2);
    expect(b.exceedsTotal).toBe(true);
  });

  it('tavan bilinmiyorsa payda da bilinmiyor (uydurma oran yok)', () => {
    const b = resolveRecoveryBalance({
      remainingMissedMatchRecovery: 4,
      dailyMissedMatchRecoveryLimit: null,
    });

    expect(b.total).toBeNull();
    expect(b.unknown).toBe(false);
    expect(b.hasBalance).toBe(true);
  });

  it('bakiye hiç gelmediyse `unknown` — ekranda sayı YAZILMAZ', () => {
    expect(resolveRecoveryBalance(null).unknown).toBe(true);
    expect(resolveRecoveryBalance({}).unknown).toBe(true);
    expect(resolveRecoveryBalance({}).hasBalance).toBe(false);
  });

  it('negatif değer 0 sayılır (iade sonrası backend eksiye düşerse)', () => {
    const b = resolveRecoveryBalance({
      remainingMissedMatchRecovery: -1,
      dailyMissedMatchRecoveryLimit: 2,
    });

    expect(b.remaining).toBe(0);
    expect(b.hasBalance).toBe(false);
  });
});

describe('spendRecoveryPatch', () => {
  it('önce kotadan harcar (backend sırasıyla aynı)', () => {
    expect(
      spendRecoveryPatch({
        remainingMissedMatchRecovery: 12,
        quotaRecoveryRemaining: 2,
        purchasedRecoveries: 10,
        dailyMissedMatchRecoveryLimit: 2,
      }),
    ).toEqual({
      remainingMissedMatchRecovery: 11,
      quotaRecoveryRemaining: 1,
    });
  });

  it('kota bittiyse krediden harcar', () => {
    expect(
      spendRecoveryPatch({
        remainingMissedMatchRecovery: 10,
        quotaRecoveryRemaining: 0,
        purchasedRecoveries: 10,
        dailyMissedMatchRecoveryLimit: 2,
      }),
    ).toEqual({
      remainingMissedMatchRecovery: 9,
      purchasedRecoveries: 9,
    });
  });

  it('ayrışma bilinmiyorsa yalnız toplam düşer — 0 uydurulmaz', () => {
    expect(
      spendRecoveryPatch({ remainingMissedMatchRecovery: 3 }),
    ).toEqual({ remainingMissedMatchRecovery: 2 });
  });

  it('bakiye yokken/bilinmezken hiçbir alana dokunmaz', () => {
    expect(spendRecoveryPatch({ remainingMissedMatchRecovery: 0 })).toEqual({});
    expect(spendRecoveryPatch(null)).toEqual({});
  });
});
