jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockApi.get(...a), post: (...a: any[]) => mockApi.post(...a) },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: {
    PRIVACY_DELETION_STATUS: '/privacy/deletion-status',
    PRIVACY_CANCEL_DELETION: '/privacy/cancel-deletion',
  },
}));

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DeletionBanner from '@/features/notifications/components/DeletionBanner';

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
});

// GET /api/privacy/deletion-status →
//   { deletionScheduled, requestedAt, scheduledDeletionAt, daysRemaining }
// Banner eskiden isDeletionScheduled/deletionDate okuyordu → hiç render olmuyordu.
describe('DeletionBanner', () => {
  it('renders nothing while deletion is not scheduled', async () => {
    mockApi.get.mockResolvedValue({ result: { deletionScheduled: false } });
    const tree = render(<DeletionBanner />);
    await act(async () => {});
    expect(tree.queryByText('Hesabın silinmek üzere')).toBeNull();
  });

  it('renders the banner with the scheduled date and days remaining', async () => {
    mockApi.get.mockResolvedValue({
      result: {
        deletionScheduled: true,
        scheduledDeletionAt: '2026-08-23T00:00:00Z',
        daysRemaining: 30,
      },
    });
    const tree = render(<DeletionBanner />);

    await waitFor(() => tree.getByText('Hesabın silinmek üzere'));
    expect(
      tree.getByText('23 Ağustos 2026 tarihinde kalıcı olarak silinecek (30 gün kaldı).')
    ).toBeTruthy();
  });

  it('omits the days suffix when daysRemaining is absent', async () => {
    mockApi.get.mockResolvedValue({
      result: { deletionScheduled: true, scheduledDeletionAt: '2026-08-23T00:00:00Z' },
    });
    const tree = render(<DeletionBanner />);

    await waitFor(() => tree.getByText('Hesabın silinmek üzere'));
    expect(
      tree.getByText('23 Ağustos 2026 tarihinde kalıcı olarak silinecek.')
    ).toBeTruthy();
  });

  it('hides the banner after cancel-deletion succeeds', async () => {
    mockApi.get.mockResolvedValue({
      result: { deletionScheduled: true, scheduledDeletionAt: '2026-08-23T00:00:00Z', daysRemaining: 30 },
    });
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const tree = render(<DeletionBanner />);

    const undo = await waitFor(() => tree.getByText('İptal Et'));
    await act(async () => {
      fireEvent.press(undo);
    });

    expect(mockApi.post).toHaveBeenCalledWith('/privacy/cancel-deletion');
    await waitFor(() => expect(tree.queryByText('Hesabın silinmek üzere')).toBeNull());
  });
});
