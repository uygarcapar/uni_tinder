import React from 'react';
import { render } from '@testing-library/react-native';
import DateSeparator, {
  dateLabel,
  withDateSeparators,
} from '@/features/chat/components/DateSeparator';

describe('DateSeparator component', () => {
  it('renders the provided label', () => {
    const { getByText } = render(<DateSeparator label="Bugün" />);
    expect(getByText('Bugün')).toBeTruthy();
  });

  it('renders nothing when label is missing', () => {
    const { toJSON } = render(<DateSeparator label={null} />);
    expect(toJSON()).toBeNull();
  });
});

describe('dateLabel', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns empty string for missing input', () => {
    expect(dateLabel(null)).toBe('');
    expect(dateLabel(undefined)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(dateLabel('not-a-date')).toBe('');
  });

  it('returns "Bugün" for today', () => {
    expect(dateLabel('2026-06-20T08:00:00Z')).toBe('Bugün');
  });

  it('returns "Dün" for yesterday', () => {
    expect(dateLabel('2026-06-19T08:00:00Z')).toBe('Dün');
  });

  it('returns weekday name for dates within the last week', () => {
    const label = dateLabel('2026-06-16T08:00:00Z');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
    expect(['Bugün', 'Dün']).not.toContain(label);
  });

  it('returns "<day> <TR-month>" for same year, older than a week', () => {
    expect(dateLabel('2026-03-10T08:00:00Z')).toBe('10 Mar');
  });

  it('includes the year for dates in a previous year', () => {
    expect(dateLabel('2024-12-31T08:00:00Z')).toBe('31 Ara 2024');
  });

  // Regresyon: backend damgaları Z soneki olmadan gelebiliyor (kontrat §8.3).
  // Çıplak `new Date` bunları YEREL saat sayıp TR'de 3 saat geriye kaydırıyordu →
  // gece yarısından sonraki mesajlar "Bugün" yerine "Dün" ayracına düşüyordu.
  it('Z soneki olmayan damgayı Z\'li ile AYNI şekilde etiketler', () => {
    expect(dateLabel('2026-06-20T12:00:00')).toBe(dateLabel('2026-06-20T12:00:00Z'));
    expect(dateLabel('2026-06-19T12:00:00')).toBe(dateLabel('2026-06-19T12:00:00Z'));
    expect(dateLabel('2026-06-20T12:00:00')).toBe('Bugün');
  });
});

describe('withDateSeparators', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('returns empty array for empty/null input', () => {
    expect(withDateSeparators(null)).toEqual([]);
    expect(withDateSeparators([])).toEqual([]);
  });

  it('inserts one separator for a single message', () => {
    const result = withDateSeparators([
      { id: 'm1', sentAt: '2026-06-20T10:00:00Z' },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].__separator).toBe(true);
    expect(result[0].label).toBe('Bugün');
    expect(result[1].id).toBe('m1');
  });

  it('inserts a separator at day boundary (chronological list)', () => {
    // Kronolojik: index 0 dünki, index 1 bugünkü — her günün ilk mesajının
    // ÖNÜNE separator gelir. Mid-UTC saatleri seçildi ki yerel TZ'lerde gün
    // ofseti yaşanmasın.
    const result = withDateSeparators([
      { id: 'yesterday', sentAt: '2026-06-19T12:00:00Z' },
      { id: 'today', sentAt: '2026-06-20T12:00:00Z' },
    ]);
    expect(
      result.map((r: any) => (r.__separator ? '__sep' : r.id))
    ).toEqual(['__sep', 'yesterday', '__sep', 'today']);
    expect(result[0].label).toBe('Dün');
    expect(result[2].label).toBe('Bugün');
  });

  // Regresyon: optimistic mesaj yerel `toISOString()` (Z'li), server kopyası
  // Z'siz geliyordu — aynı gündeki iki mesaj farklı günlere düşüp listede iki
  // ayrı ayraç grubu üretiyordu.
  it('Z\'li ve Z\'siz damgalar aynı gündeyse tek separator üretir', () => {
    const result = withDateSeparators([
      { id: 'server', sentAt: '2026-06-20T11:00:00' },
      { id: 'optimistic', sentAt: '2026-06-20T12:00:00Z' },
    ]);
    expect(result.map((r: any) => (r.__separator ? '__sep' : r.id))).toEqual([
      '__sep',
      'server',
      'optimistic',
    ]);
  });

  it('does not insert a separator between messages on the same day', () => {
    const result = withDateSeparators([
      { id: 'a', sentAt: '2026-06-20T08:00:00Z' },
      { id: 'b', sentAt: '2026-06-20T12:00:00Z' },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].__separator).toBe(true);
    expect(result[1].id).toBe('a');
    expect(result[2].id).toBe('b');
  });
});
