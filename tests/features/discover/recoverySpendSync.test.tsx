/**
 * 2026-08-24 bug'ının regresyon testi: **kurtarma hakkı azalmıyor.**
 *
 * Kök neden `/Stats`'ın `staleTime: Infinity` + `refetchOnMount:false` ile
 * oturumda BİR KEZ çekilmesiydi. Kurtarma başarı dalı yalnız `setQueryData`
 * yazıyordu, yani ekrandaki sayı oturum başındaki değerin yerel bir türevi
 * olarak kalıyor ve backend'e bir daha hiç sorulmuyordu — "bir sonraki
 * tazeleme doğrusunu getirir" varsayımı boşa çıkıyordu.
 *
 * Kilitlenen sözleşme: iyimser düşüş VE kanonik tazeleme, ikisi birlikte.
 */

// jest.setup.ts'in reanimated mock'u gerçek index'i çekip worklets'in native
// tarafını arıyor (swipeStatsPremium.test'teki aynı not). Bu hook'un
// animasyonla işi yok.
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
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...args: any[]) => mockGet(...args) },
}));

// react-redux ESM-only build ile geliyor (bkz. swipeStatsPremium.test).
// `useSwipeStats` yalnız premium bayrağını okuyor; sabit free state yeterli.
jest.mock('react-redux', () => ({
  useSelector: (fn: any) =>
    fn({ subscription: { isPremium: false, statusResolvedAt: 1 } }),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { swipeKeys } from '@/features/discover/swipeKeys';
import {
  useSwipeStats,
  useSyncRecoverySpend,
} from '@/features/discover/swipeQueries';

/** Premium aylık: tier kotası 2, satın alınmış 10 kredi → toplam 12. */
const statsBody = (over: Record<string, unknown> = {}) => ({
  isSuccess: true,
  result: {
    isPremium: true,
    remainingMissedMatchRecovery: 12,
    quotaRecoveryRemaining: 2,
    purchasedRecoveries: 10,
    dailyMissedMatchRecoveryLimit: 2,
    ...over,
  },
});

const makeClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const wrapperFor = (qc: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

beforeEach(() => {
  mockGet.mockReset();
});

describe('useSyncRecoverySpend', () => {
  it('iyimser düşüşten SONRA backend’e tekrar sorar (bug’ın kendisi)', async () => {
    const qc = makeClient();
    const wrapper = wrapperFor(qc);
    mockGet.mockResolvedValueOnce(statsBody());

    const stats = renderHook(() => useSwipeStats(), { wrapper });
    await waitFor(() =>
      expect(stats.result.current.data?.remainingMissedMatchRecovery).toBe(12),
    );
    expect(mockGet).toHaveBeenCalledTimes(1);

    // Backend kurtarmayı işledi: kotadan düştü.
    mockGet.mockResolvedValueOnce(
      statsBody({ remainingMissedMatchRecovery: 11, quotaRecoveryRemaining: 1 }),
    );

    const sync = renderHook(() => useSyncRecoverySpend(), { wrapper });
    await act(async () => {
      await sync.result.current();
    });

    // İkinci istek ŞART: `staleTime: Infinity` altında bunu tetikleyen başka
    // hiçbir şey yok.
    expect(mockGet).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(stats.result.current.data?.remainingMissedMatchRecovery).toBe(11),
    );
  });

  it('ağ turu beklemeden sayıyı düşürür ve kotayı/krediyi tutarlı bırakır', async () => {
    const qc = makeClient();
    const wrapper = wrapperFor(qc);
    mockGet.mockResolvedValueOnce(statsBody());

    const stats = renderHook(() => useSwipeStats(), { wrapper });
    await waitFor(() =>
      expect(stats.result.current.data?.remainingMissedMatchRecovery).toBe(12),
    );

    // Refetch'i ASKIDA tut: görülen değer YALNIZ iyimser yamadan gelsin.
    // Promise test sonunda serbest bırakılıyor — sonsuza kadar bekleyen bir
    // istek jest'in çıkmasını engelliyor (açık handle).
    let release!: (v: unknown) => void;
    mockGet.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; }),
    );

    const sync = renderHook(() => useSyncRecoverySpend(), { wrapper });
    act(() => {
      sync.result.current();
    });

    const cached: any = qc.getQueryData(swipeKeys.stats);
    expect(cached.remainingMissedMatchRecovery).toBe(11);
    // Backend önce kotadan harcıyor — yalnız toplamı düşürmek üçlüyü
    // tutarsız bırakırdı (11 ≠ 2 + 10).
    expect(cached.quotaRecoveryRemaining).toBe(1);
    expect(cached.purchasedRecoveries).toBe(10);

    await act(async () => {
      release(statsBody({ remainingMissedMatchRecovery: 11 }));
    });
  });

  it('bayat sıfır bakiye tazelemeyi ENGELLEMEZ', async () => {
    // Eski kod `rem > 0` ile guard'lıyordu: cache bayat şekilde 0 ise düşüş de
    // atlanıyor, tazeleme de olmuyordu → ekran sonsuza kadar yanlış kalıyordu.
    const qc = makeClient();
    const wrapper = wrapperFor(qc);
    mockGet.mockResolvedValueOnce(
      statsBody({
        remainingMissedMatchRecovery: 0,
        quotaRecoveryRemaining: 0,
        purchasedRecoveries: 0,
      }),
    );

    const stats = renderHook(() => useSwipeStats(), { wrapper });
    await waitFor(() =>
      expect(stats.result.current.data?.remainingMissedMatchRecovery).toBe(0),
    );

    mockGet.mockResolvedValueOnce(
      statsBody({ remainingMissedMatchRecovery: 4, quotaRecoveryRemaining: 4 }),
    );
    const sync = renderHook(() => useSyncRecoverySpend(), { wrapper });
    await act(async () => {
      await sync.result.current();
    });

    expect(mockGet).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(stats.result.current.data?.remainingMissedMatchRecovery).toBe(4),
    );
  });

  it('cache henüz yokken çökmez, yine de fetch tetikler', async () => {
    const qc = makeClient();
    const wrapper = wrapperFor(qc);
    mockGet.mockResolvedValue(statsBody());

    const sync = renderHook(() => useSyncRecoverySpend(), { wrapper });
    await act(async () => {
      await sync.result.current();
    });

    expect(qc.getQueryData(swipeKeys.stats)).toBeUndefined();
  });
});

describe('useSwipeStats — kurtarma alanları', () => {
  it('quotaRecoveryRemaining ve purchasedRecoveries okunur', async () => {
    const qc = makeClient();
    mockGet.mockResolvedValue(statsBody());

    const { result } = renderHook(() => useSwipeStats(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data).toMatchObject({
      remainingMissedMatchRecovery: 12,
      quotaRecoveryRemaining: 2,
      purchasedRecoveries: 10,
      dailyMissedMatchRecoveryLimit: 2,
    });
  });

  it('alanları göndermeyen backend sürümünde null kalır (0 uydurulmaz)', async () => {
    const qc = makeClient();
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: { isPremium: false, remainingMissedMatchRecovery: 3 },
    });

    const { result } = renderHook(() => useSwipeStats(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.quotaRecoveryRemaining).toBeNull();
    expect(result.current.data?.purchasedRecoveries).toBeNull();
  });
});
