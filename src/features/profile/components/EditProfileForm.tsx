import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  InteractionManager,
  Image,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
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
import {
  ChevronDown,
  Plus,
  X,
  Check,
  InfoIcon,
  Heart,
  Sparkles,
  Cigarette,
  Star,
  Navigation,
  Languages,
  User,
  UserRound,
  Users,
  Globe,
  Dog,
  Cat,
  Briefcase,
  Wind,
  Sun,
  Moon,
  Flame,
  Leaf,
  Scale,
  Zap,
  Droplets,
  Mountain,
  Fish,
  IdCardLanyard,
  Dumbbell,
  Footprints,
  Waves,
  Bike,
  Trees,
  HandMetal,
  Trophy,
  Music2,
  Utensils,
  Cake,
  Wine,
  Coffee,
  Soup,
  Sandwich,
  Camera,
  Palette,
  BookOpenCheck,
  Book,
  Flower2,
  ShoppingBag,
  Headphones,
  PartyPopper,
  Guitar,
  Piano,
  Mic2,
  Music,
  Plane,
  Tent,
  Sunrise,
  BookOpen,
  Theater,
  Drama,
  Film,
  Lightbulb,
  Gamepad2,
  Puzzle,
  Code,
  Smartphone,
  Newspaper,
  TrendingUp,
  Orbit,
} from "lucide-react-native";
import { API_ENDPOINTS } from "@/shared/constants/api";
import api from "@/shared/services/api";
import profileService from "@/features/profile/profileService";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SearchableListSheet from "@/shared/components/SearchableListSheet";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProfileFormSchema, EditProfileFormData } from "@/shared/schemas/formSchemas";

// ─── Reanimated Grid Hesaplamaları ─────────────────────────────────────────
const { width: WINDOW_WIDTH } = Dimensions.get("window");
const CONTAINER_PADDING = 20;
const AVAILABLE_WIDTH = WINDOW_WIDTH - CONTAINER_PADDING * 2;
const ITEM_WIDTH = AVAILABLE_WIDTH * 0.31;
const GAP = (AVAILABLE_WIDTH - 3 * ITEM_WIDTH) / 2;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const ROW_GAP = 20;
const SPRING_CONFIG = { damping: 22, stiffness: 140, mass: 1.4 };

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
  return Math.max(0, Math.min(row * 3 + col, maxIndex));
};

// ─── Icon haritaları ───────────────────────────────────────────────────────
const HOBBY_ICON_MAP = {
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
const getHobbyIcon = (name) => HOBBY_ICON_MAP[name] || Heart;

const ZODIAC_ICON_MAP = {
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
const getZodiacIcon = (name) => ZODIAC_ICON_MAP[name] || Star;

const INTERESTED_IN_ICON_MAP = {
  Men: User,
  Women: UserRound,
  NonBinary: Users,
};
const getInterestedInIcon = (enumName) =>
  INTERESTED_IN_ICON_MAP[enumName] || Heart;

const getLanguageIcon = (enumName) =>
  enumName === "Other" ? Globe : Languages;

// Hobi kategorisi → ikon. Backend kategori isimlerini Türkçe döndüğü için
// önce exact match, sonra keyword fallback. Tanınmayan kategori için Heart.
const HOBBY_CATEGORY_ICON_MAP = {
  "Spor & Fitness": Dumbbell,
  Spor: Dumbbell,
  Fitness: Dumbbell,
  "Yemek & İçecek": Utensils,
  Yemek: Utensils,
  Mutfak: Utensils,
  "Sanat & Yaratıcılık": Palette,
  Sanat: Palette,
  Müzik: Music,
  "Müzik & Konser": Music,
  "Seyahat & Doğa": Plane,
  Seyahat: Plane,
  Doğa: Trees,
  "Doğa & Açık Hava": Trees,
  "Okuma & Kültür": BookOpen,
  Kültür: Theater,
  "Sinema & Tiyatro": Film,
  "Oyun & Eğlence": Gamepad2,
  Oyun: Gamepad2,
  Eğlence: PartyPopper,
  "Yaşam Tarzı": Sparkles,
  Sosyal: Users,
  Topluluk: Users,
  Gönüllülük: Users,
  Hayvanlar: Dog,
  "Evcil Hayvanlar": Dog,
  "Bilim & Kariyer": Briefcase,
  Kariyer: Briefcase,
  Network: Briefcase,
  Teknoloji: Code,
};
const getHobbyCategoryIcon = (category) => {
  if (!category) return Heart;
  const exact = HOBBY_CATEGORY_ICON_MAP[category];
  if (exact) return exact;
  // Keyword fallback — kategori string'i map key'lerinden birini içeriyor mu?
  const lower = category.toLowerCase();
  for (const [key, Icon] of Object.entries(HOBBY_CATEGORY_ICON_MAP)) {
    if (lower.includes(key.toLowerCase())) return Icon;
  }
  return Heart;
};

const PET_ICON_MAP = {
  Dog,
  Cat,
  None: X,
  Allergic: X,
  Other: Sparkles,
};
const getPetIcon = (enumName) => PET_ICON_MAP[enumName] || Heart;

const PURPOSE_META = {
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

// ─── matchOption helper ────────────────────────────────────────────────────
const matchOption = (options, idValue, displayValue) => {
  if (!options?.length) return null;
  const byId = options.find((o) => o?.id === idValue);
  if (byId) return byId;
  const n = Number(idValue);
  if (Number.isFinite(n)) {
    const byNumId = options.find((o) => Number(o?.id) === n);
    if (byNumId) return byNumId;
  }
  const tryStr = (v) =>
    v &&
    options.find(
      (o) =>
        o?.enumName === v ||
        o?.name === v ||
        o?.display === v ||
        o?.displayName === v ||
        o?.label === v,
    );
  return tryStr(idValue) || tryStr(displayValue) || null;
};

// ─── Memoized pill / list-item components ──────────────────────────────────
const HobbyPill = React.memo(function HobbyPill({
  hobby,
  isSelected,
  onPress,
}: any) {
  const Icon = getHobbyIcon(hobby.name);
  const handlePress = useCallback(() => onPress(hobby.id), [onPress, hobby.id]);
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
        backgroundColor: isSelected ? "#fff" : "transparent",
        borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon
        size={20}
        color={isSelected ? "#000" : "#9CA3AF"}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: isSelected ? "#000" : "#9CA3AF",
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {hobby.name}
      </Text>
    </TouchableOpacity>
  );
});

const OptionPill = React.memo(function OptionPill({
  option,
  isSelected,
  onPress,
  Icon,
}: any) {
  const handlePress = useCallback(() => onPress(option), [onPress, option]);
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
        backgroundColor: isSelected ? "#fff" : "transparent",
        borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.1)",
      }}
    >
      {Icon && (
        <Icon
          size={20}
          color={isSelected ? "#000" : "#9CA3AF"}
          strokeWidth={1.5}
        />
      )}
      <Text
        style={{
          color: isSelected ? "#000" : "#9CA3AF",
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {option.name}
      </Text>
    </TouchableOpacity>
  );
});

