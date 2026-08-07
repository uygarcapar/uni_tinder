import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { NavigationContainer, DarkTheme, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, AppState, AppStateStatus, InteractionManager } from 'react-native';
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
import { setCurrentRouteName } from '@/shared/services/currentRoute';
import { shortNetError } from '@/shared/utils/netError';
import { showMessageToast, showLikeToast, showInfoToast } from '@/shared/services/toaster';
import { store } from '@/shared/store';
import { clearChatCache } from '@/shared/store/mmkvStorage';

import SettingsModal from '@/features/profile/components/SettingsModal';
import { setCurrentAccessToken, setOnTokenRefreshed, setOnAuthLost } from '@/shared/services/api';
import { isSelfInflictedForceLogout } from '@/shared/utils/sessionGuard';
import { setUserAndToken, clearRegistrationForm, logout } from '@/features/auth/authSlice';
import { fetchSubscriptionStatus, reconcileIfMismatched, setPremium } from '@/features/profile/subscriptionSlice';
import { addCustomerInfoListener, initRevenueCat, loginRevenueCat } from '@/features/profile/subscriptionService';
import profileService from '@/features/profile/profileService';
import { queryClient } from '@/shared/queries/queryClient';
import { swipeKeys } from '@/features/discover/swipeQueries';
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
  messagesDeliveredBatch,
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
import { mark, summary } from '@/shared/debug/startupTiming';
import { maybeRequestReviewAfterMatch, recordMatchForReview } from '@/shared/services/appReview';
import { analytics } from '@/shared/services/analytics';
import { navigationIntegration } from '@/shared/services/sentry';
import { hideSplash } from '@/shared/splash';
import { whenAppShellReady } from '@/shared/bootPhase';
import { devLog } from '@/shared/utils/devLog';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Deep link haritası — app.json'daki "lit" şemasıyla eşleşir (lit://chat/abc123).
// Push-tap routing'e DOKUNMAZ: o akış bilinçli olarak imperative navigationRef
// üzerinden yürür (cold-start dedupe + boot gate). Bu config yalnız URL ile
// açılışları (şifre sıfırlama maili, profil paylaşımı, kampanya linki) karşılar.
// Universal link (https) prefix'i web domain'i alındığında eklenecek.
const LINKING: LinkingOptions<RootStackParamList> = {
  prefixes: ['lit://'],
  config: {
    screens: {
      HomeTabs: {
        screens: {
          Discover: 'discover',
          Likes: 'likes',
          Messages: 'messages',
          Profile: 'profile',
        },
      },
      Chat: 'chat/:conversationId',
      Notifications: 'notifications',
    },
  },
};

// Dark theme override → NavigationContainer'ın default light theme'i (white BG)
// iOS 26 liquid glass tab bar transparent moduna geçtiğinde sızıp icon'ları
// siyaha flip ettiriyordu. Tüm nav view'lerin BG'sini #121212'ye lock'la.
const NAV_THEME = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg },
};

// NavigationContainer hazır olana kadar bekleyip callback'i çalıştırır. Cold start'ta
// push tap routing'i container mount'tan önce tetiklenebiliyor; ~8sn içinde hazır
// olmazsa vazgeçer (kullanıcı zaten manuel navigate etmiştir).
function whenNavigationReady(fn: () => void, timeoutMs = 8000) {
  const startedAt = Date.now();
  const tick = () => {
    if (navigationRef.isReady()) {
      fn();
      return;
    }
    if (Date.now() - startedAt >= timeoutMs) return;
    setTimeout(tick, 120);
  };
  setTimeout(tick, 120);
}

