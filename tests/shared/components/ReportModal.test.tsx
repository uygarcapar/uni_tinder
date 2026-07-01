jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

const mockReportUser = jest.fn();
jest.mock('@/shared/services/moderationService', () => ({
  __esModule: true,
  default: { reportUser: (...args: any[]) => mockReportUser(...args) },
  REPORT_REASON_LABELS_TR: {
    Spam: 'Spam / Reklam',
    Harassment: 'Taciz / Hakaret',
    InappropriateContent: 'Müstehcen içerik',
    FakeProfile: 'Sahte profil',
    Underage: 'Yaş altı',
    Scam: 'Dolandırıcılık',
    Other: 'Diğer',
  },
}));

import { Alert, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ReportModal from '@/shared/components/ReportModal';

const setup = (overrides: any = {}) =>
  render(
    <ReportModal
      visible
      onClose={jest.fn()}
      reportedUserId="user-1"
      conversationId="conv-1"
      onSuccess={jest.fn()}
      {...overrides}
    />
  );

beforeEach(() => {
  mockReportUser.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('ReportModal — render', () => {
  it('renders nothing when visible=false', () => {
    const { toJSON } = setup({ visible: false });
    expect(toJSON()).toBeNull();
  });

  it('renders the title and submit button text when visible', () => {
    const tree = setup();
    expect(tree.getByText('Kullanıcıyı Şikayet Et')).toBeTruthy();
    expect(tree.getByText('Şikayet Et')).toBeTruthy();
  });

  it('renders all report reason options', () => {
    const tree = setup();
    [
      'Spam / Reklam',
      'Taciz / Hakaret',
      'Müstehcen içerik',
      'Sahte profil',
      'Yaş altı',
      'Dolandırıcılık',
      'Diğer',
    ].forEach((label) => expect(tree.getByText(label)).toBeTruthy());
  });
});

describe('ReportModal — submit gating', () => {
  it('keeps the submit button disabled until a reason is selected', () => {
    const tree = setup();
    const submitBtn = tree.getByText('Şikayet Et').parent?.parent;
    expect(submitBtn?.props.accessibilityState?.disabled || submitBtn?.props.disabled).toBeTruthy();

    fireEvent.press(tree.getByText('Spam / Reklam'));
    // After selection, the button should be enabled.
    const submitAfter = tree.getByText('Şikayet Et').parent?.parent;
    const disabledAfter =
      submitAfter?.props.accessibilityState?.disabled ??
      submitAfter?.props.disabled;
    expect(disabledAfter).toBeFalsy();
  });

  it('does not call moderationService when submitting without a reason', async () => {
    const tree = setup();
    fireEvent.press(tree.getByText('Şikayet Et'));
    await act(async () => {});
    expect(mockReportUser).not.toHaveBeenCalled();
  });
});

describe('ReportModal — submit flow', () => {
  it('calls moderationService.reportUser with the selected reason on submit', async () => {
    mockReportUser.mockResolvedValue(undefined);
    const tree = setup();

    fireEvent.press(tree.getByText('Taciz / Hakaret'));
    await act(async () => {
      fireEvent.press(tree.getByText('Şikayet Et'));
    });

    await waitFor(() => expect(mockReportUser).toHaveBeenCalledTimes(1));
    expect(mockReportUser).toHaveBeenCalledWith(
      expect.objectContaining({
        reportedUserId: 'user-1',
        reason: 'Harassment',
        conversationId: 'conv-1',
      })
    );
  });

  it('shows the success Alert and calls onSuccess after success confirmation', async () => {
    mockReportUser.mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const onClose = jest.fn();
    const tree = setup({ onSuccess, onClose });

    fireEvent.press(tree.getByText('Spam / Reklam'));
    await act(async () => {
      fireEvent.press(tree.getByText('Şikayet Et'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Şikayet alındı');

    const okBtn = (Alert.alert as jest.Mock).mock.calls[0][2][0];
    await act(async () => {
      okBtn.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows a "duplicate report" Alert for 409 responses', async () => {
    mockReportUser.mockRejectedValue({ response: { status: 409 } });
    const tree = setup();

    fireEvent.press(tree.getByText('Spam / Reklam'));
    await act(async () => {
      fireEvent.press(tree.getByText('Şikayet Et'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Bilgi');
  });

  it('shows the server error message for non-409 failures', async () => {
    mockReportUser.mockRejectedValue({
      response: { data: { message: 'Sunucu hatası' } },
    });
    const tree = setup();

    fireEvent.press(tree.getByText('Spam / Reklam'));
    await act(async () => {
      fireEvent.press(tree.getByText('Şikayet Et'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Hata');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe('Sunucu hatası');
  });
});

describe('ReportModal — close', () => {
  it('calls onClose when the X header button is pressed', () => {
    const onClose = jest.fn();
    const tree = setup({ onClose });
    // İlk TouchableOpacity = header X butonu.
    fireEvent.press(tree.UNSAFE_getAllByType(TouchableOpacity)[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
