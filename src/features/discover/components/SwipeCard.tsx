import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { buildMapboxStaticUrl } from "@/shared/constants/mapbox";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useAnimatedRef,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
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
import * as Haptics from "expo-haptics";
import uiBus, { cardExpandAnim, containerExpand } from "@/shared/services/uiBus";
import {
  MapPin,
  GraduationCap,
  BookOpen,
  Heart,
  X,
  Check,
  Cigarette,
  Sparkles,
  Target,
  // Hobby icons
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
  Theater,
  Soup,
  ShoppingBag,
  Orbit,
  ChevronRight,
  ChevronDown,
  Pen,
  ArrowDown,
  PawPrint,
  Wind,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { getColors } from "react-native-image-colors";
const { width, height } = Dimensions.get("window");
const CARD_HEIGHT = height - 200;
const SCREEN_HEIGHT = height - 188; // Header height (90px) çıkarıldı

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
  if (!hex) return "#1a1a1a";
  const [r, g, b] = hexToRgb(hex);
  let [h, s, l] = rgbToHsl(r, g, b);
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
  return "#2a2a2a";
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
      fallback: "#121212",
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
        backgroundColor: "#1E1E1E",
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

// Icon mapping for hobbies — RegisterStep13Screen ile birebir aynı
// (backend bu isimleri döndürüyor; eskisi farklı key'ler kullandığı için
// çoğu hobby fallback Heart'a düşüyordu).
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

// usagePurposeDisplay → ikon eşlemesi (EditProfileForm PURPOSE_META ile aynı).
const getPurposeIcon = (purposeName) => {
  const map = {
    Flört: Sparkles,
    Arkadaşlık: Users,
    Network: Briefcase,
    Öylesine: Wind,
  };
  return map[purposeName] || Target;
};

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
  superLikeDisabled = false,
  superLikesRemaining,
}: any) {
  const insets = useSafeAreaInsets();
  const [isFilled, setIsFilled] = useState(false);
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

  // Eski kullanım için (TabNavigator listener'ı yok artık ama emit zararsız).
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
  const scrollViewRef = useAnimatedRef();

  // Pan-driven expand: cardExpandAnim SwipeWrapper.verticalPan tarafından
  // sürülüyor (rubber-band). Scroll sadece scrollY tracking için (super-like
  // detection); cardExpandAnim'i yazmaz çünkü ScrollView ancak expand sonrası
  // aktif olur ve expand state'inde cardExpandAnim 1'de sabit kalır.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      if (scrollY) scrollY.value = y;
    },
  });

  // Pull-down sırasında kalbin doluluk overlay'inin opacity'si
  const heartFillStyle = useAnimatedStyle(() => {
    return {
      opacity: superLikeProgress ? superLikeProgress.value : 0,
    };
  });

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
      className="flex-1 bg-[#121212]"
      onLayout={(e) =>
        setMeasuredCardHeight((prev) => prev || e.nativeEvent.layout.height)
      }
    >
      <ScrollWrapper nativeScrollGesture={nativeScrollGesture}>
        <Animated.ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={expanded}
          style={{ flex: 1 }}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Outer wrapper — solid #121212 bg. Eskiden 4-stop LinearGradient'di
              ama multi-stop shader compile mount sırasında ciddi lag yaratıyordu.
              Profile Info'nun kendi inner gradient'i (spotify→#121212 fade)
              zaten görsel geçişi sağlıyor. Foto'nun rounded corners'ı kart
              frame'inin #121212 bg'siyle uyumlu. */}
          <View style={{ backgroundColor: "#121212" }}>
            {/* Photo Gallery — expanded olurken borderRadius 40→0 anime */}
            {allPhotos.length > 0 ? (
              <Animated.View
                style={[
                  {
                    borderCurve: "continuous",
                    overflow: "hidden",
                    height: photoHeight,
                  },
                  photoBorderStyle,
                ]}
                className="relative bg-gray-500"
              >
                {/* Tüm fotoları mount edip opacity ile gizliyoruz — bir kez yüklenince
                    geçişler instant, photo 0'a dönünce remount yok = skeleton flash yok.
                    Bottom card için sadece ilk foto mount (gereksiz network yükü). */}
                <GestureDetector gesture={photoTap}>
                  <View style={{ flex: 1 }}>
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
                          resizeMode="cover"
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
                  </View>
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
                                ? "#fff"
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
                    Pozisyon `bottom:0` yerine `top: photoHeight - 330` ile
                    sabit absolute koordinat — collapse anında parent height
                    transient bir frame için değişse bile blur'un foto bottom'una
                    yapışık kalır, ekran altına düşmez. */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: Math.max(0, photoHeight - 270),
                      left: 0,
                      right: 0,
                      height: 330,
                    },
                    bottomBlurAnimStyle,
                  ]}
                >
                  <MaskedView
                    style={{ flex: 1 }}
                    maskElement={
                      <LinearGradient
                        {...easeGradient({
                          colorStops: {
                            0: { color: "transparent" },
                            0.5: { color: "black" },
                            1: { color: "rgba(0,0,0,0.99)" },
                          },
                        })}
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
                {!hideActions && (
                  <View className="absolute top-6 right-6">
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (!superLikeDisabled) setIsFilled(true);
                        onSuperLike?.();
                      }}
                      hitSlop={12}
                    >
                      <View style={{ width: 35, height: 35 }}>
                        <Heart
                          size={35}
                          color="#fff"
                          strokeWidth={1.5}
                          fill={isFilled ? "#fff" : "transparent"}
                        />
                        {/* Pull-down progressive fill */}
                        <Animated.View
                          pointerEvents="none"
                          style={[
                            {
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                            },
                            heartFillStyle,
                          ]}
                        >
                          <Heart
                            size={35}
                            color="#fff"
                            strokeWidth={1.5}
                            fill="#fff"
                          />
                        </Animated.View>
                        {typeof superLikesRemaining === "number" &&
                          superLikesRemaining >= 0 && (
                            <View
                              pointerEvents="none"
                              style={{
                                position: "absolute",
                                top: -6,
                                right: -10,
                                minWidth: 18,
                                height: 18,
                                borderRadius: 9,
                                borderCurve: "continuous",
                                backgroundColor: "rgba(0,0,0,0.6)",
                                borderWidth: 0.5,
                                borderColor: "rgba(255,255,255,0.3)",
                                alignItems: "center",
                                justifyContent: "center",
                                paddingHorizontal: 5,
                              }}
                            >
                              <Text
                                style={{
                                  color: "#fff",
                                  fontSize: 10,
                                  fontWeight: "700",
                                  fontVariant: ["tabular-nums"],
                                }}
                              >
                                {superLikesRemaining}
                              </Text>
                            </View>
                          )}
                      </View>
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
                    {profile.isPremium && (
                      <Animated.View className="mb-1" style={nameAnimStyle}>
                        <BlurView
                          tint="dark"
                          intensity={40}
                          style={{
                            borderRadius: 999,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            alignSelf: "flex-start",
                          }}
                          className=""
                        >
                          <Text className="text-white text-[11px] px-4 py-3 font-bold">
                            Premium
                          </Text>
                        </BlurView>
                      </Animated.View>
                    )}
                    <Animated.View
                      style={[{ marginBottom: 2, gap: 4 }, nameAnimStyle]}
                    >
                      <Text className="text-white text-4xl font-bold">
                        {profile.displayName}
                        {profile.age != null ? `, ${profile.age}` : ""}
                      </Text>
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
                            marginBottom: 16,
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
                          className="flex-row items-center self-start px-1 py-1 gap-1"
                        >
                          <Text className=" text-white font-[600] text-[16px]">
                            {profile.universityName}
                          </Text>
                        </View>
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
                        <Target size={16} color="#d1d5db" strokeWidth={1.5} />
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
                {measuredCardHeight > 0 && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 30,
                      left: 0,
                      right: 0,
                      alignItems: "center",
                      zIndex: 60,
                    }}
                    pointerEvents="none"
                  >
                    <Animated.View style={chevronAnimStyle}>
                      <ArrowDown size={28} color="#fff" strokeWidth={2} />
                    </Animated.View>
                  </View>
                )}
              </Animated.View>
            ) : (
              <View className="w-full h-[500px] bg-gray-200 items-center justify-center">
                <Text className="text-gray-400 text-lg">No photo</Text>
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
                  colors={[spotifyColor(dominantColor), "#121212", "#121212"]}
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
                    (photo overlay'deki name'i replace eder; o fade-out olur). */}
                <View className="mb-10 ml-4" style={{ paddingHorizontal: 4 }}>
                  <Text className="text-white text-3xl font-bold">
                    {profile.displayName}, {profile.age}
                  </Text>
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
                      <View className=" self-start flex-row items-center">
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",

                            gap: 8,
                          }}
                        >
                          <GraduationCap
                            size={22}
                            color="#fff"
                            strokeWidth={1.5}
                          />
                          <View className="flex-col items-start gap-2">
                            <Text className="text-white font-medium text-[18px]">
                              {profile.universityName}
                            </Text>
                            <Text className="text-gray-300 font-medium text-[14px]">
                              {profile.departmentDisplay}
                            </Text>
                            <Text className="text-gray-400 font-normal text-[14px]">
                              {profile.yearOfStudyDisplay ||
                                (profile.yearOfStudy === 0
                                  ? "Hazırlık"
                                  : `${profile.yearOfStudy}. Sınıf`)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {profile.hobbies && profile.hobbies.length > 0 && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-5 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-4 px-4">
                      <Text className="text-white text-[13px] font-semibold">
                        Hobiler
                      </Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {profile.hobbies.map((hobby, index) => {
                        const HobbyIcon = getHobbyIcon(hobby);
                        return (
                          <BlurView
                            intensity={90}
                            key={index}
                            className="self-start border-[0.5px] border-white/10"
                            style={{
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
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
                              <HobbyIcon
                                size={18}
                                color="#fff"
                                strokeWidth={1.5}
                              />
                              <Text className="text-white font-[500] text-[13px]">
                                {hobby}
                              </Text>
                            </View>
                          </BlurView>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Lifestyle Info */}
                {(profile.smokingStatusDisplay ||
                  profile.zodiacSignDisplay ||
                  profile.hasPets != null) && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-5 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-4 px-4">
                      <Text className="text-white text-[13px] font-semibold">
                        Yaşam Tarzı
                      </Text>
                    </View>
                    <View>
                      {profile.smokingStatusDisplay && (
                        <View
                          style={{
                            borderRadius: 40,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            borderWidth: 0,
                            borderColor: "rgba(255,255,255,0.1)",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 16,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Cigarette
                              size={18}
                              color="#fff"
                              strokeWidth={1.5}
                            />
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: "500",
                              }}
                            >
                              Sigara Kullanımı
                            </Text>
                          </View>
                          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
                            {profile.smokingStatusDisplay}
                          </Text>
                        </View>
                      )}
                      {profile.zodiacSignDisplay && (
                        <View
                          style={{
                            borderRadius: 40,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            borderWidth: 0,
                            borderColor: "rgba(255,255,255,0.1)",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 16,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <Sparkles
                              size={18}
                              color="#fff"
                              strokeWidth={1.5}
                            />
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: "500",
                              }}
                            >
                              Burç
                            </Text>
                          </View>
                          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
                            {profile.zodiacSignDisplay}
                          </Text>
                        </View>
                      )}
                      {profile.hasPets != null && (
                        <View
                          style={{
                            borderRadius: 40,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            borderWidth: 0,
                            borderColor: "rgba(255,255,255,0.1)",
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: 16,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <PawPrint
                              size={18}
                              color="#fff"
                              strokeWidth={1.5}
                            />
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 14,
                                fontWeight: "500",
                              }}
                            >
                              Evcil Hayvan
                            </Text>
                          </View>
                          <Text style={{ color: "#9CA3AF", fontSize: 14 }}>
                            {profile.hasPets ? "Var" : "Yok"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* Kullanım Amacı — başlık olarak direkt cümle */}
                {profile.usagePurposeDisplay &&
                  (() => {
                    const PurposeIcon = getPurposeIcon(
                      profile.usagePurposeDisplay,
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
                          <PurposeIcon
                            size={20}
                            color="#fff"
                            strokeWidth={1.5}
                          />
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 18,
                              fontWeight: "500",
                              flex: 1,
                              flexShrink: 1,
                              flexWrap: "wrap",
                            }}
                          >
                            Bu uygulamayı{" "}
                            {profile.usagePurposeDisplay.toLocaleLowerCase(
                              "tr",
                            )}{" "}
                            için kullanıyorum
                          </Text>
                        </View>
                      </View>
                    );
                  })()}

                {/* Bio */}
                {profile.bio && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      backgroundColor: "rgba(18,18,18,0.8)",
                    }}
                    className="mb-4 p-5 py-5 border-[0.5px] border-white/10"
                  >
                    <View className="flex-row items-center mb-2 px-4">
                      <Text className="text-white text-[13px] font-semibold">
                        Biyografi
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
                        <Pen
                          size={18}
                          color="#fff"
                          strokeWidth={1.5}
                          style={{ marginTop: 2 }}
                        />
                        <Text
                          style={{
                            color: "#fff",
                            fontSize: 14,
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
                {/* Location Info */}
                {(profile.cityDisplay || profile.districtDisplay) && (
                  <View className="mb-4">
                    {profile.cityDisplay && profile.districtDisplay && (
                      <View style={{ gap: 10 }}>
                        {/* Full-width dikdörtgen harita — 4 kenarına LinearGradient
                        fade konup kart arkaplan rengi (#121212) ile karışıyor. */}
                        <View
                          className="rounded-[50px] border-[0.5px] border-white/10 overflow-hidden"
                          style={{
                            borderCurve: "continuous",
                            width: "100%",
                            height: 250,
                            overflow: "hidden",
                            backgroundColor: "#121212",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                          pointerEvents="none"
                        >
                          {profile.districtLatitude != null &&
                          profile.districtLongitude != null ? (
                            <Image
                              source={{
                                uri: buildMapboxStaticUrl({
                                  latitude: profile.districtLatitude,
                                  longitude: profile.districtLongitude,
                                  zoom: 6,
                                  width: 600,
                                  height: 320,
                                }),
                              }}
                              style={{ width: "100%", height: "100%" }}
                              resizeMode="cover"
                            />
                          ) : (
                            <MapPin
                              size={32}
                              color="#9CA3AF"
                              strokeWidth={1.5}
                            />
                          )}

                          {/* Radial (yuvarlak) vignette fade — merkez net,
                          oval kenarlar kart arkaplan rengiyle (#121212) karışıyor.
                          objectBoundingBox koordinat sistemi sayesinde gradient
                          kutunun aspect ratio'suna göre oval şekil alır. */}

                          {/* Ortalanmış konum pill — BlurView zemin üzerinde
                          district + distance bilgisi */}
                          <View
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            pointerEvents="none"
                          >
                            <BlurView
                              intensity={60}
                              tint="dark"
                              style={{
                                borderRadius: 999,
                                borderCurve: "continuous",
                                overflow: "hidden",
                                paddingHorizontal: 18,
                                paddingVertical: 10,
                                alignItems: "center",
                                gap: 2,
                              }}
                            >
                              <Text className="text-white font-bold text-[15px]">
                                {profile.districtDisplay}, {profile.cityDisplay}
                              </Text>
                              <Text className="text-gray-200 font-[400] text-[12px]">
                                {profile.distance} km uzakta
                              </Text>
                            </BlurView>
                          </View>
                        </View>
                      </View>
                    )}
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
                        <X size={75} color="#fff" strokeWidth={5} />
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
                        <Check size={75} color="#fff" strokeWidth={5} />
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>
            )}
          </View>
        </Animated.ScrollView>
      </ScrollWrapper>
    </Animated.View>
  );
}
