/**
 * Kart gizliliğinin FE tarafı.
 *
 * Backend gizliliği sunucuda uyguluyor (ham veri DTO'dan siliniyor), ama `age`
 * ve `distance` DTO'da **non-nullable int** olduğu için "gizli" durumu `null`
 * ile değil **`0` ile** anlatılıyor. Bu testler o sözleşmeyi kilitliyor: bir
 * gün biri `age != null` / `?? null` kontrolüne geri dönerse kartta ", 0"
 * yazacağını burada yakalasın.
 */

const mockGet = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...args: any[]) => mockGet(...args), post: jest.fn() },
}));

import { resolveCardAge } from '@/features/discover/cardPrivacy';
import { fetchMissedMatches } from '@/features/discover/missedMatchRecovery';

describe('resolveCardAge', () => {
  it('gerçek yaşı olduğu gibi döndürür', () => {
    expect(resolveCardAge({ age: 21, showAge: true })).toBe(21);
  });

  it('bayrak gelmeyen sürümde de gerçek yaşı döndürür', () => {
    expect(resolveCardAge({ age: 21 })).toBe(21);
  });

  it('`age: 0`ı gizli sayar — "0" basılmamalı', () => {
    expect(resolveCardAge({ age: 0, showAge: false })).toBeNull();
  });

  it('bayrak tek başına da eler (yaş dolu gelse bile)', () => {
    expect(resolveCardAge({ age: 21, showAge: false })).toBeNull();
  });

  it('`0` bayraksız geldiğinde de eler — tek sinyal sayı olabilir', () => {
    expect(resolveCardAge({ age: 0 })).toBeNull();
  });

  it('eksik/boş girdide çökmez', () => {
    expect(resolveCardAge(null)).toBeNull();
    expect(resolveCardAge(undefined)).toBeNull();
    expect(resolveCardAge({})).toBeNull();
    expect(resolveCardAge({ age: null })).toBeNull();
  });

  it('negatif ve sayı olmayan değerleri eler', () => {
    expect(resolveCardAge({ age: -3 })).toBeNull();
    expect(resolveCardAge({ age: Number.NaN })).toBeNull();
    expect(resolveCardAge({ age: 'yirmi' as any })).toBeNull();
  });

  it('sayısal string gelirse çözer (gevşek wire tipleri)', () => {
    expect(resolveCardAge({ age: '21' as any })).toBe(21);
  });
});

describe('kaçırılan eşleşmeler — gizli yaş normalizasyonu', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('`age: 0` gelen profili `null`a çevirir', async () => {
    mockGet.mockResolvedValueOnce({
      isSuccess: true,
      result: {
        profiles: [
          {
            profileId: 'p1',
            userId: 'u1',
            displayName: 'Gizli',
            age: 0,
            showAge: false,
            photos: ['a.jpg'],
          },
          {
            profileId: 'p2',
            userId: 'u2',
            displayName: 'Açık',
            age: 23,
            showAge: true,
            photos: ['b.jpg'],
          },
        ],
        totalProfiles: 2,
        currentPage: 1,
        hasNextPage: false,
      },
    });

    const page = await fetchMissedMatches();

    expect(page.profiles[0].age).toBeNull();
    expect(page.profiles[1].age).toBe(23);
  });
});
