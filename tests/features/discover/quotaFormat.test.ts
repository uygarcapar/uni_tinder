/**
 * Kota geri sayımının iki sözleşmesi:
 *   1. `-1` = "asla resetlenmez" (free tier'ın lifetime SuperLike hakkı) →
 *      geri sayım GÖSTERİLMEZ.
 *   2. `nextXResetAt` o durumda sentinel bir tarih taşıyor (9999-12-31) →
 *      parse edilip ekrana basılmamalı.
 */

import {
  resolveResetSeconds,
  formatResetTime,
  formatResetDuration,
} from '@/features/discover/quotaFormat';
import { UNLIMITED } from '@/shared/constants/limits';

const NOW = Date.parse('2026-08-11T12:00:00Z');
const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}:${JSON.stringify(opts)}` : key;

describe('resolveResetSeconds', () => {
  it('passes the "never resets" sentinel straight through', () => {
    expect(
      resolveResetSeconds({ seconds: UNLIMITED, absoluteAt: null, now: NOW }),
    ).toBe(UNLIMITED);
  });

  it('treats the sentinel DATE as "never" even when the seconds field is missing', () => {
    // Backend normalde ikisini birlikte gönderiyor; alan düşerse eskiden
    // buradan "70 milyon saat sonra yenilenecek" metni sızıyordu.
    expect(
      resolveResetSeconds({
        absoluteAt: '9999-12-31T23:59:59.9999999Z',
        seconds: null,
        now: NOW,
      }),
    ).toBe(UNLIMITED);
  });

  it('prefers the absolute date over a stale seconds value', () => {
    // `staleTime: Infinity` yüzünden saniye değeri saatler önce hesaplanmış
    // olabilir; mutlak tarih varsa o kazanır.
    const in2h = new Date(NOW + 2 * 3600_000).toISOString();
    expect(
      resolveResetSeconds({ absoluteAt: in2h, seconds: 99_999, now: NOW }),
    ).toBe(7200);
  });

  it('anchors a bare seconds value to when the data was fetched', () => {
    expect(
      resolveResetSeconds({
        seconds: 3600,
        fetchedAt: NOW - 600_000, // 10 dk önce çekilmiş
        now: NOW,
      }),
    ).toBe(3000);
  });

  it('never returns a negative countdown', () => {
    const past = new Date(NOW - 5000).toISOString();
    expect(resolveResetSeconds({ absoluteAt: past, now: NOW })).toBe(0);
  });
});

describe('formatResetTime', () => {
  it('renders nothing for "never resets" so no false promise is shown', () => {
    expect(formatResetTime(UNLIMITED, t)).toBeNull();
  });

  it('falls back to the "now" copy for a lapsed countdown', () => {
    expect(formatResetTime(0, t)).toBe('discover.swipe.resetNow');
  });

  it('formats hours and minutes', () => {
    expect(formatResetTime(7320, t)).toBe(
      'discover.swipe.resetHoursMinutes:{"h":2,"m":2}',
    );
  });

  it('switches to whole days past 24 hours instead of printing "170 sa"', () => {
    expect(formatResetTime(170 * 3600, t)).toBe(
      'discover.swipe.resetDays:{"d":8}',
    );
  });

  it('rounds days up so the promise is never early', () => {
    expect(formatResetTime(25 * 3600, t)).toBe(
      'discover.swipe.resetDays:{"d":2}',
    );
  });

  it('keeps hours for the final day', () => {
    expect(formatResetTime(24 * 3600, t)).toBe(
      'discover.swipe.resetHoursMinutes:{"h":24,"m":0}',
    );
    expect(formatResetTime(23 * 3600, t)).toBe(
      'discover.swipe.resetHoursMinutes:{"h":23,"m":0}',
    );
  });
});

/**
 * Aynı eşikler, ama fiilsiz metinlerle: bunlar "{{time}} sonra yenilenir"
 * kalıbının içine giriyor. Hazır cümle dönen anahtarlardan (reset*) birine
 * kaymak, ekrana "Renews in Resets in 30d" yazan hatayı geri getirir.
 */
describe('formatResetDuration', () => {
  it('renders nothing for "never resets" or a lapsed countdown', () => {
    expect(formatResetDuration(UNLIMITED, t)).toBeNull();
    expect(formatResetDuration(0, t)).toBeNull();
    expect(formatResetDuration(null, t)).toBeNull();
  });

  it('uses verb-free keys so the wrapper supplies the verb', () => {
    expect(formatResetDuration(30 * 24 * 3600, t)).toBe(
      'discover.swipe.durationDays:{"d":30}',
    );
    expect(formatResetDuration(7320, t)).toBe(
      'discover.swipe.durationHoursMinutes:{"h":2,"m":2}',
    );
    expect(formatResetDuration(120, t)).toBe(
      'discover.swipe.durationMinutes:{"m":2}',
    );
    expect(formatResetDuration(30, t)).toBe(
      'discover.swipe.durationSeconds:{"sec":30}',
    );
  });

  it('rounds days up like formatResetTime so the promise is never early', () => {
    expect(formatResetDuration(25 * 3600, t)).toBe(
      'discover.swipe.durationDays:{"d":2}',
    );
  });
});
