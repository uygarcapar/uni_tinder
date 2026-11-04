/**
 * showMessageToast — çapraz-mod etiket kararı + tap'te mod devri.
 *
 * İki sözleşme test ediliyor:
 * 1. ETİKET: konuşmanın modu (`mode`) geçerliyse ve o anki seçili moddan
 *    farklıysa `componentProps.modeLabel` mod başlığı anahtarından çözülür;
 *    aynı modda ya da mod boş/çöpse etiket yok (`undefined` ≠ Dating kuralı).
 * 2. DEVİR: tap (`onPress`) navigate'ten ÖNCE `writeAppMode` çağırır — etiket
 *    görünsün görünmesin (toast ekrandayken kullanıcı mod değiştirirse tap
 *    yine olayın moduna indirmeli). Mod geçersizse devir HİÇ yapılmaz.
 */

jest.mock('react-native-notifier', () => ({
  Notifier: { showNotification: jest.fn(), hideNotification: jest.fn() },
}));
jest.mock('@/shared/services/navigationRef', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));
jest.mock('@/features/discover/useAppMode', () => ({
  readAppModeFor: jest.fn(() => 'Dating'),
  writeAppMode: jest.fn(() => true),
}));
// toaster.ts i18n'i DEFAULT import ile alıyor → __esModule + default şart.
// t(k) = k: etiketin DOĞRU ANAHTARDAN çözüldüğü asıl iddia.
jest.mock('@/shared/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

import { Notifier } from 'react-native-notifier';
import { navigationRef } from '@/shared/services/navigationRef';
import { readAppModeFor, writeAppMode } from '@/features/discover/useAppMode';
import { showMessageToast } from '@/shared/services/toaster';

const lastCall = () =>
  (Notifier.showNotification as jest.Mock).mock.calls.at(-1)![0];

const baseArg = {
  senderName: 'Ayşe',
  preview: 'selam',
  conversationId: 'c1',
  partnerUserId: 'p1',
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  (readAppModeFor as jest.Mock).mockReturnValue('Dating');
});

it('çapraz modda modeLabel mod başlığı anahtarından gelir, tap devir+navigate yapar', () => {
  showMessageToast({ ...baseArg, mode: 'Friends', selfUserId: 'u1' });

  const call = lastCall();
  expect(call.componentProps.modeLabel).toBe('discover.mode.title.Friends');

  call.onPress();
  expect(writeAppMode).toHaveBeenCalledWith('u1', 'Friends');
  expect(navigationRef.navigate).toHaveBeenCalledWith(
    'Chat',
    expect.objectContaining({ conversationId: 'c1' }),
  );
  // Devir navigate'ten ÖNCE: ekran mod olayını navigate anında taze bulsun.
  const writeOrder = (writeAppMode as jest.Mock).mock.invocationCallOrder[0];
  const navOrder = (navigationRef.navigate as jest.Mock).mock.invocationCallOrder[0];
  expect(writeOrder).toBeLessThan(navOrder);
});

it('aynı moddayken etiket yok ama tap yine writeAppMode çağırır', () => {
  (readAppModeFor as jest.Mock).mockReturnValue('Friends');
  showMessageToast({ ...baseArg, mode: 'Friends', selfUserId: 'u1' });

  expect(lastCall().componentProps.modeLabel).toBeFalsy();

  lastCall().onPress();
  expect(writeAppMode).toHaveBeenCalledWith('u1', 'Friends');
  expect(navigationRef.navigate).toHaveBeenCalled();
});

it('mode boş ya da çöpse etiket de devir de yok', () => {
  showMessageToast({ ...baseArg, selfUserId: 'u1' });
  expect(lastCall().componentProps.modeLabel).toBeFalsy();
  lastCall().onPress();

  showMessageToast({ ...baseArg, mode: 'Bestie', selfUserId: 'u1' });
  expect(lastCall().componentProps.modeLabel).toBeFalsy();
  lastCall().onPress();

  expect(writeAppMode).not.toHaveBeenCalled();
  expect(navigationRef.navigate).toHaveBeenCalledTimes(2);
});
