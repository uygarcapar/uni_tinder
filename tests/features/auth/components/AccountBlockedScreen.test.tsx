jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import AccountBlockedScreen from '@/features/auth/components/AccountBlockedScreen';
import type { AccountBlockPayload } from '@/shared/utils/accountBlock';

const block = (over: Partial<AccountBlockPayload> = {}): AccountBlockPayload => ({
  errorCode: 'UT-1007',
  reason: 'banned',
  message: 'Hesabın kapatıldı. Sebep: Spam',
  action: null,
  expiresAt: null,
  ...over,
});

describe('AccountBlockedScreen', () => {
  it('renders nothing when there is no sanction', () => {
    const tree = render(<AccountBlockedScreen block={null} onDismiss={jest.fn()} />);
    expect(tree.toJSON()).toBeNull();
  });

  // Gövde metni backend'den gelir: admin'in girdiği gerçek gerekçeyle
  // zenginleştirilmiş hâlde. İstemci kendi metnini yazmaz.
  it('shows the backend reason text under the ban title', () => {
    const tree = render(<AccountBlockedScreen block={block()} onDismiss={jest.fn()} />);

    expect(tree.getByText('Hesabın Kapatıldı')).toBeTruthy();
    expect(tree.getByText('Hesabın kapatıldı. Sebep: Spam')).toBeTruthy();
  });

  it('falls back to a generic body when the backend message is empty', () => {
    const tree = render(
      <AccountBlockedScreen block={block({ message: '' })} onDismiss={jest.fn()} />,
    );
    expect(
      tree.getByText('Hesabın kurallarımızı ihlal ettiği için kalıcı olarak kapatıldı.'),
    ).toBeTruthy();
  });

  it('titles a suspension separately and shows its end date', () => {
    const tree = render(
      <AccountBlockedScreen
        block={block({
          errorCode: 'UT-1008',
          reason: 'suspended',
          message: 'Hesabın askıya alındı. Sebep: Spam',
          expiresAt: '2026-08-18T12:00:00Z',
        })}
        onDismiss={jest.fn()}
      />,
    );

    expect(tree.getByText('Hesabın Askıda')).toBeTruthy();
    expect(tree.getByText('Askı bitişi: 18 Ağustos 2026')).toBeTruthy();
  });

  it('titles the deletion grace period and labels its date as permanent deletion', () => {
    const tree = render(
      <AccountBlockedScreen
        block={block({
          errorCode: 'UT-1009',
          reason: 'account_deleted',
          expiresAt: '2026-09-10T12:00:00Z',
        })}
        onDismiss={jest.fn()}
      />,
    );

    expect(tree.getByText('Hesap Silme Sürecinde')).toBeTruthy();
    expect(tree.getByText('Kalıcı silinme: 10 Eylül 2026')).toBeTruthy();
  });

  // Ban'de "giriş ekranına dön" YOK: kullanıcı tekrar deneyip yine 403 yer.
  // Askıda var, çünkü süre dolunca gerçekten girebilecek.
  it('offers the way back to sign-in only for suspensions', () => {
    const banned = render(<AccountBlockedScreen block={block()} onDismiss={jest.fn()} />);
    expect(banned.queryByText('Giriş ekranına dön')).toBeNull();

    const onDismiss = jest.fn();
    const suspended = render(
      <AccountBlockedScreen
        block={block({ errorCode: 'UT-1008', reason: 'suspended' })}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(suspended.getByText('Giriş ekranına dön'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('prefers the backend-supplied button label over the default', () => {
    const tree = render(
      <AccountBlockedScreen block={block({ action: 'İtiraz Et' })} onDismiss={jest.fn()} />,
    );

    expect(tree.queryByText("Destek'e Yaz")).toBeNull();
    expect(tree.getByText('İtiraz Et')).toBeTruthy();
  });

  it('opens a support mail carrying the sanction code', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const tree = render(<AccountBlockedScreen block={block()} onDismiss={jest.fn()} />);

    fireEvent.press(tree.getByText("Destek'e Yaz"));

    expect(openURL).toHaveBeenCalledWith(
      `mailto:destek@lit.com?subject=${encodeURIComponent('Hesap itirazı (UT-1007)')}`,
    );
    openURL.mockRestore();
  });
});
