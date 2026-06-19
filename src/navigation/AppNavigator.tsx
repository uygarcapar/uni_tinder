import { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, AppState, AppStateStatus, Image } from 'react-native';
import {
  registerForPushNotifications,
  onNotificationTap,
  getInitialNotificationData,
  setActiveConversationGetter,
} from '@/features/notifications/pushService';
import uiBus from '@/shared/services/uiBus';

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

const Stack = createNativeStackNavigator<RootStackParamList>();

// Dark theme override → NavigationContainer'ın default light theme'i (white BG)
// iOS 26 liquid glass tab bar transparent moduna geçtiğinde sızıp icon'ları
// siyaha flip ettiriyordu. Tüm nav view'lerin BG'sini #121212'ye lock'la.
const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#121212', card: '#121212' },
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
  const navRef = useNavigationContainerRef<RootStackParamList>();
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
  useEffect(() => {
    setOnAuthLost(() => {
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
        if (m.conversationId) {
          realtimeService.joinConversation(m.conversationId).catch(() => {});
        }
        // Fotolar inmeden modalı açma — gri daire flash'ı yok.
        const prefetches: Promise<any>[] = [];
        if (m.matchedUserPhoto) prefetches.push(Image.prefetch(m.matchedUserPhoto).catch(() => {}));
        if (myPhotoRef.current) prefetches.push(Image.prefetch(myPhotoRef.current).catch(() => {}));
        const timeout = new Promise((r) => setTimeout(r, 1500));
        Promise.race([Promise.all(prefetches), timeout]).then(() => {
          if (!mounted) return;
          setPendingMatch(m);
        });
      }),
      // Birisi seni Like/SuperLike attı ama henüz match değil.
      realtimeService.on('IncomingLike', (payload) => {
        if (!mounted) return;
        dispatch(incrementWhoLikedMeCount());
        uiBus.emit('incomingLike', payload);
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

    const tapUnsub = onNotificationTap((data) => {
      if (!mounted) return;
      routeFromNotification(data);
    });

    getInitialNotificationData().then((data) => {
      if (mounted && data) routeFromNotification(data);
    });

    return () => {
      mounted = false;
      tapUnsub();
    };
  }, [isAuthenticated, token]);

  const routeFromNotification = useCallback((data: Record<string, any>) => {
    if (!data || !navRef.isReady()) return;
    const convId = data.conversationId || data.relatedEntityId;
    const type = data.type;

    if (convId && (type === 'Message' || type === 'Match')) {
      navRef.navigate('Chat', {
        conversationId: convId,
        partner: undefined,
        isActive: true,
      });
    }
  }, [navRef]);

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
    if (!conversationId || !navRef.isReady()) return;
    navRef.navigate('Chat', {
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
      <NavigationContainer ref={navRef} key={navigationKey} theme={NAV_THEME}>
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
