import { useEffect, useRef, useState, useCallback } from 'react';
import { NavigationContainer, DarkTheme, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector, useDispatch } from 'react-redux';
import { View, AppState, Image } from 'react-native';
import {
  registerForPushNotifications,
  onNotificationTap,
  getInitialNotificationData,
  setActiveConversationGetter,
} from '../services/pushService';
import uiBus from '../services/uiBus';

import SettingsModal from '../components/SettingsModal';
import { setCurrentAccessToken, setOnTokenRefreshed, setOnAuthLost } from '../services/api';
import { setUserAndToken, clearRegistrationForm, logout } from '../store/slices/authSlice';
import { saveRefreshToken } from '../utils/tokenStorage';
import { fetchSubscriptionStatus, setPremium } from '../store/slices/subscriptionSlice';
import { initRevenueCat, loginRevenueCat } from '../services/subscriptionService';
import profileService from '../services/profileService';
import { queryClient } from '../queries/queryClient';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import KVKKConsentScreen, { CURRENT_KVKK_VERSION } from '../screens/KVKKConsentScreen';
import ChatScreen from '../screens/ChatScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import DeletionBanner from '../components/DeletionBanner';
import MatchModal from '../components/MatchModal';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import realtimeService from '../services/realtimeService';
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
} from '../store/slices/chatSlice';
import { incrementWhoLikedMeCount } from '../store/slices/swipeSlice';

