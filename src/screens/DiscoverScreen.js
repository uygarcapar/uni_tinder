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
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ENTRY_DISTANCE = SCREEN_WIDTH * 1.2;
const ENTRY_DURATION = 180;
const ENTRY_EASING = Easing.out(Easing.cubic);
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import MultiSlider from "@ptomasroos/react-native-multi-slider";
import {
  RotateCcw,
  SlidersHorizontal,
  X,
  Lock,
  Search,
  Flame,
  Star,
  Sparkles,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import SwipeWrapper from "../components/SwipeWrapper";
import SwipeOverlay from "../components/SwipeOverlay";
import PurchaseModal from "../components/PurchaseModal";
import SuperLikePurchaseModal from "../components/SuperLikePurchaseModal";
import AppBottomSheet from "../components/AppBottomSheet";
import WaveFillLogo from "../components/WaveFillLogo";
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

// Logo tap'te açılan stats popup — kalan swipe/superlike + reset süresi.
// Premium ise "Sınırsız" ve premium expiry bilgisi gösterir.
const formatResetTime = (sec) => {
  if (!sec || sec <= 0) return "Şu anda yenilenebilir";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} sa ${m} dk sonra yenilenir`;
  if (m > 0) return `${m} dk sonra yenilenir`;
  return `${sec} sn sonra yenilenir`;
};

const StatsRow = ({ Icon, iconColor, label, value, unlimited, subtitle }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      gap: 14,
    }}
  >
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: `${iconColor}22`,
        borderWidth: 0.5,
        borderColor: `${iconColor}55`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={20} color={iconColor} strokeWidth={2} />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        style={{
          color: "#fff",
          fontSize: 14,
          fontWeight: "600",
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
      {subtitle ? (
        <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "500" }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
    {unlimited ? (
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          borderCurve: "continuous",
          backgroundColor: "rgba(252,128,61,0.15)",
          borderWidth: 0.5,
          borderColor: "rgba(252,128,61,0.5)",
        }}
      >
        <Text style={{ color: "#fc803d", fontSize: 11, fontWeight: "700" }}>
          ∞
        </Text>
      </View>
    ) : (
      <Text
        style={{
          color: "#fff",
          fontSize: 22,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value ?? "—"}
      </Text>
    )}
  </View>
);

const StatsPopup = ({ stats }) => {
  const isPremium = stats?.isPremium;
  const swipesRem = stats?.remainingSwipes;
  const superLikesRem = stats?.superLikesRemaining;
  const swipeResetSec = stats?.swipeResetInSeconds;
  const superLikeResetSec = stats?.superLikeResetInSeconds;

  const swipeUnlimited = isPremium || swipesRem === -1;
  const superLikeUnlimited = superLikesRem === -1;

  return (
    <BlurView
      intensity={90}
      tint="dark"
      style={{
        width: "100%",
        borderRadius: 28,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.12)",
        paddingHorizontal: 18,
        paddingTop: 6,
        paddingBottom: 8,
      }}
    >
      {isPremium && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 12,
            borderBottomWidth: 0.5,
            borderBottomColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Sparkles size={16} color="#fc803d" strokeWidth={2} />
          <Text
            style={{
              color: "#fc803d",
              fontSize: 13,
              fontWeight: "700",
              letterSpacing: 0.3,
            }}
          >
            PREMIUM ÜYE
          </Text>
        </View>
      )}

      <StatsRow
        Icon={Flame}
        iconColor="#fc803d"
        label="Swipe Hakkı"
        value={swipesRem}
        unlimited={swipeUnlimited}
        subtitle={
          swipeUnlimited
            ? "Günlük limit yok"
            : swipesRem === 0
              ? formatResetTime(swipeResetSec)
              : `${formatResetTime(swipeResetSec)}`
        }
      />

      <View
        style={{
          height: 0.5,
          backgroundColor: "rgba(255,255,255,0.08)",
        }}
      />

      <StatsRow
        Icon={Star}
        iconColor="#3B82F6"
        label="Süper Beğeni"
        value={superLikesRem}
        unlimited={superLikeUnlimited}
        subtitle={
          superLikeUnlimited
            ? "Günlük limit yok"
            : superLikesRem === 0
              ? formatResetTime(superLikeResetSec)
              : `${formatResetTime(superLikeResetSec)}`
        }
      />

    </BlurView>
  );
};

// Boş durum kartı — SkeletonCard'la aynı dış yapı (frame + placeholder block'lar) ama
// shimmer YOK. Ortada Search ikonu + etrafında radar pulse animasyonu (3 ring stagger).
const RadarRing = ({ delay = 0 }) => {
  // Initial = 1 → opacity 0, görünmez. Delay sonrası 0'a snap edip animasyona başla.
  // Aksi halde delay süresince ring scale 0.3 + opacity 1 ile statik nokta gibi durur.
  const progress = useSharedValue(1);
  useEffect(() => {
    const t = setTimeout(() => {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    }, delay);
    return () => clearTimeout(t);
  }, [progress, delay]);
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
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [t]);
  const style = useAnimatedStyle(() => {
    const AMP = 18;
    const theta = t.value * 2 * Math.PI;
    const x = (Math.sin(2 * theta) * AMP) / 2;
    const y = Math.cos(theta) * AMP;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });
  return (
    <Animated.View
      style={[{ alignItems: "center", justifyContent: "center" }, style]}
    >
      <RadarRing delay={0} />
      <RadarRing delay={800} />
      <RadarRing delay={1600} />
      <Search size={36} color="#fff" strokeWidth={2} />
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
        backgroundColor: "#1E1E1E",
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
            backgroundColor: "#2A2A2A",
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
            backgroundColor: "#2A2A2A",
          }}
        />
        <View style={{ marginBottom: 2, gap: 4 }}>
          <View
            style={{
              width: 150,
              height: 35,
              borderRadius: 999,
              backgroundColor: "#2A2A2A",
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
              backgroundColor: "#2A2A2A",
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

// Backend (DiscoveryOptions.FreeMaxDistanceKm) bunu zaten 50'ye clamp ediyor — UI'da da
// aynı sınırı görünür hâle getir, kullanıcı 100 yazıp 50 sonuç alıp şaşırmasın.
const FREE_MAX_DISTANCE_KM = 50;

function FilterModal({ visible, onClose, filters, isPremium, onSave, saving }) {
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
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["90%"]}
      enableContentPanningGesture={!isDragging}
      backdropComponent={renderBackdrop}
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
          onPress={() => onClose?.()}
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
          const capped =
            !isPremium && n > FREE_MAX_DISTANCE_KM ? FREE_MAX_DISTANCE_KM : n;
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
              Free üye sınırı {FREE_MAX_DISTANCE_KM} km — daha fazlası için
              Premium
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
    </AppBottomSheet>
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

  const potentialMatches = useMemo(() => {
    const all = matchesQuery.data?.pages.flatMap((p) => p.profiles) ?? [];
    // Dedupe by userId — backend bazen sayfa kenarlarında aynı user'ı tekrar
    // dönebiliyor; duplicate key error'unu engeller.
    const seen = new Set();
    return all.filter((p) => {
      if (!p?.userId || seen.has(p.userId)) return false;
      seen.add(p.userId);
      return true;
    });
  }, [matchesQuery.data]);
  const loading = matchesQuery.isLoading;
  const filters = filtersQuery.data ?? DEFAULT_FILTERS;
  const remainingUndos = statsQuery.data?.remainingUndos ?? null;

  // Lit logosu için fill oranı: Premium veya remainingSwipes===-1 → sınırsız (fill=0).
  // Free → günlük 30 limit, (30 - remaining) / 30.
  const DAILY_SWIPE_LIMIT = 30;
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return 0;
    const used = Math.max(0, DAILY_SWIPE_LIMIT - rem);
    return Math.min(1, used / DAILY_SWIPE_LIMIT);
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  // Pass/Like kota bitince true. Premium veya rem<0 (unlimited/unknown) → false.
  // Bu durumda swipe blok edilir, kart bounce back + paywall açılır.
  const swipeQuotaExhausted = useMemo(() => {
    if (statsQuery.data?.isPremium) return false;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return false;
    return rem === 0;
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  // SuperLike kota bitince true. Pull-up swipe + button ikisini de blokar,
  // ayrı superLikePaywall açılır.
  const superLikeQuotaExhausted = useMemo(() => {
    const rem = statsQuery.data?.superLikesRemaining;
    if (rem == null || rem < 0) return false;
    return rem === 0;
  }, [statsQuery.data?.superLikesRemaining]);

  const [currentIndex, setCurrentIndex] = useState(0);
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
    const intervalId = setInterval(() => {
      if (pollCountRef.current >= 5) {
        clearInterval(intervalId);
        return;
      }
      pollCountRef.current += 1;
      matchesQuery.refetch();
    }, 5000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmptyStack]);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [superLikePurchaseVisible, setSuperLikePurchaseVisible] = useState(false);

  // Backend SwipeResultDto.ShowPaywall=true geldiğinde (Like/Pass kotası dolu) veya
  // GetPotentialMatches response'unda quota=0 geldiğinde useSwipeMutation uiBus'a event
  // emit eder; biz burada subscribe olup paywall'ı açıyoruz.
  useEffect(() => {
    const unsubSwipe = uiBus.on("swipePaywall", () => {
      setPurchaseVisible(true);
    });
    // SuperLike kota bittiğinde SwipeWrapper bu event'i emit eder (pull-up swipe).
    const unsubSuperLike = uiBus.on("superLikePaywall", () => {
      setSuperLikePurchaseVisible(true);
    });
    return () => {
      unsubSwipe();
      unsubSuperLike();
    };
  }, []);

  // Logo tap stats popup — açık/kapalı state. 4s sonra otomatik kapanır.
  const [statsPopupOpen, setStatsPopupOpen] = useState(false);
  const statsPopupTimer = useRef(null);

  const handleLogoPress = useCallback(() => {
    if (statsPopupTimer.current) clearTimeout(statsPopupTimer.current);
    setStatsPopupOpen(true);
    statsPopupTimer.current = setTimeout(() => setStatsPopupOpen(false), 4500);
  }, []);

  useEffect(
    () => () => {
      if (statsPopupTimer.current) clearTimeout(statsPopupTimer.current);
    },
    [],
  );

  const [filterVisible, setFilterVisible] = useState(false);
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

  const handleSwipe = useCallback(
    (direction, userId) => {
      setCurrentIndex((i) => i + 1);
      const isPass = direction === "left";
      setLastSwipeWasPass(isPass);
      lastSwipePromiseRef.current = swipeMutation.mutateAsync({
        direction,
        userId,
      });
    },
    [swipeMutation],
  );

  const handleRewind = async () => {
    if (currentIndex === 0) return;
    if (!lastSwipeWasPass) return;
    if (remainingUndos === 0) {
      setPurchaseVisible(true);
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
      setFilterVisible(false);
    } catch (err) {
      Alert.alert("", err?.message || "Filtreler kaydedilemedi");
    }
  };

  const handlePassButton = useCallback(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (swipeQuotaExhausted) {
      setPurchaseVisible(true);
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 1;
    setTimeout(() => setIsSwiping(false), 300);
  }, [
    isSwiping,
    potentialMatches.length,
    currentIndex,
    swipeQuotaExhausted,
    programmaticSwipe,

  ]);

  const handleLikeButton = useCallback(() => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (swipeQuotaExhausted) {
      setPurchaseVisible(true);
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 2;
    setTimeout(() => setIsSwiping(false), 300);
  }, [
    isSwiping,
    potentialMatches.length,
    currentIndex,
    swipeQuotaExhausted,
    programmaticSwipe,

  ]);

  const handleSuperLikeButton = useCallback(() => {
    if (__DEV__) {
      console.log("[SuperLike btn]", {
        isSwiping,
        cardsLeft: potentialMatches.length - currentIndex,
        superLikeQuotaExhausted,
        superLikesRemaining: statsQuery.data?.superLikesRemaining,
        hasModalRef: superLikePurchaseVisible,
      });
    }
    if (isSwiping || potentialMatches.length <= currentIndex) return;
    if (superLikeQuotaExhausted) {
      requestAnimationFrame(() => setSuperLikePurchaseVisible(true));
      return;
    }
    setIsSwiping(true);
    programmaticSwipe.value = 3;
    setTimeout(() => setIsSwiping(false), 300);
  }, [
    isSwiping,
    potentialMatches.length,
    currentIndex,
    superLikeQuotaExhausted,
    statsQuery.data?.superLikesRemaining,
    programmaticSwipe,

  ]);

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

          {/* Logo — tap: hak varsa refresh + bildirim, yoksa reset süresi bildirimi */}
          <TouchableOpacity
            onPress={handleLogoPress}
            activeOpacity={0.7}
            hitSlop={10}
          >
            <View pointerEvents="none">
              <WaveFillLogo fillRatio={swipeFillRatio} />
            </View>
          </TouchableOpacity>

          {/* Filter */}
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <TouchableOpacity
              onPress={() => setFilterVisible(true)}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                <SlidersHorizontal size={24} color="#fff" strokeWidth={2} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
        {/* Logo tap stats popup — kalan swipe + super-like + reset timer'ları */}
        {statsPopupOpen && (
          <>
            {/* Dışarı tıklayınca kapat */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setStatsPopupOpen(false)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: -1000,
                zIndex: 99,
              }}
            />
            <View
              style={{
                position: "absolute",
                top: insets.top + 56,
                left: 16,
                right: 16,
                alignItems: "center",
                zIndex: 100,
              }}
            >
              <StatsPopup stats={statsQuery.data} />
            </View>
          </>
        )}
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
          <EmptyDiscoverCard />
        )}
      </Animated.View>

      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        isPremium={filters.isPremium}
        onSave={handleSaveFilters}
        saving={saveFiltersMutation.isPending}
      />
      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => setPurchaseVisible(false)}
      />
      <SuperLikePurchaseModal
        visible={superLikePurchaseVisible}
        onClose={() => setSuperLikePurchaseVisible(false)}
        onUpgrade={() => {
          setSuperLikePurchaseVisible(false);
          setTimeout(() => setPurchaseVisible(true), 200);
        }}
      />
    </GestureHandlerRootView>
  );
}
