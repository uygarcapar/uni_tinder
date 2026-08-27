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
  ActivityIndicator,
  Dimensions,
  Platform,
  Switch,
  Alert,
  Linking,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { showInfoToast } from "@/shared/services/toaster";
import { resolvePhotoUri } from "@/shared/utils/photoUri";
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
  Sparkles,
  Cigarette,
  HandHeart,
  Star,
  Navigation,
  Languages,
  Globe,
  Dog,
  Cat,
  Bird,
  Rabbit,
  Rat,
  Turtle,
  PawPrint,
  Ban,
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
  type LucideIcon,
} from "lucide-react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
// Pill grupları flexWrap yerine PillFlow + fillWidth ile diziliyor: satır
// başına en geniş pill, yanına kalan boşluğu en çok dolduran pill. DİKKAT:
// PillFlow'un ölçüm önbelleği modül genelinde `id` ile anahtarlanıyor, o
// yüzden buradaki id'ler hem liste adıyla ad-alanlanıyor hem de genişliği
// belirleyen şeyi (etiket metni / dil) taşıyor.
import PillFlow from "@/shared/components/PillFlow";
import { useKeyboardAwareField } from "@/shared/hooks/useKeyboardAwareField";
import { useAppModalScroll } from "@/shared/hooks/useAppModalScroll";
// Alkol ikonu keşif filtresiyle ORTAK: aynı seçeneği iki ekranda da aynı
// sembolle görmek gerekiyor (filterEnumIcons'ın başındaki nota bak).
import {
  getAlcoholIcon,
  getYearOfStudyIcon,
  sortZodiacOptions,
} from "@/shared/constants/filterEnumIcons";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PROMPT_ANSWER_MAX_LENGTH,
  YEAR_OF_STUDY_VALUES,
  countPromptAnswer,
  normalizePromptAnswer,
} from "@/shared/constants/limits";
import { SUPPORT_EMAIL } from "@/shared/constants/support";
import profileService from "@/features/profile/profileService";
import { resolveDisplayName } from "@/features/profile/utils/hydrateProfileForm";
import {
  countPhotosAwaitingReview,
  countRejectedPhotos,
  hasPhotosAwaitingReview,
  normalizePhotoModeration,
} from "@/features/profile/photoModeration";
import ProfileVisibilityBanner from "@/features/profile/components/ProfileVisibilityBanner";
import PhotoModerationBadge, {
  PhotoModerationScrim,
} from "@/features/profile/components/PhotoModerationBadge";
import LanguagePickerModal from "@/shared/components/LanguagePickerModal";
import PromptsEditor from "@/shared/components/PromptsEditor";
import { sanitizePrompts } from "@/features/profile/promptPayload";
import {
  extractPromptErrors,
  promptErrorText,
  promptSummaryCode,
  refreshPromptCatalog,
  shouldRefreshPromptCatalog,
  type PromptFieldError,
} from "@/features/profile/promptErrors";
import GenderCategoryPicker from "@/shared/components/GenderCategoryPicker";
import { commonKeys, resolveLocalized } from "@/shared/queries/commonQueries";
import { useQueryClient } from "@tanstack/react-query";
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

const SPARKLES_ICON: IconEntry = { sf: "sparkles", lucide: Sparkles };
const DOG_ICON: IconEntry = { sf: "dog.fill", lucide: Dog };
// sf BİLEREK yok: SF Symbols'ta cigarette karşılığı yok, tek yakın aday
// `smoke.fill` ve o bir duman bulutu — sigarayı okutmuyor. sf'siz entry'de
// EntryIcon iki platformda da lucide çiziyor (bkz. IconEntry.sf opsiyonel).
const CIGARETTE_ICON: IconEntry = { lucide: Cigarette };

// Dini görüş — sigaradaki desen: tek sembol, ayırt eden şey satır metni.
// Seçenek enumName'lerini bilmediğimiz için (backend listesi runtime'da geliyor)
// enum başına ikon haritası uydurmak yanlış eşleşme riski taşıyordu.
const RELIGIOUS_VIEW_ICON: IconEntry = {
  sf: "hands.and.sparkles.fill",
  lucide: HandHeart,
};
// Hobi kategori ikonları KALDIRILDI: hobiler bölümünde ne kategori başlığında
// ne de pill'de ikon çiziliyor (bkz. HobbyGroup) — harita da onunla birlikte
// gitti, geriye yalnız evcil hayvan ikonları kaldı.
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

// PURPOSE_META KALDIRILDI: "kullanım amacı" alanı üründen çıktı; profil
// düzenlemede de bölümü kalmadı (ilişki niyeti bölümü aynı soruyu soruyor).

// Sınıf etiketi — anahtarlar SwipeCard ile ORTAK (`profile.card.*`): kullanıcı
// düzenleme ekranında hangi metni seçtiyse kartında da birebir onu görmeli.
// Backend'in `yearOfStudyDisplay`i varken o kullanılır; bu yalnızca pill
// etiketleri ve yanıt gelmeden yapılan optimistic patch için.
const yearOfStudyLabel = (
  year: number,
  t: (key: string, options?: Record<string, unknown>) => string,
) =>
  year === 0 ? t("profile.card.prep") : t("profile.card.grade", { year });

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
        backgroundColor: isSelected ? colors.inverseSurfaceSoft : "transparent",
        borderColor: isSelected ? colors.inverseSurfaceSoft : colors.hairline,
      }}
    >
      <HobbyIcon
        hobby={hobby.enumName ?? hobby.name}
        size={20}
        color={isSelected ? colors.onInverseSurface : colors.textSecondary}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: isSelected ? colors.onInverseSurface : colors.textSecondary,
          // Kayıt adımındaki hobi piliyle ORTAK ölçü.
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {resolveLocalized(hobby.display, i18n.language, hobby.name)}
      </Text>
    </TouchableOpacity>
  );
});

// `label` verilmezse etiket her zamanki gibi option.display'den çözülür; yalnızca
// uzun enum adlarını pill'e sığdırmak için (ilişki niyeti) dışarıdan geçiliyor.
function OptionPill({
  option,
  isSelected,
  onPress,
  icon,
  label,
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
        backgroundColor: isSelected ? colors.inverseSurface : "transparent",
        borderColor: isSelected ? colors.inverseSurface : colors.hairline,
      }}
    >
      {icon ? (
        <EntryIcon
          entry={icon}
          size={20}
          color={isSelected ? colors.onInverseSurface : colors.textSecondary}
          strokeWidth={1.5}
        />
      ) : null}
      <Text
        style={{
          color: isSelected ? colors.onInverseSurface : colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
        }}
      >
        {label ?? resolveLocalized(option.display, i18n.language, option.name)}
      </Text>
    </TouchableOpacity>
  );
}

