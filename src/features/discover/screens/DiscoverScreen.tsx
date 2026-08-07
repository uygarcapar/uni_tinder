import React, {
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  AppState,
  Modal,
} from "react-native";
import { appPrefs } from "../../../shared/utils/appPrefs";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  withDelay,
  withSequence,
  runOnJS,
  useAnimatedStyle,
  useAnimatedReaction,
  interpolate,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ENTRY_DISTANCE = SCREEN_WIDTH * 1.2;
const ENTRY_DURATION = 180;
const ENTRY_EASING = Easing.out(Easing.cubic);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  RotateCcw,
  SlidersHorizontal,
  Search,
  ArrowLeft,
  ArrowRight,
} from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import SwipeWrapper from "@/features/discover/components/SwipeWrapper";
import SwipeOverlay from "@/features/discover/components/SwipeOverlay";
import SuperLikeBurst from "@/features/discover/components/SuperLikeBurst";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import SuperLikePurchaseModal from "@/features/discover/components/SuperLikePurchaseModal";
import FilterModal from "@/features/discover/components/FilterModal";
import { CURRENT_KVKK_VERSION } from "@/features/auth/screens/KVKKConsentScreen";
import WaveFillLogo from "@/shared/components/WaveFillLogo";
import { colors } from "../../../shared/theme/colors";
import {
  usePotentialMatches,
  useSwipeFilters,
  useSwipeStats,
  useSwipeMutation,
  useSaveFilters,
  useUndoSwipe,
  useUpdateStatsCache,
} from "@/features/discover/swipeQueries";
import { UNLIMITED } from "@/shared/constants/limits";
import { showInfoToast } from "@/shared/services/toaster";
import uiBus, { cardExpandAnim } from "@/shared/services/uiBus";
import { useEvent } from "@/shared/hooks/useEvent";
import { mark } from "@/shared/debug/startupTiming";
import { hideSplash } from "@/shared/splash";
import { markAppShellReady } from "@/shared/bootPhase";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import { useAppSelector } from "@/shared/hooks/redux";
import { analytics } from "@/shared/services/analytics";
import { navigationRef } from "@/shared/services/navigationRef";

// Tab bar geometry — TabNavigator ile tutarlı:
// FLOATING_BAR_HEIGHT (64) + FLOATING_BAR_BOTTOM_GAP (-10) + insets.bottom + extra gap (12)
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;
const CARD_BOTTOM_GAP = 12;

// Placeholder block — kendi içinde shimmer animasyonu olan dark rect.
// borderCurve:continuous + overflow:hidden ile yumuşak köşeli kapsayıcı.
const SkeletonBlock = ({ width, height, borderRadius = 8, style }: any) => {
  const shimmer = useSharedValue(-width);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(width * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer, width]);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));
  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.surface4,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: width * 2,
            height: "100%",
          },
          shimmerStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.12)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
};

// SwipeCard ile aynı dış yapı (borderRadius:40, full frame) + photo overlay
// alanları (name, pills) için placeholder block'lar + shimmer overlay.
const SkeletonCard = () => {
  const shimmer = useSharedValue(-SCREEN_WIDTH);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(SCREEN_WIDTH * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 40,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      {/* Pagination — tek pill */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <SkeletonBlock width={40} height={6} borderRadius={3} />
      </View>

      {/* SwipeCard.js:830-905 birebir mirror:
            className="absolute bottom-[70px] left-6 right-6"
            Premium BlurView: mb-2 py-3 px-3 self-start text-[11px] (~36h)
            Name wrapper: {marginBottom:2, gap:4} text-4xl (~44h)
            Pills wrapper: {flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4,marginBottom:16}
              Uni pill: px-1 py-1 + icon20 + text-[15px] (~28h) — usage purpose yorum satırı, tek pill */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 70,
          left: 24,
          right: 24,
        }}
      >
        {/* Premium pill */}
        <View style={{ alignSelf: "flex-start", marginBottom: 8 }}>
          <SkeletonBlock width={70} height={30} borderRadius={999} />
        </View>
        {/* Name + age */}
        <View style={{ marginBottom: 2, gap: 4 }}>
          <SkeletonBlock width={150} height={35} borderRadius={999} />
        </View>
        {/* Pills row — tek uni pill (usage purpose yorum satırı) */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          <SkeletonBlock width={180} height={28} borderRadius={999} />
        </View>
      </View>

      {/* Shimmer pass — tüm placeholder'lar üzerinden geçer */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: SCREEN_WIDTH * 2,
            height: "100%",
          },
          shimmerStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.07)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
};

// Kalan hak sıfırlanana kadar geçecek süreyi okunur metne çevirir
// (super-like limit toast'ında kullanılıyor).
// UNLIMITED (-1) = "asla resetlenmez" (free kullanıcının lifetime SuperLike
// hakkı bitti) — geri sayım GÖSTERİLMEZ, null döner ve çağıran taraf premium
// mesajına düşer. `sec <= 0` dalı bunu "şu anda yenilenebilir" sanıyordu.
const formatResetTime = (sec, t) => {
  if (sec === UNLIMITED) return null;
  if (!sec || sec <= 0) return t('discover.swipe.resetNow');
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return t('discover.swipe.resetHoursMinutes', { h, m });
  if (m > 0) return t('discover.swipe.resetMinutes', { m });
  return t('discover.swipe.resetSeconds', { sec });
};

// Boş durum kartı — SkeletonCard'la aynı dış yapı (frame + placeholder block'lar) ama
// shimmer YOK. Ortada Search ikonu + etrafında radar pulse animasyonu (3 ring stagger).
// Ekran görünür VE app foreground'da mı. Radar `withRepeat(-1)` ile sonsuz
// döner; Discover tab'ı preload/lazy sonrası mount kalıyor, dolayısıyla gate
// olmadan başka sekmedeyken ve app arka plandayken de her frame commit atıyor.
// Boş deste + polling refetch'in render'larıyla üst üste binince commit storm
// besliyor (bkz. ShadowTree::commit assert).
const useRadarActive = () => {
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    () => AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);
  return isFocused && appActive;
};

