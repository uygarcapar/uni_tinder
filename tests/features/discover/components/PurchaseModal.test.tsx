jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
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
jest.mock('@/features/profile/subscriptionService', () => ({
  getOfferings: (...a: any[]) => mockGetOfferings(...a),
  purchasePackage: (...a: any[]) => mockPurchasePackage(...a),
  restorePurchases: (...a: any[]) => mockRestorePurchases(...a),
}));

jest.mock('@/features/profile/subscriptionSlice', () => ({
  fetchSubscriptionStatus: jest.fn(() => ({ type: 'sub/fetch' })),
  setPremium: jest.fn((p: any) => ({ type: 'sub/setPremium', payload: p })),
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
  swipeKeys: { stats: ['swipe', 'stats'] },
}));

import { ActivityIndicator, Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PurchaseModal from '@/features/discover/components/PurchaseModal';

const monthlyOffering = {
  monthly: {
    product: {
      identifier: 'monthly_sub',
      priceString: '₺49.99',
      price: 49.99,
      currencyCode: 'TRY',
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
  mockIsPremium = false;
  mockGetOfferings.mockReset();
  mockPurchasePackage.mockReset();
  mockRestorePurchases.mockReset();
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

  it('renders the standard headline and restore link', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    const tree = setup();
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));
    expect(tree.getByText('Satın alımları geri yükle')).toBeTruthy();
    expect(tree.getByText('lit shop')).toBeTruthy();
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
    mockPurchasePackage.mockResolvedValue(true);
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
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['swipe', 'stats'],
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does NOT setPremium or close when purchasePackage returns false', async () => {
    mockGetOfferings.mockResolvedValue(monthlyOffering);
    mockPurchasePackage.mockResolvedValue(false);
    const onClose = jest.fn();
    const onSuccess = jest.fn();
    const tree = setup({ onClose, onSuccess });
    await waitFor(() => tree.getByText(/Ücretsiz Dene/));

    await act(async () => {
      fireEvent.press(tree.getByText(/Ücretsiz Dene/));
    });

    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/setPremium' })
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
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
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sub/fetch' })
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