const OptionListItem = React.memo(function OptionListItem({
  option,
  isSelected,
  onPress,
  icon: CustomIcon,
  label,
}: any) {
  const { i18n } = useTranslation();
  // NOT: `purposeMap` dalı KALDIRILDI — ikon + açıklama taşıyan bu varyantı
  // yalnızca "kullanım amacı" bölümü kullanıyordu, o da üründen çıktı.
  //
  // `label` verilmezse backend etiketine düşülüyor. Veren bölümler (ilişki
  // niyeti, sigara, alkol) kayıt akışındaki i18n cümlelerini geçiyor: backend
  // kısa etiket döndürüyor ("Uzun süreli"), kayıt ekranları ise birinci ağızdan
  // cümle gösteriyor ("Uzun süreli bir ilişki tercih ederim"). İki akış aynı
  // soruyu soruyor, aynı metni göstermeli.

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
      {/* flex:1 + paddingRight — birinci ağız cümleleri kısa etiketlerden uzun,
          tek satıra sığmayanlar tik ikonunun altına taşmak yerine sarmalı. */}
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 18,
          paddingRight: 12,
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
            // 15 → 16: kayıt akışındaki aynı satırlarla (RegisterStep14/16)
            // ORTAK ölçü. Cümleler kısa etiketlerden uzun, 15'te satırlar
            // sıkışık duruyordu.
            fontSize: 16,
            lineHeight: 22,
            fontWeight: "500",
            flex: 1,
          }}
        >
          {label ?? resolveLocalized(option.display, i18n.language, option.name)}
        </Text>
      </View>
      {/* Tik yuvası HER ZAMAN çiziliyor (koşullu olan yalnız ikon): kayıt
          ekranlarındaki satırlarla aynı gerekçe — yoksa seçim anında metin
          alanı 20px genişleyip satır kayıyor. */}
      <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
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
      </View>
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
            colors.shimmer,
            "transparent",
            colors.shimmer,
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

/**
 * Bildirimden gelen fotoğrafın etrafında nabız gibi atan halka.
 *
 * Kutunun İÇİNDE (absoluteFill + aynı yarıçap): kart `overflow: hidden` ve
 * dışarı çizilen bir halka kırpılırdı. `pointerEvents="none"` — vurgu yalnız
 * görsel, altındaki sürükle/sil hedeflerini yutmuyor.
 */
function PhotoHighlightRing({ borderRadius }: { borderRadius: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * pulse.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius,
          borderCurve: "continuous",
          borderWidth: 3,
          borderColor: colors.primary,
        },
        style,
      ]}
    />
  );
}

// expo-image — memory+disk cache → modal her açıldığında foto cache'ten anında
// gelir, ilk yüklemede shimmer gösterilir. Native cachePolicy reliable olduğu
// için RN Image'daki onLoad-cached-hit problemi ve 5s safety-net gerekmez.
function PhotoItem({ photo, onPress, savingPhoto, highlighted = false }: any) {
  const [loading, setLoading] = useState(true);
  // photoId'li sürüm parametresi: silinip yeniden yüklenen foto backend'de aynı
  // slot URL'ine düşse bile cache anahtarı değişir (bkz. photoUri.ts).
  const uri = resolvePhotoUri(photo);
  const { status, isVisibleToOthers } = normalizePhotoModeration(photo);

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
          // "+" kutusuyla aynı çerçeve (bkz. add-btn): koyu fotoğrafların
          // kenarı zeminde kaybolmasın, boş slotla dolu slot aynı kutu okunsun.
          borderWidth: 0.5,
          borderColor: colors.hairline,
        }}
      >
        <Image
          source={uri ? { uri } : null}
          // recyclingKey: view yeniden kullanıldığında expo-image önceki
          // görüntüyü ekranda tutar; anahtar değişince temizler. Foto ekleme /
          // silme sonrası bir sonraki foto "eski foto" olarak çizilmesin.
          recyclingKey={photo.photoId != null ? String(photo.photoId) : null}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
        {/* Kullanıcı KENDİ fotoğrafını her durumda görür; yayında olmayanı
            gizlemek yerine soluklaştırıp rozetle sebebini belirtiyoruz. */}
        <PhotoModerationScrim
          isVisibleToOthers={isVisibleToOthers}
          borderRadius={20}
        />
        <PhotoModerationBadge
          status={status}
          isVisibleToOthers={isVisibleToOthers}
        />
        {loading && <PhotoShimmer borderRadius={20} />}
        {highlighted && <PhotoHighlightRing borderRadius={20} />}
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
            color={colors.textSecondary}
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
            colors.shimmer,
            "transparent",
            colors.shimmer,
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
      {/* İsim */}
      <SkelBox shimmer={shimmer} w={80} h={22} r={6} mb={10} />
      <SkelBox shimmer={shimmer} w={"85%"} h={14} r={4} mb={14} />
      <SkelBox shimmer={shimmer} h={52} r={999} />
      {/* Sınıf — pill satırı */}
      <SkelBox shimmer={shimmer} w={80} h={22} r={6} mt={28} mb={10} />
      <SkelBox shimmer={shimmer} w={"85%"} h={14} r={4} mb={14} />
      <SkelBox shimmer={shimmer} h={44} r={999} mb={28} />
      {/* Fotoğraflar */}
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

// ─── Hobi grubu: accordion DEĞİL, kategori başlığı + hep açık pill listesi ──
// ÖNCESİ: her kategori tıklanabilir bir accordion'dı (chevron + seçili rozeti),
// piller yalnız açıkken render ediliyordu. Kullanıcı hobisini bulmak için
// kategori kategori açmak zorundaydı; artık hepsi ekranda, başlık sadece
// ayraç. Ayırıcı çizgi de yok — grupları ayıran tek şey başlık ve boşluk;
// piller formun diğer bölümleriyle aynı şekilde sola yaslı akıyor.
const HobbyGroup = React.memo(function HobbyGroup({
  group,
  selectedIds,
  onToggle,
}: any) {
  const { i18n } = useTranslation();

  return (
    <View style={{ marginTop: 8, backgroundColor: "transparent" }}>
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "600",
          paddingVertical: 16,
        }}
      >
        {resolveLocalized(group.categoryDisplay, i18n.language, group.category)}
      </Text>

      <PillFlow
        gap={8}
        fillWidth
        style={{ paddingBottom: 20, paddingTop: 4 }}
        items={(group.hobbies || []).map((h) => ({
          // enumName (dille birlikte) etiketi belirliyor → genişliği belirleyen
          // her şey anahtarda.
          id: `hobby:${i18n.language}:${h.enumName ?? h.name}`,
          element: (
            <HobbyPill
              hobby={h}
              isSelected={selectedIds.includes(h.id)}
              onPress={onToggle}
            />
          ),
        }))}
      />
    </View>
  );
});

// ─── Bölüm scroll'u (ProfileScreen tamamlama accordion'ları) ───────────────
// Hedef bölümün üst kenarı modal header'ının hemen altına gelsin diye bırakılan
// nefes payı; bölümlerin kendi marginTop'u da üstüne bindiği için küçük tutuldu.
const SECTION_SCROLL_GAP = 12;
// Sheet present animasyonunu artık ProfileScreen bekliyor (focusSection prop'u
// onPresented'da düşüyor); burada kalan tek bekleme stage 4 commit'inin layout
// pass'i. Ölçüm henüz gelmediyse birkaç kez tekrar deneniyor.
const SECTION_SCROLL_DELAY = 160;
const SECTION_SCROLL_RETRIES = 3;

// Görünürlük bölümündeki switch satırı. `field` form şemasına bağlı olduğu için
// setValue tip güvenli kalıyor. Satırlar TEK SATIR etiketten ibaret — alt
// açıklama yok, hepsi aynı yükseklikte kalıyor.
type VisibilityRow = {
  key: string;
  label: string;
  value: boolean;
  field:
    | "showMyUniversity"
    | "showMeOnApp"
    | "showAge"
    | "showLocation"
    | "showPremiumBadge";
};