// Cold start'ta (quit state'ten push tap) NavigationContainer hazır olur olmaz Chat'e
// push edersek, HomeTabs ağacı (Discover dahil) hâlâ mount olurken üstüne ikinci ağır
// ekran biniyor. Boot fetch'lerinin her biri (conversations / unread / subscription /
// quota / history) o anda iki ağacı birden re-render ettiriyor → ShadowTree commit
// storm. Bu yüzden cold start routing'ini boot oturana kadar geciktiriyoruz:
//   • NavigationContainer hazır
//   • conversations fetch'i sonuçlandı → partner bilgisi dolu gider, ChatScreen
//     header'ı boş isim/avatar ile açılıp ikinci kez render olmaz
//   • interaction kuyruğu boşaldı → Discover'ın ilk commit'i bitmiş olur
// Ağ yoksa kullanıcı bekleyip kalmasın diye timeout'ta yine de navigate ediyoruz.
function whenBootSettled(fn: () => void, timeoutMs = 3500) {
  const startedAt = Date.now();
  const tick = () => {
    const expired = Date.now() - startedAt >= timeoutMs;
    if (!navigationRef.isReady()) {
      if (expired) return;
      setTimeout(tick, 120);
      return;
    }
    const chat = (store.getState() as any).chat;
    const conversationsSettled = chat?._conversationsFetchedAt > 0 || !!chat?.conversationsError;
    if (!conversationsSettled && !expired) {
      setTimeout(tick, 120);
      return;
    }
    InteractionManager.runAfterInteractions(fn);
  };
  setTimeout(tick, 120);
}

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

// DEV ONLY — MatchModal tasarımını denemek için: true yap, uygulamayı aç, modal
// boot zinciri oturunca (bkz. matchGateOpen) sahte veriyle açılır. Sadece __DEV__
// build'lerde etkili; release'de tamamen ölü kod.
const DEV_PREVIEW_MATCH_MODAL = false;
const DEV_PREVIEW_MATCH = {
  conversationId: 'dev-preview-conversation',
  matchedUserId: 'dev-preview-user',
  matchedUserName: 'Elif',
  matchedUserPhoto: 'https://randomuser.me/api/portraits/women/68.jpg',
};
const DEV_PREVIEW_MY_PHOTO = 'https://randomuser.me/api/portraits/men/32.jpg';

