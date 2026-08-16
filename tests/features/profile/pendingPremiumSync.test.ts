/**
 * "Parayı aldık, premium vermedik" kaydının sözleşmesi.
 *
 * Buradaki tek söz: **satın alma reload'u atlatır.** Redux `subscription`
 * slice'ı persist edilmediği için (diskten gelen `isPremium` hesap değişiminde
 * sızardı) uygulama yeniden açıldığında kullanıcı hiç satın almamış gibi
 * görünüyordu; kurtarma yolu yalnızca bu kayıt.
 */

const mockMemoryStore = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockMemoryStore.get(k),
    set: (k: string, v: string) => mockMemoryStore.set(k, v),
    remove: (k: string) => mockMemoryStore.delete(k),
    getBoolean: () => undefined,
    getNumber: () => undefined,
    clearAll: () => mockMemoryStore.clear(),
  }),
}));

import {
  bumpPendingPremiumSyncAttempt,
  clearPendingPremiumSync,
  hasPendingPremiumSync,
  markPendingPremiumSync,
  premiumSyncUserKey,
  readPendingPremiumSync,
} from '@/features/profile/pendingPremiumSync';

const USER = 'user-1';

beforeEach(() => {
  mockMemoryStore.clear();
  jest.restoreAllMocks();
});

describe('premiumSyncUserKey', () => {
  it('accepts both userId and id shapes the backend returns', () => {
    expect(premiumSyncUserKey({ userId: 7 })).toBe('7');
    expect(premiumSyncUserKey({ id: 'abc' })).toBe('abc');
    expect(premiumSyncUserKey(null)).toBeNull();
    expect(premiumSyncUserKey({})).toBeNull();
  });
});

describe('pendingPremiumSync', () => {
  it('survives a reload: the record is readable from storage after the write', () => {
    markPendingPremiumSync(USER, { productId: 'premium_monthly' });

    // Aynı MMKV içeriğinden okuyoruz — modül state'i değil, disk sözleşmesi.
    const restored = readPendingPremiumSync(USER);
    expect(restored?.productId).toBe('premium_monthly');
    expect(restored?.attempts).toBe(0);
    expect(hasPendingPremiumSync(USER)).toBe(true);
  });

  it('scopes the record per account so B never inherits A’s purchase', () => {
    markPendingPremiumSync('user-a', { productId: 'premium_yearly' });
    expect(hasPendingPremiumSync('user-b')).toBe(false);
    expect(hasPendingPremiumSync('user-a')).toBe(true);
  });

  it('keeps the original timestamp when re-marked, so the age guard cannot be reset forever', () => {
    const t0 = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    markPendingPremiumSync(USER, { productId: 'premium_monthly' });

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 60_000);
    markPendingPremiumSync(USER, { productId: 'premium_monthly' });

    expect(readPendingPremiumSync(USER)?.at).toBe(t0);
  });

  it('carries the productId over when a later mark has none', () => {
    markPendingPremiumSync(USER, { productId: 'premium_weekly' });
    markPendingPremiumSync(USER, { productId: null });
    expect(readPendingPremiumSync(USER)?.productId).toBe('premium_weekly');
  });

  it('counts attempts for telemetry without dropping the record', () => {
    markPendingPremiumSync(USER, { productId: null });
    bumpPendingPremiumSyncAttempt(USER);
    bumpPendingPremiumSyncAttempt(USER);

    expect(readPendingPremiumSync(USER)?.attempts).toBe(2);
    expect(hasPendingPremiumSync(USER)).toBe(true);
  });

  it('does not resurrect a record that was never written', () => {
    bumpPendingPremiumSyncAttempt(USER);
    expect(readPendingPremiumSync(USER)).toBeNull();
  });

  it('drops the record once it is older than the age guard', () => {
    const t0 = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    markPendingPremiumSync(USER, { productId: 'premium_monthly' });

    // 7 gün + 1 sn: webhook bu kadar gecikmez, retry çözmez. Kayıt düşer ki
    // kullanıcıya sonsuza kadar "aktivasyon sürüyor" gösterilmesin.
    jest.spyOn(Date, 'now').mockReturnValue(t0 + 7 * 24 * 60 * 60 * 1000 + 1000);
    expect(readPendingPremiumSync(USER)).toBeNull();
    expect(hasPendingPremiumSync(USER)).toBe(false);
  });

  it('clears the record when premium is confirmed', () => {
    markPendingPremiumSync(USER, { productId: 'premium_monthly' });
    clearPendingPremiumSync(USER);
    expect(hasPendingPremiumSync(USER)).toBe(false);
  });

  it('treats corrupt storage as "no pending purchase" instead of throwing', () => {
    mockMemoryStore.set(`pendingPremiumSync:${USER}`, '{bozuk');
    expect(readPendingPremiumSync(USER)).toBeNull();
  });

  it('ignores a missing user key on every entry point', () => {
    expect(() => markPendingPremiumSync(null)).not.toThrow();
    expect(() => bumpPendingPremiumSyncAttempt(undefined)).not.toThrow();
    expect(() => clearPendingPremiumSync(null)).not.toThrow();
    expect(hasPendingPremiumSync(null)).toBe(false);
  });
});
