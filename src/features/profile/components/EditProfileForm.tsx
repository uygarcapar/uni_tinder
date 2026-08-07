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
  Dimensions,
  Platform,
  Switch,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
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
  Trees,
  Utensils,
  Palette,
  PartyPopper,
  Music,
  Plane,
  BookOpen,
  Theater,
  Film,
  Lightbulb,
  Gamepad2,
  Code,
  type LucideIcon,
} from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { getRelationshipIntentIcon } from "@/shared/constants/relationshipIntent";
import profileService from "@/features/profile/profileService";
import LanguagePickerModal from "@/features/profile/components/LanguagePickerModal";
import GenderCategoryPicker from "@/shared/components/GenderCategoryPicker";
import { resolveLocalized } from "@/shared/queries/commonQueries";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProfileFormSchema, EditProfileFormData } from "@/shared/schemas/formSchemas";
import { useTranslation } from "react-i18next";
import { colors } from "../../../shared/theme/colors";
import HobbyIcon from "@/shared/components/HobbyIcon";

// ─── Reanimated Grid Hesaplamaları ─────────────────────────────────────────
const { width: WINDOW_WIDTH } = Dimensions.get("window");
const CONTAINER_PADDING = 20;
const AVAILABLE_WIDTH = WINDOW_WIDTH - CONTAINER_PADDING * 2;
const ITEM_WIDTH = AVAILABLE_WIDTH * 0.31;
const GAP = (AVAILABLE_WIDTH - 3 * ITEM_WIDTH) / 2;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const ROW_GAP = 20;
const SPRING_CONFIG = { damping: 22, stiffness: 140, mass: 1.4 };

// Edit formu ilk kez mount edildi mi? İlk mount progressive (stage 1→4, skeleton);
// sonraki her mount doğrudan stage 4 → anında tam form (skeleton/pop-in yok).
// Modül seviyesi olduğu için remount'lar arası yaşar.
let editFormWarmedUp = false;

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
// iOS'ta SF Symbol, Android'de lucide fallback. `sf` opsiyonel — SF karşılığı
// olmayan ikonlar (ör. Rat) her iki platformda da lucide render edilir.
type IconEntry = { sf?: SFSymbol; lucide: LucideIcon };