export default function AppNavigator() {
  const { t } = useTranslation();
  const { isAuthenticated, user, token, kvkkVersion, emailVerifiedToken, registrationEmail } =
    useAppSelector((state) => (state as any).auth);
  // Sessiz refresh her rotasyonda `token`'ı değiştiriyor. SignalR/AppState
  // efektleri buna değil, "token var mı" boolean'ına bağlanır — aksi halde her
  // refresh hub bağlantısını yeniden kurmaya çalışıyor.
  const hasToken = !!token;
  const dispatch = useAppDispatch();
  const [tokenInitialized, setTokenInitialized] = useState(false);
  const [resumeRoute, setResumeRoute] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<any>(
    __DEV__ && DEV_PREVIEW_MATCH_MODAL ? DEV_PREVIEW_MATCH : null,
  );
  const [matchGateOpen, setMatchGateOpen] = useState(false);
  const [myPhoto, setMyPhoto] = useState<string | null>(null);
  const myPhotoRef = useRef<string | null>(null);
  useEffect(() => {
    myPhotoRef.current = myPhoto;
  }, [myPhoto]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const activeConvRef = useRef<string | null>(null);
  // SignalR ilk bağlantısı ile kopukluk-sonrası yeniden bağlanmayı ayırt eder —
  // conversations force-refetch yalnız reconnect'te yapılır (boot'ta zaten çekiliyor).
  const hadConnectionDropRef = useRef(false);
  const lastRoutedNotificationRef = useRef<string | null>(null);

  const activeConvIdSelector = useAppSelector((s) => (s as any).chat?.activeConversationId as string | null);
  useEffect(() => {
    activeConvRef.current = activeConvIdSelector;
  }, [activeConvIdSelector]);

  // Sync axios token with Redux/persisted state.
  // refreshToken burada YAZILMAZ: `ut_refresh_token` tek kaynak ve onu sadece
  // login/register thunk'ları ile api.ts'teki rotasyon yazıyor. Buradan da yazınca
  // Redux'taki (rotasyonun gerisinde kalabilen) kopya taze token'ı eziyordu.
  useEffect(() => {
    setCurrentAccessToken(token ?? null);
    if (!tokenInitialized) setTokenInitialized(true);
  }, [token, tokenInitialized]);

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
          title: t('auth.session.closedTitle'),
          message: t('auth.session.closedMessage'),
          variant: 'error',
        });
      }
      dispatch(logout());
    });
  }, [dispatch]);

  // TEŞHİS: navigationKey değişimi TÜM navigator ağacını remount eder → her
  // ekranın mount-effect'leri (fetch'ler dahil) yeniden koşar. "Boot'ta her
  // istek ×2" şüphesinin kanıtı/aklanması için her flip'i logla.
  // Login/logout geçişindeki flip normaldir; oturum ORTASINDA görülen
  // flip bug'dır. DİKKAT: bu blok koşulsuz hook bölgesinde durmalı — aşağıdaki
  // erken-return'lerin altına inerse Rules of Hooks patlar (yaşandı).
  const diagNavKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${(user?.isMailVerified || user?.isProfileCreated) ? 'verified' : 'unverified'}`;
  const prevNavKeyRef = useRef(diagNavKey);
  useEffect(() => {
    if (prevNavKeyRef.current !== diagNavKey) {
      devLog(`[nav] navigationKey flip: ${prevNavKeyRef.current} → ${diagNavKey} (full navigator remount)`);
      prevNavKeyRef.current = diagNavKey;
    }
  }, [diagNavKey]);

  // Analytics kimliği — login'de bağla, logout'ta temizle (bir sonraki
  // kullanıcı önceki kimliğe yazılmasın). Key yoksa no-op.
  useEffect(() => {
    const uid = user?.userId || user?.id;
    if (isAuthenticated && uid) {
      analytics.identify(String(uid));
    } else if (!isAuthenticated) {
      analytics.reset();
    }
  }, [isAuthenticated, user?.userId, user?.id]);

  // RevenueCat init + subscription status when authenticated.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let cancelled = false;
    (async () => {
      initRevenueCat(user.userId);
      if (user.userId) {
        await loginRevenueCat(user.userId).catch(() => {});
      }
      if (!cancelled) {
        // Status önce, reconcile sonra: reconcile RC SDK ile REDUX'taki backend
        // değerini karşılaştırıyor, o yüzden taze status'un oturması gerekiyor.
        await dispatch(fetchSubscriptionStatus());
        if (!cancelled) dispatch(reconcileIfMismatched());
      }
      if (__DEV__) mark('revenuecat-init');
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.userId, dispatch]);

  // RC SDK abonelik değişimlerini (yenileme, iptal, billing issue, expire) push
  // eder. Bu listener olmadan bunları ancak bir sonraki foreground `/status`
  // çağrısında öğreniyorduk — iptal/ödeme sorunu bandı saatlerce gecikebiliyordu.
  // RC'nin değerini state'e YAZMIYORUZ, sadece backend'i tazeleme sinyali.
  useEffect(() => {
    if (!isAuthenticated || !hasToken) return;
    return addCustomerInfoListener(() => {
      dispatch(fetchSubscriptionStatus());
    });
  }, [isAuthenticated, hasToken, dispatch]);

  // ============ SignalR lifecycle + Hub → Redux bridge ============
  useEffect(() => {
    if (!isAuthenticated || !hasToken) {
      realtimeService.disconnect().catch(() => {});
      dispatch(resetChat());
      // Gizlilik: MMKV chat cache'ini SENKRON purge et (logout + ForceLogout +
      // refresh-fail hepsi bu daldan geçer). resetChat'ten SONRA — redux-persist'in
      // 1.5sn throttle penceresinde app kill edilirse önceki kullanıcının mesajları
      // diskte kalabilirdi; geç flush olan pending write de artık boş state yazar.
      clearChatCache();
      return;
    }

    let mounted = true;

    realtimeService
      .connect()
      .then(() => {
        if (__DEV__) mark('signalr-connected');
      })
      .catch((err) => {
        console.warn('SignalR initial connect failed:', shortNetError(err));
      });

    const selfUserId = user?.userId || user?.id;

    // Delivered-ack coalescing: partner bir mesaj burst'ünü ack'lediğinde sunucu
    // her mesaj için ayrı MessageDelivered push'u atıyor. Her birini tek tek
    // dispatch etmek messages array'ini N kez yeniden kurup ChatScreen'in tüm
    // VirtualizedList hücre wrapper'larını N kez re-render ettiriyordu (commit-storm).
    // Push'ları bir frame boyunca tamponlayıp tek batch dispatch'e indiriyoruz.
    let deliveredBuffer: {
      messageId: string;
      conversationId: string;
      deliveredAt: string;
    }[] = [];
    let deliveredFlushTimer: ReturnType<typeof setTimeout> | null = null;
    const flushDelivered = () => {
      deliveredFlushTimer = null;
      if (!mounted || deliveredBuffer.length === 0) return;
      const batch = deliveredBuffer;
      deliveredBuffer = [];
      dispatch(messagesDeliveredBatch(batch));
    };

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
          ct === 1 ? t('chat.media.photo') :
          ct === 2 ? t('chat.media.voice') :
          ct === 3 ? t('chat.media.video') :
          (msg.content || '').trim() || t('chat.media.newMessage');

        showMessageToast({
          senderName: conv.partnerDisplayName || 'Yeni mesaj',
          photoUrl: conv.partnerProfileImageUrl,
          preview,
          conversationId: msg.conversationId,
          partnerUserId: conv.partnerUserId,
        });
      }),
      realtimeService.on('MessageSent', (msg) => mounted && dispatch(messageSent(msg))),
      realtimeService.on('MessagesRead', (payload) => {
        if (!mounted) return;
        dispatch(messagesRead({ ...payload, _selfUserId: selfUserId }));
      }),
      realtimeService.on('MessageDelivered', (payload) => {
        if (!mounted) return;
        deliveredBuffer.push(payload);
        if (!deliveredFlushTimer) deliveredFlushTimer = setTimeout(flushDelivered, 50);
      }),
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
        analytics.capture('match_created', { conversationId: m.conversationId });
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
        if (notif?.type !== 'Match' && notif?.type !== 'Message') return;
        // ReceiveMessage / MatchNotification handler'ları zaten Redux state'i
        // authoritative güncelliyor (receiveMessage → updateConversationLastMessage
        // preview + sıralama; matchNotification → yeni conv'ı unshift).
        // NewNotification burada sadece defensive: bilinmeyen bir convId için
        // fetch. Aksi halde her mesajda gereksiz GET /conversations atıyorduk.
        const convId = notif?.conversationId || notif?.relatedEntityId;
        if (!convId) return;
        const exists = ((store.getState() as any).chat?.conversations ?? [])
          .some((c: any) => c.conversationId === convId);
        if (!exists) {
          console.warn('[conv] refetch tag=unknown-conv-notif', convId);
          dispatch(fetchConversations({ force: true }));
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
      //
      // Sinyal `Clients.User(userId)` ile kullanıcının tüm bağlantılarına
      // gidiyor — girişi yapan cihazın kendi bağlantıları dahil. Kendi
      // login'imizden hemen sonra geldiyse yok say: aksi halde kullanıcı yeni
      // açtığı oturumdan "başka cihazdan girildi" diyerek atılıyor. Gerçek bir
      // başka-cihaz girişi bu pencereye denk gelirse kaybolmaz; token'ımız zaten
      // revoke olduğu için ilk refresh'te `new_login_elsewhere` ile işlenir.
      realtimeService.on('ForceLogout', async () => {
        if (!mounted) return;
        if (isSelfInflictedForceLogout()) {
          console.warn('[auth] ForceLogout yok sayıldı — kendi login akışımız');
          return;
        }
        showInfoToast({
          title: t('auth.session.closedTitle'),
          message: t('auth.session.closedMessage'),
          variant: 'error',
        });
        await realtimeService.disconnect().catch(() => {});
        dispatch(logout());
      }),
      realtimeService.on('__connectionStateChanged', (state) => {
        // Force-refetch yalnız RE-connect'te (kopukluk penceresinde kaçan mesaj
        // olabilir — SignalR "en fazla bir kez" teslim eder). İLK bağlantıda
        // atlanır: boot zaten hemen aşağıda fetchConversations çağırıyor, ikinci
        // istek gereksizdi (açılış raporundaki 2× /conversations).
        if (state === 'reconnecting' || state === 'disconnected') {
          hadConnectionDropRef.current = true;
        } else if (state === 'connected' && hadConnectionDropRef.current) {
          hadConnectionDropRef.current = false;
          dispatch(fetchConversations({ force: true }));
          dispatch(fetchUnreadCount());
        }
      }),
    ];

    dispatch(fetchConversations());
    dispatch(fetchUnreadCount());

    return () => {
      mounted = false;
      if (deliveredFlushTimer) clearTimeout(deliveredFlushTimer);
      unsubscribers.forEach((u) => u && u());
    };
  }, [isAuthenticated, hasToken, dispatch]);

  // ============ Push notification lifecycle ============
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let mounted = true;

    setActiveConversationGetter(() => activeConvRef.current);
    registerForPushNotifications().catch(() => {});

    // Tüm tap yolları aynı boot gate'inden geçiyor. Sebebi: expo-notifications
    // cold start'ta bekleyen tap response'unu listener register olur olmaz replay
    // ediyor (NotificationCenterManager.pendingResponses) — yani boot'un en yoğun
    // anında. Uygulama zaten ayaktaysa gate ilk tick'te (~120ms) geçtiği için
    // foreground/background tap'lerde gecikme hissedilmez.
    const routeIfMounted = (data: Record<string, any>) => {
      if (!mounted) return;
      whenBootSettled(() => {
        if (!mounted) return;
        routeFromNotification(data);
      });
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

    // Quit state'ten cold start ile açılış — FCM getInitialNotification.
    // Boot ile yarışmasın diye whenBootSettled arkasında (bkz. helper yorumu).
    getInitialNotificationData().then((data) => {
      if (data) routeIfMounted(data);
    });

    return () => {
      mounted = false;
      unsubs.forEach((u) => u && u());
    };
  }, [isAuthenticated, token]);

  const routeFromNotification = useCallback((data: Record<string, any>) => {
    // type yoksa payload'ı çözemedik demektir — bilinmeyen bildirimi Notifications'a
    // yönlendirip doğru routing'i ezmektense hiç navigate etmiyoruz.
    if (!data?.type) return;
    // Cold start'ta (quit state'ten push tap) getInitialNotification,
    // NavigationContainer mount olmadan önce resolve olabiliyor → navigate sessizce
    // düşüyordu. Hazır değilse kısa süre bekleyip tekrar dene.
    if (!navigationRef.isReady()) {
      whenNavigationReady(() => routeFromNotification(data));
      return;
    }
    // Aynı tap hem FCM (onNotificationOpenedApp) hem expo-notifications response
    // listener'ı tarafından yakalanabiliyor → çift navigate olmasın.
    const dedupeKey = `${data.type}:${data.conversationId || data.relatedEntityId || ''}:${data.timestamp || ''}`;
    if (dedupeKey === lastRoutedNotificationRef.current) return;
    lastRoutedNotificationRef.current = dedupeKey;

    const type = data.type;
    const relatedId = data.conversationId || data.relatedEntityId;

    switch (type) {
      case 'Message':
      case 'Match': {
        if (!relatedId) return;
        // Sohbet listesi elimizdeyse partner bilgisini doldur — aksi halde
        // ChatScreen header'ı boş isim/avatar ile açılıyor.
        const conv = ((store.getState() as any).chat?.conversations ?? []).find(
          (c: any) => c.conversationId === relatedId,
        );
        navigationRef.navigate('Chat', {
          conversationId: relatedId,
          partner: conv
            ? {
                userId: conv.partnerUserId,
                displayName: conv.partnerDisplayName,
                profileImageUrl: conv.partnerProfileImageUrl,
              }
            : undefined,
          isActive: conv ? conv.isActive : true,
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
        if (isAuthenticated && hasToken) {
          // connect() zaten Connecting/Reconnecting durumunda mevcut bağlantıyı
          // döndürüyor; isConnected() reconnect penceresinde false döndüğü için
          // burada guard'lamak ikinci bir soket açılmasına yol açıyordu.
          realtimeService.connect().catch(() => {});
          dispatch(fetchConversations({ force: true }));
          dispatch(fetchUnreadCount());
          // RC SDK ile backend çelişirse (webhook düşmedi / TRANSFER edilmemiş
          // anonim satın alma) `/reconcile`. Çelişki yoksa istek atılmıyor, bu
          // yüzden 60/dk paylaşımlı limite pratikte yük bindirmiyor. Status'un
          // OTURMASINI bekliyoruz — aksi halde karşılaştırma bayat redux
          // değeriyle yapılır ve gereksiz reconcile tetiklenir.
          dispatch(fetchSubscriptionStatus()).finally(() => {
            dispatch(reconcileIfMismatched());
          });
          // Discover cache resume'da bayat kalıyor → foreground'a dönünce
          // aktif mount olan matches query'sini refetch et. Aksi halde
          // önceki oturumdaki boş sayfa görünmeye devam ediyor ve
          // kullanıcı filtreye basıp Apply demeden veri gelmiyor.
          queryClient.invalidateQueries({
            queryKey: swipeKeys.matches,
            refetchType: 'active',
          });
          // Stats staleTime:Infinity + refetchOnMount:false — kendiliğinden
          // hiç tazelenmiyor. Satın alma sırasında yazılan optimistic premium
          // patch'i (webhook geç indiyse sync `synced:false` dönmüş olabilir)
          // burada gerçek backend değeriyle değiştiriyoruz.
          queryClient.invalidateQueries({
            queryKey: swipeKeys.stats,
            refetchType: 'active',
          });
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, hasToken, dispatch]);

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
        if (__DEV__) {
          mark('profile-loaded');
          summary();
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.userId, user?.isMailVerified, user?.isProfileCreated]);

  // Match overlay'i boot ZİNCİRİNİN TAMAMI bitene kadar mount etme. Modal =
  // BlurView + 110 parçalı konfeti + iki remote görsel; Discover mount olurken ya
  // da kardeş sekmeler staggered preload olurken üstüne binerse ShadowTree commit
  // storm'a giriyoruz. Bu yüzden yalnız "boot settled" (nav hazır + conversations
  // döndü) yetmiyor — sekme preload'ları da bitmiş olmalı (bkz. bootPhase.ts).
  // Gate kapalıyken pendingMatch state'te bekler, kaybolmaz. Latch bir kez açılır:
  // sıcak uygulamada gelen match'te hiç gecikme yok.
  useEffect(() => {
    const verified = user?.isMailVerified || user?.isProfileCreated;
    if (!(isAuthenticated && verified)) {
      setMatchGateOpen(false);
      return;
    }
    // Navigator henüz mount olmadıysa bekle — boot penceresini gerçek mount'tan say.
    if (!tokenInitialized || resumeRoute === null) return;

    let cancelled = false;
    let r1: number | undefined;
    let r2: number | undefined;
    const open = () => {
      if (cancelled) return;
      // Latch açıldıktan sonra iki frame daha bekle: son preload'un commit'i
      // boyansın, modal onun üstüne binmesin.
      r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => {
          if (!cancelled) setMatchGateOpen(true);
        });
      });
    };

    const unsubscribe = whenAppShellReady(open);
    // Discover hiç mount olmazsa (beklenmedik navigasyon durumu) latch açılmaz;
    // overlay sonsuza kilitlenmesin diye emniyet kemeri. Kabuk zincirinin normal
    // bitişinden (~4.4sn) ve Discover'ın kendi safety'sinden (6.5sn) belirgin
    // şekilde sonra.
    const safety = setTimeout(open, 9000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(safety);
      if (r1) cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [tokenInitialized, resumeRoute, isAuthenticated, user?.isMailVerified, user?.isProfileCreated]);

  // Splash yalnız authed+verified akışta (ağır Discover mount'u) bekletilir;
  // orada DiscoverScreen mount'unda gizlenir. Unauthed/unverified'de (Auth akışı,
  // ağır mount/crash yok) hemen gizle — kullanıcı splash'te beklemesin.
  useEffect(() => {
    if (!tokenInitialized || resumeRoute === null) return;
    const verified = user?.isMailVerified || user?.isProfileCreated;
    if (!(isAuthenticated && verified)) hideSplash("unauthed");
  }, [tokenInitialized, resumeRoute, isAuthenticated, user?.isMailVerified, user?.isProfileCreated]);

  if (!tokenInitialized || resumeRoute === null) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  const isVerifiedUser = user?.isMailVerified || user?.isProfileCreated;
  const showMainNavigator = isAuthenticated && isVerifiedUser;
  const needsKvkkConsent = showMainNavigator && kvkkVersion !== CURRENT_KVKK_VERSION;
  const navigationKey = `nav-${isAuthenticated ? 'auth' : 'guest'}-${isVerifiedUser ? 'verified' : 'unverified'}`;

  const handleOpenMatchChat = (conversationId: string) => {
    setPendingMatch(null);
    recordMatchForReview(); // sayaç artar, prompt yok — mesaj yazma niyetini kesme
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
      <NavigationContainer
        ref={navigationRef}
        key={navigationKey}
        theme={NAV_THEME}
        linking={LINKING}
        onReady={() => {
          navigationIntegration.registerNavigationContainer(navigationRef);
          const route = navigationRef.getCurrentRoute?.();
          if (route?.name) setCurrentRouteName(route.name);
        }}
        onStateChange={() => {
          // PostHog ekran funnel'ı — RegisterStep1-15 adları sayesinde kayıt
          // sihirbazı drop-off'u otomatik çıkar (key yoksa no-op).
          const route = navigationRef.getCurrentRoute?.();
          if (route?.name) {
            analytics.screen(route.name);
            // Network timeout log'u "hangi ekrandan atıldı" bilgisini buradan alır.
            setCurrentRouteName(route.name);
          }
        }}
      >
        {showMainNavigator ? <MainNavigator /> : <AuthNavigator initialRoute={resumeRoute as any} />}
      </NavigationContainer>

      {/* Global KVKK consent overlay */}
      <KVKKConsentScreen visible={needsKvkkConsent} />

      {/* Soft-delete banner */}
      {showMainNavigator && <DeletionBanner />}

      {/* Global "It's a Match!" overlay — boot oturmadan mount edilmez */}
      {showMainNavigator && matchGateOpen && (
        <MatchModal
          match={pendingMatch}
          myPhoto={
            __DEV__ && DEV_PREVIEW_MATCH_MODAL
              ? myPhoto ?? DEV_PREVIEW_MY_PHOTO
              : myPhoto
          }
          onClose={() => {
            setPendingMatch(null);
            // Kutlama kapandıktan sonra (2.+ match, 90g cooldown) rating iste.
            maybeRequestReviewAfterMatch();
          }}
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
