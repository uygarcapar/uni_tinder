import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api, { getCurrentAccessToken } from './api';
import { API_ENDPOINTS } from '../constants/api';

/**
 * Push notification yaşam döngüsü — token kayıt, foreground handler, tap-to-route.
 *
 * Backend kontrat:
 *   POST /api/notifications/devices  body: { token, platform, appVersion }
 *     platform: "iOS" | "Android" (DeviceTokenService.cs DevicePlatform enum)
 *
 * Foreground stratejisi:
 *   - Active conversation = bildirim'in conversationId'si → notification suppress (kullanıcı zaten görüyor)
 *   - Aksi halde banner + sound göster
 *
 * Background:
 *   - Sistem otomatik banner gösterir
 *   - Tap → onNotificationResponse → navigationRef ile Chat'e yönlendir
 */

// ✅ Foreground'da bildirim davranışını ayarla — chat ekranında değilsek banner göster.
let getActiveConversationId = () => null;
export const setActiveConversationGetter = (fn) => {
  getActiveConversationId = fn || (() => null);
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data || {};
    // Backend extraData içinde relatedEntityId = conversationId.
    const incomingConvId = data.relatedEntityId || data.conversationId;
    const activeConv = getActiveConversationId();
    const inActiveChat = incomingConvId && incomingConvId === activeConv;

    return {
      shouldShowBanner: !inActiveChat,
      shouldShowList: !inActiveChat,
      shouldPlaySound: !inActiveChat,
      shouldSetBadge: true,
    };
  },
});

/**
 * Permission iste, token al, backend'e kayıt et.
 * Login sonrası ve app her başlangıcında çağrılmalı.
 */
export async function registerForPushNotifications(appVersion = '1.0.0') {
  if (!Device.isDevice) {
    // Simulator'da push çalışmaz — sessizce skip.
    return null;
  }

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

    // Android: notification channel kur (high importance for messages).
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('unitinder_notifications', {
        name: 'Mesajlar',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#f57656',
        sound: 'default',
      });
    }

    // FCM token (Android) / APNs device token (iOS).
    // Expo: getDevicePushTokenAsync → native FCM/APNs token (backend FirebaseFcmMessageSender bunu bekler).
    const tokenResult = await Notifications.getDevicePushTokenAsync();
    const token = tokenResult?.data;
    if (!token) return null;

    const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';

    await api.post(API_ENDPOINTS.NOTIFICATIONS_DEVICES, {
      token,
      platform,
      appVersion,
    });

    console.log('🔔 Push token registered:', platform, token.substring(0, 12) + '…');
    return token;
  } catch (err) {
    console.warn('Push registration failed:', err?.message);
    return null;
  }
}

/**
 * Logout sırasında token deactivate.
 * Backend: DELETE /api/notifications/devices/{token}
 *
 * Auth zorunlu — access token henüz temizlenmeden çağrılmalı. Yoksa request
 * Token YOK ile gider, 401 → refresh fail → ikinci logout dispatch zinciri.
 */
export async function unregisterPushToken() {
  try {
    if (!getCurrentAccessToken()) return;
    const tokenResult = await Notifications.getDevicePushTokenAsync().catch(() => null);
    const token = tokenResult?.data;
    if (!token) return;
    await api.delete(API_ENDPOINTS.NOTIFICATIONS_DEVICE_BY_TOKEN(token)).catch(() => {});
  } catch {}
}

/**
 * Notification response listener — tap-to-route.
 * Returns subscription cleanup fn.
 *
 * payload örneği (backend extraData):
 *   { type: "Message", conversationId, messageId, senderId, ... }
 *   { type: "Match", matchId, matchedUserId, relatedEntityId (=conversationId) }
 */
export function onNotificationTap(handler) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    handler(data);
  });
  return () => sub.remove();
}

/**
 * Foreground'da gelen notification listener (banner gösterilmiş olabilir).
 * UI in-app toast vb. gösterebilir. Şu an conv list refresh için NewNotification hub event'i
 * yeterli — bu listener future-proofing.
 */
export function onForegroundNotification(handler) {
  const sub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification?.request?.content?.data || {};
    handler(data);
  });
  return () => sub.remove();
}

/**
 * App ilk açılışta cold-start notification kontrolü.
 * Eğer app push'a basılarak açıldıysa bu çağrı initial response döner.
 */
export async function getInitialNotificationData() {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    return last?.notification?.request?.content?.data || null;
  } catch {
    return null;
  }
}
