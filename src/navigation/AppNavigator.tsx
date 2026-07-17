import { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, AppState, AppStateStatus } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import {
  registerForPushNotifications,
  onNotificationTap,
  getInitialNotificationData,
  setActiveConversationGetter,
  subscribeTokenRefresh,
  subscribeForegroundMessages,
  subscribeBackgroundOpen,
} from '@/features/notifications/pushService';
import uiBus from '@/shared/services/uiBus';
import { navigationRef } from '@/shared/services/navigationRef';
import { showMessageToast, showLikeToast, showInfoToast } from '@/shared/services/toaster';
import { store } from '@/shared/store';

import SettingsModal from '@/features/profile/components/SettingsModal';
import { setCurrentAccessToken, setOnTokenRefreshed, setOnAuthLost } from '@/shared/services/api';
import { setUserAndToken, clearRegistrationForm, logout } from '@/features/auth/authSlice';
import { saveRefreshToken } from '@/shared/utils/tokenStorage';
import { fetchSubscriptionStatus, setPremium } from '@/features/profile/subscriptionSlice';
import { initRevenueCat, loginRevenueCat } from '@/features/profile/subscriptionService';
import profileService from '@/features/profile/profileService';
import { queryClient } from '@/shared/queries/queryClient';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import KVKKConsentScreen, { CURRENT_KVKK_VERSION } from '@/features/auth/screens/KVKKConsentScreen';
import ChatScreen from '@/features/chat/screens/ChatScreen';
import NotificationsScreen from '@/features/notifications/screens/NotificationsScreen';
import DeletionBanner from '@/features/notifications/components/DeletionBanner';
import MatchModal from '@/features/notifications/components/MatchModal';
import { API_BASE_URL, API_ENDPOINTS } from '@/shared/constants/api';
import realtimeService from '@/features/chat/realtimeService';
import {
  receiveMessage,
  messageSent,
  messagesRead,
  messageDelivered,
  messageEdited,
  messageDeleted,
  reactionsChanged,
  userStartedTyping,
  userStoppedTyping,
  userStatusChanged,
  userStatusResponse,
  matchNotification,
  fetchConversations,
  fetchUnreadCount,
  resetChat,
} from '@/features/chat/chatSlice';
import { incrementWhoLikedMeCount } from '@/features/discover/swipeSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import type { RootStackParamList } from '@/shared/types/navigation';
import { colors } from '../shared/theme/colors';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Dark theme override → NavigationContainer'ın default light theme'i (white BG)
// iOS 26 liquid glass tab bar transparent moduna geçtiğinde sızıp icon'ları
// siyaha flip ettiriyordu. Tüm nav view'lerin BG'sini #121212'ye lock'la.
const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg },
};

