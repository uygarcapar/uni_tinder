jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/shared/components/AppModal');
jest.mock('@gorhom/bottom-sheet', () => {
  const RN = require('react-native');
  return { BottomSheetTextInput: RN.TextInput };
});
jest.mock('@/shared/hooks/useKeyboardAwareField', () => ({
  useKeyboardAwareField: () => ({
    anchorRef: { current: null },
    onFocus: jest.fn(),
    onBlur: jest.fn(),
  }),
}));

const mockReportUser = jest.fn();
const mockBlockUser = jest.fn();
jest.mock('@/shared/services/moderationService', () => ({
  __esModule: true,
  default: {
    reportUser: (...args: any[]) => mockReportUser(...args),
    blockUser: (...args: any[]) => mockBlockUser(...args),
  },
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

/**
 * v1.5: şikayet ARTIK zorunlu engelleme yapmıyor — "bildirmek istiyorum ama
 * iletişimi kesmek istemiyorum" mümkün. İki kritik sözleşme:
 *
 *  1. `alsoBlock` HER ZAMAN açıkça gönderilir. Varsayılan uca göre değişiyor
 *     (/api/swipe/Report true, /api/moderation/report false) — alanı düşürmek
 *     aynı gövdeyi iki uçta farklı sonuca sürüklerdi.
 *  2. Şikayet kaydedilip engelleme DÜŞEBİLİR (`blocked:false`). "Engelledik"
 *     deyip engellememek en kötü hata → kullanıcıya tekrar deneme sunulur.
 */

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

const submitWithReason = async (tree: any) => {
  fireEvent.press(tree.getByText('Taciz / Hakaret'));
  await act(async () => {
    fireEvent.press(tree.getByTestId('report-submit'));
  });
};

beforeEach(() => {
  mockReportUser.mockReset();
  mockBlockUser.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('ReportModal — alsoBlock kutusu', () => {
  it('kutu işaretli gelir ve alsoBlock:true gönderilir', async () => {
    mockReportUser.mockResolvedValue({ reportId: 'r1', blocked: true });
    const tree = setup();

    expect(tree.getByText('Bu kişiyi engelle')).toBeTruthy();
    await submitWithReason(tree);

    await waitFor(() => expect(mockReportUser).toHaveBeenCalledTimes(1));
    expect(mockReportUser.mock.calls[0][0]).toMatchObject({ alsoBlock: true });
  });

  it('kutu kaldırılınca alsoBlock:false gönderilir (engelleme YOK)', async () => {
    mockReportUser.mockResolvedValue({ reportId: 'r1', blocked: false });
    const tree = setup();

    fireEvent.press(tree.getByText('Bu kişiyi engelle'));
    await submitWithReason(tree);

    await waitFor(() => expect(mockReportUser).toHaveBeenCalledTimes(1));
    expect(mockReportUser.mock.calls[0][0]).toMatchObject({ alsoBlock: false });
    // Engelleme istenmedi → "engelleme başarısız" uyarısı da çıkmamalı.
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toBe(
      'Ekibimiz en kısa sürede inceleyecek. Güvende kalman önemli.',
    );
  });
});

describe('ReportModal — engelleme düşerse', () => {
  it('tekrar deneme sunar ve onaylanınca blockUser çağırır', async () => {
    mockReportUser.mockResolvedValue({ reportId: 'r1', blocked: false });
    mockBlockUser.mockResolvedValue(undefined);
    const onSuccess = jest.fn();
    const tree = setup({ onSuccess });

    await submitWithReason(tree);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const [, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toBe(
      'Şikayetin alındı ama engelleme tamamlanamadı. Tekrar denemek ister misin?',
    );

    const retry = buttons[1];
    await act(async () => {
      await retry.onPress();
    });

    expect(mockBlockUser).toHaveBeenCalledWith('user-1');
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: true }),
    );
  });

  it('engelleme başarılıysa onSuccess blocked:true ile çağrılır', async () => {
    mockReportUser.mockResolvedValue({ reportId: 'r1', blocked: true });
    const onSuccess = jest.fn();
    const tree = setup({ onSuccess });

    await submitWithReason(tree);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const okBtn = (Alert.alert as jest.Mock).mock.calls[0][2][0];
    await act(async () => {
      okBtn.onPress();
    });

    expect(mockBlockUser).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ blocked: true }),
    );
  });
});
