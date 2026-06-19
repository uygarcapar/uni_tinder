import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  Dimensions,
  StatusBar,
  Platform,
  UIManager,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { logout } from "@/features/auth/authSlice";
import { API_ENDPOINTS } from "@/shared/constants/api";
import profileService from "@/features/profile/profileService";
import api from "@/shared/services/api";
import PreviewModal from "@/features/profile/components/PreviewModal";
import SettingsModal from "@/features/profile/components/SettingsModal";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import ScreenHeader from "@/shared/components/ScreenHeader";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { getOfferings } from "@/features/profile/subscriptionService";
import {
  LogOut,
  Pencil,
  Check,
  X,
  Heart,
  Cigarette,
  Target,
  BookOpen,
  Settings,
  Camera,
  Star,
  ChevronDown,
  UserRound,
  ArrowUp,
} from "lucide-react-native";

import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  controlSize,
  font,
} from "@expo/ui/swift-ui/modifiers";

// REANIMATED & GESTURE HANDLER IMPORTLARI
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  interpolate,
  Extrapolation,
  Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";

// Android LayoutAnimation aktivasyonu
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get("window");


// ─── Generic skeleton box w/ shimmer ─────────────────────────────────────────
function SkeletonBox({ width: w, height: h, borderRadius = 8, style }) {
  const animW = typeof w === "number" ? w : width;
  const shimmer = useSharedValue(-animW);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(animW * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer, animW]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));

  return (
    <View
      style={[
        {
          width: w ?? "100%",
          height: h,
          borderRadius,
          borderCurve: "continuous",
          backgroundColor: "#1E1E1E",
          overflow: "hidden",
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
            width: animW * 2,
            height: "100%",
          },
          animStyle,
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
}

// ─── Hero avatar — image yüklenirken skeleton overlay ────────────────────────
function HeroAvatar({ uri, size = 80, onPress, loading = false }) {
  const [imgLoading, setImgLoading] = useState(false);

  // uri değiştiğinde loading state'i resetle — cached image'da onLoadStart
  // bazen fire etmiyor, bazen onLoadEnd kaçıyor; uri varsa loading başlat.
  useEffect(() => {
    if (uri) setImgLoading(true);
    else setImgLoading(false);
  }, [uri]);

  // 5sn timeout fallback — yükleme callback'leri kaçarsa skeleton kalıcı olmasın
  useEffect(() => {
    if (!imgLoading) return;
    const t = setTimeout(() => setImgLoading(false), 5000);
    return () => clearTimeout(t);
  }, [imgLoading, uri]);

  const showSkeleton = loading || (uri && imgLoading);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: "#1E1E1E",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onLoadEnd={() => setImgLoading(false)}
          onError={() => setImgLoading(false)}
        />
      ) : loading ? null : (
        <UserRound size={40} color="#fff" strokeWidth={1.5} />
      )}
      {showSkeleton && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <SkeletonBox width={size} height={size} borderRadius={size / 2} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Skeleton body — header'sız, sadece içerik kısmı ─────────────────────────
function SkeletonBody() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingTop: insets.top + 60 }}
    >
      {/* Progress bar */}
      <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
        <SkeletonBox height={4} borderRadius={999} />
      </View>

      {/* Hero */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 24,
          flexDirection: "row",
          alignItems: "center",
          gap: 16,
        }}
      >
        <SkeletonBox width={80} height={80} borderRadius={50} />
        <View style={{ flex: 1 }}>
          <SkeletonBox
            width={160}
            height={20}
            borderRadius={6}
            style={{ marginBottom: 12 }}
          />
          <SkeletonBox width={140} height={42} borderRadius={999} />
        </View>
      </View>

      {/* Premium banner */}
      <View style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 40 }}>
        <SkeletonBox height={340} borderRadius={40} />
      </View>

      {/* Profile completion */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <SkeletonBox
          width={130}
          height={13}
          borderRadius={4}
          style={{ marginBottom: 12, marginLeft: 4 }}
        />
        {[1, 2, 3].map((i) => (
          <SkeletonBox
            key={i}
            height={62}
            borderRadius={999}
            style={{ marginBottom: 8 }}
          />
        ))}
      </View>

      {/* Account */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 64 }}>
        <SkeletonBox
          width={50}
          height={13}
          borderRadius={4}
          style={{ marginBottom: 12, marginLeft: 4 }}
        />
        <SkeletonBox height={62} borderRadius={999} />
      </View>
    </ScrollView>
  );
}


