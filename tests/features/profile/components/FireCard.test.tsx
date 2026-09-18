jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('@/features/discover/components/FirePurchaseModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible }: any) =>
      visible ? React.createElement(View, { testID: 'fire-sheet' }) : null,
  };
});

let mockStats: any = null;
const mockRefetch = jest.fn();
jest.mock('@/features/discover/swipeQueries', () => ({
  useSwipeStats: () => ({
    data: mockStats,
    isError: false,
    dataUpdatedAt: Date.now(),
    refetch: mockRefetch,
  }),
}));

let mockReduxPremium = false;
jest.mock('@/shared/hooks/redux', () => ({
  useAppSelector: (selector: any) =>
    selector({
      subscription: { isPremium: mockReduxPremium, expiresAt: null },
      auth: { user: { userId: 'u1' } },
    }),
}));

import { render, fireEvent } from '@testing-library/react-native';
import FireCard from '@/features/profile/components/FireCard';
import tr from '@/shared/i18n/translations/tr';

// Backend /Stats cevabının test için gereken alt kümesi.
const baseStats = {
  serverIsPremium: false,
  isPremium: false,
  remainingSwipes: 12,
  dailySwipeLimit: 30,
  superLikesRemaining: 2,
  weeklySuperLikeLimit: 1,
  purchasedSuperLikes: 1,
  quotaSuperLikesRemaining: 1,
};

const card = tr.profile.fireCard;

describe('FireCard', () => {
  beforeEach(() => {
    mockStats = { ...baseStats };
    mockReduxPremium = false;
    mockRefetch.mockClear();
  });

  it('kalan Fire sayısını alt satırda gösterir', () => {
    const { getByText } = render(<FireCard />);
    expect(
      getByText(card.subtitleCount.replace('{{count}}', '2')),
    ).toBeTruthy();
  });

  it('bakiye 0 iken "hakkın kalmadı" der', () => {
    mockStats = { ...baseStats, superLikesRemaining: 0 };
    const { getByText } = render(<FireCard />);
    expect(getByText(card.subtitleEmpty)).toBeTruthy();
  });

  it('bakiye null geldiğinde sayı UYDURMAZ', () => {
    mockStats = { ...baseStats, superLikesRemaining: null };
    const { getByText } = render(<FireCard />);
    expect(getByText(card.subtitleUnknown)).toBeTruthy();
  });

  it('premium onaylanmadan bakiye için sayı UYDURMAZ', () => {
    // Satın alma alındı (redux premium), /Stats hâlâ free tier cevabı veriyor.
    mockReduxPremium = true;
    mockStats = { ...baseStats, serverIsPremium: false, isPremium: true };
    const { getByText } = render(<FireCard />);
    expect(getByText(card.subtitleUnknown)).toBeTruthy();
  });

  it('karta basınca paket sheet\'ini açar', () => {
    const { getByTestId, queryByTestId } = render(<FireCard />);
    expect(queryByTestId('fire-sheet')).toBeNull();
    fireEvent.press(getByTestId('fire-card'));
    expect(getByTestId('fire-sheet')).toBeTruthy();
  });
});
