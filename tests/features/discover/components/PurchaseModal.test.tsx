jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
// Özellik satırının info sheet'i AppModal üzerinden `@expo/ui/swift-ui`ye
// zincirleniyor; o modül jest ortamında native EventEmitter arıyor. Davranışı
// bu suite'in konusu değil (satırın açtığı sheet, satın alma akışı değil).
jest.mock('@/features/discover/components/PremiumBenefitInfoSheet', () => {
  const React = require('react');
  return { __esModule: true, default: () => React.createElement('View') };
});
jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children, footerComponent }: any) => {
      if (!visible) return null;
      return React.createElement(View, { testID: 'app-bottom-sheet' }, [
        React.createElement(View, { key: 'body' }, children),
        footerComponent
          ? React.createElement(View, { key: 'footer' }, footerComponent({}))
          : null,
      ]);
    },
  };
});
jest.mock('@/shared/components/BlurBottomSheetBackdrop', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetScrollView: ({ children }: any) =>
      React.createElement(View, null, children),
    BottomSheetFooter: ({ children }: any) =>
      React.createElement(View, null, children),
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { FlatList } = require('react-native');
  return { FlatList };
});

const mockDispatch = jest.fn();
let mockIsPremium = false;
jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({ subscription: { isPremium: mockIsPremium } }),
}));

const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockCheckIntroEligibility = jest.fn();
jest.mock('@/features/profile/subscriptionService', () => ({
  getOfferings: (...a: any[]) => mockGetOfferings(...a),
  purchasePackage: (...a: any[]) => mockPurchasePackage(...a),
  restorePurchases: (...a: any[]) => mockRestorePurchases(...a),
  checkIntroEligibility: (...a: any[]) => mockCheckIntroEligibility(...a),
}));

jest.mock('@/features/profile/subscriptionSlice', () => ({
  fetchSubscriptionStatus: jest.fn(() => ({ type: 'sub/fetch' })),
  setPremium: jest.fn((p: any) => ({ type: 'sub/setPremium', payload: p })),
  markPremiumPurchasePending: jest.fn((p: any) => ({
    type: 'sub/markPending',
    payload: p,
  })),
  syncSubscriptionWithRetry: jest.fn((p: any) => ({
    type: 'sub/syncRetry',
    payload: p,
  })),
  selectIsPremium: (state: any) => !!state?.subscription?.isPremium,
}));

const mockApi = { get: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockApi.get(...a) },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: { SUBSCRIPTION_PLANS: '/subscription/plans' },
}));

const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));
jest.mock('@/features/discover/swipeQueries', () => ({
  swipeKeys: {
    stats: ['swipe', 'stats'],
    filters: ['swipe', 'filters'],
    matches: ['swipe', 'matches'],
  },
}));

