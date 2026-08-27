import * as Notifications from 'expo-notifications';
import { clearDeliveredNotifications } from '@/features/notifications/pushService';

const dismissAll = Notifications.dismissAllNotificationsAsync as jest.Mock;
const setBadge = Notifications.setBadgeCountAsync as jest.Mock;

beforeEach(() => {
  dismissAll.mockClear().mockResolvedValue(undefined);
  setBadge.mockClear().mockResolvedValue(true);
});

describe('clearDeliveredNotifications', () => {
  it('tepsiyi düşürür ve rozeti sıfırlar', async () => {
    await clearDeliveredNotifications();

    expect(dismissAll).toHaveBeenCalledTimes(1);
    expect(setBadge).toHaveBeenCalledWith(0);
  });

  // Çağrı yerleri (AppState handler, cold start efekti, logout thunk'ı) await
  // etmiyor — reject ederse unhandled rejection olur.
  it('native yüzey patlarsa reject ETMEZ', async () => {
    dismissAll.mockRejectedValue(new Error('no permission'));
    setBadge.mockRejectedValue(new Error('unsupported launcher'));

    await expect(clearDeliveredNotifications()).resolves.toBeUndefined();
  });

  it('rozet sıfırlama desteklenmese bile tepsi temizliği denenir', async () => {
    setBadge.mockRejectedValue(new Error('unsupported launcher'));

    await clearDeliveredNotifications();

    expect(dismissAll).toHaveBeenCalledTimes(1);
  });
});
