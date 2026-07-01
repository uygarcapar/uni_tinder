import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DeletionBanner from '@/features/notifications/components/DeletionBanner';
import api from '@/shared/services/api';

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: {
    PRIVACY_DELETION_STATUS: '/privacy/status',
    PRIVACY_CANCEL_DELETION: '/privacy/cancel',
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('DeletionBanner', () => {
  it('renders nothing while the status request is pending', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { toJSON } = render(<DeletionBanner />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when account is not scheduled for deletion', async () => {
    mockGet.mockResolvedValue({ result: { isDeletionScheduled: false } });
    const tree = render(<DeletionBanner />);
    await act(async () => {});
    expect(tree.toJSON()).toBeNull();
  });

  it('renders the warning when a deletion is scheduled', async () => {
    mockGet.mockResolvedValue({
      result: {
        isDeletionScheduled: true,
        deletionDate: '2026-07-15T00:00:00Z',
      },
    });
    const tree = render(<DeletionBanner />);
    await waitFor(() => {
      expect(tree.getByText('Hesabın silinmek üzere')).toBeTruthy();
    });
    expect(
      tree.getByText(/tarihinde kalıcı olarak silinecek\./)
    ).toBeTruthy();
  });

  it('omits the date sentence when no deletionDate is returned', async () => {
    mockGet.mockResolvedValue({
      result: { isDeletionScheduled: true, deletionDate: null },
    });
    const tree = render(<DeletionBanner />);
    await waitFor(() => {
      expect(tree.getByText('Hesabın silinmek üzere')).toBeTruthy();
    });
    expect(tree.queryByText(/tarihinde kalıcı olarak silinecek\./)).toBeNull();
  });

  it('hides the banner after the user cancels deletion', async () => {
    mockGet.mockResolvedValue({
      result: {
        isDeletionScheduled: true,
        deletionDate: '2026-07-15T00:00:00Z',
      },
    });
    mockPost.mockResolvedValue({});
    const tree = render(<DeletionBanner />);
    await waitFor(() => tree.getByText('İptal Et'));

    await act(async () => {
      fireEvent.press(tree.getByText('İptal Et'));
    });

    expect(mockPost).toHaveBeenCalledWith('/privacy/cancel');
    expect(tree.queryByText('Hesabın silinmek üzere')).toBeNull();
  });

  it('stays visible if cancel API call fails', async () => {
    mockGet.mockResolvedValue({
      result: {
        isDeletionScheduled: true,
        deletionDate: '2026-07-15T00:00:00Z',
      },
    });
    mockPost.mockRejectedValue(new Error('boom'));
    const tree = render(<DeletionBanner />);
    await waitFor(() => tree.getByText('İptal Et'));

    await act(async () => {
      fireEvent.press(tree.getByText('İptal Et'));
    });

    expect(tree.getByText('Hesabın silinmek üzere')).toBeTruthy();
  });

  it('silently ignores a failed status fetch', async () => {
    mockGet.mockRejectedValue(new Error('nope'));
    const tree = render(<DeletionBanner />);
    await act(async () => {});
    expect(tree.toJSON()).toBeNull();
  });
});
