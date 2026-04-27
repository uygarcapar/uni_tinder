import React, {
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
  TextInput,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  StatusBar,
  Platform,
  UIManager,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../store/slices/authSlice";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import profileService from "../services/profileService";
import api from "../services/api";
import SwipeCard from "../components/SwipeCard";
import {
  LogOut,
  Trash2,
  Pencil,
  Check,
  X,
  Plus,
  User,
  Heart,
  Sparkles,
  Cigarette,
  Target,
  BookOpen,
  Settings,
  IdCardLanyard,
  Music,
  Dumbbell,
  Film,
  Plane,
  Utensils,
  Camera,
  Gamepad2,
  Music2,
  Palette,
  Coffee,
  Wine,
  Code,
  Dog,
  Cat,
  Trees,
  Flower2,
  Drama,
  Mic2,
  Guitar,
  Piano,
  Mountain,
  Waves,
  BookOpenCheck,
  Lightbulb,
  Briefcase,
  Users,
  Trophy,
  Footprints,
  Fish,
  Smartphone,
  Bike,
  HandMetal,
  PartyPopper,
  Tent,
  Sandwich,
  Cake,
  Sunrise,
  Book,
  Languages,
  Puzzle,
  Headphones,
  Newspaper,
  TrendingUp,
  Globe,
  Theater,
  Soup,
  ShoppingBag,
  Orbit,
  Sun,
  Moon,
  Star,
  Zap,
  Droplets,
  Leaf,
  Scale,
  Flame,
  Wind,
  Navigation,
  ChevronDown,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

// REANIMATED & GESTURE HANDLER IMPORTLARI
import {
  GestureHandlerRootView,
  GestureDetector,
  Gesture,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
  runOnJS,
} from "react-native-reanimated";

import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";

// Android LayoutAnimation aktivasyonu
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width, height } = Dimensions.get("window");

// ─── Reanimated Grid Hesaplamaları ─────────────────────────────────────────
const CONTAINER_PADDING = 20;
const AVAILABLE_WIDTH = width - CONTAINER_PADDING * 2;
const ITEM_WIDTH = AVAILABLE_WIDTH * 0.31;
const GAP = (AVAILABLE_WIDTH - 3 * ITEM_WIDTH) / 2;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const ROW_GAP = 20;
const getContainerHeight = (photoCount) =>
  photoCount <= 2 ? ITEM_HEIGHT : 2 * ITEM_HEIGHT + ROW_GAP;

const getPosition = (index) => {
  "worklet";
  return {
    x: (index % 3) * (ITEM_WIDTH + GAP),
    y: Math.floor(index / 3) * (ITEM_HEIGHT + ROW_GAP),
  };
};

const getOrder = (tx, ty, maxIndex) => {
  "worklet";
  const col = Math.round(tx / (ITEM_WIDTH + GAP));
  const row = Math.round(ty / (ITEM_HEIGHT + ROW_GAP));
  const val = Math.max(0, Math.min(row * 3 + col, maxIndex));
  return val;
};

const getHobbyIcon = (hobbyName) => {
  const iconMap = {
    "Fitness & Spor": Dumbbell,
    Yoga: Heart,
    Koşu: Footprints,
    Yüzme: Waves,
    Bisiklet: Bike,
    "Doğa Yürüyüşü": Trees,
    "Kaya Tırmanışı": Mountain,
    Boks: HandMetal,
    "Dövüş Sanatları": Trophy,
    Dans: Music2,
    Pilates: Sparkles,
    "Yemek Pişirme": Utensils,
    Fırıncılık: Cake,
    "Şarap Tadımı": Wine,
    "Kahve Tutkusu": Coffee,
    Gurme: Soup,
    "Vegan Mutfak": Sandwich,
    Miksologluk: Wine,
    Fotoğrafçılık: Camera,
    Resim: Palette,
    Çizim: Palette,
    Yazarlık: BookOpenCheck,
    Şiir: Book,
    "El Sanatları": Sparkles,
    "Kendin Yap (DIY)": Flower2,
    Moda: ShoppingBag,
    Müzik: Headphones,
    Konserler: PartyPopper,
    "Gitar Çalmak": Guitar,
    "Piyano Çalmak": Piano,
    "Şarkı Söylemek": Mic2,
    "DJ'lik": Music,
    Festivaller: PartyPopper,
    Seyahat: Plane,
    Kamp: Tent,
    "Balık Tutma": Fish,
    Sörf: Waves,
    Kayak: Mountain,
    Snowboard: Mountain,
    Bahçıvanlık: Flower2,
    "Plaj Hayatı": Sunrise,
    Okumak: BookOpen,
    Müzeler: Theater,
    "Sanat Galerileri": Palette,
    Tiyatro: Drama,
    Sinema: Film,
    Belgesel: Film,
    Öğrenme: Lightbulb,
    Diller: Languages,
    "Video Oyunları": Gamepad2,
    "Masa Oyunları": Puzzle,
    Satranç: Puzzle,
    Yazılım: Code,
    Oyun: Gamepad2,
    VR: Smartphone,
    "Podcast'ler": Headphones,
    Gönüllülük: Users,
    "Evcil Hayvanlar": Dog,
    Köpekler: Dog,
    Kediler: Cat,
    Meditasyon: Heart,
    Astroloji: Orbit,
    Alışveriş: ShoppingBag,
    "Gece Hayatı": Music2,
    Brunch: Coffee,
    "Sosyal İçici": Wine,
    Network: Briefcase,
    Siyaset: Newspaper,
    Felsefe: BookOpen,
    Bilim: Lightbulb,
    Tarih: Book,
    Yatırım: TrendingUp,
    Girişimcilik: Briefcase,
  };
  return iconMap[hobbyName] || Heart;
};

const getZodiacIcon = (name) => {
  const map = {
    Koç: Flame,
    Boğa: Leaf,
    İkizler: Wind,
    Yengeç: Moon,
    Aslan: Sun,
    Başak: Leaf,
    Terazi: Scale,
    Akrep: Zap,
    Yay: Navigation,
    Oğlak: Mountain,
    Kova: Droplets,
    Balık: Fish,
  };
  return map[name] || Star;
};

// YAYLANMA (BOUNCE) EFEKTİNİ AZALTAN SABİT DEĞERLER
const SPRING_CONFIG = { damping: 24, stiffness: 200, mass: 0.8 };

// ─── Shimmer skeleton ────────────────────────────────────────────────────────
function SkeletonShimmer() {
  const shimmer = useSharedValue(-ITEM_WIDTH);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(ITEM_WIDTH * 2, { duration: 1100, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: ITEM_WIDTH * 2,
          height: "100%",
        },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={["transparent", "rgba(255,255,255,0.07)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

function PhotoItem({ photo, onPress, savingPhoto }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [photo.photoImageUrl]);

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 32,
          overflow: "hidden",
          backgroundColor: "#1E1E1E",
        }}
      >
        <Image
          source={{ uri: photo.photoImageUrl, cache: "reload" }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onLoad={() => setLoading(false)}
        />
        {loading && <SkeletonShimmer />}
      </View>
      <TouchableOpacity
        className="border-white/10"
        activeOpacity={1}
        onPress={() => onPress(photo)}
        disabled={savingPhoto}
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          borderRadius: 999,
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          backgroundColor: "#1E1E1E",
        }}
      >
        <View pointerEvents="none">
          <X size={16} strokeWidth={3} color="#7a7d82" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Reanimated Sürükle Bırak Bileşeni ─────────────────────────────────────
function SortablePhoto({
  id,
  index,
  positions,
  maxIndex,
  children,
  onDragStart,
  onDragEnd,
}) {
  const isDragging = useSharedValue(false);
  const position = getPosition(index);

  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useAnimatedReaction(
    () => positions.value[id],
    (newIndex) => {
      if (!isDragging.value && newIndex !== undefined) {
        const pos = getPosition(newIndex);
        translateX.value = withSpring(pos.x, SPRING_CONFIG);
        translateY.value = withSpring(pos.y, SPRING_CONFIG);
      }
    },
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;

      const newIndex = getOrder(translateX.value, translateY.value, maxIndex);
      const oldIndex = positions.value[id];

      if (newIndex !== oldIndex && newIndex !== undefined) {
        const newPositions = { ...positions.value };
        for (const key in newPositions) {
          if (newPositions[key] === newIndex) {
            newPositions[key] = oldIndex;
            break;
          }
        }
        newPositions[id] = newIndex;
        positions.value = newPositions;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      const finalPos = getPosition(positions.value[id]);
      translateX.value = withSpring(finalPos.x, SPRING_CONFIG);
      translateY.value = withSpring(finalPos.y, SPRING_CONFIG, () => {
        runOnJS(onDragEnd)(positions.value);
      });
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      top: 0,
      left: 0,
      width: ITEM_WIDTH,
      height: ITEM_HEIGHT,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: withSpring(isDragging.value ? 1.05 : 1, SPRING_CONFIG) },
      ],
      zIndex: isDragging.value ? 100 : 0,
      opacity: isDragging.value ? 0.9 : 1,
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

// ─── Performans Optimizasyonlu Seçim Bileşenleri (Modal İçi) ──────────────

const HobbyPill = React.memo(({ hobby, isSelected, onPress }) => {
  const Icon = getHobbyIcon(hobby.name);
  const [localSelected, setLocalSelected] = useState(isSelected);

  useEffect(() => {
    setLocalSelected(isSelected);
  }, [isSelected]);

  const handlePress = () => {
    setLocalSelected(!localSelected);
    onPress(hobby.id);
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderWidth: 0.5,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: localSelected ? "#fff" : "transparent",
        borderColor: localSelected ? "#fff" : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon
        size={20}
        color={localSelected ? "#000" : "#9CA3AF"}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: localSelected ? "#000" : "#9CA3AF",
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {hobby.name}
      </Text>
    </TouchableOpacity>
  );
});

const OptionListItem = React.memo(
  ({ option, isSelected, onPress, icon: CustomIcon, purposeMap }) => {
    const [localSelected, setLocalSelected] = useState(isSelected);

    useEffect(() => {
      setLocalSelected(isSelected);
    }, [isSelected]);

    const handlePress = () => {
      setLocalSelected(!localSelected);
      onPress();
    };

    if (purposeMap) {
      const entry = purposeMap[option.name];
      const Icon = entry?.icon ?? Star;
      const desc = entry?.desc;
      return (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handlePress}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
          }}
        >
          <Icon
            size={20}
            color={localSelected ? "#fff" : "#6B7280"}
            strokeWidth={1.5}
            style={{ marginRight: 14 }}
          />
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{
                color: localSelected ? "#fff" : "#9CA3AF",
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              {option.name}
            </Text>
            {desc && (
              <Text
                style={{
                  color: localSelected
                    ? "rgba(255,255,255,0.5)"
                    : "rgba(255,255,255,0.3)",
                  fontSize: 14,
                  marginTop: 3,
                }}
              >
                {desc}
              </Text>
            )}
          </View>
          {localSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={handlePress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 18,
          }}
        >
          {CustomIcon && (
            <CustomIcon
              size={16}
              color={localSelected ? "#fff" : "#9CA3AF"}
              strokeWidth={1.5}
            />
          )}
          <Text
            style={{
              color: localSelected ? "#fff" : "#9CA3AF",
              fontSize: 15,
              fontWeight: "500",
            }}
          >
            {option.name}
          </Text>
        </View>
        {localSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
      </TouchableOpacity>
    );
  },
);

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
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
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
      <Animated.View style={contentStyle}>
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
            className="border-[0.5px] border-white/10"
            onPress={onEdit}
            activeOpacity={1}
            style={{
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: "#1E1E1E",
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

import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";

// ─── Edit Modal sarmalayıcı ───────────────────────────────────────────────────
function ProfileEditModal({
  title,
  onClose,
  onSave,
  saving,
  saveDisabled,
  children,
  bottomSheetRef,
}) {
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

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose={true}
      enableOverDrag={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.3)" }}
    >
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
          onPress={onClose}
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
          {title}
        </Text>
        <TouchableOpacity
          onPress={onSave}
          disabled={saving || saveDisabled}
          activeOpacity={0.7}
          style={{ width: 60, alignItems: "flex-end", opacity: saveDisabled ? 0.35 : 1 }}
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
                Kaydet
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
      >
        {children}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function ProfileScreen() {
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);

  // ── Bottom Sheet Ref ───────────────────────────────────────────────────────
  const editBottomSheetRef = useRef(null);

  // ── Profil verisi ──────────────────────────────────────────────────────────
  const [myProfile, setMyProfile] = useState(null);
  const [hobbyMap, setHobbyMap] = useState({});
  const [hobbyGroups, setHobbyGroups] = useState([]);
  const [smokingOptions, setSmokingOptions] = useState([]);
  const [zodiacOptions, setZodiacOptions] = useState([]);
  const [usagePurposeOptions, setUsagePurposeOptions] = useState([]);

  // ── Genel UI ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Accordion State
  const [expandedSection, setExpandedSection] = useState(null);

  // ── Profil düzenleme modalı ───────────────────────────────────────────────
  const [bioText, setBioText] = useState("");
  const [draftHobbies, setDraftHobbies] = useState([]);
  const [draftSmoking, setDraftSmoking] = useState(null);
  const [draftZodiac, setDraftZodiac] = useState(null);
  const [draftUsagePurpose, setDraftUsagePurpose] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Fotoğraf yönetimi ─────────────────────────────────────────────────────
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [draftPhotoOrder, setDraftPhotoOrder] = useState([]);
  const [photoOrderDirty, setPhotoOrderDirty] = useState(false);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);

  // Reanimated Shared Value (Fotoğrafların Pozisyonları için)
  const positions = useSharedValue({});

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
      const [profile, hobbiesRes, smokingRes, zodiacRes, usageRes] =
        await Promise.all([
          profileService.getMyProfile(),
          api.get(API_ENDPOINTS.GET_HOBBIES).catch(() => null),
          api.get(API_ENDPOINTS.GET_SMOKING_STATUSES).catch(() => null),
          api.get(API_ENDPOINTS.GET_ZODIACS).catch(() => null),
          api.get(API_ENDPOINTS.GET_USAGE_PURPOSES).catch(() => null),
        ]);

      setMyProfile(profile);
      setBioText(profile?.bio || "");

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
    } catch (e) {
      console.error("Profile load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (myProfile?.photosList && !photoOrderDirty) {
      const sortedPhotos = [...myProfile.photosList].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      setDraftPhotoOrder(sortedPhotos);
      const newPositions = {};
      sortedPhotos.forEach((photo, i) => {
        newPositions[photo.photoId] = i;
      });
      positions.value = newPositions;
    }
  }, [myProfile?.photosList, photoOrderDirty, positions]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
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
      bio: bioText || myProfile.bio,
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
  const openEditProfile = () => {
    setBioText(myProfile?.bio || "");
    const rawIds = (myProfile?.hobbies || []).map((h) => Number(h));
    setDraftHobbies(rawIds);
    setDraftSmoking(
      smokingOptions.find((o) => o.id === myProfile?.smokingStatus) || null,
    );
    setDraftZodiac(
      zodiacOptions.find((o) => o.id === myProfile?.zodiacSign) || null,
    );
    setDraftUsagePurpose(
      usagePurposeOptions.find((o) => o.id === myProfile?.usagePurpose) || null,
    );

    if (myProfile?.photosList) {
      const sortedPhotos = [...myProfile.photosList].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0),
      );
      setDraftPhotoOrder(sortedPhotos);
      const newPositions = {};
      sortedPhotos.forEach((photo, i) => {
        newPositions[photo.photoId] = i;
      });
      positions.value = newPositions;
      setPhotoOrderDirty(false);
    }

    editBottomSheetRef.current?.present();
  };

  const closeEditProfile = () => {
    editBottomSheetRef.current?.dismiss();
  };

  const toggleHobby = useCallback((id) => {
    setDraftHobbies((prev) => {
      if (prev.includes(id)) {
        return prev.filter((h) => h !== id);
      } else {
        if (prev.length >= 10) {
          Alert.alert("Sınır Aşıldı", "En fazla 10 hobi seçebilirsin.");
          return prev;
        }
        return [...prev, id];
      }
    });
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updates = {
        Bio: bioText,
        ...(draftHobbies.length > 0
          ? { Hobbies: draftHobbies }
          : { ClearHobbies: true }),
      };

      if (draftSmoking != null) updates.SmokingStatus = draftSmoking.id;
      else if (myProfile?.smokingStatus != null)
        updates.ClearSmokingStatus = true;

      if (draftZodiac != null) updates.ZodiacSign = draftZodiac.id;
      else if (myProfile?.zodiacSign != null) updates.ClearZodiacSign = true;

      if (draftUsagePurpose != null)
        updates.UsagePurpose = draftUsagePurpose.id;
      else if (myProfile?.usagePurpose != null)
        updates.ClearUsagePurpose = true;

      if (photoOrderDirty && draftPhotoOrder.length > 0) {
        updates.PhotoOrders = draftPhotoOrder.map((p, i) => ({
          photoId: p.photoId,
          newOrder: i + 1,
        }));
        const originalMain = myProfile?.photosList?.find((p) => p.isMainPhoto);
        if (draftPhotoOrder[0]?.photoId !== originalMain?.photoId) {
          updates.NewMainPhotoId = draftPhotoOrder[0].photoId;
        }
      }

      await profileService.updateProfile(updates);

      setMyProfile((p) => ({
        ...p,
        bio: bioText,
        hobbies: draftHobbies,
        smokingStatus: draftSmoking?.id,
        smokingStatusDisplay: draftSmoking?.name,
        zodiacSign: draftZodiac?.id,
        zodiacSignDisplay: draftZodiac?.name,
        usagePurpose: draftUsagePurpose?.id,
        usagePurposeDisplay: draftUsagePurpose?.name,
      }));

      await refreshPhotos();
      setPhotoOrderDirty(false);

      closeEditProfile();
    } catch (e) {
      console.error(
        "Profil güncelleme hatası:",
        JSON.stringify(e?.response?.data || e?.message || e),
      );
      Alert.alert("Hata", "Profil güncellenemedi, tekrar dene.");
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Fotoğraf aksiyonları ───────────────────────────────────────────────────
  const refreshPhotos = async () => {
    try {
      const profile = await profileService.getMyProfile();
      setMyProfile(profile);
      setBioText(profile?.bio || "");
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
      setPhotoOrderDirty(false);
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
      setPhotoOrderDirty(false);
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
      setPhotoOrderDirty(false);
      await refreshPhotos();
    } catch (e) {
      Alert.alert("Hata", "Fotoğraf silinemedi.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleDragStart = useCallback(() => {
    setIsDraggingPhoto(true);
  }, []);

  const handleDragEnd = useCallback(
    (newPositions) => {
      setIsDraggingPhoto(false);
      const newOrder = [...draftPhotoOrder].sort(
        (a, b) => newPositions[a.photoId] - newPositions[b.photoId],
      );
      const isChanged = newOrder.some(
        (p, i) => p.photoId !== draftPhotoOrder[i].photoId,
      );
      if (isChanged) {
        setDraftPhotoOrder(newOrder);
        setPhotoOrderDirty(true);
      }
    },
    [draftPhotoOrder],
  );

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

  const confirmDelete = () =>
    Alert.alert("Hesabı Sil", "Bu işlem geri alınamaz. Emin misin?", [
      { text: "İptal", style: "cancel" },
      {
        text: "Devam Et",
        style: "destructive",
        onPress: () => setShowDeleteModal(true),
      },
    ]);

  const handleDeleteAccount = async () => {
    if (!password.trim()) return Alert.alert("Hata", "Lütfen şifrenizi girin");
    setDeleteLoading(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.DELETE_ACCOUNT}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: user?.userId, password }),
        },
      );
      const data = await response.json();
      if (response.ok && data.isSuccess) {
        Alert.alert("Başarılı", "Hesabınız silindi", [
          {
            text: "Tamam",
            onPress: () => {
              setShowDeleteModal(false);
              setPassword("");
              dispatch(logout());
            },
          },
        ]);
      } else {
        Alert.alert("Hata", data.message || "Hesap silinemedi");
      }
    } catch {
      Alert.alert("Hata", "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAccordionToggle = (key) => {
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

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#121212",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const resolvedHobbies = resolveHobbies(myProfile?.hobbies);
  const previewProfile = buildPreviewProfile();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#121212" }}>
        <StatusBar barStyle="light-content" />

        {/* Custom Header */}
        <SafeAreaView edges={["top"]} style={{ backgroundColor: "#121212" }}>
          <View
            style={{
              paddingHorizontal: 21,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              height: 50,
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontSize: 26,
                fontWeight: "700",
                letterSpacing: 0.5,
              }}
            >
              Profil
            </Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Settings size={25} strokeWidth={2} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
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
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 50,
                overflow: "hidden",
                backgroundColor: "#1E1E1E",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {mainPhoto ? (
                <Image
                  source={{ uri: mainPhoto }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <User size={40} color="#374151" strokeWidth={1} />
              )}
            </View>

            <View style={{ flex: 1, justifyContent: "space-between" }}>
              <Text
                style={{
                  color: "#fff",
                  fontSize: 18,
                  fontWeight: "600",
                  lineHeight: 28,
                }}
              >
                {myProfile?.displayName ||
                  `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
              </Text>

              <TouchableOpacity
                onPress={openEditProfile}
                activeOpacity={0.95}
                style={{ marginTop: 8 }}
              >
                <View
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                  className="flex-row bg-[#1E1E1E] self-start justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-3 gap-2"
                >
                  <Pencil size={18} color="#fff" strokeWidth={1.5} />
                  <Text
                    style={{ color: "#fff", fontWeight: "500", fontSize: 13 }}
                  >
                    Profili Düzenle
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* --- PREMIUM UPSELL BANNER & COMPARISON --- */}
          {!myProfile?.isPremium && (
            <View className="mb-10 px-4 mt-2">
              <TouchableOpacity activeOpacity={0.9}>
                <LinearGradient
                  colors={["#ff173a", "#FF4D4D", "#fc803d"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 40,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    shadowColor: "#FFD700",
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
                          lit gold
                        </Text>
                      </View>
                      <Text className="text-[#fff] font-medium text-[14px] leading-5 opacity-90">
                        Lit Gold ile eşleşmelerini hızlandır, seni beğenenleri
                        gör ve daha fazlasını keşfet!
                      </Text>
                    </View>
                    <View
                      className="border-[1px] border-white/50 px-4 py-4"
                      style={{
                        borderRadius: 999,
                        overflow: "hidden",
                        borderCurve: "continuous",
                      }}
                    >
                      <Text className="text-[#fff] font-bold text-[13px]">
                        Yükselt
                      </Text>
                    </View>
                  </View>

                  {/* Comparison Table Section */}
                  <View className="pt-5 pb-2">
                    {/* Table Header */}
                    <View className="flex-row items-center justify-between mb-2 px-6">
                      <Text className="text-white/70 font-bold text-[12px] uppercase tracking-wider flex-1">
                        Özellikler
                      </Text>
                      <View className="flex-row items-center gap-4">
                        <Text className="text-white/70 font-bold text-[12px] uppercase w-16 text-center">
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
                          gold
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
                              color="rgba(255, 255, 255, 0.4)"
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
                      className=" w-full border-[0.7px] border-white/50 py-[17px] items-center justify-center flex-row gap-2"
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                      }}
                    >
                      <Text className="font-medium text-[15px] text-white">
                        249.99 ₺ / Ay
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Profil Tamamlama Göstergeleri (Accordion) ── */}
          {completionMetrics.some((m) => m.current < m.max) && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 13,
                  fontWeight: "700",
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                Profilini Tamamla
              </Text>
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
              <TouchableOpacity
                onPress={confirmDelete}
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                className="flex-row justify-center text-center items-center border-[0.5px] border-white/10 px-3 py-5 gap-2 mt-3"
              >
                <Trash2 size={20} color="#d10d27" strokeWidth={1.5} />
                <Text
                  style={{ color: "#d10d27", fontWeight: "500", fontSize: 14 }}
                >
                  Hesabı Sil
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* ══ PROFİL DÜZENLEME MODALI ══ */}
        <ProfileEditModal
          title="Profili Düzenle"
          onClose={closeEditProfile}
          onSave={handleSaveProfile}
          saving={savingProfile}
          saveDisabled={isDraggingPhoto}
          bottomSheetRef={editBottomSheetRef}
        >
          {/* Kartımı Önizle Butonu */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setPreviewVisible(true)}
            style={{ marginTop: 8, marginBottom: 16 }}
          >
            <View
              className="border-[0.5px] border-white/10"
              style={{
                backgroundColor: "#1E1E1E",
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <IdCardLanyard size={20} color="#9CA3AF" strokeWidth={1.5} />
              <Text
                style={{ color: "#9CA3AF", fontWeight: "500", fontSize: 14 }}
              >
                İnsanlar beni nasıl görüyor?
              </Text>
            </View>
          </TouchableOpacity>

          {/* Fotoğraflar Sürükle Bırak GRID Alanı */}
          <View style={{ marginTop: 8 }}>
            <View
              style={{
                flexDirection: "column",
                alignItems: "flex-start",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: "600",
                  marginBottom: 6,
                }}
              >
                Fotoğraflar
              </Text>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                  marginBottom: 12,
                }}
              >
                Sıralamak için basılı tut ve sürükle. İlk fotoğrafın ana
                fotoğrafın olur.
              </Text>
              {savingPhoto && (
                <ActivityIndicator size="small" color="#9CA3AF" />
              )}
            </View>

            {/* REANIMATED GRID Container */}
            <View
              style={{
                position: "relative",
                width: "100%",
                height: getContainerHeight(draftPhotoOrder.length),
              }}
            >
              {/* Arka Plan (Boş Kutular ve Ekleme Butonu) */}
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isAddBtn = idx === draftPhotoOrder.length;
                const isGhost = idx > draftPhotoOrder.length;
                const pos = getPosition(idx);

                if (isAddBtn) {
                  return (
                    <View
                      key="add-btn"
                      style={{
                        position: "absolute",
                        left: pos.x,
                        top: pos.y,
                        width: ITEM_WIDTH,
                        height: ITEM_HEIGHT,
                      }}
                    >
                      <TouchableOpacity
                        activeOpacity={1}
                        onPress={handleAddPhoto}
                        disabled={savingPhoto}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 32,
                          overflow: "hidden",
                          backgroundColor: "#1E1E1E",
                          borderWidth: 0.5,
                          borderColor: "rgba(255,255,255,0.1)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View className="flex justify-center items-center pointer-events-none">
                          <Plus size={40} strokeWidth={2} color="#6B7280" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (isGhost) {
                  return (
                    <View
                      key={`ghost-${idx}`}
                      style={{
                        position: "absolute",
                        left: pos.x,
                        top: pos.y,
                        width: ITEM_WIDTH,
                        height: ITEM_HEIGHT,
                      }}
                    />
                  );
                }
                return null;
              })}

              {/* Sürüklenebilir Fotoğraflar */}
              {draftPhotoOrder.map((photo, index) => (
                <SortablePhoto
                  key={`${photo.photoId}-${photo.photoImageUrl}`}
                  id={photo.photoId}
                  index={index}
                  positions={positions}
                  maxIndex={draftPhotoOrder.length - 1}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <PhotoItem
                    photo={photo}
                    onPress={handlePhotoPress}
                    savingPhoto={savingPhoto}
                  />
                </SortablePhoto>
              ))}
            </View>
          </View>

          {/* Biyografi */}
          <View style={{ marginTop: 28 }}>
            <View
              style={{
                flexDirection: "column",
                alignItems: "start",
                marginBottom: 10,
                marginTop: 12,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: "600",
                  marginBottom: 6,
                }}
              >
                Biyografi
              </Text>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                  marginBottom: 12,
                }}
              >
                Kendini tanıtabileceğin kısa bir biyografi yazabilirsin. Neler
                yaptığından bahset.
              </Text>
            </View>
            <TextInput
              value={bioText}
              onChangeText={setBioText}
              multiline
              maxLength={500}
              placeholder="Bize kendinden bahset..."
              placeholderTextColor="#9CA3AF"
              style={{
                borderCurve: "continuous",
                overflow: "hidden",
                color: "#fff",
                fontSize: 15,
                lineHeight: 22,
                minHeight: 100,
                textAlignVertical: "top",
                borderRadius: 30,
                padding: 12,
                paddingLeft: 16,
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.1)",
              }}
            />
          </View>

          {/* Hobiler */}
          <View style={{ marginTop: 28 }}>
            <View
              style={{
                flexDirection: "column",
                alignItems: "start",
                marginBottom: 4,
                marginTop: 12,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: "600",
                  marginBottom: 6,
                }}
              >
                Hobiler ({draftHobbies.length} seçildi)
              </Text>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                Hangi hobilerle ilgileniyorsan onları seç. Diğer kullanıcılar
                seni daha iyi tanımak için bu bilgileri kullanacak.
              </Text>
            </View>
            {hobbyGroups.map((group, gi) => (
              <View key={gi} style={{ marginTop: 16 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "600",
                    marginBottom: 30,
                    marginTop: 13,
                    textAlign: "center",
                  }}
                >
                  {group.category}
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {(group.hobbies || []).map((h, hi) => (
                    <HobbyPill
                      key={h.id}
                      hobby={h}
                      isSelected={draftHobbies.includes(h.id)}
                      onPress={toggleHobby}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Sigara */}
          {smokingOptions.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "start",
                  marginBottom: 10,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Sigara Kullanımı
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 15,
                    fontWeight: "500",
                    marginBottom: 12,
                  }}
                >
                  Sigara kullanım durumunu seç. Bu bilgi, sigara içen veya
                  içmeyen kullanıcıların birbirlerini daha kolay bulmasını
                  sağlar.
                </Text>
              </View>
              {smokingOptions.map((opt) => (
                <OptionListItem
                  key={opt.id}
                  option={opt}
                  isSelected={draftSmoking?.id === opt.id}
                  icon={Cigarette}
                  onPress={() =>
                    setDraftSmoking(draftSmoking?.id === opt.id ? null : opt)
                  }
                />
              ))}
            </View>
          )}

          {/* Burç */}
          {zodiacOptions.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "start",
                  marginBottom: 10,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Burç
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 15,
                    fontWeight: "500",
                    marginBottom: 12,
                  }}
                >
                  Burç seçimini yap. Bazı kullanıcılar için burç bilgisi, ortak
                  ilgi alanlarını keşfetmek açısından önemli olabilir.
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {zodiacOptions.map((opt) => {
                  const selected = draftZodiac?.id === opt.id;
                  const Icon = getZodiacIcon(opt.name);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={1}
                      onPress={() => setDraftZodiac(selected ? null : opt)}
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        paddingHorizontal: 12,
                        paddingVertical: 11,
                        borderWidth: 0.5,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        backgroundColor: selected ? "#fff" : "transparent",
                        borderColor: selected
                          ? "#fff"
                          : "rgba(255,255,255,0.1)",
                      }}
                    >
                      <Icon
                        size={20}
                        color={selected ? "#000" : "#9CA3AF"}
                        strokeWidth={1.5}
                      />
                      <Text
                        style={{
                          color: selected ? "#000" : "#9CA3AF",
                          fontSize: 14,
                          fontWeight: selected ? "500" : "500",
                        }}
                      >
                        {opt.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Kullanım amacı */}
          {usagePurposeOptions.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "start",
                  marginBottom: 10,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Kullanım Amacı
                </Text>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 15,
                    fontWeight: "500",
                    marginBottom: 12,
                  }}
                >
                  Lit'i hangi amaçla kullandığını seç.
                </Text>
              </View>
              {usagePurposeOptions.map((opt) => {
                const purposeMap = {
                  Flört: {
                    icon: Sparkles,
                    desc: "Hafif, eğlenceli ve heyecanlı bir bağlantı arıyorum.",
                  },
                  Arkadaşlık: {
                    icon: Users,
                    desc: "Yeni insanlarla tanışmak ve sosyal çevreyi genişletmek istiyorum.",
                  },
                  Network: {
                    icon: Briefcase,
                    desc: "Profesyonel bağlantılar kurmak ve iş dünyasında tanışmak istiyorum.",
                  },
                  Öylesine: {
                    icon: Wind,
                    desc: "Belirli bir beklentim yok, akışına bırakıyorum.",
                  },
                };

                return (
                  <OptionListItem
                    key={opt.id}
                    option={opt}
                    isSelected={draftUsagePurpose?.id === opt.id}
                    purposeMap={purposeMap}
                    onPress={() =>
                      setDraftUsagePurpose(
                        draftUsagePurpose?.id === opt.id ? null : opt,
                      )
                    }
                  />
                );
              })}
            </View>
          )}
        </ProfileEditModal>

        {/* ══ PREVİEW MODALI ══ */}
        <Modal
          visible={previewVisible}
          animationType="slide"
          onRequestClose={() => setPreviewVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#121212" }}>
            <View
              style={{ position: "absolute", top: 52, right: 16, zIndex: 100 }}
            >
              <TouchableOpacity
                onPress={() => setPreviewVisible(false)}
                style={{
                  backgroundColor: "rgba(0,0,0,0.5)",
                  borderRadius: 999,
                  padding: 9,
                }}
              >
                <X size={20} color="#fff" strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {previewProfile ? (
              <SwipeCard profile={previewProfile} hideActions />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
        </Modal>

        {/* ══ HESAP SİL MODALI ══ */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.65)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
            }}
          >
            <View
              style={{
                backgroundColor: "#1E1E1E",
                borderRadius: 28,
                padding: 24,
                width: "100%",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 22,
                  fontWeight: "800",
                  marginBottom: 6,
                }}
              >
                Hesabı Sil
              </Text>
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: 14,
                  marginBottom: 20,
                  lineHeight: 20,
                }}
              >
                Hesabınızı kalıcı olarak silmek için şifrenizi girin.
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: "#374151",
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  fontSize: 16,
                  color: "#fff",
                  marginBottom: 20,
                }}
                placeholder="Şifreniz"
                placeholderTextColor="#4B5563"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!deleteLoading}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowDeleteModal(false);
                    setPassword("");
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "#2A2A2A",
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                  disabled={deleteLoading}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    İptal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteAccount}
                  style={{
                    flex: 1,
                    backgroundColor: "#DC2626",
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      Sil
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </GestureHandlerRootView>
  );
}
