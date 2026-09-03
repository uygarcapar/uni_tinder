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
  AppState,
  ScrollView,
  Dimensions,
  StatusBar,
  Platform,
  UIManager,
  Linking,
  StyleProp,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import {
  pickAndCropPhotos,
  captureAndCropPhoto,
  recropExistingPhoto,
  type PickedPhoto,
} from "../../../shared/utils/photoPicker";
import { forgetPhoto } from "@/shared/utils/photoStore";
import PhotoSourceSheet from "@/shared/components/PhotoSourceSheet";
import { devLog } from "@/shared/utils/devLog";
import { resolveMainPhotoUri, resolvePhotoUri } from "@/shared/utils/photoUri";
import { useAppSelector } from "@/shared/hooks/redux";
import { API_ENDPOINTS } from "@/shared/constants/api";
import {
  MAX_PROFILE_PHOTOS,
  MAX_PROFILE_PROMPTS,
} from "@/shared/constants/limits";
import uiBus, { consumePhotoHighlight } from "@/shared/services/uiBus";
import profileService from "@/features/profile/profileService";
import {
  moderationReasonText,
  moderationReasonTitle,
  normalizePhotoModeration,
  normalizeProfileVisibility,
  requiresUserAction,
  resolveRequiredPhotoCount,
  summarizeModeration,
  type PhotoModeration,
} from "@/features/profile/photoModeration";
import {
  isPhotoAppealConflict,
  photoModerationCodeKey,
} from "@/shared/constants/responseCodes";
import { staticGet } from "@/shared/services/staticCache";
import PreviewModal from "@/features/profile/components/PreviewModal";
import ShopCardsRow from "@/features/profile/components/ShopCardsRow";
import ScreenHeader from "@/shared/components/ScreenHeader";
import EmptyState from "@/shared/components/EmptyState";
import { getOfferings } from "@/features/profile/subscriptionService";
import { selectSyncPending } from "@/features/profile/subscriptionSlice";
import { usePremiumTier } from "@/features/profile/premiumTier";
import {
  UPSELL_BENEFIT_KEYS,
  UPSELL_HIDDEN_BENEFIT_COUNT,
  premiumBenefitLabelKey,
} from "@/features/profile/premiumBenefits";
import {
  Pencil,
  Check,
  X,
  Heart,
  Cigarette,
  BookOpen,
  Settings,
  Bell,
  Camera,
  Star,
  ChevronDown,
  UserRound,
  WifiOff,
} from "@/shared/icons";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
// Çıplak alev YALNIZ dekoratif kullanım için kaldı (premium tanıtım kartındaki
// büyük glyph). İsmin yanındaki rozet PremiumBadge.
import PremiumFlame from "@/shared/components/PremiumFlame";
import PremiumBadge from "@/shared/components/PremiumBadge";
import SelfieVerifiedBadge from "@/features/profile/components/SelfieVerifiedBadge";
import SelfieVerificationRow from "@/features/profile/components/SelfieVerificationRow";
import { resolveSelfieVerified } from "@/features/profile/selfie/selfieVerification";
import { confirmMainPhotoChange } from "@/features/profile/selfie/confirmMainPhotoChange";

import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  controlSize,
  font,
  frame,
  fixedSize,
  accessibilityLabel,
} from "@expo/ui/swift-ui/modifiers";

// REANIMATED & GESTURE HANDLER IMPORTLARI
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useDerivedValue,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import type PagerView from "react-native-pager-view";
import PagerTabBar, {
  AnimatedPagerView,
  usePagerScrollHandler,
  usePagerTabCommit,
} from "@/shared/components/PagerTabBar";
import PlusPage from "@/features/profile/components/PlusPage";
import {
  consumeLitPlusRequest,
  LIT_PLUS_EVENT,
} from "@/features/profile/litPlusEntry";

// Android LayoutAnimation aktivasyonu
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get("window");

/** Header'daki şeridin sekmeleri — pager sayfa sırasıyla AYNI. */
type TabKey = "profile" | "plus";

// ─── Hero Section ölçüleri ───────────────────────────────────────────────────
// "Profili Düzenle" butonunun SwiftUI Host'u HİÇBİR eksende matchContents
// kullanamaz (ölçüm ikinci Fabric commit'inde gelir, ilk frame yanlış çizilir),
// bu yüzden kutusunun boyutu buradan deterministik olarak türetilir.
const HERO_PAD_H = 20;
const HERO_AVATAR = 80;
const HERO_GAP = 16;
const EDIT_BUTTON_H = 34;
// Avatarın sağındaki metin kolonunun tam genişliği. Host bu genişlikte sabitlenir;
// glass kapsül fixedSize ile metne göre daralıp kutunun soluna yaslanır, kalan
// alan şeffaf kalır.
const EDIT_BUTTON_BOX_W = width - HERO_PAD_H * 2 - HERO_AVATAR - HERO_GAP;
// Hero ismi. Premium rozetinin çapı bundan türüyor (bkz. PremiumBadge), o
// yüzden punto sabitte duruyor.
const HERO_NAME_FONT = 18;
const HERO_NAME_LINE = 28;
// Fotoğraf doğrulama rozetinin ölçüsü. Premium rozetiyle AYNI SAYI DEĞİL artık:
// premium yuvarlak zeminli bir chip, bu ise çıplak bir SF Symbol — ikisi aynı
// sayıya bağlanırsa biri diğerinin ölçüsünü bozuyor.
const HERO_VERIFIED_SIZE = 16;

