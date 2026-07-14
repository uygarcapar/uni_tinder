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
  ActivityIndicator,
  InteractionManager,
  Dimensions,
  Platform,
  Switch,
  type DimensionValue,
} from "react-native";
import { showInfoToast } from "@/shared/services/toaster";
import { Image } from "expo-image";
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
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
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
  Bird,
  Rabbit,
  Rat,
  Turtle,
  PawPrint,
  Ban,
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
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import LanguagePickerModal from "@/features/profile/components/LanguagePickerModal";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProfileFormSchema, EditProfileFormData } from "@/shared/schemas/formSchemas";
import { matchOption } from "@/features/profile/utils/hydrateProfileForm";
import { colors } from "../../../shared/theme/colors";

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
  Bird,
  Fish,
  Rabbit,
  Hamster: Rat,
  Reptile: Turtle,
  Turtle,
  None: X,
  Allergic: Ban,
  Other: PawPrint,
};
const getPetIcon = (enumName) => PET_ICON_MAP[enumName] || PawPrint;

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
        backgroundColor: isSelected ? colors.text : "transparent",
        borderColor: isSelected ? colors.text : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon
        size={20}
        color={isSelected ? "#000" : colors.textSecondary}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: isSelected ? "#000" : colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {hobby.name}
      </Text>
    </TouchableOpacity>
  );
});

function OptionPill({
  option,
  isSelected,
  onPress,
  Icon,
}: any) {
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => onPress(option)}
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
        backgroundColor: isSelected ? colors.text : "transparent",
        borderColor: isSelected ? colors.text : "rgba(255,255,255,0.1)",
      }}
    >
      {Icon ? (
        <Icon
          size={20}
          color={isSelected ? "#000" : colors.textSecondary}
          strokeWidth={1.5}
        />
      ) : null}
      <Text
        style={{
          color: isSelected ? "#000" : colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {option.name}
      </Text>
    </TouchableOpacity>
  );
}

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
          color={isSelected ? colors.text : colors.textMuted}
          strokeWidth={1.5}
          style={{ marginRight: 14 }}
        />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text
            style={{
              color: isSelected ? colors.text : colors.textSecondary,
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
        {isSelected && <Check size={20} color={colors.text} strokeWidth={2.5} />}
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
            color={isSelected ? colors.text : colors.textSecondary}
            strokeWidth={1.5}
          />
        )}
        <Text
          style={{
            color: isSelected ? colors.text : colors.textSecondary,
            fontSize: 15,
            fontWeight: "500",
          }}
        >
          {option.name}
        </Text>
      </View>
      {isSelected && <Check size={20} color={colors.text} strokeWidth={2.5} />}
    </TouchableOpacity>
  );
});

