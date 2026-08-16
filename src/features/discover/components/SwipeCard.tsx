import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedRef,
  useSharedValue,
  useFrameCallback,
  runOnJS,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Native gesture varsa GestureDetector ile sarar (SwipeWrapper ile simultaneous için);
// yoksa (PreviewModal gibi standalone kullanımlarda) düz render eder.
function ScrollWrapper({ nativeScrollGesture, children }: any) {
  if (!nativeScrollGesture) return children;
  return (
    <GestureDetector gesture={nativeScrollGesture}>{children}</GestureDetector>
  );
}

// Expanded karttaki scroll davranışı:
//
//  1) ALT UÇ — içeriğin son BOUNCE_ZONE px'inde native bounce açık (parmak
//     basılıyken de). Alt uçta çakışan bir jest yok.
//  2) TOP — native bounce HİÇ açılmaz, scroll sert durur. Sebep: scrollY=0'da
//     pull-down = collapse jesti (SwipeWrapper.verticalPan, native scroll ile
//     simultaneous); bounce açık olsa rubber-band + collapse aynı anda çalışıp
//     kart iki kere oynuyor. Ayrıca bounce, kartın üstünde kart zeminini
//     (siyah) açığa çıkarıp "kart değil içerik kayıyor" hissi veriyordu.
//     Bunun yerine momentum top'a çarptığında fotoğrafa çarpma şiddetiyle
//     orantılı bir zoom-in veriyoruz (zoomImpact) — kart yerinde durur, geri
//     bildirim fotoğraftan gelir.
//  TOP_SAFE_GAP: içerik kısa olup alt-uç zone'u top'a taşarsa bile kural (1)
//  top'un bu kadar yakınında bounce açmaz.
//
// State bu ayrı component'te tutuluyor ve kartın gövdesi `children` prop'u
// olarak geçiyor → toggle sırasında ağır alt ağaç yeniden render edilmiyor.
const BOUNCE_ZONE = 800;
const TOP_SAFE_GAP = 160;
// Top'a varış sayılan eşik (px).
const TOP_HIT_EPS = 0.5;
// Çarpma şiddeti: event başına (≈1 frame) kat edilen px. Bu değerin altı
// zoom tetiklemez, IMPACT_MAX'te zoom tam güçtedir.
const IMPACT_MIN = 8;
const IMPACT_MAX = 55;
// Tam güçte zoom oranı (foto %8 yakınlaşır).
const PHOTO_ZOOM_MAX = 0.08;
function BounceScrollView({
  scrollRef,
  scrollY,
  zoomImpact,
  expanded,
  children,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollY?: SharedValue<number>;
  // Momentum top'a çarptığında 0→şiddet→0 sürülen zoom sinyali.
  zoomImpact: SharedValue<number>;
  expanded: boolean;
  children: React.ReactNode;
}) {
  const [bounces, setBounces] = useState(false);
  // Worklet tarafındaki ayna — her event'te değil, sadece durum değişince
  // runOnJS/setState yapalım.
  const bouncesSV = useSharedValue(false);
  const nearBottomSV = useSharedValue(false);
  const momentumSV = useSharedValue(false);
  // Top'a çarpma tespiti için önceki frame'in pozisyonu ve hızı (px/event).
  const prevY = useSharedValue(0);
  const prevSpeed = useSharedValue(0);
  // Tek momentum döngüsünde zoom bir kez tetiklensin (0 civarında salınan
  // event'ler ikinci kez ateşlemesin).
  const justHitSV = useSharedValue(false);

  const applyBounces = useCallback((next: boolean) => {
    setBounces(next);
  }, []);

  const syncBounces = useCallback(
    (next: boolean) => {
      "worklet";
      if (next === bouncesSV.value) return;
      bouncesSV.value = next;
      runOnJS(applyBounces)(next);
    },
    [applyBounces, bouncesSV],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      if (scrollY) scrollY.value = y;

      // maxY: içeriğin gerçek scroll menzili. y > maxY = alt uçta bounce
      // halindeyiz → nearBottom doğal olarak true kalır, animasyon ortasında
      // bounces kapanıp snap etmez.
      const maxY = e.contentSize.height - e.layoutMeasurement.height;
      const threshold = Math.max(TOP_SAFE_GAP, maxY - BOUNCE_ZONE);
      nearBottomSV.value = maxY > TOP_SAFE_GAP && y > threshold;
      syncBounces(nearBottomSV.value);

      // Top'a çarpma: bu event'te 0'a indik, öncekinde inmemiştik ve momentum
      // sürüyordu (parmak ekranda değil). Şiddet = son iki frame'in en hızlısı;
      // clamp event'i hızı kırpabildiği için önceki frame de dikkate alınır.
      const speed = prevY.value - y;
      if (
        momentumSV.value &&
        y <= TOP_HIT_EPS &&
        prevY.value > TOP_HIT_EPS &&
        !justHitSV.value
      ) {
        const impact = Math.max(speed, prevSpeed.value);
        const p = (impact - IMPACT_MIN) / (IMPACT_MAX - IMPACT_MIN);
        const intensity = p < 0 ? 0 : p > 1 ? 1 : p;
        if (intensity > 0) {
          justHitSV.value = true;
          // Hızlı büyü, yaylanarak geri dön — bounce'un yerini alan geri bildirim.
          zoomImpact.value = withSequence(
            withTiming(intensity, {
              duration: 110,
              easing: Easing.out(Easing.quad),
            }),
            withSpring(0, { damping: 15, stiffness: 130, mass: 0.7 }),
          );
        }
      }
      prevSpeed.value = speed;
      prevY.value = y;
    },
    // Parmak indi — momentum yok; top'ta pull-down = collapse jesti.
    onBeginDrag: () => {
      momentumSV.value = false;
      justHitSV.value = false;
    },
    onMomentumBegin: () => {
      momentumSV.value = true;
      justHitSV.value = false;
    },
    onMomentumEnd: () => {
      momentumSV.value = false;
    },
  });

  // Collapse olunca sıfırla — bir sonraki expand temiz başlasın.
  useEffect(() => {
    if (expanded) return;
    bouncesSV.value = false;
    nearBottomSV.value = false;
    momentumSV.value = false;
    justHitSV.value = false;
    prevY.value = 0;
    prevSpeed.value = 0;
    zoomImpact.value = 0;
    setBounces(false);
  }, [
    expanded,
    bouncesSV,
    nearBottomSV,
    momentumSV,
    justHitSV,
    prevY,
    prevSpeed,
    zoomImpact,
  ]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      bounces={bounces}
      alwaysBounceVertical={false}
      scrollEnabled={expanded}
      style={{ flex: 1 }}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
    >
      {children}
    </Animated.ScrollView>
  );
}
import * as Haptics from "expo-haptics";
import uiBus, { cardExpandAnim, containerExpand } from "@/shared/services/uiBus";
import {
  GraduationCap,
  Heart,
  X,
  Check,
  Cigarette,
  Sparkles,
  Target,
  Briefcase,
  Users,
  Pen,
  ArrowDown,
  PawPrint,
  Wind,
  MapPin,
  BookOpen,
  Building2,
  CalendarDays,
  Languages,
  Moon,
  type LucideIcon,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { getColors } from "react-native-image-colors";
import { colors as theme, gradients } from "../../../shared/theme/colors";
import HobbyIcon from "@/shared/components/HobbyIcon";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import PremiumFlame from "@/shared/components/PremiumFlame";
import { getRelationshipIntentIcon } from "@/shared/constants/relationshipIntent";

import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");
const SCREEN_HEIGHT = height - 188; // Header height (90px) çıkarıldı

// İsmin yanındaki premium ateş ikonunun kutu boyutu (collapsed: text-4xl isim).
// Expanded başlık daha küçük (text-3xl) → ikon da oranlı küçülür.
const PREMIUM_FLAME_SIZE = 26;
const PREMIUM_FLAME_SIZE_EXPANDED = 22;

// Daha önce yüklenmiş foto URI'leri — kart remount olunca skeleton tekrar açılmasın
const loadedPhotoUris = new Set();

// Dominant color cache — aynı foto için tekrar tekrar extract etmesin
const dominantColorCache = new Map();

// HSL utilities for Spotify-style color processing
function hexToRgb(hex) {
  let c = (hex || "").replace("#", "");
  if (c.length === 3)
    c = c
      .split("")
      .map((ch) => ch + ch)
      .join("");
  if (c.length < 6) return [0, 0, 0];
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  const toHex = (n) =>
    Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Spotify-tarzı renk dönüşümü: lightness'ı sabit derinlikte cap'ler,
// saturation'ı moderate aralıkta tutar. Her foto için tutarlı bir
// "premium" his üretir, ham vibrant renkleri muted'lar.
function spotifyColor(hex) {
  if (!hex) return theme.surface5;
  const [r, g, b] = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  const h = hsl[0];
  let s = hsl[1];
  let l = hsl[2];
  // Lightness cap → tüm renkler aynı derinlikte görünür
  l = Math.min(l, 0.28);
  l = Math.max(l, 0.18);
  // Saturation: anlamlı renk varsa moderate aralığa çek; gri (s<0.1) ise
  // olduğu gibi bırak — saturation zorlamak gri input'a fake hue ekler
  // (örn. saf gri → koyu kırmızı).
  if (s > 0.1) {
    s = Math.min(s, 0.6);
    s = Math.max(s, 0.35);
  }
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return rgbToHex(nr, ng, nb);
}

// Spotify-tarzı color picking:
// Alan-ağırlıklı slotlar önceliklendirilir; vibrant/primary küçük ama saturated
// aksanları seçtiği için sona itildi. Örnek: fotoda büyük sarı tişört + küçük
// kırmızı araba → lib'in `primary`/`vibrant`'ı kırmızıyı verirdi (saturation
// avantajı), ama `background`/`dominant`/`lightVibrant`/`muted` sarıyı yakalar.
//
// iOS (UIImageColors):
//   - background: en yaygın alan rengi (= subject baskın renk genelde)
//   - primary: background ile KONTRAST eden renk (text/aksan)
//   - secondary, detail: ikincil aksanlar
//
// Android (Palette API):
//   - dominant: histogram'da en yaygın bucket (alan-ağırlıklı)
//   - lightVibrant/darkVibrant/vibrant: en saturated; AMA alan ağırlığı yok
//   - lightMuted/darkMuted/muted: az saturated, genellikle daha geniş alan
function pickSpotifyColor(result) {
  if (!result) return null;

  // Alan-ağırlıklı (subject likely) → saturated-aksan (small accent likely)
  const candidates =
    result.platform === "ios"
      ? [
          result.background, // en yaygın alan rengi
          result.detail,
          result.secondary,
          result.primary, // contrast — son çare
        ]
      : [
          result.dominant, // histogram baskın
          result.lightVibrant, // parlak büyük objeler (sarı tişört vs.)
          result.lightMuted,
          result.muted,
          result.darkVibrant,
          result.darkMuted,
          result.vibrant, // küçük çok saturated aksan — son çare
        ];

  // İlk geçerli rengi al (monokromatik değil, anlamlı saturation/lightness).
  for (const c of candidates) {
    if (!c) continue;
    const [r, g, b] = hexToRgb(c);
    const [, s, l] = rgbToHsl(r, g, b);
    const isMonochromatic = s < 0.12 || l > 0.92 || l < 0.05;
    if (!isMonochromatic && s >= 0.18 && l >= 0.08 && l <= 0.85) {
      return c;
    }
  }

  // Hiçbir aday uygun değil → nötr koyu (mostly-white veya mostly-black foto)
  return theme.surface4;
}

// Foto URI'sinden dominant rengi çıkarır (Spotify-tarzı bg gradient için).
// pickSpotifyColor() ile aday renkler skor üzerinden seçilir. Cache'lenir.
function useDominantColor(uri) {
  const [color, setColor] = useState(() =>
    uri ? dominantColorCache.get(uri) || null : null,
  );

  useEffect(() => {
    if (!uri) {
      setColor(null);
      return;
    }
    if (dominantColorCache.has(uri)) {
      setColor(dominantColorCache.get(uri));
      return;
    }
    let cancelled = false;
    getColors(uri, {
      cache: true,
      key: uri,
      fallback: theme.bg,
      quality: "high",
    })
      .then((result) => {
        if (cancelled) return;
        const dominant = pickSpotifyColor(result);
        if (dominant) {
          dominantColorCache.set(uri, dominant);
          setColor(dominant);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return color;
}

// Shimmer'lı skeleton — foto yüklenirken üstte gösterilir
function SkeletonBox({ w, h, borderRadius = 8 }: any) {
  const shimmer = useSharedValue(-w);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(w * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer, w]);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));
  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius,
        borderCurve: "continuous",
        backgroundColor: theme.surface,
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
            width: w * 2,
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

// usagePurposeDisplay → ikon eşlemesi (EditProfileForm PURPOSE_META ile aynı).
const getPurposeIcon = (
  purposeName: string,
): { sf: SFSymbol; lucide: LucideIcon } => {
  const map: Record<string, { sf: SFSymbol; lucide: LucideIcon }> = {
    // Backend enumName (PascalCase)
    Dating: { sf: "sparkles", lucide: Sparkles },
    Friendship: { sf: "person.2.fill", lucide: Users },
    Networking: { sf: "briefcase.fill", lucide: Briefcase },
    JustLooking: { sf: "wind", lucide: Wind },
    // Legacy TR display fallback
    Flört: { sf: "sparkles", lucide: Sparkles },
    Arkadaşlık: { sf: "person.2.fill", lucide: Users },
    Öylesine: { sf: "wind", lucide: Wind },
  };
  return map[purposeName] || { sf: "target", lucide: Target };
};

// GetPotentialMatches → her kartın `thingsInCommon` rozetleri. Eşleme
// `kindName` ile yapılıyor: dil değişse de sabit kalan anahtar o. Kardeşi
// `kind` şu an aynı string'i taşıyor ama ileride numaraya dönebilir — ona
// GÜVENME.
const THING_IN_COMMON_ICONS: Record<string, { sf: SFSymbol; lucide: LucideIcon }> =
  {
    Hobby: { sf: "sparkles", lucide: Sparkles },
    University: { sf: "graduationcap.fill", lucide: GraduationCap },
    Department: { sf: "book.fill", lucide: BookOpen },
    City: { sf: "building.2.fill", lucide: Building2 },
    District: { sf: "mappin.and.ellipse", lucide: MapPin },
    YearOfStudy: { sf: "calendar", lucide: CalendarDays },
    SpokenLanguage: { sf: "globe", lucide: Languages },
    RelationshipIntent: { sf: "heart.fill", lucide: Heart },
    UsagePurpose: { sf: "target", lucide: Target },
    Pet: { sf: "pawprint.fill", lucide: PawPrint },
    ZodiacSign: { sf: "moon.stars.fill", lucide: Moon },
  };

// Backend ileride yeni tür ekleyebilir; bilinmeyen `kindName` ÇÖKMEMELİ,
// varsayılan ikonla görünmeli.
const DEFAULT_THING_IN_COMMON_ICON: { sf: SFSymbol; lucide: LucideIcon } = {
  sf: "checkmark.circle.fill",
  lucide: Check,
};

interface SwipeCardProps {
  /**
   * Backend ProfileCardDto. Tipli olması bilinçli: alan adları burada
   * okunuyor, backend birini yeniden adlandırdığında sessizce `undefined`
   * render etmek yerine derleme hatası alınsın (kart eskiden `any` idi ve
   * `universityName`, `*Display`, `hobbies` gibi alanların hiçbiri sözleşmede
   * tanımlı değildi).
   */
  profile: PotentialMatch;
  hideActions?: boolean;
  onPass?: () => void;
  onLike?: () => void;
  onSuperLike?: () => void;
  /** Expand sonrası native scroll konumu — SwipeWrapper'ın pan'i okuyor. */
  scrollY?: SharedValue<number>;
  /** Pan ile simultaneous çalışan Gesture.Native() örneği. */
  nativeScrollGesture?: ReturnType<typeof Gesture.Native>;
  /** Pull-down süper beğeni doluluk oranı (0-1). */
  superLikeProgress?: SharedValue<number>;
  isTopCard?: boolean;
  expanded?: boolean;
  /** Profil önizleme / liker modal'ı: jest ve aksiyonlar devre dışı. */
  previewMode?: boolean;
  hideChevron?: boolean;
  hideSuperLike?: boolean;
  onExpandPress?: () => void;
  superLikesRemaining?: number | null;
}

export default function SwipeCard({
  profile,
  hideActions = false,
  onPass,
  onLike,
  onSuperLike,
  scrollY,
  nativeScrollGesture,
  superLikeProgress,
  isTopCard = true,
  expanded = false,
  previewMode = false,
  hideChevron = false,
  hideSuperLike = false,
  onExpandPress,
}: SwipeCardProps) {
  useRenderCount("SwipeCard");
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState(
    () => new Set(loadedPhotoUris),
  );

  // Kart frame'inin gerçek render yüksekliği — onLayout ile ölçülür.
  // Foto height bu değere göre hizalanır → CARD_HEIGHT/SCREEN_HEIGHT'in window
  // bazlı sabit hesabı yanlış olduğu için bottom'da gradient görünmesini engeller.
  const [measuredCardHeight, setMeasuredCardHeight] = useState(0);
  const photoHeight = measuredCardHeight || SCREEN_HEIGHT;
  // ScrollView içerik toplam yüksekliği — foto bottom'un gradient pozisyonunu
  // hesaplamak için lazım (blend'in bg ile aynı renge bitmesi için).

  // Diğer fotoları arka planda prefetch — render edilmediler ama cache'e
  // alınıyor; user foto değiştirince anında gelir (skeleton görmeden).
  // Sadece TOP card için; bottom card foto prefetch'i gereksiz network yükü.
  // İlk foto zaten Image src'ile yükleniyor → skip.
  useEffect(() => {
    if (!isTopCard) return;
    if (!profile?.photos) return;
    profile.photos.forEach((uri, i) => {
      if (i === 0) return;
      if (!loadedPhotoUris.has(uri)) Image.prefetch(uri);
    });
  }, [isTopCard, profile?.photos]);

  // Expand animasyonu progress — module-level shared value (uiBus.cardExpandAnim).
  // ScrollHandler scroll pozisyonuna göre direkt yazar (0 = top, 1 = scroll>=150).
  // TabNavigator de bu değeri okuyarak tab bar translateY uyguluyor.
  // previewMode'da kendi local shared value'umuzu kullanırız — Discover'daki
  // gerçek kartı etkilemeyelim, ve hemen expanded başlayalım.
  const localExpandAnim = useSharedValue(previewMode ? 1 : 0);
  const expandAnim = previewMode ? localExpandAnim : cardExpandAnim;
  // Top card unmount/remount olduğunda baseline'ı resetle.
  // containerExpand de reset edilir → expanded'ken swipe atılırsa yeni top kart
  // padded boyutta gelir (tab bar üstünde durur).
  // previewMode'da reset YOK — modal expanded açılsın.
  useEffect(() => {
    if (previewMode) return;
    if (isTopCard) {
      expandAnim.value = 0;
      containerExpand.value = 0;
    }
  }, [isTopCard, expandAnim, previewMode]);

  // Profile Info heavy mount swipe sonu lag'inin sebebi olmadığı test edildi
  // (Test A — gate kaldırıldı, lag aynıydı). Yine de gate'i koruyoruz: Profile
  // Info mount'unu animation tail'ından sonraya öteler, görsel olarak temiz.
  const [profileReady, setProfileReady] = useState(false);
  useEffect(() => {
    if (!isTopCard) {
      setProfileReady(false);
      return;
    }
    const id = setTimeout(() => setProfileReady(true), 100);
    return () => clearTimeout(id);
  }, [isTopCard]);

  // Photo border radius — expand olunca da rounded kalır (kart-benzeri görünüm).
  const photoBorderStyle = useAnimatedStyle(() => ({
    borderRadius: 40,
  }));

  // Momentum top'a çarpınca fotoğraf zoom-in yapıp yaylanarak geri döner —
  // native top bounce'un yerini alan geri bildirim. Kart/scroll yerinde durur,
  // dolayısıyla fotonun üstünde kart zemini (siyah boşluk) açılmaz ve
  // scrollY=0'daki pull-down collapse jestiyle çakışma olmaz.
  // Zoom SADECE foto katmanına uygulanır (bullets/blur/kalp/isim/chevron ayrı
  // kardeş katmanlar) → overlay'ler ölçeklenmez, foto clipping kutusu ve
  // köşe yuvarlaklığı sabit kalır.
  const photoZoom = useSharedValue(0);
  const photoZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + PHOTO_ZOOM_MAX * photoZoom.value }] as const,
  }));

  // Stagger: pills ilk %55'te tamamen kaybolur (önce gider)
  const pillsAnimStyle = useAnimatedStyle(() => {
    const p = Math.min(1, expandAnim.value / 0.55);
    return {
      opacity: 1 - p,
      transform: [{ translateY: 10 * p }],
    };
  });

  // Name — uni pill ile aynı timing'de fade out + translateY.
  // Pills 0→0.55 expandAnim aralığında kaybolur, name de aynı.
  const nameAnimStyle = useAnimatedStyle(() => {
    const p = Math.min(1, expandAnim.value / 0.55);
    return {
      transform: [{ translateY: 10 * p }],
      opacity: 1 - p,
    };
  });

  // Profile info — fade-in + slide-up. Pull-up gesture sırasında alttan
  // yukarı kayarak gelir, opacity progressively artar.
  const profileInfoAnimStyle = useAnimatedStyle(() => ({
    opacity: expandAnim.value,
    transform: [{ translateY: 80 * (1 - expandAnim.value) }],
  }));

  // Chevron full range — rotate animasyonu yumuşak gözüksün
  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${180 * expandAnim.value}deg` }],
  }));

  // Foto bottom blur — çekme oranına göre yavaşça kaybolur. Spring overshoot
  // expandAnim'i geçici olarak >1 yapabiliyor → negatif opacity'yi engellemek
  // için Math.max ile clamp.
  const bottomBlurAnimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, 1 - expandAnim.value)),
  }));

  // İlk fotodan dominant rengi çıkar — Spotify-tarzı bg gradient için.
  // ÖNCE tanımlanmalı: aşağıdaki useMemo'lar dependency olarak kullanıyor.
  const firstPhotoUri =
    profile?.photos && profile.photos.length > 0 ? profile.photos[0] : null;
  const dominantColor = useDominantColor(firstPhotoUri);

  // Sınıf etiketi — backend `yearOfStudyDisplay` göndermezse sayıdan üret.
  // yearOfStudy null/undefined ise boş string: aksi halde "null. sınıf" gibi
  // metin çıkıyor ve bölümün yanındaki ayraç noktası boşa asılı kalıyordu.
  const yearOfStudyLabel = useMemo(() => {
    if (profile?.yearOfStudyDisplay) return profile.yearOfStudyDisplay;
    if (profile?.yearOfStudy === 0) return t("profile.card.prep");
    if (profile?.yearOfStudy != null)
      return t("profile.card.grade", { year: profile.yearOfStudy });
    return "";
  }, [profile?.yearOfStudyDisplay, profile?.yearOfStudy, t]);

  // "Ortak noktalar" rozetleri. DİKKAT: ortak nokta yoksa backend boş dizi
  // DEĞİL `null` gönderiyor — `.length` yerine Array.isArray ile kontrol et.
  // Kart başına en fazla 4 rozet dönüyor, ayrıca kırpmıyoruz.
  const thingsInCommon = useMemo(() => {
    const raw = profile?.thingsInCommon;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item: any) => {
      // `label` sunucuda aktif dile göre çözülmüş halde geliyor — ÇEVİRME,
      // doğrudan bas.
      const label = typeof item?.label === "string" ? item.label.trim() : "";
      if (!label) return [];
      const kindName = typeof item?.kindName === "string" ? item.kindName : "";
      return [
        {
          // Tek istisna: University rozetinde backend üniversite ADINI
          // gönderiyor; pilde okul adı yerine "Aynı Üniversite" yazıyoruz —
          // isim zaten hemen üstteki universityName satırında duruyor.
          label:
            kindName === "University"
              ? t('profile.card.sameUniversity')
              : label,
          icon:
            THING_IN_COMMON_ICONS[kindName] ?? DEFAULT_THING_IN_COMMON_ICON,
        },
      ];
    });
  }, [profile?.thingsInCommon, t]);

  // Expanded karttaki gradient'in en üst rengi (spotify → theme.bg fade).
  const photoBottomGradColor = useMemo(
    () => spotifyColor(dominantColor),
    [dominantColor],
  );

  // Top kart kart bottom rengini tab bar'a yayınlar. Tab bar bu rengi top
  // edge'inden #000 bottom'a fade ederek gradient bg yapar → kart o alana
  // uzanmış gibi görünür.
  useEffect(() => {
    if (!isTopCard) return;
    uiBus.emit("cardBottomColor", photoBottomGradColor);
  }, [isTopCard, photoBottomGradColor]);

  // Scroll-driven expand: 0-150px arası scroll → cardExpandAnim 0→1.
  // Linear yerine ease-in-out cubic curve uygulanıyor: start ve end yumuşak,
  // ortada hızlı — daha "premium" hissi (Spotify/Apple Music modal tarzı).
  // ScrollView ref — expand sonrası native scroll için.
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>();

  // Pan-driven expand: cardExpandAnim SwipeWrapper.verticalPan tarafından
  // sürülüyor (rubber-band). Scroll sadece scrollY tracking için (super-like
  // detection); cardExpandAnim'i yazmaz çünkü ScrollView ancak expand sonrası
  // aktif olur ve expand state'inde cardExpandAnim 1'de sabit kalır.
  // Scroll handler + alt-uç bounce mantığı BounceScrollView içinde.

  // Pull-down (super-like) sırasında kalp: fill rengi DEĞİŞMEZ, sadece büyür
  // ve threshold'a doğru artan hızda titreşir.
  // shakePhase her frame'de progress'e bağlı bir frekansla ilerler → titreşim
  // hızı pull arttıkça artar (useFrameCallback ile UI thread'de).
  // heartPressAnim: kalbe basılı tutunca da aynı animasyon threshold'u geçmiş
  // (p=1) haliyle oynar — pull ile press'ten hangisi büyükse o sürer.
  const heartPressAnim = useSharedValue(0);
  const shakePhase = useSharedValue(0);
  useFrameCallback((frame) => {
    "worklet";
    const pull = superLikeProgress ? superLikeProgress.value : 0;
    const p = Math.max(pull, heartPressAnim.value);
    if (p <= 0.001) {
      shakePhase.value = 0;
      return;
    }
    const dt = frame.timeSincePreviousFrame ?? 16;
    // p: 0→1 iken frekans ~4→16 döngü/sn → threshold'a yaklaştıkça hızlanır.
    const freq = 4 + p * 12;
    shakePhase.value += (dt / 1000) * freq;
  });
  const heartPullStyle = useAnimatedStyle(() => {
    const pull = superLikeProgress ? superLikeProgress.value : 0;
    const p = Math.max(pull, heartPressAnim.value);
    const scale = 1 + p * 0.35; // threshold'a doğru büyür
    const amp = p * 8; // titreşim genliği (derece), pull arttıkça artar
    const angle = Math.sin(shakePhase.value * Math.PI * 2) * amp;
    return {
      transform: [{ scale }, { rotate: `${angle}deg` }] as const,
    };
  });

  // Premium vurgusu — super-like kalbi üzerinde 6sn'de bir soldan sağa geçen
  // shimmer parıltısı. Sweep ~1.7sn sürer, ardından 4.3sn bekler (toplam 6sn döngü).
  const heartShimmer = useSharedValue(0);
  useEffect(() => {
    heartShimmer.value = 0;
    heartShimmer.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 4300 }),
      ),
      -1,
      false,
    );
  }, [heartShimmer]);
  // Band kalpten çok geniş (150px) → parıltının falloff'u daha da uzun bir
  // mesafeye yayılır = iyice yumuşak, göz almayan geçiş. Peak -150→+55 arası.
  const heartShimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -150 + heartShimmer.value * 205 }],
  }));

  if (!profile) return null;

  // Combine all photos into one array
  const allPhotos =
    profile.photos && profile.photos.length > 0 ? profile.photos : [];

  const handlePhotoPress = (event) => {
    const touchX = event.nativeEvent.locationX;
    // Threshold ortaya kadar gelmesin — sadece kenarlardaki ~1/4'lük alan foto değiştirir
    const leftZone = width * 0.28;
    const rightZone = width * 0.72;

    if (touchX >= rightZone) {
      // Sağ kenara basıldı - sonraki fotoğraf
      if (currentPhotoIndex < allPhotos.length - 1) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentPhotoIndex((prev) => prev + 1);
      }
    } else if (touchX <= leftZone) {
      // Sol kenara basıldı - önceki fotoğraf
      if (currentPhotoIndex > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentPhotoIndex((prev) => prev - 1);
      }
    }
    // Orta bölgeye basıldı — eskiden expand toggle yapardı; artık scroll-driven,
    // tap orta bir şey yapmıyor.
  };

  // Foto tap — Pressable yerine Gesture.Tap kullanıyoruz çünkü Pressable
  // 10-15px hareket toleransıyla pan'lerin alt threshold'unda fire ediyor
  // (kullanıcı pull-down yapmaya başlıyor, parmağı kaldırıyor, "tap" sayılıp
  // foto değişiyordu). maxDistance(8) → 8px'ten fazla hareket varsa tap iptal.
  const photoTap = Gesture.Tap()
    .maxDistance(8)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      handlePhotoPress({ nativeEvent: { locationX: e.x } });
    });

  return (
    <Animated.View
      style={[
        {
          borderRadius: 50,
          borderCurve: "continuous",
          overflow: "hidden",
        },
      ]}
      className="flex-1 bg-bg"
      onLayout={(e) => {
        // nativeEvent'i SENKRON oku: synthetic event handler dönünce geri
        // havuza alınıp null'lanıyor. Değeri updater closure'ında okumak
        // ("released synthetic event" → nativeEvent null) crash veriyordu.
        const h = e.nativeEvent.layout.height;
        setMeasuredCardHeight((prev) => prev || h);
      }}
    >
      <ScrollWrapper nativeScrollGesture={nativeScrollGesture}>
        <BounceScrollView
          scrollRef={scrollViewRef}
          scrollY={scrollY}
          zoomImpact={photoZoom}
          expanded={expanded}
        >
          {/* Outer wrapper — solid #121212 bg. Eskiden 4-stop LinearGradient'di
              ama multi-stop shader compile mount sırasında ciddi lag yaratıyordu.
              Profile Info'nun kendi inner gradient'i (spotify→#121212 fade)
              zaten görsel geçişi sağlıyor. Foto'nun rounded corners'ı kart
              frame'inin #121212 bg'siyle uyumlu. */}
          <View style={{ backgroundColor: theme.bg }}>
            {/* Photo Gallery — expanded olurken borderRadius 40→0 anime */}
            {allPhotos.length > 0 ? (
              <Animated.View
                style={[
                  {
                    borderCurve: "continuous",
                    overflow: "hidden",
                    height: photoHeight,
                    backgroundColor: theme.surface,
                  },
                  photoBorderStyle,
                ]}
                className="relative"
              >
                {/* Tüm fotoları mount edip opacity ile gizliyoruz — bir kez yüklenince
                    geçişler instant, photo 0'a dönünce remount yok = skeleton flash yok.
                    Bottom card için sadece ilk foto mount (gereksiz network yükü). */}
                <GestureDetector gesture={photoTap}>
                  {/* Zoom katmanı — top'a çarpma geri bildirimi (photoZoomStyle).
                      Parent clipping kutusu ve borderRadius sabit kaldığı için
                      foto kartın içinde yakınlaşır, kart kıpırdamaz. */}
                  <Animated.View style={[{ flex: 1 }, photoZoomStyle]}>
                    {allPhotos
                      .map((photo, index) => ({ photo, index }))
                      .filter(({ index }) => (isTopCard ? true : index === 0))
                      .map(({ photo, index }) => (
                        <Image
                          key={index}
                          source={{ uri: photo }}
                          style={{
                            position: "absolute",
                            width: width,
                            height: photoHeight,
                            opacity: currentPhotoIndex === index ? 1 : 0,
                          }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={photo}
                          // Üst kart decode kuyruğunda önceliklidir; alttaki kart
                          // düşük öncelikle arkada yüklenir (algılanan hız).
                          priority={isTopCard ? "high" : "low"}
                          transition={150}
                          onLoadEnd={() => {
                            loadedPhotoUris.add(photo);
                            setLoadedPhotos((prev) => {
                              if (prev.has(photo)) return prev;
                              const next = new Set(prev);
                              next.add(photo);
                              return next;
                            });
                          }}
                        />
                      ))}
                  </Animated.View>
                </GestureDetector>

                {/* Skeleton overlay — current foto henüz yüklenmediyse */}
                {allPhotos[currentPhotoIndex] &&
                  !loadedPhotos.has(allPhotos[currentPhotoIndex]) && (
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                      }}
                      pointerEvents="none"
                    >
                      <SkeletonBox
                        w={width}
                        h={photoHeight}
                        borderRadius={40}
                      />
                    </View>
                  )}

                {/* Pagination Indicator - Bullets */}
                {allPhotos.length > 1 && (
                  <View
                    className="absolute top-6 left-0 right-0 items-center z-50"
                    pointerEvents="none"
                  >
                    <View className="flex-row gap-[4px]">
                      {allPhotos.map((_, index) => (
                        <View
                          key={index}
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor:
                              index === currentPhotoIndex
                                ? theme.text
                                : "rgba(255,255,255,0.4)",
                          }}
                        />
                      ))}
                    </View>
                  </View>
                )}

                {/* Top Blur Gradient Overlay */}
                <MaskedView
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 230,
                    pointerEvents: "none",
                  }}
                  maskElement={
                    <LinearGradient
                      colors={[
                        "rgba(0,0,0,1)",
                        "rgba(0,0,0,0.4)",
                        "transparent",
                      ]}
                      locations={[0, 0.6, 1]}
                      style={{ flex: 1 }}
                    />
                  }
                >
                  <BlurView intensity={90} tint="dark" style={{ flex: 1 }} />
                </MaskedView>

                {/* Bottom Blur Gradient Overlay — çekme oranıyla fade out.
                    Pozisyon `bottom:0` yerine `top: photoHeight - 310` ile
                    sabit absolute koordinat — collapse anında parent height
                    transient bir frame için değişse bile blur'un foto bottom'una
                    yapışık kalır, ekran altına düşmez. */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: Math.max(0, photoHeight - 310),
                      left: 0,
                      right: 0,
                      height: 370,
                    },
                    bottomBlurAnimStyle,
                  ]}
                >
                  <MaskedView
                    style={{ flex: 1 }}
                    maskElement={
                      <LinearGradient
                        {...(easeGradient({
                          colorStops: {
                            0: { color: "transparent" },
                            0.5: { color: "black" },
                            1: { color: "rgba(0,0,0,0.99)" },
                          },
                        }) as any)}
                        style={StyleSheet.absoluteFill}
                      />
                    }
                  >
                    <LinearGradient
                      colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.45)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <BlurView
                      intensity={15}
                      tint={
                        Platform.OS === "ios"
                          ? "systemChromeMaterialDark"
                          : "systemMaterialDark"
                      }
                      style={StyleSheet.absoluteFill}
                    />
                  </MaskedView>
                </Animated.View>

                {/* Super Like Button — sadece Lucide Heart icon (eski hali). */}
                {!hideActions && !hideSuperLike && (
                  <View style={{ position: "absolute", top: 28, right: 28 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        onSuperLike?.();
                      }}
                      onPressIn={() => {
                        heartPressAnim.value = withTiming(1, {
                          duration: 180,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      onPressOut={() => {
                        heartPressAnim.value = withTiming(0, {
                          duration: 180,
                          easing: Easing.out(Easing.quad),
                        });
                      }}
                      hitSlop={12}
                    >
                      <Animated.View
                        style={[{ width: 55, height: 55 }, heartPullStyle]}
                      >
                          {/* LitPlus tonlu gradient dolgu — Heart şeklinde
                              maskelenir (lucide fill tek renk aldığı için
                              gradyanı MaskedView ile veriyoruz). */}
                          <MaskedView
                            style={StyleSheet.absoluteFill}
                            maskElement={
                              <Heart
                                size={55}
                                color="black"
                                strokeWidth={0}
                                fill="black"
                              />
                            }
                          >
                            <LinearGradient
                              colors={gradients.swipeHeart}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={{ flex: 1 }}
                            />
                          </MaskedView>
                          {/* Premium shimmer — kalp şekline maskeli, 4sn'de bir
                              soldan sağa geçen parıltı. */}
                          <MaskedView
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                            maskElement={
                              <Heart
                                size={55}
                                color="black"
                                strokeWidth={0}
                                fill="black"
                              />
                            }
                          >
                            <Animated.View
                              style={[
                                {
                                  position: "absolute",
                                  top: 0,
                                  bottom: 0,
                                  left: 0,
                                  width: 150,
                                },
                                heartShimmerStyle,
                              ]}
                            >
                              <LinearGradient
                                {...(easeGradient({
                                  colorStops: {
                                    0: { color: "transparent" },
                                    0.5: { color: "rgba(255,255,255,0.22)" },
                                    1: { color: "transparent" },
                                  },
                                }) as any)}
                                start={{ x: 0, y: 0.35 }}
                                end={{ x: 1, y: 0.65 }}
                                style={StyleSheet.absoluteFill}
                              />
                            </Animated.View>
                          </MaskedView>
                          {/* İnce açık border */}
                          <Heart
                            size={55}
                            color={theme.swipeHeartBorder}
                            strokeWidth={0.1}
                            fill="transparent"
                          />
                      </Animated.View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Name and Age on Photo — sadece measuredCardHeight set olduktan
                    sonra render. Aksi halde photoHeight fallback (SCREEN_HEIGHT)
                    ile başlayıp actual yüksekliğe geçince name yukarı sıçrar. */}
                {measuredCardHeight > 0 && (
                  <View
                    className="absolute bottom-[70px] left-6 right-6"
                    pointerEvents="none"
                  >
                    <Animated.View
                      style={[{ marginBottom: 2, gap: 4 }, nameAnimStyle]}
                    >
                      {/* Premium rozeti artık ayrı pill değil — yaşın sağında
                          Discover sekmesinin ateş ikonu. Dolgu super-like
                          kalbiyle birebir aynı: ikon şekline maskelenmiş
                          gradients.swipeHeart (bkz. kalp / SuperLikeBurst). */}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Text
                          className="text-white text-4xl font-bold"
                          style={{ flexShrink: 1 }}
                        >
                          {profile.displayName}
                          {profile.age != null ? `, ${profile.age}` : ""}
                        </Text>
                        {profile.isPremium && (
                          <PremiumFlame size={PREMIUM_FLAME_SIZE} />
                        )}
                      </View>
                    </Animated.View>

                    {/* University & Usage Purpose — expand olunca fade out.
                        universityName yoksa hiç render etme → name'in altında
                        boşluk kalmasın, isim bottom'a otursun. */}
                    {profile.universityName && (
                      <Animated.View
                        style={[
                          {
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginTop: 4,
                            // Altına rozet sırası geliyorsa aradaki boşluğu
                            // rozetler taşısın, ikisi üst üste binmesin.
                            marginBottom: thingsInCommon.length > 0 ? 8 : 16,
                          },
                          pillsAnimStyle,
                        ]}
                      >
                        <View
                          style={{
                            borderRadius: 999,
                            borderCurve: "continuous",
                            overflow: "hidden",
                          }}
                          className="flex-row items-center self-start py-1 gap-1"
                        >
                          <Text className=" text-white font-[600] text-[16px]">
                            {profile.universityName}
                          </Text>
                        </View>
                      </Animated.View>
                    )}

                    {/* Ortak noktalar — swipe kararının verildiği an burası,
                        o yüzden kartı açmadan görünen overlay'de duruyor.
                        Üniversite satırıyla aynı fade grubunda: expand olunca
                        detay kartındaki bölümlerle çakışmasın diye kaybolur. */}
                    {thingsInCommon.length > 0 && (
                      <Animated.View
                        style={[
                          {
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                            marginTop: profile.universityName ? 0 : 6,
                            marginBottom: 16,
                          },
                          pillsAnimStyle,
                        ]}
                      >
                        {thingsInCommon.map((thing, index) => (
                          <View
                            key={`${thing.label}-${index}`}
                            style={{
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
                              // Expanded section'larla aynı kenar; zemin ise
                              // onların bgSoft'undan bir tık açık.
                              backgroundColor: theme.overlay.surfaceSoft,
                              borderWidth: 0.5,
                              borderColor: theme.overlay.whiteFaint,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                // Premium pill ile aynı padding (px-4 py-3).
                                // Text'in kendisine değil satıra veriyoruz,
                                // yoksa ikon padding dışında kalıyor.
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                              }}
                            >
                              <SFIcon
                                name={thing.icon.sf}
                                fallback={thing.icon.lucide}
                                size={13}
                                color={theme.text}
                                strokeWidth={2}
                                weight="semibold"
                              />
                              <Text className="text-white font-[600] text-[13px]">
                                {thing.label}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </Animated.View>
                    )}
                    {/* {profile.usagePurposeDisplay && (
                      <View
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                        }}
                        className="flex-row items-center border-[0.5px] border-white/50 self-start px-3 py-3 gap-1"
                      >
                        <Target size={16} color={theme.neutral200} strokeWidth={1.5} />
                        <Text className="ml-[2px] text-gray-300 font-medium text-[13px]">
                          {profile.usagePurposeDisplay}
                        </Text>
                      </View>
                    )} */}
                  </View>
                )}

                {/* Chevron — bottom-center, expanded olunca animasyonla yukarı döner.
                    Name overlay gibi measuredCardHeight gate'li → ilk render'da
                    yanlış pozisyondan jump etmesin. */}
                {!hideChevron && measuredCardHeight > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 30,
                      left: 0,
                      right: 0,
                      alignItems: "center",
                      zIndex: 60,
                    }}
                    pointerEvents="box-none"
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (expanded) {
                          const sv = scrollViewRef.current as unknown as {
                            scrollTo?: (opts: { y: number; animated: boolean }) => void;
                          } | null;
                          sv?.scrollTo?.({ y: 0, animated: true });
                          setTimeout(() => onExpandPress?.(), 180);
                        } else {
                          onExpandPress?.();
                        }
                      }}
                      hitSlop={16}
                      activeOpacity={1}
                      disabled={!onExpandPress}
                    >
                      <Animated.View style={chevronAnimStyle}>
                        <SFIcon
                          name="arrow.down"
                          fallback={ArrowDown}
                          size={28}
                          color={theme.text}
                          strokeWidth={2}
                          weight="semibold"
                        />
                      </Animated.View>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            ) : (
              <View
                className="w-full h-[500px] items-center justify-center"
                style={{ backgroundColor: theme.surface }}
              >
                <Text className="text-gray-400 text-lg">{t('profile.card.noPhoto')}</Text>
              </View>
            )}

            {/* Heavy content (university, hobbies, location+map, vb.) sadece
                top card'da + isTopCard true olduktan 100ms sonra render →
                swipe sonu mount lag'i için defer. */}
            {isTopCard && profileReady && (
              /* Profile Info — ayrı kart görünümü: kendi borderRadius'u, foto
                 altında 10px gap. Inner LinearGradient spotify→#121212 fade. */
              <Animated.View
                className="p-6 pt-8 px-4"
                style={[
                  {
                    overflow: "hidden",
                    borderRadius: 40,
                    borderCurve: "continuous",
                    marginTop: 10,
                  },
                  profileInfoAnimStyle,
                ]}
              >
                <LinearGradient
                  colors={[spotifyColor(dominantColor), theme.bg, theme.bg]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  locations={[0, 0.75, 1]}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  }}
                  pointerEvents="none"
                />
                {/* Name + Age — expanded'ken kartın üst tarafında görünür
                    (photo overlay'deki name'i replace eder; o fade-out olur).
                    Premium ateşi collapsed başlıktakiyle aynı — PreviewModal /
                    LikerSwipeModal kartı SADECE bu satırı gösterdiği için rozet
                    burada da olmalı. */}
                <View
                  className="mb-10 ml-4"
                  style={{
                    paddingHorizontal: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    className="text-white text-3xl font-bold"
                    style={{ flexShrink: 1 }}
                  >
                    {profile.displayName}
                    {profile.age != null ? `, ${profile.age}` : ""}
                  </Text>
                  {profile.isPremium && (
                    <PremiumFlame size={PREMIUM_FLAME_SIZE_EXPANDED} />
                  )}
                </View>
                {/* University & Department */}
                {profile.showUniversity && profile.departmentDisplay && (
                  <View
                    style={{
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className=" p-4 py-7 -mt-3 rounded-[45px] mb-4 border-white/10 border-[0.5px]"
                  >
                    <View className="flex-row flex-wrap items-center gap-3">
                      {/* Bölüm + sınıf artık tek satır → uzun bölüm adları
                          taşmasın diye zincir boyunca flex-1 veriliyor;
                          metin sütunu kalan genişliğe sarılır. */}
                      <View className="flex-1 self-start flex-row items-center">
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <SFIcon
                            name="graduationcap.fill"
                            fallback={GraduationCap}
                            size={22}
                            color={theme.text}
                          />
                          <View className="flex-col items-start gap-1 flex-1">
                            <Text className="text-white font-medium text-[18px]">
                              {profile.universityName}
                            </Text>
                            {/* Bölüm · Sınıf tek satırda — beyaz, medium,
                                aralarında nokta ayraç. Sınıf bilinmiyorsa
                                nokta da render edilmez. */}
                            <Text className="text-white font-medium text-[16px]">
                              {profile.departmentDisplay}
                              {yearOfStudyLabel ? ` · ${yearOfStudyLabel}` : ""}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                                {/* Kullanım Amacı — başlık olarak direkt cümle */}
                {profile.usagePurposeDisplay &&
                  (() => {
                    const purposeIcon = getPurposeIcon(
                      profile.usagePurpose ?? profile.usagePurposeDisplay,
                    );
                    return (
                      <View
                        style={{
                          borderRadius: 40,
                          borderCurve: "continuous",
                          overflow: "hidden",
                          backgroundColor: "rgba(18,18,18,0.8)",
                        }}
                        className="mb-4 p-5 py-7 border-[0.5px] border-white/10"
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingHorizontal: 4,
                          }}
                        >
                          <SFIcon
                            name={purposeIcon.sf}
                            fallback={purposeIcon.lucide}
                            size={20}
                            color={theme.text}
                          />
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 18,
                              fontWeight: "500",
                              flex: 1,
                              flexShrink: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            {t('profile.card.usagePurpose', { purpose: profile.usagePurposeDisplay.toLowerCase() })}
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                {profile.hobbies && profile.hobbies.length > 0 && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-8 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-white text-[18px] font-semibold">
                        {t('profile.card.myInterests')}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {profile.hobbies.map((hobby, index) => {
                        // Hobi ya düz etiket ya da {enumName, name} çifti gelir.
                        // Daralma doğrudan typeof üzerinden: ara bir `isObj`
                        // değişkeni TS'e `label`ın string olduğunu anlatmıyor.
                        const enumName =
                          typeof hobby === "object" ? hobby?.enumName : undefined;
                        const label =
                          typeof hobby === "object" ? hobby?.name : hobby;
                        return (
                          <View
                            key={index}
                            className="self-start"
                            style={{
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
                              backgroundColor: "transparent",
                              borderWidth: 0.5,
                              borderColor: theme.border,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 12,
                                paddingVertical: 14,
                                gap: 8,
                              }}
                            >
                              {/* Emoji lineHeight (size*1.25) pili lifestyle
                                  pilinden yüksek yapıyordu; ikon kutusunu
                                  SFIcon ile aynı 18px'e sabitliyoruz. Emoji
                                  bu kutudan taşar (HobbyIcon açık height
                                  verdiği için kırpılmaz), pilin 14px dikey
                                  padding'i taşmayı rahatça karşılıyor. */}
                              <View
                                style={{
                                  height: 18,
                                  justifyContent: "center",
                                  alignItems: "center",
                                  overflow: "visible",
                                }}
                              >
                                <HobbyIcon
                                  hobby={enumName ?? label}
                                  size={18}
                                  color={theme.text}
                                  strokeWidth={1.5}
                                />
                              </View>
                              <Text className="text-white font-[500] text-[15px]">
                                {label}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Lifestyle Info */}
                {(profile.smokingStatusDisplay ||
                  profile.zodiacSignDisplay ||
                  profile.relationshipIntentDisplay ||
                  profile.hasPets != null) && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-8 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-white text-[18px] font-semibold">
                        {t('profile.card.myLifestyle')}
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {[
                        // İlişki niyeti — ikon enumName'e bağlı; enumName
                        // gelmezse ortak harita default kalbe düşer.
                        profile.relationshipIntentDisplay && {
                          key: "relationshipIntent",
                          ...getRelationshipIntentIcon(
                            profile.relationshipIntent,
                          ),
                          label: profile.relationshipIntentDisplay,
                        },
                        profile.smokingStatusDisplay && {
                          key: "smoking",
                          sf: "smoke.fill" as SFSymbol,
                          lucide: Cigarette,
                          label: profile.smokingStatusDisplay,
                        },
                        profile.zodiacSignDisplay && {
                          key: "zodiac",
                          sf: "sparkles" as SFSymbol,
                          lucide: Sparkles,
                          label: profile.zodiacSignDisplay,
                        },
                        profile.hasPets != null && {
                          key: "pets",
                          sf: "pawprint.fill" as SFSymbol,
                          lucide: PawPrint,
                          label: profile.hasPets
                            ? t('profile.card.petsYes')
                            : t('profile.card.petsNo'),
                        },
                      ]
                        .filter(Boolean)
                        .map(({ key, sf, lucide, label }) => (
                          <View
                            key={key}
                            className="self-start"
                            style={{
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
                              backgroundColor: "transparent",
                              borderWidth: 0.5,
                              borderColor: theme.border,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                paddingHorizontal: 12,
                                paddingVertical: 14,
                                gap: 8,
                              }}
                            >
                              <SFIcon
                                name={sf}
                                fallback={lucide}
                                size={18}
                                color={theme.text}
                              />
                              <Text className="text-white font-[500] text-[15px]">
                                {label}
                              </Text>
                            </View>
                          </View>
                        ))}
                    </View>
                  </View>
                )}



                {/* Bio */}
                {profile.bio && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-5 pt-8 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-2 px-4">
                      <Text className="text-white text-[18px] font-semibold">
                        {t('profile.card.knowMeAs')}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        borderWidth: 0,
                        borderColor: "rgba(255,255,255,0.1)",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          gap: 8,
                        }}
                      >
                        <SFIcon
                          name="pencil"
                          fallback={Pen}
                          size={18}
                          color={theme.text}
                          style={{ marginTop: 2 }}
                        />
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 15,
                            lineHeight: 22,
                            flex: 1,
                            flexShrink: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          {profile.bio}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Konum */}
                {(profile.cityDisplay || profile.districtDisplay) && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-5 pt-8 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-2 px-4">
                      <Text className="text-white text-[18px] font-semibold">
                        {t('profile.card.location')}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        borderWidth: 0,
                        borderColor: "rgba(255,255,255,0.1)",
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-start",
                          paddingHorizontal: 14,
                          paddingVertical: 14,
                          gap: 8,
                        }}
                      >
                        <SFIcon
                          name="mappin"
                          fallback={MapPin}
                          size={18}
                          color={theme.text}
                          style={{ marginTop: 2 }}
                        />
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 15,
                            lineHeight: 22,
                            flex: 1,
                            flexShrink: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          {[profile.districtDisplay, profile.cityDisplay]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
                {/* Action Buttons */}
                {!hideActions && (onPass || onLike) && (
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 80,
                      paddingVertical: 40,
                      paddingBottom: 40 + insets.bottom + 66,
                    }}
                  >
                    <TouchableOpacity
                      onPress={onPass}
                      activeOpacity={0.7}
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: 34,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View pointerEvents="none">
                        <SFIcon
                          name="xmark"
                          fallback={X}
                          size={75}
                          color={theme.text}
                          strokeWidth={5}
                          weight="heavy"
                        />
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={onLike}
                      activeOpacity={0.8}
                      style={{
                        width: 68,
                        height: 68,
                        borderRadius: 34,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <View pointerEvents="none">
                        <SFIcon
                          name="checkmark"
                          fallback={Check}
                          size={75}
                          color={theme.text}
                          strokeWidth={5}
                          weight="heavy"
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            )}
          </View>
        </BounceScrollView>
      </ScrollWrapper>
    </Animated.View>
  );
}
