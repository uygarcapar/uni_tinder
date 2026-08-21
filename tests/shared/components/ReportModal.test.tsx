jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
// Sheet gövdesi (blur header, gorhom portal) burada test edilmiyor — modal
// artık AppModal üstünde, wrapper mock'lanıp içerik doğrulanıyor.
jest.mock('@/shared/components/AppModal');
jest.mock('@gorhom/bottom-sheet', () => {
  const RN = require('react-native');
  return { BottomSheetTextInput: RN.TextInput };
});
// Klavye takibi bu testin konusu değil; hook reanimated + keyboard-controller
// çekiyor, ikisi de bu suite'te gereksiz.
jest.mock('@/shared/hooks/useKeyboardAwareField', () => ({
  useKeyboardAwareField: () => ({
    anchorRef: { current: null },
    onFocus: jest.fn(),
    onBlur: jest.fn(),
  }),
}));

const mockReportUser = jest.fn();
jest.mock('@/shared/services/moderationService', () => ({
  __esModule: true,
  default: { reportUser: (...args: any[]) => mockReportUser(...args) },
  ReportReason: {
    Spam: 'Spam',
    Harassment: 'Harassment',
    InappropriateContent: 'InappropriateContent',
    FakeProfile: 'FakeProfile',
    Underage: 'Underage',
    Scam: 'Scam',
    Other: 'Other',
  },
}));

import { Alert } from 'react-native';
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
    expect(tree.getByTestId('report-submit')).toBeTruthy();
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
    const submitBtn = tree.getByTestId('report-submit');
    expect(
      submitBtn.props.accessibilityState?.disabled || submitBtn.props.disabled,
    ).toBeTruthy();

    fireEvent.press(tree.getByText('Spam / Reklam'));
    // After selection, the button should be enabled.
    const submitAfter = tree.getByTestId('report-submit');
    const disabledAfter =
      submitAfter.props.accessibilityState?.disabled ??
      submitAfter.props.disabled;
    expect(disabledAfter).toBeFalsy();
  });

  it('does not call moderationService when submitting without a reason', async () => {
    const tree = setup();
    fireEvent.press(tree.getByTestId('report-submit'));
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
      fireEvent.press(tree.getByTestId('report-submit'));
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
      fireEvent.press(tree.getByTestId('report-submit'));
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
      fireEvent.press(tree.getByTestId('report-submit'));
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
      fireEvent.press(tree.getByTestId('report-submit'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe('Hata');
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe('Sunucu hatası');
  });
});

describe('ReportModal — close', () => {
  // Header'da X YOK: sheet swipe-down/backdrop ile kapanıyor. gorhom o noktada
  // dismiss'i zaten yapmış oluyor, wrapper'ın onClose'u parent'a İLETİLMELİ —
  // iletilmezse parent'ın `visible`ı true kalır ve sheet bir daha açılmaz.
  it('propagates the sheet dismiss to the parent onClose', () => {
    const onClose = jest.fn();
    const tree = setup({ onClose });
    fireEvent.press(tree.getByTestId('modal-header-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