// ─── Form ──────────────────────────────────────────────────────────────────
const EditProfileForm = forwardRef(function EditProfileForm(
  {
    myProfile,
    initialValues,
    hobbyGroups,
    smokingOptions,
    zodiacOptions,
    relationshipIntentOptions = [],
    languageOptions,
    petOptions,
    alcoholOptions = [],
    religiousViewOptions = [],
    genderCategories = [],
    // Premium rozeti satırının görünürlüğü buna bağlı. Parent'tan geliyor çünkü
    // kanonik kaynak redux entitlement'ı (myProfile.isPremium webhook
    // gecikmesinde stale kalabiliyor — bkz. ProfileScreen'deki isPremium).
    isPremium = false,
    /**
     * `/profile/visibility` cevabı — Fotoğraflar bölümünün başındaki görünürlük
     * şeridi için. Parent'tan geliyor: kaynak ProfileScreen'in fetch'i ve
     * `photoModerationChanged` bus olayıyla tazeleniyor. `null` = bilinmiyor →
     * şerit hiç çizilmez.
     */
    profileVisibility = null,
    savingPhoto,
    focusSection = null,
    /**
     * Moderasyon bildiriminden gelindiyse vurgulanacak fotoğrafın id'si. Kutunun
     * etrafında nabız gibi atan bir halka çiziliyor; ProfileScreen birkaç saniye
     * sonra null'a çekiyor.
     */
    highlightPhotoId = null,
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
      prompts: [],
      displayName: "",
      yearOfStudy: null,
      hobbies: [],
      smoking: null,
      zodiac: null,
      relationshipIntent: null,
      alcohol: null,
      religiousView: null,
      city: null,
      district: null,
      languages: [],
      pets: [],
      showMyUniversity: true,
      showMeOnApp: true,
      showAge: true,
      showLocation: true,
      showPremiumBadge: true,
    },
  });

  // Prompt cevapları çok satırlı ve formun ortasında — klavye açılınca altında
  // kalıyordu (bio'da da aynı sorun vardı). Anchor View ölçülüp modal scroll'u
  // klavyenin üstüne taşınıyor.
  const {
    anchorRef: promptsAnchorRef,
    onFocus: onPromptsFocus,
    onBlur: onPromptsBlur,
  } = useKeyboardAwareField();

  // İsim alanı formun en üstünde ama bölüm içerik dolduğunda da klavyenin
  // altında kalabiliyor (kullanıcı "Sınıf"tan yukarı dönerse) — prompt'larla aynı
  // anchor mekanizması.
  const {
    anchorRef: nameAnchorRef,
    onFocus: onNameFocus,
    onBlur: onNameBlur,
  } = useKeyboardAwareField();

  const draftDisplayName = watch("displayName");
  const draftYearOfStudy = watch("yearOfStudy");
  const draftHobbies = watch("hobbies");
  const draftSmoking = watch("smoking");
  const draftZodiac = watch("zodiac");
  const draftRelationshipIntent = watch("relationshipIntent");
  const draftAlcohol = watch("alcohol");
  const draftReligiousView = watch("religiousView");
  const draftLanguages = watch("languages");
  const draftPets = watch("pets");
  const draftShowMyUniversity = watch("showMyUniversity");
  const draftShowMeOnApp = watch("showMeOnApp");
  const draftShowAge = watch("showAge");
  const draftShowLocation = watch("showLocation");
  const draftShowPremiumBadge = watch("showPremiumBadge");
  const queryClient = useQueryClient();
  const [savingProfile, setSavingProfile] = useState(false);
  // İsim hatası ayrı state'te tutuluyor, zodResolver'ın `errors`ında değil:
  // bu form `handleSubmit` kullanmıyor (submit imperative ref'ten çağrılıyor
  // ve `getValues` okuyor), yani resolver hiç koşmuyor ve `errors` hep boş.
  // Kaydet'e basıldığında set edilir, kullanıcı yazmaya başlayınca temizlenir.
  const [nameError, setNameError] = useState(false);
  // Prompt hataları da aynı gerekçeyle ayrı state'te: bu form handleSubmit
  // kullanmadığı için zodResolver hiç koşmuyor ve `errors` hep boş kalıyor.
  //   promptFieldErrors  → istemci doğrulaması (index → mesaj)
  //   promptSubmitErrors → sunucudan dönen UT-22xx retleri
  const [promptFieldErrors, setPromptFieldErrors] = useState<Record<number, string>>({});
  const [promptSubmitErrors, setPromptSubmitErrors] = useState<PromptFieldError[]>([]);

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

  // ── Bölüme scroll (accordion "Tamamla") ─────────────────────────────────
  // ProfileScreen'in tamamlama accordion'ı modalı hangi eksik alan için açtığını
  // focusSection ile bildirir; o bölümü header'ın hemen altına kaydırıyoruz.
  //
  // Ölçüm onLayout ile yapılıyor: bölümler root View'ın doğrudan çocukları,
  // yani layout.y = bölümün form içindeki y'si. Scroll hedefi de aynı eksende:
  // content'te bölüm 88(paddingTop)+y'de, onu 88+gap'e getirmek istediğimiz için
  // offset = y - gap. Progressive mount (stage 1→4) sırasında konumlar kaydıkça
  // onLayout tekrar fire eder; stage 4'te değerler nihaidir.
  //
  // focusSection'ı ProfileScreen sheet present animasyonu bittikten sonra
  // veriyor (bkz. handleEditPresented): gorhom, sheet snap'lenene kadar
  // scrollable'ı kilitleyip offset'ini 0'a resetlediği için animasyon
  // sırasındaki scrollTo yok sayılıyor.
  const { scrollToOffset } = useAppModalScroll();
  const sectionOffsets = useRef<Record<string, number>>({});
  const sectionLayout = useMemo(() => {
    const make = (key: string) => (e: any) => {
      sectionOffsets.current[key] = e.nativeEvent.layout.y;
    };
    return {
      photos: make("photos"),
      // Anahtar profil doluluk satırının `key`i ile AYNI olmak zorunda:
      // accordion'dan gelen "bu bölüme git" isteği bu haritadan çözülüyor.
      // Doluluk satırı bio → prompts olarak değişti, burası da onunla değişti.
      prompts: make("prompts"),
      // "purpose" → "relationshipIntent": kullanım amacı bölümü kalktı, doluluk
      // accordion'ının o satırı artık ilişki niyetine işaret ediyor.
      relationshipIntent: make("relationshipIntent"),
      hobbies: make("hobbies"),
      smoking: make("smoking"),
      zodiac: make("zodiac"),
    };
  }, []);

  useEffect(() => {
    if (!focusSection || stage < 4) return;
    let id: ReturnType<typeof setTimeout>;
    let attempt = 0;
    const tick = () => {
      const y = sectionOffsets.current[focusSection];
      // Ölçüm veya scroll view henüz hazır değilse birkaç tick daha bekle —
      // sessizce vazgeçmek "bazen scroll etmiyor" hissi yaratıyordu.
      const done = y != null && scrollToOffset(y - SECTION_SCROLL_GAP);
      if (!done && ++attempt < SECTION_SCROLL_RETRIES) {
        id = setTimeout(tick, SECTION_SCROLL_DELAY);
      }
    };
    id = setTimeout(tick, SECTION_SCROLL_DELAY);
    return () => clearTimeout(id);
  }, [focusSection, stage, scrollToOffset]);

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

  // ── Photo order: myProfile.photosList değişince grid'i sync et ─────────────
  // Stage 2'ye kadar SortablePhoto'lar render olmadığı için sync etmek
  // gereksiz; gate ekledik. İlk mount commit'i daha hafif geçer.
  //
  // Kullanıcı sürükleyerek sırayı değiştirdiyse (dirty) sunucu sırasını
  // DAYATMIYORUZ ama ekleme/silmeyi yine de yansıtıyoruz: eskiden dirty iken
  // effect komple atlandığı için modal açıkken yüklenen yeni foto grid'e hiç
  // düşmüyor, silinen foto ekranda kalıyordu. Kalan kayıtlar da taze sunucu
  // objesiyle değiştirilir — URL değişmişse eski URL ekranda kalmasın.
  useEffect(() => {
    if (stage < 2) return;
    const serverPhotos = myProfile?.photosList;
    if (!serverPhotos) return;

    const sortedPhotos = [...serverPhotos].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );

    let nextOrder = sortedPhotos;
    if (photoOrderDirty) {
      const byId = new Map(sortedPhotos.map((p) => [p.photoId, p]));
      const kept = draftPhotoOrderRef.current
        .map((p) => byId.get(p.photoId))
        .filter(Boolean);
      const keptIds = new Set(kept.map((p) => p.photoId));
      nextOrder = [
        ...kept,
        ...sortedPhotos.filter((p) => !keptIds.has(p.photoId)),
      ];
    }

    const current = draftPhotoOrderRef.current;
    const unchanged =
      current.length === nextOrder.length &&
      nextOrder.every(
        (p, i) =>
          p.photoId === current[i].photoId &&
          p.photoImageUrl === current[i].photoImageUrl,
      );
    if (unchanged) return;

    draftPhotoOrderRef.current = nextOrder;
    setDraftPhotoOrder(nextOrder);
    const newPositions = {};
    nextOrder.forEach((photo, i) => {
      newPositions[photo.photoId] = i;
    });
    positions.value = newPositions;
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

  // İlişki niyeti / sigara / alkol satır etiketleri — metin backend'den DEĞİL,
  // kayıt akışının i18n cümlelerinden okunuyor (auth.step14 / auth.step16).
  // Uç kısa etiket dönüyor ("Uzun süreli", "İçiyorum"), kayıt ekranları ise
  // birinci ağızdan cümle gösteriyor; aynı soru iki yerde aynı metinle çıksın
  // diye anahtarlar kopyalanmıyor, oradan okunuyor. Anahtar enumName; backend
  // yeni bir değer eklerse `display`e düşülüyor, satır boş kalmıyor.
  // NOT: sigara ve alkol AYRI haritalar — ikisinde de `None` üyesi var.
  const sentenceLabel = useCallback(
    (ns: string, opt: any) =>
      t(`${ns}.${opt?.enumName}`, {
        defaultValue: resolveLocalized(opt?.display, i18n.language, opt?.name),
      }),
    [t, i18n.language],
  );
  const intentSentenceLabel = useCallback(
    (opt: any) => sentenceLabel("auth.step14.intents", opt),
    [sentenceLabel],
  );
  const smokingSentenceLabel = useCallback(
    (opt: any) => sentenceLabel("auth.step16.smoking", opt),
    [sentenceLabel],
  );
  const alcoholSentenceLabel = useCallback(
    (opt: any) => sentenceLabel("auth.step16.alcohol", opt),
    [sentenceLabel],
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
        prompts: draftPrompts,
        displayName: draftDisplayName,
        yearOfStudy: draftYearOfStudy,
        hobbies: hobbyIds,
        smoking: draftSmoking,
        zodiac: draftZodiac,
        relationshipIntent: draftRelationshipIntent,
        alcohol: draftAlcohol,
        religiousView: draftReligiousView,
        languages: draftLanguages,
        pets: draftPets,
        showMyUniversity: draftShowMyUniversity,
        showMeOnApp: draftShowMeOnApp,
        showAge: draftShowAge,
        showLocation: draftShowLocation,
        showPremiumBadge: draftShowPremiumBadge,
      } = getValues();

      // İsim boş bırakılamaz: backend boş/whitespace `DisplayName`i "değiştirme"
      // olarak yorumluyor (temizleme yolu YOK). Göndersek istek 200 döner ama
      // isim eski kalır — kullanıcı adını sildiğini sanır.
      const nextName = (draftDisplayName ?? "").trim();
      if (!nextName) {
        setNameError(true);
        showInfoToast({
          title: t("profile.edit.missingInfoTitle"),
          message: t("profile.edit.nameRequired"),
          variant: "error",
        });
        return; // finally bloğu setSavingProfile(false) yapıyor
      }

      const allHobbies = hobbyGroups.flatMap((g) => g.hobbies || []);
      const hobbyEnums = hobbyIds
        .map((id) => {
          const h = allHobbies.find((x) => x.id === id);
          return h ? enumOf(h) : null;
        })
        .filter(Boolean);

      const updates: Record<string, unknown> = {
        ...(hobbyEnums.length > 0
          ? { Hobbies: hobbyEnums }
          : { ClearHobbies: true }),
      };

      // Prompt'lar — `Bio`nun yerini aldı.
      //
      // ALAN GÖNDERİLDİĞİ AN TAM LİSTE demek (replace): sunucu mevcut satırları
      // silip geleni yazıyor. Bu yüzden boş listeyi HİÇ göndermiyoruz — multipart'ta
      // boş liste "gönderilmedi"den ayırt edilemediği için istek sessizce no-op
      // olurdu ve kullanıcı sildiğini sanırdı. (Formun kendisi de son cevabın
      // silinmesini engelliyor, bkz. PromptsEditor `allowRemoveLast`.)
      // İstemci doğrulaması: soru seçilmiş ama cevabı boş/çok uzun olan slot
      // isteğe hiç girmemeli. sanitizePrompts boş cevapları SESSİZCE eliyor —
      // kullanıcı yazdığını sandığı cevabın kaybolduğunu ancak kartta fark
      // ederdi, o yüzden burada durup slotu işaretliyoruz.
      const promptIssues: Record<number, string> = {};
      (draftPrompts ?? []).forEach((prompt, index) => {
        if (!prompt?.promptKey) return;
        const answer = normalizePromptAnswer(prompt.answer ?? "");
        if (!answer) {
          promptIssues[index] = t('profile.prompts.errors.UT-2204');
        } else if (countPromptAnswer(answer) > PROMPT_ANSWER_MAX_LENGTH) {
          promptIssues[index] = t('profile.prompts.errors.UT-2205');
        }
      });
      if (Object.keys(promptIssues).length > 0) {
        setPromptFieldErrors(promptIssues);
        showInfoToast({
          title: t("profile.edit.missingInfoTitle"),
          message: t('profile.prompts.errors.generic'),
          variant: "error",
        });
        return; // finally bloğu setSavingProfile(false) yapıyor
      }
      setPromptFieldErrors({});

      const nextPrompts = sanitizePrompts(draftPrompts);
      if (nextPrompts.length > 0) {
        updates.Prompts = nextPrompts;
      }

      // İsim — yalnızca DEĞİŞTİYSE gidiyor (partial update; bu uç `photo`
      // rate limit politikasını foto yüklemeyle PAYLAŞIYOR, gereksiz alan
      // göndermenin bedeli var). `DisplayName` tek başına yeterli: backend
      // Identity'deki `FirstName`i de aynı değerle senkronluyor, ayrıca
      // /api/user/UpdateUser çağırmak GEREKMİYOR (o uç yalnız FirstName'e
      // yazıyor → kartta görünen isim değişmiyordu).
      if (nextName !== resolveDisplayName(myProfile).trim()) {
        updates.DisplayName = nextName;
      }

      // Sınıf — `!= null` bilerek: 0 (Hazırlık) GEÇERLİ bir değer, `!draft…`
      // yazsaydık hazırlık seçimi hiç gönderilmezdi. null = "seçilmedi";
      // backend'de temizleme yolu olmadığı için alan hiç gönderilmiyor.
      if (
        draftYearOfStudy != null &&
        draftYearOfStudy !== myProfile?.yearOfStudy
      ) {
        updates.YearOfStudy = draftYearOfStudy;
      }

      if (draftSmoking != null) updates.SmokingStatus = enumOf(draftSmoking);
      else if (myProfile?.smokingStatus != null)
        updates.ClearSmokingStatus = true;

      if (draftZodiac != null) updates.ZodiacSign = enumOf(draftZodiac);
      else if (myProfile?.zodiacSign != null) updates.ClearZodiacSign = true;

      // UsagePurpose/ClearUsagePurpose ARTIK GÖNDERİLMİYOR: alan UpdateProfile
      // DTO'sundan silindi (gönderilse sessizce yok sayılırdı).

      // İlişki niyeti — partial-update semantiği diğer enum alanlarla aynı:
      // alanı hiç göndermemek "değiştirme" demek, o yüzden seçim kaldırıldığında
      // ClearRelationshipIntent=true gitmeli (null göndermek yetmez).
      if (draftRelationshipIntent != null)
        updates.RelationshipIntent = enumOf(draftRelationshipIntent);
      else if (myProfile?.relationshipIntent != null)
        updates.ClearRelationshipIntent = true;

      // Alkol — keşif filtresinin (alcoholUsages) okuduğu alan. Filtre açıkken
      // bu tercihi BOŞ olan adaylar eleniyor, yani buradan girilmediği sürece
      // kullanıcı kimsenin destesinde çıkmıyor: alanın profil tarafı filtrenin
      // ön koşulu.
      if (draftAlcohol != null) updates.AlcoholUsage = enumOf(draftAlcohol);
      else if (myProfile?.alcoholUsage != null) updates.ClearAlcoholUsage = true;

      if (draftReligiousView != null)
        updates.ReligiousView = enumOf(draftReligiousView);
      else if (myProfile?.religiousView != null)
        updates.ClearReligiousView = true;

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

      // SADECE `Pets` gönderiliyor, `HasPets`e HİÇ dokunulmuyor. Backend önce
      // `Pets`ten `HasPets`i türetiyor, SONRA `HasPets`/`ClearHasPets` bloğunu
      // işleyip türettiğini eziyor — ikisi aynı istekte giderse profil
      // "Pets=[Dog] ama HasPets=null" gibi tutarsız bir hâle düşüyor.
      if (draftPets.length > 0)
        updates.Pets = draftPets.map(enumOf).filter(Boolean);
      else if (myProfile?.pets?.length > 0) updates.ClearPets = true;

      updates.ShowMyUniversity = draftShowMyUniversity;
      updates.ShowMeOnApp = draftShowMeOnApp;
      updates.ShowAge = draftShowAge;
      // Kapatınca backend o kullanıcının Redis'teki kartını kendisi düşürüyor;
      // frontend'in ayrıca bir invalidation çağırması gerekmiyor.
      updates.ShowLocation = draftShowLocation;
      // Free kullanıcıda satır basılmıyor ama değer yine gönderiliyor: hidrate
      // edilen mevcut tercih olduğu gibi geri yazılır (premium bittiğinde
      // kullanıcının kapattığı rozet ayarı sessizce true'ya dönmesin).
      updates.ShowPremiumBadge = draftShowPremiumBadge;

      const orderToSave = draftPhotoOrderRef.current;
      if (photoOrderDirtyRef.current && orderToSave.length > 0) {
        updates.PhotoOrders = orderToSave.map((p, i) => ({
          photoId: p.photoId,
          newOrder: i + 1,
        }));
        const originalMain = myProfile?.photosList?.find((p) => p.isMainPhoto);
        if (orderToSave[0]?.photoId !== originalMain?.photoId) {
          // İlk sıradaki foto ana foto olur. Yayında OLMAYAN bir fotoğraf ana
          // yapılırsa profil kartı boş görünür — sıralamayı kaydetmeyi kesip
          // kullanıcıyı uyarıyoruz (rehber §3c).
          const nextMain = normalizePhotoModeration(orderToSave[0]);
          if (!nextMain.isVisibleToOthers) {
            showInfoToast({
              title: t("profile.photoModeration.reorderMainBlockedTitle"),
              message: t("profile.photoModeration.reorderMainBlockedMessage"),
              variant: "error",
            });
            return; // finally bloğu setSavingProfile(false) yapıyor
          }
          updates.NewMainPhotoId = orderToSave[0].photoId;
        }
      }

      // Yeni denemede eski inline hatalar kalmasın.
      setPromptSubmitErrors([]);
      const saved = await profileService.updateProfile(updates);
      // Yanıt artık KOŞULSUZ `result = { profile, photos }` (2026-08-24). Foto
      // gönderilmediyse `photos: []` gelir; polimorfik zarf ve onu çözen
      // sarmalayıcı kaldırıldı.
      const savedProfile = saved?.profile;

      // Optimistic patch — parent myProfile cache'ini günceller
      const idToEnum = {};
      allHobbies.forEach((h) => {
        if (h?.id != null && h?.enumName) idToEnum[h.id] = h.enumName;
      });
      const optimisticPatch = {
        // Prompt'lar yalnız gönderildiyse yamalanıyor: alan hiç gitmediyse
        // sunucudaki liste değişmedi, ekrandaki taslakla ezmek yanlış olurdu.
        ...(nextPrompts.length > 0 ? { prompts: nextPrompts } : null),
        // İsim ve sınıf ekrandaki değeri ÖNCE YANITTAN alıyor: JWT'nin `name`
        // claim'i bir sonraki login/refresh'e kadar eski isimde kalıyor, yani
        // token'dan okuyan her yer yalan söyler. `yearOfStudyDisplay` de
        // backend'de kullanıcının diline göre üretiliyor; yanıt gelmezse
        // (eski backend) karttakiyle aynı i18n metnine düşüyoruz.
        displayName: savedProfile?.displayName ?? nextName,
        yearOfStudy:
          savedProfile?.yearOfStudy ??
          draftYearOfStudy ??
          myProfile?.yearOfStudy ??
          null,
        yearOfStudyDisplay:
          savedProfile?.yearOfStudyDisplay ??
          (draftYearOfStudy != null
            ? yearOfStudyLabel(draftYearOfStudy, t)
            : (myProfile?.yearOfStudyDisplay ?? null)),
        hobbies: hobbyIds.map((id) => idToEnum[id]).filter(Boolean),
        smokingStatus: enumOf(draftSmoking) ?? null,
        smokingStatusDisplay: draftSmoking
          ? resolveLocalized(draftSmoking.display, i18n.language, draftSmoking.name)
          : null,
        zodiacSign: enumOf(draftZodiac) ?? null,
        zodiacSignDisplay: draftZodiac
          ? resolveLocalized(draftZodiac.display, i18n.language, draftZodiac.name)
          : null,
        relationshipIntent: enumOf(draftRelationshipIntent) ?? null,
        relationshipIntentDisplay: draftRelationshipIntent
          ? resolveLocalized(
              draftRelationshipIntent.display,
              i18n.language,
              draftRelationshipIntent.name,
            )
          : null,
        alcoholUsage: enumOf(draftAlcohol) ?? null,
        alcoholUsageDisplay: draftAlcohol
          ? resolveLocalized(draftAlcohol.display, i18n.language, draftAlcohol.name)
          : null,
        religiousView: enumOf(draftReligiousView) ?? null,
        religiousViewDisplay: draftReligiousView
          ? resolveLocalized(
              draftReligiousView.display,
              i18n.language,
              draftReligiousView.name,
            )
          : null,
        // city/cityDisplay/district/districtDisplay patch'lenmiyor: bu form artık
        // konumu değiştirmiyor, myProfile'daki mevcut değerler olduğu gibi kalmalı.
        spokenLanguages: draftLanguages.map(enumOf).filter(Boolean),
        pets: draftPets.map(enumOf).filter(Boolean),
        showMyUniversity: draftShowMyUniversity,
        showMeOnApp: draftShowMeOnApp,
        showAge: draftShowAge,
        showLocation: draftShowLocation,
        showPremiumBadge: draftShowPremiumBadge,
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
      // Duruma özel metinler: jenerik "güncellenemedi" bu üç durumda kullanıcıyı
      // çıkmaza sokuyor — ne yapacağını bilmeden tekrar tekrar kaydete basıyor.
      //   403 → profil hiç tamamlanmamış (IsProfileCompleted false). Aşağıda
      //         ayrı ele alınıyor.
      //   400 → alan doğrulaması (sınıf aralık dışı, isim çok uzun).
      //   429 → `photo` rate limit'i; foto yüklemeyle ORTAK kota. api katmanı
      //         3 kez backoff'la deneyip pes ettikten sonra buraya düşer.
      const status = e?.response?.status;

      // Prompt reddi (UT-22xx) — hangi slotun düştüğü gövdeden okunup ilgili
      // cevabın altına inline yazılıyor. `api.put` 400'ü reject ettiği için
      // gövde `error.response.data`da; kayıt yolundan (postFormData) tek farkı
      // bu, sözleşme aynı.
      const promptErrors = extractPromptErrors(e?.response?.data);
      if (promptErrors.length > 0) {
        setPromptSubmitErrors(promptErrors);
        // UT-2202'nin en olası sebebi kullanıcının hatası değil, kataloğun bayat
        // olması: staticGet onu oturum boyu tutuyor. Cache'i düşürüp listeyi
        // tazeliyoruz ki kullanıcı seçici açtığında güncel soruları görsün.
        if (shouldRefreshPromptCatalog(promptErrors)) {
          refreshPromptCatalog();
          queryClient.invalidateQueries({ queryKey: commonKeys.prompts });
        }
        // Toast'ta EN AĞIR hata: üst seviye kod onu taşıyor, dizinin ilk
        // elemanı yalnızca en küçük index.
        const summary = promptSummaryCode(e?.response?.data, promptErrors);
        showInfoToast({
          title: t('common.error'),
          message: summary ? promptErrorText(summary) : t('profile.prompts.errors.generic'),
          variant: "error",
        });
        return; // finally bloğu setSavingProfile(false) yapıyor
      }

      // 403 = IsProfileCompleted false. Backend rehberi "CompleteProfile
      // akışına yönlendirin" diyor ama bu uygulamada ÖYLE BİR AKIŞ YOK:
      // hesap `register-and-complete` ile TEK çağrıda hem açılıyor hem
      // tamamlanıyor (RegisterStep15), ayrı bir CompleteProfile ekranı hiç
      // yazılmadı. Kayıt yığınına atmak da işe yaramaz — o akış elde kayıt
      // token'ı olmasını bekliyor, bu kullanıcıda yok; üstelik navigator
      // kapısı (`isMailVerified || isProfileCreated`) onu anında ana
      // uygulamaya geri alır → döngü.
      //
      // Yani bu durum mevcut FE akışıyla ÜRETİLEMİYOR; ancak eski iki adımlı
      // `Register` ile açılmış bir hesapta veya backend tutarsızlığında
      // görülebilir. Kullanıcıyı sahte bir yönlendirmeyle oyalamak yerine
      // çıkışı olan tek kapıyı veriyoruz.
      if (status === 403) {
        Alert.alert(
          t("profile.edit.profileIncompleteTitle"),
          t("profile.edit.profileIncompleteError"),
          [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("profile.edit.contactSupport"),
              onPress: () => {
                const subject = encodeURIComponent(
                  t("profile.edit.supportSubject"),
                );
                Linking.openURL(
                  `mailto:${SUPPORT_EMAIL}?subject=${subject}`,
                ).catch(() => {});
              },
            },
          ],
        );
        return; // finally bloğu setSavingProfile(false) yapıyor
      }

      const message =
        status === 400
          ? t("profile.edit.validationError")
          : status === 429
            ? t("profile.edit.rateLimitError")
            : t("profile.edit.updateError");
      showInfoToast({ title: t('common.error'), message, variant: "error" });
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
            className="border-[0.5px]"
            style={{
              borderColor: colors.hairline,
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

      {/* İsim — stage 1. Tek alan iki yeri birden güncelliyor: kartta görünen
          ad (UserProfile.DisplayName) ve mail/JWT'deki ad (FirstName). Backend
          ikisini `DisplayName` üzerinden senkronluyor, ayrı bir istek YOK. */}
      {stage >= 1 && (
        <View style={{ marginTop: 8 }}>
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
              {t("profile.edit.nameTitle")}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
                {t("profile.edit.nameDesc")}
              </Text>
            </View>
          </View>
          {/* collapsable={false}: prompt anchor'ıyla aynı gerekçe — Fabric bu
              View'ı optimize edip kaldırırsa measureInWindow ölçemez. */}
          <View ref={nameAnchorRef} collapsable={false}>
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, value } }) => (
                <BottomSheetTextInput
                  value={value}
                  onChangeText={(text) => {
                    onChange(text);
                    // Kullanıcı yazmaya başlar başlamaz hata sönsün; kırmızı
                    // çerçeve düzeltilmiş alanda asılı kalmasın.
                    if (nameError && text.trim()) setNameError(false);
                  }}
                  onFocus={onNameFocus}
                  onBlur={onNameBlur}
                  // Tavan 50 (100 değil): 50'yi aşan isimde backend HATA
                  // DÖNMÜYOR, profil adını tam kaydedip Identity'deki adı
                  // sessizce kırpıyor — bkz. DISPLAY_NAME_MAX_LENGTH.
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  placeholder={t("profile.edit.namePlaceholder")}
                  placeholderTextColor={colors.textSecondary}
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: "500",
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    borderWidth: 0.5,
                    borderColor: nameError
                      ? "rgba(239,68,68,0.5)"
                      : colors.hairline,
                  }}
                />
              )}
            />
          </View>
          {nameError && (
            <Text style={{ color: colors.error, fontSize: 12, marginTop: 6, marginLeft: 16 }}>
              {t("profile.edit.nameRequired")}
            </Text>
          )}
        </View>
      )}

      {/* Fotoğraflar GRID — stage 2 */}
      {stage >= 2 && (
      <View style={{ marginTop: 28 }} onLayout={sectionLayout.photos}>
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
                      borderColor: colors.hairline,
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
                // Karşılaştırma STRING üzerinden: photoId backend'de sayı,
                // bildirimin `relatedEntityId`i ise metin geliyor.
                highlighted={
                  highlightPhotoId != null &&
                  String(photo.photoId) === String(highlightPhotoId)
                }
              />
            </SortablePhoto>
          ))}
        </View>

        {/* Görünürlük şeridi: grid'in ALTINDA. Sebep (keşifte yokum) ile çözüm
            (fotoğraf kutuları) yan yana kalsın diye bu bölümde duruyor; kutuların
            üstünde başlık ile grid'in arasına giriyordu. Yatay margin 0 — form
            gövdesinin kendi padding'i var. */}
        <ProfileVisibilityBanner
          visibility={profileVisibility}
          awaitingReview={hasPhotosAwaitingReview(myProfile)}
          reviewCount={countPhotosAwaitingReview(myProfile)}
          rejectedCount={countRejectedPhotos(myProfile)}
          onAddPhoto={onAddPhoto}
          style={{
            marginHorizontal: 0,
            marginTop: 12,
            marginBottom: 0,
            width: "100%",
          }}
        />
      </View>
      )}

      {/* Sorular (prompt'lar) — bio'nun yerini aldı, stage 1 */}
      {stage >= 1 && (
      <View style={{ marginTop: 28 }} onLayout={sectionLayout.prompts}>
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
            {t('profile.prompts.title')}
          </Text>
          <View className="flex-row items-center gap-2 mb-3 pr-4">
            <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
            <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
              {t('profile.prompts.description')}
            </Text>
          </View>
        </View>
        {/* collapsable={false}: Fabric bu View'ı optimize edip kaldırırsa
            measureInWindow ölçemez, scroll hesabı çalışmaz.
            marginTop: bölüm açıklaması ile ilk sorunun başlığı birbirine
            yapışık duruyordu — nefes payı burada, PromptsEditor'de DEĞİL
            (aynı bileşeni kayıt adımı da kullanıyor). */}
        <View ref={promptsAnchorRef} collapsable={false} style={{ marginTop: 12 }}>
          <Controller
            control={control}
            name="prompts"
            render={({ field: { onChange, value } }) => (
              <PromptsEditor
                value={value ?? []}
                onChange={onChange}
                serverErrors={promptSubmitErrors}
                fieldErrors={promptFieldErrors}
                // Bottom sheet içindeyiz: BottomSheetTextInput şart, düz
                // TextInput'ta gorhom klavye target'ını set etmiyor.
                InputComponent={BottomSheetTextInput}
                onInputFocus={onPromptsFocus}
                onInputBlur={onPromptsBlur}
                // Son cevabın silinmesi engelleniyor: boş liste sunucuya
                // "dokunma" olarak gider, silme sessizce kaybolurdu.
                allowRemoveLast={false}
              />
            )}
          />
        </View>
      </View>
      )}

      {/* Kullanım amacı bölümü KALDIRILDI: alan üründen çıktı. Aşağıdaki
          "ilişki niyeti" bölümü aynı soruyu soruyordu; profil doluluk
          formülündeki 5 puan da ona devredildi. */}

      {/* İlişki niyeti — stage 1. Tek seçim; seçili satıra tekrar basmak
          temizler (submit'te ClearRelationshipIntent=true gider). */}
      {stage >= 1 && relationshipIntentOptions.length > 0 && (
        <View
          style={{ marginTop: 28 }}
          onLayout={sectionLayout.relationshipIntent}
        >
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
          {/* Tikli liste — kayıt akışındaki aynı soruyla (RegisterStep14) AYNI
              görünüm. Pill ızgarasından DÖNÜLDÜ: pill'e ancak kısaltılmış
              etiket sığıyordu ("Uzun süreli"), kayıt ekranı ise birinci ağızdan
              cümle gösteriyordu — kullanıcı aynı soruyu iki farklı metinle
              görüyordu. Satır düzeninde tam cümle sığıyor, metin de oradan
              (auth.step14.intents) okunuyor. Sigara/alkol bölümleri de aynı
              biçimde. Seçim yine TEK: seçili satıra tekrar dokunmak temizliyor. */}
          {relationshipIntentOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftRelationshipIntent?.id === opt.id}
              label={intentSentenceLabel(opt)}
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
        <View style={{ marginTop: 28 }} onLayout={sectionLayout.hobbies}>
          {/* Diğer bölümlerle aynı hizalama; tek fark başlık bloğunun ikonsuz
              olması (hobilerde ikon yalnız pill'lerde). */}
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
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 14,
                fontWeight: "400",
                marginBottom: 12,
                paddingRight: 16,
              }}
            >
              {t('profile.edit.hobbiesHint')}
            </Text>
          </View>
          {hobbyGroups.map((group, gi) => (
            <HobbyGroup
              key={group.categoryEnumName ?? group.category ?? gi}
              group={group}
              selectedIds={draftHobbies}
              onToggle={toggleHobby}
            />
          ))}
        </View>
      )}

      {/* Sınıf — stage 1. Değerler ClassYearType ordinali (0 = Hazırlık ... 6);
          kayıt ekranı (RegisterStep8) ve keşif filtresiyle AYNI aralık.
          Seçili pill'e tekrar dokunmak TEMİZLEMİYOR: backend'de bu alanın
          "temizle" yolu yok (ClearYearOfStudy diye bir alan tanımlı değil),
          sadece başka bir değere çekilebiliyor. */}
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
              {t("profile.edit.yearOfStudyTitle")}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}>
                {t("profile.edit.yearOfStudyDesc")}
              </Text>
            </View>
          </View>
          {/* Burçlarla aynı gerekçeyle düz flexWrap: sıra ANLAMLI (hazırlık →
              6. sınıf), PillFlow'un satır doldurma algoritması sırayı bozardı. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {YEAR_OF_STUDY_VALUES.map((year) => {
              const selected = draftYearOfStudy === year;
              return (
                <TouchableOpacity
                  key={year}
                  activeOpacity={1}
                  onPress={() => setValue("yearOfStudy", year)}
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
                    backgroundColor: selected ? colors.inverseSurface : "transparent",
                    borderColor: selected ? colors.inverseSurface : colors.hairline,
                  }}
                >
                  <EntryIcon
                    entry={getYearOfStudyIcon(year)}
                    size={20}
                    color={selected ? colors.onInverseSurface : colors.textSecondary}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={{
                      color: selected ? colors.onInverseSurface : colors.textSecondary,
                      fontSize: 14,
                      fontWeight: "500",
                    }}
                  >
                    {yearOfStudyLabel(year, t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Sigara — stage 2 */}
      {stage >= 2 && smokingOptions.length > 0 && (
        <View style={{ marginTop: 28 }} onLayout={sectionLayout.smoking}>
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
              label={smokingSentenceLabel(opt)}
              onPress={() =>
                setValue("smoking", draftSmoking?.id === opt.id ? null : opt)
              }
            />
          ))}
        </View>
      )}

      {/* Alkol — stage 2, sigaranın hemen altında: aynı sınıf (yaşam tarzı),
          aynı görünüm (üç seçenek, tek seçim, OptionListItem).
          Bu alan keşif filtresinin ön koşulu: alkol filtresi açık olan
          kullanıcılar tercihini girmemiş profilleri GÖRMÜYOR (backend semantiği
          sigarayla aynı), yani boş bırakan kullanıcı o destelerden düşüyor —
          açıklama metni bunu söylüyor. */}
      {stage >= 2 && alcoholOptions.length > 0 && (
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
              {t('profile.edit.alcoholTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.alcoholDesc')}
              </Text>
            </View>
          </View>
          {alcoholOptions.map((opt) => (
            <OptionListItem
              key={opt.id}
              option={opt}
              isSelected={draftAlcohol?.id === opt.id}
              icon={getAlcoholIcon()}
              label={alcoholSentenceLabel(opt)}
              onPress={() =>
                setValue("alcohol", draftAlcohol?.id === opt.id ? null : opt)
              }
            />
          ))}
        </View>
      )}

      {/* Burç — stage 3 */}
      {stage >= 3 && zodiacOptions.length > 0 && (
        <View style={{ marginTop: 28 }} onLayout={sectionLayout.zodiac}>
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
          {/* Burçlar TEK İSTİSNA: diğer pill grupları PillFlow(fillWidth) ile
              satır doluluğuna göre diziliyor, burçlar burç sırasında kalıyor
              (bkz. sortZodiacOptions). Düz flexWrap kullanılıyor çünkü
              fillWidth'siz PillFlow bile sığmayan pili atlayıp arkadakini öne
              çekerek sırayı bozuyor. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {sortZodiacOptions(zodiacOptions).map((opt: any) => {
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
                    backgroundColor: selected ? colors.inverseSurface : "transparent",
                    borderColor: selected ? colors.inverseSurface : colors.hairline,
                  }}
                >
                  <EntryIcon
                    entry={zodiacIcon}
                    size={20}
                    color={selected ? colors.onInverseSurface : colors.textSecondary}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={{
                      color: selected ? colors.onInverseSurface : colors.textSecondary,
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

      {/* Dini görüş — stage 3, burcun altında: ikisi de "kişisel bakış"
          grubundan ve ikisi de opsiyonel. Pill grubu (liste satırı değil):
          seçenek sayısı burçtakine yakın, satır listesi bölümü gereksiz
          uzatıyordu. Seçili pill'e tekrar dokunmak temizler → submit'te
          ClearReligiousView=true gider.
          NOT: Profil doluluk skoruna KATKISI YOK (backend formülünde bu alan
          sayılmıyor), o yüzden "profilini tamamla" akışında adım olarak
          gösterilmiyor. */}
      {stage >= 3 && religiousViewOptions.length > 0 && (
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
              {t('profile.edit.religiousViewTitle')}
            </Text>
            <View className="flex-row items-center gap-2 mb-3 pr-4">
              <SFIcon name="info.circle" fallback={InfoIcon} size={18} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
              <Text
                style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "400" }}
              >
                {t('profile.edit.religiousViewDesc')}
              </Text>
            </View>
          </View>
          <PillFlow
            gap={8}
            fillWidth
            items={religiousViewOptions.map((opt) => ({
              id: `religion:${resolveLocalized(opt.display, i18n.language, opt.name)}`,
              element: (
                <OptionPill
                  option={opt}
                  isSelected={draftReligiousView?.id === opt.id}
                  icon={RELIGIOUS_VIEW_ICON}
                  onPress={() =>
                    setValue(
                      "religiousView",
                      draftReligiousView?.id === opt.id ? null : opt,
                    )
                  }
                />
              ),
            }))}
          />
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
              borderColor: colors.hairline,
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
              borderColor: colors.hairline,
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
            <PillFlow
              gap={8}
              fillWidth
              style={{ marginTop: 12 }}
              items={draftLanguages.map((opt) => ({
                id: `lang:${resolveLocalized(opt.display, i18n.language, opt.name)}`,
                element: (
                  <OptionPill
                    option={opt}
                    isSelected
                    onPress={toggleLanguage}
                    icon={getLanguageIcon(opt.enumName)}
                  />
                ),
              }))}
            />
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
          <PillFlow
            gap={8}
            fillWidth
            items={petOptions.map((opt) => ({
              id: `pet:${resolveLocalized(opt.display, i18n.language, opt.name)}`,
              element: (
                <OptionPill
                  option={opt}
                  isSelected={draftPets.some((p) => p?.id === opt.id)}
                  onPress={togglePet}
                  icon={getPetIcon(opt.enumName)}
                />
              ),
            }))}
          />
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
        {([
          {
            key: "uni",
            label: t('profile.edit.visibility.showUniversity'),
            value: draftShowMyUniversity,
            field: "showMyUniversity",
          },
          {
            key: "app",
            label: t('profile.edit.visibility.showOnApp'),
            value: draftShowMeOnApp,
            field: "showMeOnApp",
          },
          {
            key: "age",
            label: t('profile.edit.visibility.showAge'),
            value: draftShowAge,
            field: "showAge",
          },
          // Konum — premium'a özel DEĞİL, herkeste görünür. Satır olumlu
          // ("göster") yazıldı: gruptaki diğer satırlar da olumlu ve başlık
          // "Görünürlük"; araya tek bir "gösterme" sokmak switch'in yönünü
          // belirsizleştirirdi. Değer bu yüzden ters çevrilmeden doğrudan
          // `showLocation` alanına yazılıyor.
          //
          // Kapalıyken SADECE karttaki şehir/ilçe (ve harita) gider — keşifte
          // çıkma, mesafe filtresi, karşı tarafın şehir filtresi ve sıralama
          // aynen çalışır. Satırların hepsi tek satır etiket, açıklama yok.
          {
            key: "location",
            label: t('profile.edit.visibility.showLocation'),
            value: draftShowLocation,
            field: "showLocation",
          },
          // Premium rozeti — yalnızca premium kullanıcıda anlamlı (free'de
          // gizlenecek rozet zaten yok). Backend free'den gelen değeri reddetmez,
          // sessizce saklar; satırı basmamak tamamen UI kararı.
          //
          // Kapalıyken SADECE rozet gider: kotalar, filtreler, mesafe tavanı ve
          // keşif sıralamasındaki premium sinyali aynen çalışır.
          //
          // `|| draftShowPremiumBadge === false`: satırı yalnız `isPremium`e
          // bağlamak kilitlenme üretiyordu — kullanıcı rozeti kapatıp premium'u
          // bir an için false görünürse (abonelik yenilenirken, /status
          // gecikirken) ayar ekrandan kayboluyor ve GERİ AÇILAMIYOR; kapalı
          // değer her kayıtta geri yazıldığı için premium dönse bile rozet
          // sönük kalıyor. Kapalıysa satır her zaman görünür.
          ...(isPremium || draftShowPremiumBadge === false
            ? [
                {
                  key: "premiumBadge",
                  label: t('profile.edit.visibility.showPremiumBadge'),
                  value: draftShowPremiumBadge,
                  field: "showPremiumBadge",
                },
              ]
            : []),
        ] as VisibilityRow[]).map((row) => (
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
              borderColor: colors.hairline,
              marginBottom: 8,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
                {row.label}
              </Text>
            </View>
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
                  false: colors.hairlineStrong,
                  true: colors.errorStrong,
                }}
                thumbColor={colors.text}
                ios_backgroundColor={colors.border}
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setValue(row.field, !row.value)}
                style={{
                  width: 46,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: row.value ? colors.errorStrong : colors.hairlineStrong,
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: row.value ? colors.text : colors.textSecondary,
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
