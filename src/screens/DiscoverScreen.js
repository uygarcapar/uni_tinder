import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  useAnimatedStyle,
  useAnimatedProps,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ENTRY_DISTANCE = SCREEN_WIDTH * 1.2;
const ENTRY_DURATION = 180;
const ENTRY_EASING = Easing.out(Easing.cubic);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import MultiSlider from "@ptomasroos/react-native-multi-slider";
import {
  Flame,
  RotateCcw,
  SlidersHorizontal,
  X,
  Lock,
} from "lucide-react-native";
import SwipeWrapper from "../components/SwipeWrapper";
import SwipeOverlay from "../components/SwipeOverlay";
import PurchaseModal from "../components/PurchaseModal";
import {
  usePotentialMatches,
  useSwipeFilters,
  useSwipeStats,
  useSwipeMutation,
  useSaveFilters,
  useUndoSwipe,
  useUpdateStatsCache,
} from "../queries/swipeQueries";
import uiBus, { cardExpandAnim } from "../services/uiBus";

// Tab bar geometry — TabNavigator ile tutarlı:
// FLOATING_BAR_HEIGHT (64) + FLOATING_BAR_BOTTOM_GAP (-10) + insets.bottom + extra gap (12)
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;
const CARD_BOTTOM_GAP = 12;

const GENDER_OPTIONS = [
  { label: "Erkek", value: "Male" },
  { label: "Kadın", value: "Female" },
  { label: "Non-Binary", value: "NonBinary" },
  { label: "Diğer", value: "Other" },
];

// TEST FLAG — true iken SkeletonCard her zaman gösterilir (loading state'i ignore).
// Production'da false yap.
const SHOW_SKELETON_DEBUG = true;

// Placeholder block — kendi içinde shimmer animasyonu olan dark rect.
// borderCurve:continuous + overflow:hidden ile yumuşak köşeli kapsayıcı.
const SkeletonBlock = ({ width, height, borderRadius = 8, style }) => {
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
          backgroundColor: "#2A2A2A",
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
        backgroundColor: "#1E1E1E",
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

// Lit logo'yu dalgalı + gradient turuncu olarak alttan yukarı doldurur.
// fillRatio (0-1) → kullanılan swipe oranı. 1 = hak doldu.
// MaskedView ile logo şekli mask, içeride SVG path dalgalı dolgu + animated phase.
const LOGO_W = 120;
const LOGO_H = 50;
const AnimatedPath = Animated.createAnimatedComponent(Path);

const WaveFillLogo = ({ fillRatio = 0 }) => {
  const phase = useSharedValue(0);
  const fillSV = useSharedValue(fillRatio);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 1500, easing: Easing.linear }),
      -1,
      false,
    );
  }, [phase]);

  useEffect(() => {
    fillSV.value = withTiming(fillRatio, { duration: 600 });
  }, [fillRatio, fillSV]);

  const animatedProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, fillSV.value));
    const baselineY = LOGO_H - f * LOGO_H;
    const ph = phase.value;
    // Amplitude fill ile büyür — fill=0 iken dalga yok, sıvının düz görünmesini engeller.
    const amp = 4 * Math.min(1, f * 4);
    const freq = 2; // genişlik boyunca 2 dalga
    const segments = 40;
    let d = `M 0 ${baselineY + amp * Math.sin(ph)}`;
    for (let i = 1; i <= segments; i++) {
      const x = (i / segments) * LOGO_W;
      const y =
        baselineY + amp * Math.sin((i / segments) * freq * 2 * Math.PI + ph);
      d += ` L ${x} ${y}`;
    }
    d += ` L ${LOGO_W} ${LOGO_H} L 0 ${LOGO_H} Z`;
    return { d };
  });

  return (
    <MaskedView
      maskElement={
        <Image
          source={require("../../assets/lit_name_white.png")}
          style={{ width: LOGO_W, height: LOGO_H }}
          resizeMode="contain"
        />
      }
      style={{ width: LOGO_W, height: LOGO_H }}
    >
      {/* Beyaz baz (dolmamış alan) */}
      <View
        style={{ width: LOGO_W, height: LOGO_H, backgroundColor: "#fff" }}
      />
      {/* Dalgalı turuncu dolgu */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: LOGO_W,
          height: LOGO_H,
        }}
      >
        <Svg width={LOGO_W} height={LOGO_H}>
          <Defs>
            <SvgLinearGradient id="litFillGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fa8532" />
              <Stop offset="0.3" stopColor="#fa8532" />
              <Stop offset="0.6" stopColor="#f7521b" />
              <Stop offset="1" stopColor="#f51111" />
            </SvgLinearGradient>
          </Defs>
          <AnimatedPath
            animatedProps={animatedProps}
            fill="url(#litFillGrad)"
          />
        </Svg>
      </View>
    </MaskedView>
  );
};

