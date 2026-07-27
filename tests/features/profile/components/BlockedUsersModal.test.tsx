jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@/shared/components/AppModal');

const mockGetBlockedUsers = jest.fn();
const mockUnblockUser = jest.fn();
jest.mock('@/shared/services/moderationService', () => ({
  __esModule: true,
  default: {
    getBlockedUsers: (...a: any[]) => mockGetBlockedUsers(...a),
    unblockUser: (...a: any[]) => mockUnblockUser(...a),
  },
}));

import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import BlockedUsersModal from '@/features/profile/components/BlockedUsersModal';

const USER = {
  userId: 'u-1',
  displayName: 'Ramiz',
  age: 23,
  university: 'Bilgi Üniversitesi',
  photoUrl: 'https://x/p.jpg',
  blockedAt: '2026-07-24T10:00:00Z',
};

const setup = (overrides: any = {}) =>
  render(<BlockedUsersModal visible onClose={jest.fn()} {...overrides} />);

beforeEach(() => {
  mockGetBlockedUsers.mockReset();
  mockUnblockUser.mockReset();
  mockGetBlockedUsers.mockResolvedValue([USER]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('BlockedUsersModal', () => {
  it('does not fetch while hidden', async () => {
    setup({ visible: false });
    await act(async () => {});
    expect(mockGetBlockedUsers).not.toHaveBeenCalled();
  });

  it('renders a card per blocked user', async () => {
    const tree = setup();
    await waitFor(() => tree.getByText('Ramiz'));
    expect(tree.getByText('23 · Bilgi Üniversitesi')).toBeTruthy();
    expect(tree.getByText('24 Temmuz 2026 tarihinde engellendi')).toBeTruthy();
  });

  it('shows the empty state when nobody is blocked', async () => {
    mockGetBlockedUsers.mockResolvedValue([]);
    const tree = setup();
    await waitFor(() => tree.getByText('Kimseyi engellemedin'));
  });

  it('Alerts when the list cannot be loaded', async () => {
    mockGetBlockedUsers.mockRejectedValue(new Error('boom'));
    setup();
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Hata',
        'Engellenenler listesi yüklenemedi.'
      )
    );
  });

  it('confirms before unblocking and removes the row on success', async () => {
    mockUnblockUser.mockResolvedValue(undefined);
    const tree = setup();
    const button = await waitFor(() => tree.getByText('Kaldır'));

    fireEvent.press(button);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toContain('Ramiz');
    expect(buttons.map((b: any) => b.text)).toEqual(['İptal', 'Engeli Kaldır']);

    await act(async () => {
      await buttons[1].onPress();
    });

    expect(mockUnblockUser).toHaveBeenCalledWith('u-1');
    await waitFor(() => expect(tree.queryByText('Ramiz')).toBeNull());
  });

  it('keeps the row and Alerts when unblocking fails', async () => {
    mockUnblockUser.mockRejectedValue(new Error('boom'));
    const tree = setup();
    const button = await waitFor(() => tree.getByText('Kaldır'));

    fireEvent.press(button);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await act(async () => {
      await buttons[1].onPress();
    });

    expect(Alert.alert).toHaveBeenLastCalledWith('Hata', 'Engel kaldırılamadı.');
    expect(tree.getByText('Ramiz')).toBeTruthy();
  });
});
