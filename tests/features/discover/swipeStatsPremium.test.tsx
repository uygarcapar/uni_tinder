/**
 * `/swipe/stats` oturumda BİR KEZ çekiliyor (`staleTime: Infinity`,
 * `refetchOnMount:false`). Bu yüzden premium bitince o cevap sonsuza kadar
 * "premium" kalıyordu: backtrack hakkı ve filtre kilitleri reload atılana kadar
 * açık duruyor, oysa upsell kartı çoktan düşmüş oluyordu — kullanıcının
 * "biri güncelleniyor, diğerleri güncellenmiyor" dediği tam olarak buydu.
 *
 * Sözleşme: tier'ın kaynağı abonelik slice'ı. Bu sorgu yalnız kota SAYILARININ
 * kaynağı; `serverIsPremium` ise "backend o an ne gördü" bilgisi ve dokunulmadan
 * durur.
 */
// jest.setup.ts'in reanimated mock'u gerçek index'i çekip worklets'in native
// tarafını arıyor ve test ortamında patlıyor (FilterModal.test'teki aynı not).
// Bu sorgunun animasyonla işi yok — iskelet mock yeterli.
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

// react-redux ESM-only build ile geliyor ve transformIgnorePatterns dışında
// (bkz. SettingsModal.test). Store yerine GERÇEK reducer'ı elle sürüyoruz:
// selector'lar da, state şekli de üretimdekinin aynısı. Tek fark, abonelik
// değişiminin re-render'ını `rerender()` ile elle tetiklememiz.
let mockSubState: any;
jest.mock('react-redux', () => ({
  useSelector: (fn: any) => fn({ subscription: mockSubState }),
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import subscriptionReducer, {
  setPremium,
  subscriptionChanged,
} from '@/features/profile/subscriptionSlice';
import { useSwipeStats } from '@/features/discover/swipeQueries';

const UNLIMITED = -1;

const premiumStats = {
  isSuccess: true,
  result: {
    isPremium: true,
    remainingSwipes: UNLIMITED,
    remainingUndos: UNLIMITED,
    dailySwipeLimit: UNLIMITED,
    dailyUndoLimit: UNLIMITED,
  },
};

const freeStats = {
  isSuccess: true,
  result: {
    isPremium: false,
    remainingSwipes: 12,
    remainingUndos: 0,
    dailySwipeLimit: 30,
    dailyUndoLimit: 1,
  },
};

const dispatchToState = (action: any) => {
  mockSubState = subscriptionReducer(mockSubState, action);
};

/** Backend'in kanonik cevabı — `statusResolvedAt`i de kurar. */
const backendSays = (isPremium: boolean) =>
  dispatchToState(
    subscriptionChanged({
      isPremium,
      expiresAt: null,
      status: isPremium ? 'Active' : 'Expired',
      productId: null,
      autoRenewEnabled: false,
      isTrial: false,
      trialEndsAt: null,
      gracePeriodEndsAt: null,
      cancelledAt: null,
      provider: null,
      reason: isPremium ? 'store_purchase' : 'store_expired',
    } as any),
  );

const renderStats = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useSwipeStats(), {
    wrapper: ({ children }: any) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  mockGet.mockReset();
  mockSubState = subscriptionReducer(undefined, { type: '@@INIT' } as any);
});

describe('useSwipeStats — tier overlay', () => {
  it('drops premium when the subscription ended, even though the cached stats still say premium', async () => {
    backendSays(true);
    mockGet.mockResolvedValue(premiumStats);

    const { result, rerender } = renderStats();
    await waitFor(() => expect(result.current.data?.isPremium).toBe(true));

    // Abonelik bitti. `/stats` YENİDEN ÇEKİLMİYOR — eski cevap elde duruyor.
    backendSays(false);
    rerender({});

    expect(result.current.data?.isPremium).toBe(false);
    // "Backend ne gördü" ayrı bir soru; cevabı bozulmadan duruyor.
    expect(result.current.data?.serverIsPremium).toBe(true);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('still promotes a free stats answer right after a purchase', async () => {
    mockGet.mockResolvedValue(freeStats);

    const { result, rerender } = renderStats();
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.isPremium).toBe(false);

    // Satın alma: webhook henüz inmedi, `/stats` hâlâ free tier'ı anlatıyor.
    dispatchToState(setPremium({ isPremium: true, optimistic: true }));
    rerender({});

    expect(result.current.data?.isPremium).toBe(true);
    expect(result.current.data?.remainingSwipes).toBe(UNLIMITED);
    expect(result.current.data?.remainingUndos).toBe(UNLIMITED);
    expect(result.current.data?.serverIsPremium).toBe(false);
  });

  it('trusts the stats answer while the backend has not spoken yet (cold start)', async () => {
    // Slice persist edilmiyor: reload'da premium kullanıcı da `isPremium:false`
    // doğuyor. Bu pencerede elimizdeki tek bilgi sunucunun cevabı.
    mockGet.mockResolvedValue(premiumStats);

    const { result } = renderStats();

    await waitFor(() => expect(result.current.data?.isPremium).toBe(true));
  });
});