// Backend (DiscoveryOptions.FreeMaxDistanceKm) bunu zaten 50'ye clamp ediyor — UI'da da
// aynı sınırı görünür hâle getir, kullanıcı 100 yazıp 50 sonuç alıp şaşırmasın.
const FREE_MAX_DISTANCE_KM = 50;

function FilterModal({ bottomSheetRef, filters, isPremium, onSave, saving }) {
  // Free user için maxDistance'ı initial state'te de clamp et — backend zaten yapıyor
  // ama UI bunu yansıtmazsa kullanıcı "100 km" görür, sonuç 50 km içinden gelir → şaşırır.
  const clampFiltersForFree = (f) => {
    if (isPremium || !f) return f;
    const d = parseInt(f.maxDistance);
    if (!isNaN(d) && d > FREE_MAX_DISTANCE_KM) {
      return { ...f, maxDistance: FREE_MAX_DISTANCE_KM };
    }
    return f;
  };

  const [local, setLocal] = useState(() => clampFiltersForFree(filters));
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setLocal(clampFiltersForFree(filters));
  }, [filters, isPremium]);

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    [],
  );

  const toggleGender = (value) => {
    const current = local.genders || [];
    setLocal((prev) => ({
      ...prev,
      genders: current.includes(value)
        ? current.filter((g) => g !== value)
        : [...current, value],
    }));
  };

  const pillInput = (val, onChange) => (
    <View
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
      }}
    >
      <TextInput
        style={{
          color: "#fff",
          fontSize: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
        value={String(val ?? "")}
        onChangeText={onChange}
        keyboardType="number-pad"
        maxLength={3}
        placeholderTextColor="#6B7280"
      />
    </View>
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose={true}
      enableOverDrag={false}
      enableContentPanningGesture={!isDragging}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.3)" }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity
          onPress={() => bottomSheetRef.current?.dismiss()}
          activeOpacity={0.7}
          style={{ width: 60 }}
        >
          <X size={22} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          Filtreler
        </Text>
        <TouchableOpacity
          onPress={() => {
            Keyboard.dismiss();
            onSave(local);
          }}
          disabled={saving}
          activeOpacity={0.7}
          style={{ alignItems: "flex-end" }}
        >
          {saving ? (
            <ActivityIndicator size={18} color="#fff" />
          ) : (
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className="flex row bg-[#1E1E1E] self-start justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-3 gap-2 rounded-full"
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                Uygula
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
        scrollEnabled={!isDragging}
      >
        {/* Age Range */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 20,
            marginBottom: 12,
          }}
        >
          Yaş Aralığı
        </Text>
        <View style={{ alignItems: "center", marginBottom: 4 }}>
          <MultiSlider
            values={[local.ageRangeMin || 18, local.ageRangeMax || 65]}
            onValuesChangeStart={() => setIsDragging(true)}
            onValuesChange={(values) =>
              setLocal((p) => ({
                ...p,
                ageRangeMin: values[0],
                ageRangeMax: values[1],
              }))
            }
            onValuesChangeFinish={(values) => {
              setIsDragging(false);
              setLocal((p) => ({
                ...p,
                ageRangeMin: values[0],
                ageRangeMax: values[1],
              }));
            }}
            min={18}
            max={65}
            step={1}
            sliderLength={320}
            minMarkerOverlapDistance={100}
            selectedStyle={{ backgroundColor: "#fff" }}
            unselectedStyle={{ backgroundColor: "#374151" }}
            markerStyle={{
              backgroundColor: "#fff",
              height: 28,
              width: 28,
              borderRadius: 100,
              borderWidth: 0,
              marginTop: 2,
              shadowColor: "transparent",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0,
              shadowRadius: 0,
              elevation: 0,
            }}
            containerStyle={{ height: 40 }}
            trackStyle={{ height: 4, borderRadius: 3 }}
          />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
            {local.ageRangeMin || 18} yaş
          </Text>
          <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
            {(local.ageRangeMax || 65) === 65 ? "65+" : local.ageRangeMax || 65}{" "}
            yaş
          </Text>
        </View>

        {/* Distance */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Maksimum Mesafe (km)
        </Text>
        {pillInput(local.maxDistance, (v) => {
          const n = parseInt(v);
          if (isNaN(n)) {
            setLocal((p) => ({ ...p, maxDistance: "" }));
            return;
          }
          // Free user: backend 50km clamp ediyor — UI'da da clamp et + altta uyarı göster.
          const capped = !isPremium && n > FREE_MAX_DISTANCE_KM ? FREE_MAX_DISTANCE_KM : n;
          setLocal((p) => ({ ...p, maxDistance: capped }));
        })}
        {!isPremium && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              paddingHorizontal: 4,
            }}
          >
            <Lock size={12} color="#9CA3AF" />
            <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
              Free üye sınırı {FREE_MAX_DISTANCE_KM} km — daha fazlası için Premium
            </Text>
          </View>
        )}

        {/* Gender */}
        <Text
          style={{
            color: "#fff",
            fontWeight: "700",
            fontSize: 16,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          Cinsiyet
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {GENDER_OPTIONS.map((opt) => {
            const selected = (local.genders || []).includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => toggleGender(opt.value)}
                activeOpacity={0.8}
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: selected ? "#fc4526" : "rgba(255,255,255,0.15)",
                  backgroundColor: selected
                    ? "rgba(252,69,38,0.12)"
                    : "transparent",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    color: selected ? "#fc4526" : "#9CA3AF",
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Premium-only fields */}
        <View
          style={{
            marginTop: 28,
            opacity: 0.4,
            pointerEvents: isPremium ? "auto" : "none",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 16,
                flex: 1,
              }}
            >
              Şehir
            </Text>
            {!isPremium && <Lock size={15} color="#9CA3AF" />}
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: "#6B7280", fontSize: 16 }}>
              {local.preferredCity || "Seçilmedi"}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 20,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: 16,
                flex: 1,
              }}
            >
              Üniversite
            </Text>
            {!isPremium && <Lock size={15} color="#9CA3AF" />}
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: "#6B7280", fontSize: 16 }}>
              {local.preferredUniversityDomain || "Seçilmedi"}
            </Text>
          </View>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

