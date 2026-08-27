/**
 * Mesafe filtresi sözleşmesi (2026-08-21 sınırlar + 2026-08-22 anahtar).
 *
 * İki şey test ediliyor ve ikisi de sessizce bozulabilir:
 *
 * 1. Slider sınırları BACKEND'DEN (`/api/swipe/Filters` →
 *    min/maxSelectableDistanceKm). Birinin bu alanları görmezden gelip tier
 *    sabitlerine geri dönmesi test edilmezse fark edilmez: sabitler bugün
 *    doğru değerleri taşıyor, yarın sunucu config'i değişince yalan söylemeye
 *    başlar.
 *
 * 2. "Mesafe sınırı olmasın" anahtarı KALICI ve TEK ALANLIK yazılıyor. Tek
 *    seferlik `?expandRadius=true` akışı kaldırıldı. En kritik nokta: anahtarı
 *    yazan istek DİĞER filtreleri taşımamalı — bu ekranda çoğu alan OVERWRITE
 *    semantiğinde (boş dizi = tercihi temizle), yani dolu bir payload
 *    kullanıcının hobilerini/üniversitelerini sessizce silerdi.
 */
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {},
  makeMutable: (v: any) => ({ value: v }),
  useSharedValue: (v: any) => ({ value: v }),
  useAnimatedStyle: (fn: any) => fn(),
  withTiming: (v: any) => v,
  runOnJS: (fn: any) => fn,
}));

const mockGet = jest.fn();
const mockPut = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockGet(...args),
    put: (...args: any[]) => mockPut(...args),
  },
}));

jest.mock('react-redux', () => ({
  useSelector: () => false,
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSetIgnoreDistanceFilter,
  swipeKeys,
} from '@/features/discover/swipeQueries';
import swipeService from '@/features/discover/swipeService';
import {
  DISTANCE_RANGE_KM,
  FREE_MAX_DISTANCE_KM,
  PREMIUM_MAX_DISTANCE_KM,
  resolveDistanceBounds,
} from '@/shared/constants/limits';

describe('resolveDistanceBounds', () => {
  it('sınırları backend yanıtından alır (tier sabitlerini DEĞİL)', () => {
    // Sunucu config'i değişmiş senaryosu: FE sabitleri 75/150 derken backend
    // 30/90 diyor. Kazanan backend olmalı, yoksa slider erişilemeyen bir
    // aralık çizer ve kaydedilen değer sessizce kırpılır.
    expect(
      resolveDistanceBounds(
        { minSelectableDistanceKm: 30, maxSelectableDistanceKm: 90 },
        false,
      ),
    ).toEqual({ minKm: 30, maxKm: 90 });
  });

  it('alanlar yoksa tier sabitlerine düşer', () => {
    expect(resolveDistanceBounds({}, false)).toEqual({
      minKm: DISTANCE_RANGE_KM.min,
      maxKm: FREE_MAX_DISTANCE_KM,
    });
    expect(resolveDistanceBounds(undefined, true)).toEqual({
      minKm: DISTANCE_RANGE_KM.min,
      maxKm: PREMIUM_MAX_DISTANCE_KM,
    });
  });

  it('yalnız tavanı gelen yanıtta tabanı sabitten tamamlar', () => {
    // Kısmi yanıt (yeni alanlardan biri eklenmiş, diğeri değil) tüm slider'ı
    // NaN'a düşürmemeli.
    expect(
      resolveDistanceBounds({ maxSelectableDistanceKm: 150 }, true),
    ).toEqual({ minKm: DISTANCE_RANGE_KM.min, maxKm: 150 });
  });

  it('ters aralıkta tavanı tabanın altına düşürmez', () => {
    // Bozuk config: tavan < taban. Aralık tersine dönerse slider hiçbir değeri
    // kabul edemez, kullanıcı mesafesini HİÇ değiştiremez.
    const { minKm, maxKm } = resolveDistanceBounds(
      { minSelectableDistanceKm: 80, maxSelectableDistanceKm: 20 },
      false,
    );
    expect(minKm).toBe(80);
    expect(maxKm).toBe(80);
  });

  it('geçersiz/sıfır değerleri yok sayar', () => {
    // `0` eski "sınırsız" sentinel'iydi; taban olarak alınırsa slider 0 km'ye
    // inebilir hale gelir ve backend 400 döner.
    expect(
      resolveDistanceBounds(
        { minSelectableDistanceKm: 0, maxSelectableDistanceKm: null },
        false,
      ),
    ).toEqual({ minKm: DISTANCE_RANGE_KM.min, maxKm: FREE_MAX_DISTANCE_KM });
  });
});

const wrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return Wrapper;
};

describe('deste isteği', () => {
  beforeEach(() => mockGet.mockReset());

  it('expandRadius param’ı GÖNDERMEZ', async () => {
    // Kaldırılan akışın kalıntısı: backend param'ı yok sayıyor, yani geri
    // eklenirse hiçbir şey patlamaz — sadece kullanıcı hiçbir şey olmamış gibi
    // aynı boş desteye bakar. Testin tek işi o sessiz gerilemeyi yakalamak.
    mockGet.mockResolvedValue({ isSuccess: true, result: { profiles: [] } });
    await swipeService.getPotentialMatches(null, 1, 50);
    expect(mockGet.mock.calls[0][0]).not.toContain('expandRadius');
  });

  it('yeni şeffaflık alanlarını taşır, uydurmaz', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: {
        profiles: [{ userId: 'u1' }],
        distanceFilterIgnored: true,
        appliedRadiusKm: null,
      },
    });
    const page = await swipeService.getPotentialMatches(null, 1, 50);
    expect(page.distanceFilterIgnored).toBe(true);
    // Anahtar açıkken yarıçap SINIRSIZ demek — `null` burada "bilinmiyor"
    // değil, "yok". İkisini ayıran nöbetçi `distanceFilterIgnored`.
    expect(page.appliedRadiusKm).toBeNull();

    // Alanları hiç göndermeyen backend'de "sınır kapalı" varsayılmamalı:
    // kullanıcıya yanlış bilgi verir ve boş destede tek çözüm butonunu gizler.
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: { profiles: [], hasNextPage: false },
    });
    const legacy = await swipeService.getPotentialMatches(null, 1, 50);
    expect(legacy.distanceFilterIgnored).toBe(false);
    expect(legacy.appliedRadiusKm).toBeNull();
  });
});

