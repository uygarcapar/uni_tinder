jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@/shared/components/AppBottomSheet');
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
  };
});

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...a: any[]) => mockApi.get(...a), post: (...a: any[]) => mockApi.post(...a) },
}));
jest.mock('@/shared/constants/api', () => ({
  API_ENDPOINTS: {
    PRIVACY_MY_DATA: '/privacy/my-data',
    PRIVACY_DELETE_ACCOUNT: '/privacy/delete',
  },
}));

const mockGetNotificationPreferences = jest.fn();
const mockUpdateNotificationPreferences = jest.fn();
jest.mock('@/features/chat/chatService', () => ({
  __esModule: true,
  default: {
    getNotificationPreferences: (...a: any[]) =>
      mockGetNotificationPreferences(...a),
    updateNotificationPreferences: (...a: any[]) =>
      mockUpdateNotificationPreferences(...a),
  },
}));

import { Alert, Linking, Switch, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import SettingsModal from '@/features/profile/components/SettingsModal';

const setup = (overrides: any = {}) =>
  render(<SettingsModal visible onClose={jest.fn()} {...overrides} />);

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockGetNotificationPreferences.mockReset();
  mockUpdateNotificationPreferences.mockReset();
  mockGetNotificationPreferences.mockResolvedValue({
    showReadReceipts: true,
    skipPushWhenOnline: false,
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openURL').mockImplementation(() => Promise.resolve(true));
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
  (Linking.openURL as jest.Mock).mockRestore();
  jest.useRealTimers();
});

describe('SettingsModal — render', () => {
  it('renders nothing when visible=false', async () => {
    const tree = setup({ visible: false });
    await act(async () => {});
    expect(tree.queryByText('Ayarlar')).toBeNull();
  });

  it('renders section headers and action labels when visible', async () => {
    const tree = setup();
    await act(async () => {});
    expect(tree.getByText('Ayarlar')).toBeTruthy();
    expect(tree.getByText('Mesajlaşma')).toBeTruthy();
    expect(tree.getByText('Gizlilik')).toBeTruthy();
    expect(tree.getByText('Hesap')).toBeTruthy();
    expect(tree.getByText('Verilerimi İndir')).toBeTruthy();
    expect(tree.getByText('Hesabı Sil')).toBeTruthy();
  });

  it('calls onClose when the X header button is pressed', async () => {
    const onClose = jest.fn();
    const tree = setup({ onClose });
    await act(async () => {});
    fireEvent.press(tree.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsModal — notification preferences', () => {
  it('disables switches until preferences are loaded', () => {
    mockGetNotificationPreferences.mockReturnValue(new Promise(() => {}));
    const tree = setup();
    tree.UNSAFE_getAllByType(Switch).forEach((s) => {
      expect(s.props.disabled).toBe(true);
    });
  });

  it('reflects fetched preferences in the switches', async () => {
    mockGetNotificationPreferences.mockResolvedValue({
      showReadReceipts: false,
      skipPushWhenOnline: true,
    });
    const tree = setup();
    await waitFor(() => {
      const [readReceipts, skipPush] = tree.UNSAFE_getAllByType(Switch);
      expect(readReceipts.props.value).toBe(false);
      expect(skipPush.props.value).toBe(true);
    });
  });

  it('optimistically flips the switch and persists the new prefs', async () => {
    mockUpdateNotificationPreferences.mockResolvedValue({});
    const tree = setup();
    const [readReceipts] = await waitFor(() => tree.UNSAFE_getAllByType(Switch));

    await act(async () => {
      readReceipts.props.onValueChange();
    });

    expect(mockUpdateNotificationPreferences).toHaveBeenCalledWith({
      showReadReceipts: false,
      skipPushWhenOnline: false,
    });
  });

  it('rolls back the switch and Alerts when persistence fails', async () => {
    mockUpdateNotificationPreferences.mockRejectedValue(new Error('boom'));
    const tree = setup();
    const [readReceipts] = await waitFor(() => tree.UNSAFE_getAllByType(Switch));

    await act(async () => {
      readReceipts.props.onValueChange();
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Hata');

    const [readReceiptsAfter] = tree.UNSAFE_getAllByType(Switch);
    expect(readReceiptsAfter.props.value).toBe(true);
  });
});

describe('SettingsModal — data download', () => {
  it('Alerts and skips polling when initial request returns isSuccess=false', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: false, message: 'Yetki yok' });
    const tree = setup();
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });

    expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Yetki yok');
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('opens the file URL when polling reports "completed"', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 'req-1' } });
    mockApi.get.mockResolvedValue({
      result: { status: 'completed', fileUrl: 'https://x/file.zip' },
    });

    const tree = setup();
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    // Flush the polling promise chain.
    await act(async () => {});

    expect(mockApi.get).toHaveBeenCalledWith('/privacy/my-data/req-1');
    expect(Linking.openURL).toHaveBeenCalledWith('https://x/file.zip');
  });

  it('Alerts when polling reports "failed"', async () => {
    jest.useFakeTimers();
    mockApi.post.mockResolvedValue({ isSuccess: true, result: { requestId: 'req-1' } });
    mockApi.get.mockResolvedValue({ result: { status: 'failed' } });

    const tree = setup();
    await waitFor(() => tree.getByText('Verilerimi İndir'));

    await act(async () => {
      fireEvent.press(tree.getByText('Verilerimi İndir'));
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await act(async () => {});

    expect(Alert.alert).toHaveBeenCalledWith(
      'Hata',
      'Veri hazırlanamadı, tekrar dene.'
    );
  });
});

describe('SettingsModal — account deletion', () => {
  it('opens a destructive confirmation Alert before deleting', async () => {
    const tree = setup();
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: any) => b.text)).toEqual(['İptal', 'Devam Et']);
    expect(buttons[1].style).toBe('destructive');
  });

  it('calls the delete endpoint after destructive confirmation', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const tree = setup();
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];

    await act(async () => {
      await destructive.onPress();
    });

    expect(mockApi.post).toHaveBeenCalledWith('/privacy/delete', {});
    expect(
      (Alert.alert as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Hesap Silme Başlatıldı'
      )
    ).toBe(true);
  });

  it('closes the modal when user taps OK on the success Alert', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: true });
    const onClose = jest.fn();
    const tree = setup({ onClose });
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    await act(async () => {
      await destructive.onPress();
    });

    const successCall = (Alert.alert as jest.Mock).mock.calls.find(
      (c) => c[0] === 'Hesap Silme Başlatıldı'
    );
    successCall[2][0].onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the server message when delete fails', async () => {
    mockApi.post.mockResolvedValue({ isSuccess: false, message: 'Yapamazsın' });
    const tree = setup();
    await waitFor(() => tree.getByText('Hesabı Sil'));

    fireEvent.press(tree.getByText('Hesabı Sil'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    await act(async () => {
      await destructive.onPress();
    });

    expect(
      (Alert.alert as jest.Mock).mock.calls.some(
        (c) => c[0] === 'Hata' && c[1] === 'Yapamazsın'
      )
    ).toBe(true);
  });
});
