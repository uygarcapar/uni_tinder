import { toUtcIso, parseUtc, utcTime, normalizeUtcFields } from '@/shared/utils/dateUtc';

describe('toUtcIso', () => {
  it('offset taşımayan date-time değerine Z ekler', () => {
    expect(toUtcIso('2026-08-13T21:03:45.123')).toBe('2026-08-13T21:03:45.123Z');
    expect(toUtcIso('2026-08-13T21:03:45')).toBe('2026-08-13T21:03:45Z');
  });

  it('zaten offset taşıyan değere dokunmaz (idempotent)', () => {
    expect(toUtcIso('2026-08-13T21:03:45.123Z')).toBe('2026-08-13T21:03:45.123Z');
    expect(toUtcIso('2026-08-13T21:03:45+03:00')).toBe('2026-08-13T21:03:45+03:00');
    expect(toUtcIso('2026-08-13T21:03:45-0500')).toBe('2026-08-13T21:03:45-0500');
    expect(toUtcIso(toUtcIso('2026-08-13T21:03:45'))).toBe('2026-08-13T21:03:45Z');
  });

  it('salt tarihe Z EKLEMEZ — negatif offsetli dilimlerde günü kaydırırdı', () => {
    expect(toUtcIso('2003-05-14')).toBe('2003-05-14');
  });

  it('boş/null girdiyi aynen geçirir', () => {
    expect(toUtcIso('')).toBe('');
    expect(toUtcIso(null)).toBeNull();
    expect(toUtcIso(undefined)).toBeUndefined();
  });
});

describe('parseUtc / utcTime', () => {
  it('Z olmadan gelen damgayı UTC olarak okur', () => {
    expect(parseUtc('2026-08-13T21:03:45.000').toISOString()).toBe('2026-08-13T21:03:45.000Z');
    expect(utcTime('2026-08-13T21:03:45.000')).toBe(Date.parse('2026-08-13T21:03:45.000Z'));
  });

  it('geçersiz girdide Invalid Date döner', () => {
    expect(isNaN(parseUtc(null).getTime())).toBe(true);
    expect(isNaN(parseUtc('').getTime())).toBe(true);
    expect(isNaN(utcTime(undefined))).toBe(true);
  });
});

describe('normalizeUtcFields', () => {
  it('bilinen zaman alanlarını iç içe yapılarda normalize eder', () => {
    const page = {
      conversationId: 'c1',
      nextCursor: 'abc==',
      messages: [
        {
          id: 'm1',
          sentAt: '2026-08-13T21:03:45.123',
          readAt: null,
          deliveredAt: '2026-08-13T21:04:00Z',
          reactions: [{ emoji: '❤️', reactedAt: '2026-08-13T21:05:00' }],
        },
      ],
    };
    const out: any = normalizeUtcFields(page);
    expect(out.messages[0].sentAt).toBe('2026-08-13T21:03:45.123Z');
    expect(out.messages[0].readAt).toBeNull();
    expect(out.messages[0].deliveredAt).toBe('2026-08-13T21:04:00Z');
    expect(out.messages[0].reactions[0].reactedAt).toBe('2026-08-13T21:05:00Z');
    expect(out.nextCursor).toBe('abc==');
  });

  it('zaman alanı olmayan metin alanlarına dokunmaz', () => {
    const msg = { id: 'm1', content: '2026-08-13T21:03:45', clientMessageId: 'uuid' };
    expect(normalizeUtcFields(msg)).toBe(msg);
  });

  it('değişiklik yoksa GİRDİ REFERANSINI korur (reconcile merge buna dayanıyor)', () => {
    const msg = { id: 'm1', sentAt: '2026-08-13T21:03:45Z', reactions: [] };
    expect(normalizeUtcFields(msg)).toBe(msg);

    const list = [msg];
    expect(normalizeUtcFields(list)).toBe(list);
  });

  it('dizi/obje olmayan girdide çakılmaz', () => {
    expect(normalizeUtcFields(null)).toBeNull();
    expect(normalizeUtcFields(undefined)).toBeUndefined();
    expect(normalizeUtcFields('x')).toBe('x');
  });
});