function EntryIcon({
  entry,
  size,
  color,
  strokeWidth = 1.5,
  style,
}: {
  entry: IconEntry;
  size: number;
  color: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (!entry.sf) {
    const Lucide = entry.lucide;
    return (
      <Lucide size={size} color={color} strokeWidth={strokeWidth} style={style} />
    );
  }
  return (
    <SFIcon
      name={entry.sf}
      fallback={entry.lucide}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}

const ZODIAC_ICON_MAP: Record<string, IconEntry> = {
  // Backend enumName (PascalCase)
  Aries: { sf: "flame.fill", lucide: Flame },
  Taurus: { sf: "leaf.fill", lucide: Leaf },
  Gemini: { sf: "wind", lucide: Wind },
  Cancer: { sf: "moon.fill", lucide: Moon },
  Leo: { sf: "sun.max.fill", lucide: Sun },
  Virgo: { sf: "leaf.fill", lucide: Leaf },
  Libra: { sf: "scalemass.fill", lucide: Scale },
  Scorpio: { sf: "bolt.fill", lucide: Zap },
  Sagittarius: { sf: "location.fill", lucide: Navigation },
  Capricorn: { sf: "mountain.2.fill", lucide: Mountain },
  Aquarius: { sf: "drop.fill", lucide: Droplets },
  Pisces: { sf: "fish.fill", lucide: Fish },
  // Legacy TR display fallback
  Koç: { sf: "flame.fill", lucide: Flame },
  Boğa: { sf: "leaf.fill", lucide: Leaf },
  İkizler: { sf: "wind", lucide: Wind },
  Yengeç: { sf: "moon.fill", lucide: Moon },
  Aslan: { sf: "sun.max.fill", lucide: Sun },
  Başak: { sf: "leaf.fill", lucide: Leaf },
  Terazi: { sf: "scalemass.fill", lucide: Scale },
  Akrep: { sf: "bolt.fill", lucide: Zap },
  Yay: { sf: "location.fill", lucide: Navigation },
  Oğlak: { sf: "mountain.2.fill", lucide: Mountain },
  Kova: { sf: "drop.fill", lucide: Droplets },
  Balık: { sf: "fish.fill", lucide: Fish },
};
const STAR_ICON: IconEntry = { sf: "star.fill", lucide: Star };
const getZodiacIcon = (name): IconEntry => ZODIAC_ICON_MAP[name] || STAR_ICON;

const GLOBE_ICON: IconEntry = { sf: "globe", lucide: Globe };
const LANGUAGES_ICON: IconEntry = { sf: "character.bubble", lucide: Languages };
const getLanguageIcon = (enumName): IconEntry =>
  enumName === "Other" ? GLOBE_ICON : LANGUAGES_ICON;

// Hobi kategorisi → ikon. Backend kategori isimlerini Türkçe döndüğü için
// önce exact match, sonra keyword fallback. Tanınmayan kategori için Heart.
const DUMBBELL_ICON: IconEntry = { sf: "dumbbell.fill", lucide: Dumbbell };
const UTENSILS_ICON: IconEntry = { sf: "fork.knife", lucide: Utensils };
const PALETTE_ICON: IconEntry = { sf: "paintpalette.fill", lucide: Palette };
const MUSIC_ICON: IconEntry = { sf: "music.note", lucide: Music };
const TREES_ICON: IconEntry = { sf: "tree.fill", lucide: Trees };
const BOOK_ICON: IconEntry = { sf: "book.fill", lucide: BookOpen };
const GAMEPAD_ICON: IconEntry = { sf: "gamecontroller.fill", lucide: Gamepad2 };
const USERS_ICON: IconEntry = { sf: "person.2.fill", lucide: Users };
const PLANE_ICON: IconEntry = { sf: "airplane", lucide: Plane };
const SPARKLES_ICON: IconEntry = { sf: "sparkles", lucide: Sparkles };
const DOG_ICON: IconEntry = { sf: "dog.fill", lucide: Dog };
const BRIEFCASE_ICON: IconEntry = { sf: "briefcase.fill", lucide: Briefcase };
const HEART_ICON: IconEntry = { sf: "heart", lucide: Heart };
const CIGARETTE_ICON: IconEntry = { sf: "smoke.fill", lucide: Cigarette };
const HOBBY_CATEGORY_ICON_MAP: Record<string, IconEntry> = {
  // Backend categoryEnumName (9 confirmed slugs)
  SportsFitness: DUMBBELL_ICON,
  FoodDrink: UTENSILS_ICON,
  ArtCreativity: PALETTE_ICON,
  MusicConcerts: MUSIC_ICON,
  NatureAdventure: TREES_ICON,
  CultureLearning: BOOK_ICON,
  GamingTech: GAMEPAD_ICON,
  SocialLifestyle: USERS_ICON,
  Intellectual: { sf: "lightbulb.fill", lucide: Lightbulb },
  // Legacy TR display keys
  "Spor & Fitness": DUMBBELL_ICON,
  Spor: DUMBBELL_ICON,
  Fitness: DUMBBELL_ICON,
  "Yemek & İçecek": UTENSILS_ICON,
  Yemek: UTENSILS_ICON,
  Mutfak: UTENSILS_ICON,
  "Sanat & Yaratıcılık": PALETTE_ICON,
  Sanat: PALETTE_ICON,
  Müzik: MUSIC_ICON,
  "Müzik & Konser": MUSIC_ICON,
  "Seyahat & Doğa": PLANE_ICON,
  Seyahat: PLANE_ICON,
  Doğa: TREES_ICON,
  "Doğa & Açık Hava": TREES_ICON,
  "Okuma & Kültür": BOOK_ICON,
  Kültür: { sf: "theatermasks.fill", lucide: Theater },
  "Sinema & Tiyatro": { sf: "film.fill", lucide: Film },
  "Oyun & Eğlence": GAMEPAD_ICON,
  Oyun: GAMEPAD_ICON,
  Eğlence: { sf: "party.popper.fill", lucide: PartyPopper },
  "Yaşam Tarzı": SPARKLES_ICON,
  Sosyal: USERS_ICON,
  Topluluk: USERS_ICON,
  Gönüllülük: USERS_ICON,
  Hayvanlar: DOG_ICON,
  "Evcil Hayvanlar": DOG_ICON,
  "Bilim & Kariyer": BRIEFCASE_ICON,
  Kariyer: BRIEFCASE_ICON,
  Teknoloji: {
    sf: "chevron.left.forwardslash.chevron.right",
    lucide: Code,
  },
};
const getHobbyCategoryIcon = (category): IconEntry => {
  if (!category) return HEART_ICON;
  const exact = HOBBY_CATEGORY_ICON_MAP[category];
  if (exact) return exact;
  // Keyword fallback — kategori string'i map key'lerinden birini içeriyor mu?
  const lower = category.toLowerCase();
  for (const [key, entry] of Object.entries(HOBBY_CATEGORY_ICON_MAP)) {
    if (lower.includes(key.toLowerCase())) return entry;
  }
  return HEART_ICON;
};

const PAWPRINT_ICON: IconEntry = { sf: "pawprint.fill", lucide: PawPrint };
const PET_ICON_MAP: Record<string, IconEntry> = {
  Dog: DOG_ICON,
  Cat: { sf: "cat.fill", lucide: Cat },
  Bird: { sf: "bird.fill", lucide: Bird },
  Fish: { sf: "fish.fill", lucide: Fish },
  Rabbit: { sf: "hare.fill", lucide: Rabbit },
  // Rat/hamster'ın SF karşılığı yok — her iki platformda lucide render edilir.
  Hamster: { lucide: Rat },
  Reptile: { sf: "tortoise.fill", lucide: Turtle },
  Horse: PAWPRINT_ICON,
  Exotic: SPARKLES_ICON,
  None: { sf: "xmark", lucide: X },
  Allergic: { sf: "nosign", lucide: Ban },
  Other: PAWPRINT_ICON,
};
const getPetIcon = (enumName): IconEntry =>
  PET_ICON_MAP[enumName] || PAWPRINT_ICON;

const WIND_ICON: IconEntry = { sf: "wind", lucide: Wind };
const PURPOSE_META: Record<
  string,
  { icon: IconEntry; purposeDescKey: string }
> = {
  // Backend enumName (PascalCase)
  Dating: {
    icon: SPARKLES_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.flort',
  },
  Friendship: {
    icon: USERS_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.arkadashlik',
  },
  Networking: {
    icon: BRIEFCASE_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.network',
  },
  JustLooking: {
    icon: WIND_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.oylesine',
  },
  // enumName gelmezse display metnine düşen fallback — her iki dil de dolu
  // olmalı, yoksa eksik dilde ikon/açıklama kayboluyor.
  Flört: {
    icon: SPARKLES_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.flort',
  },
  Arkadaşlık: {
    icon: USERS_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.arkadashlik',
  },
  Network: {
    icon: BRIEFCASE_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.network',
  },
  Öylesine: {
    icon: WIND_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.oylesine',
  },
  'Just Looking': {
    icon: WIND_ICON,
    purposeDescKey: 'profile.edit.purposeDesc.oylesine',
  },
};

// ─── Memoized pill / list-item components ──────────────────────────────────
const HobbyPill = React.memo(function HobbyPill({
  hobby,
  isSelected,
  onPress,
}: any) {
  const { i18n } = useTranslation();
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
        paddingVertical: 9,
        borderWidth: 0.5,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: isSelected ? colors.text : "transparent",
        borderColor: isSelected ? colors.text : "rgba(255,255,255,0.1)",
      }}
    >
      <HobbyIcon
        hobby={hobby.enumName ?? hobby.name}
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
        {resolveLocalized(hobby.display, i18n.language, hobby.name)}
      </Text>
    </TouchableOpacity>
  );
});

