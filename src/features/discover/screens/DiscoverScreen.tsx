import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  Linking,
} from "react-native";
import { appPrefs } from "../../../shared/utils/appPrefs";
import { setSwipeTutorialBlocking } from "@/features/discover/swipeTutorialGate";
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
  Lock,
} from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import SwipeWrapper from "@/features/discover/components/SwipeWrapper";
import SwipeOverlay from "@/features/discover/components/SwipeOverlay";
import { openLitPlus } from "@/features/profile/litPlusEntry";
import SuperLikePurchaseModal from "@/features/discover/components/SuperLikePurchaseModal";
import FilterModal from "@/features/discover/components/FilterModal";
import ReportModal from "@/shared/components/ReportModal";
import moderationService from "@/shared/services/moderationService";
import { CURRENT_KVKK_VERSION } from "@/features/auth/screens/KVKKConsentScreen";
import WaveFillLogo from "@/shared/components/WaveFillLogo";
import { colors, ink, scrimAt } from "../../../shared/theme/colors";
import {
  usePotentialMatches,
  useSwipeFilters,
  useSwipeStats,
  useSwipeMutation,
  useNoteMutation,
  useSaveFilters,
  useUndoSwipe,
  useUpdateStatsCache,
  useSetIgnoreDistanceFilter,
} from "@/features/discover/swipeQueries";
import { FREE_MAX_DISTANCE_KM } from "@/shared/constants/limits";
import {
  formatResetDuration,
  formatResetTime,
  resolveResetSeconds,
} from "@/features/discover/quotaFormat";
import {
  loadDeckProgress,
  saveDeckProgress,
  SWIPE_GUARD_MS,
} from "@/features/discover/deckProgress";
import { decideTopUp } from "@/features/discover/deckTopUp";
import { resolveCode, type CodeEntry } from "@/shared/constants/responseCodes";
import { resolveEmptyDeckCopy } from "@/features/discover/emptyDeckCopy";
import { SUPPORT_EMAIL } from "@/shared/constants/support";
import { showInfoToast, showMissedMatchToast } from "@/shared/services/toaster";
import { runFlameSweep } from "@/features/discover/flameSweep";
import {
  DISCOVER_CARD_TOP_GAP,
  DISCOVER_HEADER_HEIGHT,
} from "@/features/discover/components/discoverHeaderMetrics";
import NoteComposerModal from "@/features/discover/components/NoteComposerModal";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import {
  NOTE_SEND_CODES,
  noteSendCodeI18nKey,
} from "@/shared/constants/responseCodes";
import uiBus, {
  cardExpandAnim,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import { useEvent } from "@/shared/hooks/useEvent";
import { mark } from "@/shared/debug/startupTiming";
import { hideSplash } from "@/shared/splash";
import { markAppShellReady } from "@/shared/bootPhase";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { store } from "@/shared/store";
import { hasLikedMe, removeWhoLikedMe } from "@/features/discover/swipeSlice";
import { refreshEntitlementsForPaywall } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import { analytics } from "@/shared/services/analytics";
import { navigationRef } from "@/shared/services/navigationRef";
import type { NoteTarget, PotentialMatch } from "@/shared/types";

// Tab bar geometry — TabNavigator ile tutarlı:
// FLOATING_BAR_HEIGHT (64) + FLOATING_BAR_BOTTOM_GAP (-10) + insets.bottom + extra gap (12)
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;
// Kart alt kenarı ile yüzen tab bar arasındaki nefes payı. 12 → 4: kart tab
// bar'a bir tık daha yaklaşsın istendi; 0 yapılmıyor, kartın yuvarlak köşesi
// bar'a değmiş gibi durmasın.
const CARD_BOTTOM_GAP = 4;

// Günlük beğeni kotası azalırken uyarı verilen KALAN hak eşikleri.
// Tavanın yüzdesi DEĞİL mutlak sayı: tavan sunucu config'inden geliyor
// (`SwipeLimits`, free'de 30) ve değişebiliyor — "son 10 / son 5 hak" iki
// tavanda da aynı şeyi anlatır, %33 anlatmaz. Toast'ta eşik değil KALAN hak
// yazıldığı için, tek adımda iki eşik birden geçilse de tek toast çıkar ve
// doğru sayıyı söyler.
const SWIPE_WARN_THRESHOLDS = [10, 5] as const;

// NOT — kart açılırken tab bar'ı `display:"none"` ile gizlemek DENENDİ ve
// vazgeçildi: bu gizleme animasyona açılmıyor. react-native-screens
// `setTabBarHidden:animated:NO` çağırıyor; yamayla önce `animated:YES`, sonra
// çağrıyı Fabric'in mount fazının dışına atıp (dispatch_async) kendi
// `UIView animateWithDuration:` + `layoutIfNeeded` bloğumuza alarak denendi.
// İkisinde de bar tek karede kayboldu — iOS 26'nın yüzen tab bar'ı bu yoldan
// animasyonlanmıyor. Bar'ın çekilmesini artık iOS 26'nın KENDİ küçülme
// davranışı yapıyor (bkz. TabNavigator > tabBarMinimizeBehavior).

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
          colors={["transparent", ink(0.12), "transparent"]}
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
          colors={["transparent", colors.shimmer, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
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
          borderColor: ink(0.55),
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

// Boş deste kartı. `title`/`actionLabel` verilirse backend'in yapısal boşluk
// sebebi (emptyReason) gösterilir; verilmezse eski davranış (yalnız radar).
const EmptyDiscoverCard = ({
  title = null,
  actionLabel = null,
  onAction = null,
  secondaryLabel = null,
  onSecondary = null,
  busy = false,
}: {
  title?: string | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  // İkincil çıkış yolu — pratikte hep "Mesafe sınırını kaldır". Sebebin kendi
  // aksiyonunun YERİNE geçmiyor, altına düz metin bağlantı olarak ekleniyor:
  // deste hangi sebeple boşalırsa boşalsın mesafe sınırı hâlâ açık duruyorsa
  // kullanıcıya sunulacak somut bir çare var (bkz. emptyCopy).
  secondaryLabel?: string | null;
  onSecondary?: (() => void) | null;
  // Aksiyon uçuşta ("Daha uzağı göster" isteği). Buton pasifleşiyor: yavaş
  // bağlantıda hiçbir şey olmamış gibi görünüp tekrar tekrar basılıyordu.
  busy?: boolean;
}) => {
  const hasReason = !!title;
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

      {/* Bottom bölge: sebep biliniyorsa metin + aksiyon, bilinmiyorsa
          SwipeCard overlay'ini taklit eden placeholder block'lar. */}
      {hasReason ? (
        <View
          style={{
            position: "absolute",
            bottom: 70,
            left: 24,
            right: 24,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "700",
              marginBottom: actionLabel || secondaryLabel ? 16 : 0,
            }}
          >
            {title}
          </Text>
          {actionLabel && onAction && (
            <TouchableOpacity
              onPress={onAction}
              disabled={busy}
              activeOpacity={0.8}
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: colors.litPlus,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
              >
                {actionLabel}
              </Text>
            </TouchableOpacity>
          )}
          {secondaryLabel && onSecondary && (
            <TouchableOpacity
              testID="empty-remove-distance-limit"
              onPress={onSecondary}
              disabled={busy}
              activeOpacity={0.8}
              // Dolgusuz: birincil aksiyonla yarışmasın. Dokunma alanı yine de
              // parmak boyutunda kalsın diye dikey padding var, hizayı bozmasın
              // diye negatif marginLeft ile sola çekiliyor.
              style={{
                alignSelf: "flex-start",
                marginTop: actionLabel ? 10 : 0,
                marginLeft: -8,
                paddingHorizontal: 8,
                paddingVertical: 8,
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 14,
                  fontWeight: "600",
                  textDecorationLine: "underline",
                }}
              >
                {secondaryLabel}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
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
      )}

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
  // Yanıt henüz inmemişken kullanılan yer tutucu — free TAVANI, dar bir değer
  // değil. Mesafe 2026-08-21'den beri katı filtre: burada dar bir varsayılan,
  // gerçek filtresi geniş olan kullanıcıya bir an boş deste gösterirdi.
  // Gerçek sınırlar `/Filters` yanıtından geliyor (bkz. resolveDistanceBounds).
  maxDistance: FREE_MAX_DISTANCE_KM,
  // Yanıt inmeden ÖNCE "sınır uygulanıyor" varsayılıyor. Ters yön (true) boş
  // destede "Mesafe Sınırını Kaldır" butonunu gizlerdi — yani kullanıcıyı
  // gerçekte açık olan tek çözümden mahrum bırakırdı.
  ignoreDistanceFilter: false,
  genders: [],
  interestedIn: [],
  preferredCity: null,
  // "Ben kimi göreyim" üniversite tercihi — çoklu (max 3). Tekil
  // `preferredUniversityDomain` deprecated.
  preferredUniversityDomains: [],
  // "Beni kim görsün / görmesin" listeleri — backend boş dizi döner (null değil).
  visibleOnlyToUniversityDomains: [],
  hiddenFromUniversityDomains: [],
  isPremium: false,
};

export default function DiscoverScreen() {
  useRenderCount("DiscoverScreen");
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const matchesQuery = usePotentialMatches();
  const filtersQuery = useSwipeFilters();
  const statsQuery = useSwipeStats();
  const swipeMutation = useSwipeMutation();
  const noteMutation = useNoteMutation();
  const saveFiltersMutation = useSaveFilters();
  const undoMutation = useUndoSwipe();
  const ignoreDistanceMutation = useSetIgnoreDistanceFilter();
  const updateStatsCache = useUpdateStatsCache();

  // Deste ilerlemesi hesap bazlı saklanıyor (bkz. deckProgress.ts). Selector
  // burada, ref'lerden ÖNCE okunuyor: aşağıdaki lazy initializer'lar userId'ye
  // ihtiyaç duyuyor. Tutorial bayrağı da aynı değeri kullanır.
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const [restoredDeck] = useState(() => loadDeckProgress(currentUserId));

  // Swipe edilen userId → swipe ANI. Backend geçmiş swipe'ları zaten filtreliyor;
  // bu küme yalnızca commit yarışını kapatıyor: stack boşalıp polling refetch
  // tetiklendiğinde swipe POST'ları henüz işlenmemiş olabiliyor (ZREM
  // fire-and-forget) ve az önce kaydırılan kart yanıtta hâlâ duruyor.
  // Prune aşağıdaki potentialMatches memo'sunda — veri hangi yoldan gelirse
  // gelsin (ilk fetch / fetchNextPage / polling refetch) aynı süzgeçten geçsin.
  //
  // ZAMAN DAMGASI ŞART: eleme yalnız SWIPE_GUARD_MS içindeki kayıtlara
  // uygulanıyor. Süresiz elerken tek bir uyuşmazlık desteyi gün boyu
  // öldürüyordu — backend profili bilerek yeniden sunsa bile (test verisi,
  // havuz tazeleme, swipe POST'unun düşmesi) istemci sessizce eliyor, aday
  // kalmayınca radar ekranı kilitleniyordu. Pencere dışında backend'e güven.
  const swipedAtRef = useRef<Map<string, number>>(
    new Map(restoredDeck.swipes),
  );
  const isGuarded = useCallback((userId: string) => {
    const at = swipedAtRef.current.get(userId);
    return at != null && Date.now() - at < SWIPE_GUARD_MS;
  }, []);

  // currentIndex burada tanımlı çünkü potentialMatches memo'su ona bağımlı
  // (aşağıdaki index-güvenli prune). Kardeş swipe state'leri render bölümünün
  // yanında kaldı.
  const [currentIndex, setCurrentIndex] = useState(0);
  // Son ilerleme, ekranı kaplayan bir kutlamanın ALTINDA mı oldu? Yalnız süper
  // beğenide true — yeni top kart giriş animasyonunu atlar (bkz. handleSwipe).
  const [coveredSwap, setCoveredSwap] = useState(false);

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
    const deduped: any[] = [];
    for (const p of all) {
      if (!p?.userId || seen.has(p.userId)) continue;
      seen.add(p.userId);
      deduped.push(p);
    }
    // "Geçmiş" ancak dizi currentIndex'e KADAR uzanıyorsa vardır. Refetch
    // 1. sayfayı eklemiyor DEĞİŞTİRİYOR: gelen dizi eski index'ten kısaysa
    // ortada korunacak geçmiş yok, o dizinin tamamı kuyruktur. Eski koşul
    // (out.length >= currentIndex) bu durumda HİÇBİR ŞEYİ elemiyordu ve
    // backend'in ZREM'i fire-and-forget olduğu için tam da o anda gelen
    // yanıtta az önce swipe edilen profiller duruyor olabiliyor → deste
    // boşalınca yapılan takviyede pass'lanan kart yeniden kartın üstüne
    // düşüyordu. Yarışı biz kapatıyoruz, backend'in commit'ini beklemeden.
    const historyLimit = deduped.length > currentIndex ? currentIndex : 0;
    const out = deduped.filter(
      (p, i) => i < historyLimit || !isGuarded(p.userId),
    );
    if (__DEV__) {
      // GEÇİCİ TEŞHİS LOGU — desteyi hangi adımın boşalttığını gösterir.
      const pruned = deduped.filter(
        (p, i) => !(i < historyLimit || !isGuarded(p.userId)),
      );
      // eslint-disable-next-line no-console
      console.log(
        `[deck] api=${all.length} dedupe=${deduped.length} → deste=${out.length} | ` +
          `currentIndex=${currentIndex} historyLimit=${historyLimit} ` +
          `swipeKaydı=${swipedAtRef.current.size} elenen=${pruned.length}`,
      );
      if (pruned.length) {
        // eslint-disable-next-line no-console
        console.log(
          `[deck] swipe koruması elemiş (<${SWIPE_GUARD_MS / 1000}sn):`,
          pruned.map((p) => `${p?.displayName}(${p?.userId})`).join(", "),
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        "[deck] gösterilecek:",
        out
          .map(
            (p, i) =>
              `${i === currentIndex ? "▶" : " "}${i}. ${p?.displayName ?? "?"} ` +
              `${p?.age ?? "-"}y ${p?.distance ?? "-"}km ${p?.universityName ?? "-"}`,
          )
          .join("\n") || "(BOŞ → EmptyDiscoverCard/radar gösterilir)",
      );
    }
    return out;
  }, [matchesQuery.data, currentIndex, isGuarded]);

  // ── Üst kartın KİMLİK demiri ────────────────────────────────────────────
  // currentIndex bu diziye bir POZİSYON. Infinite query refetch edilince
  // (foreground invalidate, profil/dil/satın alma invalidate'i, boş deste
  // yoklaması) React Query TÜM sayfaları baştan çekiyor ve backend swipe
  // edilenleri elediği için dizi başından kayıyor → aynı index'te bambaşka
  // biri oturuyordu, kart kullanıcı hiçbir şey yapmadan değişiyordu.
  //
  // Çözüm: üstte duran kullanıcının id'sini tut, veri altımızdan değişince
  // index'i o kişiyi gösterecek şekilde taşı. Realign YALNIZ `data` referansı
  // değiştiğinde yapılıyor — kullanıcının kendi ilerlemesinde (swipe/undo)
  // demir sadece tazeleniyor, yoksa her swipe geri alınırdı.
  //
  // Hizalama ve demir tazeleme TEK effect'te: iki ayrı effect'e bölününce
  // doğruluk tanımlanma sıralarına bağlı hale geliyor (önce hizala, sonra
  // tazele; ters sırada demir yanlış kartla eziliyor ve düzeltme hiç olmuyor).
  // useLayoutEffect: düzeltme aynı commit'te, boyanmadan önce uygulansın —
  // aksi halde yanlış kart bir kare görünürdü. Ortak yolda O(1), state
  // güncellemesi yok; findIndex sadece veri değiştiğinde çalışır.
  // setCurrentIndex sonrası memo yeniden hesaplanır ama demir yerinde kalır
  // (kuyruk budaması yalnız index'ten SONRAsını atar) → tek adımda oturur.
  //
  // Demir MMKV'den hidre ediliyor (deckProgress.ts): backend sırası artık
  // deterministik olduğu için önceki oturumun üst kartı yeni destede de aynı
  // yerde duruyor; ilk veri indiğinde aşağıdaki hizalama kullanıcıyı kaldığı
  // karta götürüyor. Kart destede yoksa (son swipe backend'e inmiş) index 0'da
  // kalır — doğrusu da o, çünkü backend swipe edilenleri havuzdan eliyor.
  const anchorUserIdRef = useRef<string | null>(restoredDeck.anchorUserId);
  const lastMatchesDataRef = useRef<unknown>(null);
  const persistedDeckSigRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const dataChanged = lastMatchesDataRef.current !== matchesQuery.data;
    lastMatchesDataRef.current = matchesQuery.data;
    const anchor = anchorUserIdRef.current;
    if (dataChanged && anchor) {
      const idx = potentialMatches.findIndex((p) => p?.userId === anchor);
      // idx === -1: kart destede yok (backend düşürmüş) → yapacak bir şey yok,
      // index olduğu yerde kalır. Demir bir sonraki commit'te tazelenir.
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx);
        return;
      }
    }
    // Deste boşken demiri SIFIRLAMA. İlk render'da (veri henüz inmemişken)
    // potentialMatches boş; koşulsuz atama MMKV'den gelen demiri daha
    // kullanılmadan siler ve "kaldığı yerden devam" hiç çalışmazdı.
    const topUserId = potentialMatches[currentIndex]?.userId ?? null;
    if (topUserId) anchorUserIdRef.current = topUserId;

    // Kalıcılaştırma: demir ya da swipe kümesi değiştiyse yaz. MMKV senkron ve
    // ucuz, ama her commit'te JSON.stringify etmenin anlamı yok — imza guard'ı
    // yalnız gerçek değişimde yazdırıyor.
    const sig = `${anchorUserIdRef.current ?? ""}|${swipedAtRef.current.size}`;
    if (sig !== persistedDeckSigRef.current) {
      persistedDeckSigRef.current = sig;
      saveDeckProgress(currentUserId, {
        anchorUserId: anchorUserIdRef.current,
        swipes: [...swipedAtRef.current],
      });
    }
  }, [matchesQuery.data, potentialMatches, currentIndex, currentUserId]);

  const loading = matchesQuery.isLoading;
  const filters = filtersQuery.data ?? DEFAULT_FILTERS;
  const remainingUndos = statsQuery.data?.remainingUndos ?? null;

  // ── Expand baseline: her taze destede collapsed başla ────────────────────
  // Expand durumu modül seviyesinde yaşıyor (uiBus), yani bu ekran unmount olsa
  // da değer kalıyor. Ekran yeniden mount olduğunda (tema değişimi ağacı
  // remount ediyor) veya top kart değiştiğinde (deste tazelenmesi, rewind,
  // engelleme) kart 1'de donmuş expand'le doğmasın diye baseline'ı burada
  // sıfırlıyoruz. Kartın kendi mount reset'i (SwipeCard) tek başına yetmiyor:
  // deste o an boşsa resetleyecek kart yok.
  //
  // EFFECT DEĞİL RENDER: hem cardContainerStyle'ın ilk paddingBottom değeri bu
  // render'da hesaplanıyor, hem de SwipeCard yüksekliğini ilk layout'ta ölçüyor.
  // Effect'e bırakılsaydı ilk ölçüm expanded geometride yapılırdı.
  const topProfileId: string | undefined =
    potentialMatches[currentIndex]?.userId;
  const expandBaselineRef = useRef<{ id?: string } | null>(null);
  if (
    !expandBaselineRef.current ||
    expandBaselineRef.current.id !== topProfileId
  ) {
    expandBaselineRef.current = { id: topProfileId };
    resetCardExpandState();
  }
  // Ekran kapanırken de temizle — expanded'ken çıkılıp geri gelindiğinde ilk
  // frame collapsed olsun (deste henüz yüklenmemişse bile header/padding doğru).
  useEffect(() => resetCardExpandState, []);

  // Tier'ın ekrandaki tek kaynağı: abonelik slice'ı (bkz.
  // features/profile/premiumTier). ÖNCESİ `statsQuery.data?.isPremium ?? redux`
  // idi — `/stats` oturumda bir kez çekildiği için premium bitince o cevap
  // "premium" kalıyor ve backtrack/filtre kilitleri açık kalmaya devam
  // ediyordu. `/stats` artık yalnız kota SAYILARININ kaynağı.
  const { isPremium: subscriptionIsPremium, resolved: premiumResolved } =
    usePremiumTier();
  const isPremium = premiumResolved
    ? subscriptionIsPremium
    : (statsQuery.data?.isPremium ?? subscriptionIsPremium);

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
  // oynanan bir ayar, hep "1" göstermesin). interestedIn de dahil değil: kimden
  // hoşlandığın bir "filtre" değil, kalıcı tercih — rozeti sürekli dolu gösterirdi.
  // Sadece şehir/üni ve görünürlük listeleri sayılır.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.preferredCity) count++;
    // Üniversite tercihi de artık liste: kaç domain seçildiğinden bağımsız 1.
    if ((filters.preferredUniversityDomains || []).length > 0) count++;
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
    // `null` = değer henüz bilinmiyor (satın alma sonrası optimistic pencere) →
    // bloklama. Negatif ise TÜKENMİŞ sayılır: SuperLike'ın "sınırsız" hâli yok
    // (doküman tuzak #2). Eskiden `rem < 0` sınırsız gibi ele alınıyordu ve
    // backend refund'da claw-back yapmama kararını tam bu yanlış yoruma
    // dayandırıyor — v2'de gerçek revoke gelirse bedava SuperLike dağıtırdık.
    if (rem == null) return false;
    return rem <= 0;
  }, [statsQuery.data?.superLikesRemaining]);

  // Rewind free kullanıcıda artık bir premium özelliği (backend dailyUndoLimit=0
  // dönüyor) — "günlük hakkı tükendi" değil. Rozette "0" göstermek yanlış hikâye
  // anlatıyordu ("hakkım bitti, yarın gelir"); kilit ikonu doğru olanı söylüyor.
  // remainingUndos null = değer bilinmiyor (eski backend / ilk yükleme) → kilit
  // YOK, eski davranış korunur.
  const undoLocked = useMemo(() => {
    if (statsQuery.data?.isPremium) return false;
    return remainingUndos === 0;
  }, [statsQuery.data?.isPremium, remainingUndos]);

  // currentIndex yukarıda, potentialMatches memo'sundan önce tanımlı.
  const [isSwiping, setIsSwiping] = useState(false);
  const [lastSwipeWasPass, setLastSwipeWasPass] = useState(false);

  // Boş kart durumu (radar animasyonu) açıkken her 5sn'de bir potential
  // matches refetch — backend'in yeni profilleri var mı diye yokla. Max 5
  // deneme; sonrasında animasyon devam eder ama istek atmaz. Yeni profil
  // gelirse (isEmpty=false) sayaç resetlenir.
  const pollCountRef = useRef(0);
  const [pollEpoch, setPollEpoch] = useState(0);
  const isEmptyStack =
    !matchesQuery.isLoading && potentialMatches.length <= currentIndex;

  // ── Boş destenin YAPISAL sebebi ─────────────────────────────────────────
  // Backend boş dönerken sessiz değil: `emptyReasonCode` (UT-6xxx) + kardeşi
  // `emptyReason` enum'u ile nedeni taşıyor. Bunlar okunmadığı sürece
  // kullanıcı filtresi çok darken de, profili eksikken de aynı radar
  // animasyonunu izliyordu.
  //
  // Sebep SON sayfadan okunuyor: dolu sayfaların ardından gelen boş sayfa
  // güncel durumu taşır (ilk sayfa dolu geldiyse `emptyReason: "None"`dur).
  const lastPage = matchesQuery.data?.pages?.[matchesQuery.data.pages.length - 1];
  const emptyEntry: CodeEntry | null = useMemo(() => {
    if (!lastPage) return null;
    // Zarftaki `code` ile result'taki `emptyReasonCode` semantik olarak aynı;
    // backend ikisini de doldurabiliyor, hangisi doluysa o kullanılır.
    return resolveCode(
      lastPage.emptyReasonCode ?? lastPage.code,
      lastPage.emptyReason,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPage?.emptyReasonCode, lastPage?.code, lastPage?.emptyReason]);

  // Yapısal sebep VARSA ve o sebep geçici değilse (autoRetry yok) kör yoklama
  // yapma: "filtrelerin çok dar" durumunda 5 kez 5 saniyede bir istek atmanın
  // hiçbir karşılığı yok, sadece kotayı ve pili yiyor. Sebep çözülemediğinde
  // (bilinmeyen kod / alan hiç gelmiyor) eski davranış korunuyor.
  const pollBlocked = emptyEntry != null && !emptyEntry.autoRetry;

  // Foreground'a dönüşte desteyi tazeleme kararı BURADA veriliyor (eskiden
  // AppNavigator koşulsuz invalidate ediyordu). Deste doluysa dokunmuyoruz:
  // kullanıcı destenin ortasındayken tüm sayfaları yeniden çekmek hem 4 ağ
  // isteği + render churn, hem de sırayı kaydırıp kartı altından değiştiriyor.
  // Boşsa tazeliyoruz — AppNavigator'daki asıl gerekçe buydu: önceki oturumdan
  // kalan boş sayfa, kullanıcı filtreye dokunmadan hiç yenilenmiyordu.
  const isEmptyStackRef = useRef(isEmptyStack);
  useEffect(() => {
    isEmptyStackRef.current = isEmptyStack;
  }, [isEmptyStack]);
  const refetchMatches = useEvent(() => {
    matchesQuery.refetch();
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" || !isEmptyStackRef.current) return;
      // Yeni bir "boş deste" periyodu: 5'lik yoklama hakkı da yenilensin,
      // interval yeniden kurulsun (sayaç dolmuşsa effect kendiliğinden
      // çalışmaz, epoch bump'ı olmadan bir daha hiç yoklamaz).
      pollCountRef.current = 0;
      setPollEpoch((e) => e + 1);
      refetchMatches();
    });
    return () => sub.remove();
  }, [refetchMatches]);

  useEffect(() => {
    if (!isEmptyStack) {
      pollCountRef.current = 0;
      return;
    }
    if (pollBlocked) return;
    if (pollCountRef.current >= 5) return;
    const intervalId = setInterval(async () => {
      if (pollCountRef.current >= 5) {
        clearInterval(intervalId);
        return;
      }
      pollCountRef.current += 1;
      // Prune burada YAPILMIYOR. Eskiden refetch sonrası cache'i
      // swipe kümesine göre setQueryData ile yeniden yazıyorduk; iki
      // sorunu vardı: (1) fetchNextPage ile gelen sayfalar bu yoldan hiç
      // geçmediği için swipe edilmiş kullanıcı tekrar kart olarak çıkabiliyordu,
      // (2) her tick cache'i yeniden yazıp gereksiz re-render üretiyordu.
      // Süzgeç artık potentialMatches memo'sunda, tüm veri yollarını kapsıyor.
      await matchesQuery.refetch();
    }, 5000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmptyStack, pollEpoch, pollBlocked]);

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
        icon: 'superLike',
      });
    } else {
      showInfoToast({
        title: t('discover.swipe.superLikeExhaustedTitle'),
        message: t('discover.swipe.superLikeExhaustedMessage'),
        icon: 'superLike',
      });
    }
    setSuperLikePurchaseVisible(true);
  });

  // Beğeni kotasının yenilenmesine kalan süre — ÇIPLAK metin, mesajın içine
  // gömülmek için. Ham `swipeResetInSeconds` KULLANILMIYOR: /Stats oturumda bir
  // kez çekiliyor (staleTime: Infinity), saatler önce hesaplanmış bir sayı
  // olduğu yerde donardı. resolveResetSeconds mutlak damgadan
  // (`nextSwipeResetAt`) ya da cache'e yazılma anından tazeliyor.
  // null = gösterilecek geri sayım yok → çağıran süresiz metne düşer, yanlış
  // vaat vermiyoruz (SuperLike metinlerindeki ayrımın aynısı).
  const resolveSwipeResetText = useEvent(() =>
    formatResetDuration(
      resolveResetSeconds({
        absoluteAt: statsQuery.data?.nextSwipeResetAt,
        seconds: statsQuery.data?.swipeResetInSeconds,
        fetchedAt: statsQuery.dataUpdatedAt,
        now: Date.now(),
      }),
      t,
    ),
  );

  // Kota bitti bilgisi — yalnız BEĞENİ yolunda (buton, sağa kaydırma,
  // backend'in showPaywall'ı). Pass'te BİLEREK sessiziz: pass kotaya sayılmıyor,
  // engellenmiyor ve kullanıcı desteyi elemeye devam ederken her kartta toast
  // yemek istemiyor. Paywall'ı bu fonksiyon AÇMAZ — sheet kararı çağıranın
  // (SuperLike'taki kalıbın aynısı).
  const showSwipeQuotaExhaustedToast = useEvent(() => {
    const time = resolveSwipeResetText();
    showInfoToast({
      title: t("discover.swipe.quotaExhaustedTitle"),
      message: time
        ? t("discover.swipe.quotaExhaustedMessageWithTime", { time })
        : t("discover.swipe.quotaExhaustedMessage"),
      // Kalp DEĞİL tik: kalp bu ekranda "beğeni gönderildi" işareti, kota
      // toast'ında gönderilmiş bir beğeni yok. Siyah daire iki temada da aynı.
      icon: "check",
    });
  });

  // Kalan hak eşiği (SWIPE_WARN_THRESHOLDS) aşağı doğru geçilince uyarı.
  //
  // Değere doğrudan bakıp "=== 10" demek iki yerde yanılırdı: (1) uygulama
  // zaten 10 hakla açıldığında kullanıcı hiç kaydırmadan toast yerdi, (2)
  // optimistic düşüş ile sunucu cevabı aynı sayıyı iki kez yazınca toast
  // tekrarlardı. O yüzden duyurulan şey değer değil GEÇİŞ: önceki okuma eşiğin
  // üstünde, yenisi eşikte veya altında.
  const lastRemainingSwipesRef = useRef<number | null>(null);
  useEffect(() => {
    const rem = statsQuery.data?.remainingSwipes;
    // Premium / -1 (sınırsız) / null (bilinmiyor) → sayaç anlamsız. Ref de
    // sıfırlanıyor: premium bitip kota geri geldiğinde ilk okuma bir "düşüş"
    // sanılmamalı.
    if (statsQuery.data?.isPremium || rem == null || rem < 0) {
      lastRemainingSwipesRef.current = null;
      return;
    }
    const prev = lastRemainingSwipesRef.current;
    lastRemainingSwipesRef.current = rem;
    // İlk okuma, ya da hak ARTTI (günlük yenilenme, rewind, başarısız swipe'ın
    // geri sarılması) → uyarılacak bir şey yok.
    if (prev == null || rem >= prev) return;
    // 0 bu toast'ın işi değil ("0 hakkın kaldı" demezdi); tükenme mesajı her
    // denemede showSwipeQuotaExhaustedToast'tan çıkıyor.
    if (rem === 0) return;
    if (!SWIPE_WARN_THRESHOLDS.some((th) => prev > th && rem <= th)) return;
    const time = resolveSwipeResetText();
    showInfoToast({
      title: t("discover.swipe.quotaLowTitle"),
      message: time
        ? t("discover.swipe.quotaLowMessageWithTime", { count: rem, time })
        : t("discover.swipe.quotaLowMessage", { count: rem }),
      // Tükenme toast'ıyla aynı simge — ikisi tek hikâyenin iki anı.
      icon: "check",
    });
    // resolveSwipeResetText useEvent — referansı stabil, resubscribe yok.
  }, [
    statsQuery.data?.remainingSwipes,
    statsQuery.data?.isPremium,
    resolveSwipeResetText,
    t,
  ]);

  // Premium modalını açmadan önce canonical state'i tazele (doküman §11):
  // kullanıcı başka bir cihazda premium olmuş olabilir ve ona tekrar satış
  // ekranı göstermek "zaten aldım, hâlâ para istiyor" şikâyetinin kaynağı.
  // Premium çıkarsa modal yerine kotaları tazeliyoruz — bu ekranda "hakkın
  // bitti" sayacı ile premium durumu aynı anda duramaz.
  //
  // NOT: SuperLike paket sheet'i bu kontrolden GEÇMEZ; o premium'da da açılıyor
  // (backend `showPaywall:true` dönüyor, satılacak paket var — §10).
  const openPremiumPaywall = useEvent(() => {
    dispatch(refreshEntitlementsForPaywall())
      .unwrap()
      .then((premium) => {
        if (premium) {
          statsQuery.refetch?.();
          // Filtreler de premium'a bağlı dönüyor (premiumOnlyFields + kayıtlı
          // premium alanlar); stats'ı tazeleyip onu bayat bırakmak modalı
          // yarım güncel bırakırdı.
          filtersQuery.refetch?.();
          return;
        }
        openLitPlus();
      })
      // Tazeleme başarısızsa paywall'ı YİNE aç: kullanıcıyı satın alma yolundan
      // ağ hatası yüzünden koparmak, gereksiz modaldan daha kötü.
      .catch(() => openLitPlus());
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
      // Sheet tek başına "neden" demiyor — sağa kaydırma sessizce geri
      // zıplıyordu ve satış ekranı sebepsiz açılmış gibi duruyordu. Toast
      // durumu (ve yenilenme süresini) söylüyor, sheet çıkışı sunuyor.
      //
      // ⚠️ AMA yalnız BEĞENİ kotası yolunda. Bu event'i premium filtreler
      // (FilterModal'daki kilitli bölüm dokunuşu + useSaveFilters'ın 403'ü) ve
      // geri alma kotası da kullanıyor; hepsinde "beğeni hakkın şu saatte
      // yenilenecek" toast'ı çıkması konuyla alakasız bir bilgi veriyordu.
      // `paywallType` yoksa eski/serbest emit (SwipeWrapper sağa kaydırma) —
      // o yol yalnız kota için var, geriye dönük uyumlu kalsın diye toast çıkar.
      const type = payload?.paywallType;
      if (!type || type === "SWIPE_LIMIT") showSwipeQuotaExhaustedToast();
      openPremiumPaywall();
    });
    // SuperLike kota bittiğinde SwipeWrapper bu event'i emit eder (pull-up swipe).
    const unsubSuperLike = uiBus.on("superLikePaywall", () => {
      showSuperLikeLimitUi();
    });
    // Not bakiyesi biterken backend 200 + showPaywall ile de uyarabiliyor
    // (402 yolu handleSendNote'ta ele alınıyor). İkisi de aynı sheet'i açar.
    const unsubNote = uiBus.on("notePaywall", () => {
      setNotePurchaseVisible(true);
    });
    return () => {
      unsubSwipe();
      unsubSuperLike();
      unsubNote();
    };
    // showSuperLikeLimitUi / openPremiumPaywall useEvent — referansları stabil,
    // resubscribe gerekmez.
  }, [showSuperLikeLimitUi, openPremiumPaywall, showSwipeQuotaExhaustedToast]);

  const [filterVisible, setFilterVisible] = useState(false);

  // Filtre modalı açılırken tier'ı canonical kaynaktan teyit et. İki cache de
  // kendi başına bayat kalabiliyor: /Stats oturumda BİR KEZ çekiliyor
  // (staleTime: Infinity + refetchOnMount:false), /Filters 5 dk stale duruyor.
  // Premium satın almadan SONRA aktifleşiyorsa — sandbox'ta webhook dakikalar
  // sonra iniyor, RC `purchasePackage` throw edip optimistic patch'i hiç
  // çalıştırmayabiliyor — modal kilitleri ve 50 km tavanı app reload edilene
  // kadar duruyordu.
  //
  // Paywall yolundaki refresh'in aynısı: premium'sa hiç istek atmıyor, 30 sn
  // throttle + 1.5 sn tavan süresi var. Premium çıkarsa redux flip'i UI'ı
  // ANINDA açıyor (useSwipeStats redux'ı /Stats üzerine overlay ediyor);
  // refetch'ler arkadan server-truth kotaları ve premium alan listesini
  // getiriyor.
  const verifyTierForFilters = useEvent(() => {
    dispatch(refreshEntitlementsForPaywall())
      .unwrap()
      .then((premium) => {
        if (!premium) return;
        statsQuery.refetch?.();
        filtersQuery.refetch?.();
      })
      // Teyit başarısızsa elimizdeki değerle devam — modalı bekletmiyoruz.
      .catch(() => {});
  });

  useEffect(() => {
    if (!filterVisible || isPremium) return;
    verifyTierForFilters();
  }, [filterVisible, isPremium, verifyTierForFilters]);

  const lastSwipePromiseRef = useRef(null);

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);
  // Kart yığınının yandan giriş ofseti. Boş-durum aksiyonlarından ÖNCE
  // tanımlı: "Daha uzağı göster" de filtre kaydetme gibi taze desteyi
  // animasyonla içeri alıyor.
  const stackEntryX = useSharedValue(0);

  // ── "Mesafe sınırını kaldır" (kalıcı anahtar) ───────────────────────────
  // Mesafe KATI filtre: yarıçap dışındaki profiller hiç gelmiyor ve backend
  // kendiliğinden genişletmiyor. Az kullanıcılı şehirlerde deste bu yüzden
  // boşalıyordu; kaçış yolu artık filtrelerdeki KALICI `ignoreDistanceFilter`
  // anahtarı (2026-08-22). Tek seferlik "daha uzağı göster" akışı —
  // `canExpandRadius` / `wasRadiusExpanded` / `?expandRadius=true` — tamamen
  // kaldırıldı; backend o alanları artık göndermiyor.
  //
  // Anahtar ZATEN AÇIKKEN buton çizilmemeli: basmak hiçbir şeyi değiştirmez,
  // kullanıcı aynı boş desteye bakmaya devam eder. Eskiden bu kararı backend
  // veriyordu (`canExpandRadius`); alan kalktığı için koşul burada kuruluyor.
  // İki kaynak da okunuyor — deste yanıtı (bu destenin gerçeği) ve filtre
  // yanıtı (kaydedilmiş tercih) — hangisi taze gelirse gelsin buton doğru
  // davransın.
  const distanceLimitAlreadyOff =
    lastPage?.distanceFilterIgnored === true ||
    filters?.ignoreDistanceFilter === true;

  const removeDistanceLimit = useEvent(async () => {
    if (ignoreDistanceMutation.isPending) return;
    try {
      await ignoreDistanceMutation.mutateAsync(true);
      // Taze deste listenin BAŞINDAN gösterilmeli. currentIndex tükenmiş
      // destenin sonunda duruyor; sıfırlanmazsa yeni deste ondan uzunsa
      // baştaki profiller sessizce atlanırdı. Filtre kaydetme yolundaki
      // (handleSaveFilters) davranışın aynısı — giriş animasyonu dahil.
      setCurrentIndex(0);
      stackEntryX.value = ENTRY_DISTANCE;
      stackEntryX.value = withTiming(0, {
        duration: ENTRY_DURATION,
        easing: ENTRY_EASING,
      });
    } catch (err: any) {
      // Sessiz kalma: kullanıcı butona bastı, deste hâlâ boş — hiçbir şey
      // olmadıysa bunu bilmeli, yoksa buton bozuk sanılıp tekrar tekrar
      // basılıyor.
      Alert.alert("", err?.message || t("discover.distanceLimit.error"));
    }
  });

  // ── Profil keşifte görünmüyorken ETKİLEŞİMLER kilitli ───────────────────
  // GÖRÜNÜRLÜK KİLİT DEĞİL: profil keşif havuzunda görünmüyorken de (fotoğraf
  // incelemede / yetersiz görünür fotoğraf) beğeni, süper beğeni, pass ve not
  // SERBEST. Backend hiçbir uçta foto onayına bakmıyor (rehber §3) — istemcinin
  // kapatması sunucuda karşılığı olmayan bir kural yaratıyordu; kullanıcı
  // butonun neden çalışmadığını anlamıyordu. Durum yalnızca ANLATILIYOR:
  // Discover'da bir kez `ProfileHiddenGate`, profil ekranında kalıcı
  // `ProfileVisibilityBanner`.
  //
  // Tek istisna `Suspended`: o hesap yaptırımı ve kapısı navigator'ın dışında
  // (`AccountBlockedScreen`) — bu ekran hiç mount olmuyor.

  // ── Boş durum metni + aksiyonu ──────────────────────────────────────────
  // Karar `emptyDeckCopy.ts`de (saf + test edilebilir). Özet: mesafe sınırı
  // hâlâ uygulanıyorsa "Mesafe sınırını kaldır" deste hangi sebeple boşalırsa
  // boşalsın teklif edilir; sebebin kendi aksiyonu birincil buton olarak
  // kalır, teklif altına ikincil satır olarak biner.
  const emptyCopy = useMemo(
    () =>
      resolveEmptyDeckCopy({
        entry: emptyEntry,
        backendMessage: lastPage?.emptyReasonMessage,
        distanceLimitOff: distanceLimitAlreadyOff,
        deckSettled: isEmptyStack,
        t,
      }),
    [
      emptyEntry,
      lastPage?.emptyReasonMessage,
      distanceLimitAlreadyOff,
      isEmptyStack,
      t,
    ],
  );

  // `removeDistanceLimit` filtre ekranını AÇMIYOR, anahtarı doğrudan açıyor:
  // tek dokunuşla çözülen bir sorun için ekran değiştirmek gereksiz sürtünme.
  // Kullanıcının seçtiği `maxDistance`a dokunulmuyor — saklanıyor ve anahtar
  // kapatılınca geri geliyor.
  const handleEmptyAction = useEvent(() => {
    switch (emptyCopy?.actionKind) {
      case "removeDistanceLimit":
        removeDistanceLimit();
        return;
      case "openFilters":
        setFilterVisible(true);
        return;
      case "completeProfile":
        navigation.navigate("Profile");
        return;
      case "openPaywall":
        openPremiumPaywall();
        return;
      case "retry":
        // Yoklama hakkını da yenile: PoolWarming'de kullanıcı butona basınca
        // yalnız tek istek değil, yeni bir 5'lik tur başlasın.
        pollCountRef.current = 0;
        setPollEpoch((e) => e + 1);
        refetchMatches();
        return;
      case "contactSupport": {
        const code = emptyEntry?.code ?? "";
        const subject = encodeURIComponent(
          t("discover.empty.supportSubject", {
            code,
            defaultValue: code,
          }),
        );
        Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(
          () => {},
        );
        return;
      }
      default:
        return;
    }
  });

  // ─── Tutorial (ilk giriş kart swipe demo) ────────────────────────────────
  // Flag hesap bazlı: aynı cihazda açılan yeni hesap jesti hiç görmemiş bir
  // kullanıcıdır, tekrar göstermek gerekir.
  const TUTORIAL_TX = 55; // like/pass threshold (85) altında
  const TUTORIAL_SWING_DURATION = 550;
  const TUTORIAL_STORAGE_KEY = "discoverSwipeTutorialShown";
  // Görünürlük kapısı en fazla bu kadar bekler (bkz. tutorialResolved).
  const TUTORIAL_GATE_MAX_WAIT = 8000;
  // currentUserId yukarıda, deste hidrasyonundan önce okunuyor.
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

  /**
   * Görünürlük kapısı (`ProfileHiddenGate`) demoyu beklesin mi?
   *
   * Kapı kartın ÜSTÜNDE açılıyor; profili havuzda görünmeyen (fotoğrafları
   * incelemede olan) YENİ kullanıcıda demo kapının arkasında oynayıp bir daha
   * oynamamak üzere "görüldü" işaretleniyordu. Kapı, demo çözülene kadar
   * bekletiliyor — bkz. swipeTutorialGate.ts.
   *
   * "Çözüldü" = oynadı/yarıda kesildi, ya da oynamayacağı kesinleşti: bayrak
   * zaten yazılı (mount'ta senkron okunuyor — kapı bir kare bile boşuna
   * gecikmesin), demo edilecek kart yok, ya da güvenlik süresi doldu. Süre
   * kaçışı olmadan deste hiç gelmezse kapı sonsuza dek kapalı kalır ve
   * kullanıcı profilinin neden gizli olduğunu HİÇ öğrenemezdi.
   *
   * currentUserId'nin mount'ta dolu olduğu varsayımı yukarıdaki deste
   * hidrasyonuyla (loadDeckProgress) aynı: bu ekran main navigator altında.
   */
  const [tutorialResolved, setTutorialResolved] = useState(() =>
    currentUserId
      ? appPrefs.getBoolean(`${TUTORIAL_STORAGE_KEY}:${currentUserId}`) === true
      : true,
  );

  useEffect(() => {
    setSwipeTutorialBlocking(!tutorialResolved && screenFocused);
  }, [tutorialResolved, screenFocused]);
  // Ekran ağaçtan kalkarsa bayrak asılı kalmasın (kapıyı kilitler).
  useEffect(() => () => setSwipeTutorialBlocking(false), []);

  // markSeen=true → demo sonuna kadar oynadı, flag yazılır. Ekran erkenden
  // arkaplana düşerse yazılmaz; bir sonraki açılışta tekrar oynar.
  const stopTutorial = useEvent((markSeen: boolean) => {
    if (!tutorialLiveRef.current) return;
    tutorialLiveRef.current = false;
    // markSeen'den BAĞIMSIZ: demo bu mount'ta bir daha oynamıyor
    // (tutorialDoneRef), kapıyı daha fazla bekletmenin anlamı yok.
    setTutorialResolved(true);
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

  // Demo oynamayacağı kesinleşince kapıyı serbest bırak. Oynamaya başladıysa
  // (tutorialActive) karışma: bitişte stopTutorial zaten çözüyor. KVKK onayı
  // beklenirken saat işletilmiyor — onay sheet'i uzun sürerse kapı, demo hiç
  // oynamadan açılırdı.
  useEffect(() => {
    if (tutorialResolved || tutorialActive) return;
    if (!loading && !hasCardToDemo) {
      setTutorialResolved(true);
      return;
    }
    if (!kvkkAccepted) return;
    const id = setTimeout(
      () => setTutorialResolved(true),
      TUTORIAL_GATE_MAX_WAIT,
    );
    return () => clearTimeout(id);
  }, [tutorialResolved, tutorialActive, loading, hasCardToDemo, kvkkAccepted]);

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
    // CLAMP ŞART, kozmetik değil. Bütün collapse yolları
    // `withSpring(0, {damping:16, stiffness:380})` kullanıyor; sönüm oranı ~0.41,
    // yani spring 0'ın ALTINA sarkıyor (~-0.2). Clamp'siz `1 - value` o karelerde
    // 1'i aşıyor ve dolgu dinlenme değerinin üstüne çıkıyor → kart, collapsed
    // boyundan ~25px DAHA KISA bir frame'de ölçülüyor.
    //
    // Bedeli kalıcı: SwipeCard yüksekliği "en küçük ölçüm kazanır" kuralıyla
    // kilitliyor (bkz. oradaki onLayout notu), yani o geçici kare photoHeight'ı
    // sonsuza dek küçültüyor. Panel `marginTop: PROFILE_PANEL_GAP` ile kapağa
    // göre konumlandığı için aradaki fark kadar YUKARI kayıyor: panel kapak
    // fotoğrafının üstüne biniyordu ("bazen expand ederken bozuluyor" —
    // yarıda bırakılan bir pull-up'ın geri snap'i de aynı springi çalıştırıyor).
    // SwipeWrapper'daki `bottom` aynı sebeple zaten clamp'li.
    paddingBottom:
      tabBarOccupied * (1 - Math.max(0, Math.min(1, cardExpandAnim.value))),
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

  // ── Deste takviyesi: kuyruk 5'in altına düşünce ─────────────────────────
  // Karar mantığı deckTopUp.ts'te (sonsuz döngü guard'ı + neden refetch'in yeni
  // profil getirdiği orada anlatılıyor). Buradaki tek iş kararı uygulamak.
  //
  // Eskiden yalnız fetchNextPage vardı: `hasNextPage` false dönen destede
  // takviye HİÇ olmuyordu, kullanıcı 10 kartı bitirip radar ekranına düşüyor ve
  // yeni profilleri boş-deste yoklamasının ilk tick'inde (≥5sn sonra) görüyordu.
  const lastTopUpSigRef = useRef<string | null>(null);
  const lastTopUpRefetchAtRef = useRef(0);
  useEffect(() => {
    // Kuyruk = henüz gösterilmemiş kartlar. Slice yalnız eşiğin altındayken
    // anlamlı ama ölçüsü zaten küçük; dizi kimliği üzerinden karar veriyoruz
    // çünkü refetch sayfayı ekleme değil DEĞİŞTİRME yapıyor (uzunluk yanıltır).
    const tailIds = potentialMatches
      .slice(currentIndex)
      .map((p: any) => p?.userId)
      .filter(Boolean) as string[];
    const { action, signature } = decideTopUp({
      tailIds,
      // isFetchingNextPage değil isFetching: polling refetch uçarken araya
      // fetchNextPage sokmak sayfaları çakıştırıyor.
      isFetching: matchesQuery.isFetching,
      hasNextPage: !!matchesQuery.hasNextPage,
      refetchBlocked: pollBlocked,
      lastSignature: lastTopUpSigRef.current,
      msSinceLastRefetch: Date.now() - lastTopUpRefetchAtRef.current,
    });
    if (action === "reset") {
      lastTopUpSigRef.current = null;
      return;
    }
    if (action === "none") return;
    lastTopUpSigRef.current = signature;
    if (action === "next-page") {
      matchesQuery.fetchNextPage();
      return;
    }
    lastTopUpRefetchAtRef.current = Date.now();
    refetchMatches();
  }, [
    currentIndex,
    potentialMatches,
    pollBlocked,
    matchesQuery.hasNextPage,
    matchesQuery.isFetching,
    matchesQuery.fetchNextPage,
    refetchMatches,
  ]);

  const handleSwipe = useEvent((direction, userId) => {
    if (userId) swipedAtRef.current.set(userId, Date.now());
    // Süper beğenide deste, alev ekranı tam kapatmışken ilerliyor (bkz.
    // SwipeWrapper): yeni top kart giriş animasyonuyla DEĞİL, doğrudan son
    // hâlinde açılmalı — yoksa 0.92→1 yayı dalga çekildikten sonra da sürüyor
    // ve kart tam o anda "geliyormuş" gibi görünüyor. Diğer yönlerde giriş
    // animasyonu duruyor: orada kart zaten açıkta değişiyor.
    setCoveredSwap(direction === "up");
    setCurrentIndex((i) => i + 1);
    analytics.capture('swipe', { direction });
    const isPass = direction === "left";
    setLastSwipeWasPass(isPass);
    // Kartın kendisi — "kime" sorusunun cevabı hem süper beğeni onayında hem de
    // aşağıdaki kaçırılmış eşleşme toast'ında lazım.
    const swiped = potentialMatches.find((p) => p?.userId === userId);
    // Süper beğeni onayı. Gerekçe notunkiyle aynı (bkz. handleSendNote): kutlama
    // alevi yalnız görsel, kimin süper beğenildiğini SÖYLEMİYOR — kart o sırada
    // zaten örtünün altında. Toast tek yazılı onay.
    if (direction === "up") {
      const name = swiped?.displayName;
      showInfoToast({
        title: t("discover.swipe.superLikeSentTitle"),
        message: name
          ? t("discover.swipe.superLikeSentMessage", { name })
          : t("discover.swipe.superLikeSentMessageNoName"),
        icon: "superLike",
      });
    }
    // Destedeki bu kart beni beğenmiş biri miydi? Öyleyse yön ne olursa olsun
    // artık "bekleyen beğeni" değil: sağa kaydırma match yaratır, sola kaydırma
    // eşleşmeyi kaçırır. Rozet iki durumda da ANINDA düşer — MatchNotification'ı
    // ya da bir sonraki WhoLikedMe fetch'ini beklemeden.
    // store.getState(): selector'la abone olmak her gelen beğenide desteyi
    // yeniden render ederdi (render churn = commit-storm riski).
    if (hasLikedMe(store.getState(), userId)) {
      dispatch(removeWhoLikedMe(userId));
      // Likes ekranı mount'sa listesinden düşürsün — sayacı O dispatch etmez.
      uiBus.emit("likerHandled", { userId });
      if (isPass) {
        showMissedMatchToast({
          name: swiped?.displayName,
          photoUrl: swiped?.photos?.[0] || swiped?.profileImageUrl,
        });
      }
    }
    lastSwipePromiseRef.current = swipeMutation.mutateAsync({
      direction,
      userId,
    });
  });

  const handleRewind = async () => {
    // Premium kapısı EN ÖNDE. Aşağıdaki guard'lar önce çalışırsa free kullanıcı
    // like attıktan sonra rewind'e bastığında sessiz no-op oluyor — ne paywall
    // ne geri bildirim. Kilitli kullanıcı için son swipe'ın ne olduğu alâkasız:
    // buton "premium özelliği" diyor, tap her hâlükârda paywall açmalı.
    if (undoLocked) {
      openPremiumPaywall();
      return;
    }
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    if (remainingUndos === 0) {
      // Buraya yalnız premium + kalan hak 0 düşer (free zaten undoLocked'ta
      // yakalandı). openPremiumPaywall entitlement'ı tazeleyip premium çıkarsa
      // modal yerine kotayı refetch ediyor — premium'a "satın al" göstermeyiz.
      openPremiumPaywall();
      return;
    }

    // Undo edilen profili swipedAtRef'ten çıkar — aksi halde sonraki polling
    // refetch'inde koruma penceresi onu listeden silmeye devam eder.
    const undoneUserId = potentialMatches[currentIndex - 1]?.userId;
    if (undoneUserId) swipedAtRef.current.delete(undoneUserId);

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
      if (undoneUserId) swipedAtRef.current.set(undoneUserId, Date.now());
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
      // Sağa kaydırma yolundaki (uiBus → swipePaywall) davranışın aynısı:
      // önce durumu söyle, sonra sheet'i aç.
      showSwipeQuotaExhaustedToast();
      openLitPlus();
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
    // Diğer iki butondan uzun: süper beğenide kart hemen fırlamıyor, deste alev
    // ekranı kapatınca (~800 ms, ilk kutlamada lazy chunk payıyla biraz daha)
    // ilerliyor — bkz. SwipeWrapper. 300 ms'de bırakılsaydı butonlar kart hâlâ
    // dururken canlanır, ikinci tap yutulmuş gibi görünürdü. Çift tetiklemeye
    // karşı asıl güvence SwipeWrapper'daki kilit; bu yalnız butonun görünür
    // durumu.
    setTimeout(() => setIsSwiping(false), 1300);
  });

  // ── Moderasyon (expanded kartın altındaki ikonlar) ───────────────────────
  // Kartı desteden düşür. Swipe DEĞİL: swipeMutation atılmaz, analytics'e
  // swipe yazılmaz, rewind hedefi olmaz (lastSwipeWasPass'e dokunmuyoruz).
  // swipedAtRef kaydı şart — polling refetch'i engellenen profili geri
  // getirirse guard penceresi onu eler. Kart top değilse (teorik) sadece
  // guard'a yazıp indeksi oynatmıyoruz.
  // `covered`: kart, ekranı kaplayan bir kutlamanın ALTINDA düşüyor (not) —
  // engelle/şikayet yolunda kutlama yok, kart açıkta değişiyor.
  const dropProfileFromDeck = useEvent((userId: string, covered = false) => {
    if (!userId) return;
    swipedAtRef.current.set(userId, Date.now());
    // Beni beğenmiş biriyse rozet ANINDA düşsün — handleSwipe'daki temizlikle
    // aynı, tek farkı "kaçırdın" toast'ı YOK: engelleme kaçırılmış bir eşleşme
    // değil, kasıtlı bir kapatma.
    if (hasLikedMe(store.getState(), userId)) {
      dispatch(removeWhoLikedMe(userId));
      uiBus.emit("likerHandled", { userId });
    }
    if (potentialMatches[currentIndex]?.userId !== userId) return;
    // Kart expanded'ken düşüyor: expand shared value'ları sıfırlanmazsa deste
    // biterse (arkada kart yok) boş durum expanded ölçülerde kalır. Yeni bir
    // top kart varsa baseline reset'i zaten aynı işi yapıyor, burada ikinci kez
    // sıfırlamak zararsız — index değişmeden ÖNCE olması boş desteyi kurtarır.
    resetCardExpandState();
    // Guard'ın ARDINDA: kart zaten desteden çıkmışsa (kullanıcı bekleme
    // penceresinde kendisi kaydırdı) bayrağı kirletmeyelim — deste ilerlemiyor,
    // ama true kalsaydı SONRAKİ değişimin giriş animasyonu yenmiş olurdu.
    setCoveredSwap(covered);
    setCurrentIndex((i) => i + 1);
  });

  // ── Not (yorumlu beğeni) ────────────────────────────────────────────────
  // Kartta bir fotoğrafın/prompt'un altındaki kutudan açılıyor. Not bir
  // consumable: kotası günlük like kotasından AYRI, yalnız satın alınıyor.
  //
  // Gönderim ucu 2026-08-26'da BAĞLANDI (sözleşme Faz 1: `POST /api/swipe/Note`,
  // `Stats` alanları ve `WhoLikedMe.note` canlı). Bayrak bilerek duruyor —
  // uç bir sorun çıkarırsa akışı tek satırla arayüze geri düşürmek, çağrı
  // yollarını sökmekten güvenli.
  //
  // ⚠️ Bayrak kapatılırsa bakiye kapısı da kapanır (aşağıdaki koşul): uca istek
  // gitmezken "not hakkın yok" deyip paket sheet'i açmak, satın alınan şeyin
  // hiçbir işe yaramadığı bir tur demek olurdu.
  const NOTE_SEND_WIRED: boolean = true;
  const notesRemaining = statsQuery.data?.notesRemaining ?? null;
  const [notePurchaseVisible, setNotePurchaseVisible] = useState(false);
  const [noteRequest, setNoteRequest] = useState<{
    profile: PotentialMatch;
    target: NoteTarget;
  } | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  // Not kutlaması sürerken ekran ağaçtan düşerse (sekme değişti, tema
  // remount'u) örtme dinleyicisi arkada kalmasın — sökülmüş bir ağaca
  // setCurrentIndex yazardı.
  const noteFlameUnsub = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      noteFlameUnsub.current?.();
      noteFlameUnsub.current = null;
    },
    [],
  );

  const handleNoteRequest = useEvent(
    (profile: PotentialMatch, target: NoteTarget) => {
      if (!profile?.userId) return;
      // Bakiye yok — ya gerçekten 0, ya da backend alanı henüz göndermiyor
      // (`null`). İkisinde de doğru davranış composer değil paket sheet'i:
      // gönderilemeyecek bir metni yazdırmak en kötü sonuç olurdu.
      if (
        NOTE_SEND_WIRED &&
        (typeof notesRemaining !== "number" || notesRemaining <= 0)
      ) {
        analytics.capture("note_paywall_shown", {
          reason: notesRemaining === null ? "unknown_balance" : "empty_balance",
        });
        setNotePurchaseVisible(true);
        return;
      }
      setNoteError(null);
      setNoteRequest({ profile, target });
    },
  );

  const handleSendNote = useEvent(async (comment: string) => {
    const req = noteRequest;
    if (!req?.profile?.userId) return;
    setNoteError(null);
    // Uç bağlı değil: sheet kapanır, başka hiçbir şey olmaz. Toast YOK —
    // "notun gönderildi" demek gönderilmemiş bir şey için yalan olurdu.
    if (!NOTE_SEND_WIRED) {
      setNoteRequest(null);
      return;
    }
    try {
      await noteMutation.mutateAsync({
        userId: req.profile.userId,
        comment,
        target: req.target,
      });
      analytics.capture("note_sent", { targetKind: req.target.kind });
      setNoteRequest(null);
      // ⚠️ `result.isMatch`e BAKMIYORUZ: bu uçta (Like/SuperLike'ta da) alan
      // karşılıklı beğenide bile hep `false` ve `matchId` hiç yok. Eşleşme
      // arka planda çözülüp SignalR `MatchNotification` ile geliyor —
      // AppNavigator'daki mevcut dinleyici zaten karşılıyor.
      //
      // Toast DURUYOR: kutlama alevi ortada yalnız premium rozetini gösteriyor,
      // "not gönderildi" demiyor — tek onay bu satır. (Kısa bir süre ekranda
      // hem yazılı hem görsel onay dendi; yazı kaldırılınca toast geri geldi.)
      showInfoToast({
        title: t("note.sentTitle"),
        message: t("note.sentMessage", { name: req.profile.displayName ?? "" }),
        icon: "note",
      });
      // Kutlama süper beğeninin AYNISI (bkz. flameSweep): alev ekranı süpürüyor
      // ve kart, ekran tam kapalıyken desteden düşüyor.
      //
      // Not bir SWIPE: kart destede kalmamalı. `dropProfileFromDeck` beğenmiş
      // kişi temizliğini de yapıyor (rozet + likerHandled). Rewind hedefi
      // olmuyor — not geri alınamaz (öneri dokümanı D5).
      const userId = req.profile.userId;
      noteFlameUnsub.current?.();
      noteFlameUnsub.current = runFlameSweep(() => {
        noteFlameUnsub.current = null;
        dropProfileFromDeck(userId, true);
      });
    } catch (e: any) {
      const code = e?.response?.data?.code ?? null;

      // Bakiye bitti → composer kapanır, paket sheet'i açılır.
      if (code === NOTE_SEND_CODES.NO_BALANCE) {
        setNoteRequest(null);
        setNotePurchaseVisible(true);
        return;
      }

      // Hedef geçersiz (409/410 değil, 400): foto silinmiş ya da sıralama
      // kaymış, yani kart BAYAT. Metni korumanın anlamı yok — aynı hedefe
      // tekrar gönderilse yine düşer. Composer kapanıyor, deste tazeleniyor;
      // kart düşürülmüyor çünkü kullanıcının kararı hâlâ verilmedi.
      if (code === NOTE_SEND_CODES.INVALID_TARGET) {
        setNoteRequest(null);
        matchesQuery.refetch();
        showInfoToast({
          title: t("note.failedTitle"),
          message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
          icon: "note",
        });
        return;
      }

      // Kredi HARCANMAYAN hatalar: kart artık geçerli değil. Composer'ı açık
      // tutmanın anlamı yok, kartı düşürüp bilgilendiriyoruz.
      if (
        code === NOTE_SEND_CODES.ALREADY_SWIPED ||
        code === NOTE_SEND_CODES.TARGET_UNAVAILABLE
      ) {
        setNoteRequest(null);
        dropProfileFromDeck(req.profile.userId);
        showInfoToast({
          title: t("note.failedTitle"),
          message: t(noteSendCodeI18nKey(code) ?? "note.codes.generic"),
          icon: "note",
        });
        return;
      }

      // Kalanlar kullanıcının düzeltebileceği ya da bekleyip tekrar
      // deneyebileceği hatalar (UT-6402 boş/uzun metin, UT-6406 moderasyon,
      // UT-6407 suistimal freni, ağ) → sheet AÇIK kalır, yazdığı metin korunur.
      // Üçünde de kredi harcanmıyor.
      setNoteError(
        t(noteSendCodeI18nKey(code) ?? "note.codes.generic", {
          defaultValue: e?.response?.data?.message || e?.message,
        }),
      );
    }
  });

  // ReportModal bir bottom sheet; kart expanded'ken üstüne açılıyor. Şikayet
  // sonucu "blocked" gelirse kartı da düşürüyoruz (ReportModal'ın engelle
  // switch'i işaretlenmişse).
  const [reportTarget, setReportTarget] = useState<string | null>(null);

  const handleReportProfile = useEvent((profile: PotentialMatch) => {
    if (!profile?.userId) return;
    setReportTarget(profile.userId);
  });

  const handleBlockProfile = useEvent((profile: PotentialMatch) => {
    const userId = profile?.userId;
    if (!userId) return;
    Alert.alert(
      t('moderation.block.confirmTitle'),
      t('moderation.block.confirmMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('moderation.block.confirmButton'),
          style: "destructive",
          onPress: async () => {
            try {
              await moderationService.blockUser(userId);
              dropProfileFromDeck(userId);
              Alert.alert(
                t('moderation.block.successTitle'),
                t('moderation.block.successMessage'),
              );
            } catch {
              Alert.alert(t('common.error'), t('moderation.block.error'));
            }
          },
        },
      ],
    );
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
            snapEntry={coveredSwap}
            superLikesRemaining={statsQuery.data?.superLikesRemaining ?? null}
            onReport={handleReportProfile}
            onBlock={handleBlockProfile}
            onNote={handleNoteRequest}
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
              // Satır boyu ortak dosyadan: açık kartın lift'i (SwipeWrapper >
              // HEADER_COVER) aynı sayıyı okuyor, ayrışırsa kart header'ı tam
              // örtmez. Logo kutusundan (50) kısa olmasının sebebi orada.
              height: DISCOVER_HEADER_HEIGHT,
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
              // Kilitliyken sönük göstermiyoruz: 0.3 opacity "şu an kullanılamaz"
              // demek, oysa kilitli buton her zaman tıklanabilir (paywall açar).
              // Sönüklük yalnız premium'un "geri alacak pass yok" hâline kalıyor.
              style={{ opacity: undoLocked || lastSwipeWasPass ? 1 : 0.3 }}
            >
              <View style={{ position: "relative" }} pointerEvents="none">
                <SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={24} color={colors.text} strokeWidth={2} weight="semibold" />
                {(undoLocked || remainingUndos !== null) && (
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
                      paddingHorizontal: undoLocked ? 0 : 3,
                    }}
                  >
                    {undoLocked ? (
                      <SFIcon
                        name="lock.fill"
                        fallback={Lock}
                        size={12}
                        color={colors.text}
                        strokeWidth={2.5}
                        weight="semibold"
                      />
                    ) : (
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
                    )}
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
      <Animated.View
        style={[
          { flex: 1, paddingTop: DISCOVER_CARD_TOP_GAP },
          cardContainerStyle,
        ]}
      >
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
          <EmptyDiscoverCard
            title={emptyCopy?.title ?? null}
            actionLabel={emptyCopy?.actionLabel ?? null}
            onAction={handleEmptyAction}
            secondaryLabel={emptyCopy?.secondaryLabel ?? null}
            onSecondary={removeDistanceLimit}
            busy={ignoreDistanceMutation.isPending}
          />
        )}
      </Animated.View>

      {/* Süper beğeni alevi burada DEĞİL: tab bar'ı da kaplaması gerektiği için
          navigator'ın dışına, kök ağaca taşındı (bkz. AppNavigator). */}

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        isPremium={isPremium}
        onSave={handleSaveFilters}
        saving={saveFiltersMutation.isPending}
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

      {/* Not yazma sheet'i — kartta bir fotoğrafın/prompt'un altındaki kutudan
          açılır. Hata gelince KAPANMAZ: metin korunup inline hata gösterilir. */}
      <NoteComposerModal
        visible={!!noteRequest}
        onClose={() => {
          setNoteRequest(null);
          setNoteError(null);
        }}
        onSend={handleSendNote}
        target={noteRequest?.target ?? null}
        prompts={noteRequest?.profile?.prompts ?? null}
        photoUri={
          noteRequest?.target?.kind === "Photo"
            ? (noteRequest.profile?.photos?.[
                noteRequest.target.photoIndex ?? 0
              ] ?? null)
            : null
        }
        targetName={noteRequest?.profile?.displayName ?? null}
        remaining={notesRemaining}
        maxLength={statsQuery.data?.noteMaxLength ?? null}
        sending={noteMutation.isPending}
        errorText={noteError}
      />

      {/* Not paketi — bakiye 0 iken kutuya basınca ve UT-6401'de açılır.
          SuperLike sheet'iyle aynı kabuk, ayrı ürün ve ayrı redeem kuyruğu. */}
      <NotePurchaseModal
        visible={notePurchaseVisible}
        onClose={() => setNotePurchaseVisible(false)}
        onPurchased={() => {
          setNotePurchaseVisible(false);
          statsQuery.refetch();
        }}
      />

      {/* Şikayet akışı — expanded kartın bayrak ikonundan açılır. Kart bir
          sheet değil (destenin kendisi), o yüzden LikerSwipeModal'daki gibi
          önce kapatmaya gerek yok. */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget}
        onSuccess={(result: any) => {
          // Şikayetle birlikte engellediyse kart destede kalmasın.
          if (result?.blocked && reportTarget) dropProfileFromDeck(reportTarget);
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
              backgroundColor: scrimAt(0.45),
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            },
            tutorialOverlayStyle,
          ]}
        >
          {/* Oklar `onMedia` (sabit beyaz), `text` DEĞİL: perde iki modda da
              siyah (scrimAt) — moda dönen mürekkep açık temada siyah oku siyah
              perdeye çiziyordu. */}
          <Animated.View style={tutorialLeftArrowStyle}>
            <SFIcon name="arrow.left" fallback={ArrowLeft} size={64} color={colors.onMedia} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View style={tutorialRightArrowStyle}>
            <SFIcon name="arrow.right" fallback={ArrowRight} size={64} color={colors.onMedia} strokeWidth={1.5} />
          </Animated.View>
        </Animated.View>
      </Modal>
    </GestureHandlerRootView>
  );
}
