import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { NavigationContainer, DarkTheme, DefaultTheme, type LinkingOptions } from '@react-navigation/native';
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
  clearDeliveredNotifications,
} from '@/features/notifications/pushService';
import uiBus, { requestPhotoHighlight } from '@/shared/services/uiBus';
import { navigationRef } from '@/shared/services/navigationRef';
import { setCurrentRouteName } from '@/shared/services/currentRoute';
import { shortNetError } from '@/shared/utils/netError';
import { resolveMainPhotoUri } from '@/shared/utils/photoUri';
import { showMessageToast, showLikeToast, showInfoToast } from '@/shared/services/toaster';
import { store } from '@/shared/store';
import { clearChatCache } from '@/shared/store/mmkvStorage';

import SettingsModal from '@/features/profile/components/SettingsModal';
import {
  setCurrentAccessToken,
  setOnTokenRefreshed,
  setOnAuthLost,
  getCurrentAccessToken,
  refreshAccessToken,
} from '@/shared/services/api';
import { isTokenExpiringSoon } from '@/shared/utils/jwt';
import {
  isSelfInflictedForceLogout,
  isSelfInflictedPasswordChange,
  isSelfInflictedEmailChange,
  clearSelfLoginMark,
} from '@/shared/utils/sessionGuard';
import {
  setOnAccountBlocked,
  resetAccountBlockLatch,
  isAccountBlockReason,
} from '@/shared/utils/accountBlock';
import AccountBlockedScreen from '@/features/auth/components/AccountBlockedScreen';
import UpdateGateSheet from '@/features/appVersion/UpdateGateSheet';
import { useVersionGate } from '@/features/appVersion/useVersionGate';
import { authService } from '@/features/auth/authService';
import {
  setUserAndToken,
  clearRegistrationForm,
  setRegistrationStep,
  logout,
  accountBlocked,
  clearAccountBlock,
} from '@/features/auth/authSlice';
import {
  FIRST_REGISTRATION_STEP,
  isRegistrationStep,
  registrationResumeStack,
} from '@/features/auth/registrationFlow';
import { checkRegistrationToken } from '@/features/auth/registrationToken';
import {
  applySubscriptionChanged,
  fetchSubscriptionStatus,
  hydrateSyncPending,
  reconcileIfMismatched,
  resolvePendingPremiumSync,
  selectIsPremium,
  setPremium,
} from '@/features/profile/subscriptionSlice';
import { hasWitnessedPurchase, premiumSyncUserKey } from '@/features/profile/pendingPremiumSync';
import { addCustomerInfoListener, getRevenueCatAppUserId, initRevenueCat, logRevenueCatIdentity, loginRevenueCat, logoutRevenueCat } from '@/features/profile/subscriptionService';
import profileService from '@/features/profile/profileService';
import ProfileHiddenGate from '@/features/profile/components/ProfileHiddenGate';
import {
  hasPhotosAwaitingReview,
  normalizeProfileVisibility,
  type ProfileVisibility,
} from '@/features/profile/photoModeration';
import { ProfileVisibilityProvider } from '@/features/profile/profileVisibilityContext';
import { sendLocationHeartbeat, clearLocationHeartbeatState } from '@/features/profile/locationHeartbeat';
import { queryClient } from '@/shared/queries/queryClient';
import { swipeKeys } from '@/features/discover/swipeQueries';
import { flushPendingSuperlikeRedeems, redeemUserKey } from '@/features/discover/superlikeRedeem';
import { flushPendingRecoveryRedeems } from '@/features/discover/recoveryRedeem';
import { flushPendingNoteRedeems } from '@/features/discover/noteRedeem';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import KVKKConsentScreen, { CURRENT_KVKK_VERSION } from '@/features/auth/screens/KVKKConsentScreen';
import ChatScreen from '@/features/chat/screens/ChatScreen';
import NotificationsScreen from '@/features/notifications/screens/NotificationsScreen';
import ChangePasswordScreen from '@/features/auth/screens/ChangePasswordScreen';
import ChangeEmailScreen from '@/features/auth/screens/ChangeEmailScreen';
import DeletionBanner from '@/features/notifications/components/DeletionBanner';
import MatchModal from '@/features/notifications/components/MatchModal';
import SuperLikeFlame from '@/features/discover/components/SuperLikeFlame';
import realtimeService from '@/features/chat/realtimeService';
import { clearAllDrafts } from '@/features/chat/draftStore';
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
  conversationDeactivated,
  conversationRestored,
  historyRevealed,
  fetchConversations,
  fetchHistory,
  fetchUnreadCount,
  resetChat,
} from '@/features/chat/chatSlice';
import {
  addWhoLikedMe,
  removeWhoLikedMe,
  fetchWhoLikedMe,
} from '@/features/discover/swipeSlice';
import { useAppDispatch, useAppSelector } from '@/shared/hooks/redux';
import type { RootStackParamList } from '@/shared/types/navigation';
import { colors, isLight } from '../shared/theme/colors';
import { onBeforeThemeSwap } from '../shared/theme/themeMode';
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

/**
 * NavigationContainer'ın default light theme'i (white BG) iOS 26 liquid glass
 * tab bar transparent moduna geçtiğinde sızıp icon'ları siyaha flip ettiriyordu;
 * o yüzden tüm nav view'lerinin BG'si açıkça colors.bg'ye kilitleniyor.
 *
 * FONKSIYON, sabit DEĞİL: hem taban tema (Dark/Default) hem colors.bg temaya
 * bağlı — modül seviyesinde değerlenirse tema değişince bayat kalır
 * (bkz. shared/theme/colors.ts mutasyon sözleşmesi).
 */
const navTheme = () => {
  const base = isLight() ? DefaultTheme : DarkTheme;
  return {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.bg },
  };
};

/**
 * Tema değişiminde App.tsx AppNavigator'ı `key` ile remount ediyor. Remount
 * navigasyon yığınını sıfırlardı — kullanıcı Ayarlar'dayken tema değiştirip
 * Discover'a düşerdi. Unmount'ta mevcut state'i buraya alıp yeni container'a
 * initialState olarak veriyoruz.
 *
 * Yalnız tema takası için: auth geçişlerindeki remount (navigationKey) BİLEREK
 * yığını sıfırlıyor, oraya karışmıyoruz — bu yüzden snapshot tek kullanımlık.
 */
let themeSwapNavState: any = null;

/**
 * "Kaldığın yerden devam et" yığını. Yarım kalmış kayıt sihirbazı soğuk
 * açılışta baştan değil, en son bulunulan adımdan sürüyor.
 *
 * `initialRouteName` tek başına yetmiyor: yığında tek ekran olur, geri butonu
 * ölü kalırdı. Buraya adım-öncesi tüm rotaları dizip container'a initialState
 * olarak veriyoruz — ilk kare doğru ekranı çiziyor (reset/flash yok) ve geri
 * akışı da çalışıyor.
 *
 * themeSwapNavState gibi TEK KULLANIMLIK: container `key={navigationKey}` ile
 * remount olduğunda (kayıt bitip authed'e geçiş) eski yığın geri gelmesin.
 */
let resumeNavState: any = null;