// Premium rozetinin çapı — İSTİSNA olarak puntodan TÜRETİLMİYOR (bkz.
// PremiumBadge > size). 18'lik isimden çıkan 14 burada rozet değil nokta gibi
// duruyordu: hero ismi kart başlıklarındakinden küçük ama rozet bu ekrandaki
// tek premium işareti, o yüzden orana değil okunurluğa göre seçildi. Yanındaki
// doğrulama sembolünden (16) bir tık büyük kalması da bilinçli.
const HERO_PREMIUM_BADGE_SIZE = 18;


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
          colors={["transparent", colors.shimmer, "transparent"]}
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
      // Basılıyken sönme YOK: avatar zaten önizlemeye açılıyor, araya giren
      // opacity düşüşü fotoyu bir an soluklaştırıyordu.
      activeOpacity={1}
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

      {/* SuperLike kartı — ekranın yarısı kadar, sol gutter'a yaslı */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
        <SkeletonBox width={width * 0.5} height={76} borderRadius={28} />
      </View>

      {/* Premium banner */}
      <View style={{ paddingHorizontal: 16, marginBottom: 40 }}>
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
      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
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


// ─── Profil çekilemedi ───────────────────────────────────────────────────────
// Yükleme düştüğünde ekranın geri kalanını `myProfile = null` ile çizmek
// kullanıcıya kendi profilini BOŞALMIŞ gösteriyor (isim yok, %0 doluluk,
// "0/6 fotoğraf") — yani veri kaybı gibi okunan bir ağ hatası. Hata kendi
// durumu: ne olduğu yazıyor ve tek dokunuşla yeniden deniyor.
function ProfileLoadError({ onRetry, retrying }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        // Header (üstte absolute) ve floating tab bar'ın arasında ortalansın.
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + 120,
      }}
    >
      <EmptyState
        Icon={WifiOff}
        sf="wifi.slash"
        iconSize={72}
        iconStrokeWidth={1}
        topOffset={0}
        text={t("profile.loadFailed.title")}
        subtitle={t("profile.loadFailed.subtitle")}
        buttonLabel={t("profile.loadFailed.retry")}
        onButtonPress={onRetry}
        buttonBusy={retrying}
      />
    </View>
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
        borderColor: colors.hairline,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={onToggle}
        style={{
          backgroundColor: colors.surface,
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
              forceFallback={icon.forceFallback}
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
      <Animated.View style={[{ backgroundColor: colors.surface }, contentStyle]}>
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
            className="border-[0.5px]"
            onPress={onEdit}
            activeOpacity={1}
            style={{
              borderColor: colors.hairline,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.border,
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

import AppModal, {
  SHEET_TOP_RADIUS_LARGE,
} from "@/shared/components/AppModal";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EditProfileForm, {
  EditProfileFormSkeleton,
} from "@/features/profile/components/EditProfileForm";
import { hydrateProfileForm } from "@/features/profile/utils/hydrateProfileForm";
import { useQueryClient } from "@tanstack/react-query";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { colors, gradients, onMediaAt, isLight } from "../../../shared/theme/colors";
import {
  glassFallback,
  glassFallbackFill,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "../../../shared/theme/glass";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import { plainBlurTint } from "@/shared/theme/blur";

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
        backgroundColor: colors.hairlineSoft,
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
      // FilterModal ile aynı gerekçe: tam ekrana yakın açılan sheet'te üst
      // köşeler bir tık daha yuvarlak.
      cornerRadius={SHEET_TOP_RADIUS_LARGE}
    >
      {children}
    </AppModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  useRenderCount("ProfileScreen");
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { user } = useAppSelector((s) => (s as any).auth);
  // Tier'ın tek kaynağı — uygulamadaki diğer premium kapılarıyla aynı hook.
  const {
    isPremium: subscriptionIsPremium,
    resolved: subscriptionStatusResolved,
  } = usePremiumTier();
  const syncPending = useAppSelector(selectSyncPending);
  const insets = useSafeAreaInsets();

  // NOT: header'daki logo sekme şeridine yerini bıraktığı için buradaki
  // `swipeFillRatio` hesabı (WaveFillLogo'nun dolgu seviyesi) kaldırıldı —
  // ekranın `useSwipeStats()` aboneliğinin tek tüketicisi oydu.
  //
  // NOT: abonelik durum makinesi (`useSubscriptionView`) ve "aktivasyon
  // sürüyor" durumundaki manuel `/status` + `/sync` yenilemesi (`handleRetrySync`)
  // buradan kaldırıldı — ikisinin de tek tüketicisi silinen üyelik kartıydı.
  // Bu ekranın abonelik durumundan hâlâ okuduğu tek şey `showMembershipCard`
  // bayrağı. Durumun ayrıntılı hâli (plan rozeti, yenileme tarihi, aboneliği
  // yönet) plus sayfasında duruyor.

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // ── Sekmeler: profil ↔ plus ───────────────────────────────────────────────
  // Header'da logonun yerinde duran şerit bir PAGER sürüyor (Beğeniler ve
  // Mesajlar ekranlarındaki kurulumun aynısı): "plus" bir modal DEĞİL, sayfanın
  // yanındaki ikinci sayfa. Uygulamadaki tüm paywall girişleri buraya bakıyor
  // (bkz. features/profile/litPlusEntry).
  const pagerRef = useRef<PagerView>(null);
  // Ekran, bekleyen bir "plus'ı aç" isteğiyle mount olduysa DOĞRUDAN o sayfada
  // doğuyor. `setPage` ile çevirmek yerine `initialPage`: mount anında pager
  // henüz yerleşmediği için programatik sayfa değişimi yutulabiliyor, üstelik
  // kullanıcı bir kare profil sayfasını görürdü. Lazy sekme ilk kez bu istekle
  // mount olduğunda geçerli olan yol bu.
  const [initialTabIndex] = useState(() => (consumeLitPlusRequest() ? 1 : 0));
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTabIndex === 1 ? "plus" : "profile",
  );
  const tabs = useMemo(
    () => [
      { key: "profile", label: t("profile.tabs.profile") },
      { key: "plus", label: t("profile.tabs.plus") },
    ],
    [t],
  );
  // Pager'ın anlık konumu (0 → 1, tam sayı değil): alt çizgiyi ve zemin
  // gradyanının açılışını bu sürüyor.
  const pagerOffset = useSharedValue(0);
  const pagerScrollHandler = usePagerScrollHandler({
    onPageScroll: (e: any) => {
      "worklet";
      pagerOffset.value = e.position + e.offset;
    },
  });
  // Sekme state'i pager DURUNCA yazılıyor — gerekçe usePagerTabCommit'te.
  const commitPage = useCallback(
    (index: number) => setActiveTab(index === 1 ? "plus" : "profile"),
    [],
  );
  const pagerCommitHandlers = usePagerTabCommit(commitPage);
  // Katalog fetch'inin kapısı: kullanıcı plus sayfasına BİR KEZ geçtiyse.
  // `onPageSelected` parmak yarıyı geçince fire ediyor, yani veri kayma
  // biterken yolda oluyor; sekmeye hiç girilmezse hiç istek atılmıyor.
  const [plusVisited, setPlusVisited] = useState(initialTabIndex === 1);
  const handlePageSelected = useCallback(
    (e: any) => {
      if (e?.nativeEvent?.position === 1) setPlusVisited(true);
      pagerCommitHandlers.onPageSelected(e);
    },
    [pagerCommitHandlers],
  );
  const handleTabChange = useCallback((_key: string, index: number) => {
    // Şeride basmak doğrudan setState ETMİYOR: pager'a sayfa değiştirmesini
    // söylüyor, sekme state'i pager'ın kendi olaylarından dönüyor.
    pagerRef.current?.setPage(index);
  }, []);
  /** Sayfadaki upsell / üyelik kartından paywall'a. */
  const goToPlusPage = useCallback(() => {
    setPlusVisited(true);
    pagerRef.current?.setPage(1);
  }, []);

  // Ekran ZATEN mount ise (sekme daha önce açılmış) paywall isteği buradan
  // geliyor: pager yerleşmiş durumda, sayfa animasyonla çevriliyor.
  useEffect(
    () =>
      uiBus.on(LIT_PLUS_EVENT, () => {
        if (!consumeLitPlusRequest()) return;
        setPlusVisited(true);
        pagerRef.current?.setPage(1);
      }),
    [],
  );

  // Plus sayfasının kendi scroll'u — header'ın progressive blur'u hangi sayfa
  // öndeyse onu okusun (tek `scrollY` paylaşılsaydı sekme değişiminde diğer
  // sayfanın offset'i header'a sızardı).
  const plusScrollY = useSharedValue(0);
  const headerScrollY = useDerivedValue(() =>
    pagerOffset.value < 0.5 ? scrollY.value : plusScrollY.value,
  );

  // Zemin İKİ SAYFADA DA aynı: kökün `colors.bg`i. Bir süre plus sayfasının
  // arkasında pager'ın konumundan açılan bir gradyan vardı — kaldırıldı,
  // sayfanın zemini artık uygulamanın kendi kâğıdı (koyuda siyah, açıkta beyaz).
  // `pagerOffset` duruyor: sekme şeridinin alt çizgisini hâlâ o sürüyor.

  // ── Modal visibility state (declarative) ───────────────────────────────────
  const [editVisible, setEditVisible] = useState(false);
  // Skeleton modal açılır açılmaz görünür (full size, içerik dolu hissi).
  // Heavy form mount'u rAF ile bir sonraki vsync'e ertelenir → modal slide-up
  // animasyonu skeleton'la başlar, JS thread serbest kaldığında form mount
  // edilip skeleton swap edilir.
  const [editFormReady, setEditFormReady] = useState(false);
  // Tamamlama accordion'ından açıldıysa formun hangi bölüme kaydırılacağı
  // (metric.key ↔ EditProfileForm'daki bölüm anahtarı). Normal "Düzenle"
  // butonundan açılışta null → scroll yok.
  const [editFocusSection, setEditFocusSection] = useState<string | null>(null);
  // Moderasyon bildiriminden gelindiyse vurgulanacak fotoğrafın id'si
  // (`relatedEntityId`). Kararın hangi fotoğrafa ait olduğunu göstermek için;
  // birkaç saniye sonra kendiliğinden sönüyor (aşağıdaki efekt).
  const [highlightPhotoId, setHighlightPhotoId] = useState<string | null>(null);
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
  // TEK KAYNAK: abonelik slice'ı (`/status` + hub + `/sync`). Kısa bir süre
  // burada `/stats` ve profil bayrağı da OR'lanıyordu, çünkü slice sahada
  // yanlış cevap veriyordu — sebebi bu ekran değil `selectIsPremium`in tarih
  // ayrıştırmasıydı (backend `expiresAt`'i offset'siz yolluyor, UTC+3'te 3 saat
  // geçmiş okunuyordu; bkz. shared/utils/backendDate). O düzelince üç kaynağı
  // yan yana tutmanın anlamı kalmadı: aynı soruya üç cevap, hangisinin
  // bayatladığını kimsenin bilmediği bir sistem demekti.
  //
  // Profil bayrağı YALNIZ ilk boyamada, backend henüz hiç konuşmamışken vekil:
  // slice persist edilmiyor, reload'da premium kullanıcı da bir an `false`
  // doğuyor. `statusResolvedAt` "cevap geldi mi"yi "cevap hayır mı"dan ayırıyor.
  const isPremium = subscriptionStatusResolved
    ? subscriptionIsPremium
    : subscriptionIsPremium || myProfile?.isPremium === true;
  // "Aktivasyon sürüyor" kartı üyelik kartının bir hâli ama `syncPending`
  // doğruyken `isPremium` YANLIŞ olabiliyor: reload'da slice persist edilmiyor,
  // kalıcı MMKV kaydından yalnız `syncPending` geri geliyor (bkz.
  // `hydrateSyncPending`). Kartı `isPremium`e bağlamak, tam da parasını ödemiş
  // ve backend'in henüz göremediği kullanıcıya reload sonrası UPSELL
  // gösteriyordu.
  const showMembershipCard = isPremium || syncPending;
  const [hobbyMap, setHobbyMap] = useState({});
  const [hobbyGroups, setHobbyGroups] = useState([]);
  const [smokingOptions, setSmokingOptions] = useState([]);
  const [zodiacOptions, setZodiacOptions] = useState([]);
  const [relationshipIntentOptions, setRelationshipIntentOptions] = useState([]);
  const [languageOptions, setLanguageOptions] = useState([]);
  const [petOptions, setPetOptions] = useState([]);
  const [alcoholOptions, setAlcoholOptions] = useState([]);
  const [religiousViewOptions, setReligiousViewOptions] = useState([]);
  const [genderCategories, setGenderCategories] = useState([]);
  const qc = useQueryClient();

  // ── Genel UI ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  // Hata ekranı dururken arkada bir deneme uçuyor mu. `loading`'den AYRI: o
  // skeleton'ı çiziyor, bu yalnız "Tekrar dene" butonundaki spinner'ı.
  const [retrying, setRetrying] = useState(false);
  // Son çekim düştü mü — focus/foreground tazelemesi bunu okur. State DEĞİL ref:
  // dinleyicilerin closure'ı mount'ta kuruluyor, güncel değeri senkron okumalı.
  const loadFailedRef = useRef(false);
  // Aynı anda birden çok tetikleyici düşebiliyor (focus + foreground + kullanıcı
  // "Tekrar dene"si) — istek çiftlenmesin.
  const loadInFlightRef = useRef(false);
  // setMyProfile'ın tüm çağıranlarını izleyen ayna; yukarıdaki dinleyiciler
  // elimizde veri olup olmadığını state'ten okuyamıyor.
  const myProfileRef = useRef(null);
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
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);

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
  // `silent`: ekranda ZATEN bir şey duruyor (dolu profil ya da hata ekranı) —
  // tazeleme onu skeleton'a düşürmemeli. Skeleton yalnız gerçekten ilk yükleme
  // içindir; hata ekranından yapılan her deneme (focus/foreground/"Tekrar dene")
  // sessizdir, geri bildirim butondaki spinner'dan gelir.
  const loadProfile = useCallback(async ({ silent = false } = {}) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    const hasData = myProfileRef.current != null;
    if (!silent && !hasData) setLoading(true);
    // Sessiz + veri yok = hata ekranı duruyor demektir; deneme görünsün.
    else if (!hasData) setRetrying(true);
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
        relationshipIntentRes,
        languagesRes,
        petsRes,
        alcoholRes,
        religiousViewsRes,
        gendersRes,
      ] = await Promise.all([
        profileService.getMyProfile(),
        // Statik enum listeleri → staticGet (oturum-boyu tek fetch, ekranlar-arası
        // paylaşımlı). cities BURADA ÇEKİLMİYOR: edit formunda şehir/ilçe seçici
        // kalmadı (konum backend'de koordinattan türetiliyor); şehir listesi
        // yalnızca Discover filtresinin premium "şehir tercihi" seçicisinde
        // kullanılıyor ve orada useCities ile ayrıca çekiliyor.
        safe("hobbies", staticGet(API_ENDPOINTS.GET_HOBBIES)),
        safe("smoking", staticGet(API_ENDPOINTS.GET_SMOKING_STATUSES)),
        safe("zodiacs", staticGet(API_ENDPOINTS.GET_ZODIACS)),
        // usage-purposes ARTIK ÇEKİLMİYOR: alan üründen çıktı, endpoint boş
        // liste dönüyor.
        safe(
          "relationshipIntents",
          staticGet(API_ENDPOINTS.GET_RELATIONSHIP_INTENTS),
        ),
        safe("languages", staticGet(API_ENDPOINTS.GET_LANGUAGES)),
        safe("pets", staticGet(API_ENDPOINTS.GET_PETS)),
        // Alkol listesi keşif filtresinde de kullanılıyor (useAlcoholUsages);
        // staticGet oturum-boyu tek fetch yaptığı için iki ekran aynı isteği
        // paylaşıyor, burada ikinci bir istek doğmuyor.
        safe("alcohol", staticGet(API_ENDPOINTS.GET_ALCOHOL_USAGES)),
        safe("religiousViews", staticGet(API_ENDPOINTS.GET_RELIGIOUS_VIEWS)),
        // Cinsiyet kategorileri — EditProfileForm'daki cinsiyet picker'ı için.
        // RegisterStep7 aynı endpoint'i useGenders ile çekiyor; liste tek kaynak.
        safe("genders", staticGet(API_ENDPOINTS.GET_GENDERS)),
      ]);

      setMyProfile(profile);
      // Boş gövde de başarısızlık sayılır: aşağıdaki render `myProfile`
      // yoksa hata durumuna düşüyor, bayrak da onunla aynı fikirde olmalı
      // ki görünürlük tazelemesi yeniden denesin.
      loadFailedRef.current = !profile;

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
      if (relationshipIntentRes?.result)
        setRelationshipIntentOptions(relationshipIntentRes.result);
      if (languagesRes?.result) setLanguageOptions(languagesRes.result);
      if (petsRes?.result) setPetOptions(petsRes.result);
      if (alcoholRes?.result) setAlcoholOptions(alcoholRes.result);
      if (religiousViewsRes?.result)
        setReligiousViewOptions(religiousViewsRes.result);
      if (gendersRes?.result) setGenderCategories(gendersRes.result);
    } catch (e) {
      // Yalnız `getMyProfile()` buraya düşebilir (enum listeleri safe() ile
      // sarılı) — en sık sebebi yavaş ağda 30 sn'lik istek timeout'u.
      // ÖNCESİ: hata sadece loglanıp `loading` false'a çekiliyordu; ekran boş
      // bir profil gibi çiziliyordu ve bu sekme lazy mount'tan sonra mount
      // kaldığı için mount effect'i bir daha koşmuyordu — uygulama yeniden
      // başlatılmadan onarılamıyordu. Artık bayrak kalkıyor: hata ekranı +
      // aşağıdaki görünürlük tazelemesi.
      console.error("Profile load error:", e);
      loadFailedRef.current = true;
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Dinleyicilerin okuduğu ayna — setMyProfile'ın hangi yoldan çağrıldığı
  // fark etmez (ilk yükleme, foto yenileme, form kaydı).
  useEffect(() => {
    myProfileRef.current = myProfile;
  }, [myProfile]);

  // Düşen yükleme kendi kendini onarsın. Tetikleyiciler LikesScreen'deki
  // görünürlük tazelemesiyle aynı:
  //   focus      → başka sekmeden Profil'e dönüldü
  //   foreground → Profil ZATEN odaktayken arka plana atılıp geri dönüldü;
  //                bu durumda 'focus' event'i hiç çıkmaz
  // Kullanıcı sekmeden hiç çıkmadan ağın düzelmesini bekliyorsa tek yol hata
  // ekranındaki "Tekrar dene" — ikisi bu yüzden birlikte duruyor.
  useEffect(() => {
    const retryIfFailed = () => {
      if (!loadFailedRef.current) return;
      // HER ZAMAN sessiz. Elde veri yoksa bile: ekranda hata durumu duruyor ve
      // skeleton'a düşmek onu bir saniyeliğine yanıp sönen bir geçişe çeviriyor
      // (başka sekmeden Profil'e her dönüşte + her foreground'da). Deneme
      // butondaki spinner'dan görünür; sonuç ya profil ya aynı hata ekranı.
      loadProfile({ silent: true });
    };
    const unsubscribeFocus = navigation.addListener("focus", retryIfFailed);
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") retryIfFailed();
    });
    return () => {
      unsubscribeFocus();
      appStateSub.remove();
    };
  }, [navigation, loadProfile]);

  const handleRetryLoad = useCallback(() => {
    // Otomatik denemeyle aynı gerekçe: kullanıcı butona bastığında ekran
    // skeleton'a düşüp hataya geri dönmesin. Geri bildirim butonun spinner'ı.
    loadProfile({ silent: true });
  }, [loadProfile]);

  // Premium geçişinde profili tazele — İKİ YÖNDE de. Doküman §9: aktivasyon
  // sonrası `GetMyProfile` de invalidate edilmeli — rozet + premium-scoped
  // alanlar free scope'ta çekilmiş kalıyordu. myProfile react-query'de değil
  // local state'te, bu yüzden PurchaseModal'ın refetchPremiumScoped'u buraya
  // ulaşmıyor.
  //
  // true→false yönü hub `SubscriptionChanged`/`admin_revoke` için ŞART: elde
  // premium scope'ta çekilmiş bayat bir profil kalıyordu. Kartın hangi kartı
  // çizeceği bu turu BEKLEMİYOR (yukarıdaki `isPremium` redux'a bakıyor) —
  // burada tazelenen, profilin premium'a göre değişen alanları.
  const prevPremiumRef = useRef(subscriptionIsPremium);
  useEffect(() => {
    if (prevPremiumRef.current === subscriptionIsPremium) return;
    prevPremiumRef.current = subscriptionIsPremium;
    // Sessiz: ekranda zaten dolu bir profil var, geçiş sonrası tazeleme onu
    // skeleton'a düşürmemeli.
    loadProfile({ silent: true });
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
    const photos = [...(myProfile.photosList || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(resolvePhotoUri)
      .filter(Boolean);
    return {
      userId: user?.userId,
      displayName: myProfile.displayName || user?.displayName,
      // isPremium ile aynı gerekçe: bu kart "karşı taraf ne görüyor" önizlemesi.
      // Yaş gizlendiyse önizlemede de görünmemeli. Kart age==null'da ", 23"
      // ekini hiç çizmiyor, ayrı bir bayrak geçmeye gerek yok.
      age:
        myProfile.showAge === false
          ? null
          : myProfile.user?.age || user?.age,
      photos,
      // Hero rozetiyle aynı kaynak: backend flag'i webhook gecikmesinde stale
      // kalabiliyor, redux entitlement'ı öne alıyoruz (bkz. selectIsPremium).
      // Ama bu kart "karşı taraf ne görüyor" önizlemesi: rozet gizlendiyse
      // burada da yanmamalı (gerçek kartta backend zaten isPremium=false yolluyor).
      // Hero rozeti bundan etkilenmez — kullanıcı kendi premium'unu hep görür.
      isPremium: isPremium && myProfile.showPremiumBadge !== false,
      universityName: myProfile.user?.universityName || user?.universityName,
      // Kart ADI display'den basıyor; ham alan (Türkçe resmî ad) yalnız
      // fallback olarak yukarıda duruyor.
      universityNameDisplay:
        myProfile.user?.universityNameDisplay || user?.universityNameDisplay,
      showUniversity: myProfile.showMyUniversity !== false,
      departmentDisplay:
        myProfile.departmentDisplay || String(myProfile.department ?? ""),
      yearOfStudy: myProfile.yearOfStudy,
      yearOfStudyDisplay: myProfile.yearOfStudyDisplay,
      prompts: myProfile.prompts,
      // Geçiş fazı: kart, prompt'u olmayan profilde bio'ya düşüyor. Önizleme
      // gerçek kartla aynı alanları almalı, yoksa kullanıcı kendi kartında
      // olmayan/olan bir bölüm görür.
      bio: myProfile.bio,
      hobbies: resolveHobbies(myProfile.hobbies),
      smokingStatusDisplay: myProfile.smokingStatusDisplay,
      zodiacSignDisplay: myProfile.zodiacSignDisplay,
      relationshipIntentDisplay: myProfile.relationshipIntentDisplay,
      // enumName de geçiyor: kart niyet etiketini ÖNCE yerel haritadan basıyor
      // (backend display'i İngilizce dönebiliyor) ve bölüm gradyanını da bu
      // anahtara göre seçiyor. Eksikken önizleme hep kırmızı fallback'e düşüp
      // gerçek karttan farklı görünüyordu.
      relationshipIntent: myProfile.relationshipIntent,
      // Alkol kartın yaşam tarzı pill'lerinde gösteriliyor; önizleme kartı
      // gerçek kartla aynı alanları almalı, yoksa kullanıcı kendi profilini
      // eksik görür.
      alcoholUsageDisplay: myProfile.alcoholUsageDisplay,
      // Boy da yaşam tarzı pill'lerinde — alkolle aynı gerekçe. Kart aralık
      // dışı/eksik değerde pill'i hiç çizmiyor, burada temizlemeye gerek yok.
      height: myProfile.height,
      // isPremium/age ile aynı gerekçe: bu kart "karşı taraf ne görüyor"
      // önizlemesi. Konum gizliyse gerçek kartta backend bu alanları null
      // gönderiyor, önizleme de aynısını yapmalı — yoksa kullanıcı ayarı
      // açtığını sanıp konumunu kartında görmeye devam eder ve "çalışmıyor"
      // diye geri döner. Profil ekranının KENDİ konum satırı (EditProfileForm)
      // bundan etkilenmez, kullanıcı kendi konumunu her zaman görür.
      cityDisplay:
        myProfile.showLocation === false ? null : myProfile.cityDisplay,
      districtDisplay:
        myProfile.showLocation === false ? null : myProfile.districtDisplay,
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
  // Hedef bölüm, sheet present animasyonu bitene kadar beklemede tutulur; forma
  // ancak onPresented'da prop olarak verilir. Sebep: gorhom sheet snap'lenene
  // kadar içerideki scrollable'ı LOCKED tutup offset'ini 0'a resetliyor, yani
  // animasyon sırasında yapılan scrollTo yutuluyor. İlk açılışta form ağır
  // mount olduğu için gecikme kendiliğinden animasyonu aşıyordu ve scroll
  // çalışıyordu; ısınmış (stage 4) reopen'larda form anında mount olduğu için
  // scroll animasyonun ortasına düşüp kayboluyordu.
  const pendingFocusSectionRef = useRef<string | null>(null);
  const openEditProfile = useCallback((section = null) => {
    // onPress handler'ı olarak da bağlı → argüman press event'i olabilir.
    pendingFocusSectionRef.current =
      typeof section === "string" ? section : null;
    setEditFocusSection(null);
    setEditVisible(true);
    if (hasOpenedEditOnceRef.current) setEditFormReady(true);
    hasOpenedEditOnceRef.current = true;
  }, []);
  const closeEditProfile = useCallback(() => {
    setEditVisible(false);
    pendingFocusSectionRef.current = null;
    setEditFocusSection(null);
    setHighlightPhotoId(null);
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
      relationshipIntentOptions,
      languageOptions,
      petOptions,
      alcoholOptions,
      religiousViewOptions,
    });
  }, [
    myProfile,
    hobbyGroups,
    smokingOptions,
    zodiacOptions,
    relationshipIntentOptions,
    languageOptions,
    petOptions,
    alcoholOptions,
    religiousViewOptions,
  ]);

  // Form mount'u için tetikleyiciler:
  //   1. onPresented (gorhom onChange ≥0) — animasyon bitince fire eder
  //   2. Veri-hazırlık koşulu — initial values + hobby listesi dolduğunda
  // İkisi de true olduğunda skeleton swap edilir. setTimeout fallback'i artık
  // YOK: yarım hidrate form mount etmek crash riskini geri getiriyordu.
  // onChange(index>=0) → sheet snap'lendi. Form mount'unu serbest bırakmanın
  // yanında bekleyen bölüm scroll'unu da burada tetikliyoruz: forma focusSection
  // ancak şimdi düşer, EditProfileForm'daki scroll effect'i de bu prop değişimiyle
  // (her açılışta yeniden) çalışır.
  const handleEditPresented = useCallback(() => {
    setEditFormReady(true);
    if (pendingFocusSectionRef.current) {
      setEditFocusSection(pendingFocusSectionRef.current);
    }
  }, []);
  useEffect(() => {
    if (!editVisible) return;
    if (!editInitialValues) return;
    if (hobbyGroups.length === 0) return;
    setEditFormReady(true);
  }, [editVisible, editInitialValues, hobbyGroups.length]);

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
      // Navigator'daki görünürlük kapısı da bu profili okuyor; foto eklenince
      // kapının kapanması için haber veriyoruz (cache zaten tazelendi).
      uiBus.emit('profileDirty');
    } catch (e) {
      console.error("Profil yenileme hatası:", e?.message);
    }
  };

  // Keşif havuzunda mıyız — foto silme tabanı ve kapının metni buradan okunuyor.
  const profileVisibility = useMemo(
    () => normalizeProfileVisibility(myProfile),
    [myProfile],
  );

  /** Foto/profil akışına özel UT kodu → gösterilecek metin (yoksa null). */
  const photoErrorText = (e: any): string | null => {
    const data = e?.response?.data;
    const code = data?.code ?? data?.errorCode ?? null;
    const key = photoModerationCodeKey(code);
    if (key) {
      return t(key, {
        max: MAX_PROFILE_PHOTOS,
        min: resolveRequiredPhotoCount(profileVisibility),
      });
    }
    return null;
  };

  const uploadPickedPhoto = async (picked: PickedPhoto) => {
    const file = {
      uri: picked.uri,
      type: picked.mime,
      name: picked.fileName,
    };

    setSavingPhoto(true);
    try {
      // Sonradan eklenen foto ANA FOTOĞRAFLA karşılaştırılıyor. Farklı bir
      // kişininki Review'a düşer ama istek yine 200 döner — bu yüzden başarı
      // yolunda da sonucu okuyup kullanıcıya durumu söylüyoruz.
      const { photos } = await profileService.updateProfile({
        NewPhotos: [file],
      });
      await refreshPhotos();
      // Kararı listeye ANINDA işliyoruz: rozet + karartma aşağıdaki uyarıyla
      // aynı anda görünsün, düzenleme modalı kapanıp açılmayı beklemesin.
      applyModerationFromResponse(photos);

      // Foto artık sunucuda; yerel kopya bu andan itibaren ölü ağırlık.
      // (Kayıt akışı bunu YAPMAZ — orada yollar submit'e kadar redux'ta.)
      forgetPhoto(picked.uri);

      const summary = summarizeModeration(photos);
      if (summary) Alert.alert(summary.title, summary.message);
    } catch (e) {
      console.error(
        "Fotoğraf yükleme hatası:",
        e?.response?.data || e?.message,
      );
      // Foto tavanı (UT-6203) ve sağlayıcı erişilemez (UT-6206) artık sunucudan
      // ayırt edilebilir kodla geliyor — jenerik "yüklenemedi" yerine sebep.
      Alert.alert(
        t('common.error'),
        photoErrorText(e) ?? t('profile.photos.uploadError'),
      );
    } finally {
      setSavingPhoto(false);
    }
  };

  const addPhotoFromGallery = async () => {
    // Kayıt akışıyla aynı 3:4 crop'lu seçim. Galeri İZNİ SORULMUYOR: seçim
    // PHPicker'da, yani süreç dışında yapılıyor.
    let picked: PickedPhoto[];
    try {
      picked = await pickAndCropPhotos(1);
    } catch (e: any) {
      devLog("Galeri seçimi hatası:", e);
      return;
    }
    if (picked.length === 0) return;
    await uploadPickedPhoto(picked[0]);
  };

  const addPhotoFromCamera = async () => {
    let picked: PickedPhoto | null;
    try {
      picked = await captureAndCropPhoto();
    } catch (e: any) {
      if (e?.code === "E_NO_CAMERA_PERMISSION") {
        // İzin bir daha sorulamıyorsa tek çıkış Ayarlar.
        Alert.alert(
          t('profile.permissions.title'),
          t('profile.permissions.cameraMessage'),
          e?.canAskAgain === false
            ? [
                { text: t('common.cancel'), style: "cancel" },
                { text: t('profile.permissions.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
              ]
            : undefined,
        );
      }
      return;
    }
    if (!picked) return;
    await uploadPickedPhoto(picked);
  };

  // Kaynak seçimi — kayıt akışıyla ortak PhotoSourceSheet.
  const handleAddPhoto = () => {
    // 6 tavanı bu uçta backend'de KONTROL EDİLMİYOR (bkz. MAX_PROFILE_PHOTOS):
    // istek 200 döner, profil 7 fotoğrafa çıkar ve sıralama kaydetme
    // NewOrder Range(1,6) doğrulamasına takılıp bozulur. Tek savunma burası.
    if ((myProfile?.photosList?.length ?? 0) >= MAX_PROFILE_PHOTOS) {
      Alert.alert(
        t('profile.photos.limitTitle'),
        t('profile.photos.limitMessage', { max: MAX_PROFILE_PHOTOS }),
      );
      return;
    }
    setSourceSheetOpen(true);
  };

  /**
   * Reddedilen fotoğrafa itiraz. Buton görünürlüğü tamamen sunucunun
   * `isAppealable`'ına bağlı — "terminal red mi", "zaten itiraz edildi mi",
   * "karar veremedik durumu mu" kurallarının hepsi o alanda.
   */
  /**
   * Tek fotoğrafın moderasyon bloğunu YEREL olarak yamalar.
   *
   * Gerekçe (rehber §12.1): `GetMyProfile` itiraz durumunu taşımıyor —
   * `appealState` her zaman `None`, `isAppealable` her zaman `true` geliyor.
   * İtirazdan sonra `refreshPhotos()` çağırmak, kullanıcıya itiraz butonunu
   * GERİ getiriyor ve ikinci basışta 409 üretiyordu.
   */
  const patchPhotoModeration = (photoId, patch) => {
    setMyProfile((prev) => {
      if (!prev?.photosList) return prev;
      return {
        ...prev,
        photosList: prev.photosList.map((p) =>
          p?.photoId === photoId
            ? { ...p, moderation: { ...normalizePhotoModeration(p), ...patch } }
            : p,
        ),
      };
    });
  };

  /**
   * Yükleme/güncelleme YANITINDAKİ moderasyon bloklarını listeye yamalar.
   *
   * Gerekçe: karar zaten PUT yanıtında geliyor (uyarıyı da o besliyor) ama
   * hemen ardından çekilen `GetMyProfile` bunu bir tık geriden yansıtabiliyor —
   * o pencerede kullanıcı "incelemeye alındı" uyarısını görüyor, kutuda ise
   * rozet/karartma yok. Yanıt tazeliğin ALT sınırı olduğu için üstüne yazmak
   * güvenli; listede olmayan foto sessizce atlanıyor.
   */
  const applyModerationFromResponse = (photos: PhotoModeration[]) => {
    const byId = new Map(
      (photos ?? [])
        .filter((p) => p?.photoId != null)
        .map((p) => [String(p.photoId), p]),
    );
    if (byId.size === 0) return;
    setMyProfile((prev) => {
      if (!prev?.photosList) return prev;
      return {
        ...prev,
        photosList: prev.photosList.map((p) => {
          const fresh = byId.get(String(p?.photoId));
          if (!fresh) return p;
          return { ...p, moderation: { ...normalizePhotoModeration(p), ...fresh } };
        }),
      };
    });
  };

  const handleAppealPhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      const { appealState } = await profileService.appealPhoto(photoId);
      // 1) Optimistik: buton ANINDA kapanıyor.
      patchPhotoModeration(photoId, { appealState, isAppealable: false });
      // 2) Kanonik doğrulama tek fotoğraf ucundan (profil yanıtı bu alanı
      //    taşımıyor). Başarısız olursa optimistik hâl kalır — 409 yolu
      //    zaten aynı sonucu veriyor.
      try {
        const fresh = await profileService.getPhoto(photoId);
        if (fresh) patchPhotoModeration(photoId, normalizePhotoModeration(fresh));
      } catch {}
      Alert.alert(
        t('profile.photoModeration.appealSentTitle'),
        t('profile.photoModeration.appealSentMessage'),
      );
    } catch (e) {
      const data = e?.response?.data;
      const code = data?.code ?? data?.errorCode ?? null;
      // UT-6305 (409) = zaten itiraz var / itiraz edilemez. Bu bir HATA DEĞİL:
      // kullanıcı istediği şeyin zaten yapılmış olduğunu öğreniyor. Sessizce
      // butonu kapatıyoruz, uyarı göstermiyoruz (rehber §12.1). Geçiş
      // penceresinde eski UT-6205 de aynı anlama geliyor.
      if (isPhotoAppealConflict(code)) {
        patchPhotoModeration(photoId, {
          appealState: 'Pending',
          isAppealable: false,
        });
      } else {
        Alert.alert(
          t('common.error'),
          photoErrorText(e) ?? t('profile.photoModeration.appealError'),
        );
      }
    } finally {
      setSavingPhoto(false);
    }
  };

  const handlePhotoPress = (photo) => {
    const isMain = photo.isMainPhoto;
    const {
      status,
      reasonCode,
      reasonText,
      isVisibleToOthers,
      isAppealable,
      appealState,
    } = normalizePhotoModeration(photo);

    // İtiraz beklemede: ne "İtiraz et" ne "Değiştir" gösteriliyor (rehber §10).
    // Silme itiraz hakkını da götürürdü; karar çıkana kadar dokunulmuyor.
    if (appealState === 'Pending') {
      Alert.alert(
        t('profile.photoModeration.appealPendingTitle'),
        t('profile.photoModeration.appealPendingMessage'),
        [{ text: t('common.ok') }],
      );
      return;
    }

    const options = [];

    // "Düzenle" yalnız YAYINDA olan fotoğrafta. İncelemedeki ya da reddedilen
    // bir fotoğrafı yeniden kırpmak aynı karara geri düşer — orada kullanıcıya
    // yardım eden eylem "Değiştir".
    if (isVisibleToOthers)
      options.push({
        text: t('profile.photos.edit'),
        onPress: () => handleRecropPhoto(photo),
      });

    // Yalnızca yayında olan bir foto ana foto yapılabilir: gizli bir fotoğraf
    // ana foto olursa profil kartı boş görünür (rehber §3c). Kapı sunucunun
    // görünürlük kararı — status'tan TÜRETİLMİYOR.
    if (!isMain && isVisibleToOthers)
      options.push({
        text: t('profile.photos.setMain'),
        onPress: () => handleSetMainPhoto(photo.photoId),
      });

    if (isAppealable)
      options.push({
        text: t('profile.photoModeration.appeal'),
        onPress: () => handleAppealPhoto(photo.photoId),
      });

    options.push({
      // Rejected'ta kullanıcının yapması gereken bir şey VAR → "Değiştir".
      // Review/Pending'de yok, o yüzden orada normal "Sil" kalıyor.
      // (Reddedilen foto S3'te 30 gün tutuluyor ve tavana sayılıyor — silmek
      // doğru davranış.)
      text: requiresUserAction(status)
        ? t('profile.photoModeration.replace')
        : t('profile.photos.delete'),
      style: "destructive",
      // İtiraz hakkı varken silmek o hakkı da götürüyor (foto S3'ten kalkınca
      // itiraz edilecek kayıt kalmaz) — rehber §10, onayda söylüyoruz.
      onPress: () =>
        isAppealable
          ? Alert.alert(
              t('profile.photoModeration.removeWarningTitle'),
              t('profile.photoModeration.removeWarningMessage'),
              [
                { text: t('common.cancel'), style: "cancel" },
                {
                  text: t('profile.photos.delete'),
                  style: "destructive",
                  onPress: () => handleDeletePhoto(photo.photoId),
                },
              ],
            )
          : handleDeletePhoto(photo.photoId),
    });
    options.push({ text: t('common.cancel'), style: "cancel" });

    Alert.alert(
      isVisibleToOthers
        ? t('profile.photos.title')
        : moderationReasonTitle(status, reasonCode),
      isVisibleToOthers
        ? ""
        : moderationReasonText(status, reasonCode, reasonText),
      options,
    );
  };

  const handleSetMainPhoto = async (photoId) => {
    // Ana foto değişimi doğrulama rozetini düşürüyor — önce sor (rehber §5).
    if (!(await confirmMainPhotoChange(myProfile))) return;
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
    // Backend minimum foto şartını 400 + `UT-6204` ile uyguluyor; catch bloğu
    // jenerik "silinemedi" gösterdiği için kullanıcı sebebi göremiyordu. Önden
    // kesip ne yapması gerektiğini söylüyoruz (önce yeni foto ekle).
    //
    // Taban artık SABİT DEĞİL: sunucunun `requiredPhotoCount`'u. Kural
    // değişirse istemci kendiliğinden doğru davranır.
    const minPhotos = resolveRequiredPhotoCount(profileVisibility);
    if ((myProfile?.photosList?.length ?? 0) <= minPhotos) {
      Alert.alert(
        t('profile.photos.minTitle'),
        t('profile.photos.minMessage', { min: minPhotos }),
      );
      return;
    }
    // Ana fotoğrafı silmek başka bir fotoğrafı otomatik ana yapıyor → rozet
    // düşer. Yan fotoğrafı silmek etkilemez, orada uyarı çıkmıyor.
    const deletingMain = myProfile?.photosList?.some(
      (p) => String(p?.photoId) === String(photoId) && p?.isMainPhoto,
    );
    if (deletingMain && !(await confirmMainPhotoChange(myProfile))) return;
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({
        PhotoIdsToDelete: [photoId],
      });
      await refreshPhotos();
    } catch (e) {
      Alert.alert(
        t('common.error'),
        photoErrorText(e) ?? t('profile.photos.deleteError'),
      );
    } finally {
      setSavingPhoto(false);
    }
  };

  /**
   * Yeni yüklenen fotoğrafı silinen fotoğrafın SIRASINA geri koyar.
   *
   * `NewPhotos` her zaman listenin SONUNA ekliyor; kullanıcı açısından
   * "düzenlediğim fotoğraf en sona atladı" bir hata gibi görünüyor. Sıra TAM
   * LİSTE olarak gönderiliyor (bkz. EditProfileForm'daki kaydetme) — kısmi
   * PhotoOrders diye bir şey yok.
   *
   * Ana fotoğraf kuralı: yalnız YAYINDA olan bir foto ana olabilir (rehber
   * §3c). Yeni kayıt incelemedeyse sırayı da değiştirmiyoruz; ilk sıraya konan
   * görünmez fotoğraf profil kartını boşaltırdı.
   */
  const restorePhotoSlot = async (list, added, slot, wasMain) => {
    const next = list.filter(
      (p) => String(p?.photoId) !== String(added.photoId),
    );
    next.splice(Math.min(slot, next.length), 0, added);
    if (next.every((p, i) => String(p?.photoId) === String(list[i]?.photoId)))
      return;

    const updates: any = {
      PhotoOrders: next.map((p, i) => ({ photoId: p.photoId, newOrder: i + 1 })),
    };
    if (wasMain) {
      if (!normalizePhotoModeration(added).isVisibleToOthers) return;
      updates.NewMainPhotoId = added.photoId;
    }

    try {
      await profileService.updateProfile(updates);
    } catch (e) {
      // BEST-EFFORT: asıl iş (yeni kırpma) zaten kaydedildi. Sıranın geri
      // konamaması yüzünden ikinci bir hata kutusu göstermiyoruz.
      devLog("Foto sırası geri konulamadı:", e);
    }
  };

  /**
   * "Düzenle" → aynı fotoğrafın çerçevesini yeniden seç.
   *
   * Sunucuda YERİNDE KIRPMA UCU YOK; tek yol yeni çıktıyı yükleyip eskisini
   * silmek. İkisi TEK istekte gidiyor: ayrı ayrı gönderilseydi arada profil ya
   * minimum foto sayısının altına düşer (önce silme) ya da tavanı aşardı
   * (önce yükleme).
   *
   * Kullanıcının göreceği kaçınılmaz sonuç: yeni kayıt yeniden moderasyondan
   * geçer. `summarizeModeration` bunu zaten söylüyor.
   */
  const handleRecropPhoto = async (photo) => {
    const uri = resolvePhotoUri(photo);
    if (!uri) return;

    const list = myProfile?.photosList ?? [];
    const slot = list.findIndex(
      (p) => String(p?.photoId) === String(photo.photoId),
    );
    const wasMain = !!photo.isMainPhoto;

    // Kaynak indirilirken de spinner dönsün: kırpma ekranı ağdan sonra açılıyor.
    setSavingPhoto(true);
    let picked: PickedPhoto | null = null;
    try {
      picked = await recropExistingPhoto(uri);
    } catch (e) {
      devLog("Yeniden kırpma hatası:", e);
    }
    // İptal (ya da indirme hatası) bir HATA DEĞİL — sessizce çıkılıyor.
    if (!picked) {
      setSavingPhoto(false);
      return;
    }

    try {
      const { photos } = await profileService.updateProfile({
        NewPhotos: [
          { uri: picked.uri, type: picked.mime, name: picked.fileName },
        ],
        PhotoIdsToDelete: [photo.photoId],
      });

      const fresh = await profileService.getMyProfile(true);
      forgetPhoto(picked.uri);

      // Yeni photoId yanıtta gelmiyor: taze listede ÖNCEDEN OLMAYAN kayıt o.
      const known = new Set(list.map((p) => String(p?.photoId)));
      const added = (fresh?.photosList ?? []).find(
        (p) => !known.has(String(p?.photoId)),
      );
      if (added && slot >= 0) {
        await restorePhotoSlot(fresh.photosList, added, slot, wasMain);
      }
      await refreshPhotos();

      const summary = summarizeModeration(photos);
      if (summary) Alert.alert(summary.title, summary.message);
    } catch (e) {
      console.error(
        "Fotoğraf düzenleme hatası:",
        e?.response?.data || e?.message,
      );
      Alert.alert(
        t('common.error'),
        photoErrorText(e) ?? t('profile.photos.editError'),
      );
    } finally {
      setSavingPhoto(false);
    }
  };

  // Hub'dan gelen moderasyon kararı (admin onay/red, rescan, itiraz sonucu) →
  // ekran mount ise anında tazele. Profil cache'ini yayıncı zaten bust etti.
  // Handler'lar ref üzerinden okunuyor: efekt bir kez bağlanıyor ama her zaman
  // GÜNCEL closure'ı çağırıyor (aksi halde ilk render'ın bayat `myProfile`ı ile
  // tavan kontrolü yapılırdı).
  const photoActionsRef = useRef({ refreshPhotos, handleAddPhoto });
  photoActionsRef.current = { refreshPhotos, handleAddPhoto };
  useEffect(
    () =>
      uiBus.on('photoModerationChanged', () => {
        photoActionsRef.current.refreshPhotos();
      }),
    [],
  );
  // Görünürlük kapısındaki "Fotoğraf ekle" CTA'sı buraya düşüyor.
  useEffect(
    () =>
      uiBus.on('addProfilePhoto', () => {
        photoActionsRef.current.handleAddPhoto();
      }),
    [],
  );

  // Moderasyon bildirimine basıldı → düzenleme modalını FOTOĞRAFLAR bölümüne aç
  // ve kararın verildiği fotoğrafı vurgula.
  //
  // İki giriş kapısı var ve ikisi de aynı isteği tüketiyor:
  //  1. Ekran zaten mount ise `openProfilePhoto` event'i,
  //  2. Push'tan cold start'ta ekran sonradan mount olduğu için mount anındaki
  //     `consumePhotoHighlight()` (uiBus isteği modülde bekletiyor).
  const applyPhotoHighlight = useRef<(photoId: string | null) => void>(() => {});
  applyPhotoHighlight.current = (photoId) => {
    if (!photoId) return;
    // Bildirimden ÖNCEKİ moderasyon durumu görünmesin.
    photoActionsRef.current.refreshPhotos();
    openEditProfile("photos");
    setHighlightPhotoId(String(photoId));
  };
  useEffect(() => {
    const unsub = uiBus.on('openProfilePhoto', () => {
      applyPhotoHighlight.current(consumePhotoHighlight());
    });
    // Mount anında bekleyen istek varsa (cold start) onu da tüket.
    applyPhotoHighlight.current(consumePhotoHighlight());
    return unsub;
  }, []);

  // Vurgu kalıcı değil: fotoğraf bulunduktan sonra halka ekranda kalırsa
  // düzenleme ekranının normal hâli gibi okunmaya başlıyor.
  useEffect(() => {
    if (!highlightPhotoId) return;
    const id = setTimeout(() => setHighlightPhotoId(null), 4500);
    return () => clearTimeout(id);
  }, [highlightPhotoId]);

  const handleAccordionToggle = (key) => {
    didAutoExpandRef.current = true;
    setExpandedSection(expandedSection === key ? null : key);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const mainPhoto = resolveMainPhotoUri(myProfile);

  const completionPct =
    myProfile?.profileCompletionPercentage ??
    myProfile?.profileCompletionScore ??
    0;

  const completionMetrics = [
    {
      key: "photos",
      title: t('profile.completion.photos'),
      icon: { sf: "camera" as SFSymbol, lucide: Camera },
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
      key: "prompts",
      title: t('profile.completion.prompts'),
      icon: { sf: "book" as SFSymbol, lucide: BookOpen },
      // ⚠️ Bu satır İSTEMCİDE hesaplanıyor (0–3), hemen üstündeki yüzde halkası
      // ise SUNUCUDAN geliyor (profileCompletionPercentage) ve İKİLİ puanlıyor:
      //
      //   prompt sayısı > 0  VEYA  bio dolu  →  +10
      //
      // Yani ikisi aynı 10 puanı PAYLAŞIYOR (geçiş fazında bio hâlâ yazılabilir,
      // ayrı puan olsaydı ikisi de dolu kullanıcıda toplam 100'ü aşardı).
      //
      // Görünür sonucu: bio'su dolu bir kullanıcı prompt eklediğinde bu satır
      // 0/3 → 1/3 ilerler ama HALKA KIPIRDAMAZ (o puanı zaten alıyordu). Aynı
      // şey fotoğraf satırında da var (6'ya kadar sayıyor, puan kademeli), yani
      // liste "yapılacaklar", halka "puan" — bilinçli olarak farklı granülerlik.
      // Backend Faz 4'te bio tarafını düşürünce ayrışma kendiliğinden kapanıyor.
      current: Math.min(
        myProfile?.prompts?.length ?? 0,
        MAX_PROFILE_PROMPTS,
      ),
      max: MAX_PROFILE_PROMPTS,
      desc: t('profile.completion.promptsDescription'),
    },
    {
      key: "smoking",
      title: t('profile.completion.smoking'),
      // forceFallback: SF Symbols'ta cigarette yok, `smoke.fill` duman bulutu.
      icon: {
        sf: "smoke" as SFSymbol,
        lucide: Cigarette,
        forceFallback: true,
      },
      current: myProfile?.smokingStatus != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.smokingDescription'),
    },
    {
      key: "zodiac",
      title: t('profile.completion.zodiac'),
      icon: { sf: "star" as SFSymbol, lucide: Star },
      current: myProfile?.zodiacSign != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.zodiacDescription'),
    },
    // "Kullanım amacı" satırı ilişki niyetiyle DEĞİŞTİ: alan üründen çıktı ve
    // doluluk formülündeki 5 puanı `relationshipIntent` devraldı. `key` aynı
    // zamanda EditProfileForm'un focusSection'ı — orada da yeniden adlandırıldı.
    {
      key: "relationshipIntent",
      title: t('profile.completion.relationshipIntent'),
      icon: { sf: "heart" as SFSymbol, lucide: Heart },
      current: myProfile?.relationshipIntent != null ? 1 : 0,
      max: 1,
      desc: t('profile.completion.relationshipIntentDescription'),
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
        <StatusBar barStyle={isLight() ? "dark-content" : "light-content"} />

        <AnimatedPagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={initialTabIndex}
          onPageScroll={pagerScrollHandler}
          // Sekme state'inin TEK kaynağı bu ikili: seçim ref'e yazılıyor, React
          // state'i ancak kayma bitince (idle) değişiyor — bkz. usePagerTabCommit.
          onPageSelected={handlePageSelected}
          onPageScrollStateChanged={pagerCommitHandlers.onPageScrollStateChanged}
        >
          <View key="profile" style={{ flex: 1 }} collapsable={false}>
            {loading ? (
              <SkeletonBody />
            ) : !myProfile ? (
              // Veri yoksa sayfayı ÇİZME: aşağıdaki bloklar `myProfile`ı null'la
              // "her alanı boş bir profil" olarak render ediyor ve kullanıcı bunu
              // ağ hatası değil veri kaybı sanıyor.
              <ProfileLoadError onRetry={handleRetryLoad} retrying={retrying} />
            ) : (
              <Animated.ScrollView
                showsVerticalScrollIndicator={false}
                contentInsetAdjustmentBehavior="never"
                contentContainerStyle={{
                  paddingTop: insets.top + 60,
                  // Floating tab bar (64) + altındaki nefes payı — son kart bar'ın
                  // hemen dibinde bitmesin.
                  paddingBottom: insets.bottom + 120,
                }}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
              >
                {/* Keşif görünürlüğü şeridi BURADA DEĞİL: düzenleme modalında,
                    Fotoğraflar bölümünün açıklamasının altında (EditProfileForm).
                    Şeridin söylediği şeyin çözümü fotoğraf grid'i — bilgiyi
                    eylemden ayrı ekranda tutmak anlamsızdı. */}

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
                        backgroundColor: colors.hairline,
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
                              backgroundColor: colors.inverseSurface,
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
                          className="border-[3px]"
                          onLayout={(e) => {
                            badgeWidthSV.value = e.nativeEvent.layout.width;
                          }}
                          style={{
                            borderColor: colors.bg,
                            backgroundColor: colors.inverseSurface,
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
                              color: colors.onInverseSurface,
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
                {/* Ölçüler EDIT_BUTTON_BOX_W'yi besliyor — birini değiştirirsen
                    sabitleri de güncelle. */}
                <View
                  style={{
                    paddingHorizontal: HERO_PAD_H,
                    paddingTop: 20,
                    paddingBottom: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: HERO_GAP,
                  }}
                >
                  <HeroAvatar
                    uri={mainPhoto}
                    size={HERO_AVATAR}
                    loading={!myProfile}
                    onPress={() => mainPhoto && setPreviewVisible(true)}
                  />

                  <View style={{ flex: 1, justifyContent: "space-between" }}>
                    {/* İsim + premium rozeti — kart başlıklarındakinin aynısı
                        (bkz. PremiumBadge). Rozet ismin devamı gibi okunsun diye
                        aradaki boşluk dar tutuluyor.
                        Hero'da yaş gösterilmiyor, rozet ismin sağına gelir. */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          flexShrink: 1,
                          color: colors.text,
                          fontSize: HERO_NAME_FONT,
                          fontWeight: "600",
                          lineHeight: HERO_NAME_LINE,
                        }}
                      >
                        {myProfile?.displayName || user?.firstName || ""}
                      </Text>
                      {isPremium && (
                        // Zemin VARSAYILAN DEĞİL: rozetin varsayılan dairesi
                        // `colors.bg` ve bu ekranın zemini de `bg` — daire
                        // orada tamamen kaybolurdu. Kart başlıklarında sorun
                        // yok, orada rozet fotoğrafın üstünde duruyor.
                        // `surface3` bir kademe ayrışan nötr ton (açık #E4E4E8,
                        // koyu #262626), render anında okunuyor.
                        <PremiumBadge
                          fontSize={HERO_NAME_FONT}
                          size={HERO_PREMIUM_BADGE_SIZE}
                          background={colors.surface3}
                        />
                      )}
                      {/* Fotoğraf doğrulama rozeti — premium rozetinden AYRI bir
                          işaret. `isSelfieVerified` bilerek `isVerified`e
                          katılmıyor; alan hiç gelmezse hiçbir şey çizilmiyor. */}
                      <SelfieVerifiedBadge
                        verified={resolveSelfieVerified(myProfile)}
                        size={HERO_VERIFIED_SIZE}
                      />
                    </View>

                    {Platform.OS === "ios" ? (
                      // iOS 26+ liquid glass — SwiftUI native Button. iOS 18'de
                      // default bordered style'a düşer (graceful degradation).
                      //
                      // matchContents HİÇBİR eksende YOK: SwiftUI ölçümü ikinci
                      // Fabric commit'inde geldiği için Host ilk frame'de 0x0 kalıyor
                      // ve hosting view içeriği bu boş çerçeveye ORTALAYARAK çiziyor —
                      // buton yarı yarıya sola, avatarın üstüne taşıyor, ölçüm gelince
                      // yerine zıplıyordu. Kutu artık iki eksende de sabit:
                      //   • Host + dıştaki frame() = EDIT_BUTTON_BOX_W x EDIT_BUTTON_H
                      //     → Yoga da SwiftUI da geometriyi İLK commit'te biliyor.
                      //   • fixedSize(horizontal) dış frame'in önerdiği genişliği
                      //     butona geçirmiyor → glass kapsül etikete göre daralıyor
                      //     (dile göre uzunluk değişebilir, sabit genişlik gerekmiyor).
                      //   • alignment "leading" → kapsül kutunun soluna yaslı, sağdaki
                      //     artık alan şeffaf ve boş.
                      <Host
                        style={{
                          marginTop: 8,
                          alignSelf: "flex-start",
                          width: EDIT_BUTTON_BOX_W,
                          height: EDIT_BUTTON_H,
                        }}
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
                            frame({ height: EDIT_BUTTON_H }),
                            fixedSize({ horizontal: true }),
                            // Border son frame'den ÖNCE: maxWidth kutusu butonu
                            // leading'e yaslayıp kalanı şeffaf bırakıyor, sonrasına
                            // konsa çerçeve o boş alanı da sarardı.
                            //
                            // Zemin BURADA düz dolgu, `GlassFallbackSurface`in
                            // bulanıklığı DEĞİL: kutu bilerek butondan geniş
                            // (maxWidth + leading) ve görünen kapsülün genişliğini
                            // yalnız SwiftUI biliyor — RN'deki BlurView kutunun
                            // şeffaf kalan sağ yarısını da boyardı.
                            ...glassFallback({
                              shape: "capsule",
                              padding: { horizontal: 14 },
                              backgroundColor: glassFallbackFill(),
                            }),
                            frame({
                              maxWidth: EDIT_BUTTON_BOX_W,
                              alignment: "leading",
                            }),
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
                          tint={plainBlurTint()}
                          intensity={100}
                          style={{
                            borderRadius: 999,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            backgroundColor: colors.surfaceTranslucent,
                            borderColor: colors.hairline,
                          }}
                          className="flex-row self-start justify-center text-center items-center border-[0.5px] px-4 py-5 gap-2"
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

                {/* ── Mağaza şeridi: (premium'da plus) + SuperLike + Not ── */}
                {/* Hero'nun altı, upsell'in üstü: sayfanın tek "mağaza" şeridi.
                    Eskiden sayfanın en altındaki QuotaSection'da duran SuperLike
                    bakiyesi de bu kartların içinde.

                    Şeritteki plus kartı, abone kullanıcının sayfadaki TEK
                    abonelik yüzeyi: altında duran kocaman üyelik kartı (plan
                    rozeti + "aboneliği yönet" butonu) kaldırıldı, yerini bu
                    aldı. Yönetme/geri yükleme plus sayfasında (PurchaseSections)
                    zaten var, kart oraya götürüyor.

                    Bayrak `showMembershipCard`: kart kendi başına premium
                    OKUMUYOR, aşağıdaki upsell'le AYNI koşulun iki yüzü — ikisi
                    ayrı kaynaktan okursa aktivasyon penceresinde ikisi birden
                    (ya da hiçbiri) çıkar. */}
                <ShopCardsRow
                  showPlusCard={showMembershipCard}
                  onPlusPress={goToPlusPage}
                />

                {/* --- PREMIUM UPSELL BANNER & COMPARISON --- */}
                {/* Şerideki plus kartıyla TEK bayrağın iki yüzü: abone olan
                    küçük kartı, olmayan bu tabloyu görüyor. Abone tarafındaki
                    kocaman eşi (üyelik kartı) kaldırıldı; bu, yalnız satın
                    almamış kullanıcıya çıktığı için yerinde duruyor. */}
                {!showMembershipCard && (
                  <View className="mb-10 px-4">
                    <AnimatedPressable
                      pressScale={0.97}
                      onPress={goToPlusPage}
                    >
                      <LinearGradient
                        colors={gradients.litPlusCard}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: 40,
                          borderCurve: "continuous",
                          overflow: "hidden",
                          shadowColor: colors.shadow,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.2,
                          shadowRadius: 8,
                          elevation: 5,
                        }}
                      >
                        {/* Top Banner Section */}
                        {/* Alev BAŞLIKLA aynı satırda: eskiden dıştaki tek satır
                            `items-center`di ve alev, başlık + açıklamanın
                            oluşturduğu sütunun tamamına göre ortalanıyordu —
                            wordmark'ın epey altına düşüyordu. Şimdi başlıkla
                            alev kendi satırında (`items-center` orada), açıklama
                            altta. Açıklamanın genişliği DEĞİŞMESİN diye sağdan
                            alev sütunu kadar (84 + 16) padding alıyor: eskiden
                            bu boşluğu satırdaki alev sütununun kendisi veriyordu.

                            Satır yüksekliğini Duckie'nin satır kutusundan
                            hesaplamak yerine flexbox'a bırakıyoruz — fontun
                            metriği harflerin üstünde kendi boşluğunu taşıyor,
                            elle verilen bir yükseklik/lineHeight 'p'nin kuyruğunu
                            kırpma riski taşıyor. */}
                        <View className="p-5">
                          <View className="flex-row items-center justify-between">
                            <Text
                              className="flex-1 pr-4"
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              style={{
                                color: colors.onMedia,
                                // Plus sayfasındaki başlıklardan BİLEREK büyük:
                                // bu kart bir reklam, oradaki durum göstergesi.
                                fontSize: 64,
                                fontFamily: "Duckie-regular",
                              }}
                            >
                              plus+
                            </Text>
                            {/* Ok yığını + "5x eşleşme" yazısının yerine marka
                                alevi. Kartın zemini zaten kırmızı-turuncu gradyan
                                olduğu için rozetin gradyanı değil düz onMedia
                                dolgusu. */}
                            <View style={{ width: 84, alignItems: "center" }}>
                              <PremiumFlame size={68} color={colors.onMedia} />
                            </View>
                          </View>
                          <Text
                            numberOfLines={3}
                            className="font-medium text-[14px] leading-5 mt-2"
                            style={{ color: colors.onMediaMuted, paddingRight: 100 }}
                          >
                            {t('discover.premium.description')}
                          </Text>
                        </View>

                        {/* Comparison Table Section */}
                        {/* pt küçük: üstteki banner'ın kendi pb-5'i (20) zaten
                            boşluğu veriyor, buraya bir 20 daha eklenince
                            açıklama ile tablo kopuk duruyordu. */}
                        <View className="pt-1 pb-2">
                          {/* Table Header */}
                          <View className="flex-row items-center justify-between mb-2 px-6">
                            <Text className="font-bold text-[12px] uppercase tracking-wider flex-1" style={{ color: colors.onMedia }}>
                              {t('discover.premium.featuresLabel')}
                            </Text>
                            <View className="flex-row items-center gap-4">
                              <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                className="font-bold text-[12px] uppercase w-16 text-center" style={{ color: colors.onMedia }}
                              >
                                {t('discover.premium.standardPlan')}
                              </Text>
                              <Text
                                // Kartın tepesindeki başlıkla AYNI yazım
                                // ("plus+"); 64px'lik sütuna sığmazsa sarmak
                                // yerine küçülür — Free sütunundaki kalıp.
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                className="w-16 text-center mb-2"
                                style={{
                                  color: colors.onMedia,
                                  fontSize: 25,
                                  fontFamily: "Duckie-regular",
                                }}
                              >
                                plus+
                              </Text>
                            </View>
                          </View>

                          {/* Feature Rows — listenin yalnız ilk dördü.
                              Tamamı PurchaseModal'da; kartın gövdesine dokunmak
                              zaten oraya açıyor, aşağıdaki "+N özellik daha"
                              satırı da o yüzden ayrı bir buton değil. */}
                          {UPSELL_BENEFIT_KEYS.map((key, index, arr) => (
                            <View
                              key={key}
                              className={`flex-row items-center justify-between px-6 ${
                                index !== arr.length - 1 ? "mb-4" : ""
                              }`}
                            >
                              <Text className="font-[500] text-[13px] flex-1 pr-2" style={{ color: colors.onMedia }}>
                                {t(premiumBenefitLabelKey(key))}
                              </Text>
                              <View className="flex-row items-center gap-4">
                                <View className="w-16 items-center">
                                  <SFIcon
                                    name="xmark"
                                    fallback={X}
                                    size={18}
                                    color={onMediaAt(0.4)}
                                    strokeWidth={2}
                                    weight="semibold"
                                  />
                                </View>
                                <View className="w-16 items-center">
                                  <SFIcon name="checkmark" fallback={Check} size={18} color={colors.onMedia} strokeWidth={2} weight="semibold" />
                                </View>
                              </View>
                            </View>
                          ))}

                          {/* Listenin devamı. Satırın ✗/✓ sütunları YOK: burada
                              karşılaştırılan bir şey değil, "tabloda göremediğin
                              maddeler var" işareti — sütun çizmek onları dörtle
                              aynı ağırlıkta gösterirdi. */}
                          <View className="px-6 mt-4">
                            <Text
                              className="font-[500] text-[13px]"
                              style={{ color: onMediaAt(0.75) }}
                            >
                              {t('discover.premium.benefitsMore', {
                                n: UPSELL_HIDDEN_BENEFIT_COUNT,
                              })}
                            </Text>
                          </View>
                        </View>

                        {/* Purchase Action Button */}
                        <View className="px-5 pb-6 pt-3">
                          <View
                            className=" w-full border-[0.5px] py-[17px] items-center justify-center flex-row gap-2"
                            style={{
                              borderColor: onMediaAt(0.5),
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
                            }}
                          >
                            <Text className="font-medium text-[14px]" style={{ color: colors.onMedia }}>
                              {teaserPrice ? (
                                <>
                                  <Text style={{ color: colors.onMediaMuted }}>
                                    {t('discover.premium.pricingPrefix')}
                                  </Text>
                                  <Text style={{ fontWeight: "700" }}>
                                    {t('discover.premium.pricing', { price: teaserPrice })}
                                  </Text>
                                  <Text style={{ color: colors.onMediaMuted }}>
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

                {/* ── Fotoğraf Doğrulama ── Akışın TEK giriş noktası.
                    Görünürlüğünü kendisi karar veriyor: `isSelfieVerified` alanı
                    gelmiyorsa ya da yakın zamanda UT-6505 alındıysa null döner. */}
                <SelfieVerificationRow profile={myProfile} userId={user?.id} />

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
                          // Modal açılınca form doğrudan bu bölüme kaydırılır.
                          onEdit={() => openEditProfile(metric.key)}
                        />
                      ))}
                  </View>
                )}

              </Animated.ScrollView>
            )}
          </View>

          {/* Paywall artık sayfanın YANINDA: aynı içerik, aynı tasarım, sheet
              yerine ikinci sayfa. Katalog yalnız buraya bir kez geçilince
              çekiliyor (bkz. plusVisited). */}
          <View key="plus" style={{ flex: 1 }} collapsable={false}>
            <PlusPage
              active={plusVisited}
              scrollY={plusScrollY}
              onSuccess={loadProfile}
            />
          </View>
        </AnimatedPagerView>

        <ScreenHeader
          scrollY={headerScrollY}
          // Başlık YOK: logonun yerini sekme şeridi aldı ve scroll'la beliren
          // ortalanmış başlık tam onun üstüne binerdi. "Profil" adı zaten
          // şeritteki sekmenin etiketi.
          centerSlot={
            <PagerTabBar
              tabs={tabs}
              activeTab={activeTab}
              offset={pagerOffset}
              onPress={handleTabChange}
              centered
            />
          }
          showLogo={false}
          // Logo çizilmediği için dalga doluluğu (swipeFillRatio) da artık
          // OKUNMUYOR — o oran WaveFillLogo'nun içindeki dolgunun seviyesiydi.
          // Header'a başka bir yerden gelen tek şey scroll konumu.
          leftButton={
            Platform.OS === "ios" ? (
              /* matchContents YOK — bkz. GLASS_ICON_BUTTON: sabit boyut
                 Yoga'ya ilk commit'te bildirilmezse buton kenardan içeri
                 ışınlanıyor. Sarmalayıcı iOS 26 ALTINDA zemini veriyor,
                 26+'da hiç render olmuyor. */
              <GlassFallbackSurface
                shape="circle"
                width={GLASS_ICON_CLEAR_SIZE}
                height={GLASS_ICON_CLEAR_SIZE}
              >
                <Host
                  style={{
                    width: GLASS_ICON_CLEAR_SIZE,
                    height: GLASS_ICON_CLEAR_SIZE,
                  }}
                >
                  <SwiftUIButton
                    onPress={() => navigation.navigate("Notifications")}
                    modifiers={[
                      // Kabuk YOK, cam glifin üstünde: berrak camın buton stili
                      // karşılığı olmadığı için — gerekçenin tamamı
                      // glassIconClearGlyph'in başında.
                      buttonStyle("plain"),
                      tint(colors.text),
                      frame({
                        width: GLASS_ICON_CLEAR_SIZE,
                        height: GLASS_ICON_CLEAR_SIZE,
                      }),
                      accessibilityLabel(t('common.notifications')),
                      ...glassFallback({ shape: "circle" }),
                    ]}
                  >
                    <SwiftUIImage
                      systemName="bell.fill"
                      color={colors.text}
                      modifiers={glassIconClearGlyph()}
                    />
                  </SwiftUIButton>
                </Host>
              </GlassFallbackSurface>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate("Notifications")}
                hitSlop={10}
                activeOpacity={0.7}
              >
                <View pointerEvents="none">
                  <SFIcon
                    name="bell.fill"
                    fallback={Bell}
                    size={29}
                    strokeWidth={2}
                    color={colors.text}
                    weight="semibold"
                  />
                </View>
              </TouchableOpacity>
            )
          }
          rightButton={
            Platform.OS === "ios" ? (
              /* matchContents YOK — bkz. GLASS_ICON_BUTTON: sabit boyut
                 Yoga'ya ilk commit'te bildirilmezse buton sağ kenardan içeri
                 ışınlanıyor. Zemin çan butonuyla aynı yoldan (sarmalayıcı). */
              <GlassFallbackSurface
                shape="circle"
                width={GLASS_ICON_CLEAR_SIZE}
                height={GLASS_ICON_CLEAR_SIZE}
              >
                <Host
                  style={{
                    width: GLASS_ICON_CLEAR_SIZE,
                    height: GLASS_ICON_CLEAR_SIZE,
                  }}
                >
                  <SwiftUIButton
                    onPress={() => navigation.navigate("Settings")}
                    modifiers={[
                      // Çan butonuyla birebir aynı — bkz. glassIconClearGlyph.
                      buttonStyle("plain"),
                      tint(colors.text),
                      frame({
                        width: GLASS_ICON_CLEAR_SIZE,
                        height: GLASS_ICON_CLEAR_SIZE,
                      }),
                      accessibilityLabel(t('profile.settings.button')),
                      ...glassFallback({ shape: "circle" }),
                    ]}
                  >
                    <SwiftUIImage
                      systemName="gearshape.fill"
                      color={colors.text}
                      modifiers={glassIconClearGlyph()}
                    />
                  </SwiftUIButton>
                </Host>
              </GlassFallbackSurface>
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation.navigate("Settings")}
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
                relationshipIntentOptions={relationshipIntentOptions}
                languageOptions={languageOptions}
                petOptions={petOptions}
                alcoholOptions={alcoholOptions}
                religiousViewOptions={religiousViewOptions}
                genderCategories={genderCategories}
                // Rozet satırının görünürlüğü. `showMembershipCard` ile AYNI
                // koşul olmak zorunda: aksi halde kullanıcı profil ekranında
                // üyelik kartını görürken edit modalında ayarı bulamıyor.
                // `syncPending` = parası alındı ama backend henüz görmedi
                // (reload'da redux persist edilmiyor, sadece bu bayrak geri
                // geliyor) — o pencerede satırı saklamak, ayarı tam da premium
                // olmuş kullanıcıdan gizlemek demek. Backend değeri her hâlde
                // kabul ediyor, erken göstermenin yan etkisi yok.
                isPremium={isPremium || syncPending}
                // Fotoğraflar bölümünün başındaki görünürlük şeridi için.
                profileVisibility={profileVisibility}
                savingPhoto={savingPhoto}
                focusSection={editFocusSection}
                highlightPhotoId={highlightPhotoId}
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

        {/* ══ PREVİEW MODALI (ARTIK ORIJINAL MODAL) ══ */}
        <PreviewModal
          visible={previewVisible}
          onClose={() => setPreviewVisible(false)}
          profile={previewProfile}
        />

        {/* Foto kaynağı seçimi. `stackBehavior="push"`: düzenleme modalının
            üstüne biniyor, onu kapatmıyor. */}
        <PhotoSourceSheet
          visible={sourceSheetOpen}
          onClose={() => setSourceSheetOpen(false)}
          onCamera={addPhotoFromCamera}
          onGallery={addPhotoFromGallery}
          stackBehavior="push"
        />
      </View>
    </GestureHandlerRootView>
  );
}