const OptionListItem = React.memo(function OptionListItem({
  option,
  isSelected,
  onPress,
  icon: CustomIcon,
  purposeMap,
}: any) {
  if (purposeMap) {
    const entry = purposeMap[option.name];
    const Icon = entry?.icon ?? Star;
    const desc = entry?.desc;
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 14,
        }}
      >
        <Icon
          size={20}
          color={isSelected ? "#fff" : "#6B7280"}
          strokeWidth={1.5}
          style={{ marginRight: 14 }}
        />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            style={{
              color: isSelected ? "#fff" : "#9CA3AF",
              fontSize: 15,
              fontWeight: "500",
            }}
          >
            {option.name}
          </Text>
          {desc && (
            <Text
              style={{
                color: isSelected
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
        {isSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
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
            color={isSelected ? "#fff" : "#9CA3AF"}
            strokeWidth={1.5}
          />
        )}
        <Text
          style={{
            color: isSelected ? "#fff" : "#9CA3AF",
            fontSize: 15,
            fontWeight: "500",
          }}
        >
          {option.name}
        </Text>
      </View>
      {isSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
    </TouchableOpacity>
  );
});

// ─── Photo grid components ─────────────────────────────────────────────────
function PhotoItem({ photo, onPress, savingPhoto }: any) {
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
          borderRadius: 20,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: "#1E1E1E",
        }}
      >
        <Image
          source={{ uri: photo.photoImageUrl }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "#1E1E1E",
            }}
          />
        )}
      </View>
      <TouchableOpacity
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

