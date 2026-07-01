jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: () => () => null })
);
jest.mock('@/shared/components/AppModal');

import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ConversationOptionsSheet from '@/features/chat/components/ConversationOptionsSheet';

const setup = (overrides: any = {}) =>
  render(
    <ConversationOptionsSheet
      visible
      onClose={jest.fn()}
      onSearch={jest.fn()}
      onUnmatch={jest.fn()}
      onRestore={jest.fn()}
      onReport={jest.fn()}
      onBlock={jest.fn()}
      {...overrides}
    />
  );

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

describe('ConversationOptionsSheet — active conversation', () => {
  it('shows Search and Unmatch actions when isActive', () => {
    const tree = setup({ isActive: true });
    expect(tree.getByText('Sohbette Ara')).toBeTruthy();
    expect(tree.getByText('Eşleşmeyi Kaldır')).toBeTruthy();
  });

  it('always shows Report and Block actions', () => {
    const tree = setup({ isActive: true });
    expect(tree.getByText('Şikayet Et')).toBeTruthy();
    expect(tree.getByText('Kullanıcıyı Engelle')).toBeTruthy();
  });

  it('calls onClose then onSearch when "Sohbette Ara" is pressed', () => {
    const onClose = jest.fn();
    const onSearch = jest.fn();
    const tree = setup({ onClose, onSearch });
    fireEvent.press(tree.getByText('Sohbette Ara'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('calls onClose then onReport when "Şikayet Et" is pressed', () => {
    const onClose = jest.fn();
    const onReport = jest.fn();
    const tree = setup({ onClose, onReport });
    fireEvent.press(tree.getByText('Şikayet Et'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onReport).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationOptionsSheet — destructive confirmations', () => {
  it('opens unmatch confirmation Alert with cancel/destructive buttons', () => {
    const tree = setup();
    fireEvent.press(tree.getByText('Eşleşmeyi Kaldır'));
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    expect(buttons.map((b: any) => b.text)).toEqual(['İptal', 'Kaldır']);
  });

  it('only calls onUnmatch after the destructive button is confirmed', () => {
    const onUnmatch = jest.fn();
    const onClose = jest.fn();
    const tree = setup({ onUnmatch, onClose });
    fireEvent.press(tree.getByText('Eşleşmeyi Kaldır'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    destructive.onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUnmatch).toHaveBeenCalledTimes(1);
  });

  it('opens block confirmation Alert and runs callbacks on confirm', () => {
    const onBlock = jest.fn();
    const onClose = jest.fn();
    const tree = setup({ onBlock, onClose });
    fireEvent.press(tree.getByText('Kullanıcıyı Engelle'));
    const destructive = (Alert.alert as jest.Mock).mock.calls[0][2][1];
    destructive.onPress();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBlock).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationOptionsSheet — inactive variants', () => {
  it('hides Search/Unmatch when isActive=false', () => {
    const tree = setup({ isActive: false });
    expect(tree.queryByText('Sohbette Ara')).toBeNull();
    expect(tree.queryByText('Eşleşmeyi Kaldır')).toBeNull();
  });

  it('shows Restore action only when canRestore=true', () => {
    const tree = setup({ isActive: false, canRestore: true });
    expect(tree.getByText('Eşleşmeyi Geri Al')).toBeTruthy();
  });

  it('shows the expired notice when not active and not restorable', () => {
    const tree = setup({ isActive: false, canRestore: false });
    expect(
      tree.getByText('Bu sohbet sonlandırıldı. Geri alma süresi doldu.')
    ).toBeTruthy();
  });

  it('calls onClose then onRestore when "Eşleşmeyi Geri Al" is pressed', () => {
    const onClose = jest.fn();
    const onRestore = jest.fn();
    const tree = setup({
      isActive: false,
      canRestore: true,
      onClose,
      onRestore,
    });
    fireEvent.press(tree.getByText('Eşleşmeyi Geri Al'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
});