function OptionPill({
  option,
  isSelected,
  onPress,
  icon,
}: any) {
  const { i18n } = useTranslation();
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
      {icon ? (
        <EntryIcon
          entry={icon}
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
        {resolveLocalized(option.display, i18n.language, option.name)}
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
  const { t, i18n } = useTranslation();
  if (purposeMap) {
    // enumName ile anahtarla — `name` enum lookup'larında backend'in GetDisplay()
    // çıktısı, yani Accept-Language'e göre değişiyor. name ile anahtarlarsak
    // eşleşme dile bağlı kalıyordu (TR'de "Network", EN'de "Just Looking"
    // map'te yok → ikonsuz/açıklamasız satır). enumName stabil sözleşme.
    const entry = purposeMap[option.enumName ?? option.name];
    const iconEntry = entry?.icon ?? STAR_ICON;
    const desc = entry?.purposeDescKey ? t(entry.purposeDescKey) : undefined;
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
        <EntryIcon
          entry={iconEntry}
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
            {resolveLocalized(option.display, i18n.language, option.name)}
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
        {isSelected && (
        <SFIcon
          name="checkmark"
          fallback={Check}
          size={20}
          color={colors.text}
          strokeWidth={2.5}
          weight="bold"
        />
      )}
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
          <EntryIcon
            entry={CustomIcon}
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
          {resolveLocalized(option.display, i18n.language, option.name)}
        </Text>
      </View>
      {isSelected && (
        <SFIcon
          name="checkmark"
          fallback={Check}
          size={20}
          color={colors.text}
          strokeWidth={2.5}
          weight="bold"
        />
      )}
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
          <SFIcon
            name="xmark"
            fallback={X}
            size={16}
            strokeWidth={3}
            color="#7a7d82"
            weight="bold"
          />
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
  const { i18n } = useTranslation();
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

  const categoryIcon = useMemo(
    () => getHobbyCategoryIcon(group.categoryEnumName ?? group.category),
    [group.categoryEnumName, group.category],
  );

  return (
    <View
      style={{
        marginTop: 8,
        backgroundColor: "transparent",
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.08)",
      }}
    >
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        style={{
          paddingVertical: 16,
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
          <EntryIcon
            entry={categoryIcon}
            size={18}
            color={colors.text}
            strokeWidth={1.5}
          />
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {resolveLocalized(group.categoryDisplay, i18n.language, group.category)}
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
          <SFIcon
            name="chevron.down"
            fallback={ChevronDown}
            size={18}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
        </View>
      </TouchableOpacity>

      {/* Sadece expanded ise render et — collapse'da DOM ağaçtan çıkar */}
      {expanded && (
        <View
          style={{
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
    relationshipIntentOptions = [],
    languageOptions,
    petOptions,
    genderCategories = [],
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
  const { t, i18n } = useTranslation();
  const { control, getValues, setValue, watch, formState: { errors } } = useForm<EditProfileFormData>({
    resolver: zodResolver(editProfileFormSchema),
    defaultValues: initialValues ?? {
      bio: "",
      hobbies: [],
      smoking: null,
      zodiac: null,
      usagePurpose: null,
      relationshipIntent: null,
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
  const draftRelationshipIntent = watch("relationshipIntent");
  const draftLanguages = watch("languages");
  const draftPets = watch("pets");
  const draftShowMyUniversity = watch("showMyUniversity");
  const draftShowMeOnApp = watch("showMeOnApp");
  const draftShowAge = watch("showAge");
  const [savingProfile, setSavingProfile] = useState(false);

  // ── Cinsiyet ────────────────────────────────────────────────────────────
  // Kayıtta (RegisterStep7) seçilen kimlik alanı; artık buradan da değiştirilebiliyor.
  // Form şemasına değil ayrı state'e bağlı: tek bir enumName string'i, hydration
  // gerektirmiyor. Parent formu key={myProfile.id} ile mount ettiği için
  // myProfile ilk render'da hazır.
  const [draftGender, setDraftGender] = useState<string>(
    () => myProfile?.gender ?? "",
  );

  // ── Picker sheet visibility ─────────────────────────────────────────────
  // Şehir/ilçe picker'ları KALDIRILDI: konum artık kullanıcı seçimi değil,
  // backend'in app-open heartbeat'inden (POST /api/profile/location) türettiği
  // sonuç. UpdateProfile bu alanları hiç kabul etmiyor.
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  // ── Progressive render ─────────────────────────────────────────────────
  // İLK açılışta tüm form'u tek React commit'inde mount edersek Fabric
  // ShadowTree retry limit'ini (1024) aşıyor → SIGABRT. O yüzden section'ları
  // 4 frame'e bölüp her rAF tick'te bir grup ekliyoruz; commit pressure dağılır.
  // SONRAKİ açılışlar (edit modalı bottom-sheet olduğu için remount olur) doğrudan
  // stage 4'ten başlar → skeleton yok, staged pop-in yok, form anında tam mount
  // olur. Bu, "1 kere açtım, tekrar açınca baştan renderlanıyor + skeleton'da
  // kilitleniyor" şikayetini çözer. İlk mount app'i "ısıttığı" ve o ana kadar
  // veriler cache'lendiği (districtCache, initialValues) için reopen tek-commit
  // mount'u güvenle kaldırır.
  const [stage, setStage] = useState(editFormWarmedUp ? 4 : 1);
  useEffect(() => {
    editFormWarmedUp = true;
  }, []);
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
        showInfoToast({ title: t('profile.edit.limitTitle'), message: t('profile.edit.limitHobbies'), variant: "error" });
        return;
      }
      setValue("hobbies", [...prev, id]);
    }
  }, [getValues, setValue]);

  const toggleLanguage = useCallback((opt) => {
    if (!opt) return;
    const prev = getValues("languages");
    if (prev.some((p) => p?.id === opt.id)) {
      setValue("languages", prev.filter((p) => p?.id !== opt.id));
    } else {
      if (prev.length >= 15) {
        showInfoToast({ title: t('profile.edit.limitTitle'), message: t('profile.edit.limitLanguages'), variant: "error" });
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
        showInfoToast({ title: t('profile.edit.limitTitle'), message: t('profile.edit.limitPets'), variant: "error" });
        return;
      }
      setValue("pets", [...prev, opt]);
    }
  }, [getValues, setValue]);

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
    setSavingProfile(true);
    onSavingChange?.(true);
    try {
      // `name`e ASLA düşme: UpdateProfile [FromForm] olduğu için JsonStringEnum-
      // Converter devrede değil, form binder yalnızca enum ÜYE ADINI veya ordinal
      // int'i tanıyor. `name` ise backend'in GetDisplay() çıktısı (lokalize metin)
      // → binder parse edemez, alanı sessizce düşürür (200 döner, kaydolmaz).
      // Şehir bug'ının sınıfı buydu; enumName yoksa alan hiç gitmesin.
      const enumOf = (opt) =>
        opt?.enumName ?? opt?.enumValue ?? opt?.value ?? opt?.code ?? opt?.key;

      const {
        bio,
        hobbies: hobbyIds,
        smoking: draftSmoking,
        zodiac: draftZodiac,
        usagePurpose: draftUsagePurpose,
        relationshipIntent: draftRelationshipIntent,
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

      // İlişki niyeti — partial-update semantiği diğer enum alanlarla aynı:
      // alanı hiç göndermemek "değiştirme" demek, o yüzden seçim kaldırıldığında
      // ClearRelationshipIntent=true gitmeli (null göndermek yetmez).
      if (draftRelationshipIntent != null)
        updates.RelationshipIntent = enumOf(draftRelationshipIntent);
      else if (myProfile?.relationshipIntent != null)
        updates.ClearRelationshipIntent = true;

      // InterestedIn artık gönderilmiyor — swipe filtresine taşındı; backend
      // UpdateProfile'da bu alanı yok sayıyor.

      // Cinsiyet: yalnızca değiştiyse gönder (null/alan yok = değiştirme).
      // Backend değişince InvalidatePoolAsync çağırıyor — cinsiyet reciprocity'yi
      // etkilediği için (HardFilterStage viewer'ın kategorisine bakıyor) aday
      // havuzu yenilenmeli.
      if (draftGender && draftGender !== myProfile?.gender) {
        updates.Gender = draftGender;
      }

      // City/District/Latitude/Longitude UpdateProfile'dan KALDIRILDI. Konum
      // artık yalnızca app-open heartbeat'iyle (POST /api/profile/location)
      // güncelleniyor ve şehir/ilçe backend'de koordinattan türetiliyor —
      // buradan göndermenin hiçbir etkisi yok.

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
        smokingStatusDisplay: draftSmoking
          ? resolveLocalized(draftSmoking.display, i18n.language, draftSmoking.name)
          : null,
        zodiacSign: enumOf(draftZodiac) ?? null,
        zodiacSignDisplay: draftZodiac
          ? resolveLocalized(draftZodiac.display, i18n.language, draftZodiac.name)
          : null,
        usagePurpose: enumOf(draftUsagePurpose) ?? null,
        usagePurposeDisplay: draftUsagePurpose
          ? resolveLocalized(draftUsagePurpose.display, i18n.language, draftUsagePurpose.name)
          : null,
        relationshipIntent: enumOf(draftRelationshipIntent) ?? null,
        relationshipIntentDisplay: draftRelationshipIntent
          ? resolveLocalized(
              draftRelationshipIntent.display,
              i18n.language,
              draftRelationshipIntent.name,
            )
          : null,
        // city/cityDisplay/district/districtDisplay patch'lenmiyor: bu form artık
        // konumu değiştirmiyor, myProfile'daki mevcut değerler olduğu gibi kalmalı.
        spokenLanguages: draftLanguages.map(enumOf).filter(Boolean),
        pets: draftPets.map(enumOf).filter(Boolean),
        showMyUniversity: draftShowMyUniversity,
        showMeOnApp: draftShowMeOnApp,
        showAge: draftShowAge,
        // Cinsiyet enumName + görünen ad; ProfileScreen refetch'ten önce doğru
        // etiketi göstersin diye display'i kategori listesinden çözüyoruz.
        // NOT: `display` çift dilli { tr, en } objesi — resolveLocalized ile
        // string'e çevrilmeden patch'lenirse ekranda React child hatası olur.
        gender: draftGender || myProfile?.gender || null,
        genderDisplay: (() => {
          const sub = genderCategories
            .flatMap((c: any) => c.subGenders ?? [])
            .find((sg: any) => sg.enumName === draftGender);
          if (!sub) return myProfile?.genderDisplay ?? null;
          return resolveLocalized(sub.display, i18n.language, sub.name);
        })(),
      };

      setPhotoOrderDirty(false);
      photoOrderDirtyRef.current = false;
      onSaved?.(optimisticPatch);
    } catch (e) {
      console.error(
        "Profil güncelleme hatası:",
        JSON.stringify(e?.response?.data || e?.message || e),
      );
      showInfoToast({ title: t('common.error'), message: t('profile.edit.updateError'), variant: "error" });
    } finally {
      setSavingProfile(false);
      onSavingChange?.(false);
    }
  }, [
    savingProfile,
    getValues,
    hobbyGroups,
    myProfile,
    draftGender,
    genderCategories,
    i18n.language,
    onSavingChange,
    onSaved,
  ]);

  useImperativeHandle(ref, () => ({ submit }), [submit]);

  // ── Picker callbacks ────────────────────────────────────────────────────
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
            <SFIcon
              name="lanyardcard.fill"
              fallback={IdCardLanyard}
              size={20}
              color={colors.textSecondary}
              strokeWidth={1.5}
            />
            <Text
              style={{ color: colors.textSecondary, fontWeight: "500", fontSize: 14 }}
            >
              {t('profile.edit.previewButton')}
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
              {t('profile.edit.photosTitle')}
            </Text>
            {savingPhoto && <ActivityIndicator size="small" color={colors.textSecondary} />}
          </View>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
              {t('profile.edit.photosHint')}
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
                      <SFIcon
                        name="plus"
                        fallback={Plus}
                        size={40}
                        strokeWidth={2}
                        color={colors.textMuted}
                        weight="semibold"
                      />
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
            {t('profile.edit.bioTitle')}
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
              {t('profile.edit.bioDesc')}
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
              placeholder={t('profile.edit.bioPlaceholder')}
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
              {t('profile.edit.usagePurposeTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.usagePurposeDesc')}
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

      {/* İlişki niyeti — stage 1. Tek seçim; seçili satıra tekrar basmak
          temizler (submit'te ClearRelationshipIntent=true gider). */}
      {stage >= 1 && relationshipIntentOptions.length > 0 && (
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
              {t('profile.edit.relationshipIntentTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.relationshipIntentDesc')}
              </Text>
            </View>
          </View>
          {relationshipIntentOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftRelationshipIntent?.id === opt.id}
              icon={getRelationshipIntentIcon(opt.enumName)}
              onPress={() =>
                setValue(
                  "relationshipIntent",
                  draftRelationshipIntent?.id === opt.id ? null : opt,
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
              {t('profile.edit.hobbiesTitle', { count: draftHobbies.length })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.hobbiesHint')}
              </Text>
            </View>
          </View>
          {hobbyGroups.map((group, gi) => (
            <HobbyGroupAccordion
              key={group.categoryEnumName ?? group.category ?? gi}
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
              {t('profile.edit.smokingTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.smokingDesc')}
              </Text>
            </View>
          </View>
          {smokingOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftSmoking?.id === opt.id}
              icon={CIGARETTE_ICON}
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
              {t('profile.edit.zodiacTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.zodiacDesc')}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {zodiacOptions.map((opt) => {
              const selected = draftZodiac?.id === opt.id;
              const zodiacIcon = getZodiacIcon(opt.enumName ?? opt.name);
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
                  <EntryIcon
                    entry={zodiacIcon}
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
                    {resolveLocalized(opt.display, i18n.language, opt.name)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* İlgi Alanı (InterestedIn) buradan kaldırıldı — artık profil alanı değil,
          Discover > Filtreler altında bir swipe filtresi (bkz. FilterModal).
          Cinsiyet ise tam tersi: kimlik alanı olduğu için burada. */}

      {/* Cinsiyet — stage 4. Picker RegisterStep7 ile paylaşılan component. */}
      {stage >= 4 && genderCategories.length > 0 && (
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
              {t('profile.edit.genderTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.genderDesc')}
              </Text>
            </View>
          </View>
          <GenderCategoryPicker
            categories={genderCategories}
            value={draftGender}
            onChange={setDraftGender}
          />
        </View>
      )}

      {/* Konum — stage 4. Salt-okunur: şehir/ilçe kullanıcı seçimi değil,
          backend'in app-open heartbeat'indeki koordinattan türettiği sonuç. */}
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
              {t('profile.edit.locationTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.locationDesc')}
              </Text>
            </View>
          </View>
          <View
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
              gap: 8,
            }}
          >
            <Navigation size={18} color={colors.textSecondary} strokeWidth={1.5} />
            <Text
              style={{
                color: myProfile?.cityDisplay ? colors.text : colors.textSecondary,
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              {myProfile?.cityDisplay
                ? [myProfile?.districtDisplay, myProfile?.cityDisplay].filter(Boolean).join(", ")
                : t('profile.edit.locationPending')}
            </Text>
          </View>
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
              {t('profile.edit.languagesTitle', { count: draftLanguages.length })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.languagesDesc')}
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
                  ? t('profile.edit.languagesSelected', { count: draftLanguages.length })
                  : t('profile.edit.selectLanguage')}
              </Text>
            </View>
            <SFIcon name="chevron.down" fallback={ChevronDown} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
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
                  icon={getLanguageIcon(opt.enumName)}
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
              {t('profile.edit.petsTitle', { count: draftPets.length })}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.petsDesc')}
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
                icon={getPetIcon(opt.enumName)}
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
            {t('profile.edit.visibility.title')}
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
              {t('profile.edit.visibility.description')}
            </Text>
          </View>
        </View>
        {[
          {
            key: "uni",
            label: t('profile.edit.visibility.showUniversity'),
            value: draftShowMyUniversity,
            field: "showMyUniversity" as const,
          },
          {
            key: "app",
            label: t('profile.edit.visibility.showOnApp'),
            value: draftShowMeOnApp,
            field: "showMeOnApp" as const,
          },
          {
            key: "age",
            label: t('profile.edit.visibility.showAge'),
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

      {languagePickerVisible && (
        <LanguagePickerModal
          visible={languagePickerVisible}
          onClose={() => setLanguagePickerVisible(false)}
          items={languageOptions}
          initialSelectedValues={draftLanguages.map((l) => l.enumName)}
          maxLimit={15}
          limitMsg={t('profile.edit.limitLanguages')}
          onConfirm={onLanguageConfirm}
        />
      )}
        </>
      )}
    </View>
  );

});

export default EditProfileForm;