const SortablePhoto = React.memo(function SortablePhoto({
  id,
  index,
  positions,
  maxIndex,
  children,
  onDragEnd,
}: any) {
  const isDragging = useSharedValue(false);
  const position = getPosition(index);
  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(translateX.value, SPRING_CONFIG);
    translateY.value = withSpring(translateY.value, SPRING_CONFIG);
  }, [translateX, translateY]);

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

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
          isDragging.value = true;
          startX.value = translateX.value;
          startY.value = translateY.value;
        })
        .onUpdate((event) => {
          translateX.value = startX.value + event.translationX;
          translateY.value = startY.value + event.translationY;

          const newIndex = getOrder(
            translateX.value,
            translateY.value,
            maxIndex,
          );
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
          runOnJS(onDragEnd)(positions.value, false);
          translateX.value = withSpring(finalPos.x, SPRING_CONFIG);
          translateY.value = withSpring(finalPos.y, SPRING_CONFIG, () => {
            runOnJS(onDragEnd)(positions.value, true);
          });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, maxIndex, onDragEnd],
  );

  const animatedStyle = useAnimatedStyle(() => ({
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
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
});

// ─── Skeleton primitives ───────────────────────────────────────────────────
// ProfileScreen'deki SkeletonBox ile birebir aynı: Reanimated translateX +
// LinearGradient ile shimmer. Form ilk açıldığında InteractionManager bittiğine
// kadar bu skeleton render edilir ve gerçek form ile aynı dikey ritmi tutar.
function SkeletonBox({ width: w, height: h, borderRadius = 8, style }: any) {
  const animW = typeof w === "number" ? w : WINDOW_WIDTH;
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

// Form skeleton — gerçek form bölümleriyle aynı dikey ritim ve genişlikler.
// İçerik animasyonu bittikten sonra bu component sökülür, gerçek form gelir.
function FormSkeleton() {
  // Pill row: flex-wrap pill grubunu simüle eder (random görünmeyen tekrar).
  const PillRow = ({ count = 6 }: any) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBox
          key={i}
          width={70 + ((i * 23) % 60)}
          height={42}
          borderRadius={999}
        />
      ))}
    </View>
  );

  const SectionHeader = () => (
    <View style={{ marginTop: 28, marginBottom: 14 }}>
      <SkeletonBox
        width={150}
        height={22}
        borderRadius={6}
        style={{ marginBottom: 10 }}
      />
      <SkeletonBox width={"85%"} height={14} borderRadius={4} />
    </View>
  );

  return (
    <>
      {/* Preview pill */}
      <SkeletonBox
        height={52}
        borderRadius={999}
        style={{ marginTop: 8, marginBottom: 16 }}
      />

      {/* Photos */}
      <View style={{ marginTop: 8 }}>
        <SkeletonBox
          width={130}
          height={22}
          borderRadius={6}
          style={{ marginBottom: 10 }}
        />
        <SkeletonBox
          width={"85%"}
          height={14}
          borderRadius={4}
          style={{ marginBottom: 14 }}
        />
        <View
          style={{
            position: "relative",
            width: "100%",
            height: 2 * ITEM_HEIGHT + ROW_GAP,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const pos = getPosition(idx);
            return (
              <View
                key={idx}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: ITEM_WIDTH,
                  height: ITEM_HEIGHT,
                }}
              >
                <SkeletonBox
                  width={ITEM_WIDTH}
                  height={ITEM_HEIGHT}
                  borderRadius={28}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* Bio */}
      <SectionHeader />
      <SkeletonBox height={100} borderRadius={30} />

      {/* Usage Purpose — 4 list items */}
      <SectionHeader />
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
          }}
        >
          <SkeletonBox width={20} height={20} borderRadius={6} />
          <View style={{ flex: 1 }}>
            <SkeletonBox
              width={"60%"}
              height={16}
              borderRadius={4}
              style={{ marginBottom: 6 }}
            />
            <SkeletonBox width={"85%"} height={12} borderRadius={4} />
          </View>
        </View>
      ))}

      {/* Hobiler — accordion kartları */}
      <SectionHeader />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <SkeletonBox
          key={i}
          height={56}
          borderRadius={36}
          style={{ marginTop: 8 }}
        />
      ))}

      {/* Sigara — 4 list items */}
      <SectionHeader />
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            paddingVertical: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <SkeletonBox width={16} height={16} borderRadius={4} />
          <SkeletonBox width={140} height={16} borderRadius={4} />
        </View>
      ))}

      {/* Burç — pill grid */}
      <SectionHeader />
      <PillRow count={12} />

      {/* İlgi Alanı */}
      <SectionHeader />
      <PillRow count={5} />

      {/* Şehir + İlçe */}
      <SectionHeader />
      <SkeletonBox
        height={58}
        borderRadius={999}
        style={{ marginBottom: 16 }}
      />
      <SkeletonBox height={58} borderRadius={999} />

      {/* Diller */}
      <SectionHeader />
      <SkeletonBox height={58} borderRadius={999} />

      {/* Pets */}
      <SectionHeader />
      <PillRow count={6} />

      {/* Görünürlük — 3 toggle row */}
      <SectionHeader />
      {[0, 1, 2].map((i) => (
        <SkeletonBox
          key={i}
          height={56}
          borderRadius={16}
          style={{ marginBottom: 8 }}
        />
      ))}
    </>
  );
}

// ─── Hobby Accordion: tıklanmadan içerik render edilmez ────────────────────
const HobbyGroupAccordion = React.memo(function HobbyGroupAccordion({
  group,
  selectedIds,
  onToggle,
  defaultExpanded,
}: any) {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const rotation = useSharedValue(defaultExpanded ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, rotation]);

  const chevStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const selectedCount = useMemo(
    () =>
      (group.hobbies || []).filter((h) => selectedIds.includes(h.id)).length,
    [group.hobbies, selectedIds],
  );

  const handleToggle = useCallback(() => setExpanded((e) => !e), []);

  const CategoryIcon = useMemo(
    () => getHobbyCategoryIcon(group.category),
    [group.category],
  );

  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 36,
        borderCurve: "continuous",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        overflow: "hidden",
        backgroundColor: "transparent",
      }}
    >
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        style={{
          padding: 16,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            flex: 1,
          }}
        >
          <CategoryIcon size={18} color="#fff" strokeWidth={1.5} />
          <Text
            style={{
              color: "#fff",
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {group.category}
          </Text>
          {selectedCount > 0 && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#EF4444",
              }}
            />
          )}
        </View>
        <Animated.View style={chevStyle}>
          <ChevronDown size={18} color="#9CA3AF" />
        </Animated.View>
      </TouchableOpacity>

      {/* Sadece expanded ise render et — collapse'da DOM ağaçtan çıkar */}
      {expanded && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingBottom: 16,
            paddingTop: 4,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {(group.hobbies || []).map((h) => (
            <HobbyPill
              key={h.id}
              hobby={h}
              isSelected={selectedIds.includes(h.id)}
              onPress={onToggle}
            />
          ))}
        </View>
      )}
    </View>
  );
});

