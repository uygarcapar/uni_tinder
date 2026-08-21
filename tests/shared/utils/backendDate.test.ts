/**
 * Backend tarih damgalarının offset'i eksik geliyor ve JS bunu YEREL saat
 * sayıyor. Sahadaki bedeli premium'un sessizce kapanmasıydı (bkz.
 * subscriptionSlice `selectIsPremium`).
 */
import {
  normalizeBackendIso,
  parseBackendDate,
} from '@/shared/utils/backendDate';

describe('normalizeBackendIso', () => {
  it('marks an offsetless timestamp as UTC — the actual production shape', () => {
    expect(normalizeBackendIso('2026-08-21T12:06:16')).toBe('2026-08-21T12:06:16Z');
  });

  it('leaves an explicit offset alone', () => {
    expect(normalizeBackendIso('2026-08-21T12:06:16Z')).toBe('2026-08-21T12:06:16Z');
    expect(normalizeBackendIso('2026-08-21T15:06:16+03:00')).toBe('2026-08-21T15:06:16+03:00');
    expect(normalizeBackendIso('2026-08-21T15:06:16+0300')).toBe('2026-08-21T15:06:16+0300');
  });

  it('clamps .NET sub-second precision to the three digits the spec defines', () => {
    // Hub event'lerinde görülen gerçek biçim.
    expect(normalizeBackendIso('2026-08-21T11:57:27.0950694Z')).toBe(
      '2026-08-21T11:57:27.095Z',
    );
    expect(normalizeBackendIso('2026-08-21T11:57:27.0950694')).toBe(
      '2026-08-21T11:57:27.095Z',
    );
  });

  it('leaves a date-only value alone — JS already reads it as UTC', () => {
    expect(normalizeBackendIso('2026-08-21')).toBe('2026-08-21');
  });

  it('returns null for anything unusable instead of an Invalid Date', () => {
    expect(normalizeBackendIso(null)).toBeNull();
    expect(normalizeBackendIso(undefined)).toBeNull();
    expect(normalizeBackendIso('')).toBeNull();
    expect(normalizeBackendIso('   ')).toBeNull();
    expect(parseBackendDate('bir tarih değil')).toBeNull();
  });

  it('reads the offsetless value as the instant the backend meant', () => {
    // Yerel saat ne olursa olsun sonuç aynı: damga UTC.
    expect(parseBackendDate('2026-08-21T12:06:16')!.toISOString()).toBe(
      '2026-08-21T12:06:16.000Z',
    );
  });
});
