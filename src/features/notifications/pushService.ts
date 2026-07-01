import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api, { getCurrentAccessToken } from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { colors } from '../../shared/theme/colors';

let getActiveConversationId: () => string | null = () => null;
export const setActiveConversationGetter = (fn: (() => string | null) | null) => {
  getActiveConversationId = fn || (() => null);
};

// Foreground'da OS banner gösterme — in-app toaster (react-native-notifier) bunun yerini alır.
// Background normal akar (handler sadece foreground'da çağrılır). Tray'de listeleme + badge
// korunur ki kullanıcı bildirim tepsisinden geçmişe ulaşabilsin.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data || {};
    const incomingConvId = (data as any).relatedEntityId || (data as any).conversationId;
    const activeConv = getActiveConversationId();
    const inActiveChat = incomingConvId && incomingConvId === activeConv;

    return {
      shouldShowBanner: false,
      shouldShowList: !inActiveChat,
      shouldPlaySound: !inActiveChat,
      shouldSetBadge: true,
    };
  },
});

export async function registerForPushNotifications(appVersion = '1.0.0'): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('🔕 Push permission denied');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('unitinder_notifications', {
        name: 'Mesajlar',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.primary,
        sound: 'default',
      });
    }

    const tokenResult = await Notifications.getDevicePushTokenAsync();
    const token = tokenResult?.data;
    if (!token) return null;

    const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';

    await api.post(API_ENDPOINTS.NOTIFICATIONS_DEVICES, { token, platform, appVersion });

    console.log('🔔 Push token registered:', platform, token.substring(0, 12) + '…');
    return token;
  } catch (err: any) {
    console.warn('Push registration failed:', err?.message);
    return null;
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    if (!getCurrentAccessToken()) return;
    const tokenResult = await Notifications.getDevicePushTokenAsync().catch(() => null);
    const token = tokenResult?.data;
    if (!token) return;
    await api.delete(API_ENDPOINTS.NOTIFICATIONS_DEVICE_BY_TOKEN(token)).catch(() => {});
  } catch {}
}

export function onNotificationTap(handler: (data: Record<string, any>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    handler(data as Record<string, any>);
  });
  return () => sub.remove();
}

export function onForegroundNotification(handler: (data: Record<string, any>) => void): () => void {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification?.request?.content?.data || {};
    handler(data as Record<string, any>);
  });
  return () => sub.remove();
}

export async function getInitialNotificationData(): Promise<Record<string, any> | null> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    return (last?.notification?.request?.content?.data as Record<string, any>) || null;
  } catch {
    return null;
  }
}