onBeforeThemeSwap(() => {
  themeSwapNavState = navigationRef.isReady()
    ? navigationRef.getRootState()
    : null;
});

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
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ChangeEmail"
        component={ChangeEmailScreen}
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

/** `subscription/*` rate limit'i 60 istek/60 sn — foreground turu bu aralıkla. */
const SUBSCRIPTION_REFRESH_THROTTLE_MS = 60_000;

/**
 * Canlı beğeniden sonra rozeti sunucuyla hizalama gecikmesi. Toast'ın ekranda
 * kaldığı süreden uzun (kullanıcı bakarken sayı oynamasın), kullanıcının
 * Beğeniler'e geçmesinden kısa (oraya vardığında rozet çoktan doğru olsun).
 */
const LIKES_RECONCILE_DEBOUNCE_MS = 6_000;

/**
 * Aynı bildirim tap'i için FCM ve expo-notifications listener'larının ikisi de
 * ateşleyebiliyor; ikisi arası milisaniyeler. Pencere sadece o çakışmayı yutacak
 * kadar dar olmalı — daha genişi, kullanıcının aynı türden ikinci bildirime
 * basmasını da yutar.
 */
const NOTIFICATION_DEDUPE_WINDOW_MS = 3_000;

/**
 * `premiumExpiresAt` timer'ının kurulduğu en uzak nokta. setTimeout gecikmesi
 * 32-bit'e sığmazsa (~24.8 gün) ANINDA ateşliyor — yıllık abonelikte bu, her
 * boot'ta gereksiz bir `/status` demekti. Daha uzak bitişleri foreground turu
 * zaten yakalıyor.
 */
const MAX_EXPIRY_TIMER_MS = 24 * 60 * 60 * 1000;
/** Sunucu saatiyle cihaz saati arasındaki kaymaya karşı pay. */
const EXPIRY_TIMER_SKEW_MS = 5_000;