const RadarRing = ({ delay = 0, active = true }) => {
  // Initial = 1 → opacity 0, görünmez. Delay sonrası 0'a snap edip animasyona başla.
  // Aksi halde delay süresince ring scale 0.3 + opacity 1 ile statik nokta gibi durur.
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = 1; // görünmez konuma park et
      return;
    }
    const t = setTimeout(() => {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimation(progress);
    };
  }, [progress, delay, active]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.3 + progress.value * 1.7 }],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 4,
          borderColor: "rgba(255,255,255,0.55)",
        },
        style,
      ]}
    />
  );
};

// Magnifier + radar tek bir kapsayıcı içinde 8 (lemniscate) çizer — ring'ler magnifier'le
// senkron hareket eder, radar her zaman icon'un tam ortasında olur.
// Parametrik: x = sin(2θ)/2, y = cos(θ). Period 4s, sürekli loop.
const FigureEightRadar = () => {
  const active = useRadarActive();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      return;
    }
    t.value = 0;
    t.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t, active]);
  const style = useAnimatedStyle(() => {
    const AMP = 18;
    const theta = t.value * 2 * Math.PI;
    const x = (Math.sin(2 * theta) * AMP) / 2;
    const y = Math.cos(theta) * AMP;
    return {
      transform: [{ translateX: x }, { translateY: y }] as any,
    };
  });
  return (
    <Animated.View
      style={[{ alignItems: "center", justifyContent: "center" }, style]}
    >
      <RadarRing delay={0} active={active} />
      <RadarRing delay={800} active={active} />
      <RadarRing delay={1600} active={active} />
      <SFIcon name="magnifyingglass" fallback={Search} size={36} color={colors.text} strokeWidth={2} weight="semibold" />
    </Animated.View>
  );
};

const EmptyDiscoverCard = () => {
  return (
    <View
      style={{
        flex: 1,
        borderRadius: 40,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
      }}
    >
      {/* Pagination — tek pill (static) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 20,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 40,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.surface4,
          }}
        />
      </View>

      {/* Bottom placeholder block'lar — SwipeCard overlay mirror */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 70,
          left: 24,
          right: 24,
        }}
      >
        <View
          style={{
            alignSelf: "flex-start",
            marginBottom: 8,
            width: 70,
            height: 30,
            borderRadius: 999,
            backgroundColor: colors.surface4,
          }}
        />
        <View style={{ marginBottom: 2, gap: 4 }}>
          <View
            style={{
              width: 150,
              height: 35,
              borderRadius: 999,
              backgroundColor: colors.surface4,
            }}
          />
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: 180,
              height: 28,
              borderRadius: 999,
              backgroundColor: colors.surface4,
            }}
          />
        </View>
      </View>

      {/* Ortada Search ikonu + radar pulse */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FigureEightRadar />
      </View>
    </View>
  );
};

const DEFAULT_FILTERS = {
  ageRangeMin: 18,
  ageRangeMax: 30,
  maxDistance: 50,
  genders: [],
  interestedIn: [],
  preferredCity: null,
  preferredUniversityDomain: null,
  // "Beni kim görsün / görmesin" listeleri — backend boş dizi döner (null değil).
  visibleOnlyToUniversityDomains: [],
  hiddenFromUniversityDomains: [],
  isPremium: false,
};