function MainNavigator() {
  return (
    <Stack.Navigator
      id="MainStack"
      screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      initialRouteName="HomeTabs"
    >
      <Stack.Screen name="HomeTabs" component={TabNavigator} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, user, token, refreshToken, kvkkVersion, emailVerifiedToken, registrationEmail } =
    useAppSelector((state) => (state as any).auth);
  const dispatch = useAppDispatch();
  const [tokenInitialized, setTokenInitialized] = useState(false);
  const [resumeRoute, setResumeRoute] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<any>(null);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const myPhotoRef = useRef<string | null>(null);
  useEffect(() => {
    myPhotoRef.current = myPhoto;
  }, [myPhoto]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const activeConvRef = useRef<string | null>(null);

  const activeConvIdSelector = useAppSelector((s) => (s as any).chat?.activeConversationId as string | null);
  useEffect(() => {
    activeConvRef.current = activeConvIdSelector;
  }, [activeConvIdSelector]);

  // Sync axios token with Redux/persisted state
  useEffect(() => {
    setCurrentAccessToken(token ?? null);
    if (refreshToken) saveRefreshToken(refreshToken);
    if (!tokenInitialized) setTokenInitialized(true);
  }, [token, refreshToken, tokenInitialized]);

  // Keep Redux token in sync after background refresh
  useEffect(() => {
    setOnTokenRefreshed((newToken, newRefreshToken) => {
      dispatch(setUserAndToken({ user, token: newToken, refreshToken: newRefreshToken }));
    });
  }, [user, dispatch]);

  // Auth lost (refresh fail / missing) → Redux logout, AuthNavigator'a düş.
  // reason 'new_login_elsewhere' ise offline'dan uyanınca kullanıcıya toast
  // gösterilir (SignalR event'i kaçırıldı, refresh fallback path).
  useEffect(() => {
    setOnAuthLost((reason) => {
      if (reason === 'new_login_elsewhere') {
        showInfoToast({
          title: 'Oturumun kapatıldı',
          message: 'Hesabına başka bir cihazdan giriş yapıldı.',
          variant: 'error',
        });
      }
      dispatch(logout());
    });
  }, [dispatch]);

  // RevenueCat init + subscription status when authenticated.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    (async () => {
      initRevenueCat(user.userId);
      if (user.userId) {
        await loginRevenueCat(user.userId).catch(() => {});
      }
      if (!cancelled) dispatch(fetchSubscriptionStatus());
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.userId, dispatch]);

  // ============ SignalR lifecycle + Hub → Redux bridge ============
  useEffect(() => {
    if (!isAuthenticated || !token) {
      realtimeService.disconnect().catch(() => {});
      dispatch(resetChat());
      return;
    }

    let mounted = true;

    realtimeService.connect().catch((err) => {
      console.warn('SignalR initial connect failed:', err?.message);
    });

    const selfUserId = user?.userId || user?.id;

    const unsubscribers = [
      realtimeService.on('ReceiveMessage', (msg) => {
        if (!mounted) return;
        dispatch(receiveMessage({ ...msg, _selfUserId: selfUserId }));

        const isSelf = selfUserId && msg.senderId === selfUserId;
        const isActiveChat = activeConvRef.current === msg.conversationId;
        const isForeground = appStateRef.current === 'active';
        if (isSelf || isActiveChat || !isForeground) return;

        const conv = (store.getState() as any).chat?.conversations?.find(
          (c: any) => c.conversationId === msg.conversationId,
        );
        if (!conv) return;

        const ct = msg.contentType ?? 0;
        const preview =
          ct === 1 ? 'Fotoğraf' :
          ct === 2 ? 'Sesli mesaj' :
          ct === 3 ? 'Video' :
          (msg.content || '').trim() || 'Yeni mesaj';

        showMessageToast({
          senderName: conv.partnerDisplayName || 'Yeni mesaj',
          photoUrl: conv.partnerProfileImageUrl,
          preview,
          conversationId: msg.conversationId,
        });
      }),
      realtimeService.on('MessageSent', (msg) => mounted && dispatch(messageSent(msg))),
      realtimeService.on('MessagesRead', (payload) => {
        if (!mounted) return;
        dispatch(messagesRead({ ...payload, _selfUserId: selfUserId }));
      }),
      realtimeService.on('MessageDelivered', (payload) => mounted && dispatch(messageDelivered(payload))),
      realtimeService.on('MessageEdited', (msg) => mounted && dispatch(messageEdited(msg))),
      realtimeService.on('MessageDeleted', (payload) => mounted && dispatch(messageDeleted(payload))),
      realtimeService.on('ReactionsChanged', (payload) => mounted && dispatch(reactionsChanged(payload))),
      realtimeService.on('UserStartedTyping', (payload) => mounted && dispatch(userStartedTyping(payload))),
      realtimeService.on('UserStoppedTyping', (payload) => mounted && dispatch(userStoppedTyping(payload))),
      realtimeService.on('UserStatusChanged', (payload) => mounted && dispatch(userStatusChanged(payload))),
      realtimeService.on('UserStatusResponse', (payload) => mounted && dispatch(userStatusResponse(payload))),
      realtimeService.on('MatchNotification', (m) => {
        if (!mounted) return;
        dispatch(matchNotification(m));
        uiBus.emit('match', m);
        if (m.conversationId) {
          realtimeService.joinConversation(m.conversationId).catch(() => {});
        }
        // expo-image memory cache'i ısıt (fire-and-forget). Asıl gate MatchModal içinde.
        const urls = [m.matchedUserPhoto, myPhotoRef.current].filter(Boolean) as string[];
        if (urls.length) ExpoImage.prefetch(urls, 'memory-disk').catch(() => {});
        setPendingMatch(m);
      }),
      // Birisi seni Like/SuperLike attı ama henüz match değil.
      realtimeService.on('IncomingLike', (payload) => {
        if (!mounted) return;
        dispatch(incrementWhoLikedMeCount());
        uiBus.emit('incomingLike', payload);

        if (appStateRef.current !== 'active') return;
        showLikeToast({
          kind: payload?.isSuperLike ? 'superLike' : 'like',
          senderName: payload?.likerDisplayName,
          photoUrl: payload?.likerPhotoUrl,
        });
      }),
      realtimeService.on('NewNotification', (notif) => {
        if (!mounted) return;
        if (notif?.type === 'Match' || notif?.type === 'Message') {
          dispatch(fetchConversations());
        }
      }),
      realtimeService.on('Error', (err) => {
        if (err?.code === 'CHAT_QUOTA_EXHAUSTED' && err?.showPaywall) {
          const convId = activeConvRef.current;
          if (convId) uiBus.emit('chatQuotaExhausted', { conversationId: convId });
          return;
        }
        console.warn('Hub error:', err);
      }),
      // Backend'den anlık "başka cihazdan giriş yapıldı" sinyali. Online path;
      // offline/killed durumda refresh interceptor aynı toast'ı gösterir.
      realtimeService.on('ForceLogout', async () => {
        if (!mounted) return;
        showInfoToast({
          title: 'Oturumun kapatıldı',
          message: 'Hesabına başka bir cihazdan giriş yapıldı.',
          variant: 'error',
        });
        await realtimeService.disconnect().catch(() => {});
        dispatch(logout());
      }),
      realtimeService.on('__connectionStateChanged', (state) => {
        if (state === 'connected') {
          dispatch(fetchConversations());
          dispatch(fetchUnreadCount());
        }
      }),
    ];

    dispatch(fetchConversations());
    dispatch(fetchUnreadCount());

    return () => {
      mounted = false;
      unsubscribers.forEach((u) => u && u());
    };
  }, [isAuthenticated, token, dispatch]);

  // ============ Push notification lifecycle ============
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let mounted = true;

    setActiveConversationGetter(() => activeConvRef.current);
    registerForPushNotifications().catch(() => {});

    const routeIfMounted = (data: Record<string, any>) => {
      if (!mounted) return;
      routeFromNotification(data);
    };

    const unsubs = [
      // Foreground'da expo-notifications ile display edilen bildirime tap
      onNotificationTap(routeIfMounted),
      // Token rotate senaryosu (uninstall/reinstall vb.)
      subscribeTokenRefresh(),
      // Foreground FCM push — expo-notifications'a devret ki tray + badge güncellensin
      subscribeForegroundMessages(),
      // Background'dan foreground'a tap
      subscribeBackgroundOpen(routeIfMounted),
    ];

    // Quit state'ten cold start ile açılış — FCM getInitialNotification
    getInitialNotificationData().then((data) => {
      if (mounted && data) routeFromNotification(data);
    });

    return () => {
      mounted = false;
      unsubs.forEach((u) => u && u());
    };
  }, [isAuthenticated, token]);

  const routeFromNotification = useCallback((data: Record<string, any>) => {
    if (!data || !navigationRef.isReady()) return;
    const type = data.type;
    const relatedId = data.conversationId || data.relatedEntityId;

    switch (type) {
      case 'Message':
      case 'Match': {
        if (!relatedId) return;
        navigationRef.navigate('Chat', {
          conversationId: relatedId,
          partner: undefined,
          isActive: true,
        });
        return;
      }
      case 'Like':
      case 'SuperLike': {
        // Likes tab HomeTabs stack'inin altında — nested navigate
        navigationRef.navigate('HomeTabs' as never, { screen: 'Likes' } as never);
        return;
      }
      case 'MissedMatch':
      case 'System':
      default: {
        navigationRef.navigate('Notifications' as never);
        return;
      }
    }
  }, []);

  // ============ AppState lifecycle ============
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev.match(/inactive|background/) && next === 'active') {
        if (isAuthenticated && token) {
          if (!realtimeService.isConnected()) {
            realtimeService.connect().catch(() => {});
          }
          dispatch(fetchConversations());
          dispatch(fetchUnreadCount());
          dispatch(fetchSubscriptionStatus());
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, token, dispatch]);

  // ============ User identity change → cache reset ============
  const currentUserId = user?.userId ?? null;
  const prevUserIdRef = useRef<string | null>(currentUserId);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUserId) {
      const isFirstAuth = prevUserIdRef.current === null && currentUserId !== null;
      if (!isFirstAuth) {
        queryClient.clear();
        dispatch(setPremium({ isPremium: false, expiresAt: null }));
      }
      prevUserIdRef.current = currentUserId;
    }
  }, [currentUserId, dispatch]);

  // ============ Global Settings modal ============
  useEffect(() => {
    const unsub = uiBus.on('openSettings', () => setSettingsVisible(true));
    return unsub;
  }, []);

  // Resume flow: check if user has a valid in-progress registration
  useEffect(() => {
    if (!tokenInitialized) return;

    if (isAuthenticated) {
      setResumeRoute('Welcome');
      return;
    }

    if (!emailVerifiedToken || !registrationEmail) {
      setResumeRoute('Welcome');
      return;
    }

    fetch(`${API_BASE_URL}${API_ENDPOINTS.CHECK_REGISTRATION_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: registrationEmail, emailVerifiedToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.isSuccess) {
          setResumeRoute('RegisterStep3');
        } else {
          dispatch(clearRegistrationForm());
          setResumeRoute('Welcome');
        }
      })
      .catch(() => setResumeRoute('Welcome'));
  }, [tokenInitialized, isAuthenticated]);

  useEffect(() => {
    const verified = user?.isMailVerified || user?.isProfileCreated;
    if (!isAuthenticated || !verified) {
      setMyPhoto(null);
      return;
    }
    let cancelled = false;
    profileService
      .getMyProfile()
      .then((p: any) => {
        if (cancelled) return;
        const url =
          p?.photosList?.find((x: any) => x.isMainPhoto)?.photoImageUrl ||
          p?.photosList?.[0]?.photoImageUrl ||
          p?.profileImageUrl ||
          null;
        setMyPhoto(url);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.userId, user?.isMailVerified, user?.isProfileCreated]);

  if (!tokenInitialized || resumeRoute === null) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const isVerifiedUser = user?.isMailVerified || user?.isProfileCreated;
  const showMainNavigator = isAuthenticated && isVerifiedUser;
  const needsKvkkConsent = showMainNavigator && kvkkVersion !== CURRENT_KVKK_VERSION;
  const navigationKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${isVerifiedUser ? 'verified' : 'unverified'}`;

  const handleOpenMatchChat = (conversationId: string) => {
    setPendingMatch(null);
    if (!conversationId || !navigationRef.isReady()) return;
    navigationRef.navigate('Chat', {
      conversationId,
      partner: pendingMatch
        ? {
            userId: pendingMatch.matchedUserId,
            displayName: pendingMatch.matchedUserName,
            profileImageUrl: pendingMatch.matchedUserPhoto,
          }
        : undefined,
      isActive: true,
    });
  };

  return (
    <>
      <NavigationContainer ref={navigationRef} key={navigationKey} theme={NAV_THEME}>
        {showMainNavigator ? <MainNavigator /> : <AuthNavigator initialRoute={resumeRoute as any} />}
      </NavigationContainer>

      {/* Global KVKK consent overlay */}
      <KVKKConsentScreen visible={needsKvkkConsent} />

      {/* Soft-delete banner */}
      {showMainNavigator && <DeletionBanner />}

      {/* Global "It's a Match!" overlay */}
      {showMainNavigator && (
        <MatchModal
          match={pendingMatch}
          myPhoto={myPhoto}
          onClose={() => setPendingMatch(null)}
          onSendMessage={handleOpenMatchChat}
        />
      )}

      {/* Global Settings modal */}
      {showMainNavigator && (
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
        />
      )}
    </>
  );
}
