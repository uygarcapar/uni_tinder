jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
}));
jest.mock('@/features/discover/components/NotePurchaseModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible }: any) =>
      visible ? React.createElement(View, { testID: 'note-sheet' }) : null,
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
import NoteCard from '@/features/profile/components/NoteCard';
import tr from '@/shared/i18n/translations/tr';

// Backend /Stats cevabının test için gereken alt kümesi.
const baseStats = {
  serverIsPremium: false,
  isPremium: false,
  notesRemaining: 3,
  purchasedNotes: 3,
  quotaNotesRemaining: 0,
  noteMaxLength: 140,
};

const card = tr.profile.noteCard;

describe('NoteCard', () => {
  beforeEach(() => {
    mockStats = { ...baseStats };
    mockReduxPremium = false;
    mockRefetch.mockClear();
  });

  it('kalan not sayısını alt satırda gösterir', () => {
    const { getByText } = render(<NoteCard />);
    expect(getByText(card.subtitleCount.replace('{{count}}', '3'))).toBeTruthy();
  });

  it('bakiye 0 iken "notun bitti" der', () => {
    mockStats = { ...baseStats, notesRemaining: 0 };
    const { getByText } = render(<NoteCard />);
    expect(getByText(card.subtitleEmpty)).toBeTruthy();
  });

  it('bakiye null geldiğinde sayı UYDURMAZ', () => {
    // Uç henüz canlı değil: kart yine çizilir, yerine değer önerisi yazılır.
    mockStats = { ...baseStats, notesRemaining: null };
    const { getByText } = render(<NoteCard />);
    expect(getByText(card.subtitleUnknown)).toBeTruthy();
  });

  it('premium aktivasyonu beklerken not bakiyesini GİZLEMEZ', () => {
    // Not premium'la gelen bir hak DEĞİL — SuperLike kartındaki "webhook
    // inmedi, sayıyı yazma" penceresi buraya uygulanmamalı.
    mockReduxPremium = true;
    mockStats = { ...baseStats, serverIsPremium: false, isPremium: true };
    const { getByText } = render(<NoteCard />);
    expect(getByText(card.subtitleCount.replace('{{count}}', '3'))).toBeTruthy();
  });

  it("karta basınca paket sheet'ini açar", () => {
    const { getByTestId, queryByTestId } = render(<NoteCard />);
    expect(queryByTestId('note-sheet')).toBeNull();
    fireEvent.press(getByTestId('note-card'));
    expect(getByTestId('note-sheet')).toBeTruthy();
  });
});