describe('useSetIgnoreDistanceFilter', () => {
  let client: QueryClient;

  beforeEach(() => {
    mockPut.mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const putResponse = (overrides: any = {}) => ({
    isSuccess: true,
    result: { maxDistance: 50, ignoreDistanceFilter: true, ...overrides },
  });

  it('YALNIZCA anahtarı gönderir (diğer filtreleri silmez)', async () => {
    mockPut.mockResolvedValue(putResponse());
    const { result } = renderHook(() => useSetIgnoreDistanceFilter(), {
      wrapper: wrapper(client),
    });

    result.current.mutate(true);
    await waitFor(() => expect(mockPut).toHaveBeenCalled());

    // Payload TAM OLARAK tek alan. Fazladan bir `preferredHobbies: []` bile
    // overwrite semantiğinde kullanıcının seçimini siler.
    expect(mockPut.mock.calls[0][1]).toEqual({ ignoreDistanceFilter: true });
  });

  it('kapatma yönünü de yazar', async () => {
    mockPut.mockResolvedValue(putResponse({ ignoreDistanceFilter: false }));
    const { result } = renderHook(() => useSetIgnoreDistanceFilter(), {
      wrapper: wrapper(client),
    });

    result.current.mutate(false);
    await waitFor(() => expect(mockPut).toHaveBeenCalled());

    expect(mockPut.mock.calls[0][1]).toEqual({ ignoreDistanceFilter: false });
  });

  it('filtre cache’ini MERGE eder ve desteyi tazeler', async () => {
    // PUT yanıtı GET'in tüm alanlarını taşımıyor. Düz replace'te slider
    // sınırları (min/maxSelectableDistanceKm) düşer ve tier sabitlerine geri
    // kayar — yani anahtarı açmak slider'ın tavanını bozar.
    client.setQueryData(swipeKeys.filters, {
      maxDistance: 50,
      minSelectableDistanceKm: 5,
      maxSelectableDistanceKm: 75,
      preferredHobbies: ['Yoga'],
      ignoreDistanceFilter: false,
    });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    mockPut.mockResolvedValue(putResponse());

    const { result } = renderHook(() => useSetIgnoreDistanceFilter(), {
      wrapper: wrapper(client),
    });
    result.current.mutate(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(swipeKeys.filters)).toEqual({
      maxDistance: 50,
      minSelectableDistanceKm: 5,
      maxSelectableDistanceKm: 75,
      preferredHobbies: ['Yoga'],
      ignoreDistanceFilter: true,
    });
    // Anahtar değişince backend Redis havuzunu düşürüyor; bayat desteyi
    // ekranda bırakmamak için invalidate şart.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: swipeKeys.matches });
  });

  it('isSuccess:false yanıtını hata sayar', async () => {
    // 200 + isSuccess:false backend'in bilinen kabuğu. Başarı sanılırsa
    // anahtar açık gösterilir ama sunucuda kapalı kalır.
    mockPut.mockResolvedValue({ isSuccess: false, message: 'olmadı' });
    const { result } = renderHook(() => useSetIgnoreDistanceFilter(), {
      wrapper: wrapper(client),
    });

    result.current.mutate(true);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('olmadı');
  });
});
