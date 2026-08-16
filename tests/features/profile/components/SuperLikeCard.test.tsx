jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('@/features/discover/components/SuperLikePurchaseModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible }: any) =>
      visible ? React.createElement(View, { testID: 'superlike-sheet' }) : null,
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
import SuperLikeCard from '@/features/profile/components/SuperLikeCard';
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

const card = tr.profile.superLikeCard;

describe('SuperLikeCard', () => {
  beforeEach(() => {
    mockStats = { ...baseStats };
    mockReduxPremium = false;
    mockRefetch.mockClear();
  });

  it('kalan süper beğeni sayısını alt satırda gösterir', () => {
    const { getByText } = render(<SuperLikeCard />);
    expect(
      getByText(card.subtitleCount.replace('{{count}}', '2')),
    ).toBeTruthy();
  });

  it('bakiye 0 iken "hakkın kalmadı" der', () => {
    mockStats = { ...baseStats, superLikesRemaining: 0 };
    const { getByText } = render(<SuperLikeCard />);
    expect(getByText(card.subtitleEmpty)).toBeTruthy();
  });

  it('bakiye null geldiğinde sayı UYDURMAZ', () => {
    mockStats = { ...baseStats, superLikesRemaining: null };
    const { getByText } = render(<SuperLikeCard />);
    expect(getByText(card.subtitleUnknown)).toBeTruthy();
  });

  it('premium onaylanmadan bakiye için sayı UYDURMAZ', () => {
    // Satın alma alındı (redux premium), /Stats hâlâ free tier cevabı veriyor.
    mockReduxPremium = true;
    mockStats = { ...baseStats, serverIsPremium: false, isPremium: true };
    const { getByText } = render(<SuperLikeCard />);
    expect(getByText(card.subtitleUnknown)).toBeTruthy();
  });

  it('karta basınca paket sheet\'ini açar', () => {
    const { getByTestId, queryByTestId } = render(<SuperLikeCard />);
    expect(queryByTestId('superlike-sheet')).toBeNull();
    fireEvent.press(getByTestId('superlike-card'));
    expect(getByTestId('superlike-sheet')).toBeTruthy();
  });
});