const DEFAULT_FILTERS = {
  ageRangeMin: 18,
  ageRangeMax: 30,
  maxDistance: 50,
  genders: [],
  preferredCity: null,
  preferredUniversityDomain: null,
  isPremium: false,
};

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();

  const matchesQuery = usePotentialMatches();
  const filtersQuery = useSwipeFilters();
  const statsQuery = useSwipeStats();
  const swipeMutation = useSwipeMutation();
  const saveFiltersMutation = useSaveFilters();
  const undoMutation = useUndoSwipe();
  const updateStatsCache = useUpdateStatsCache();

  const potentialMatches = useMemo(
    () => matchesQuery.data?.pages.flatMap((p) => p.profiles) ?? [],
    [matchesQuery.data],
  );
  const loading = matchesQuery.isLoading;
  const filters = filtersQuery.data ?? DEFAULT_FILTERS;
  const remainingUndos = statsQuery.data?.remainingUndos ?? null;

  // Lit logosu için fill oranı: Premium → sınırsız (fill=0).
  // Free → günlük 30 limit, (30 - remaining) / 30.
  const DAILY_SWIPE_LIMIT = 30;
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null) return 0;
    const used = Math.max(0, DAILY_SWIPE_LIMIT - rem);
    return Math.min(1, used / DAILY_SWIPE_LIMIT);
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [lastSwipeWasPass, setLastSwipeWasPass] = useState(false);
  const purchaseBottomSheetRef = useRef(null);

  // Backend SwipeResultDto.ShowPaywall=true geldiğinde (Like/Pass kotası dolu) veya
  // GetPotentialMatches response'unda quota=0 geldiğinde useSwipeMutation uiBus'a event
  // emit eder; biz burada subscribe olup paywall'ı açıyoruz.
  useEffect(() => {
    const unsub = uiBus.on("swipePaywall", () => {
      purchaseBottomSheetRef.current?.present?.();
    });
    return unsub;
  }, []);

  const filterBottomSheetRef = useRef(null);
  const lastSwipePromiseRef = useRef(null);

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);
  const stackEntryX = useSharedValue(0);

  const stackEntryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: stackEntryX.value }],
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

  // Pre-fetch sonraki sayfa: kart stack 5'in altına düşünce.
  useEffect(() => {
    const remainingCards = potentialMatches.length - currentIndex;
    if (
      remainingCards <= 5 &&
      matchesQuery.hasNextPage &&
      !matchesQuery.isFetchingNextPage
    ) {
      matchesQuery.fetchNextPage();
    }
  }, [
    currentIndex,
    potentialMatches.length,
    matchesQuery.hasNextPage,
    matchesQuery.isFetchingNextPage,
    matchesQuery.fetchNextPage,
  ]);

  const handleSwipe = (direction, userId) => {
    setCurrentIndex((i) => i + 1);
    const isPass = direction === "left";
    setLastSwipeWasPass(isPass);
    lastSwipePromiseRef.current = swipeMutation.mutateAsync({
      direction,
      userId,
    });
  };

  const handleRewind = async () => {
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    if (remainingUndos === 0) {
      purchaseBottomSheetRef.current?.present();
      return;
    }

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
      if (prevUndos !== null) updateStatsCache({ remainingUndos: prevUndos });
      Alert.alert("", err?.message || "Geri alınamadı");
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
      filterBottomSheetRef.current?.dismiss();
    } catch (err) {
      Alert.alert("", err?.message || "Filtreler kaydedilemedi");
    }
  };

  const handlePassButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 1;
    setTimeout(() => setIsSwiping(false), 300);
  };

  const handleLikeButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    setIsSwiping(true);
    programmaticSwipe.value = 2;
    setTimeout(() => setIsSwiping(false), 300);
  };

  const handleSuperLikeButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    // Kota yoksa backend 403 dönecek; UX olarak doğrudan paywall'a yönlendir.
    // Premium kullanıcının 5/gün kotası bittiğinde de bu yol çalışır — paywall'da
    // ileride SuperLike consumable pack satın alma akışı açılacak (FAZ 6).
    const remaining = statsQuery.data?.superLikesRemaining;
    if (typeof remaining === "number" && remaining <= 0) {
      purchaseBottomSheetRef.current?.present();
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 3;
    setTimeout(() => setIsSwiping(false), 300);
  };

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
          />
        );
      });
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#121212" }}>
      {/* Header */}
      <View style={{ backgroundColor: "#121212", paddingTop: insets.top }}>
        <View
          style={{
            height: 50,
            paddingHorizontal: 21,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Rewind */}
          <View style={{ flex: 1, alignItems: "flex-start" }}>
            <TouchableOpacity
              onPress={handleRewind}
              activeOpacity={0.7}
              style={{ opacity: lastSwipeWasPass ? 1 : 0.3 }}
            >
              <View style={{ position: "relative" }} pointerEvents="none">
                <RotateCcw size={24} color="#fff" strokeWidth={2} />
                {remainingUndos !== null && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -4,
                      right: -6,
                      backgroundColor: "#121212",
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
                        color: "#fff",
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {remainingUndos === -1 ? "∞" : remainingUndos}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Logo — kullanılan swipe oranına göre dalgalı turuncu doldurma */}
          <WaveFillLogo fillRatio={swipeFillRatio} />

          {/* Filter */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => filterBottomSheetRef.current?.present()}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                <SlidersHorizontal size={24} color="#fff" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Cards */}
      <Animated.View style={[{ flex: 1, paddingTop: 1 }, cardContainerStyle]}>
        {loading && potentialMatches.length === 0 ? (
          <SkeletonCard />
        ) : potentialMatches.length > currentIndex ? (
          <Animated.View
            style={[{ flex: 1, position: "relative" }, stackEntryStyle]}
          >
            {renderStack()}
            <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
          </Animated.View>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 80,
            }}
          >
            <Flame size={80} color="#fff" strokeWidth={1.3} />
            <Text
              className="text-gray-400"
              style={{
                fontWeight: "500",
                fontSize: 13,
                marginTop: 8,
              }}
            >
              Yeni profiller için bekle.
            </Text>
          </View>
        )}
      </Animated.View>

      <FilterModal
        bottomSheetRef={filterBottomSheetRef}
        filters={filters}
        isPremium={filters.isPremium}
        onSave={handleSaveFilters}
        saving={saveFiltersMutation.isPending}
      />
      <PurchaseModal bottomSheetRef={purchaseBottomSheetRef} />
    </GestureHandlerRootView>
  );
}
