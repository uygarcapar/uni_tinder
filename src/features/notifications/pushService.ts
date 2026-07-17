import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import api, { getCurrentAccessToken } from '@/shared/services/api';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { colors } from '../../shared/theme/colors';

let getActiveConversationId: () => string | null = () => null;
export const setActiveConversationGetter = (fn: (() => string | null) | null) => {
  getActiveConversationId = fn || (() => null);
};

// POST /devices rate limit 5/60s — aynı token'ı tekrar tekrar göndermeyi engelle.
// Fast Refresh, tekrarlı mount ve token refresh senaryolarında idempotency sağlar.
let lastRegisteredToken: string | null = null;

// Foreground'da OS banner gösterme — in-app toaster (react-native-notifier) bunun yerini alır.
// Background normal akar. Tray'de listeleme + badge korunur ki kullanıcı bildirim tepsisinden
// geçmişe ulaşabilsin.
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

function currentPlatform(): 'iOS' | 'Android' {
  return Platform.OS === 'ios' ? 'iOS' : 'Android';
}

async function postDeviceToken(token: string, appVersion: string): Promise<void> {
  if (!token || token === lastRegisteredToken) return;
  await api.post(API_ENDPOINTS.NOTIFICATIONS_DEVICES, {
    token,
    platform: currentPlatform(),
    appVersion,
  });
  lastRegisteredToken = token;
}

export async function registerForPushNotifications(appVersion = '1.0.0'): Promise<string | null> {
  if (!Device.isDevice) return null;

  try {
    // Expo izin akışı — iOS OS dialog + Android 13+ POST_NOTIFICATIONS
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

    // Android foreground display için channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('unitinder_notifications', {
        name: 'Mesajlar',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.primary,
        sound: 'default',
      });
    }

    // iOS: FCM izni + APNs register. RN Firebase v22+ auto-register açık; explicit
    // registerDeviceForRemoteMessages çağrısı gereksiz (firebase.json'da
    // messaging_ios_auto_register_for_remote_messages=false değilse).
    if (Platform.OS === 'ios') {
      await messaging().requestPermission();
    }

    const token = await messaging().getToken();
    if (!token) return null;

    await postDeviceToken(token, appVersion);
    console.log('🔔 Push token registered:', currentPlatform(), token);
    return token;
  } catch (err: any) {
    console.warn('Push registration failed:', err?.message);
    return null;
  }
}

export async function unregisterPushToken(): Promise<void> {
  try {
    if (!getCurrentAccessToken()) return;
    const token = lastRegisteredToken ?? (await messaging().getToken().catch(() => null));
    if (!token) return;
    await api.delete(API_ENDPOINTS.NOTIFICATIONS_DEVICE_BY_TOKEN(token)).catch(() => {});
  } catch {
    // yut
  } finally {
    lastRegisteredToken = null;
  }
}

// Token rotate senaryosu (uninstall/reinstall, corrupt install, Firebase rotation) — yeni token
// backend'e otomatik kaydedilsin.
export function subscribeTokenRefresh(appVersion = '1.0.0'): () => void {
  return messaging().onTokenRefresh(async (newToken) => {
    try {
      lastRegisteredToken = null; // eski token'ı invalid et → postDeviceToken yeniden POST'lasın
      await postDeviceToken(newToken, appVersion);
    } catch {
      // bir sonraki app açılışında register yine dener
    }
  });
}

// FCM foreground handler — app aktifken push geldiğinde OS bildirimi göstermez, biz elle
// dispatch etmezsek sessizce düşer. Tray + badge güncellensin diye expo-notifications'a devret;
// setNotificationHandler zaten banner'ı hide ediyor, in-app toaster'ı bozmaz.
export function subscribeForegroundMessages(): () => void {
  return messaging().onMessage(async (msg: FirebaseMessagingTypes.RemoteMessage) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: msg.notification?.title ?? '',
        body: msg.notification?.body ?? '',
        data: (msg.data ?? {}) as Record<string, any>,
      },
      trigger: null,
    }).catch(() => {});
  });
}

// Background'da (app arka planda ama process alive) push'a tap → app foreground'a gelir.
// FCM tap handler — expo-notifications ayrıca kendi tap event'ini de emit eder ama
// bu doğrudan FCM data payload'ını verir.
export function subscribeBackgroundOpen(
  handler: (data: Record<string, any>) => void,
): () => void {
  return messaging().onNotificationOpenedApp((msg) => {
    if (msg?.data) handler(msg.data as Record<string, any>);
  });
}

// Foreground'da expo-notifications ile gösterilen bildirime tap (subscribeForegroundMessages
// tarafından scheduleNotificationAsync ile atılanları yakalar).
export function onNotificationTap(handler: (data: Record<string, any>) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    handler(data as Record<string, any>);
  });
  return () => sub.remove();
}

// Quit state'ten (process ölmüş) push tap ile açılış — cold start'ta bir kez çağrılır.
// FCM getInitialNotification, native OS'nin app'i cold start ettiği FCM mesajını döner.
export async function getInitialNotificationData(): Promise<Record<string, any> | null> {
  try {
    const initial = await messaging().getInitialNotification();
    if (initial?.data) return initial.data as Record<string, any>;
    return null;
  } catch {
    return null;
  }
}