const Stack = createNativeStackNavigator();

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
  const { isAuthenticated, user, token, refreshToken, kvkkVersion, emailVerifiedToken, registrationEmail } = useSelector(
    (state) => state.auth,
  );
  const dispatch = useDispatch();
  const [tokenInitialized, setTokenInitialized] = useState(false);
  const [resumeRoute, setResumeRoute] = useState(null); // null = checking
  const [pendingMatch, setPendingMatch] = useState(null);
  const [myPhoto, setMyPhoto] = useState(null);
  const myPhotoRef = useRef(null);
  useEffect(() => {
    myPhotoRef.current = myPhoto;
  }, [myPhoto]);
  const navRef = useNavigationContainerRef();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const activeConvRef = useRef(null);

  // Active conversation id'yi mutable ref'te ayna (push handler closure'ı için).
  const activeConvIdSelector = useSelector((s) => s.chat?.activeConversationId);
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
  // subscriptionService kendi içinde guard yapıyor — API key yoksa configure() çağrılmaz,
  // login/getOfferings/purchase no-op olur. Yani .env doldurulmasa da app çalışmaya devam eder.
  // Backend subscription status'u (canonical) yine de fetch edilir — webhook ile flip olabilir.
  //
  // ÖNEMLİ: loginRevenueCat'i await et — yoksa RC appUserID henüz switch olmamışken
  // fetchSubscriptionStatus → getCustomerInfo eski kullanıcının cached entitlement'ını
  // dönüp yeni hesabı premium gösteriyor.
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
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.userId, dispatch]);

  // ============ SignalR lifecycle + Hub → Redux bridge ============
  // Authenticated user için Hub'a bağlan, tüm event'leri Redux'a forward et.
  // Logout'ta disconnect + chat state reset.
  useEffect(() => {
    if (!isAuthenticated || !token) {
      realtimeService.disconnect().catch(() => {});
      dispatch(resetChat());
      return;
    }

    let mounted = true;

    // 1) Connect
    realtimeService.connect().catch((err) => {
      console.warn('SignalR initial connect failed:', err?.message);
    });

    // self userId injection — receiveMessage / messagesRead reducer'ları multi-device
    // doğruluğu için bunu bekler. user.userId yoksa user.id kullan.
    const selfUserId = user?.userId || user?.id;

    // 2) Bridge tüm hub event'lerini Redux dispatch'e
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
        // Auto-join → instant mesaj kaçırılmasın
        if (m.conversationId) {
          realtimeService.joinConversation(m.conversationId).catch(() => {});
        }
        // Fotolar inmeden modalı açma — gri daire flash'ı yok.
        // 1500ms timeout fallback: bozuk/yavaş URL'de sonsuza takılmasın.
        const prefetches = [];
        if (m.matchedUserPhoto) {
          prefetches.push(Image.prefetch(m.matchedUserPhoto).catch(() => {}));
        }
        if (myPhotoRef.current) {
          prefetches.push(Image.prefetch(myPhotoRef.current).catch(() => {}));
        }
        const timeout = new Promise((r) => setTimeout(r, 1500));
        Promise.race([Promise.all(prefetches), timeout]).then(() => {
          if (!mounted) return;
          setPendingMatch(m);
        });
      }),
      // Birisi seni Like/SuperLike attı ama henüz match değil.
      // Tab badge'i +1, LikesScreen açıksa uiBus üzerinden anlık kart prepend.
      // Mutual like'ta backend bu event'i göndermez (MatchNotification yeterli — dedup).
      realtimeService.on('IncomingLike', (payload) => {
        if (!mounted) return;
        dispatch(incrementWhoLikedMeCount());
        uiBus.emit('incomingLike', payload);
      }),
      // NewNotification — in-app feed (match/like/system push). UI henüz feed ekranı yok;
      // şimdilik conv list'i refresh et + log. Future: notifications slice + screen.
      realtimeService.on('NewNotification', (notif) => {
        if (!mounted) return;
        // Match türünde conv list yeni eşleşme satırını yansıtsın.
        if (notif?.type === 'Match' || notif?.type === 'Message') {
          dispatch(fetchConversations());
        }
      }),
      realtimeService.on('Error', (err) => {
        // FAZ 6: chat quota cap doldu — aktif sohbette paywall aç.
        if (err?.code === 'CHAT_QUOTA_EXHAUSTED' && err?.showPaywall) {
          const convId = activeConvRef.current;
          if (convId) uiBus.emit('chatQuotaExhausted', { conversationId: convId });
          return;
        }
        console.warn('Hub error:', err);
      }),
      realtimeService.on('__connectionStateChanged', (state) => {
        // Reconnect sonrası fresh state pull et — eksik event'ler için.
        if (state === 'connected') {
          dispatch(fetchConversations());
          dispatch(fetchUnreadCount());
        }
      }),
    ];

    // İlk açılışta conversation list + unread çek.
    dispatch(fetchConversations());
    dispatch(fetchUnreadCount());

    return () => {
      mounted = false;
      unsubscribers.forEach((u) => u && u());
    };
  }, [isAuthenticated, token, dispatch]);

  // ============ Push notification yaşam döngüsü ============
  // Login sonrası FCM token register, logout'ta deactivate.
  // Tap-to-route ve cold-start → ChatScreen deep-link.
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let mounted = true;

    // 1) Aktif conv getter — foreground'da bildirim suppression için.
    //    activeConvRef.current güncel değeri tutar; getter call-time'da okunur.
    setActiveConversationGetter(() => activeConvRef.current);

    // 2) Token register (permission iste, backend'e POST).
    registerForPushNotifications().catch(() => {});

    // 3) Tap handler — chat'e deep-link.
    const tapUnsub = onNotificationTap((data) => {
      if (!mounted) return;
      routeFromNotification(data);
    });

    // 4) Cold-start: app push'a basılarak açıldıysa initial route'u set et.
    getInitialNotificationData().then((data) => {
      if (mounted && data) routeFromNotification(data);
    });

    return () => {
      mounted = false;
      tapUnsub();
    };
  }, [isAuthenticated, token]);

  // Notification data'sından chat ekranına nav.
  const routeFromNotification = useCallback((data) => {
    if (!data || !navRef.isReady()) return;
    const convId = data.conversationId || data.relatedEntityId;
    const type = data.type;

    // Match notification → MatchModal değil, conv'a direkt git (bildirim sonrası genelde
    // kullanıcı sohbete bakmak ister).
    if (convId && (type === 'Message' || type === 'Match')) {
      navRef.navigate('Chat', {
        conversationId: convId,
        partner: undefined, // ChatScreen partner bilgisini conv'dan resolve eder
        isActive: true,
      });
    }
  }, [navRef]);

  // ============ AppState lifecycle ============
  // Background → SignalR bağlı kalıyor (Tinder/WhatsApp gibi short detach).
  // Foreground → bağlantı kopmuşsa reconnect + fresh state pull.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev.match(/inactive|background/) && next === 'active') {
        // Foreground'a döndük: hub bağlantı sağlamlık check + state refresh.
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
  // user.userId değiştiğinde (logout, hesap değiştirme) per-user cache'leri
  // temizle: React Query (swipe stats/matches/filters, profile) ve subscription
  // Redux slice'ı. Aksi halde User A'nın stats'i User B'de dalga animasyonu ve
  // kalan swipe sayısı olarak sızar.
  //
  // ÖNEMLİ: null → user (ilk login/kayıt) transition'ında clear ETME — bu
  // render cycle'da yeni mount olan ekranların (DiscoverScreen vb.) in-flight
  // query'lerini iptal eder ve loading state'inde takılır kalırlar.
  const currentUserId = user?.userId ?? null;
  const prevUserIdRef = useRef(currentUserId);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUserId) {
      const isFirstAuth =
        prevUserIdRef.current === null && currentUserId !== null;
      if (!isFirstAuth) {
        queryClient.clear();
        dispatch(setPremium({ isPremium: false, expiresAt: null }));
      }
      prevUserIdRef.current = currentUserId;
    }
  }, [currentUserId, dispatch]);

  // ============ Global Settings modal — uiBus üzerinden her ekran açabilir ============
  useEffect(() => {
    const unsub = uiBus.on('openSettings', () => {
      setSettingsVisible(true);
    });
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

    // Token exists — validate it before resuming
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
      .catch(() => {
        setResumeRoute('Welcome');
      });
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
      .then((p) => {
        if (cancelled) return;
        const url =
          p?.photosList?.find((x) => x.isMainPhoto)?.photoImageUrl ||
          p?.photosList?.[0]?.photoImageUrl ||
          p?.profileImageUrl ||
          null;
        setMyPhoto(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.userId, user?.isMailVerified, user?.isProfileCreated]);

  if (!tokenInitialized || resumeRoute === null) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const isVerifiedUser = user?.isMailVerified || user?.isProfileCreated;
  const showMainNavigator = isAuthenticated && isVerifiedUser;
  const needsKvkkConsent = showMainNavigator && kvkkVersion !== CURRENT_KVKK_VERSION;
  const navigationKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${isVerifiedUser ? 'verified' : 'unverified'}`;

  const handleOpenMatchChat = (conversationId) => {
    setPendingMatch(null);
    if (!conversationId || !navRef.isReady()) return;
    // İki tab navigator + stack içinde Chat route'una nav et.
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
        {showMainNavigator ? <MainNavigator /> : <AuthNavigator initialRoute={resumeRoute} />}
      </NavigationContainer>

      {/* Global KVKK consent overlay — appears on top of everything */}
      <KVKKConsentScreen visible={needsKvkkConsent} />

      {/* Soft-delete banner — floats above tab content when account is scheduled for deletion */}
      {showMainNavigator && <DeletionBanner />}

      {/* Global "It's a Match!" overlay — herhangi bir ekranın üstünde gösterilir */}
      {showMainNavigator && (
        <MatchModal
          match={pendingMatch}
          myPhoto={myPhoto}
          onClose={() => setPendingMatch(null)}
          onSendMessage={handleOpenMatchChat}
        />
      )}

      {/* Global Settings modal — uiBus.emit('openSettings') ile her ekrandan açılır */}
      {showMainNavigator && (
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
        />
      )}
    </>
  );
}