import { ActivityIndicator, Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PurchaseModal from '@/features/discover/components/PurchaseModal';
import i18n from '@/shared/i18n';
import {
  PREMIUM_BENEFIT_KEYS,
  premiumBenefitLabelKey,
} from '@/features/profile/premiumBenefits';

const monthlyOffering = {
  monthly: {
    product: {
      identifier: 'monthly_sub',
      priceString: '₺49.99',
      price: 49.99,
      currencyCode: 'TRY',
      // Trial CTA'sı yalnızca RC introPrice tanımlıysa gösterilir (fallback yok).
      introPrice: { periodNumberOfUnits: 3, periodUnit: 'DAY', price: 0 },
    },
  },
};

const setup = (overrides: any = {}) =>
  render(
    <PurchaseModal
      visible
      onClose={jest.fn()}
      onSuccess={jest.fn()}
      {...overrides}
    />
  );

beforeEach(() => {
  mockDispatch.mockReset();
  // syncSubscriptionWithRetry dispatch'i thunk gibi .unwrap() edilir.
  mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ synced: false }) });
  mockIsPremium = false;
  mockGetOfferings.mockReset();
  mockPurchasePackage.mockReset();
  mockRestorePurchases.mockReset();
  // Varsayılan: kullanıcı denemeye hak kazanıyor. Deneme metni artık ürünün
  // introPrice'ına DEĞİL, bu sorguya bağlı.
  mockCheckIntroEligibility.mockReset();
  mockCheckIntroEligibility.mockResolvedValue({ monthly_sub: true });
  mockApi.get.mockReset();
  mockSetQueryData.mockClear();
  mockInvalidateQueries.mockClear();
  mockApi.get.mockResolvedValue({ result: { plans: [] } });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('PurchaseModal — render & loading', () => {
  it('renders an ActivityIndicator in the footer while offering loads', async () => {
    mockGetOfferings.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    await act(async () => {});
    expect(tree.UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('shows the subscribe CTA with price after offering loads', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => {
      expect(tree.getByText(/Ücretsiz Dene/)).toBeTruthy();
    });
  });

  // Regresyon: özellik satırları başlıksız çıkmıştı. Liste tek kaynaktan
  // (`PREMIUM_BENEFIT_KEYS`) geliyor ve paywall TAMAMINI göstermeli — upsell
  // kartı ilk dördünü gösterip "daha fazlası" dediği için burada eksik madde
  // doğrudan karşılanmayan bir vaat demek.
  it('lists every premium benefit by name', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));
    for (const key of PREMIUM_BENEFIT_KEYS) {
      const label = i18n.t(premiumBenefitLabelKey(key));
      expect(label).not.toContain('premium.benefits');
      expect(tree.getByText(label)).toBeTruthy();
    }
  });

  it('renders the standard headline and restore link', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));
    expect(tree.getByText('Satın alımları geri yükle')).toBeTruthy();
    expect(tree.getByText('lit shop')).toBeTruthy();
  });

  // Regresyon: sheet fetch bitmeden kapanırsa (yavaş ağ + kullanıcı kapatır)
  // eskiden sonuç atılıyor, loading true'da kilitleniyor ve tek-atışlık latch
  // yüzünden bir daha hiç denenmiyordu → o ekran mount'u boyunca sonsuz spinner.
  it('stays usable when the first fetch resolves after the sheet was closed', async () => {
    let resolveOffering: (v: any) => void = () => {};
    mockGetOfferings.mockReturnValueOnce(
      new Promise((res) => {
        resolveOffering = res;
      })
    );
    const onClose = jest.fn();
    const tree = render(<PurchaseModal visible onClose={onClose} />);
    await act(async () => {});

    tree.rerender(<PurchaseModal visible={false} onClose={onClose} />);
    await act(async () => {
      resolveOffering(monthlyOffering);
    });

    tree.rerender(<PurchaseModal visible onClose={onClose} />);
    await waitFor(() => {
      expect(tree.getByText(/Ücretsiz Dene/)).toBeTruthy();
    });
  });

  // Regresyon: `introPrice` ÜRÜNE ait statik alan — App Store Connect'te deneme
  // tanımlıysa denemesini yakmış kullanıcıda da dolu geliyor. Eskiden paywall
  // yalnız ona bakıyordu ve herkese "3 Gün Ücretsiz Dene" vaat ediyordu; Apple
  // ise ineligible kullanıcıdan ilk gün tam ücreti çekiyor.
  it('falls back to the price CTA when the user is not trial-eligible', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockCheckIntroEligibility.mockResolvedValue({ monthly_sub: false });
    const tree = setup();
    await waitFor(() => tree.getByText(/Abone Ol/));
    expect(mockCheckIntroEligibility).toHaveBeenCalledWith(['monthly_sub']);
    expect(tree.queryByText(/Ücretsiz Dene/)).toBeNull();
    // Kart üzerindeki deneme açıklaması da düşmeli.
    expect(tree.queryByText(/gün ücretsiz kullanabilirsin/)).toBeNull();
  });

  // Eligibility cevabı gelmeden deneme metni GÖSTERİLMEZ: aksi halde ineligible
  // kullanıcıda bir kare "ücretsiz" yanıp sönerdi.
  it('does not promise a trial while eligibility is still pending', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockCheckIntroEligibility.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    await waitFor(() => tree.getByText(/Abone Ol/));
    expect(tree.queryByText(/Ücretsiz Dene/)).toBeNull();
  });

  it('shows "Hesap Zaten Lit Plus" when user is already premium', async () => {
    mockIsPremium = true;
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => {
      expect(tree.getByText('Hesap Zaten Lit Plus')).toBeTruthy();
    });
  });
});

