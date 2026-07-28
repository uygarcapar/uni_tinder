import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
  StatusBar,
  Platform,
  UIManager,
  Linking,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickAndCropPhotos, type PickedPhoto } from "../../../shared/utils/photoPicker";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { API_ENDPOINTS } from "@/shared/constants/api";
import profileService from "@/features/profile/profileService";
import { staticGet } from "@/shared/services/staticCache";
import PreviewModal from "@/features/profile/components/PreviewModal";
import SettingsModal from "@/features/profile/components/SettingsModal";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import ScreenHeader from "@/shared/components/ScreenHeader";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { getOfferings } from "@/features/profile/subscriptionService";
import {
  clearSyncPending,
  fetchSubscriptionStatus,
  selectIsPremium,
  selectSyncPending,
  syncSubscriptionWithRetry,
} from "@/features/profile/subscriptionSlice";
import {
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
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";

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
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";

// Android LayoutAnimation aktivasyonu
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");


// ─── Generic skeleton box w/ shimmer ─────────────────────────────────────────
type SkeletonBoxProps = {
  width?: number;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};
function SkeletonBox({
  width: w,
  height: h,
  borderRadius = 8,
  style,
}: SkeletonBoxProps) {
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
          backgroundColor: colors.surface,
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
  // expo-image — memory+disk cache → tab değişiminde avatar anında gelir.
  // İlk yüklemede `loading` (parent'tan) veya imgLoading ile skeleton göster.
  const [imgLoading, setImgLoading] = useState(!!uri);

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
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={() => setImgLoading(false)}
          onError={() => setImgLoading(false)}
        />
      ) : loading ? null : (
        <SFIcon name="person.fill" fallback={UserRound} size={40} color={colors.text} strokeWidth={1.5} />
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
  icon,
}) {
  const { t } = useTranslation();
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
        className="bg-surface"
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
          {icon && (
            <SFIcon
              name={icon.sf}
              fallback={icon.lucide}
              size={18}
              color={colors.text}
              strokeWidth={1.5}
            />
          )}
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
            {title}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text
            style={{
              color: isComplete ? colors.text : colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
            }}
          >
            {current}/{max}
          </Text>
          <Animated.View style={chevronStyle}>
            <SFIcon name="chevron.down" fallback={ChevronDown} size={20} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
          </Animated.View>
        </View>
      </TouchableOpacity>
      <Animated.View className="bg-surface" style={contentStyle}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          <Text
            style={{
              color: colors.textSecondary,
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
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "500" }}>
              {t('profile.completion.completeButton')}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

import AppModal from "@/shared/components/AppModal";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EditProfileForm, {
  EditProfileFormSkeleton,
} from "@/features/profile/components/EditProfileForm";
import { hydrateProfileForm } from "@/features/profile/utils/hydrateProfileForm";
import { useQueryClient } from "@tanstack/react-query";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { colors } from "../../../shared/theme/colors";
import { useRenderCount } from "@/shared/debug/useRenderCount";

// ─── Edit Modal sarmalayıcı ───────────────────────────────────────────────────
// AppModal'ın standart action props'unu kullanır — Save butonu glass + controlSize
// large render edilir, X ile aynı height'da.
function ProfileEditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  saveDisabled,
  onPresented,
  scrollEnabled = true,
  children,
}) {
  const { t } = useTranslation();
  // Saving sırasında "Kaydediliyor" yazısı yerine "Kaydet" text boyutunda
  // shimmer skeleton göster. Button frame'i (pill, h46, glass-ish bg) aynı
  // tutulur ki yer değişmesin.
  const savingSlot = (
    <View
      pointerEvents="none"
      style={{
        height: 46,
        paddingHorizontal: 18,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SkeletonBox width={44} height={14} borderRadius={3} />
    </View>
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      onPresented={onPresented}
      title={title}
      actionLabel={saving ? undefined : t('common.save')}
      onAction={onSave}
      actionDisabled={saveDisabled}
      rightSlot={saving ? savingSlot : undefined}
      scrollEnabled={scrollEnabled}
      fullScreen
    >
      {children}
    </AppModal>
  );
}

// Abonelik tarihleri (yenileme / iptal geçerlilik / trial bitişi / grace).
// Aynı yıl içindeyse yıl gösterilmiyor. Geçersiz tarihte "" döner ki metin
// "undefined tarihine kadar" gibi bozulmasın.
const formatSubscriptionDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

// ══════════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  useRenderCount("ProfileScreen");
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => (s as any).auth);
  const subscriptionIsPremium = useAppSelector(selectIsPremium);
  const subscriptionExpiresAt = useAppSelector((s) => (s as any).subscription?.expiresAt);
  const subscriptionStatus = useAppSelector((s) => (s as any).subscription?.status);
  const subscriptionIsTrial = useAppSelector((s) => (s as any).subscription?.isTrial);
  const subscriptionTrialEndsAt = useAppSelector((s) => (s as any).subscription?.trialEndsAt);
  const subscriptionGraceEndsAt = useAppSelector(
    (s) => (s as any).subscription?.gracePeriodEndsAt,
  );
  const syncPending = useAppSelector(selectSyncPending);
  const syncing = useAppSelector((s) => (s as any).subscription?.syncing);
  const insets = useSafeAreaInsets();
  const statsQuery = useSwipeStats();

  // DiscoverScreen ile aynı fill oranı: (limit - kalan) / limit.
  // Tavan backend'den (dailySwipeLimit) geliyor — SwipeLimitsOptions değişince
  // FE otomatik uysun diye hard-code edilmiyor. Premium / -1 / limit yok → 0.
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

  // Abonelik durum makinesi (backend `/status`.status + isActivelyPremium).
  // `Cancelled` / `BillingIssue`'da backend premium erişimi AÇIK tutuyor
  // (dönem sonu / grace bitişine kadar) — burada da kapatmıyoruz, sadece
  // rozet + CTA değişiyor.
  const subscriptionView = useMemo(() => {
    if (syncPending) {
      return {
        kind: "pending" as const,
        badge: t("profile.subscription.pendingBadge"),
        description: t("profile.subscription.pendingDescription"),
      };
    }
    if (subscriptionStatus === "BillingIssue") {
      return {
        kind: "billingIssue" as const,
        badge: t("profile.subscription.billingIssueBadge"),
        description: subscriptionGraceEndsAt
          ? t("profile.subscription.billingIssueDescription", {
              date: formatSubscriptionDate(subscriptionGraceEndsAt),
            })
          : t("profile.subscription.billingIssueDescriptionNoDate"),
      };
    }
    if (subscriptionStatus === "Cancelled") {
      return {
        kind: "cancelled" as const,
        badge: t("profile.subscription.cancelledBadge"),
        description: subscriptionExpiresAt
          ? t("profile.subscription.cancelledDescription", {
              date: formatSubscriptionDate(subscriptionExpiresAt),
            })
          : t("profile.subscription.cancelledDescriptionNoDate"),
      };
    }
    if (subscriptionIsTrial) {
      return {
        kind: "trial" as const,
        badge: t("profile.subscription.trialBadge"),
        description: subscriptionTrialEndsAt
          ? t("profile.subscription.trialDescription", {
              date: formatSubscriptionDate(subscriptionTrialEndsAt),
            })
          : t("profile.subscription.trialDescriptionNoDate"),
      };
    }
    return {
      kind: "active" as const,
      badge: t("profile.subscription.status"),
      description: t("profile.subscription.activeDescription"),
    };
  }, [
    syncPending,
    subscriptionStatus,
    subscriptionIsTrial,
    subscriptionTrialEndsAt,
    subscriptionGraceEndsAt,
    subscriptionExpiresAt,
    t,
  ]);

  // "Aktivasyon sürüyor" kartındaki manuel yenile: önce canonical `/status`,
  // hâlâ premium görünmüyorsa tek bir `/sync` denemesi (backoff'lu tam tur
  // satın alma anında zaten atıldı; burada kullanıcı tetikliyor).
  const handleRetrySync = useCallback(() => {
    dispatch(fetchSubscriptionStatus())
      .unwrap()
      .then((res: any) => {
        if (!res?.isPremium) dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }));
        else dispatch(clearSyncPending());
      })
      .catch(() => {
        dispatch(syncSubscriptionWithRetry({ maxAttempts: 1 }));
      });
  }, [dispatch]);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // ── Modal visibility state (declarative) ───────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  // Skeleton modal açılır açılmaz görünür (full size, içerik dolu hissi).
  // Heavy form mount'u rAF ile bir sonraki vsync'e ertelenir → modal slide-up
  // animasyonu skeleton'la başlar, JS thread serbest kaldığında form mount
  // edilip skeleton swap edilir.
  const [editFormReady, setEditFormReady] = useState(false);
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
  const [cityOptions, setCityOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [petOptions, setPetOptions] = useState([]);
  const [genderCategories, setGenderCategories] = useState([]);
  const qc = useQueryClient();

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
  // Layout genişlikleri shared value olarak tutuluyor; React state'i worklet
  // closure'undan okumak Fabric'te stale value yakalanmasına yol açıp bazen
  // badge'in initial konumda (sol kenarda) takılı kalmasına neden oluyordu.
  // Şimdi onLayout shared value'yu doğrudan güncelliyor → worklet her zaman
  // güncel genişlikle çalışır.
  const progressRatio = useSharedValue(0);
  const barWidthSV = useSharedValue(0);
  const badgeWidthSV = useSharedValue(30);

  useEffect(() => {
    const completionPct =
      myProfile?.profileCompletionPercentage ??
      myProfile?.profileCompletionScore ??
      0;
    progressRatio.value = withTiming(completionPct / 100, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [
    myProfile?.profileCompletionPercentage,
    myProfile?.profileCompletionScore,
  ]);

  // ÖNCEKİ: useAnimatedStyle içinde `width` ve `left` animate ediliyordu. Bu
  // iki property Fabric'te layout property'sidir; useAnimatedStyle her frame'de
  // re-eval ediliyor → her frame ShadowTree commit'i. Modal açılışı + form mount
  // sırasında bu commit'ler heavy mount commit'leri ile çakışıp Fabric'in
  // "attempts < 1024" assertion'ına çarpıyordu (SIGABRT crash).
  // Fix: transform-based animation. Bar için translateX ile clip-reveal,
  // badge için translateX (left yerine). Transform UI-thread only, ShadowTree
  // commit tetiklemez.
  const progressBarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (progressRatio.value - 1) * barWidthSV.value },
    ],
  }));

  // Badge yüksek yüzdelerde (95%, 100%) bar'ın sağ kenarından taşıp ekran
  // dışına çıkıyordu — sağdan clamp. Badge genişliği içerik (5%, 100%) +
  // border'la değiştiği için onLayout'tan ölçülüp shared value'da tutulur.
  const progressBadgeStyle = useAnimatedStyle(() => {
    const barW = barWidthSV.value;
    const badgeW = badgeWidthSV.value;
    const target = progressRatio.value * barW - badgeW / 2;
    const maxX = Math.max(0, barW - badgeW);
    const clamped = Math.min(Math.max(target, 0), maxX);
    return {
      opacity: barW === 0 ? 0 : 1,
      transform: [{ translateY: -13 }, { translateX: clamped }],
    };
  });

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
        citiesRes,
        languagesRes,
        petsRes,
        gendersRes,
      ] = await Promise.all([
        profileService.getMyProfile(),
        // Statik enum listeleri → staticGet (oturum-boyu tek fetch, ekranlar-arası
        // paylaşımlı). cities Discover filtresiyle (useCities → staticGet) aynı
        // isteği paylaşır → cities ×2 tek isteğe iner.
        safe("hobbies", staticGet(API_ENDPOINTS.GET_HOBBIES)),
        safe("smoking", staticGet(API_ENDPOINTS.GET_SMOKING_STATUSES)),
        safe("zodiacs", staticGet(API_ENDPOINTS.GET_ZODIACS)),
        safe("usage", staticGet(API_ENDPOINTS.GET_USAGE_PURPOSES)),
        safe("cities", staticGet(API_ENDPOINTS.GET_CITIES)),
        safe("languages", staticGet(API_ENDPOINTS.GET_LANGUAGES)),
        safe("pets", staticGet(API_ENDPOINTS.GET_PETS)),
        // Cinsiyet kategorileri — EditProfileForm'daki cinsiyet picker'ı için.
        // RegisterStep7 aynı endpoint'i useGenders ile çekiyor; liste tek kaynak.
        safe("genders", staticGet(API_ENDPOINTS.GET_GENDERS)),
      ]);

      setMyProfile(profile);

      if (hobbiesRes?.result) {
        const groups = Array.isArray(hobbiesRes.result)
          ? hobbiesRes.result
          : [];
        const map = {};
        groups.forEach((g) =>
          (g.hobbies || []).forEach((h) => {
            map[h.id] = { name: h.name, enumName: h.enumName };
          }),
        );
        setHobbyMap(map);
        setHobbyGroups(groups);
      }

      if (smokingRes?.result) setSmokingOptions(smokingRes.result);
      if (zodiacRes?.result) setZodiacOptions(zodiacRes.result);
      if (usageRes?.result) setUsagePurposeOptions(usageRes.result);
      if (citiesRes?.result) setCityOptions(citiesRes.result);
      if (languagesRes?.result) setLanguageOptions(languagesRes.result);
      if (petsRes?.result) setPetOptions(petsRes.result);
      if (gendersRes?.result) setGenderCategories(gendersRes.result);
    } catch (e) {
      console.error("Profile load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Premium false→true geçişinde profili tazele. Doküman §9: aktivasyon sonrası
  // `GetMyProfile` de invalidate edilmeli — rozet + premium-scoped alanlar free
  // scope'ta çekilmiş kalıyordu. myProfile react-query'de değil local state'te,
  // bu yüzden PurchaseModal'ın refetchPremiumScoped'u buraya ulaşmıyor.
  const prevPremiumRef = useRef(subscriptionIsPremium);
  useEffect(() => {
    if (prevPremiumRef.current === subscriptionIsPremium) return;
    prevPremiumRef.current = subscriptionIsPremium;
    if (subscriptionIsPremium) loadProfile();
  }, [subscriptionIsPremium, loadProfile]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resolveHobbies = (raw) => {
    if (!raw?.length) return [];
    return raw.map((h) => {
      if (h && typeof h === "object") {
        return { name: h.name ?? String(h.id ?? ""), enumName: h.enumName };
      }
      if (typeof h === "string" && isNaN(Number(h))) {
        return { name: h, enumName: undefined };
      }
      const entry = hobbyMap[Number(h)];
      if (entry) return entry;
      return { name: String(h), enumName: undefined };
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
  // İlk açılış: skeleton → onPresented/data-ready ile form. Sonraki açılışlar:
  // veriler cache'li (districtCache, initialValues) + form "ısınmış" olduğu için
  // skeleton'ı atla, editFormReady'yi anında aç → reopen anında tam form gelir.
  const hasOpenedEditOnceRef = useRef(false);
  const openEditProfile = useCallback(() => {
    setEditVisible(true);
    if (hasOpenedEditOnceRef.current) setEditFormReady(true);
    hasOpenedEditOnceRef.current = true;
  }, []);
  const closeEditProfile = useCallback(() => {
    setEditVisible(false);
    // editFormReady'yi ilk açılıştan sonra false'a çekmiyoruz — reopen'da skeleton
    // flash'ı olmasın. İlk kez henüz açılmadıysa (edge) skeleton mantığı korunur.
    if (!hasOpenedEditOnceRef.current) setEditFormReady(false);
  }, []);

  // Edit form'un initial değerlerini parent'ta sync hesapla. Form mount'unda
  // post-mount setValue/reset cascade'i olmadan tüm alanlar hidrate doğar →
  // Fabric ShadowTree commit baskısı dramatik düşer. myProfile veya option
  // listelerinden biri değiştiğinde memo yeniden hesaplanır; ama EditProfileForm
  // key={myProfile.id} ile bağlı olduğu için aynı kullanıcı içinde fresh
  // value'lar form'a "yeniden enjekte edilmez" — sadece bir sonraki mount'ta
  // (modal kapanıp açıldığında) etkili olur.
  const editInitialValues = useMemo(() => {
    if (!myProfile) return null;
    return hydrateProfileForm({
      myProfile,
      hobbyGroups,
      smokingOptions,
      zodiacOptions,
      usagePurposeOptions,
      cityOptions,
      languageOptions,
      petOptions,
    });
  }, [
    myProfile,
    hobbyGroups,
    smokingOptions,
    zodiacOptions,
    usagePurposeOptions,
    cityOptions,
    languageOptions,
    petOptions,
  ]);

  // Form mount'u için tetikleyiciler:
  //   1. onPresented (gorhom onChange ≥0) — animasyon bitince fire eder
  //   2. Veri-hazırlık koşulu — initial values + city/hobby listeleri dolduğunda
  // İkisi de true olduğunda skeleton swap edilir. setTimeout fallback'i artık
  // YOK: yarım hidrate form mount etmek crash riskini geri getiriyordu.
  const handleEditPresented = useCallback(() => setEditFormReady(true), []);
  useEffect(() => {
    if (!editVisible) return;
    if (!editInitialValues) return;
    if (cityOptions.length === 0) return;
    if (hobbyGroups.length === 0) return;
    setEditFormReady(true);
  }, [editVisible, editInitialValues, cityOptions.length, hobbyGroups.length]);

  const handleEditSubmit = useCallback(() => {
    editFormRef.current?.submit();
  }, []);

  const handleFormSaved = useCallback(
    (optimisticPatch) => {
      setMyProfile((p) => ({ ...p, ...optimisticPatch }));
      // Fotoğraf order değişmiş olabilir; backend'den taze veriyi çek.
      refreshPhotos();
      // Cinsiyet değişimi Discover destesini etkiliyor: HardFilterStage
      // reciprocity kontrolü (p.InterestedInFlags & viewer'ın kategorisi) benim
      // cinsiyetime bakıyor, yani kimlerin karşıma çıkacağı değişiyor. Backend
      // aday havuzunu invalidate ediyor ama react-query kendi cache'ini tutuyor
      // (staleTime 60sn + infinite query sayfaları) → deste elle tazelenmezse
      // eski hâliyle kalıyor.
      qc.invalidateQueries({ queryKey: swipeKeys.matches });
      closeEditProfile();
    },
    // refreshPhotos aşağıda tanımlı; deps'te yok — closure stale olmaz çünkü
    // refreshPhotos hep aynı module-bound fn.
    [closeEditProfile, qc],
  );

  // ── Fotoğraf aksiyonları ───────────────────────────────────────────────────
  const refreshPhotos = async () => {
    try {
      const profile = await profileService.getMyProfile(true); // foto sonrası taze
      setMyProfile(profile);
    } catch (e) {
      console.error("Profil yenileme hatası:", e?.message);
    }
  };

  const handleAddPhoto = async () => {
    // Kayıt akışıyla aynı 3:4 crop'lu seçim; crop-picker izni kendisi ister.
    let picked: PickedPhoto[];
    try {
      picked = await pickAndCropPhotos(1);
    } catch (e: any) {
      if (e?.code === "E_NO_LIBRARY_PERMISSION") {
        Alert.alert(
          t('profile.permissions.title'),
          t('profile.permissions.galleryMessage'),
        );
      }
      return;
    }
    if (picked.length === 0) return;

    const file = {
      uri: picked[0].uri,
      type: picked[0].mime,
      name: picked[0].fileName,
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
      Alert.alert(t('common.error'), t('profile.photos.uploadError'));
    } finally {
      setSavingPhoto(false);
    }
  };

  const handlePhotoPress = (photo) => {
    const isMain = photo.isMainPhoto;
    const options = [];
    if (!isMain)
      options.push({
        text: t('profile.photos.setMain'),
        onPress: () => handleSetMainPhoto(photo.photoId),
      });
    options.push({
      text: t('profile.photos.delete'),
      style: "destructive",
      onPress: () => handleDeletePhoto(photo.photoId),
    });
    options.push({ text: t('common.cancel'), style: "cancel" });
    Alert.alert(t('profile.photos.title'), "", options);
  };

  const handleSetMainPhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ NewMainPhotoId: photoId });
      await refreshPhotos();
    } catch {
      Alert.alert(t('common.error'), t('profile.photos.setMainError'));
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
    } catch {
      Alert.alert(t('common.error'), t('profile.photos.deleteError'));
    } finally {
      setSavingPhoto(false);
    }
  };

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
      title: t('profile.completion.photos'),
      icon: { sf: "camera.fill" as SFSymbol, lucide: Camera },
      current: myProfile?.photosList?.length || 0,
      max: 6,
      desc: t('profile.completion.photosDescription'),
    },
    {
      key: "hobbies",
      title: t('profile.completion.hobbies'),
      icon: { sf: "heart" as SFSymbol, lucide: Heart },
      current: myProfile?.hobbies?.length || 0,
      max: 10,
      desc: t('profile.completion.hobbiesDescription'),
    },
    {
      key: "bio",
      title: t('profile.completion.bio'),
      icon: { sf: "book.fill" as SFSymbol, lucide: BookOpen },
      current: myProfile?.bio?.trim().length > 0 ? 1 : 0,
      max: 1,
      desc: t('profile.completion.bioDescription'),
    },
    {
      key: "smoking",
      title: t('profile.completion.smoking'),
      icon: { sf: "smoke.fill" as SFSymbol, lucide: Cigarette },
      current: myProfile?.smokingStatus != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.smokingDescription'),
    },
    {
      key: "zodiac",
      title: t('profile.completion.zodiac'),
      icon: { sf: "star.fill" as SFSymbol, lucide: Star },
      current: myProfile?.zodiacSign != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.zodiacDescription'),
    },
    {
      key: "purpose",
      title: t('profile.completion.purpose'),
      icon: { sf: "target" as SFSymbol, lucide: Target },
      current: myProfile?.usagePurpose != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.purposeDescription'),
    },
  ];

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
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
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
                  onLayout={(e) => {
                    barWidthSV.value = e.nativeEvent.layout.width;
                  }}
                >
                  {/* Bar: full-width strip clipped by overflow:hidden wrapper,
                      translateX ile soldan sağa reveal edilir (transform → UI thread). */}
                  <View
                    style={{
                      height: "100%",
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    <Animated.View
                      style={[
                        {
                          width: "100%",
                          height: "100%",
                          backgroundColor: colors.text,
                        },
                        progressBarStyle,
                      ]}
                    />
                  </View>
                  {/* Yüzde Badge — left:0 base, translateX ile pozisyonlanır */}
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        top: "50%",
                        left: 0,
                      },
                      progressBadgeStyle,
                    ]}
                  >
                    <View
                      className="border-[3px] border-bg"
                      onLayout={(e) => {
                        badgeWidthSV.value = e.nativeEvent.layout.width;
                      }}
                      style={{
                        backgroundColor: colors.text,
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
                    color: colors.text,
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
                      label={t('profile.edit.button')}
                      systemImage="pencil"
                      onPress={openEditProfile}
                      modifiers={[
                        buttonStyle("glass"),
                        controlSize("regular"),
                        tint(colors.text),
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
                      <SFIcon name="pencil" fallback={Pencil} size={15} color={colors.text} strokeWidth={2} weight="semibold" />
                      <Text
                        style={{
                          color: colors.text,
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        {t('profile.edit.button')}
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
                  colors={[colors.litPlus, colors.litPlus]}
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
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          style={{
                            color: colors.text,
                            fontSize: 50,
                            fontFamily: "Duckie-regular",
                          }}
                        >
                          lit plus
                        </Text>
                      </View>
                      <Text
                        numberOfLines={3}
                        className="text-white/80 font-medium text-[14px] leading-5"
                      >
                        {subscriptionView.description}
                      </Text>
                    </View>
                    <View
                      className="border-[0.5px] border-gray-300 px-5 py-2.5 flex-row items-center gap-1.5"
                      style={{
                        borderRadius: 999,
                        overflow: "hidden",
                        borderCurve: "continuous",
                      }}
                    >
                      <Text className="text-white font-bold text-[13px]">
                        {subscriptionView.badge}
                      </Text>
                    </View>
                  </View>

                  <View className="px-5 pb-6 pt-3">
                    {/* Aktivasyon bekliyorsa (satın alma alındı, backend henüz
                        premium görmüyor) store'a değil manuel yenilemeye
                        yönlendiriyoruz. İptal/ödeme sorununda ise store'daki
                        abonelik ekranı doğru hedef. */}
                    {subscriptionView.kind === "pending" ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleRetrySync}
                        disabled={syncing}
                        className="w-full border-[0.5px] border-gray-300 py-[17px] items-center justify-center"
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                          opacity: syncing ? 0.6 : 1,
                        }}
                      >
                        {syncing ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <Text className="font-bold text-[14px] text-white">
                            {t('profile.subscription.retryButton')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          const url =
                            Platform.OS === "ios"
                              ? "https://apps.apple.com/account/subscriptions"
                              : "https://play.google.com/store/account/subscriptions";
                          Linking.openURL(url).catch(() => {});
                        }}
                        className="w-full border-[0.5px] border-gray-300 py-[17px] items-center justify-center"
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                        }}
                      >
                        <Text className="font-medium text-[14px] text-white">
                          {subscriptionView.kind === "billingIssue" ? (
                            <Text style={{ fontWeight: "700" }}>
                              {t('profile.subscription.fixPaymentButton')}
                            </Text>
                          ) : subscriptionView.kind === "cancelled" ? (
                            <Text style={{ fontWeight: "700" }}>
                              {t('profile.subscription.resubscribeButton')}
                            </Text>
                          ) : subscriptionExpiresAt ? (
                            <>
                              <Text style={{ fontWeight: "700" }}>
                                {t('profile.subscription.manageButton')}
                              </Text>
                              <Text style={{ color: "rgba(255,255,255,0.55)" }}>
                                {` · ${t(
                                  subscriptionView.kind === "trial"
                                    ? 'profile.subscription.trialEndsLabel'
                                    : 'profile.subscription.renewalLabel',
                                )} `}
                                {formatSubscriptionDate(
                                  subscriptionView.kind === "trial" && subscriptionTrialEndsAt
                                    ? subscriptionTrialEndsAt
                                    : subscriptionExpiresAt,
                                )}
                              </Text>
                            </>
                          ) : (
                            t('profile.subscription.manageAlt')
                          )}
                        </Text>
                      </TouchableOpacity>
                    )}
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
                    colors={[colors.litPlus, colors.litPlus]}
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
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={{
                              color: colors.text,
                              fontSize: 50,
                              fontFamily: "Duckie-regular",
                            }}
                          >
                            lit plus
                          </Text>
                        </View>
                        <Text
                          numberOfLines={3}
                          className="text-white/80 font-medium text-[14px] leading-5"
                        >
                          {t('discover.premium.description')}
                        </Text>
                      </View>
                      <View style={{ width: 84, alignItems: "center", gap: 4 }}>
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
                            <SFIcon name="arrow.up" fallback={ArrowUp} size={22} color={colors.text} strokeWidth={4} weight="heavy" />
                          </View>
                          <View
                            style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              opacity: 0.2,
                            }}
                          >
                            <SFIcon name="arrow.up" fallback={ArrowUp} size={22} color={colors.text} strokeWidth={4} weight="heavy" />
                          </View>
                          <SFIcon name="arrow.up" fallback={ArrowUp} size={28} color={colors.text} strokeWidth={4} weight="heavy" />
                        </View>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          className="text-white font-bold text-[12px] text-center"
                        >
                          {t('discover.premium.matchBoost')}
                        </Text>
                      </View>
                    </View>

                    {/* Comparison Table Section */}
                    <View className="pt-5 pb-2">
                      {/* Table Header */}
                      <View className="flex-row items-center justify-between mb-2 px-6">
                        <Text className="text-white font-bold text-[12px] uppercase tracking-wider flex-1">
                          {t('discover.premium.featuresLabel')}
                        </Text>
                        <View className="flex-row items-center gap-4">
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            className="text-white font-bold text-[12px] uppercase w-16 text-center"
                          >
                            {t('discover.premium.standardPlan')}
                          </Text>
                          <Text
                            className="w-16 text-center mb-2"
                            style={{
                              color: colors.text,
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
                        { title: t('discover.premium.feature1') },
                        { title: t('discover.premium.feature2') },
                        { title: t('discover.premium.feature3') },
                        { title: t('discover.premium.feature4') },
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
                              <SFIcon
                                name="xmark"
                                fallback={X}
                                size={18}
                                color="rgba(255,255,255,0.4)"
                                strokeWidth={2}
                                weight="semibold"
                              />
                            </View>
                            <View className="w-16 items-center">
                              <SFIcon name="checkmark" fallback={Check} size={18} color={colors.text} strokeWidth={2} weight="semibold" />
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Purchase Action Button */}
                    <View className="px-5 pb-6 pt-3">
                      <View
                        className=" w-full border-[0.5px] border-gray-300 py-[17px] items-center justify-center flex-row gap-2"
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                        }}
                      >
                        <Text className="font-medium text-[14px] text-white">
                          {teaserPrice ? (
                            <>
                              <Text className="text-gray-300">
                                {t('discover.premium.pricingPrefix')}
                              </Text>
                              <Text style={{ fontWeight: "700" }}>
                                {t('discover.premium.pricing', { price: teaserPrice })}
                              </Text>
                              <Text className="text-gray-300">
                                {t('discover.premium.pricingSuffix')}
                              </Text>
                            </>
                          ) : (
                            t('discover.premium.cta')
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

          </Animated.ScrollView>
        )}

        <ScreenHeader
          scrollY={scrollY}
          title={t('profile.tabTitle')}
          fillRatio={swipeFillRatio}
          rightButton={
            Platform.OS === "ios" ? (
              <Host matchContents>
                <SwiftUIButton
                  label={t('profile.settings.button')}
                  systemImage="gearshape.fill"
                  onPress={() => setSettingsVisible(true)}
                  modifiers={[
                    buttonStyle("glass"),
                    tint(colors.text),
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
                <SFIcon
                  name="gearshape.fill"
                  fallback={Settings}
                  size={29}
                  strokeWidth={2}
                  weight="semibold"
                  color={colors.text}
                  style={{ pointerEvents: "none" }}
                />
              </TouchableOpacity>
            )
          }
        />

        {/* ══ PROFİL DÜZENLEME MODALI ══ */}
        {/* Skeleton modal açılır açılmaz render edilir → modal slide-up
            animasyonu içerik dolu hissiyatıyla başlar. Heavy form mount'u
            rAF ile bir sonraki frame'e ertelenir; mount sırasında skeleton
            görünür kalır, hazır olunca swap edilir. */}
        <ProfileEditModal
          visible={editVisible}
          title={t('profile.edit.title')}
          onClose={closeEditProfile}
          onSave={handleEditSubmit}
          saving={savingProfile}
          onPresented={handleEditPresented}
          scrollEnabled={editFormReady}
        >
          {editVisible &&
            (editFormReady && editInitialValues ? (
              <EditProfileForm
                key={myProfile?.id ?? "no-profile"}
                ref={editFormRef}
                myProfile={myProfile}
                initialValues={editInitialValues}
                hobbyGroups={hobbyGroups}
                smokingOptions={smokingOptions}
                zodiacOptions={zodiacOptions}
                usagePurposeOptions={usagePurposeOptions}
                cityOptions={cityOptions}
                languageOptions={languageOptions}
                petOptions={petOptions}
                genderCategories={genderCategories}
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
            ) : (
              <EditProfileFormSkeleton />
            ))}
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