export default function DiscoverScreen() {
  useRenderCount("DiscoverScreen");
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const matchesQuery = usePotentialMatches();
  const filtersQuery = useSwipeFilters();
  const statsQuery = useSwipeStats();
  const swipeMutation = useSwipeMutation();
  const saveFiltersMutation = useSaveFilters();
  const undoMutation = useUndoSwipe();
  const updateStatsCache = useUpdateStatsCache();

  // Session boyunca swipe edilen userId'ler. Backend zaten geçmiş swipe'ları
  // filtrelemeli ama (1) race condition: stack boşalıp polling refetch
  // tetiklendiğinde swipe POST'ları henüz commit edilmemiş olabilir,
  // (2) backend filtresinde nadir bug durumlarına karşı defensive bir
  // safety net. Prune aşağıdaki potentialMatches memo'sunda yapılıyor —
  // veri hangi yoldan gelirse gelsin (ilk fetch / fetchNextPage / polling
  // refetch) aynı süzgeçten geçsin diye.
  const swipedUserIdsRef = useRef<Set<string>>(new Set());

  // currentIndex burada tanımlı çünkü potentialMatches memo'su ona bağımlı
  // (aşağıdaki index-güvenli prune). Kardeş swipe state'leri render bölümünün
  // yanında kaldı.
  const [currentIndex, setCurrentIndex] = useState(0);

  const potentialMatches = useMemo(() => {
    const all = matchesQuery.data?.pages.flatMap((p) => p.profiles) ?? [];
    // Dedupe by userId — backend bazen sayfa kenarlarında aynı user'ı tekrar
    // dönebiliyor; duplicate key error'unu engeller.
    //
    // Aynı geçişte swipe edilmişleri de eliyoruz. DİKKAT — sadece HENÜZ
    // GÖSTERİLMEMİŞ kısımdan (out.length >= currentIndex) atıyoruz:
    // currentIndex bu diziye bir index, baştan eleman çıkarmak tüm desteyi
    // kaydırır ve handleRewind'in okuduğu potentialMatches[currentIndex - 1]
    // yanlış profili gösterirdi. Geçmiş olduğu gibi duruyor, sadece kuyruk
    // süzülüyor → index kaymaz.
    //
    // handleSwipe önce ref'e ekleyip sonra currentIndex'i artırdığı için
    // yeni swipe edilen kart hep geçmişte kalır, anlık atlama olmaz.
    const seen = new Set();
    const out: any[] = [];
    for (const p of all) {
      if (!p?.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      if (
        out.length >= currentIndex &&
        swipedUserIdsRef.current.has(p.userId)
      ) {
        continue;
      }
      out.push(p);
    }
    return out;
  }, [matchesQuery.data, currentIndex]);
  const loading = matchesQuery.isLoading;
  const filters = filtersQuery.data ?? DEFAULT_FILTERS;
  const remainingUndos = statsQuery.data?.remainingUndos ?? null;

  // Startup teşhis mark'ları — first-launch profilini ölçmek ve startup crash'inin
  // yerini pinlemek için. Çökmeden önceki son [startup] satırı nerede öldüğünü söyler.
  useEffect(() => {
    mark("discover-mounted");
    // Authed landing: splash'i mount'un ilk paint'i geçince gizle. 2×rAF ile
    // ilk commit boyandıktan sonra açılır — InteractionManager kullanmıyoruz,
    // bu kod tabanında runAfterInteractions handle'ı stuck kalıp callback'i hiç
    // çağırmayabiliyor (bkz. MessagesScreen.openChat notu). Safety timeout (App)
    // yine de her ihtimale karşı 4.5sn'de gizler.
    let r2: number | undefined;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => hideSplash("discover-mount"));
    });
    // Deste boşsa / matches fetch'i hata verirse preload zinciri hiç başlamaz ve
    // kabuk "hazır" işaretlenmez → ertelenmiş overlay'ler sonsuza kilitlenir.
    // Emniyet kemeri: preload zincirinin normal bitişinden (4.4sn) sonra aç.
    const shellSafety = setTimeout(
      () => markAppShellReady("discover-safety"),
      6500,
    );
    return () => {
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
      clearTimeout(shellSafety);
    };
  }, []);
  const firstCardsMarked = useRef(false);
  useEffect(() => {
    if (!firstCardsMarked.current && potentialMatches.length > 0) {
      firstCardsMarked.current = true;
      mark("discover-first-cards");
    }
  }, [potentialMatches.length]);

  // ── Hibrit warm-up: Discover hazır olduktan SONRA kardeş sekmeleri arka
  // planda preload et. lazy:true olduğu için sekmeler boot'ta mount olmaz
  // (storm yok); ama ilk kez o sekmeye basınca "kararıp gelme" (lazy mount
  // flash) oluyordu. Discover ilk kartlarını gösterince (settle) Messages/
  // Profile/Likes'ı staggered preload ediyoruz → görünmeden mount olurlar,
  // sekmeye basınca hazır gelirler. Stagger: hepsini aynı anda mount edip
  // mini-storm yaratmamak için aralıklı. Native bottom tabs preload'u destekler
  // (NativeBottomTabView preloadedRouteKeys). Bir kez.
  const navigation = useNavigation<any>();
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (preloadedRef.current) return;
    if (potentialMatches.length === 0) return; // Discover hazır değil
    if (typeof navigation.preload !== "function") {
      // Preload API yok → sekmeler hiç mount olmayacak; kabuk bu kadar oturuyor.
      markAppShellReady("no-preload-api");
      return;
    }
    preloadedRef.current = true;
    // SIRALI stagger: her tab kendi sessiz penceresinde tek başına mount olsun
    // (aynı anda mount = mini commit-storm = crash riski). Messages en olası
    // sonraki hedef + kendi history-prefetch'i olduğu için önce; sonra Likes
    // (swipe akışının doğal devamı), Profile en sonda — en geç ziyaret edilen.
    // Aralıklar ~1.4sn: Messages'ın prefetch burst'ü (4×300ms) sönecek kadar var.
    //
    // KULLANICIYA YOL VER: kullanıcı stagger bitmeden Chat'e girerse sıradaki
    // preload ATLANIR — Chat'in ağır mount'u (LegendList bootstrap + MVCP +
    // klavye) üzerine arka planda tab mount'u bindirmek ShadowTree::commit
    // (attempts<1024) SIGABRT'ının tetikleyicisiydi (Sentry breadcrumb kanıtlı:
    // boot'tan hemen sonra Chat'e giriş + preload çakışması). Preload yalnız
    // optimizasyon: atlanan sekme ilk ziyarette mount olur, işlev kaybı yok.
    const preloadUnlessInChat = (screen: string) => {
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === "Chat") return;
      navigation.preload(screen);
    };
    const timers = [
      setTimeout(() => preloadUnlessInChat("Messages"), 600),
      setTimeout(() => preloadUnlessInChat("Likes"), 2000),
      setTimeout(() => preloadUnlessInChat("Profile"), 3400),
      // Son sekme de mount olup commit'leri söndükten sonra kabuğu "hazır"
      // işaretle → ertelenmiş ağır overlay'ler (match modal) ancak buradan
      // sonra mount olur.
      setTimeout(() => markAppShellReady("tab-preload-done"), 4400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [potentialMatches.length, navigation]);

  // Default'tan sapan filtre sayısı — header filter icon'unun sağ-altındaki
  // rozette gösterilir. Mesafe değişikliği rozet'e dahil edilmez (slider'la sürekli
  // oynanan bir ayar, hep "1" göstermesin) — sadece gender/şehir/üni sayılır.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    // interestedIn default'u üç kategori birden (backend Profile.InterestedInFlags
    // = 7); daraltılmışsa aktif filtre sayılır. Boş liste UI'da engelleniyor.
    const interestedIn = filters.interestedIn || [];
    if (interestedIn.length > 0 && interestedIn.length < 3) count++;
    if (filters.preferredCity) count++;
    if (filters.preferredUniversityDomain) count++;
    // Görünürlük listeleri: kaç domain seçildiğinden bağımsız, liste başına 1.
    if ((filters.visibleOnlyToUniversityDomains || []).length > 0) count++;
    if ((filters.hiddenFromUniversityDomains || []).length > 0) count++;
    return count;
  }, [filters]);

  // Lit logosu için fill oranı: (limit - kalan) / limit.
  // Premium, limit -1 (sınırsız), kalan -1 veya limit henüz bilinmiyor (null,
  // eski backend) → oran hesaplamıyoruz, boş göster.
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    const limit = statsQuery.data?.dailySwipeLimit;
    if (rem == null || rem < 0) return 0;
    if (limit == null || limit <= 0) return 0;
    const used = Math.max(0, limit - rem);
    return Math.min(1, used / limit);
  }, [
    statsQuery.data?.remainingSwipes,
    statsQuery.data?.dailySwipeLimit,
    statsQuery.data?.isPremium,
  ]);

  // Like kotası bitince true. Premium veya rem<0 (unlimited/unknown) → false.
  // Bu durumda like blok edilir, kart bounce back + paywall açılır.
  // Pass'i KAPSAMAZ — backend pass'i kotaya saymıyor.
  const swipeQuotaExhausted = useMemo(() => {
    if (statsQuery.data?.isPremium) return false;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return false;
    return rem === 0;
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  // SuperLike kota bitince true. Pull-up swipe + button ikisini de blokar.
  const superLikeQuotaExhausted = useMemo(() => {
    const rem = statsQuery.data?.superLikesRemaining;
    if (rem == null || rem < 0) return false;
    return rem === 0;
  }, [statsQuery.data?.superLikesRemaining]);

  // currentIndex yukarıda, potentialMatches memo'sundan önce tanımlı.
  const [isSwiping, setIsSwiping] = useState(false);
  const [lastSwipeWasPass, setLastSwipeWasPass] = useState(false);

  // Boş kart durumu (radar animasyonu) açıkken her 5sn'de bir potential
  // matches refetch — backend'in yeni profilleri var mı diye yokla. Max 5
  // deneme; sonrasında animasyon devam eder ama istek atmaz. Yeni profil
  // gelirse (isEmpty=false) sayaç resetlenir.
  const pollCountRef = useRef(0);
  const isEmptyStack =
    !matchesQuery.isLoading && potentialMatches.length <= currentIndex;
  useEffect(() => {
    if (!isEmptyStack) {
      pollCountRef.current = 0;
      return;
    }
    if (pollCountRef.current >= 5) return;
    const intervalId = setInterval(async () => {
      if (pollCountRef.current >= 5) {
        clearInterval(intervalId);
        return;
      }
      pollCountRef.current += 1;
      // Prune burada YAPILMIYOR. Eskiden refetch sonrası cache'i
      // swipedUserIdsRef'e göre setQueryData ile yeniden yazıyorduk; iki
      // sorunu vardı: (1) fetchNextPage ile gelen sayfalar bu yoldan hiç
      // geçmediği için swipe edilmiş kullanıcı tekrar kart olarak çıkabiliyordu,
      // (2) her tick cache'i yeniden yazıp gereksiz re-render üretiyordu.
      // Süzgeç artık potentialMatches memo'sunda, tüm veri yollarını kapsıyor.
      await matchesQuery.refetch();
    }, 5000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmptyStack]);

  // Refetch (polling veya filter sonrası) backend swipe edilenleri filtrelediği
  // için yeni page 1 daha az profil dönebilir; currentIndex eski uzunluğa göre
  // ileri kalır → length <= currentIndex → EmptyDiscoverCard kilitlenir.
  // Yeni profil geldiyse index'i başa al, listenin başından göstersin.
  useEffect(() => {
    if (potentialMatches.length > 0 && potentialMatches.length <= currentIndex) {
      setCurrentIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potentialMatches.length]);

  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [superLikePurchaseVisible, setSuperLikePurchaseVisible] = useState(false);

  // SuperLike kotası bitti → sheet + durumu açıklayan toast birlikte.
  // Toast metni tier'a göre değişiyor: premium'da kota rolling 7-gün cycle ile
  // yenileniyor (satacak bir şey yok, backend de showPaywall:false dönüyor),
  // free'de lifetime hak bitmiş ve kendiliğinden yenilenmiyor.
  const showSuperLikeLimitUi = useEvent(() => {
    const resetText = statsQuery.data?.isPremium
      ? formatResetTime(statsQuery.data?.superLikeResetInSeconds, t)
      : null;
    // resetText null → backend "asla resetlenmez" (-1) dedi; cooldown metni
    // yerine tükendi metnine düşüyoruz, yoksa yanlış vaat veriyoruz.
    if (resetText) {
      showInfoToast({
        title: t('discover.swipe.superLikeCooldownTitle'),
        message: t('discover.swipe.superLikeCooldownMessage', {
          time: resetText,
        }),
      });
    } else {
      showInfoToast({
        title: t('discover.swipe.superLikeExhaustedTitle'),
        message: t('discover.swipe.superLikeExhaustedMessage'),
      });
    }
    setSuperLikePurchaseVisible(true);
  });

  // Backend SwipeResultDto.ShowPaywall=true geldiğinde (Like/Pass kotası dolu) veya
  // GetPotentialMatches response'unda quota=0 geldiğinde useSwipeMutation uiBus'a event
  // emit eder; biz burada subscribe olup paywall'ı açıyoruz.
  useEffect(() => {
    const unsubSwipe = uiBus.on("swipePaywall", (payload) => {
      // `showPaywall:false` + dolu paywallType = premium kullanıcının cycle'ı
      // doldu (satacak bir şey yok) → sheet AÇILMAZ, sadece bilgi. Eski
      // event'lerde alan yoktu, `=== false` ile geriye dönük uyumlu.
      if (payload?.showPaywall === false) return;
      setPurchaseVisible(true);
    });
    // SuperLike kota bittiğinde SwipeWrapper bu event'i emit eder (pull-up swipe).
    const unsubSuperLike = uiBus.on("superLikePaywall", () => {
      showSuperLikeLimitUi();
    });
    return () => {
      unsubSwipe();
      unsubSuperLike();
    };
    // showSuperLikeLimitUi useEvent — referansı stabil, resubscribe gerekmez.
  }, [showSuperLikeLimitUi]);

  const [filterVisible, setFilterVisible] = useState(false);
  const lastSwipePromiseRef = useRef(null);

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);
  const stackEntryX = useSharedValue(0);

  // ─── Tutorial (ilk giriş kart swipe demo) ────────────────────────────────
  // Flag hesap bazlı: aynı cihazda açılan yeni hesap jesti hiç görmemiş bir
  // kullanıcıdır, tekrar göstermek gerekir.
  const TUTORIAL_TX = 55; // like/pass threshold (85) altında
  const TUTORIAL_SWING_DURATION = 550;
  const TUTORIAL_STORAGE_KEY = "discoverSwipeTutorialShown";
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  // KVKK onay sheet'i navigator'ın üstünde açılıyor; onaylanana kadar Discover
  // odaklı sayılsa da kart modalın arkasında kalıyor. Tutorial'ı onay sonrasına ertele.
  const kvkkAccepted = useAppSelector(
    (s) => s.auth.kvkkVersion === CURRENT_KVKK_VERSION,
  );
  const tutorialTx = useSharedValue(0);
  const tutorialOpacity = useSharedValue(0);
  const [tutorialActive, setTutorialActive] = useState(false);
  // "Oynuyor mu" guard'ı + aynı mount'ta tekrar oynamasın diye tek seferlik gate.
  const tutorialLiveRef = useRef(false);
  const tutorialDoneRef = useRef(false);
  const screenFocused = useIsFocused();

  // markSeen=true → demo sonuna kadar oynadı, flag yazılır. Ekran erkenden
  // arkaplana düşerse yazılmaz; bir sonraki açılışta tekrar oynar.
  const stopTutorial = useEvent((markSeen: boolean) => {
    if (!tutorialLiveRef.current) return;
    tutorialLiveRef.current = false;
    cancelAnimation(tutorialTx);
    cancelAnimation(tutorialOpacity);
    tutorialTx.value = withTiming(0, { duration: 150 });
    tutorialOpacity.value = withTiming(0, { duration: 150 }, () => {
      runOnJS(setTutorialActive)(false);
    });
    if (markSeen && currentUserId) {
      appPrefs.set(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`, true);
    }
  });

  // Ekran arkaplana/başka route'a düşerse demoyu boşluğa oynatma.
  useEffect(() => {
    if (!screenFocused) stopTutorial(false);
  }, [screenFocused, stopTutorial]);

  const hasCardToDemo = potentialMatches.length > 0;
  useEffect(() => {
    if (loading || !hasCardToDemo || !currentUserId) return;
    if (!screenFocused || tutorialDoneRef.current) return;
    // KVKK onay sheet'i kapanmadan tutorial oynatma (kart modalın arkasında kalır).
    if (!kvkkAccepted) return;
    // MMKV senkron — eski AsyncStorage.then() + cancelled-guard yarışı kalktı.
    if (appPrefs.getBoolean(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`)) return;
    tutorialDoneRef.current = true;
    tutorialLiveRef.current = true;
    setTutorialActive(true);
    tutorialTx.value = 0;
    tutorialOpacity.value = withDelay(400, withTiming(1, { duration: 250 }));
    tutorialTx.value = withDelay(
      600,
      withSequence(
        withTiming(TUTORIAL_TX, {
          duration: TUTORIAL_SWING_DURATION,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(-TUTORIAL_TX, {
          duration: TUTORIAL_SWING_DURATION * 1.4,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(
          0,
          {
            duration: TUTORIAL_SWING_DURATION,
            easing: Easing.inOut(Easing.cubic),
          },
          () => {
            runOnJS(stopTutorial)(true);
          },
        ),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasCardToDemo, currentUserId, screenFocused, kvkkAccepted]);

  // Stack entry (undo / filtre sonrası yandan giriş) + tutorial salınımı tek
  // animated style'da: iki ayrı style'ın `transform` key'i flatten'da birbirini
  // ezer, sonuncusu kazanırdı → entry animasyonu hiç görünmezdi.
  const cardStackStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: stackEntryX.value + tutorialTx.value },
      {
        rotate: `${interpolate(tutorialTx.value, [-SCREEN_WIDTH, 0, SCREEN_WIDTH], [-15, 0, 15])}deg`,
      },
    ],
  }));

  const tutorialOverlayStyle = useAnimatedStyle(() => ({
    opacity: tutorialOpacity.value,
  }));

  const tutorialLeftArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tutorialTx.value, [-TUTORIAL_TX, 0], [-16, 0], "clamp") },
    ],
  }));

  const tutorialRightArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tutorialTx.value, [0, TUTORIAL_TX], [0, 16], "clamp") },
    ],
  }));

  // Tab bar tarafından kaplanan dikey alan — kartın bottom'unun üstünde durması için.
  // cardExpandAnim'e bağlı: pull sırasında container progressively büyür → içerik
  // pull oranıyla görünür hale gelir. photoHeight set-once olduğu için onLayout
  // loop'u tetiklenmez, lag yok.
  const tabBarOccupied =
    insets.bottom + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + CARD_BOTTOM_GAP;
  const cardContainerStyle = useAnimatedStyle(() => ({
    paddingBottom: tabBarOccupied * (1 - cardExpandAnim.value),
  }));

  // Expand ederken header içeriği (ikonlar/logo) çekme oranıyla soluklaşır →
  // header geri çekilip kart öne çıkmış hissi. bg #121212 zaten koyu olduğu
  // için karartma görünmez; asıl görünür efekt içeriğin fade'i. cardExpandAnim 0→1.
  const headerFadeStyle = useAnimatedStyle(() => ({
    opacity: 1 - cardExpandAnim.value * 0.6,
  }));

  // Expanded'ken header ikonları (rewind/filtre) çalışmasın — sadece kart mode'da
  // aktif. cardExpandAnim'i JS boolean'a çevirip ikon satırının touch'unu kapatırız.
  const [headerLocked, setHeaderLocked] = useState(false);
  useAnimatedReaction(
    () => cardExpandAnim.value > 0.5,
    (v, prev) => {
      if (v !== prev) runOnJS(setHeaderLocked)(v);
    },
  );

  // Pre-fetch sonraki sayfa: kart stack 5'in altına düşünce.
  //
  // DİKKAT — bu effect kendi kendini tetikleyebiliyor: fetchNextPage çağırınca
  // isFetching false→true→false gidiyor, effect iki kez daha çalışıyor. Deste
  // boşken `remainingCards <= 5` kalıcı olarak true olduğu için, gelen sayfa
  // yeni profil eklemezse (boş sayfa ya da dedupe'a takılan tekrar profiller)
  // sonsuz fetch döngüsü oluşuyordu → pages dizisi şişer, her yanıtta
  // flatMap+dedupe tüm birikmiş sayfaları baştan tarar, ekran kilitlenir.
  //
  // Guard: son denememizi hangi uzunlukta yaptığımızı tutuyoruz. Liste o
  // denemeden beri hiç büyümediyse backend bize verecek yeni profil yok
  // demektir; tekrar istemiyoruz. Liste değişince (polling refetch yeni
  // profil getirdiğinde) guard kendiliğinden açılıyor.
  const lastPrefetchLenRef = useRef(-1);
  useEffect(() => {
    const remainingCards = potentialMatches.length - currentIndex;
    if (remainingCards > 5) {
      lastPrefetchLenRef.current = -1;
      return;
    }
    // isFetchingNextPage değil isFetching: polling refetch uçarken araya
    // fetchNextPage sokmak sayfaları çakıştırıyor.
    if (matchesQuery.isFetching) return;
    if (!matchesQuery.hasNextPage) return;
    if (lastPrefetchLenRef.current === potentialMatches.length) return;
    lastPrefetchLenRef.current = potentialMatches.length;
    matchesQuery.fetchNextPage();
  }, [
    currentIndex,
    potentialMatches.length,
    matchesQuery.hasNextPage,
    matchesQuery.isFetching,
    matchesQuery.fetchNextPage,
  ]);

  const handleSwipe = useEvent((direction, userId) => {
    if (userId) swipedUserIdsRef.current.add(userId);
    setCurrentIndex((i) => i + 1);
    analytics.capture('swipe', { direction });
    const isPass = direction === "left";
    setLastSwipeWasPass(isPass);
    lastSwipePromiseRef.current = swipeMutation.mutateAsync({
      direction,
      userId,
    });
  });

  const handleRewind = async () => {
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    if (remainingUndos === 0) {
      setPurchaseVisible(true);
      return;
    }

    // Undo edilen profili swipedUserIdsRef'ten çıkar — aksi halde sonraki
    // polling refetch'inde defensive prune onu listeden silmeye devam eder.
    const undoneUserId = potentialMatches[currentIndex - 1]?.userId;
    if (undoneUserId) swipedUserIdsRef.current.delete(undoneUserId);

    // Optimistic UI: kart hemen geri gelir + animasyon
    setCurrentIndex((i) => Math.max(0, i - 1));
    setLastSwipeWasPass(false);
    stackEntryX.value = -ENTRY_DISTANCE;
    stackEntryX.value = withTiming(0, {
      duration: ENTRY_DURATION,
      easing: ENTRY_EASING,
    });
    const prevUndos = remainingUndos;
    if (remainingUndos !== null && remainingUndos !== -1) {
      updateStatsCache({ remainingUndos: remainingUndos - 1 });
    }

    // Race fix: bekleyen swipe POST'u tamamlansın
    const pending = lastSwipePromiseRef.current;
    let swipeOk = true;
    if (pending) {
      try {
        await pending;
      } catch {
        swipeOk = false;
      }
    }
    lastSwipePromiseRef.current = null;

    // Swipe POST başarısız olduysa: backend'de zaten swipe yok → Undo gönderme
    if (!swipeOk) {
      if (prevUndos !== null) updateStatsCache({ remainingUndos: prevUndos });
      return;
    }

    try {
      await undoMutation.mutateAsync();
    } catch (err) {
      setCurrentIndex((i) => i + 1);
      if (undoneUserId) swipedUserIdsRef.current.add(undoneUserId);
      if (prevUndos !== null) updateStatsCache({ remainingUndos: prevUndos });
      Alert.alert("", err?.message || t('discover.rewind.error'));
    }
  };

  const handleSaveFilters = async (localFilters) => {
    try {
      await saveFiltersMutation.mutateAsync(localFilters);
      setCurrentIndex(0);
      stackEntryX.value = ENTRY_DISTANCE;
      stackEntryX.value = withTiming(0, {
        duration: ENTRY_DURATION,
        easing: ENTRY_EASING,
      });
      setFilterVisible(false);
    } catch (err) {
      Alert.alert("", err?.message || t('discover.filters.saveError'));
    }
  };

  // useEvent: state değişse bile handler referansı sabit kalır. Aksi halde
  // her setIsSwiping / setCurrentIndex, useCallback deps'i büyütüp SwipeWrapper
  // React.memo compareFn'i (onPass === next.onPass) boşa çıkarır ve iki kart
  // birden re-render olur.
  // Pass günlük kotaya dahil değil (backend DailyLimitBehavior yalnız
  // Like/SuperLike sayıyor) — kota dolsa bile blok yok, paywall yok.
  const handlePassButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 1;
    setTimeout(() => setIsSwiping(false), 300);
  });

  const handleLikeButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (swipeQuotaExhausted) {
      setPurchaseVisible(true);
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 2;
    setTimeout(() => setIsSwiping(false), 300);
  });

  const handleSuperLikeButton = useEvent(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (superLikeQuotaExhausted) {
      requestAnimationFrame(showSuperLikeLimitUi);
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 3;
    setTimeout(() => setIsSwiping(false), 300);
  });

  const renderStack = () => {
    return potentialMatches
      .slice(currentIndex, currentIndex + 2)
      .reverse()
      .map((profile, index, array) => {
        const isTopCard = index === array.length - 1;
        return (
          <SwipeWrapper
            key={profile.userId}
            profile={profile}
            isTopCard={isTopCard}
            onSwipe={handleSwipe}
            dragX={dragX}
            overlayDragX={overlayDragX}
            overlayOpacity={overlayOpacity}
            buttonDragX={buttonDragX}
            programmaticSwipe={programmaticSwipe}
            onPass={handlePassButton}
            onLike={handleLikeButton}
            onSuperLike={handleSuperLikeButton}
            swipeQuotaExhausted={swipeQuotaExhausted}
            superLikeQuotaExhausted={superLikeQuotaExhausted}
            superLikesRemaining={statsQuery.data?.superLikesRemaining ?? null}
          />
        );
      });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View
        style={{ backgroundColor: colors.bg, paddingTop: insets.top }}
      >
        <Animated.View
          pointerEvents={headerLocked ? "none" : "auto"}
          style={[
            {
              height: 50,
              paddingHorizontal: 21,
              flexDirection: "row",
              alignItems: "center",
            },
            headerFadeStyle,
          ]}
        >
          {/* Rewind */}
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            <TouchableOpacity
              onPress={handleRewind}
              activeOpacity={0.7}
              style={{ opacity: lastSwipeWasPass ? 1 : 0.3 }}
            >
              <View style={{ position: "relative" }} pointerEvents="none">
                <SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={24} color={colors.text} strokeWidth={2} weight="semibold" />
                {remainingUndos !== null && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -4,
                      right: -6,
                      backgroundColor: colors.bg,
                      borderRadius: 999,
                      minWidth: 16,
                      height: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: "700",
                        lineHeight: 16,
                        textAlign: "center",
                        includeFontPadding: false,
                      }}
                    >
                      {remainingUndos === -1 ? "∞" : remainingUndos}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Logo — dekoratif, tap davranışı yok */}
          <View pointerEvents="none">
            <WaveFillLogo fillRatio={swipeFillRatio} />
          </View>

          {/* Filter */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => setFilterVisible(true)}
              activeOpacity={0.7}
            >
              <View style={{ position: "relative" }} pointerEvents="none">
                <SFIcon name="slider.horizontal.3" fallback={SlidersHorizontal} size={24} color={colors.text} strokeWidth={2} weight="semibold" />
                {activeFilterCount > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -4,
                      right: -6,
                      backgroundColor: colors.bg,
                      borderRadius: 999,
                      minWidth: 16,
                      height: 16,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: "700",
                        lineHeight: 16,
                        textAlign: "center",
                        includeFontPadding: false,
                      }}
                    >
                      {activeFilterCount}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      {/* Cards */}
      <Animated.View style={[{ flex: 1, paddingTop: 1 }, cardContainerStyle]}>
        {loading && potentialMatches.length === 0 ? (
          <SkeletonCard />
        ) : potentialMatches.length > currentIndex ? (
          <Animated.View
            pointerEvents={tutorialActive ? "none" : "auto"}
            style={[{ flex: 1, position: "relative" }, cardStackStyle]}
          >
            {renderStack()}
            <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
          </Animated.View>
        ) : (
          <EmptyDiscoverCard />
        )}
      </Animated.View>

      {/* Super-like kalp patlaması — header ve kartın ÜSTÜnde, tüm ekranı
          kaplayan overlay; kalpler kartın üstünden header'ı geçip telefonun
          tepesinden çıkarak kaybolur. */}
      <SuperLikeBurst />

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        isPremium={statsQuery.data?.isPremium ?? false}
        onSave={handleSaveFilters}
        saving={saveFiltersMutation.isPending}
      />
      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => setPurchaseVisible(false)}
      />
      {/* SuperLike kotası bitti → premium paywall DEĞİL, consumable paket sheet'i.
          Premium kullanıcının da satın alabileceği bir ürün olduğu için backend
          artık iki tier'da da showPaywall:true dönüyor. Bakiye redeem yanıtından
          cache'e yazılıyor; buradaki refetch server-truth'u teyit eder. */}
      <SuperLikePurchaseModal
        visible={superLikePurchaseVisible}
        onClose={() => setSuperLikePurchaseVisible(false)}
        onPurchased={() => {
          setSuperLikePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />

      {/* Ekran içi absolute overlay tab bar'ı kapatamıyor — floating bar
          navigator tarafında, ekranın üstünde ayrı render ediliyor. Kendi
          penceresi olan RN Modal demo bitene kadar tab dokunuşlarını da yutar. */}
      <Modal
        visible={tutorialActive}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => {}}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            },
            tutorialOverlayStyle,
          ]}
        >
          <Animated.View style={tutorialLeftArrowStyle}>
            <SFIcon name="arrow.left" fallback={ArrowLeft} size={64} color={colors.text} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View style={tutorialRightArrowStyle}>
            <SFIcon name="arrow.right" fallback={ArrowRight} size={64} color={colors.text} strokeWidth={1.5} />
          </Animated.View>
        </Animated.View>
      </Modal>
    </GestureHandlerRootView>
  );
}