export default function AppNavigator() {
  const { t } = useTranslation();
  const { isAuthenticated, user, token, kvkkVersion, emailVerifiedToken, registrationEmail, registrationStep, accountBlock } =
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
  // Profil keşif havuzunda mı. `null` = BİLİNMİYOR (alanı göndermeyen sunucu
  // ya da henüz cevap gelmedi) — kapı yalnız açıkça "Visible değil" denince
  // açılır, aksi halde deploy öncesi herkesi engellerdik.
  const [profileVisibility, setProfileVisibility] =
    useState<ProfileVisibility | null>(null);
  // İncelemeyi bekleyen fotoğraf var mı — kapının engelleyici mi bilgilendirici
  // mi olacağını bu belirliyor (bkz. ProfileHiddenGate). `null` = bilinmiyor.
  const [photosAwaitingReview, setPhotosAwaitingReview] = useState<
    boolean | null
  >(null);
  // Ekranların okuduğu görünürlük bağlamı (Discover kaydırmayı buna göre
  // kapatıyor). Redux'a yazılmıyor — gerekçe profileVisibilityContext'te.
  const profileVisibilityInfo = useMemo(
    () => ({ visibility: profileVisibility, awaitingReview: photosAwaitingReview }),
    [profileVisibility, photosAwaitingReview],
  );
  const myPhotoRef = useRef<string | null>(null);
  useEffect(() => {
    myPhotoRef.current = myPhoto;
  }, [myPhoto]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Foreground abonelik tazelemesi için throttle damgası — boot'taki tur zaten
  // ayrı efektten geçiyor, o yüzden 0'dan başlıyor (ilk foreground'da çalışsın).
  const lastSubscriptionRefreshRef = useRef(0);
  // Redeem kuyruğunun hesap anahtarı; RC listener'ı ve AppState handler'ı bunu
  // ref'ten okuyor ki `user` değişimi listener'ı yeniden kurmasın.
  const redeemUserKeyRef = useRef<string | null>(null);
  const activeConvRef = useRef<string | null>(null);
  // SignalR ilk bağlantısı ile kopukluk-sonrası yeniden bağlanmayı ayırt eder —
  // conversations force-refetch yalnız reconnect'te yapılır (boot'ta zaten çekiliyor).
  const hadConnectionDropRef = useRef(false);
  const lastRoutedNotificationRef = useRef<string | null>(null);
  const lastRoutedNotificationAtRef = useRef(0);

  // Abonelik bitiş timer'ı için (aşağıdaki efekt). `selectIsPremium` expiresAt'i
  // client-side de doğruluyor, o yüzden bitiş anında kendiliğinden false'a döner.
  const isPremiumNow = useAppSelector(selectIsPremium);
  const premiumExpiresAt = useAppSelector(
    (s) => (s as any).subscription?.expiresAt as string | null,
  );

  // Zorunlu/önerilen güncelleme kapısı. Auth'tan BAĞIMSIZ — uç anonim çalışıyor
  // ve blokaj login ekranında da geçerli olmalı. Kontrol boot'u bekletmez;
  // `ok` (vakaların neredeyse tamamı) hiçbir şey mount etmez. FAIL-OPEN:
  // ağ/backend patlarsa kapı hiç açılmaz (bkz. versionService).
  const versionGate = useVersionGate();

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
      } else if (reason === 'password_changed') {
        // Başka bir cihazda şifre değişti/sıfırlandı. Hub sinyali kaçtıysa
        // (uygulama kapalıydı) kullanıcı buraya düşer — "oturum düştü" demek
        // yerine gerçek sebebi söyle.
        showInfoToast({
          title: t('auth.session.passwordChangedTitle'),
          message: t('auth.session.passwordChangedMessage'),
          variant: 'error',
        });
      } else if (reason === 'refresh_expired') {
        // 30 günlük refresh ömrü doldu. Sıradan bir olay — metin de öyle
        // olmalı; "güvenlik" dili kullanıcıyı hesabı ele geçirilmiş sanıp
        // şifre değiştirmeye koşturuyor.
        showInfoToast({
          title: t('auth.session.expiredTitle'),
          message: t('auth.session.expiredMessage'),
          variant: 'error',
        });
      } else if (reason === 'session_logout') {
        showInfoToast({
          title: t('auth.session.loggedOutTitle'),
          message: t('auth.session.loggedOutMessage'),
          variant: 'error',
        });
      } else if (reason === 'token_reuse') {
        // Ölü token grace penceresi DIŞINDA kullanıldı. Sakin ton: vakaların
        // çoğu saldırı değil, kaybolmuş bir refresh cevabı ya da geç uyanan
        // ikinci bir cihaz.
        showInfoToast({
          title: t('auth.session.endedTitle'),
          message: t('auth.session.endedMessage'),
          variant: 'error',
        });
      }
      // `session_expired` BİLEREK sessiz: gerekçesi bilinmeyen 401 (eski
      // backend, çıplak 401) ve istemci tarafı `token_missing` buraya düşüyor;
      // ikisinde de kullanıcıya söylenecek doğru bir şey yok.
      dispatch(logout());
    });
  }, [dispatch, t]);

  // Hesap yaptırımı (ban / askı / silme süreci) → oturumu düşür, kapatılamaz
  // ekranı aç. Tetikleyici her zaman sunucunun 403'ü; api.ts token'ları çoktan
  // temizledi, burada yalnız istemci tarafı kapanış kalıyor.
  //
  // `logout()` thunk'ı KULLANILMAZ: revoke-token ve push-token deactivate
  // çağırıyor, ikisi de yaptırımlı hesapta 403 döner. SignalR kapanışı,
  // chat cache purge'ü, queryClient temizliği ve premium sıfırlaması zaten
  // isAuthenticated=false geçişine bağlı efektlerden akıyor.
  useEffect(() => {
    setOnAccountBlocked((payload) => {
      realtimeService.disconnect().catch(() => {});
      // RC kullanıcısını anonime düşür — aynı cihazda başka hesap açılırsa
      // banlanan kullanıcının entitlement'ı sızmasın.
      logoutRevenueCat().catch(() => {});
      clearSelfLoginMark();
      // Bu yol `logout()` thunk'ından geçmiyor (bkz. yukarıdaki not) → tepsi
      // temizliğini ayrıca burada yapıyoruz.
      clearDeliveredNotifications();
      dispatch(accountBlocked(payload));
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
    // Redux `subscription` slice'ı persist EDİLMİYOR (diskten gelen isPremium
    // hesap değişiminde sızardı), bu yüzden reload sonrası "ödedi ama backend
    // görmüyor" bilgisi RAM'le birlikte gidiyordu. MMKV'deki kalıcı kaydı
    // ilk render'da senkron oku: ağ turu beklenmeden "aktivasyon sürüyor"
    // kartı görünsün, kullanıcı free'ye düşmüş sanmasın.
    // NOT: bu efekt her AÇILIŞTA DEĞİL, her MOUNT'ta koşuyor — AppNavigator
    // tema değişiminde `key={mode}` ile remount ediliyor (bkz. App.tsx). Yani
    // buradaki okuma kartın hayatta kalma yolu: kayıt diskte durduğu sürece
    // kart her tema değişiminde geri gelir. Bu yüzden yalnız GÖRDÜĞÜMÜZ satın
    // almalar okunuyor — RC cache'inden türetilmiş kayıtlar kartı diriltmesin.
    dispatch(hydrateSyncPending(hasWitnessedPurchase(premiumSyncUserKey(user))));
    (async () => {
      // Kimlik anahtarı `userId ?? id` — backend bazı yanıtlarda `userId`,
      // bazılarında `id` döndürüyor (superlike redeem kuyruğu da bu yüzden tek
      // helper'dan geçiyor). Eskiden burada YALNIZCA `user.userId` okunuyordu:
      // yalnız `id` taşıyan bir user nesnesinde RC ANONİM kullanıcıyla
      // (`$RCAnonymousID:…`) configure ediliyor ve `logIn` hiç çağrılmıyordu.
      // O durumda satın alma RC'de anonim kimliğe yazılır, webhook'taki
      // `app_user_id` hiçbir profile eşleşmez → backend premium'u kimseye
      // uygulamaz (SuperLike kotası da verilmez). Tam olarak bu semptom.
      const rcUserKey = premiumSyncUserKey(user);
      initRevenueCat(rcUserKey);
      if (rcUserKey) {
        await loginRevenueCat(rcUserKey).catch(() => {});
        // Doğrula ve uyuşmazlığı GÖRÜNÜR yap: bu eşleşme bozuksa hiçbir satın
        // alma hesaba işlemez ve sorun yalnızca sunucu loglarından anlaşılırdı.
        const rcAppUserId = await getRevenueCatAppUserId();
        if (rcAppUserId && rcAppUserId !== rcUserKey) {
          // eslint-disable-next-line no-console
          console.warn(
            `[RevenueCat] appUserID uyuşmuyor — RC: "${rcAppUserId}" / backend: "${rcUserKey}". ` +
              "Bu haldeki satın almalar backend'e uygulanmaz.",
          );
          analytics.capture("revenuecat_appuserid_mismatch", {
            rcAppUserId,
            backendUserId: rcUserKey,
          });
        }
        // Kimlik + aktif entitlement + SANDBOX bayrağı tek dökümde, teşhis
        // kaydına da yazılarak. Entitlement ADI teşhise dahil: backend RC REST
        // fallback'inde önce "premium"i arıyor, FE de `ENTITLEMENT_ID` ile onu
        // okuyor. RC dashboard'ında başka bir adla tanımlıysa
        // `reconcileIfMismatched` RC'yi "premium değil" görür, backend'le uyuşur
        // ve HİÇ tetiklenmez — uyuşmazlık sessizce kaybolur.
        //
        // Eskiden bu blok `__DEV__` içindeydi: sorunun tekrar üretildiği
        // TestFlight build'inde tam olarak hiçbir iz bırakmıyordu.
        await logRevenueCatIdentity(rcUserKey);
      }
      if (!cancelled) {
        // Status önce, reconcile sonra: reconcile RC SDK ile REDUX'taki backend
        // değerini karşılaştırıyor, o yüzden taze status'un oturması gerekiyor.
        await dispatch(fetchSubscriptionStatus());
        // Bekleyen satın alma varsa kısa turlu `/sync` — kayıt yoksa HİÇ istek
        // atmaz. Sandbox/webhook gecikmesinde premium'un geri geldiği tek yol.
        if (!cancelled) await dispatch(resolvePendingPremiumSync());
        if (!cancelled) dispatch(reconcileIfMismatched());
      }
      if (__DEV__) mark('revenuecat-init');
    })();
    return () => { cancelled = true; };
    // `user?.id` de dep: kurtarma kaydının anahtarı `userId ?? id` (backend iki
    // şekilde de döndürüyor), yalnız `userId`e bağlanınca `id`li hesapta efekt
    // yeniden koşmuyordu — superlike redeem efektindeki dep listesiyle aynı.
  }, [isAuthenticated, user?.userId, user?.id, dispatch]);

  // ── Tier değişti → premium'a göre şekillenen TÜM cache'leri tazele ────────
  // Tier kararını artık her yer tek kaynaktan okuyor (features/profile/
  // premiumTier), ama backend payload'larının İÇİNDEKİ premium'a bağlı veriler
  // (kota sayıları, filtre kilitleri, premium-scoped profil alanları) kendi
  // cache'lerinde donmuş kalıyor: `/swipe/stats` oturumda bir kez çekiliyor,
  // `/filters` modal açılışında. Bayrak anında düşse de SAYILAR eski kalırdı
  // (premium bitti ama "sınırsız swipe" yazıyor gibi). Geçişi tek yerden
  // duyurmak, her ekranın kendi tazeleme yamasını yazmasından daha güvenli —
  // eski hâlde her ekran bunu ayrı ayrı ve eksik yapıyordu.
  const prevPremiumTierRef = useRef(isPremiumNow);
  useEffect(() => {
    if (prevPremiumTierRef.current === isPremiumNow) return;
    prevPremiumTierRef.current = isPremiumNow;
    queryClient.invalidateQueries({ queryKey: swipeKeys.stats });
    queryClient.invalidateQueries({ queryKey: swipeKeys.filters });
  }, [isPremiumNow, queryClient]);

  // Abonelik bitiş anında tek atımlık tazeleme (§6-6). Kullanıcı uygulamayı
  // açık bırakırsa premium UI'ı bitişten sonra da göstermeye devam ediyordu;
  // ilk düzeltme ancak bir sonraki foreground'da geliyordu. `expiresAt`
  // değiştikçe timer yeniden kuruluyor (yenileme tarihi ileri alır).
  useEffect(() => {
    if (!isAuthenticated || !hasToken || !isPremiumNow || !premiumExpiresAt) return;
    const ms = new Date(premiumExpiresAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms > MAX_EXPIRY_TIMER_MS) return;
    const id = setTimeout(
      () => { dispatch(fetchSubscriptionStatus()); },
      Math.max(0, ms) + EXPIRY_TIMER_SKEW_MS,
    );
    return () => clearTimeout(id);
  }, [isAuthenticated, hasToken, isPremiumNow, premiumExpiresAt, dispatch]);

  // Parası alınmış ama krediye çevrilememiş superlike paketleri — açılışta
  // tekrar redeem et. Satın alma anında RC webhook'u backend'e inmemişse redeem
  // 402 döner ve transaction MMKV kuyruğuna yazılır; tek kurtarma noktası bu.
  // Endpoint idempotent, kuyruk boşsa hiç istek atılmaz.
  useEffect(() => {
    const uid = isAuthenticated && hasToken ? redeemUserKey(user) : null;
    redeemUserKeyRef.current = uid;
    if (!uid) return;
    // Boot'un ağır fazına istek eklemesin — kullanıcı bu akışta beklemiyor.
    const task = InteractionManager.runAfterInteractions(() => {
      flushPendingSuperlikeRedeems(uid).catch(() => {});
    });
    return () => task.cancel?.();
  }, [isAuthenticated, hasToken, user?.userId, user?.id]);

  // RC SDK abonelik değişimlerini (yenileme, iptal, billing issue, expire) push
  // eder. Bu listener olmadan bunları ancak bir sonraki foreground `/status`
  // çağrısında öğreniyorduk — iptal/ödeme sorunu bandı saatlerce gecikebiliyordu.
  // RC'nin değerini state'e YAZMIYORUZ, sadece backend'i tazeleme sinyali.
  useEffect(() => {
    if (!isAuthenticated || !hasToken) return;
    return addCustomerInfoListener(() => {
      // Yalnız `/status` GET etmek yetmiyordu: RC entitlement'ı boot'tan
      // saniyeler sonra teslim ettiğinde (ya da başka cihazda satın alındığında)
      // backend hâlâ `false` döndüğü için aynı cevap tekrar okunuyor, premium
      // hiç geri gelmiyordu. Çelişki varsa `reconcile` RC REST fallback'ini
      // tetikler; çelişki yoksa istek atmaz (60/60 sn limitini yemesin).
      dispatch(fetchSubscriptionStatus()).finally(() => {
        dispatch(reconcileIfMismatched());
      });
      // Consumable satın alma da bu listener'ı tetikliyor (doküman §6.3'ün üç
      // boşaltma noktasından biri). Kuyruk boşsa istek atılmaz.
      flushPendingSuperlikeRedeems(redeemUserKeyRef.current).catch(() => {});
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
      // Taslaklar clearChatCache ile aynı MMKV dosyasında — disk zaten silindi;
      // bu çağrı bellek içi snapshot'ı da sıfırlar ki aynı process'te başka
      // hesaba girilirse önceki kullanıcının taslakları listede görünmesin.
      clearAllDrafts();
      // Konum debounce damgası kullanıcıya özgü — sonraki hesap ilk açılışta
      // kendi koordinatını göndersin.
      clearLocationHeartbeatState();
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

    // Canlı IncomingLike rozeti iyimser artırıyor (addWhoLikedMe) — ama o
    // beğenenin WhoLikedMe cevabına GİRECEĞİ garanti değil: backend listeyi
    // deaktif / shadow-ban'li / silme sürecindeki kullanıcıları eleyerek
    // döndürürken IncomingLike event'i bu filtreden geçmiyor. Fark rozette
    // birikir ve "rozet 3, kart 2" olarak görünür. Bu yüzden iyimser yazım
    // kısa bir pencerede kanonik cevapla kapatılıyor: tek doğruluk kaynağı
    // sunucu, iyimser sayaç yalnızca o pencereyi dolduran bir tahmin.
    //
    // Debounce: beğeni burst'ünde tek tazeleme yeter. Tazelemeyi tercihen
    // Likes ekranı yapar (likesDirty) — o tek istekle hem rozeti hem kart
    // listesini aynı cevaptan yazar; ekran mount değilse (preload atlanmış
    // olabilir, bkz. DiscoverScreen preloadUnlessInChat) rozet için thunk'a
    // düşeriz. Arka planda hiç tetiklenmez: foreground turu zaten çekiyor.
    let likesReconcileTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLikesReconcile = () => {
      if (appStateRef.current !== 'active') return;
      if (likesReconcileTimer) clearTimeout(likesReconcileTimer);
      likesReconcileTimer = setTimeout(() => {
        likesReconcileTimer = null;
        if (!mounted || appStateRef.current !== 'active') return;
        if (uiBus.hasListeners('likesDirty')) uiBus.emit('likesDirty');
        else dispatch(fetchWhoLikedMe());
      }, LIKES_RECONCILE_DEBOUNCE_MS);
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
        // Eşleşen kişi artık "gelen beğeni" değil — rozet Likes ekranı mount
        // olmasa da düşsün (ekran kendi listesini uiBus'tan budar).
        dispatch(removeWhoLikedMe(m?.matchedUserId));
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
        dispatch(addWhoLikedMe(payload?.likerUserId));
        uiBus.emit('incomingLike', payload);
        scheduleLikesReconcile();

        if (appStateRef.current !== 'active') return;
        // Düz beğenide kimlik premium'a kilitli (bkz. LikesScreen / bildirim
        // feed'i). Ad ve foto düşünce toast kendi jenerik metnine + kalp
        // ikonuna geri dönüyor.
        const identityLocked =
          !payload?.isSuperLike && !selectIsPremium(store.getState());
        showLikeToast({
          kind: payload?.isSuperLike ? 'superLike' : 'like',
          senderName: identityLocked ? null : payload?.likerDisplayName,
          photoUrl: identityLocked ? null : payload?.likerPhotoUrl,
        });
      }),
      // Karşı taraf eşleşmeyi kaldırdı. BİLDİRİM GÖSTERİLMEZ (ürün kararı:
      // unmatch simetrik ve sessizdir) — sohbet yalnızca kapalıya düşer.
      realtimeService.on('ConversationDeactivated', (payload) => {
        if (!mounted) return;
        const convId = payload?.conversationId;
        // restorableUntil = null: geri alma yalnız unmatch EDENE açık, bu event
        // karşı tarafa gidiyor — "geri al" butonu bizde çıkmamalı.
        if (convId) {
          dispatch(
            conversationDeactivated({ conversationId: convId, restorableUntil: null }),
          );
        }
        dispatch(fetchConversations({ force: true }));
      }),
      realtimeService.on('ConversationRestored', (payload) => {
        if (!mounted) return;
        const convId = payload?.conversationId;
        if (convId) dispatch(conversationRestored({ conversationId: convId }));
        dispatch(fetchConversations({ force: true }));
      }),
      // Geçmiş ORTAK: karşı taraf "eski sohbeti göster"e bastıysa bizim de
      // ekranımız güncellenir. Kapıyı kapat + ilk sayfayı yeniden çek (gizli
      // mesajlar artık cevaba dahil).
      realtimeService.on('ConversationHistoryRevealed', (payload) => {
        if (!mounted) return;
        const convId = payload?.conversationId;
        if (!convId) return;
        dispatch(historyRevealed({ conversationId: convId }));
        dispatch(fetchHistory({ conversationId: convId, cursor: null, pageSize: 30 }));
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
        // Sohbet kapalı/erişilemez (karşı taraf unmatch etti ya da engelledi).
        // Backend unmatch için ayrı bir event yayınlamıyor — bu, uygulama
        // açıkken alabileceğimiz TEK anlık sinyal. Payload'da conversationId
        // yok (kontrat: { code, message? }); kapalı sohbete gönderim/typing
        // yalnız açık sohbetten çıkabileceği için aktif sohbet doğru hedef.
        if (err?.code === 'CONVERSATION_ERROR' || err?.code === 'FORBIDDEN') {
          const convId = activeConvRef.current;
          // Kapatan taraf BİZ değiliz (kendi unmatch'imizde gönderim denemiyoruz)
          // → geri alma penceresi yok, "geri al" butonu çıkmamalı.
          if (convId) {
            dispatch(
              conversationDeactivated({ conversationId: convId, restorableUntil: null }),
            );
          }
          dispatch(fetchConversations({ force: true }));
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
      //
      // `reason` artık birden çok senaryo taşıyor: new_login_elsewhere (mevcut),
      // banned / suspended / account_deleted (yaptırım), email_reverify_required,
      // moderation_action.
      realtimeService.on('ForceLogout', async (payload) => {
        if (!mounted) return;
        const reason = payload?.reason;

        // Yaptırım kontrolü self-login filtresinden ÖNCE: ban sinyali kendi
        // login penceremize denk gelirse yutulmamalı. Hub payload'ında gerekçe
        // metni ve bitiş tarihi YOK — dolu gövdeyi validate-token'dan aldırıyoruz,
        // 403'ü interceptor yakalayıp ban ekranını açıyor.
        if (isAccountBlockReason(reason)) {
          await authService.probeAccountStatus().catch(() => {});
          return;
        }

        if (isSelfInflictedForceLogout()) {
          console.warn('[auth] ForceLogout yok sayıldı — kendi login akışımız');
          return;
        }

        // Şifre değişikliği/sıfırlaması tüm oturumları düşürüyor ve sinyal
        // işlemi YAPAN cihaza da gidiyor. O cihazda damga var: şifre değiştirme
        // cevabındaki yeni token setiyle oturum devam ediyor, sıfırlamada da
        // kapanışı ekran yönetiyor. Diğer cihazlarda damga yok → normal çıkış,
        // istenen davranış bu.
        if (reason === 'password_changed' || reason === 'password_reset') {
          if (isSelfInflictedPasswordChange()) {
            console.warn('[auth] ForceLogout yok sayıldı — şifreyi bu cihaz değiştirdi');
            return;
          }
          showInfoToast({
            title: t('auth.session.passwordChangedTitle'),
            message: t('auth.session.passwordChangedMessage'),
            variant: 'error',
          });
          await realtimeService.disconnect().catch(() => {});
          dispatch(logout());
          return;
        }

        // E-posta değişikliği tüm oturumları düşürüyor. Şifre değişikliğinden
        // farkı: o cevapta yeni token seti veriyordu, bu VERMİYOR — yani işlemi
        // yapan cihaz da mutlaka çıkıyor. Damganın işi çıkışı engellemek değil,
        // sahibini belirlemek: ChangeEmail ekranı kendi mesajını (yeni adres +
        // üniversite değiştiyse onun bilgisi) gösterip logout'u kendisi
        // dispatch ediyor, araya jenerik bir toast girmemeli.
        //
        // Diğer cihazlarda damga yok → aşağıdaki metinle normal çıkış.
        if (reason === 'email_changed') {
          if (isSelfInflictedEmailChange()) {
            console.warn('[auth] ForceLogout yok sayıldı — e-postayı bu cihaz değiştirdi');
            return;
          }
          showInfoToast({
            title: t('auth.session.emailChangedTitle'),
            message: t('auth.session.emailChangedMessage'),
            variant: 'error',
          });
          await realtimeService.disconnect().catch(() => {});
          dispatch(logout());
          return;
        }

        // Yaptırım değil: e-posta yeniden doğrulaması isteniyor. Ayrı bir ekran
        // yok — çıkış yaptırıyoruz, tekrar giriş yapıldığında backend kullanıcıyı
        // isMailVerified=false döneceği için AuthNavigator zaten doğrulama
        // adımına düşürüyor.
        if (reason === 'email_reverify_required') {
          showInfoToast({
            title: t('auth.session.reverifyTitle'),
            message: t('auth.session.reverifyMessage'),
            variant: 'error',
          });
          await realtimeService.disconnect().catch(() => {});
          dispatch(logout());
          return;
        }

        // "Başka cihazdan giriş" toast'ı YALNIZ backend bunu açıkça söylediğinde.
        //
        // HUB'DA reason HİÇBİR ZAMAN NULL DEĞİL — üç emit noktasının üçü de
        // literal gönderiyor (login → new_login_elsewhere, RevokeAllSessions →
        // password_changed/password_reset, ModerationActionService → yaptırım
        // kodları veya moderation_action). Buradaki null kontrolü savunma
        // amaçlı; asıl null REST tarafında, /refresh-token 401 gövdesinde.
        //
        // Asıl kazanç `moderation_action`: yukarıdaki dalların hiçbirine
        // uymuyor, eskiden buradan TOAST'SIZ geçip kullanıcıyı hiçbir açıklama
        // olmadan login'e atıyordu. Artık nötr metin görüyor. Aynı metin,
        // ileride eklenecek reason'lar için de doğru varsayılan — bilmediğimiz
        // bir gerekçeyi "hesabına başka biri girdi" diye sunmak, kullanıcıyı
        // hesabı ele geçirilmiş sanıp şifre değiştirmeye koşturuyordu.
        if (reason === 'new_login_elsewhere') {
          showInfoToast({
            title: t('auth.session.closedTitle'),
            message: t('auth.session.closedMessage'),
            variant: 'error',
          });
        } else {
          console.warn(`[auth] ForceLogout — ele alınmayan reason: ${String(reason)}`);
          showInfoToast({
            title: t('auth.session.endedTitle'),
            message: t('auth.session.endedMessage'),
            variant: 'error',
          });
        }
        await realtimeService.disconnect().catch(() => {});
        dispatch(logout());
      }),
      // Premium durumu ANLIK değişti: admin grant/revoke, mağaza webhook'u ya da
      // backend `/sync` upgrade/downgrade'i. Payload `/api/subscription/status`
      // ile birebir aynı gövdeyi taşıyor, bu yüzden EK FETCH YOK — thunk doğrudan
      // uyguluyor (bir HTTP turu ve 60/dk paylaşımlı limitten bir ısırık daha az).
      //
      // "Premium ekranlarından çıkar" ayrıca yapılmıyor: gating tek bir redux
      // alanından (`selectIsPremium`) okunuyor, state yazıldığı an kilitli
      // özellikler (Likes blur'u, filtre tavanları, sınırsız swipe) kendiliğinden
      // kapanıyor. Açık bir paywall'ın CTA'sı da aynı selector'a bağlı.
      realtimeService.on('SubscriptionChanged', (payload) => {
        if (!mounted) return;
        dispatch(applySubscriptionChanged(payload))
          .unwrap()
          .then((res) => {
            if (!mounted || !res?.applied) return;
            // Premium'a bağlı SERVER state'i de bayat: swipe kotaları ve filtre
            // tavanları tier'e göre dönüyor. Deste (`matches`) BİLEREK yalnız
            // işaretleniyor: aktif refetch, kullanıcı swipe ederken üstteki kartı
            // altından değiştirir (foreground turundaki aynı gerekçe).
            queryClient.invalidateQueries({ queryKey: swipeKeys.stats });
            queryClient.invalidateQueries({ queryKey: swipeKeys.filters });
            queryClient.invalidateQueries({
              queryKey: swipeKeys.matches,
              refetchType: 'none',
            });
            // Toast YALNIZ admin işlemlerinde. Mağaza kaynaklı değişimi
            // (`store_expired`, `store_purchase`, `sync_*`) kullanıcı zaten
            // kendisi tetikledi ya da bekliyordu; orada bildirim gürültü olur.
            if (res.reason === 'admin_revoke' && !res.isPremium) {
              showInfoToast({
                title: t('purchase.revokedTitle'),
                message: t('purchase.revokedMessage'),
                variant: 'error',
              });
            } else if (res.reason === 'admin_grant' && res.isPremium) {
              showInfoToast({
                title: t('purchase.grantedTitle'),
                message: t('purchase.grantedMessage'),
                variant: 'success',
              });
            }
          })
          .catch(() => {});
      }),
      // Bir fotoğrafın moderasyon kararı değişti (admin onay/red, rescan,
      // itiraz sonucu). Gövde GET'in kanonik bloklarıyla birebir aynı, ek fetch
      // gerekmiyor — ama profil cache'i (10 sn TTL) BUST edilmeli: aksi halde
      // ekran bildirimin anlattığından önceki hâli gösterirdi.
      realtimeService.on('PhotoModerationChanged', (payload) => {
        if (!mounted) return;
        profileService.bustProfileCache();
        const nextVisibility = normalizeProfileVisibility(payload);
        if (nextVisibility) setProfileVisibility(nextVisibility);
        // Gövde yalnız DEĞİŞEN fotoyu taşıyor (liste değil): buradan "bekleyen
        // foto kaldı mı" sorusu cevaplanamaz. Alan gelirse kullan, gelmezse
        // mevcut bilgiyi koru ve kanonik listeyi tazele — aksi halde son
        // inceleme bittikten sonra bayrak `true` kalır ve kapı, engelleyici
        // olması gerekirken bilgilendirme kipinde kalırdı.
        const nextAwaiting = hasPhotosAwaitingReview(payload);
        if (nextAwaiting !== null) setPhotosAwaitingReview(nextAwaiting);
        else uiBus.emit('profileDirty');
        // Profil ekranı mount ise kendi tazelemesini yapsın; değilse cache
        // bust'ı sayesinde bir sonraki açılışta taze veri gelir.
        uiBus.emit('photoModerationChanged', payload);
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
          // Kopukluk penceresinde atılan `SubscriptionChanged` KAYBOLDU — hub
          // event'leri kalıcı değil, kimse yeniden göndermiyor. Bu olmadan
          // "metroda premium iptal edildi, yüzeye çıkınca uygulama hâlâ premium
          // gösteriyor" senaryosu bir sonraki foreground turuna kadar kırık
          // kalırdı (uygulama önde kaldığı sürece o tur hiç gelmiyor).
          // Foreground turuyla aynı throttle'ı paylaşıyor: reconnect ile
          // background→active peş peşe gelebiliyor, iki tur da aynı cevabı çeker.
          if (
            Date.now() - lastSubscriptionRefreshRef.current >
            SUBSCRIPTION_REFRESH_THROTTLE_MS
          ) {
            lastSubscriptionRefreshRef.current = Date.now();
            dispatch(fetchSubscriptionStatus());
          }
        }
      }),
    ];

    dispatch(fetchConversations());
    dispatch(fetchUnreadCount());
    // Beğeni rozeti + liker id kümesi. Likes sekmesi lazy mount olduğu için
    // buradan çekilmezse rozet ilk ziyarete kadar 0 kalıyor ve Discover'da
    // kaçırılan eşleşme tespit edilemiyordu.
    dispatch(fetchWhoLikedMe());

    return () => {
      mounted = false;
      if (deliveredFlushTimer) clearTimeout(deliveredFlushTimer);
      if (likesReconcileTimer) clearTimeout(likesReconcileTimer);
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

  // Cold start temizliği — push lifecycle efektinden AYRI duruyor: o efekt
  // `token`'a bağlı ve sessiz refresh her rotasyonda onu değiştiriyor; oraya
  // konsaydı uygulama arka plandayken tetiklenen bir rotasyon kullanıcının
  // tepsisini süpürüyordu. Burada `hasToken` boolean'ı + 'active' guard'ı var.
  useEffect(() => {
    if (!isAuthenticated || !hasToken) return;
    if (AppState.currentState !== 'active') return;
    clearDeliveredNotifications();
  }, [isAuthenticated, hasToken]);

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
    // listener'ı tarafından yakalanabiliyor → çift navigate olmasın. Dedupe ZAMAN
    // PENCERELİ: iki listener aynı tap için milisaniyeler arayla ateşliyor, ama
    // anahtar süresiz tutulursa ayırt edici alanı olmayan payload'lar (Like/
    // SuperLike'ta relatedEntityId ve timestamp gelmeyebiliyor → anahtar hep
    // "Like::") process ömrü boyunca TEK kez route ediliyordu; ikinci beğeni
    // bildirimine basmak hiçbir şey yapmıyordu.
    const dedupeKey = `${data.type}:${data.conversationId || data.relatedEntityId || ''}:${data.timestamp || ''}`;
    const now = Date.now();
    if (
      dedupeKey === lastRoutedNotificationRef.current &&
      now - lastRoutedNotificationAtRef.current < NOTIFICATION_DEDUPE_WINDOW_MS
    ) {
      return;
    }
    lastRoutedNotificationRef.current = dedupeKey;
    lastRoutedNotificationAtRef.current = now;

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
      case 'SuperLike':
      // Not da bir beğeni — hedefi Likes ekranı. Ayrı bir kart açmıyor:
      // yorum zaten liker kartının içinde duruyor.
      case 'Note': {
        // Bildirimden gelen kullanıcı o beğeniyi listede görmeyi bekliyor →
        // LikesScreen'in tazelik eşiğini ATLAT. Ekranın kendi focus/foreground
        // tazelemesi "30 sn'den eskiyse çek" diyor; kısa bir arka plan turundan
        // (uygulamayı 10 sn kapatıp bildirime basmak) sonra bu eşik tutuyor ve
        // liste bayat kalıyordu. Navigate'ten ÖNCE emit ediyoruz ki istek ekran
        // görünür olmadan yola çıksın.
        uiBus.emit('likesDirty');
        // Likes tab HomeTabs stack'inin altında — nested navigate
        navigationRef.navigate('HomeTabs' as never, { screen: 'Likes' } as never);
        return;
      }
      case 'PhotoRejected':
      case 'PhotoApproved':
      case 'PhotoAppealResolved': {
        // Karar bildirimden ÖNCEKİ hâli göstermesin diye önce cache bust.
        profileService.bustProfileCache();
        (navigationRef as any).navigate('HomeTabs', { screen: 'Profile' });
        // `relatedEntityId` = photoId (moderasyon sözleşmesi): düzenleme modalı
        // fotoğraflar bölümüne açılıp KARARIN VERİLDİĞİ foto vurgulansın —
        // kullanıcı 6 fotoğraf arasında hangisi olduğunu aramasın. İstek uiBus'ta
        // bekliyor: push'tan cold start'ta Profil sekmesi henüz mount değil.
        if (relatedId) requestPhotoHighlight(relatedId);
        return;
      }
      case 'ProfileHiddenInsufficientPhotos': {
        // Tek bir fotoğrafa değil, profilin bütününe dair: vurgulanacak hedef yok.
        profileService.bustProfileCache();
        (navigationRef as any).navigate('HomeTabs', { screen: 'Profile' });
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
  // Foreground turu, AppState handler'ından AYRI bir callback: aşağıdaki efekt
  // onu token tazeliğine göre KOŞULLU olarak öne alabilsin.
  const runForegroundSync = useCallback(() => {
    // connect() Connecting/Reconnecting durumunda mevcut bağlantıyı
    // döndürüyor; isConnected() reconnect penceresinde false döndüğü için
    // burada guard'lamak ikinci bir soket açılmasına yol açıyordu.
    realtimeService.connect().catch(() => {});
    dispatch(fetchConversations({ force: true }));
    dispatch(fetchUnreadCount());
    // Arka plandayken gelen beğeniler için IncomingLike event'i kaçmış
    // olabilir (hub replay yapmıyor) → rozet/küme tazelensin.
    dispatch(fetchWhoLikedMe());
    // RC SDK ile backend çelişirse (webhook düşmedi / TRANSFER edilmemiş
    // anonim satın alma) `/reconcile`. Çelişki yoksa istek atılmıyor, bu
    // yüzden 60/dk paylaşımlı limite pratikte yük bindirmiyor. Status'un
    // OTURMASINI bekliyoruz — aksi halde karşılaştırma bayat redux
    // değeriyle yapılır ve gereksiz reconcile tetiklenir.
    //
    // Throttle: `subscription/*` class-level 60 istek/60 sn. Kullanıcı
    // uygulamayı hızlı açıp kapatırsa (bildirim → geri → bildirim) bu blok
    // her seferinde 2-3 istek atıp limiti yiyordu.
    if (Date.now() - lastSubscriptionRefreshRef.current > SUBSCRIPTION_REFRESH_THROTTLE_MS) {
      lastSubscriptionRefreshRef.current = Date.now();
      dispatch(fetchSubscriptionStatus()).finally(() => {
        // Bekleyen satın alma varsa `/sync` turu, yoksa yalnız çelişki
        // kontrolü. İkisi de kayıt/çelişki yoksa istek atmıyor.
        dispatch(resolvePendingPremiumSync());
        dispatch(reconcileIfMismatched());
      });
    }
    // Discover cache resume'da bayat kalıyor → bayat İŞARETLE, çekme.
    // Eskiden burası `refetchType:'active'` idi: infinite query'de refetch
    // tüm sayfaları baştan çekiyor, backend swipe edilenleri elediği için
    // dizi kayıyor ve kullanıcı destenin ortasındayken üstteki kart
    // altından değişiyordu (bildirime bakıp geri dönmek yetiyordu).
    // Tazeleme kararını artık DiscoverScreen veriyor: deste boşsa
    // foreground'da hemen refetch + yoklama sayacı sıfırlanır, doluysa
    // desteye dokunulmaz. Orijinal gerekçe (önceki oturumdan kalan boş
    // sayfa) aynen karşılanıyor.
    queryClient.invalidateQueries({
      queryKey: swipeKeys.matches,
      refetchType: 'none',
    });
    // Stats staleTime:Infinity + refetchOnMount:false — kendiliğinden
    // hiç tazelenmiyor. Satın alma sırasında yazılan optimistic premium
    // patch'i (webhook geç indiyse sync `synced:false` dönmüş olabilir)
    // burada gerçek backend değeriyle değiştiriyoruz.
    queryClient.invalidateQueries({
      queryKey: swipeKeys.stats,
      refetchType: 'active',
    });
    // Parası alınmış ama krediye çevrilememiş superlike paketleri.
    // Eskiden YALNIZ cold start'ta deneniyordu: kullanıcı paketi alıp iki
    // kez 402 yedikten sonra uygulamayı arka plana atıp geri gelirse
    // kredi, tam bir restart olana kadar hesabına geçmiyordu. Webhook'un
    // geciktiği durumda en çok işleyecek boşaltma noktası tam da burası.
    flushPendingSuperlikeRedeems(redeemUserKeyRef.current).catch(() => {});
    // Şehir/ilçe backend'de konumdan türetiliyor → her foreground'da tek
    // atımlık koordinat. İzin yoksa/GPS yoksa sessizce no-op.
    sendLocationHeartbeat();
  }, [dispatch]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev.match(/inactive|background/) && next === 'active') {
        // Tepsi temizliği token'a bağlı DEĞİL — aşağıdaki refresh gate'inin
        // içine girerse, refresh geçici bir hatayla düştüğünde (erken return)
        // bildirimler merkezde kalmaya devam ederdi. Ağ da gerektirmiyor.
        clearDeliveredNotifications();

        if (isAuthenticated && hasToken) {
          // ÖNCE TOKEN, SONRA FIRTINA. Access token 2 saat yaşıyor; birkaç
          // saatlik arka plandan dönüşte kesinlikle ölmüş oluyor. Yukarıdaki tur
          // bir anda ~7 istek atıyordu; hepsi 401 yiyip single-flight refresh'i
          // bekliyor, sonra yeniden deneniyordu — 14+ istek ve rotasyonun tam
          // uyanma anına denk gelmesi.
          //
          // Rotasyon tek kullanımlık; refresh cevabının kaybolduğu (uygulama
          // tam o anda askıya alındı) senaryo eskiden oturumu kurtarılamaz
          // yapıyordu. Backend 2026-08-19'da 60 sn'lik grace penceresi açtı ve
          // api.ts artık aynı token'la sınırlı retry yapıyor — pencere içinde
          // uyanırsak oturum kurtuluyor. Fanout'u yine de TEK refresh'in
          // arkasına diziyoruz: pencere sonsuz değil ve ~7 paralel 401'i
          // tetiklemenin başka bir faydası yok.
          //
          // Refresh geçici bir hatayla düşerse (uyanma anında radyo henüz
          // oturmamış olabilir) turu tamamen atlıyoruz: api.ts artık oturumu
          // düşürmüyor, bir sonraki foreground ya da kullanıcı etkileşimi aynı
          // işi yapacak. Token tazeyse hiç ek istek çıkmıyor.
          void (async () => {
            if (isTokenExpiringSoon(getCurrentAccessToken(), 60)) {
              const fresh = await refreshAccessToken();
              if (!fresh) return;
            }
            runForegroundSync();
          })();
        }
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, hasToken, runForegroundSync]);

  // ============ Konum heartbeat — cold start ============
  // Token oturduktan SONRA: api.ts Authorization'ı currentAccessToken'dan
  // okuyor, bu yüzden hasToken guard'ı şart.
  useEffect(() => {
    if (!isAuthenticated || !hasToken) return;
    sendLocationHeartbeat();
  }, [isAuthenticated, hasToken]);

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
      resumeNavState = null;
      setResumeRoute('Welcome');
      return;
    }

    if (!emailVerifiedToken || !registrationEmail) {
      resumeNavState = null;
      setResumeRoute('Welcome');
      return;
    }

    checkRegistrationToken(registrationEmail, emailVerifiedToken).then((result) => {
      if (result === 'valid') {
        // Alan verileri (auth.registrationForm + profile) zaten persist
        // ediliyordu; eksik olan tek şey kullanıcının HANGİ ADIMDA olduğuydu
        // — o yüzden akış her açılışta ilk adımdan başlıyordu. Kaydedilmiş
        // adım geçersizse (eski sürümden kalan state, akıştan çıkarılmış
        // ekran) başa düşülür.
        const step = isRegistrationStep(registrationStep)
          ? registrationStep
          : FIRST_REGISTRATION_STEP;
        const stack = registrationResumeStack(step);
        resumeNavState =
          stack.length > 1
            ? { index: stack.length - 1, routes: stack.map((name) => ({ name })) }
            : null;
        setResumeRoute(step);
        return;
      }

      resumeNavState = null;
      // 'unknown' (ağ hatası) veriye DOKUNMAZ — çevrimdışı açılışta yarım kayıt
      // silinmesin; kullanıcı bağlantı gelince kaldığı yerden devam eder.
      if (result === 'invalid') {
        dispatch(clearRegistrationForm({ keepEmail: true }));
      }
      setResumeRoute('Welcome');
    });
  }, [tokenInitialized, isAuthenticated]);

  useEffect(() => {
    const verified = user?.isMailVerified || user?.isProfileCreated;
    if (!isAuthenticated || !verified) {
      setMyPhoto(null);
      setProfileVisibility(null);
      setPhotosAwaitingReview(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      profileService
        .getMyProfile()
        .then((p: any) => {
          if (cancelled) return;
          setMyPhoto(resolveMainPhotoUri(p) ?? null);
          setProfileVisibility(normalizeProfileVisibility(p));
          setPhotosAwaitingReview(hasPhotosAwaitingReview(p));
          if (__DEV__) {
            mark('profile-loaded');
            summary();
          }
        })
        .catch(() => {});
    load();
    // Foto eklenip profil yeniden görünür olunca kapı kendiliğinden kapansın:
    // ProfileScreen kaydettiğinde bu efekt yeniden çalışmıyor, sinyal uiBus'tan
    // geliyor (cache zaten bust edilmiş olduğu için istek taze cevap alır).
    const unsub = uiBus.on('profileDirty', load);
    return () => { cancelled = true; unsub(); };
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

  // Yaptırım ekranı kapatılabilir DEĞİL; askıda "giriş ekranına dön" ile
  // kapanır. Latch'i de açıyoruz, yoksa aynı kullanıcı tekrar giriş denediğinde
  // ikinci 403 yutulur ve ekran hiç görünmez.
  const dismissAccountBlock = () => {
    resetAccountBlockLatch();
    dispatch(clearAccountBlock());
  };

  if (!tokenInitialized || resumeRoute === null) {
    // Boot penceresinde gelen 403 de karşılanmalı — aksi halde kullanıcı
    // token'ı temizlenmiş ama ekransız bir siyah karede kalırdı.
    return (
      <>
        <View style={{ flex: 1, backgroundColor: colors.bgDeep }} />
        <AccountBlockedScreen block={accountBlock} onDismiss={dismissAccountBlock} />
      </>
    );
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
    <ProfileVisibilityProvider value={profileVisibilityInfo}>
      <NavigationContainer
        ref={navigationRef}
        key={navigationKey}
        theme={navTheme()}
        initialState={
          (showMainNavigator ? themeSwapNavState : (themeSwapNavState ?? resumeNavState)) ??
          undefined
        }
        linking={LINKING}
        onReady={() => {
          // Snapshot'lar TEK KULLANIMLIK: temizlenmezse sonraki auth
          // geçişindeki remount da eski yığını geri yükler — orası bilerek
          // sıfırlanıyor (kayıt bitince Discover'a düşülmeli, Step15'e değil).
          themeSwapNavState = null;
          resumeNavState = null;
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
            // "Kaldığın yerden devam et" imleci. Ekranların kendisi bilmiyor;
            // tek yerden işaretlemek 12 ekrana efekt serpmekten hem ucuz hem de
            // ileri/geri ayrımı gerektirmiyor (geri gidilirse imleç de geriler).
            if (isRegistrationStep(route.name)) {
              dispatch(setRegistrationStep(route.name));
            }
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

      {/* Profil keşif havuzundan düştü → bilgilendirme sheet'i (kapatılabilir,
          hiçbir işlemi engellemiyor). Ayarlar modal'ının ALTINDA duruyor ki
          açıkken kullanıcı yine de hesabına (çıkış/destek) erişebilsin. */}
      {showMainNavigator && (
        <ProfileHiddenGate
          visibility={profileVisibility}
          awaitingReview={photosAwaitingReview}
          onAddPhoto={() => {
            if (!navigationRef.isReady()) return;
            (navigationRef as any).navigate('HomeTabs', { screen: 'Profile' });
            uiBus.emit('addProfilePhoto');
          }}
        />
      )}

      {/* Zorunlu / önerilen güncelleme kapısı. Navigator'ın DIŞINDA ve auth'tan
          bağımsız: blokaj login ekranında da geçerli. Yaptırım ekranı (RN Modal)
          bunun üstünde kalır — banlı kullanıcıya "güncelle" demenin anlamı yok. */}
      {versionGate.result && (
        <UpdateGateSheet
          result={versionGate.result}
          visible={versionGate.open}
          onDismiss={versionGate.dismiss}
          onRetry={versionGate.recheck}
          rechecking={versionGate.rechecking}
        />
      )}

      {/* Hesap yaptırımı — her şeyin üstünde, kapatılamaz. Navigator ağacının
          DIŞINDA: oturum düşerken NavigationContainer remount oluyor, bir
          route'a reset atmak tam o ana denk gelirdi. */}
      <AccountBlockedScreen block={accountBlock} onDismiss={dismissAccountBlock} />
    </ProfileVisibilityProvider>
  );
}