// ─── Photo grid components ─────────────────────────────────────────────────
// Photo yüklenirken absolute overlay olarak shimmer'lı SkelBox göster.
// SkelBox h:number bekliyor; foto cell'i %100 doldurduğu için absolute fill
// + onLayout ile genişlik/yükseklik ölçüp shimmer translate'i hesaplıyoruz.
function PhotoShimmer({ borderRadius = 0 }: { borderRadius?: number }) {
  const shimmer = useSharedValue(0);
  const widthSV = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (shimmer.value - 1) * widthSV.value }],
  }));

  return (
    <View
      pointerEvents="none"
      onLayout={(e) => {
        widthSV.value = e.nativeEvent.layout.width;
      }}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: "200%",
            height: "100%",
          },
          animStyle,
        ]}
      >
        <LinearGradient
          colors={[
            "transparent",
            "rgba(255,255,255,0.07)",
            "transparent",
            "rgba(255,255,255,0.07)",
            "transparent",
          ]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// expo-image — memory+disk cache → modal her açıldığında foto cache'ten anında
// gelir, ilk yüklemede shimmer gösterilir. Native cachePolicy reliable olduğu
// için RN Image'daki onLoad-cached-hit problemi ve 5s safety-net gerekmez.
function PhotoItem({ photo, onPress, savingPhoto }: any) {
  const [loading, setLoading] = useState(true);

  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 20,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}
      >
        <Image
          source={{ uri: photo.photoImageUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        {loading && <PhotoShimmer borderRadius={20} />}
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
          backgroundColor: colors.surface,
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
  const scale = useSharedValue(1);
  // zIndex'i state ile tutuyoruz, useAnimatedStyle'a sokmuyoruz. Fabric'te
  // zIndex layout property'sidir ve animated style içinde okunduğunda her
  // frame ShadowTree commit'i tetikler — 6 photo × her frame = saniyede
  // yüzlerce commit → react_native_assert "attempts < 1024" SIGABRT.
  const [dragZ, setDragZ] = useState(0);

  // ÖNCEKİ: mount'ta withSpring(translateX.value) no-op spring fırlatıyordu →
  // 12 paralel spring loop. Initial değer zaten doğru, spring'e gerek yok.

  useAnimatedReaction(
    () => positions.value[id],
    (newIndex, prev) => {
      // Initial fire'da (prev === null) ve değişiklik yoksa spring kurma —
      // mount sırasındaki gereksiz spring cascade'ini önler.
      if (newIndex === undefined) return;
      if (prev === undefined && newIndex === index) return;
      if (newIndex === prev) return;
      if (isDragging.value) return;
      const pos = getPosition(newIndex);
      translateX.value = withSpring(pos.x, SPRING_CONFIG);
      translateY.value = withSpring(pos.y, SPRING_CONFIG);
    },
  );

  // ÖNCESİ: useAnimatedReaction(isDragging) mount sırasında 6 photo × 1
  // worklet kaydı → reanimated başlangıç maliyeti. SONRASI: scale spring'i
  // ve dragZ state'i pan gesture handler'larında doğrudan tetikleniyor.
  // Mount'ta hiçbir worklet kayıt edilmiyor, drag feedback aynı.

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(220)
        .onStart(() => {
          isDragging.value = true;
          startX.value = translateX.value;
          startY.value = translateY.value;
          scale.value = withSpring(1.05, SPRING_CONFIG);
          runOnJS(setDragZ)(100);
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
          scale.value = withSpring(1, SPRING_CONFIG);
          runOnJS(setDragZ)(0);
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
      { scale: scale.value },
    ] as any,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[animatedStyle, { zIndex: dragZ }]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
});

// ─── Lightweight skeleton ──────────────────────────────────────────────────
// Modal açılırken parent tarafından render edilir. Heavy form mount'unu maskeler.
// Shimmer: tek shared value parent'tan paylaştırılır → tüm box'lar aynı
// driver'ı okur (her box ayrı shared value açmaz). Animasyon transform-only;
// layout commit tetiklemez, mount pressure'a katkı vermez.
//
// Gradient seamless loop: 200% genişlik + 2 peak (gradient_local 0.25 ve 0.75)
// → period box_width. translateX'i -box_width → 0 aralığında animate edip
// snap'lediğimizde peak hep aynı absolute pozisyona düşüyor, görsel kopukluk
// olmuyor. Naive tek-peak gradient cycle'ın %50'sinde görünmüyordu (band
// ekrandan çıkıp soldan tekrar girene kadar boşluk) → kullanıcıya "geri
// dönüş" gibi geliyordu. Şimdi her an visible area'da bir peak var, sürekli
// L→R akış.
function SkelBox({
  w,
  h,
  r = 8,
  mt = 0,
  mb = 0,
  shimmer,
}: {
  w?: DimensionValue;
  h: number;
  r?: number;
  mt?: number;
  mb?: number;
  shimmer: SharedValue<number>;
}) {
  const widthSV = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (shimmer.value - 1) * widthSV.value }],
  }));
  return (
    <View
      onLayout={(e) => {
        widthSV.value = e.nativeEvent.layout.width;
      }}
      style={{
        width: w ?? "100%",
        height: h,
        borderRadius: r,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        marginTop: mt,
        marginBottom: mb,
        overflow: "hidden",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: "200%",
            height: "100%",
          },
          animStyle,
        ]}
      >
        <LinearGradient
          colors={[
            "transparent",
            "rgba(255,255,255,0.07)",
            "transparent",
            "rgba(255,255,255,0.07)",
            "transparent",
          ]}
          locations={[0, 0.25, 0.5, 0.75, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

export function EditProfileFormSkeleton() {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer]);

  return (
    <>
      <SkelBox shimmer={shimmer} h={52} r={999} mt={8} mb={16} />
      <SkelBox shimmer={shimmer} w={130} h={22} r={6} mb={10} />
      <SkelBox shimmer={shimmer} w={"85%"} h={14} r={4} mb={14} />
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
                borderRadius: 28,
                borderCurve: "continuous",
              }}
            >
              <SkelBox
                shimmer={shimmer}
                w={ITEM_WIDTH}
                h={ITEM_HEIGHT}
                r={28}
              />
            </View>
          );
        })}
      </View>
      <SkelBox shimmer={shimmer} w={150} h={22} r={6} mt={28} mb={10} />
      <SkelBox shimmer={shimmer} h={100} r={30} />
      <SkelBox shimmer={shimmer} w={150} h={22} r={6} mt={28} mb={10} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <SkelBox key={i} shimmer={shimmer} h={56} r={36} mt={8} />
      ))}
      <SkelBox shimmer={shimmer} w={150} h={22} r={6} mt={28} mb={10} />
      <SkelBox shimmer={shimmer} h={58} r={999} mb={16} />
      <SkelBox shimmer={shimmer} h={58} r={999} />
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
  // ÖNCESİ: useSharedValue + useEffect(withTiming) + useAnimatedStyle ile
  // chevron 220ms easing'le dönüyordu. 9 accordion × 1 worklet seti = mount
  // sırasında 9 reanimated worklet kaydı → Fabric commit pressure'a katkı.
  // SONRASI: useState'in driven ettiği inline transform. Easing kayboldu,
  // chevron tap'te anında dönüyor — UX'te fark edilir değil.
  const chevStyle = {
    transform: [{ rotate: expanded ? "180deg" : "0deg" }],
  };

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
          <CategoryIcon size={18} color={colors.text} strokeWidth={1.5} />
          <Text
            style={{
              color: colors.text,
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
                backgroundColor: colors.error,
              }}
            />
          )}
        </View>
        <View style={chevStyle}>
          <ChevronDown size={18} color={colors.textSecondary} />
        </View>
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
    initialValues,
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
  // ── Form draft state ─────────────────────────────────────────────────────
  // initialValues parent (ProfileScreen) tarafından useMemo ile mount öncesi
  // hidrate edilir → form post-mount setValue/reset cascade'i olmadan dolu
  // doğar. Önceki tasarımda mount sonrası büyük bir hydration useEffect 30+
  // Controller'ı yeniden invalidate ediyordu; bu, Fabric ShadowTree'nin 1024
  // commit retry limitine baskı uygulayıp account-switch sonrası SIGABRT
  // crash'lerin asıl sebebiydi.
  const { control, getValues, setValue, trigger, watch, formState: { errors } } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: initialValues ?? {
      bio: "",
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

  // ── Progressive render ─────────────────────────────────────────────────
  // Tüm form'u tek React commit'inde mount edersek Fabric ShadowTree retry
  // limit'ini (1024) aşıyor → SIGABRT crash. Section'ları 4 frame'e bölüp
  // her rAF tick'te bir grup ekliyoruz; commit pressure dağılıyor.
  const [stage, setStage] = useState(1);
  useEffect(() => {
    if (stage >= 4) return;
    const id = requestAnimationFrame(() => setStage((s) => s + 1));
    return () => cancelAnimationFrame(id);
  }, [stage]);

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

  // ── Mount-once district fetch ───────────────────────────────────────────
  // initialValues.city parent'ta zaten hidrate edildiği için district fetch'i
  // izole tek bir mount-once effect'te yapıyoruz. Önceki tasarımda district
  // fetch hydration cascade'ine bağlıydı ve effect her option arrival'da yeniden
  // çalışabiliyordu. Şimdi: tek istek, finally'de cancel guard.
  useEffect(() => {
    const cityId = initialValues?.city?.id;
    if (cityId == null) return;
    let cancelled = false;
    setDistrictsLoading(true);
    api
      .get(API_ENDPOINTS.GET_DISTRICTS_BY_CITY(cityId))
      .then((res) => {
        if (cancelled) return;
        const list = res?.result ?? [];
        setDistrictOptions(list);
        setValue(
          "district",
          matchOption(list, myProfile?.district, myProfile?.districtDisplay),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDistrictOptions([]);
        setValue("district", null);
      })
      .finally(() => {
        if (!cancelled) setDistrictsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // mount-once: initialValues parent'ta key={myProfile.id} ile boundary'lendi
    // → bu component instance'ı boyunca initialValues.city sabit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Photo order: myProfile.photosList değişince (kullanıcı dirty değilse) sync
  // Stage 2'ye kadar SortablePhoto'lar render olmadığı için sync etmek
  // gereksiz; gate ekledik. İlk mount commit'i daha hafif geçer.
  useEffect(() => {
    if (stage < 2) return;
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
  }, [stage, myProfile?.photosList, photoOrderDirty, positions]);

  // ── Toggle callbacks ────────────────────────────────────────────────────
  const toggleHobby = useCallback((id) => {
    const prev = getValues("hobbies");
    if (prev.includes(id)) {
      setValue("hobbies", prev.filter((h) => h !== id));
    } else {
      if (prev.length >= 10) {
        showInfoToast({ title: "Sınır Aşıldı", message: "En fazla 10 hobi seçebilirsin.", variant: "error" });
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
        showInfoToast({ title: "Sınır Aşıldı", message: "En fazla 15 dil seçebilirsin.", variant: "error" });
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
        showInfoToast({ title: "Sınır Aşıldı", message: "En fazla 8 hayvan seçebilirsin.", variant: "error" });
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
      showInfoToast({ title: "Eksik Bilgi", message: "En az bir ilgi alanı seçmelisin.", variant: "error" });
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

      const updates: Record<string, unknown> = {
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
      showInfoToast({ title: "Hata", message: "Profil güncellenemedi, tekrar dene.", variant: "error" });
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

  // ── Render ─────────────────────────────────────────────────────────────
  // DEBUG: Languages section DEVRE DIŞI. Diğer her şey render ediliyor.
  return (
    // position:relative wrapper — skeleton overlay'in left:0/right:0'ı bu
    // View'a göre ölçer (scroll container'ın paddingHorizontal:20'sini
    // saymadan dışına taşmaz).
    <View style={{ position: "relative" }}>
      {/* Skeleton overlay — stage 4'e kadar form section'larının üzerini
          kapatır. Form section'ları arka planda progressive mount oluyor
          (display:none yapmadık çünkü o crash'e neden oluyordu — Yoga layout
          work'ü stage 4'e ertelenip tek commit'te patlıyor). Bu sefer
          section'lar görünür şekilde mount oluyor ama üstüne opak skeleton
          binmiş; kullanıcı pop-in görmez, modal ilk açıldığındaki gibi durur. */}
      {stage < 4 && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: colors.bg,
          }}
        >
          <EditProfileFormSkeleton />
        </View>
      )}

      {/* Kartımı Önizle — stage 1 */}
      {stage >= 1 && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPreview}
          style={{ marginTop: 8, marginBottom: 16 }}
        >
          <View
            className="border-[0.5px] border-white/10"
            style={{
              backgroundColor: colors.surface,
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
            <IdCardLanyard size={20} color={colors.textSecondary} strokeWidth={1.5} />
            <Text
              style={{ color: colors.textSecondary, fontWeight: "500", fontSize: 14 }}
            >
              İnsanlar beni nasıl görüyor?
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Fotoğraflar GRID — stage 2 */}
      {stage >= 2 && (
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
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
              Fotoğraflar
            </Text>
            {savingPhoto && <ActivityIndicator size="small" color={colors.textSecondary} />}
          </View>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
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
                      backgroundColor: colors.surface,
                      borderWidth: 0.5,
                      borderColor: "rgba(255,255,255,0.1)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <View className="flex justify-center items-center pointer-events-none">
                      <Plus size={40} strokeWidth={2} color={colors.textMuted} />
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
      )}

      {/* Biyografi — stage 1 */}
      {stage >= 1 && (
      <View style={{ marginTop: 28 }}>
        <View
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            marginBottom: 10,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            Biyografi
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
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
              placeholderTextColor={colors.textSecondary}
              style={{
                borderCurve: "continuous",
                overflow: "hidden",
                color: colors.text,
                fontSize: 15,
                lineHeight: 22,
                minHeight: 100,
                textAlignVertical: "top",
                borderRadius: 30,
                padding: 12,
                paddingLeft: 16,
                borderWidth: 0.5,
                borderColor: errors.bio
                  ? "rgba(239,68,68,0.5)"
                  : "rgba(255,255,255,0.1)",
              }}
            />
          )}
        />
        {errors.bio && (
          <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>
            {errors.bio.message}
          </Text>
        )}
      </View>
      )}

      {/* Kullanım amacı — stage 1 */}
      {stage >= 1 && usagePurposeOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Kullanım Amacı
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
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
                setValue(
                  "usagePurpose",
                  draftUsagePurpose?.id === opt.id ? null : opt,
                )
              }
            />
          ))}
        </View>
      )}

      {/* Hobiler — stage 3 */}
      {stage >= 3 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 4,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Hobiler ({draftHobbies.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
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
      )}

      {/* Sigara — stage 2 */}
      {stage >= 2 && smokingOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Sigara Kullanımı
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                Sigara kullanım durumunu seç.
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

      {/* Burç — stage 3 */}
      {stage >= 3 && zodiacOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Burç
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                Burç seçimini yap.
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
                    backgroundColor: selected ? colors.text : "transparent",
                    borderColor: selected ? colors.text : "rgba(255,255,255,0.1)",
                  }}
                >
                  <Icon
                    size={20}
                    color={selected ? "#000" : colors.textSecondary}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={{
                      color: selected ? "#000" : colors.textSecondary,
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

      {/* İlgi Alanı — stage 4 */}
      {stage >= 4 && interestedInOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              İlgi Alanı ({draftInterestedIn.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                Kiminle eşleşmek istediğini seç.
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

      {/* Şehir — stage 4 */}
      {stage >= 4 && cityOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Şehir
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                Bulunduğun şehri seç.
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
              <Navigation size={18} color={colors.textSecondary} strokeWidth={1.5} />
              <Text
                style={{
                  color: draftCity ? colors.text : colors.textSecondary,
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftCity?.name || "Şehir Seç"}
              </Text>
            </View>
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      )}

      {/* İlçe — stage 4 */}
      {stage >= 4 && draftCity && (
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
              <Navigation size={18} color={colors.textSecondary} strokeWidth={1.5} />
              <Text
                style={{
                  color: draftDistrict ? colors.text : colors.textSecondary,
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftDistrict?.name ||
                  (districtsLoading ? "Yükleniyor..." : "İlçe Seç")}
              </Text>
            </View>
            {districtsLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Konuşulan Diller — stage 4 */}
      {stage >= 4 && languageOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Konuşulan Diller ({draftLanguages.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
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
              <Languages size={18} color={colors.textSecondary} strokeWidth={1.5} />
              <Text
                style={{
                  color: draftLanguages.length > 0 ? colors.text : colors.textSecondary,
                  fontSize: 15,
                  fontWeight: "500",
                }}
              >
                {draftLanguages.length > 0
                  ? `${draftLanguages.length} dil seçildi`
                  : "Dil Seç"}
              </Text>
            </View>
            <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
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

      {/* Evcil Hayvanlar — stage 4 */}
      {stage >= 4 && petOptions.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "flex-start",
              marginBottom: 10,
              marginTop: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 20,
                fontWeight: "600",
                marginBottom: 6,
              }}
            >
              Evcil Hayvanlar ({draftPets.length} seçildi)
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <InfoIcon size={16} color={colors.textSecondary} />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
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

      {/* Görünürlük — stage 4 */}
      {stage >= 4 && (
      <View style={{ marginTop: 28 }}>
        <View
          style={{
            flexDirection: "column",
            alignItems: "flex-start",
            marginBottom: 10,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 20,
              fontWeight: "600",
              marginBottom: 6,
            }}
          >
            Görünürlük
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <InfoIcon size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
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
          <View
            key={row.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 99,
              borderCurve: "continuous",
              borderWidth: 0.5,
              borderColor: "rgba(255,255,255,0.1)",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
              {row.label}
            </Text>
            {Platform.OS === "ios" ? (
              // RN'in built-in Switch'i = native UISwitch wrapper. SwiftUI Toggle
              // + Host yolunu denedik: BottomSheet mount layout pass'iyle
              // senkronize olmuyor, ilk render'da Host bounds'u yanlış ölçülüp
              // toggle sağ-üste yapışıyor; OS bir layout invalidation tetikleyene
              // (örn. notification center pull) kadar düzelmiyor. iOS 26+ Liquid
              // Glass switch'lere uygulanmıyor (UISwitch design dili korunuyor),
              // bu yüzden görsel kayıp yok.
              <Switch
                value={row.value}
                onValueChange={(v) => setValue(row.field, v)}
                trackColor={{
                  false: "rgba(255,255,255,0.15)",
                  true: colors.successIos,
                }}
                thumbColor={colors.text}
                ios_backgroundColor="rgba(255,255,255,0.15)"
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setValue(row.field, !row.value)}
                style={{
                  width: 46,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: row.value ? colors.text : "rgba(255,255,255,0.15)",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: row.value ? "#000" : colors.textSecondary,
                    alignSelf: row.value ? "flex-end" : "flex-start",
                  }}
                />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
      )}

      {/* Picker sheets — stage 4, lazy mount (visible olunca render et) */}
      {stage >= 4 && (
        <>

      {cityPickerVisible && (
        <CityPickerModal
          visible={cityPickerVisible}
          onClose={() => setCityPickerVisible(false)}
          items={cityOptions}
          initialValue={draftCity?.enumName ?? ""}
          onConfirm={onCityConfirm}
        />
      )}

      {districtPickerVisible && (
        <AppBottomSheet
          visible={districtPickerVisible}
          onClose={() => setDistrictPickerVisible(false)}
          // CityPickerModal ile aynı: 75% normal, 90% klavye açıldığında
          // (keyboardBehavior="extend") otomatik en yüksek snap'e çıkar.
          snapPoints={["75%", "90%"]}
          backdrop="blur"
          backgroundStyle={{ borderRadius: 44 }}
          handleComponent={null}
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
      )}

      {languagePickerVisible && (
        <LanguagePickerModal
          visible={languagePickerVisible}
          onClose={() => setLanguagePickerVisible(false)}
          items={languageOptions}
          initialSelectedValues={draftLanguages.map((l) => l.enumName)}
          maxLimit={15}
          limitMsg="En fazla 15 dil seçebilirsin."
          onConfirm={onLanguageConfirm}
        />
      )}
        </>
      )}
    </View>
  );

});

export default EditProfileForm;
