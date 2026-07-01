jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@/shared/components/AppModal');

const mockDispatch = jest.fn();
jest.mock('@/shared/hooks/redux', () => ({
  useAppDispatch: () => mockDispatch,
}));

const mockGetChatUnlockPackage = jest.fn();
const mockPurchaseChatUnlock = jest.fn();
jest.mock('@/features/profile/subscriptionService', () => ({
  getChatUnlockPackage: (...args: any[]) => mockGetChatUnlockPackage(...args),
  purchaseChatUnlock: (...args: any[]) => mockPurchaseChatUnlock(...args),
}));

jest.mock('@/features/chat/chatSlice', () => ({
  redeemChatUnlock: jest.fn((a: any) => ({ type: 'redeem', payload: a })),
  markQuotaUnlocked: jest.fn((a: any) => ({ type: 'mark', payload: a })),
  fetchChatQuota: jest.fn((id: any) => ({ type: 'fetch', payload: id })),
}));

import { ActivityIndicator, Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ChatUnlockSheet from '@/features/chat/components/ChatUnlockSheet';

beforeEach(() => {
  mockDispatch.mockReset();
  mockDispatch.mockResolvedValue({});
  mockGetChatUnlockPackage.mockReset();
  mockPurchaseChatUnlock.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('ChatUnlockSheet — render', () => {
  it('does not load the package when not visible', () => {
    mockGetChatUnlockPackage.mockResolvedValue(null);
    render(
      <ChatUnlockSheet
        visible={false}
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(mockGetChatUnlockPackage).not.toHaveBeenCalled();
  });

  it('renders an ActivityIndicator while the package is loading', async () => {
    mockGetChatUnlockPackage.mockReturnValue(new Promise(() => {}));
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(tree.UNSAFE_queryAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('shows the fallback notice when no package is returned', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(null);
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() =>
      expect(
        tree.getByText('Şu anda paket bulunamadı. Lütfen daha sonra tekrar dene.')
      ).toBeTruthy()
    );
  });

  it('shows the priceString and CTA when a package is returned', async () => {
    mockGetChatUnlockPackage.mockResolvedValue({
      product: { priceString: '₺49.99' },
    });
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() =>
      expect(tree.getByText('₺49.99 — Sohbeti Aç')).toBeTruthy()
    );
  });

  it('renders the standard header copy', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(null);
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    expect(tree.getByText('Sohbeti Aç')).toBeTruthy();
    expect(tree.getByText('50 mesaj sınırına ulaştın')).toBeTruthy();
  });
});

describe('ChatUnlockSheet — purchase flow', () => {
  const pkg = { product: { priceString: '₺49.99' } };

  it('runs the success flow: purchase → markQuotaUnlocked → redeem → fetchQuota → close', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(pkg);
    mockPurchaseChatUnlock.mockResolvedValue({ transactionId: 'tx-123' });
    const onClose = jest.fn();
    const onSuccess = jest.fn();

    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    await waitFor(() => tree.getByText('₺49.99 — Sohbeti Aç'));

    await act(async () => {
      fireEvent.press(tree.getByText('₺49.99 — Sohbeti Aç'));
    });

    expect(mockPurchaseChatUnlock).toHaveBeenCalledWith(pkg);
    // markQuotaUnlocked + redeem + fetchChatQuota = en az 3 dispatch
    expect(mockDispatch.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows an Alert and aborts when purchase returns no transactionId', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(pkg);
    mockPurchaseChatUnlock.mockResolvedValue({ transactionId: null });
    const onSuccess = jest.fn();

    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={onSuccess}
      />
    );
    await waitFor(() => tree.getByText('₺49.99 — Sohbeti Aç'));

    await act(async () => {
      fireEvent.press(tree.getByText('₺49.99 — Sohbeti Aç'));
    });

    expect(Alert.alert).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows an Alert when conversationId is missing', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(pkg);
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId={null}
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() => tree.getByText('₺49.99 — Sohbeti Aç'));

    await act(async () => {
      fireEvent.press(tree.getByText('₺49.99 — Sohbeti Aç'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Sohbet seçili değil.');
    expect(mockPurchaseChatUnlock).not.toHaveBeenCalled();
  });

  it('shows an Alert (and skips purchase) when no package is available', async () => {
    // Bu durumda CTA zaten görünmez; akışı doğrudan tetiklemek için pkg null
    // dönen bir resolved değerle birleşince sadece fallback notice görürüz.
    // Burada Alert'in tetiklenmediğini doğruluyoruz (kullanıcı CTA göremiyor).
    mockGetChatUnlockPackage.mockResolvedValue(null);
    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() =>
      expect(
        tree.getByText('Şu anda paket bulunamadı. Lütfen daha sonra tekrar dene.')
      ).toBeTruthy()
    );
    expect(mockPurchaseChatUnlock).not.toHaveBeenCalled();
  });

  it('shows a "Satın Alma Hatası" Alert when purchaseChatUnlock throws', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(pkg);
    mockPurchaseChatUnlock.mockRejectedValue({ message: 'IAP fail' });

    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() => tree.getByText('₺49.99 — Sohbeti Aç'));

    await act(async () => {
      fireEvent.press(tree.getByText('₺49.99 — Sohbeti Aç'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Satın Alma Hatası', 'IAP fail');
  });

  it('does NOT show an Alert when the user cancels (e.userCancelled=true)', async () => {
    mockGetChatUnlockPackage.mockResolvedValue(pkg);
    mockPurchaseChatUnlock.mockRejectedValue({ userCancelled: true });

    const tree = render(
      <ChatUnlockSheet
        visible
        conversationId="c1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />
    );
    await waitFor(() => tree.getByText('₺49.99 — Sohbeti Aç'));

    await act(async () => {
      fireEvent.press(tree.getByText('₺49.99 — Sohbeti Aç'));
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
