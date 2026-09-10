/**
 * Davet sheet'i + profildeki ilerleme satırı (ReferralProgressRow).
 *
 * Suite dört hâli kilitliyor: ilerleme + sıradaki ödül, merdivenin sonu,
 * pasif kod, katılanlar listesi. Kopyala/paylaş da buradan çalışıyor.
 * Satır: başlık + sayı (2 / 3), basınca callback, veri yokken görünmez.
 */

const mockShare = jest.fn();
jest.mock('react-native/Libraries/Share/Share', () => ({
  __esModule: true,
  default: { share: (...a: any[]) => mockShare(...a) },
}));

const mockShowInfoToast = jest.fn();
jest.mock('@/shared/services/toaster', () => ({
  showInfoToast: (...a: any[]) => mockShowInfoToast(...a),
}));

let mockSummary: any = null;
jest.mock('@/features/profile/referralQueries', () => ({
  useReferralSummary: () => ({ data: mockSummary }),
}));

jest.mock('@/shared/components/AppBottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, children }: any) =>
      visible ? React.createElement(View, null, children) : null,
  };
});
jest.mock('@gorhom/bottom-sheet', () => {
  const { ScrollView } = require('react-native');
  return { BottomSheetScrollView: ScrollView };
});

import * as Clipboard from 'expo-clipboard';
import { act, fireEvent, render } from '@testing-library/react-native';
import ReferralSheet, {
  ReferralProgressRow,
} from '@/features/profile/components/ReferralSheet';
import tr from '@/shared/i18n/translations/tr';

const copy = tr.referral;

const SUMMARY = {
  code: 'AK7M2',
  codeDisabled: false,
  qualifiedCount: 2,
  inviteesPerTier: 3,
  currentTier: 0,
  nextTier: { tier: 1, type: 'VisibilityFilter', amount: 30, progress: 2, needed: 3 },
  visibilityGrant: { expiresAt: null, pausedDays: null },
  invitees: [
    { firstName: 'Mert', status: 'Qualified', joinedAt: '2026-09-10T12:00:00Z' },
    { firstName: 'Deniz', status: 'Rejected', joinedAt: '2026-09-11T12:00:00Z' },
  ],
  rewards: [],
};

beforeEach(() => {
  mockSummary = SUMMARY;
  mockShare.mockReset();
  mockShowInfoToast.mockReset();
});

const setup = () => render(<ReferralSheet visible onClose={jest.fn()} />);

it('kodu, ilerlemeyi ve sıradaki ödülü yazıyor', () => {
  const tree = setup();
  expect(tree.getByTestId('referral-sheet-code').props.children).toBe('AK7M2');
  expect(tree.getByText('2 / 3 arkadaş katıldı')).toBeTruthy();
  expect(tree.getByText('Sıradaki ödül: Görünürlük filtresi · 30 gün')).toBeTruthy();
});

it('merdiven bitince "yeni ödüller yakında"', () => {
  mockSummary = { ...SUMMARY, nextTier: null };
  const tree = setup();
  expect(tree.getByText(copy.card.comingSoon)).toBeTruthy();
  expect(tree.queryByText(/arkadaş katıldı/)).toBeNull();
});

it('pasif kodda eylemler kapalı ve açıklama var', () => {
  mockSummary = { ...SUMMARY, codeDisabled: true };
  const tree = setup();
  expect(tree.getByText(copy.card.disabled)).toBeTruthy();
  expect(tree.getByTestId('referral-sheet-share').props.accessibilityState?.disabled).toBe(true);
});

it('katılanları ilk ad + durumla listeliyor', () => {
  const tree = setup();
  expect(tree.getByText('Mert')).toBeTruthy();
  expect(tree.getByText('Deniz')).toBeTruthy();
  expect(tree.getByText(copy.sheet.statusQualified)).toBeTruthy();
  expect(tree.getByText(copy.sheet.statusRejected)).toBeTruthy();
});

it('kopyala panoya yazıp toast gösteriyor', async () => {
  const spy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
  const tree = setup();
  await act(async () => {
    fireEvent.press(tree.getByTestId('referral-sheet-copy'));
  });
  expect(spy).toHaveBeenCalledWith('AK7M2');
  expect(mockShowInfoToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: copy.copied }),
  );
  spy.mockRestore();
});

it('paylaş kodu ve linki taşıyor', async () => {
  const tree = setup();
  await act(async () => {
    fireEvent.press(tree.getByTestId('referral-sheet-share'));
  });
  expect(mockShare).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('AK7M2') }),
  );
});

it('veri yokken çökmüyor', () => {
  mockSummary = null;
  const tree = setup();
  expect(tree.getByText(copy.sheet.title)).toBeTruthy();
});

describe('ReferralProgressRow', () => {
  it('başlık + sayıyı yazıyor, alt başlık YOK, basınca callback çağırıyor', () => {
    const onPress = jest.fn();
    const tree = render(<ReferralProgressRow onPress={onPress} />);
    expect(tree.getByText(copy.sheet.title)).toBeTruthy();
    expect(tree.getByText('2 / 3')).toBeTruthy();
    // Sıradaki ödül metni sheet'in işi, satırda tekrarlanmıyor.
    expect(tree.queryByText(/Sıradaki ödül/)).toBeNull();
    fireEvent.press(tree.getByTestId('referral-progress-row'));
    expect(onPress).toHaveBeenCalled();
  });

  it('merdiven bitince toplam sayı', () => {
    mockSummary = { ...SUMMARY, nextTier: null };
    const tree = render(<ReferralProgressRow onPress={jest.fn()} />);
    expect(tree.getByText('2')).toBeTruthy();
  });

  it('veri yokken hiç çizilmiyor', () => {
    mockSummary = null;
    const tree = render(<ReferralProgressRow onPress={jest.fn()} />);
    expect(tree.queryByTestId('referral-progress-row')).toBeNull();
  });
});