// ─── Form ──────────────────────────────────────────────────────────────────
const EditProfileForm = forwardRef(function EditProfileForm(
  {
    myProfile,
    hobbyGroups,
    smokingOptions,
    zodiacOptions,
    usagePurposeOptions,
    interestedInOptions,
    cityOptions,
    languageOptions,
    petOptions,
    savingPhoto,
    onAddPhoto,
    onPhotoPress,
    onPreview,
    onSavingChange,
    onSaved,
  }: any,
  ref,
) {
  // ── Lazy render: modal açılış animasyonu bitmeden ağır içeriği çizmiyoruz.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setReady(true);
    });
    return () => task.cancel?.();
  }, []);

  // ── Form draft state ─────────────────────────────────────────────────────
  const { control, getValues, setValue, trigger, watch, formState: { errors } } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: {
      bio: myProfile?.bio || "",
      hobbies: [],
      smoking: null,
      zodiac: null,
      usagePurpose: null,
      interestedIn: [],
      city: null,
      district: null,
      languages: [],
      pets: [],
      showMyUniversity: true,
      showMeOnApp: true,
      showAge: true,
    },
  });

  const draftHobbies = watch("hobbies");
  const draftSmoking = watch("smoking");
  const draftZodiac = watch("zodiac");
  const draftUsagePurpose = watch("usagePurpose");
  const draftInterestedIn = watch("interestedIn");
  const draftCity = watch("city");
  const draftDistrict = watch("district");
  const draftLanguages = watch("languages");
  const draftPets = watch("pets");
  const draftShowMyUniversity = watch("showMyUniversity");
  const draftShowMeOnApp = watch("showMeOnApp");
  const draftShowAge = watch("showAge");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── District (city'ye bağlı) ────────────────────────────────────────────
  const [districtOptions, setDistrictOptions] = useState([]);
  const [districtsLoading, setDistrictsLoading] = useState(false);

  // ── Picker sheet visibility ─────────────────────────────────────────────
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  // ── Photo grid (draft order) ────────────────────────────────────────────
  const [draftPhotoOrder, setDraftPhotoOrder] = useState([]);
  const draftPhotoOrderRef = useRef([]);
  const [photoOrderDirty, setPhotoOrderDirty] = useState(false);
  const photoOrderDirtyRef = useRef(false);
  const positions = useSharedValue({});

  useEffect(() => {
    draftPhotoOrderRef.current = draftPhotoOrder;
  }, [draftPhotoOrder]);
  useEffect(() => {
    photoOrderDirtyRef.current = photoOrderDirty;
  }, [photoOrderDirty]);

  // ── Hydrate from myProfile (mount + props change) ───────────────────────
  // myProfile her değiştiğinde değil, ilk geldiğinde / id değişince hydrate et.
  // Kullanıcının yaptığı değişikliği clobber etmesin diye effect içinde sadece
  // boş/null draft'ları doldur.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!myProfile || hydratedRef.current) return;
    hydratedRef.current = true;

    setValue("bio", myProfile?.bio || "");

    // Hobi ID'lerini normalize et
    const lookupToId = {};
    hobbyGroups.forEach((g) => {
      (g.hobbies || []).forEach((h) => {
        if (h?.id == null) return;
        if (h.enumName) lookupToId[h.enumName] = h.id;
        if (h.name) lookupToId[h.name] = h.id;
      });
    });
    const rawIds = (myProfile?.hobbies || [])
      .map((h) => {
        if (typeof h === "number") return h;
        if (h && typeof h === "object" && h.id != null) return Number(h.id);
        const n = Number(h);
        if (Number.isFinite(n)) return n;
        return lookupToId[h] ?? null;
      })
      .filter((id) => Number.isFinite(id));
    setValue("hobbies", rawIds);

    setValue("smoking",
      matchOption(
        smokingOptions,
        myProfile?.smokingStatus,
        myProfile?.smokingStatusDisplay,
      ),
    );
    setValue("zodiac",
      matchOption(
        zodiacOptions,
        myProfile?.zodiacSign,
        myProfile?.zodiacSignDisplay,
      ),
    );
    setValue("usagePurpose",
      matchOption(
        usagePurposeOptions,
        myProfile?.usagePurpose,
        myProfile?.usagePurposeDisplay,
      ),
    );

    const matchMulti = (options, raws) => {
      if (!Array.isArray(raws) || !options?.length) return [];
      return raws
        .map((raw) =>
          matchOption(
            options,
            typeof raw === "object" ? (raw?.id ?? raw?.enumName) : raw,
            typeof raw === "object" ? (raw?.name ?? raw?.displayName) : raw,
          ),
        )
        .filter(Boolean);
    };
    setValue("interestedIn",
      matchMulti(interestedInOptions, myProfile?.interestedIn),
    );
    setValue("languages", matchMulti(languageOptions, myProfile?.spokenLanguages));
    setValue("pets", matchMulti(petOptions, myProfile?.pets));

    const cityOpt = matchOption(
      cityOptions,
      myProfile?.city,
      myProfile?.cityDisplay,
    );
    setValue("city", cityOpt);
    if (cityOpt?.id != null) {
      setDistrictsLoading(true);
      api
        .get(API_ENDPOINTS.GET_DISTRICTS_BY_CITY(cityOpt.id))
        .then((res) => {
          const list = res?.result ?? [];
          setDistrictOptions(list);
          setValue("district",
            matchOption(list, myProfile?.district, myProfile?.districtDisplay),
          );
        })
        .catch(() => {
          setDistrictOptions([]);
          setValue("district", null);
        })
        .finally(() => setDistrictsLoading(false));
    }

    setValue("showMyUniversity", myProfile?.showMyUniversity !== false);
    setValue("showMeOnApp", myProfile?.showMeOnApp !== false);
    setValue("showAge", myProfile?.showAge !== false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile]);

  // ── Defensive late-hydration: options sonradan yüklenirse boş draft'ları doldur
  useEffect(() => {
    if (!myProfile) return;

    if (
      !draftCity &&
      cityOptions.length > 0 &&
      (myProfile.city || myProfile.cityDisplay)
    ) {
      const opt = matchOption(
        cityOptions,
        myProfile.city,
        myProfile.cityDisplay,
      );
      if (opt) {
        setValue("city", opt);
        setDistrictsLoading(true);
        api
          .get(API_ENDPOINTS.GET_DISTRICTS_BY_CITY(opt.id))
          .then((res) => {
            const list = res?.result ?? [];
            setDistrictOptions(list);
            setValue("district",
              matchOption(list, myProfile.district, myProfile.districtDisplay),
            );
          })
          .catch(() => {})
          .finally(() => setDistrictsLoading(false));
      }
    }

    if (
      draftInterestedIn.length === 0 &&
      interestedInOptions.length > 0 &&
      myProfile.interestedIn?.length > 0
    ) {
      const matched = myProfile.interestedIn
        .map((raw) =>
          matchOption(
            interestedInOptions,
            typeof raw === "object" ? (raw?.id ?? raw?.enumName) : raw,
            typeof raw === "object" ? raw?.name : raw,
          ),
        )
        .filter(Boolean);
      if (matched.length > 0) setValue("interestedIn", matched);
    }

    if (
      draftLanguages.length === 0 &&
      languageOptions.length > 0 &&
      myProfile.spokenLanguages?.length > 0
    ) {
      const matched = myProfile.spokenLanguages
        .map((raw) =>
          matchOption(
            languageOptions,
            typeof raw === "object" ? (raw?.id ?? raw?.enumName) : raw,
            typeof raw === "object" ? raw?.name : raw,
          ),
        )
        .filter(Boolean);
      if (matched.length > 0) setValue("languages", matched);
    }

    if (
      draftPets.length === 0 &&
      petOptions.length > 0 &&
      myProfile.pets?.length > 0
    ) {
      const matched = myProfile.pets
        .map((raw) =>
          matchOption(
            petOptions,
            typeof raw === "object" ? (raw?.id ?? raw?.enumName) : raw,
            typeof raw === "object" ? raw?.name : raw,
          ),
        )
        .filter(Boolean);
      if (matched.length > 0) setValue("pets", matched);
    }
  }, [
    myProfile,
    cityOptions,
    interestedInOptions,
    languageOptions,
    petOptions,
    draftCity,
    draftInterestedIn.length,
    draftLanguages.length,
    draftPets.length,
  ]);

  // ── Photo order: myProfile.photosList değişince (kullanıcı dirty değilse) sync
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

  // ── Toggle callbacks ────────────────────────────────────────────────────
  const toggleHobby = useCallback((id) => {
    const prev = getValues("hobbies");
    if (prev.includes(id)) {
      setValue("hobbies", prev.filter((h) => h !== id));
    } else {
      if (prev.length >= 10) {
        Alert.alert("Sınır Aşıldı", "En fazla 10 hobi seçebilirsin.");
        return;
      }
      setValue("hobbies", [...prev, id]);
    }
  }, [getValues, setValue]);

  const toggleInterestedIn = useCallback((opt) => {
    if (!opt) return;
    const prev = getValues("interestedIn");
    if (prev.some((p) => p?.id === opt.id)) {
      setValue("interestedIn", prev.filter((p) => p?.id !== opt.id));
    } else {
      setValue("interestedIn", [...prev, opt]);
    }
  }, [getValues, setValue]);

  const toggleLanguage = useCallback((opt) => {
    if (!opt) return;
    const prev = getValues("languages");
    if (prev.some((p) => p?.id === opt.id)) {
      setValue("languages", prev.filter((p) => p?.id !== opt.id));
    } else {
      if (prev.length >= 15) {
        Alert.alert("Sınır Aşıldı", "En fazla 15 dil seçebilirsin.");
        return;
      }
      setValue("languages", [...prev, opt]);
    }
  }, [getValues, setValue]);

  const togglePet = useCallback((opt) => {
    if (!opt) return;
    const prev = getValues("pets");
    if (prev.some((p) => p?.id === opt.id)) {
      setValue("pets", prev.filter((p) => p?.id !== opt.id));
    } else {
      if (prev.length >= 8) {
        Alert.alert("Sınır Aşıldı", "En fazla 8 hayvan seçebilirsin.");
        return;
      }
      setValue("pets", [...prev, opt]);
    }
  }, [getValues, setValue]);

  const applyCity = useCallback(
    (opt) => {
      const currentCity = getValues("city");
      if (!opt || opt.id === currentCity?.id) return;
      setValue("city", opt);
      setValue("district", null);
      setDistrictOptions([]);
      setDistrictsLoading(true);
      api
        .get(API_ENDPOINTS.GET_DISTRICTS_BY_CITY(opt.id))
        .then((res) => setDistrictOptions(res?.result ?? []))
        .catch(() => setDistrictOptions([]))
        .finally(() => setDistrictsLoading(false));
    },
    [getValues, setValue],
  );

  // ── Photo drag end ──────────────────────────────────────────────────────
  const handleDragEnd = useCallback((newPositions, commit) => {
    const current = draftPhotoOrderRef.current;
    const newOrder = [...current].sort(
      (a, b) => newPositions[a.photoId] - newPositions[b.photoId],
    );
    const isChanged = newOrder.some((p, i) => p.photoId !== current[i].photoId);
    if (!commit) {
      if (!isChanged) return;
      draftPhotoOrderRef.current = newOrder;
      photoOrderDirtyRef.current = true;
      return;
    }
    if (!isChanged && draftPhotoOrderRef.current === current) return;
    setDraftPhotoOrder(draftPhotoOrderRef.current);
    if (photoOrderDirtyRef.current) setPhotoOrderDirty(true);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (savingProfile) return;
    const isValid = await trigger("interestedIn");
    if (!isValid) {
      Alert.alert("Eksik Bilgi", "En az bir ilgi alanı seçmelisin.");
      return;
    }
    setSavingProfile(true);
    onSavingChange?.(true);
    try {
      const enumOf = (opt) =>
        opt?.enumName ??
        opt?.enumValue ??
        opt?.value ??
        opt?.code ??
        opt?.key ??
        opt?.name;

      const {
        bio,
        hobbies: hobbyIds,
        smoking: draftSmoking,
        zodiac: draftZodiac,
        usagePurpose: draftUsagePurpose,
        interestedIn: draftInterestedIn,
        city: draftCity,
        district: draftDistrict,
        languages: draftLanguages,
        pets: draftPets,
        showMyUniversity: draftShowMyUniversity,
        showMeOnApp: draftShowMeOnApp,
        showAge: draftShowAge,
      } = getValues();

      const allHobbies = hobbyGroups.flatMap((g) => g.hobbies || []);
      const hobbyEnums = hobbyIds
        .map((id) => {
          const h = allHobbies.find((x) => x.id === id);
          return h ? enumOf(h) : null;
        })
        .filter(Boolean);

      const updates = {
        Bio: bio,
        ...(hobbyEnums.length > 0
          ? { Hobbies: hobbyEnums }
          : { ClearHobbies: true }),
      };

      if (draftSmoking != null) updates.SmokingStatus = enumOf(draftSmoking);
      else if (myProfile?.smokingStatus != null)
        updates.ClearSmokingStatus = true;

      if (draftZodiac != null) updates.ZodiacSign = enumOf(draftZodiac);
      else if (myProfile?.zodiacSign != null) updates.ClearZodiacSign = true;

      if (draftUsagePurpose != null)
        updates.UsagePurpose = enumOf(draftUsagePurpose);
      else if (myProfile?.usagePurpose != null)
        updates.ClearUsagePurpose = true;

      updates.InterestedIn = draftInterestedIn.map(enumOf).filter(Boolean);

      if (draftCity != null) updates.City = enumOf(draftCity);
      else if (myProfile?.city != null) updates.ClearCity = true;

      if (draftDistrict != null && draftCity != null)
        updates.District = enumOf(draftDistrict);
      else if (myProfile?.district != null) updates.ClearDistrict = true;

      if (draftLanguages.length > 0)
        updates.SpokenLanguages = draftLanguages.map(enumOf).filter(Boolean);
      else if (myProfile?.spokenLanguages?.length > 0)
        updates.ClearSpokenLanguages = true;

      if (draftPets.length > 0)
        updates.Pets = draftPets.map(enumOf).filter(Boolean);
      else if (myProfile?.pets?.length > 0) updates.ClearPets = true;

      updates.ShowMyUniversity = draftShowMyUniversity;
      updates.ShowMeOnApp = draftShowMeOnApp;
      updates.ShowAge = draftShowAge;

      const orderToSave = draftPhotoOrderRef.current;
      if (photoOrderDirtyRef.current && orderToSave.length > 0) {
        updates.PhotoOrders = orderToSave.map((p, i) => ({
          photoId: p.photoId,
          newOrder: i + 1,
        }));
        const originalMain = myProfile?.photosList?.find((p) => p.isMainPhoto);
        if (orderToSave[0]?.photoId !== originalMain?.photoId) {
          updates.NewMainPhotoId = orderToSave[0].photoId;
        }
      }

      await profileService.updateProfile(updates);

      // Optimistic patch — parent myProfile cache'ini günceller
      const idToEnum = {};
      allHobbies.forEach((h) => {
        if (h?.id != null && h?.enumName) idToEnum[h.id] = h.enumName;
      });
      const optimisticPatch = {
        bio,
        hobbies: hobbyIds.map((id) => idToEnum[id]).filter(Boolean),
        smokingStatus: enumOf(draftSmoking) ?? null,
        smokingStatusDisplay: draftSmoking?.name ?? null,
        zodiacSign: enumOf(draftZodiac) ?? null,
        zodiacSignDisplay: draftZodiac?.name ?? null,
        usagePurpose: enumOf(draftUsagePurpose) ?? null,
        usagePurposeDisplay: draftUsagePurpose?.name ?? null,
        interestedIn: draftInterestedIn.map(enumOf).filter(Boolean),
        city: enumOf(draftCity) ?? null,
        cityDisplay: draftCity?.name ?? null,
        district: enumOf(draftDistrict) ?? null,
        districtDisplay: draftDistrict?.name ?? null,
        spokenLanguages: draftLanguages.map(enumOf).filter(Boolean),
        pets: draftPets.map(enumOf).filter(Boolean),
        showMyUniversity: draftShowMyUniversity,
        showMeOnApp: draftShowMeOnApp,
        showAge: draftShowAge,
      };

      setPhotoOrderDirty(false);
      photoOrderDirtyRef.current = false;
      onSaved?.(optimisticPatch);
    } catch (e) {
      console.error(
        "Profil güncelleme hatası:",
        JSON.stringify(e?.response?.data || e?.message || e),
      );
      Alert.alert("Hata", "Profil güncellenemedi, tekrar dene.");
    } finally {
      setSavingProfile(false);
      onSavingChange?.(false);
    }
  }, [savingProfile, trigger, getValues, hobbyGroups, myProfile, onSavingChange, onSaved]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  // ── Picker callbacks ────────────────────────────────────────────────────
  const onCityConfirm = useCallback(
    (enumName) => {
      setCityPickerVisible(false);
      if (!enumName) return;
      const item = cityOptions.find((c) => c.enumName === enumName);
      if (item) applyCity(item);
    },
    [cityOptions, applyCity],
  );
  const onDistrictConfirm = useCallback(
    (enumName) => {
      setDistrictPickerVisible(false);
      if (!enumName) return;
      const item = districtOptions.find((d) => d.enumName === enumName);
      if (item) setValue("district", item);
    },
    [districtOptions, setValue],
  );
  const onLanguageConfirm = useCallback(
    (enumNames) => {
      setLanguagePickerVisible(false);
      const set = new Set(enumNames);
      setValue("languages", languageOptions.filter((o) => set.has(o.enumName)));
    },
    [languageOptions, setValue],
  );

  // ── Lazy gate: form ile aynı yapıda skeleton shimmer. InteractionManager
  // bittikten sonra gerçek form mount edilir.
  if (!ready) {
    return <FormSkeleton />;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* Kartımı Önizle */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPreview}
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
          <Text style={{ color: "#9CA3AF", fontWeight: "500", fontSize: 14 }}>
            İnsanlar beni nasıl görüyor?
          </Text>
        </View>
      </TouchableOpacity>

      {/* Fotoğraflar GRID */}
      <View style={{ marginTop: 8 }}>
        <View
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "600" }}>
              Fotoğraflar
            </Text>
            {savingPhoto && <ActivityIndicator size="small" color="#9CA3AF" />}
          </View>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color="#9CA3AF" />
            <Text style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}>
              Sıralamak için basılı tut ve sürükle. İlk fotoğrafın ana
              fotoğrafın olur.
            </Text>
          </View>
        </View>

        <View
          style={{
            position: "relative",
            width: "100%",
            height: getContainerHeight(draftPhotoOrder.length),
          }}
        >
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
                    onPress={onAddPhoto}
                    disabled={savingPhoto}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 28,
                      borderCurve: "continuous",
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

          {draftPhotoOrder.map((photo, index) => (
            <SortablePhoto
              key={`${photo.photoId}-${photo.photoImageUrl}`}
              id={photo.photoId}
              index={index}
              positions={positions}
              maxIndex={draftPhotoOrder.length - 1}
              onDragEnd={handleDragEnd}
            >
              <PhotoItem
                photo={photo}
                onPress={onPhotoPress}
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
              fontSize: 20,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            Biyografi
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color="#9CA3AF" />
            <Text style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}>
              Kendini tanıtabileceğin kısa bir biyografi yazabilirsin. Neler
              yaptığından bahset.
            </Text>
          </View>
        </View>
        <Controller
          control={control}
          name="bio"
          render={({ field: { onChange, value } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
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
                borderColor: errors.bio ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)",
              }}
            />
          )}
        />
        {errors.bio && (
          <Text style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>{errors.bio.message}</Text>
        )}
      </View>

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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Kullanım Amacı
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Lit'i hangi amaçla kullandığını seç.
              </Text>
            </View>
          </View>
          {usagePurposeOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftUsagePurpose?.id === opt.id}
              purposeMap={PURPOSE_META}
              onPress={() =>
                setValue("usagePurpose",
                  draftUsagePurpose?.id === opt.id ? null : opt,
                )
              }
            />
          ))}
        </View>
      )}

      {/* Hobiler — Accordion per category (sadece açıkken pill'ler render) */}
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
              fontSize: 20,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            Hobiler ({draftHobbies.length} seçildi)
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color="#9CA3AF" />
            <Text style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}>
              Kategoriye dokun, içindeki hobilerden seç. En fazla 10.
            </Text>
          </View>
        </View>
        {hobbyGroups.map((group, gi) => (
          <HobbyGroupAccordion
            key={group.category ?? gi}
            group={group}
            selectedIds={draftHobbies}
            onToggle={toggleHobby}
          />
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Sigara Kullanımı
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Sigara kullanım durumunu seç. Bu bilgi, sigara içen veya içmeyen
                kullanıcıların birbirlerini daha kolay bulmasını sağlar.
              </Text>
            </View>
          </View>
          {smokingOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftSmoking?.id === opt.id}
              icon={Cigarette}
              onPress={() =>
                setValue("smoking", draftSmoking?.id === opt.id ? null : opt)
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Burç
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Burç seçimini yap. Bazı kullanıcılar için burç bilgisi, ortak
                ilgi alanlarını keşfetmek açısından önemli olabilir.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {zodiacOptions.map((opt) => {
              const selected = draftZodiac?.id === opt.id;
              const Icon = getZodiacIcon(opt.name);
              return (
                <TouchableOpacity
                  key={opt.id}
                  activeOpacity={1}
                  onPress={() => setValue("zodiac", selected ? null : opt)}
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
                    borderColor: selected ? "#fff" : "rgba(255,255,255,0.1)",
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
                      fontWeight: "500",
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

      {/* İlgi Alanı */}
      {interestedInOptions.length > 0 && (
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              İlgi Alanı ({draftInterestedIn.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Kiminle eşleşmek istediğini seç. En az bir seçenek zorunlu.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {interestedInOptions.map((opt) => (
              <OptionPill
                key={opt.id}
                option={opt}
                isSelected={draftInterestedIn.some((p) => p?.id === opt.id)}
                onPress={toggleInterestedIn}
                Icon={getInterestedInIcon(opt.enumName)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Şehir */}
      {cityOptions.length > 0 && (
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Şehir
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Bulunduğun şehri seç. İlçe seçimi şehre bağlı olarak
                güncellenir.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setCityPickerVisible(true)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <Navigation size={18} color="#9CA3AF" strokeWidth={1.5} />
              <Text
                style={{
                  color: draftCity ? "#fff" : "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftCity?.name || "Şehir Seç"}
              </Text>
            </View>
            <ChevronDown size={18} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      {/* İlçe */}
      {draftCity && (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (districtOptions.length === 0) return;
              setDistrictPickerVisible(true);
            }}
            disabled={districtsLoading || districtOptions.length === 0}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity:
                districtsLoading || districtOptions.length === 0 ? 0.5 : 1,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <Navigation size={18} color="#9CA3AF" strokeWidth={1.5} />
              <Text
                style={{
                  color: draftDistrict ? "#fff" : "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftDistrict?.name ||
                  (districtsLoading ? "Yükleniyor..." : "İlçe Seç")}
              </Text>
            </View>
            {districtsLoading ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : (
              <ChevronDown size={18} color="#9CA3AF" strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Konuşulan Diller */}
      {languageOptions.length > 0 && (
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Konuşulan Diller ({draftLanguages.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Konuştuğun dilleri seç (en fazla 15).
              </Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setLanguagePickerVisible(true)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              paddingHorizontal: 16,
              paddingVertical: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flex: 1,
              }}
            >
              <Languages size={18} color="#9CA3AF" strokeWidth={1.5} />
              <Text
                style={{
                  color: draftLanguages.length > 0 ? "#fff" : "#9CA3AF",
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftLanguages.length > 0
                  ? `${draftLanguages.length} dil seçildi`
                  : "Dil Seç"}
              </Text>
            </View>
            <ChevronDown size={18} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>
          {draftLanguages.length > 0 && (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 12,
              }}
            >
              {draftLanguages.map((opt) => (
                <OptionPill
                  key={opt.id}
                  option={opt}
                  isSelected
                  onPress={toggleLanguage}
                  Icon={getLanguageIcon(opt.enumName)}
                />
              ))}
            </View>
          )}
        </View>
      )}

      {/* Evcil Hayvanlar */}
      {petOptions.length > 0 && (
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
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Evcil Hayvanlar ({draftPets.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color="#9CA3AF" />
              <Text
                style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}
              >
                Birlikte yaşadığın hayvanları seç (en fazla 8).
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {petOptions.map((opt) => (
              <OptionPill
                key={opt.id}
                option={opt}
                isSelected={draftPets.some((p) => p?.id === opt.id)}
                onPress={togglePet}
                Icon={getPetIcon(opt.enumName)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Görünürlük */}
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
              fontSize: 20,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            Görünürlük
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color="#9CA3AF" />
            <Text style={{ color: "#9CA3AF", fontSize: 14, fontWeight: "400" }}>
              Profilinde hangi bilgilerin başkalarına gösterileceğini sen
              belirle.
            </Text>
          </View>
        </View>
        {[
          {
            key: "uni",
            label: "Üniversitemi göster",
            value: draftShowMyUniversity,
            field: "showMyUniversity" as const,
          },
          {
            key: "app",
            label: "Beni uygulamada göster",
            value: draftShowMeOnApp,
            field: "showMeOnApp" as const,
          },
          {
            key: "age",
            label: "Yaşımı göster",
            value: draftShowAge,
            field: "showAge" as const,
          },
        ].map((row) => (
          <TouchableOpacity
            key={row.key}
            activeOpacity={0.7}
            onPress={() => setValue(row.field, !row.value)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 16,
              borderCurve: "continuous",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              marginBottom: 8,
              backgroundColor: "#1E1E1E",
            }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "500" }}>
              {row.label}
            </Text>
            <View
              style={{
                width: 46,
                height: 28,
                borderRadius: 999,
                backgroundColor: row.value ? "#fff" : "rgba(255,255,255,0.15)",
                justifyContent: "center",
                paddingHorizontal: 3,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: row.value ? "#000" : "#9CA3AF",
                  alignSelf: row.value ? "flex-end" : "flex-start",
                }}
              />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══ Picker sheets (portal-based, modal'ın üstüne stack'lenir) ══ */}
      <AppBottomSheet
        visible={cityPickerVisible}
        onClose={() => setCityPickerVisible(false)}
        snapPoints={["75%"]}
        backdrop="blur"
        backgroundStyle={{ borderRadius: 44 }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        stackBehavior="push"
      >
        <SearchableListSheet
          items={cityOptions}
          initialValue={draftCity?.enumName ?? ""}
          title="Şehir Seç"
          onConfirm={onCityConfirm}
          onCancel={() => setCityPickerVisible(false)}
        />
      </AppBottomSheet>

      <AppBottomSheet
        visible={districtPickerVisible}
        onClose={() => setDistrictPickerVisible(false)}
        snapPoints={["75%"]}
        backdrop="blur"
        backgroundStyle={{ borderRadius: 44 }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        stackBehavior="push"
      >
        <SearchableListSheet
          items={districtOptions}
          initialValue={draftDistrict?.enumName ?? ""}
          title="İlçe Seç"
          onConfirm={onDistrictConfirm}
          onCancel={() => setDistrictPickerVisible(false)}
        />
      </AppBottomSheet>

      <AppBottomSheet
        visible={languagePickerVisible}
        onClose={() => setLanguagePickerVisible(false)}
        snapPoints={["75%"]}
        backdrop="blur"
        backgroundStyle={{ borderRadius: 44 }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        stackBehavior="push"
      >
        <SearchableListSheet
          items={languageOptions}
          multi
          initialSelectedValues={draftLanguages.map((l) => l.enumName)}
          maxLimit={15}
          limitMsg="En fazla 15 dil seçebilirsin."
          title="Dil Seç"
          onConfirm={onLanguageConfirm}
          onCancel={() => setLanguagePickerVisible(false)}
        />
      </AppBottomSheet>
    </>
  );
});

export default EditProfileForm;