describe('PurchaseModal — purchase flow', () => {
  it('disables the CTA when no plan is available (no purchase attempted)', async () => {
    // Boş offering → plans=[], selectedPlan=undefined → CTA disabled.
    mockGetOfferings.mockResolvedValue({});
    const tree = setup();
    await waitFor(() => tree.getByText(/Abone Ol/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Abone Ol/));
    });
    expect(mockPurchasePackage).not.toHaveBeenCalled();
  });

  it('runs the success flow: purchase → setPremium → onSuccess → close → syncRetry', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    // Sync başarılı → premium-scoped query'ler invalidate edilir.
    mockDispatch.mockReturnValue({ unwrap: () => Promise.resolve({ synced: true }) });
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    const tree = setup({ onClose, onSuccess });
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(mockPurchasePackage).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    expect(mockSetQueryData).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['swipe', 'stats'],
      });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does NOT invalidate premium-scoped queries while sync is still pending', async () => {
    // synced:false → optimistic patch korunur; invalidate hemen ÇALIŞMAZ
    // (refetch free stats çekip patch'i ezerdi — bkz. refetchPremiumScoped).
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(mockSetQueryData).toHaveBeenCalled();
    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });

  it('completes the flow even when the entitlement has not propagated yet', async () => {
    // RC satın almayı kabul etti ama `customerInfo` entitlement'ı henüz
    // taşımıyor (sandbox'ta olağan). Para ALINDI: akış eskiden burada sessizce
    // ölüyordu — ne sync, ne uyarı, ne kurtarma kaydı. Artık normal başarı
    // yolundan devam ediyor, doğruluk kaynağı backend `/sync`.
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: false });
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    const tree = setup({ onClose, onSuccess });
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('writes the persistent recovery record before syncing', async () => {
    // Kayıt sync'ten ÖNCE yazılmalı: app arada öldürülürse satın alma yalnızca
    // bu kayıtla kurtarılabiliyor (reload optimistic bayrağı siliyor).
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue({ hasEntitlement: true });
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    const types = mockDispatch.mock.calls.map((c: any[]) => c[0]?.type);
    expect(types).toContain('sub/markPending');
    expect(types.indexOf('sub/markPending')).toBeLessThan(
      types.indexOf('sub/syncRetry')
    );
  });

  it('Alerts on purchase error', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockRejectedValue({ message: 'IAP fail' });
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Satın Alma Hatası', 'IAP fail');
  });

  it('does NOT Alert when the user cancels the purchase', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockRejectedValue({ userCancelled: true });
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('PurchaseModal — restore flow', () => {
  it('promotes to premium and closes when restore returns true', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockResolvedValue(true);
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    const tree = setup({ onClose, onSuccess });
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    // Restore da webhook gecikmesine karşı retry'lı sync kullanır (düz fetch değil).
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/syncRetry' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows "Bulunamadı" Alert when restore reports no active subscription', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockResolvedValue(false);
    const tree = setup();
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Bulunamadı',
      'Aktif bir abonelik bulunamadı.'
    );
  });

  it('shows "Hata" Alert when restore throws', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockRestorePurchases.mockRejectedValue({ message: 'Sunucu' });
    const tree = setup();
    await waitFor(() => tree.getByText('Satın alımları geri yükle'));

    await act(async () => {
      fireEvent.press(tree.getByText('Satın alımları geri yükle'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Sunucu');
  });
});