// ─── Profil Sayfası Göstergeleri (Accordion) ──────────────────────────────
function CompletionAccordion({
  title,
  current,
  max,
  description,
  isExpanded,
  onToggle,
  onEdit,
  icon: Icon,
}) {
  const isComplete = current >= max;
  const maxH = useSharedValue(0);
  const rotation = useSharedValue(0);

  useEffect(() => {
    maxH.value = withTiming(isExpanded ? 300 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
    rotation.value = withTiming(isExpanded ? 180 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [isExpanded]);

  const contentStyle = useAnimatedStyle(() => ({
    maxHeight: maxH.value,
    overflow: "hidden",
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={{
        marginBottom: 8,
        borderRadius: 40,
        borderCurve: "continuous",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        className="bg-[#1E1E1E]"
        activeOpacity={1}
        onPress={onToggle}
        style={{
          padding: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {Icon && <Icon size={18} color="#fff" strokeWidth={1.5} />}
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
            {title}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text
            style={{
              color: isComplete ? "#fff" : "#9CA3AF",
              fontSize: 14,
              fontWeight: "400",
            }}
          >
            {current}/{max}
          </Text>
          <Animated.View style={chevronStyle}>
            <ChevronDown size={20} color="#9CA3AF" />
          </Animated.View>
        </View>
      </TouchableOpacity>
      <Animated.View className="bg-[#1E1E1E]" style={contentStyle}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 14,
              lineHeight: 20,
              marginBottom: 16,
            }}
          >
            {description}
          </Text>
          <TouchableOpacity
            className="border-[0.5px] border-white/10 "
            onPress={onEdit}
            activeOpacity={1}
            style={{
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: "#383838",
              paddingVertical: 16,
              borderRadius: 999,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "500" }}>
              Tamamla
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import BlurBottomSheetBackdrop from "@/shared/components/BlurBottomSheetBackdrop";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EditProfileForm from "@/features/profile/components/EditProfileForm";

// ─── Edit Modal sarmalayıcı ───────────────────────────────────────────────────
// BottomSheetScrollView'un reanimated handler kabul eden versiyonu — header
// blur/title fade animasyonları için scroll değerini paylaşılan değere bağlar.
const AnimatedBottomSheetScrollView = Animated.createAnimatedComponent(
  BottomSheetScrollView,
);

const EDIT_HEADER_HEIGHT = 100;

function ProfileEditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  saveDisabled,
  children,
}) {
  const renderBackdrop = useCallback(
    (props) => <BlurBottomSheetBackdrop {...props} onPress={onClose} />,
    [onClose],
  );

  // ScreenHeader pattern: scrollY shared'a aktarılır, background opacity 0→60
  // arasında 0→1'e geçer, başlık 55'ten sonra fade-in olur.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP),
  }));

  const titleTriggered = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.value > 55,
    (isPast, prev) => {
      if (isPast !== prev) {
        titleTriggered.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );
  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleTriggered.value,
    transform: [{ translateY: 12 * (1 - titleTriggered.value) }],
  }));

  // ScreenHeader'daki birebir easeGradient — alt kenarın yumuşak fade'i.
  const { colors: bgColors, locations: bgLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  // Visible değişince scroll'u baş haline döndür (modal kapanıp tekrar açılınca
  // başlık/blur stale state'le gelmesin).
  useEffect(() => {
    if (visible) {
      scrollY.value = 0;
      titleTriggered.value = 0;
    }
  }, [visible, scrollY, titleTriggered]);

  return (
    <AppBottomSheet
      visible={visible}
      snapPoints={["90%"]}
      onClose={onClose}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
    >
      {/* Scroll content — header yukarıda absolute floating; içerik header
          arkasından geçer ve scroll'la blur tetiklenir. */}
      <AnimatedBottomSheetScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{
          paddingTop: EDIT_HEADER_HEIGHT,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        {children}
      </AnimatedBottomSheetScrollView>

      {/* Floating header — absolute, içerik üzerine biner. İlk açılışta
          background ve title transparent; scroll'la belirir. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: EDIT_HEADER_HEIGHT,
          zIndex: 10,
        }}
      >
        {/* Progressive blur background — opacity scroll'a bağlı.
            iOS: MaskedView + BlurView ile progressive blur (60 FPS, GPU pahalı değil).
            Android: BlurView + MaskedView Skia path'ı pahalı, FPS düşürüyor —
            basit opak background ile değiştir. Görsel olarak benzer, perf maliyeti yok. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: EDIT_HEADER_HEIGHT,
            },
            headerBgStyle,
          ]}
        >
          {Platform.OS === "ios" ? (
            <MaskedView
              maskElement={
                <LinearGradient
                  locations={bgLocations}
                  colors={bgColors}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                />
              }
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              <LinearGradient
                colors={["black", "rgba(0, 0, 0, 0.2)"]}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
              <BlurView
                intensity={15}
                tint="systemChromeMaterialDark"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
            </MaskedView>
          ) : (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(18,18,18,0.95)",
              }}
            />
          )}
        </Animated.View>

        {/* Centered animated title — scroll 55px'i geçince fade-in. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: EDIT_HEADER_HEIGHT,
              alignItems: "center",
              justifyContent: "center",
            },
            titleAnimStyle,
          ]}
        >
          <Text
            style={{ color: "#fff", fontSize: 19, fontWeight: "700" }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </Animated.View>

        {/* Sol/sağ butonlar — her zaman görünür, scroll'dan bağımsız.
            iOS Host matchContents glass button'larının görünen background'u
            Host'un raporladığı bounds'tan biraz dışarı taşıyor; bu yüzden
            header padding'i içerikten (20) bir tık fazla — buton kenarları
            içerik kartlarıyla optik olarak hizalansın. */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: EDIT_HEADER_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
          }}
        >
          <View style={{ paddingVertical: 8 }}>
            {Platform.OS === "ios" ? (
              <Host matchContents>
                <SwiftUIButton
                  label="Kapat"
                  systemImage="xmark"
                  onPress={onClose}
                  modifiers={[
                    buttonStyle("glass"),
                    tint("#ffffff"),
                    labelStyle("iconOnly"),
                    font({ size: 22, weight: "medium" }),
                  ]}
                />
              </Host>
            ) : (
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X
                  size={24}
                  color="#fff"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              </TouchableOpacity>
            )}
          </View>

          {Platform.OS === "ios" ? (
            <Host matchContents>
              <SwiftUIButton
                label={saving ? "Kaydediliyor" : "Kaydet"}
                onPress={saving || saveDisabled ? () => {} : onSave}
                modifiers={[
                  buttonStyle("glass"),
                  controlSize("large"),
                  tint("#ffffff"),
                  font({ size: 12, weight: "semibold" }),
                ]}
              />
            </Host>
          ) : (
            <TouchableOpacity
              onPress={onSave}
              disabled={saving || saveDisabled}
              activeOpacity={0.7}
              style={{
                opacity: saveDisabled ? 0.35 : 1,
                position: "relative",
              }}
            >
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  backgroundColor: "#1E1E1E",
                  borderWidth: 0.5,
                  borderColor: "rgba(255,255,255,0.1)",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: 15,
                    opacity: saving ? 0 : 1,
                  }}
                >
                  Kaydet
                </Text>
                {saving && (
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
                    <SkeletonBox width={42} height={14} borderRadius={999} />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </AppBottomSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => (s as any).auth);
  const subscriptionIsPremium = useAppSelector((s) => (s as any).subscription?.isPremium);
  const subscriptionExpiresAt = useAppSelector((s) => (s as any).subscription?.expiresAt);
  const insets = useSafeAreaInsets();
  const statsQuery = useSwipeStats();

  // DiscoverScreen ile aynı fill oranı: premium veya remainingSwipes===-1 → 0.
  const DAILY_SWIPE_LIMIT = 30;
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return 0;
    const used = Math.max(0, DAILY_SWIPE_LIMIT - rem);
    return Math.min(1, used / DAILY_SWIPE_LIMIT);
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // ── Modal visibility state (declarative) ───────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  // ── Premium teaser fiyatı (inline upsell kartı için) ──────────────────────
  // Inline kartta hardcoded "249.99 ₺ / Ay" yerine RC offering'ten okunan canlı
  // monthly fiyatı gösterilir. RC configure değilse veya offering boşsa generic
  // CTA fallback'i devreye girer.
  const [teaserPrice, setTeaserPrice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getOfferings()
      .then((offering) => {
        if (cancelled) return;
        const monthlyPkg =
          offering?.monthly ??
          offering?.availablePackages?.find((p) =>
            /monthly|month/i.test(p?.product?.identifier ?? ""),
          );
        const priceString = monthlyPkg?.product?.priceString;
        if (priceString) setTeaserPrice(priceString);
      })
      .catch(() => {
        // RC configure değil veya network hatası — generic CTA göster
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Profil verisi ──────────────────────────────────────────────────────────
  const [myProfile, setMyProfile] = useState(null);
  const isPremium = subscriptionIsPremium || myProfile?.isPremium;
  const [hobbyMap, setHobbyMap] = useState({});
  const [hobbyGroups, setHobbyGroups] = useState([]);
  const [smokingOptions, setSmokingOptions] = useState([]);
  const [zodiacOptions, setZodiacOptions] = useState([]);
  const [usagePurposeOptions, setUsagePurposeOptions] = useState([]);
  const [interestedInOptions, setInterestedInOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [petOptions, setPetOptions] = useState([]);

  // ── Genel UI ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  // Accordion State
  const [expandedSection, setExpandedSection] = useState(null);
  // İlk render'da en üstteki incomplete metric otomatik açılsın — sadece bir kez,
  // sonra kullanıcı kontrolü ele alır.
  const didAutoExpandRef = useRef(false);

  // ── Profil düzenleme: tüm draft state EditProfileForm içinde. Parent yalnızca
  // editVisible + savingProfile (header save button feedback için) tutar.
  const [savingProfile, setSavingProfile] = useState(false);
  const editFormRef = useRef(null);

  // ── Fotoğraf yönetimi (parent-level: profile cache'ini mutate eder) ──────
  const [savingPhoto, setSavingPhoto] = useState(false);

  // ── Progress bar animasyonu ───────────────────────────────────────────────
  const [barContainerWidth, setBarContainerWidth] = useState(0);
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    if (barContainerWidth === 0) return;
    const completionPct =
      myProfile?.profileCompletionPercentage ??
      myProfile?.profileCompletionScore ??
      0;
    progressAnim.value = withTiming((completionPct / 100) * barContainerWidth, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [
    myProfile?.profileCompletionPercentage,
    myProfile?.profileCompletionScore,
    barContainerWidth,
  ]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: progressAnim.value,
  }));

  const progressBadgeStyle = useAnimatedStyle(() => ({
    left: progressAnim.value - 15,
  }));

  // ── Veri yükleme ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      // Catch'leri sessiz tutmak yerine endpoint adıyla logla — yeni eklenen
      // common endpoint'lerden biri 404/500 dönerse hangisi olduğu görünür olsun.
      const safe = (label, p) =>
        p.catch((e) => {
          console.warn(`[loadProfile] ${label} fetch failed:`, e?.message || e);
          return null;
        });
      const [
        profile,
        hobbiesRes,
        smokingRes,
        zodiacRes,
        usageRes,
        interestedInRes,
        citiesRes,
        languagesRes,
        petsRes,
      ] = await Promise.all([
        profileService.getMyProfile(),
        safe("hobbies", api.get(API_ENDPOINTS.GET_HOBBIES)),
        safe("smoking", api.get(API_ENDPOINTS.GET_SMOKING_STATUSES)),
        safe("zodiacs", api.get(API_ENDPOINTS.GET_ZODIACS)),
        safe("usage", api.get(API_ENDPOINTS.GET_USAGE_PURPOSES)),
        safe("interested-in", api.get(API_ENDPOINTS.GET_INTERESTED_IN)),
        safe("cities", api.get(API_ENDPOINTS.GET_CITIES)),
        safe("languages", api.get(API_ENDPOINTS.GET_LANGUAGES)),
        safe("pets", api.get(API_ENDPOINTS.GET_PETS)),
      ]);

      setMyProfile(profile);

      if (hobbiesRes?.result) {
        const groups = Array.isArray(hobbiesRes.result)
          ? hobbiesRes.result
          : [];
        const map = {};
        groups.forEach((g) =>
          (g.hobbies || []).forEach((h) => {
            map[h.id] = h.name;
          }),
        );
        setHobbyMap(map);
        setHobbyGroups(groups);
      }

      if (smokingRes?.result) setSmokingOptions(smokingRes.result);
      if (zodiacRes?.result) setZodiacOptions(zodiacRes.result);
      if (usageRes?.result) setUsagePurposeOptions(usageRes.result);
      if (interestedInRes?.result)
        setInterestedInOptions(interestedInRes.result);
      if (citiesRes?.result) setCityOptions(citiesRes.result);
      if (languagesRes?.result) setLanguageOptions(languagesRes.result);
      if (petsRes?.result) setPetOptions(petsRes.result);
    } catch (e) {
      console.error("Profile load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resolveHobbies = (raw) => {
    if (!raw?.length) return [];
    return raw.map((h) => {
      if (typeof h === "string" && isNaN(Number(h))) return h;
      return hobbyMap[Number(h)] || String(h);
    });
  };

  const buildPreviewProfile = () => {
    if (!myProfile) return null;
    const photos = (myProfile.photosList || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => p.photoImageUrl)
      .filter(Boolean);
    return {
      userId: user?.userId,
      displayName: myProfile.displayName || user?.displayName,
      age: myProfile.user?.age || user?.age,
      photos,
      isPremium: myProfile.isPremium,
      universityName: myProfile.user?.universityName || user?.universityName,
      showUniversity: myProfile.showMyUniversity !== false,
      departmentDisplay:
        myProfile.departmentDisplay || String(myProfile.department ?? ""),
      yearOfStudy: myProfile.yearOfStudy,
      yearOfStudyDisplay: myProfile.yearOfStudyDisplay,
      bio: myProfile.bio,
      hobbies: resolveHobbies(myProfile.hobbies),
      smokingStatusDisplay: myProfile.smokingStatusDisplay,
      zodiacSignDisplay: myProfile.zodiacSignDisplay,
      usagePurposeDisplay: myProfile.usagePurposeDisplay,
      cityDisplay: myProfile.cityDisplay,
      districtDisplay: myProfile.districtDisplay,
      distance: null,
    };
  };

  // ── Profil düzenleme ──────────────────────────────────────────────────────
  // Tüm form state ve toggle/save logic'i EditProfileForm'da. Parent yalnızca
  // modal'ı açıp kapatır + save sonrası optimistic patch'i myProfile cache'ine
  // uygular.
  const openEditProfile = useCallback(() => setEditVisible(true), []);
  const closeEditProfile = useCallback(() => setEditVisible(false), []);

  const handleEditSubmit = useCallback(() => {
    editFormRef.current?.submit();
  }, []);

  const handleFormSaved = useCallback(
    (optimisticPatch) => {
      setMyProfile((p) => ({ ...p, ...optimisticPatch }));
      // Fotoğraf order değişmiş olabilir; backend'den taze veriyi çek.
      refreshPhotos();
      closeEditProfile();
    },
    // refreshPhotos aşağıda tanımlı; deps boş — closure stale olmaz çünkü
    // refreshPhotos hep aynı module-bound fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeEditProfile],
  );

  // ── Fotoğraf aksiyonları ───────────────────────────────────────────────────
  const refreshPhotos = async () => {
    try {
      const profile = await profileService.getMyProfile();
      setMyProfile(profile);
    } catch (e) {
      console.error("Profil yenileme hatası:", e?.message);
    }
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "İzin Gerekli",
        "Fotoğraf eklemek için galeri iznine ihtiyaç var.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const file = {
      uri: asset.uri,
      type: asset.mimeType || "image/jpeg",
      name: asset.fileName || `photo_${Date.now()}.jpg`,
    };

    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ NewPhotos: [file] });
      await refreshPhotos();
    } catch (e) {
      console.error(
        "Fotoğraf yükleme hatası:",
        e?.response?.data || e?.message,
      );
      Alert.alert("Hata", "Fotoğraf yüklenemedi, tekrar dene.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handlePhotoPress = (photo) => {
    const isMain = photo.isMainPhoto;
    const options = [];
    if (!isMain)
      options.push({
        text: "Ana Fotoğraf Yap",
        onPress: () => handleSetMainPhoto(photo.photoId),
      });
    options.push({
      text: "Sil",
      style: "destructive",
      onPress: () => handleDeletePhoto(photo.photoId),
    });
    options.push({ text: "İptal", style: "cancel" });
    Alert.alert("Fotoğraf", "", options);
  };

  const handleSetMainPhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ NewMainPhotoId: photoId });
      await refreshPhotos();
    } catch (e) {
      Alert.alert("Hata", "Ana fotoğraf değiştirilemedi.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({
        PhotoIdsToDelete: [photoId],
      });
      await refreshPhotos();
    } catch (e) {
      Alert.alert("Hata", "Fotoğraf silinemedi.");
    } finally {
      setSavingPhoto(false);
    }
  };

  // ── Hesap aksiyonları ──────────────────────────────────────────────────────
  const handleLogout = () =>
    Alert.alert("Çıkış Yap", "Hesabından çıkmak istediğine emin misin?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Çıkış Yap",
        style: "destructive",
        onPress: () => dispatch(logout()),
      },
    ]);

  const handleAccordionToggle = (key) => {
    didAutoExpandRef.current = true;
    setExpandedSection(expandedSection === key ? null : key);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const mainPhoto =
    myProfile?.photosList?.find((p) => p.isMainPhoto)?.photoImageUrl ||
    myProfile?.photosList?.[0]?.photoImageUrl ||
    myProfile?.profileImageUrl;

  const completionPct =
    myProfile?.profileCompletionPercentage ??
    myProfile?.profileCompletionScore ??
    0;

  const completionMetrics = [
    {
      key: "photos",
      title: "Fotoğraflar",
      icon: Camera,
      current: myProfile?.photosList?.length || 0,
      max: 6,
      desc: "Daha fazla fotoğraf ekleyerek profilini öne çıkarabilir ve diğer kullanıcıların seni daha iyi tanımasını sağlayabilirsin.",
    },
    {
      key: "hobbies",
      title: "Hobiler",
      icon: Heart,
      current: myProfile?.hobbies?.length || 0,
      max: 10,
      desc: "En fazla 10 hobi ekleyerek ortak noktaların olan insanlarla daha kolay eşleş.",
    },
    {
      key: "bio",
      title: "Biyografi",
      icon: BookOpen,
      current: myProfile?.bio?.trim().length > 0 ? 1 : 0,
      max: 1,
      desc: "Kendinden kısaca bahsederek dikkat çek. İlgi çekici bir biyografi eşleşme şansını artırır.",
    },
    {
      key: "smoking",
      title: "Sigara Kullanımı",
      icon: Cigarette,
      current: myProfile?.smokingStatus != null ? 1 : 0,
      max: 1,
      desc: "Yaşam tarzını belirterek sana en uygun kişileri bul.",
    },
    {
      key: "zodiac",
      title: "Burç",
      icon: Star,
      current: myProfile?.zodiacSign != null ? 1 : 0,
      max: 1,
      desc: "Burcunu ekle, astroloji uyumunu ve potansiyel eşleşmeleri keşfet.",
    },
    {
      key: "purpose",
      title: "Kullanım Amacı",
      icon: Target,
      current: myProfile?.usagePurpose != null ? 1 : 0,
      max: 1,
      desc: "Burada ne aradığını belirterek, seninle aynı beklentilere sahip kişilerle tanış.",
    },
  ];

  const resolvedHobbies = resolveHobbies(myProfile?.hobbies);
  const previewProfile = loading ? null : buildPreviewProfile();

  // İlk profile load tamamlanınca en üstteki incomplete metric'i otomatik aç.
  // Sadece bir kez — kullanıcı toggle'a basarsa bir daha override etmiyoruz.
  useEffect(() => {
    if (didAutoExpandRef.current || loading) return;
    const firstIncomplete = completionMetrics.find((m) => m.current < m.max);
    if (firstIncomplete) {
      setExpandedSection(firstIncomplete.key);
      didAutoExpandRef.current = true;
    }
  }, [loading, completionMetrics]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#121212" }}>
        <StatusBar barStyle="light-content" />

        {loading ? (
          <SkeletonBody />
        ) : (
          <Animated.ScrollView
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{
              paddingTop: insets.top + 60,
              paddingBottom: insets.bottom + 60,
            }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
          >
            {/* ── Progress Bar ── */}
            {completionPct > 0 && (
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingTop: 10,
                  position: "relative",
                }}
              >
                <View
                  style={{
                    height: 4,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.1)",
                    overflow: "visible",
                  }}
                  onLayout={(e) =>
                    setBarContainerWidth(e.nativeEvent.layout.width)
                  }
                >
                  <Animated.View
                    style={[
                      {
                        height: "100%",
                        borderRadius: 999,
                        backgroundColor: "#fff",
                      },
                      progressBarStyle,
                    ]}
                  />
                  {/* Yüzde Badge */}
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        top: "50%",
                        transform: [{ translateY: -13 }],
                      },
                      progressBadgeStyle,
                    ]}
                  >
                    <View
                      className="border-[3px] border-[#121212]"
                      style={{
                        backgroundColor: "#fff",
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        borderRadius: 999,
                        minWidth: 30,
                        alignItems: "center",
                        borderCurve: "continuous",
                        overflow: "hidden",
                      }}
                    >
                      <Text
                        style={{
                          color: "#000",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {completionPct}%
                      </Text>
                    </View>
                  </Animated.View>
                </View>
              </View>
            )}

            {/* ── Hero Section ── */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              }}
            >
              <HeroAvatar
                uri={mainPhoto}
                size={80}
                loading={!myProfile}
                onPress={() => mainPhoto && setPreviewVisible(true)}
              />

              <View style={{ flex: 1, justifyContent: "space-between" }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 18,
                    fontWeight: "600",
                    lineHeight: 28,
                  }}
                >
                  {myProfile?.displayName || user?.firstName || ""}
                </Text>

                {Platform.OS === "ios" ? (
                  // iOS 26+ liquid glass — SwiftUI native Button. iOS 18'de
                  // default bordered style'a düşer (graceful degradation).
                  <Host
                    matchContents
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                  >
                    <SwiftUIButton
                      label="Profili Düzenle"
                      systemImage="pencil"
                      onPress={openEditProfile}
                      modifiers={[
                        buttonStyle("glass"),
                        controlSize("regular"),
                        tint("#ffffff"),
                        font({ size: 13, weight: "semibold" }),
                      ]}
                    />
                  </Host>
                ) : (
                  <AnimatedPressable
                    onPress={openEditProfile}
                    pressScale={0.97}
                    style={{ marginTop: 8, alignSelf: "flex-start" }}
                  >
                    <BlurView
                      tint="dark"
                      intensity={100}
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: "rgba(18,18,18,0.55)",
                      }}
                      className="flex-row self-start justify-center text-center items-center border-[0.5px] border-white/10 px-4 py-5 gap-2"
                    >
                      <Pencil size={15} color="#fff" strokeWidth={2} />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Profili Düzenle
                      </Text>
                    </BlurView>
                  </AnimatedPressable>
                )}
              </View>
            </View>

            {/* --- PREMIUM ACTIVE CARD --- */}
            {isPremium && (
              <View className="mb-10 px-4 mt-2">
                <LinearGradient
                  colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
                  locations={[0, 0.5, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 40,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                    elevation: 5,
                  }}
                >
                  <View className="p-5 flex-row items-center justify-between">
                    <View className="flex-1 pr-4">
                      <View className="flex-row items-center gap-2 mb-2">
                        <Text
                          className="pr-2"
                          style={{
                            color: "#000",
                            fontSize: 50,
                            fontFamily: "Duckie-regular",
                          }}
                        >
                          lit plus
                        </Text>
                      </View>
                      <Text className="text-black/80 font-medium text-[14px] leading-5">
                        Üyeliğin aktif. Sınırsız beğeni, seni beğenenleri görme
                        ve daha fazlasına erişimin var.
                      </Text>
                    </View>
                    <View
                      className="border-[1px] border-black/40 px-5 py-2.5 flex-row items-center gap-1.5"
                      style={{
                        borderRadius: 999,
                        overflow: "hidden",
                        borderCurve: "continuous",
                      }}
                    >
                      <Text className="text-black font-bold text-[13px]">
                        Aktif
                      </Text>
                    </View>
                  </View>

                  <View className="px-5 pb-6 pt-3">
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        const url =
                          Platform.OS === "ios"
                            ? "https://apps.apple.com/account/subscriptions"
                            : "https://play.google.com/store/account/subscriptions";
                        Linking.openURL(url).catch(() => {});
                      }}
                      className="w-full border-[0.7px] border-black/40 py-[17px] items-center justify-center"
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                      }}
                    >
                      <Text className="font-medium text-[14px] text-black">
                        {subscriptionExpiresAt ? (
                          <>
                            <Text style={{ fontWeight: "700" }}>
                              Aboneliği Yönet
                            </Text>
                            {" · Yenileme "}
                            {new Date(subscriptionExpiresAt).toLocaleDateString(
                              "tr-TR",
                              {
                                day: "2-digit",
                                month: "short",
                              },
                            )}
                          </>
                        ) : (
                          "Aboneliği Yönet"
                        )}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </View>
            )}

            {/* --- PREMIUM UPSELL BANNER & COMPARISON --- */}
            {!isPremium && (
              <View className="mb-10 px-4 mt-2">
                <AnimatedPressable
                  pressScale={0.97}
                  onPress={() => setPurchaseVisible(true)}
                >
                  <LinearGradient
                    colors={["#FF0000", "#FF6B00", "#ffa600"]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.2,
                      shadowRadius: 8,
                      elevation: 5,
                    }}
                  >
                    {/* Top Banner Section */}
                    <View className="p-5 flex-row items-center justify-between">
                      <View className="flex-1 pr-4">
                        <View className="flex-row items-center gap-2 mb-2">
                          <Text
                            className="pr-2"
                            style={{
                              color: "#fff",
                              fontSize: 50,
                              fontFamily: "Duckie-regular",
                            }}
                          >
                            lit plus
                          </Text>
                        </View>
                        <Text className="text-white/80 font-medium text-[14px] leading-5">
                          Lit Plus ile eşleşmelerini hızlandır, seni beğenenleri
                          gör ve daha fazlasını keşfet!
                        </Text>
                      </View>
                      <View className="items-center gap-1">
                        <View
                          style={{
                            width: 60,
                            height: 36,
                            alignItems: "center",
                            justifyContent: "flex-end",
                          }}
                        >
                          <View
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              opacity: 0.2,
                            }}
                          >
                            <ArrowUp size={22} color="#fff" strokeWidth={4} />
                          </View>
                          <View
                            style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              opacity: 0.2,
                            }}
                          >
                            <ArrowUp size={22} color="#fff" strokeWidth={4} />
                          </View>
                          <ArrowUp size={28} color="#fff" strokeWidth={4} />
                        </View>
                        <Text className="text-white font-bold text-[12px]">
                          5x Eşleşme
                        </Text>
                      </View>
                    </View>

                    {/* Comparison Table Section */}
                    <View className="pt-5 pb-2">
                      {/* Table Header */}
                      <View className="flex-row items-center justify-between mb-2 px-6">
                        <Text className="text-white font-bold text-[12px] uppercase tracking-wider flex-1">
                          Özellikler
                        </Text>
                        <View className="flex-row items-center gap-4">
                          <Text className="text-white font-bold text-[12px] uppercase w-16 text-center">
                            Standart
                          </Text>
                          <Text
                            className="w-16 text-center mb-2"
                            style={{
                              color: "#fff",
                              fontSize: 25,
                              fontFamily: "Duckie-regular",
                            }}
                          >
                            lit plus
                          </Text>
                        </View>
                      </View>

                      {/* Feature Rows */}
                      {[
                        { title: "Sınırsız Beğeni" },
                        { title: "Seni Beğenenleri Gör" },
                        { title: "Geri Alma (Rewind)" },
                        { title: "Reklamsız Deneyim" },
                      ].map((feature, index, arr) => (
                        <View
                          key={index}
                          className={`flex-row items-center justify-between px-6 ${
                            index !== arr.length - 1 ? "mb-4" : ""
                          }`}
                        >
                          <Text className="text-white font-[500] text-[13px] flex-1 pr-2">
                            {feature.title}
                          </Text>
                          <View className="flex-row items-center gap-4">
                            <View className="w-16 items-center">
                              <X
                                size={18}
                                color="rgba(255,255,255,0.4)"
                                strokeWidth={2}
                              />
                            </View>
                            <View className="w-16 items-center">
                              <Check size={18} color="#fff" strokeWidth={2} />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Purchase Action Button */}
                    <View className="px-5 pb-6 pt-3">
                      <View
                        className=" w-full border-[1px] border-white py-[17px] items-center justify-center flex-row gap-2"
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                        }}
                      >
                        <Text className="font-medium text-[14px] text-white">
                          {teaserPrice ? (
                            <>
                              <Text style={{ fontWeight: "700" }}>
                                {teaserPrice} / Ay
                              </Text>
                              {"'dan başlayan planlar"}
                            </>
                          ) : (
                            "Planları İncele"
                          )}
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </AnimatedPressable>
              </View>
            )}

            {/* ── Profil Tamamlama Göstergeleri (Accordion) ── */}
            {completionMetrics.some((m) => m.current < m.max) && (
              <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
                {completionMetrics
                  .filter((m) => m.current < m.max)
                  .map((metric) => (
                    <CompletionAccordion
                      key={metric.key}
                      title={metric.title}
                      icon={metric.icon}
                      current={metric.current}
                      max={metric.max}
                      description={metric.desc}
                      isExpanded={expandedSection === metric.key}
                      onToggle={() => handleAccordionToggle(metric.key)}
                      onEdit={openEditProfile}
                    />
                  ))}
              </View>
            )}

            {/* ── Hesap Sil / Çıkış Yap ── */}
            <View style={{ paddingHorizontal: 16, paddingBottom: 64 }}>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 13,
                  fontWeight: "700",
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                Hesap
              </Text>
              <View>
                <TouchableOpacity
                  onPress={handleLogout}
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                  className="flex-row justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-5 gap-2"
                >
                  <LogOut size={20} color="#fff" strokeWidth={1.5} />
                  <Text
                    style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}
                  >
                    Çıkış Yap
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.ScrollView>
        )}

        <ScreenHeader
          scrollY={scrollY}
          title="Profil"
          fillRatio={swipeFillRatio}
          rightButton={
            Platform.OS === "ios" ? (
              <Host matchContents>
                <SwiftUIButton
                  label="Ayarlar"
                  systemImage="gearshape.fill"
                  onPress={() => setSettingsVisible(true)}
                  modifiers={[
                    buttonStyle("glass"),
                    tint("#ffffff"),
                    labelStyle("iconOnly"),
                    font({ size: 22, weight: "medium" }),
                  ]}
                />
              </Host>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setSettingsVisible(true)}
              >
                <Settings
                  size={29}
                  strokeWidth={2}
                  color="#fff"
                  pointerEvents="none"
                />
              </TouchableOpacity>
            )
          }
        />

        {/* ══ PROFİL DÜZENLEME MODALI ══ */}
        {/* Form sadece modal açıkken mount edilir — kapalıyken yüzlerce
            ikon/pill mount maliyetini ödemiyoruz. Form, kendi içinde
            InteractionManager.runAfterInteractions ile içeriği animasyon
            bittikten sonra çizer. */}
        <ProfileEditModal
          visible={editVisible}
          title="Profili Düzenle"
          onClose={closeEditProfile}
          onSave={handleEditSubmit}
          saving={savingProfile}
        >
          {editVisible && (
            <EditProfileForm
              ref={editFormRef}
              myProfile={myProfile}
              hobbyGroups={hobbyGroups}
              smokingOptions={smokingOptions}
              zodiacOptions={zodiacOptions}
              usagePurposeOptions={usagePurposeOptions}
              interestedInOptions={interestedInOptions}
              cityOptions={cityOptions}
              languageOptions={languageOptions}
              petOptions={petOptions}
              savingPhoto={savingPhoto}
              onAddPhoto={handleAddPhoto}
              onPhotoPress={handlePhotoPress}
              onPreview={() => {
                setEditVisible(false);
                setTimeout(() => setPreviewVisible(true), 400);
              }}
              onSavingChange={setSavingProfile}
              onSaved={handleFormSaved}
            />
          )}
        </ProfileEditModal>

        {/* ══ PURCHASE MODALI ══ */}
        <PurchaseModal
          visible={purchaseVisible}
          onClose={() => setPurchaseVisible(false)}
          onSuccess={loadProfile}
        />

        {/* ══ SETTINGS MODALI ══ */}
        <SettingsModal
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
        />

        {/* ══ PREVİEW MODALI (ARTIK ORIJINAL MODAL) ══ */}
        <PreviewModal
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          profile={previewProfile}
        />
      </View>
    </GestureHandlerRootView>
  );
}
