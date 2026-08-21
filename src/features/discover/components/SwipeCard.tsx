import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
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
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { AnimatedRef, SharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PHOTO_ZOOM_MAX,
  TOP_HIT_EPS,
  impactIntensity,
  isNearBottom,
  zoomImpactAnimation,
} from "./cardScrollTuning";

// Native gesture varsa GestureDetector ile sarar (SwipeWrapper ile simultaneous için);
// yoksa (PreviewModal gibi standalone kullanımlarda) düz render eder.
function ScrollWrapper({ nativeScrollGesture, children }: any) {
  if (!nativeScrollGesture) return children;
  return (
    <GestureDetector gesture={nativeScrollGesture}>{children}</GestureDetector>
  );
}

// Expanded karttaki scroll davranışı — kurallar ve sabitler cardScrollTuning'de
// (aynı davranışı sheet içindeki kart da CardSheetScrollView ile kullanıyor).
//
// State bu ayrı component'te tutuluyor ve kartın gövdesi `children` prop'u
// olarak geçiyor → toggle sırasında ağır alt ağaç yeniden render edilmiyor.
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

      nearBottomSV.value = isNearBottom(
        y,
        e.contentSize.height,
        e.layoutMeasurement.height,
      );
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
        const intensity = impactIntensity(
          Math.max(speed, prevSpeed.value),
        );
        if (intensity > 0) {
          justHitSV.value = true;
          zoomImpact.value = zoomImpactAnimation(intensity);
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
    // Native offset'i de başa al. scrollEnabled=false olduğu an ScrollView son
    // contentOffset'inde donuyor: kart collapsed görünürken içerik kaymış
    // kalıyor ve scrollY hiç sıfırlanmıyordu — SwipeWrapper'ın dikey pan'i
    // `scrollY > 0` gate'ine takılıp pull-up expand'i kalıcı olarak öldürüyordu.
    // (Chevron yolu önce animated scrollTo yapıyor; burası artakalanı çeker.)
    const sv = scrollRef.current as unknown as {
      scrollTo?: (opts: { y: number; animated: boolean }) => void;
    } | null;
    sv?.scrollTo?.({ y: 0, animated: false });
    if (scrollY) scrollY.value = 0;
  }, [
    expanded,
    bouncesSV,
    nearBottomSV,
    momentumSV,
    justHitSV,
    prevY,
    prevSpeed,
    zoomImpact,
    scrollRef,
    scrollY,
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
import uiBus, {
  cardExpandAnim,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import {
  GraduationCap,
  Heart,
  X,
  Check,
  Sparkles,
  Pen,
  ArrowDown,
  PawPrint,
  MapPin,
  BookOpen,
  Building2,
  CalendarDays,
  Languages,
  Moon,
  Flag,
  Ban,
  Ruler,
  type LucideIcon,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { getColors } from "react-native-image-colors";
import {
  colors as theme,
  gradients,
  getIntentCardGradient,
  isLight,
  onMediaAt,
  scrimAt,
} from "../../../shared/theme/colors";
import { buildMapboxStaticUrl } from "@/shared/constants/mapbox";
import { lookupCityCoordinate } from "@/shared/constants/cityCoordinates";
import HobbyIcon from "@/shared/components/HobbyIcon";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import PremiumFlame from "@/shared/components/PremiumFlame";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import PillFlow from "@/shared/components/PillFlow";
import {
  getAlcoholIcon,
  getPetIcon,
  getSmokingIcon,
} from "@/shared/constants/filterEnumIcons";

import { useRenderCount } from "@/shared/debug/useRenderCount";
import type { PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");
const SCREEN_HEIGHT = height - 188; // Header height (90px) çıkarıldı

// İsmin yanındaki premium ateş ikonunun kutu boyutu (collapsed: text-4xl isim).
// Expanded başlık daha küçük (text-3xl) → ikon da oranlı küçülür.
const PREMIUM_FLAME_SIZE = 26;
const PREMIUM_FLAME_SIZE_EXPANDED = 22;

// Expanded panelin alt ucu: zemin surface3'ten sayfa zeminine (theme.bg —
// açık modda beyaz) çözülür. Rampa TAM ikonların başladığı çizgide biter,
// yukarı doğru uzar; iki isteğin (geç başlasın + yumuşak olsun) tek ortak
// ayarı bu uzunluk, çünkü bitiş noktası sabit:
//   kısa  → geçiş dar bir şeride sıkışır, sert görünür
//   uzun  → yumuşar ama başlangıcı yukarı, son bölüm kartının arkasına kaçar
// 120: rampanın üst ~yarısı kartın son 80px'inin arkasına denk gelse de orada
// renk değişimi %10'un altında (ease-in-out yavaş başlar) + kart dolgusunun
// altından yalnızca %25 sızıyor → başlangıç göze görünmüyor, asıl geçiş
// kartın altındaki boşlukta oluyor.
// Stop sayısı 12 → 28: uzayan rampada bant oluşmasın.
const ACTIONS_ROW_PADDING_TOP = 40;
const ACTIONS_FADE_HEIGHT = 120;
const ACTIONS_FADE_STOPS = 28;

// Fotoğrafı olmayan profilde görselin yerini tutan zemin. Modla DÖNER: koyu
// modun tonlarını açık temaya taşımak kartı beyaz ekranın ortasında siyah bir
// yama gibi gösteriyordu.
// İkisi de aşağı doğru koyulaşıyor, bu şart: isim/üniversite/chevron fotoğraf
// üstü sayıldığı için iki modda da sabit beyaz (bkz. onMedia kuralı) ve alt
// perde tek başına açık gri bir zeminde onları taşıyamıyor. Üst uç açık
// kalır — kartın gövdesi temaya ait görünsün.
const PHOTOLESS_BACKDROP_DARK = ["#2E2E33", "#151517"] as const;
const PHOTOLESS_BACKDROP_LIGHT = ["#EDEDF1", "#B4B4BC"] as const;

// Boy pilinin akıl-sağlığı sınırları (cm). Backend profil alanını bu aralıkta
// doğruluyor (bkz. RegisterStep12Screen MIN/MAX_HEIGHT) — dışına düşen değer
// ya bozuk ya da sentinel (0 gibi) demektir ve pill hiç çizilmez: "0 cm" bilgi
// değil gürültü. Keşif FİLTRESİNİN aralığı (120–230) bundan geniş, o backend'in
// ayrı bir doğrulaması; burada gösterilen profil alanının kendi sözleşmesi.
const HEIGHT_MIN_CM = 140;
const HEIGHT_MAX_CM = 220;

// "ilişki" ekini alan ilişki niyetleri (bkz. relationshipIntentLabel).
// Anahtar DAİMA enumName: `display` Accept-Language'e göre değişiyor.
const RELATIONSHIP_INTENTS_WITH_SUFFIX = new Set([
  "LongTerm",
  "ShortTerm",
  "LongTermOpenToShort",
  "ShortTermOpenToLong",
]);

// Expanded karttaki bölüm kutularının (üniversite, hobiler, yaşam tarzı, bio,
// konum) ORTAK çerçevesi. Niyet kartı HARİÇ: zemini gradyan olduğu için
// çerçeve gradyanın kenarında çizgi gibi okunuyordu, kutu zaten renkle
// ayrışıyor. Tek düz hairline yerine kenarlar arası tonlanan
// bir pah: ışık yukarıdan geliyormuş gibi üst kenar parlak, alt kenar sönük →
// kutu zeminden hafifçe kabarık okunuyor.
//
// Neden gölge DEĞİL: bu kutuların hepsinde `overflow: "hidden"` var (niyet
// kartının absoluteFill gradyanı ve köşe kırpması buna bağlı) ve iOS'ta
// clipsToBounds katmanın kendi gölgesini de kırpar — shadow* prop'ları hiç
// görünmezdi. Kenar renkleri kırpılmadığı için 3D etkisi çerçeveden veriliyor.
//
// RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi): modül seviyesinde
// sabite alınırsa tema değişince bayat kalır.
function sectionBevel() {
  // Koyuda çerçeve beyaz-üstü şeffaf (üst parlak → alt söner), açıkta
  // siyah-üstü (üst sönük → alt koyu, yani gölge aşağıda). İki modda da
  // nötr gri: renk taşımıyor, yalnız hacim veriyor.
  //
  // KOYUDA ALT KENARIN TABANI VAR: açıkta "alt = gölge" çünkü siyahı
  // koyulaştıracak yer var, koyuda ise zemin zaten neredeyse siyah
  // (surfaceTranslucent = rgba(18,18,18,.8) → bg #121212 / surface3 #262626)
  // ve beyaz alfayı 0'a indirmek kenarı gölgeye değil YOKLUĞA çeviriyordu —
  // kutu "sadece üstte çerçevesi var" gibi okunuyordu. Bu yüzden koyuda
  // aralık daraltıldı: alt hâlâ en sönük kenar ama zeminden ayrışacak bir
  // tabanın altına inmiyor. Alfalar genel olarak da düşük tutuluyor —
  // çerçeve fark edilsin ama kutunun içeriğinden önce göze çarpmasın.
  return isLight()
    ? {
        borderWidth: 1,
        borderTopColor: "rgba(0,0,0,0.03)",
        borderLeftColor: "rgba(0,0,0,0.055)",
        borderRightColor: "rgba(0,0,0,0.055)",
        borderBottomColor: "rgba(0,0,0,0.11)",
      }
    : {
        borderWidth: 1,
        borderTopColor: "rgba(255,255,255,0.07)",
        borderLeftColor: "rgba(255,255,255,0.045)",
        borderRightColor: "rgba(255,255,255,0.045)",
        borderBottomColor: "rgba(255,255,255,0.035)",
      };
}

// Ek takmadan önce "kelime display'de zaten var mı" kontrolü. Türkçe noktalı I
// yüzünden düz `toLowerCase()` yetmiyor ("İlişki" → nokta birleşik kalıyor);
// iki tarafı da aynı şekilde sadeleştirip karşılaştırıyoruz.
function normalizeForWordMatch(text) {
  return (text || "").replace(/[İIı]/g, "i").toLowerCase();
}

function containsWord(text, word) {
  if (!word) return false;
  return normalizeForWordMatch(text).includes(normalizeForWordMatch(word));
}

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
  // Lightness cap → tüm renkler aynı derinlikte görünür. Bant bilinçli olarak
  // yukarı çekildi (eskiden 0.18–0.28): gradyanın en üst durağı bu, ve açık
  // modda theme.bg beyaza gittiği için çok koyu bir tepe sert bir geçiş
  // yapıyordu. Üst sınır 0.34'ün üstüne çıkarsa expanded kartın beyaz başlığı
  // (theme.onMedia) okunmaya başlar zorlanır.
  l = Math.min(l, 0.34);
  l = Math.max(l, 0.23);
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
          colors={["transparent", theme.shimmer, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// "Bugün aktif" satırı — isim bloğunun ÜSTÜNDE, yeşil.
//
// DİL UYARISI (backend sözleşmesi): `isOnlineToday` 24 SAATLİK penceredir,
// anlık presence değil. Burada "Çevrimiçi" YAZMA — kullanıcı mesaj atıp anında
// yanıt bekler. Anlık online yalnız sohbette var (partnerIsOnline).
//
// Foto üstünde de açılmış kartın chrome zemininde de BİREBİR aynı çiziliyor:
// 9px nokta + sabit `success` yeşili. Önceden chrome tarafı 8px nokta +
// `successText` (açık modda koyulaşan ton) kullanıyordu; satır expand
// animasyonu boyunca yer değiştirirken renk/boy atlaması göze çarpıyordu.
// Açık modda `successText`in ekstra kontrastı bilinçli olarak tek görünüme
// feda edildi — değiştirmeden önce bunu bil.
const ACTIVITY_DOT_SIZE = 9;

function ActivityStatus({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {/* Nokta sakin: parlama/nabız YOK — o "şu an bağlı" sinyalidir. */}
      <View
        style={{
          width: ACTIVITY_DOT_SIZE,
          height: ACTIVITY_DOT_SIZE,
          borderRadius: ACTIVITY_DOT_SIZE / 2,
          backgroundColor: theme.success,
        }}
      />
      <Text className="font-[600] text-[13px]" style={{ color: theme.success }}>
        {label}
      </Text>
    </View>
  );
}

// "Burada yeni" rozeti — ortak nokta pill'leriyle aynı kapsül (999 +
// continuous), aynı 0.5 hairline kenar, aynı px-4/py-3 iç boşluk, aynı
// 13px/600 yazı; ortak nokta sırasının EN SOLUNDA, ilk item olarak çiziliyor.
// Tek AYRIŞTIĞI yer zemin: ortak noktalar yarı saydam (surfaceTranslucent),
// bu rozet OPAK `bg` — açık modda beyaz, koyu modda uygulama zemini
// (#121212). Sıradan öne çıkması için bilinçli.
function NewMemberBadge({ label }: { label: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: theme.bg,
        borderWidth: 0.5,
        borderColor: theme.hairline,
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text className="font-[600] text-[13px]" style={{ color: theme.text }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

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
    // `UsagePurpose` (ordinal 8) KALDIRILDI: backend bu ortak noktayı artık
    // üretmiyor. Ordinal 8 backend'de REZERVE — Pet=9 / ZodiacSign=10 yerinde,
    // buradaki eşleme `kindName` ile yapıldığı için indeks kayması da yok.
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
  /**
   * Top'a çarpma zoom sinyali (0-1). Kartı SARAN bir scroller varsa (sheet
   * modal'ları: CardSheetScrollView) scroll onda olur, kartın kendi
   * BounceScrollView'ı kapalıdır — zoom'u dışarıdan sürebilsin diye shared
   * value dışarıdan verilir. Verilmezse kart kendi local'ini kullanır.
   */
  zoomImpact?: SharedValue<number>;
  /** Profil önizleme / liker modal'ı: jest ve aksiyonlar devre dışı. */
  previewMode?: boolean;
  hideChevron?: boolean;
  hideSuperLike?: boolean;
  onExpandPress?: () => void;
  /**
   * Kartın en altındaki kırmızı moderasyon ikonları. VERİLMEZSE ÇİZİLMEZ —
   * kendi profilini önizlediğin yerde (ProfileScreen > PreviewModal) bu
   * ikonların çıkmaması buna bağlı.
   */
  onReport?: () => void;
  onBlock?: () => void;
  superLikesRemaining?: number | null;
}

// Moderasyon ikonu — şikayet ve engelle. Aksiyon satırı varsa onun İÇİNDE
// duruyor (şikayet X'in solunda, engelle tikin sağında), aksiyonlar gizliyse
// (PreviewModal) kendi satırında. Renk Ayarlar'daki "Hesabı Sil" butonunun
// kırmızısı; 60x60 kutu + 34px glif, like/pass'in 68/75'inin bir tık altında.
// Etiket accessibilityLabel'da: ikon tek başına duruyor, metin taşımıyor.
function ModerationIconButton({
  onPress,
  label,
  name,
  fallback,
  strokeWidth = 1.5,
  weight = "regular",
}: {
  onPress: () => void;
  label: string;
  name: SFSymbol;
  fallback: LucideIcon;
  strokeWidth?: number;
  weight?: "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Kutu glifi sarmalıyor (40 ≈ 34px glif + 3px pay): aksiyon satırındaki
      // dört öğenin ARALARINDAKİ boşluk eşit görünsün diye kutular gliflerinin
      // ölçüsünde tutuluyor, dokunma alanını hitSlop büyütüyor (efektif 72px).
      hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      style={{
        width: 40,
        height: 40,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View pointerEvents="none">
        <SFIcon
          name={name}
          fallback={fallback}
          size={34}
          color={theme.errorStrong}
          strokeWidth={strokeWidth}
          weight={weight}
        />
      </View>
    </TouchableOpacity>
  );
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
  zoomImpact,
  onReport,
  onBlock,
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

  // Aksiyon satırının panel içindeki y'si — alt zemin geçişi buradan başlar.
  // Sabit bir offset tutturulamaz: üstündeki bölümlerin hepsi koşullu, panel
  // yüksekliği profile göre değişiyor.
  const [actionsTop, setActionsTop] = useState<number | null>(null);
  const handleActionsLayout = useCallback((e) => {
    // nativeEvent SENKRON okunuyor — synthetic event handler dönünce havuza
    // geri alınıyor (bkz. kart onLayout'undaki aynı not).
    const y = e.nativeEvent.layout.y;
    setActionsTop((prev) => (prev != null && Math.abs(prev - y) < 1 ? prev : y));
  }, []);
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
    // Ham yazım yerine helper: uçan spring'i de iptal ediyor (yoksa bir sonraki
    // frame 0'ı ezebiliyordu) ve pull progress'i de aynı yerden sıfırlıyor.
    if (isTopCard) resetCardExpandState();
  }, [isTopCard, previewMode]);

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
  // Dışarıdan zoomImpact geldiyse sinyali saran scroller sürüyor; kartın kendi
  // BounceScrollView'ı (kapalı olduğu için hiç scroll event almaz) local'i
  // sürmeye devam eder, style dıştaki değeri okur.
  const localPhotoZoom = useSharedValue(0);
  const photoZoom = zoomImpact ?? localPhotoZoom;
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

  // İlişki niyeti etiketi = backend display'i + "ilişki" eki
  // ("Uzun süreli" → "Uzun süreli ilişki").
  //
  // Ek SADECE süre bildiren dört enum'a takılıyor. `StillFiguringOut`
  // ("Henüz karar vermedim") bir süre değil bir cümle; ek alırsa
  // "Henüz karar vermedim ilişki" gibi bozuk bir metin çıkar. Aynı sebeple
  // listede olmayan (backend'in sonradan ekleyeceği) enum'lar da eksiz
  // basılır — bilmediğimiz bir etikete kör ek takmaktansa düz göstermek
  // güvenli taraf.
  //
  // AYRICA: backend display'i kelimeyi ZATEN içerebiliyor ("Uzun süreli
  // ilişki", "Long term relationship" — bkz. FilterModal pill etiketi notu).
  // Kör ek "... ilişki ilişki" üretiyordu; kelime içerideyse ek atlanıyor.
  const relationshipIntentLabel = useMemo(() => {
    const display = profile?.relationshipIntentDisplay;
    if (!display) return "";
    const suffix = t("profile.card.intentSuffix");
    const needsSuffix =
      RELATIONSHIP_INTENTS_WITH_SUFFIX.has(profile?.relationshipIntent) &&
      !containsWord(display, suffix);
    return needsSuffix ? `${display} ${suffix}` : display;
  }, [profile?.relationshipIntentDisplay, profile?.relationshipIntent, t]);

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

  // Kart rozetleri — ikisi de backend'den hazır boolean geliyor, burada
  // hesaplama YOK:
  //   isOnlineToday — son 24 saatte aktif (canlı presence VEYA lastActiveAt).
  //   isNewMember   — hesap son 7 günde açılmış (CreatedAt).
  // Deste yüklendiği andaki değerlerdir, CANLI GÜNCELLENMEZ: karşı taraf sen
  // bakarken bağlansa rozet yanmaz, deste tazelenene kadar sabit kalır. Bunun
  // için hub dinlemeye gerek yok, beklenen davranış bu.
  // `isNewAccount` de aynı değeri taşıyor ama deprecate edilecek — ona BAKMA.
  const showActivity = profile?.isOnlineToday === true;
  const showNewBadge = profile?.isNewMember === true;
  const showModeration = !!(onReport || onBlock);

  // Konum satırındaki mesafe pili. Backend `distance`'ı km cinsinden gönderir;
  // alan yoksa/geçersizse pil hiç çizilmez (0 geçerli bir değer — "yok" değil,
  // "çok yakın" demek). Yaklaşıklık bilinçli: km'ye yuvarlanır ve 1 km altı
  // ayrı metne düşer, ondalıklı bir mesafe kullanıcının konumunu fazla
  // keskin ele verir.
  const distanceLabel = useMemo(() => {
    const km = profile?.distance;
    if (typeof km !== "number" || !Number.isFinite(km) || km < 0) return null;
    if (km < 1) return t('profile.card.distanceNear');
    return t('profile.card.distanceAway', { km: Math.round(km) });
  }, [profile?.distance, t]);

  // Konum bölümündeki Mapbox statik haritası. Koordinat KARTTAN GELMİYOR
  // (ProfileCardDto yalnız `cityDisplay`/`districtDisplay` taşıyor), il
  // merkezleri tablosundan çözülüyor — zoom kaba olduğu için ilçe farkı bu
  // ölçekte görünmez. İl tanınmazsa (tabloda yoksa) harita hiç çizilmez,
  // bölüm eski hâline — başlık + konum satırı — düşer.
  //
  // URL render sırasında türetiliyor: buildMapboxStaticUrl aktif temayı okuyor
  // ve tema değişiminde kök ağaç remount edildiği için doğru stil geliyor.
  const mapUri = useMemo(() => {
    const coordinate = lookupCityCoordinate(profile?.cityDisplay);
    if (!coordinate) return null;
    return buildMapboxStaticUrl({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      zoom: 6,
      width: 600,
      height: 320,
    });
  }, [profile?.cityDisplay]);

  // Evcil hayvan pill'leri. Backend üç alan birden gönderiyor: spesifik `pets`
  // enum listesi + lokalize `petsDisplay`, ve legacy 3 durumlu `hasPets`.
  // Spesifik liste varsa her hayvan AYRI pill (ikon türe göre, filtre/profil
  // ekranlarıyla ORTAK getPetIcon); yoksa eski "var/yok" pill'ine düşülüyor —
  // `hasPets = true` ama `pets` boş olan eski profillerde elde tek o bilgi var.
  //
  // `None` ("Yok") spesifik listeden elenir: hayvan adları arasında tek başına
  // anlamsız, "Evcil hayvanı yok" demek zaten legacy pill'in işi — eleme
  // sonrası liste boşalırsa oraya düşüyor.
  const petPills = useMemo(() => {
    // pets ↔ petsDisplay index bazlı eşleşiyor (backend display'i raw listeden
    // üretiyor); eşleşmezse ikon pawprint'e düşer, etiket yine doğru.
    const specific = (profile?.petsDisplay ?? [])
      .map((label, i) => ({ label, enumName: profile?.pets?.[i] }))
      .filter(({ enumName }) => enumName !== "None")
      .map(({ label, enumName }) => ({
        key: `pet-${enumName ?? label}`,
        ...getPetIcon(enumName),
        label,
      }));
    if (specific.length > 0) return specific;
    if (profile?.hasPets == null) return [];
    return [
      {
        key: "pets",
        sf: "pawprint.fill" as SFSymbol,
        lucide: PawPrint,
        label: profile.hasPets
          ? t("profile.card.petsYes")
          : t("profile.card.petsNo"),
      },
    ];
  }, [profile?.petsDisplay, profile?.pets, profile?.hasPets, t]);

  // Boy pili — backend `height`i CM cinsinden SAYI gönderir, `*Display`
  // kardeşi yok (birim her dilde "cm"), metin burada kuruluyor. Alanı hiç
  // göndermeyen sürümde ya da aralık dışı/bozuk değerde pill çizilmez
  // (bkz. HEIGHT_MIN_CM). String de kabul ediliyor: profil güncelleme yolu
  // alanı FormData'da metin olarak yazıyor, cache'e o biçimde düşen bir
  // değer okunaksız kalmasın.
  const heightLabel = useMemo(() => {
    const raw = profile?.height;
    const cm = typeof raw === "string" ? parseInt(raw, 10) : raw;
    if (typeof cm !== "number" || !Number.isFinite(cm)) return null;
    if (cm < HEIGHT_MIN_CM || cm > HEIGHT_MAX_CM) return null;
    return t("profile.card.heightCm", { cm: Math.round(cm) });
  }, [profile?.height, t]);

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
          backgroundColor: theme.bg,
        },
      ]}
      className="flex-1"
      onLayout={(e) => {
        // nativeEvent'i SENKRON oku: synthetic event handler dönünce geri
        // havuza alınıp null'lanıyor. Değeri updater closure'ında okumak
        // ("released synthetic event" → nativeEvent null) crash veriyordu.
        const h = e.nativeEvent.layout.height;
        // İLK ölçüm değil, EN KÜÇÜK ölçüm kazanır. Kart frame'i collapsed'ken
        // en kısa halinde: expand hem container'ın paddingBottom'ını siliyor
        // hem kartı HEADER_COVER kadar aşağı uzatıyor. İlk ölçüm expanded
        // geometride yakalanırsa (kart, expand değeri 1'de donmuşken doğarsa)
        // photoHeight kalıcı olarak fazla büyük kalıyor ve isim/aksiyon/chevron
        // bloğu — konumu `top: photoHeight - 340` — kartın altına kaçıyordu;
        // yalnız reload düzeltiyordu. Monoton azalan olduğu için onLayout
        // döngüsü yok: en fazla bir düzeltme yapar, sonra sabitlenir.
        setMeasuredCardHeight((prev) => {
          if (h <= 0) return prev;
          if (!prev) return h;
          return h < prev ? h : prev;
        });
      }}
    >
      <ScrollWrapper nativeScrollGesture={nativeScrollGesture}>
        <BounceScrollView
          scrollRef={scrollViewRef}
          scrollY={scrollY}
          zoomImpact={localPhotoZoom}
          expanded={expanded}
        >
          {/* Outer wrapper — solid #121212 bg. Eskiden 4-stop LinearGradient'di
              ama multi-stop shader compile mount sırasında ciddi lag yaratıyordu.
              Profile Info'nun kendi inner gradient'i (spotify→#121212 fade)
              zaten görsel geçişi sağlıyor. Foto'nun rounded corners'ı kart
              frame'inin #121212 bg'siyle uyumlu. */}
          <View style={{ backgroundColor: theme.bg }}>
            {/* Photo Gallery — expanded olurken borderRadius 40→0 anime.
                Fotoğrafı OLMAYAN profilde de aynı ağaç çiziliyor, sadece
                görsellerin yerinde nötr bir zemin durur (bkz. aşağıdaki
                placeholder). Eskiden ayrı bir dal vardı: sabit 500px, köşe
                yarıçapı yok, "fotoğraf yok" yazısı — kartın bütün kabuğunu
                (blur'lar, isim bloğu, chevron, aksiyonlar) kaybettiği için
                yapı bozuluyor ve altta düz bir kesik kalıyordu. */}
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
              {/* Fotoğrafsız profilin zemini — fotoğrafın YERİNİ tutar, onun
                  yokluğunu ANLATMAZ (yazı/ikon yok). Renk seçimi için
                  PHOTOLESS_BACKDROP_* notuna bak. */}
              {allPhotos.length === 0 && (
                <LinearGradient
                  colors={
                    isLight()
                      ? PHOTOLESS_BACKDROP_LIGHT
                      : PHOTOLESS_BACKDROP_DARK
                  }
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}

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
                          // Foto üstü → sabit beyaz (alt blur'daki
                          // isim/üniversite ile aynı kural).
                          backgroundColor:
                            index === currentPhotoIndex
                              ? theme.onMedia
                              : onMediaAt(0.4),
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
                {/* Alt blur ile aynı kural: foto üstü, iki modda da KOYU.
                    Üstündeki sayfa göstergeleri sabit beyaz olduğu için
                    açık tint burada beyaz-üstüne-beyaz yapardı. */}
                <BlurView intensity={70} tint="dark" style={{ flex: 1 }} />
              </MaskedView>

              {/* Bottom Blur Gradient Overlay — çekme oranıyla fade out.
                  Pozisyon `bottom:0` yerine `top: photoHeight - 340` ile
                  sabit absolute koordinat — collapse anında parent height
                  transient bir frame için değişse bile blur'un foto bottom'una
                  yapışık kalır, ekran altına düşmez. Blok 370 yüksek, yani
                  alt kenarı hâlâ fotonun altına (photoHeight + 30) taşıyor:
                  yukarı kaydırmak fotonun dibini blursuz bırakmaz. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: Math.max(0, photoHeight - 340),
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
                  {/* Okunabilirlik perdesi — HER İKİ MODDA DA KOYU
                      (scrimAt + tint="dark"): fotoğraf açık modda da
                      fotoğraftır, beyaz perde altındaki fotoyu yıkayıp
                      kartı soluk gösteriyordu. Üstündeki
                      isim/üniversite/chevron bu yüzden theme.onMedia
                      (sabit beyaz) ile çiziliyor. Yoğunluk bilinçli olarak
                      düşük tutuldu (0.06 → 0.30): fotoğrafı bastırmadan
                      yazıyı taşısın. */}
                  <LinearGradient
                    colors={[scrimAt(0.06), scrimAt(0.3)]}
                    style={StyleSheet.absoluteFill}
                  />
                  <BlurView
                    intensity={15}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                </MaskedView>
              </Animated.View>

              {/* Super Like Button — uygulamaya özel kalp glyph'i
                  (SuperLikeGlyph); lucide Heart değil. */}
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
                        {/* LitPlus tonlu gradient dolgu — kalp şeklinde
                            maskelenir (tek path tek renk aldığı için
                            gradyanı MaskedView ile veriyoruz). */}
                        <MaskedView
                          style={StyleSheet.absoluteFill}
                          maskElement={
                            <SuperLikeGlyph size={55} color="black" />
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
                            <SuperLikeGlyph size={55} color="black" />
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
                        <SuperLikeGlyph
                          size={55}
                          stroke={theme.swipeHeartBorder}
                          strokeWidth={0.1}
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
                    {/* Aktiflik satırı ismin ÜSTÜNDE: blok alttan sabit
                        (bottom-[70px]), yani buraya eklenen satır yukarı
                        doğru büyür — isim ve altındaki her şey yerinde kalır. */}
                    {showActivity && (
                      // gap 4'e ek nefes: satır isimden bir tık daha yukarıda
                      // dursun (blok alttan sabit → yalnız bu satır yükselir).
                      <View style={{ marginBottom: 6 }}>
                        <ActivityStatus
                          label={t("profile.card.activeToday")}
                        />
                      </View>
                    )}
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
                        className="text-4xl font-bold"
                        // Foto üstünde, koyu perdenin üstünde duruyor →
                        // her iki modda SABİT beyaz (theme.text değil).
                        style={{ flexShrink: 1, color: theme.onMedia }}
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
                          marginBottom:
                            showNewBadge || thingsInCommon.length > 0
                              ? 8
                              : 16,
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
                        <Text
                          className="font-[600] text-[16px]"
                          style={{ color: theme.onMedia }}
                        >
                          {profile.universityName}
                        </Text>
                      </View>
                    </Animated.View>
                  )}

                  {/* Ortak noktalar — swipe kararının verildiği an burası,
                      o yüzden kartı açmadan görünen overlay'de duruyor.
                      Üniversite satırıyla aynı fade grubunda: expand olunca
                      detay kartındaki bölümlerle çakışmasın diye kaybolur.
                      Ortak nokta hiç yoksa satır tek başına "Burada yeni"
                      rozetiyle çizilir.

                      fillWidth: ortak nokta pill'leri kartın geri kalanıyla
                      aynı kuralla diziliyor — en geniş pill başa, yanına
                      kalan boşluğu en çok dolduran pill. "Burada yeni"
                      rozeti bunun DIŞINDA: `pinned` ile sıralamadan muaf,
                      her zaman ilk satırın en başında. */}
                  {(showNewBadge || thingsInCommon.length > 0) && (
                    <Animated.View
                      style={[
                        {
                          marginTop: profile.universityName ? 0 : 6,
                          marginBottom: 16,
                        },
                        pillsAnimStyle,
                      ]}
                    >
                      <PillFlow
                        gap={6}
                        fillWidth
                        items={[
                          ...(showNewBadge
                            ? [
                                {
                                  id: t("profile.card.newMember"),
                                  pinned: true,
                                  element: (
                                    <NewMemberBadge
                                      label={t("profile.card.newMember")}
                                    />
                                  ),
                                },
                              ]
                            : []),
                          ...thingsInCommon.map((thing) => ({
                          id: thing.label,
                          element: (
                            <View
                              style={{
                                borderRadius: 999,
                                borderCurve: "continuous",
                                overflow: "hidden",
                                // Foto ÜSTÜNDE ama yine de temayı takip eder
                                // (bilinçli istisna): açık modda buzlu beyaz
                                // kapsül + koyu yazı. Expanded section'ların
                                // kartlarıyla aynı zemin ve kenar.
                                backgroundColor: theme.surfaceTranslucent,
                                borderWidth: 0.5,
                                borderColor: theme.hairline,
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
                                <Text
                                  className="font-[600] text-[13px]"
                                  style={{ color: theme.text }}
                                >
                                  {thing.label}
                                </Text>
                              </View>
                            </View>
                          ),
                          })),
                        ]}
                      />
                    </Animated.View>
                  )}
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
                        color={theme.onMedia}
                        strokeWidth={2}
                        weight="semibold"
                      />
                    </Animated.View>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>

            {/* Heavy content (university, hobbies, location+map, vb.) sadece
                top card'da + isTopCard true olduktan 100ms sonra render →
                swipe sonu mount lag'i için defer. */}
            {isTopCard && profileReady && (
              /* Profile Info — ayrı kart görünümü: kendi borderRadius'u, foto
                 altında 10px gap. Zemin düz gri (surface3: açıkta #E4E4E8,
                 koyuda #262626) — eskiden fotonun baskın renginden theme.bg'ye
                 inen bir LinearGradient vardı. */
              <Animated.View
                className="p-6 pt-8 px-4"
                style={[
                  {
                    overflow: "hidden",
                    borderRadius: 40,
                    borderCurve: "continuous",
                    marginTop: 10,
                    backgroundColor: theme.surface3,
                  },
                  profileInfoAnimStyle,
                ]}
              >
                {/* Alt zemin — ikon satırının hizasında surface3'ten
                    theme.bg'ye (açık modda beyaz) çözülüp düz devam eder.
                    İlk çocuk olarak duruyor: mutlak konumlu ama sonraki
                    kardeşlerinin ALTINDA boyanır, ikonlar üstünde kalır.
                    Rampa ikon çizgisinde BİTER, yukarı doğru uzar — o yüzden
                    top = satır y'si + üst boşluk - fade. easeGradient: düz iki
                    duraklı LinearGradient uçlarda görünür bir kesim bırakıyor,
                    çok duraklı bezier rampa iki ucu da eritiyor. */}
                {actionsTop != null && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: Math.max(
                        0,
                        actionsTop + ACTIONS_ROW_PADDING_TOP - ACTIONS_FADE_HEIGHT,
                      ),
                      bottom: 0,
                    }}
                  >
                    <LinearGradient
                      {...(easeGradient({
                        colorStops: {
                          0: { color: theme.surface3 },
                          1: { color: theme.bg },
                        },
                        extraColorStopsPerTransition: ACTIONS_FADE_STOPS,
                      }) as any)}
                      style={{ height: ACTIONS_FADE_HEIGHT }}
                    />
                    <View style={{ flex: 1, backgroundColor: theme.bg }} />
                  </View>
                )}
                {/* Name + Age — expanded'ken kartın üst tarafında görünür
                    (photo overlay'deki name'i replace eder; o fade-out olur).
                    Premium ateşi collapsed başlıktakiyle aynı — PreviewModal /
                    LikerSwipeModal kartı SADECE bu satırı gösterdiği için rozet
                    burada da olmalı. */}
                <View className="mb-10 ml-4" style={{ paddingHorizontal: 4, gap: 4 }}>
                  {/* Zemin burada chrome (surface3), foto değil — ama satır
                      foto üstündekiyle AYNI çiziliyor (bkz. ActivityStatus). */}
                  {showActivity && (
                    <ActivityStatus label={t("profile.card.activeToday")} />
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text
                      className="text-3xl font-bold"
                      // Zemin artık düz theme.bg (gradyan kalktı) → başlık da
                      // sabit beyaz değil, tema metin rengini kullanır; yoksa
                      // açık modda beyaz üstüne beyaz kalıyordu.
                      style={{ flexShrink: 1, color: theme.text }}
                    >
                      {profile.displayName}
                      {profile.age != null ? `, ${profile.age}` : ""}
                    </Text>
                    {profile.isPremium && (
                      <PremiumFlame size={PREMIUM_FLAME_SIZE_EXPANDED} />
                    )}
                    {showNewBadge && (
                      <NewMemberBadge label={t("profile.card.newMember")} />
                    )}
                  </View>
                </View>
                {/* University & Department */}
                {profile.showUniversity && profile.departmentDisplay && (
                  <View
                    style={[
                      {
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: theme.surfaceTranslucent,
                      },
                      sectionBevel(),
                    ]}
                    className=" p-4 py-7 -mt-3 rounded-[45px] mb-4"
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
                            <Text className="font-medium text-[18px]" style={{ color: theme.text }}>
                              {profile.universityName}
                            </Text>
                            {/* Bölüm · Sınıf tek satırda — beyaz, medium,
                                aralarında nokta ayraç. Sınıf bilinmiyorsa
                                nokta da render edilmez. */}
                            <Text className="font-medium text-[16px]" style={{ color: theme.text }}>
                              {profile.departmentDisplay}
                              {yearOfStudyLabel ? ` · ${yearOfStudyLabel}` : ""}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}

                {/* Kullanım amacı kartı KALDIRILDI: alan üründen çıktı,
                    `usagePurposeDisplay` artık response'ta dönmüyor. */}

                {/* İlişki niyeti — swipe kararının en belirleyici sinyali
                    olduğu için yaşam tarzı pilleri arasında kaybolmuyor,
                    kendi başlıklı bölümünde ve ilgi alanlarından ÖNCE
                    duruyor. */}
                {profile.relationshipIntentDisplay && (
                  <View
                    style={{
                      borderRadius: 40,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      // Zemin gradyan; düz dolgu YOK, yoksa gradyanı örter.
                      backgroundColor: "transparent",
                    }}
                    className="mb-4 p-4 py-8"
                  >
                    {/* Gradyan içerikle akmıyor, mutlak konumda zemin olarak
                        duruyor — kartın yüksekliği metne göre belirlensin,
                        gradyan da o yüksekliği doldursun. Köşe yuvarlaklığı
                        sarmalayıcının overflow:hidden'ı ile kırpılıyor. */}
                    {/* Renk niyete göre değişiyor (mor/turuncu/kırmızı/pembe/
                        mavi) — bölüm herkeste aynı kırmızıyı göstermesin,
                        niyet renkten de okunsun. Anahtar `relationshipIntent`
                        (enumName); display DEĞİL, o dile göre değişir. */}
                    <LinearGradient
                      colors={getIntentCardGradient(profile.relationshipIntent)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.myIntent')}
                      </Text>
                    </View>
                    {/* Pil ve ikon YOK: tek değerli bir alan, çerçeveye de
                        ikona da gerek yok. Metin bölümün kendi başlığından
                        (18) büyük — kartın okunan asıl değeri bu. px-4
                        başlıkla hizalı tutuyor. */}
                    <Text
                      className="font-semibold text-[22px] px-4"
                      style={{ color: theme.text }}
                    >
                      {relationshipIntentLabel}
                    </Text>
                  </View>
                )}

                {profile.hobbies && profile.hobbies.length > 0 && (
                  <View
                    style={[
                      {
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: theme.surfaceTranslucent,
                      },
                      sectionBevel(),
                    ]}
                    className="mb-4 p-4 py-8"
                  >
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.myInterests')}
                      </Text>
                    </View>
                    {/* fillWidth: hobilerin sırası anlam taşımıyor, satırlar
                        olabildiğince dolsun (en geniş pil başa). */}
                    <PillFlow
                      gap={8}
                      fillWidth
                      items={profile.hobbies.map((hobby, index) => {
                        // Hobi ya düz etiket ya da {enumName, name} çifti gelir.
                        // Daralma doğrudan typeof üzerinden: ara bir `isObj`
                        // değişkeni TS'e `label`ın string olduğunu anlatmıyor.
                        const enumName =
                          typeof hobby === "object" ? hobby?.enumName : undefined;
                        const label =
                          typeof hobby === "object" ? hobby?.name : hobby;
                        return {
                          id: String(label ?? index),
                          element: (
                            <View
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
                                  paddingVertical: 12,
                                  gap: 8,
                                }}
                              >
                                {/* İkon kutusu lifestyle pilindeki SFIcon ile
                                    aynı 18px. Emoji fontSize'ı ise 18 DEĞİL:
                                    SFIcon'un size'ı SymbolView'ın çerçevesi ve
                                    sembol oraya scaleAspectFit ediliyor, yani
                                    18px kutuda görünen mürekkep ~15px. Emoji
                                    ise em kutusunu doldurup ~fontSize*1.17
                                    çiziyor; 18'de lifestyle ikonlarından gözle
                                    görülür büyük duruyordu. 15 → ~17.5px, iki
                                    pil optik olarak eşitleniyor. Emoji kutudan
                                    biraz taşar (HobbyIcon açık height verdiği
                                    için kırpılmaz), pilin 12px dikey padding'i
                                    taşmayı karşılıyor. */}
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
                                    size={15}
                                    color={theme.text}
                                    strokeWidth={1.5}
                                  />
                                </View>
                                <Text className="font-[500] text-[14px]" style={{ color: theme.text }}>
                                  {label}
                                </Text>
                              </View>
                            </View>
                          ),
                        };
                      })}
                    />
                  </View>
                )}

                {/* Lifestyle Info — ilişki niyeti BURADA DEĞİL, kendi
                    bölümünde (yukarı bkz. "Burada ne arıyorum"). */}
                {(profile.smokingStatusDisplay ||
                  profile.zodiacSignDisplay ||
                  profile.alcoholUsageDisplay ||
                  heightLabel ||
                  petPills.length > 0) && (
                  <View
                    style={[
                      {
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: theme.surfaceTranslucent,
                      },
                      sectionBevel(),
                    ]}
                    className="mb-4 p-4 py-8"
                  >
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.myLifestyle')}
                      </Text>
                    </View>
                    {/* fillWidth: yaşam tarzı alanlarının da sabit bir sırası
                        yok, satır doluluğu öncelikli. */}
                    <PillFlow
                      gap={8}
                      fillWidth
                      items={[
                        // Boy — tek sayısal yaşam tarzı alanı; diğerleri gibi
                        // enum display'i değil, istemcide kurulan metin
                        // (bkz. heightLabel). Dizideki sırası görünümü
                        // belirlemiyor: fillWidth pilleri genişliğe göre
                        // yeniden diziyor.
                        heightLabel && {
                          key: "height",
                          sf: "ruler" as SFSymbol,
                          lucide: Ruler,
                          label: heightLabel,
                        },
                        // Sigara — ikon filtre/profil ekranlarıyla ORTAK
                        // (getSmokingIcon). forceFallback taşır: SF'te
                        // cigarette yok, `smoke.fill` duman bulutu.
                        profile.smokingStatusDisplay && {
                          key: "smoking",
                          ...getSmokingIcon(),
                          label: profile.smokingStatusDisplay,
                        },
                        profile.zodiacSignDisplay && {
                          key: "zodiac",
                          sf: "sparkles" as SFSymbol,
                          lucide: Sparkles,
                          label: profile.zodiacSignDisplay,
                        },
                        // Alkol — ikon filtre/profil ekranlarıyla ORTAK
                        // (getAlcoholIcon): üç seçenek de kadeh taşır,
                        // "Kullanmıyorum" dahil.
                        profile.alcoholUsageDisplay && {
                          key: "alcohol",
                          ...getAlcoholIcon(),
                          label: profile.alcoholUsageDisplay,
                        },
                        // Evcil hayvan — türe göre AYRI pill'ler, spesifik veri
                        // yoksa tek "var/yok" pill'i (bkz. petPills).
                        ...petPills,
                      ]
                        .filter(Boolean)
                        .map(({ key, sf, lucide, forceFallback, label }) => ({
                          id: `${key}:${label}`,
                          element: (
                            <View
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
                                  paddingVertical: 12,
                                  gap: 8,
                                }}
                              >
                                <SFIcon
                                  name={sf}
                                  fallback={lucide}
                                  forceFallback={forceFallback}
                                  size={18}
                                  color={theme.text}
                                />
                                <Text className="font-[500] text-[14px]" style={{ color: theme.text }}>
                                  {label}
                                </Text>
                              </View>
                            </View>
                          ),
                        }))}
                    />
                  </View>
                )}



                {/* Bio */}
                {profile.bio && (
                  <View
                    style={[
                      {
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: theme.surfaceTranslucent,
                      },
                      sectionBevel(),
                    ]}
                    className="mb-4 p-4 py-5 pt-8"
                  >
                    <View className="flex-row items-center mb-2 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.knowMeAs')}
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        borderWidth: 0,
                        borderColor: theme.hairline,
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
                    style={[
                      {
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        backgroundColor: theme.surfaceTranslucent,
                      },
                      sectionBevel(),
                    ]}
                    className="mb-4 p-4 py-5 pt-8"
                  >
                    <View className="flex-row items-center mb-4 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.location')}
                      </Text>
                    </View>
                    {/* Harita — bölümün görseli. Bilgi (ilçe/şehir + mesafe)
                        ALTTAKİ satırda duruyor, harita üstünde tekrarlanmıyor;
                        buradaki tek işaret ortadaki iğne. pointerEvents="none":
                        kartın kendi pan/scroll jestleri kesilmesin. */}
                    {mapUri && (
                      <View
                        style={{
                          borderRadius: 28,
                          borderCurve: "continuous",
                          overflow: "hidden",
                          borderWidth: 0.5,
                          borderColor: theme.hairline,
                          height: 190,
                          marginBottom: 4,
                          backgroundColor: theme.surface2,
                        }}
                        pointerEvents="none"
                      >
                        <Image
                          source={{ uri: mapUri }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={mapUri}
                          transition={120}
                        />
                        <View
                          style={[
                            StyleSheet.absoluteFill,
                            { alignItems: "center", justifyContent: "center" },
                          ]}
                        >
                          <BlurView
                            intensity={60}
                            tint={theme.blurTint}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 22,
                              borderCurve: "continuous",
                              overflow: "hidden",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <SFIcon
                              name="mappin"
                              fallback={MapPin}
                              size={22}
                              color={theme.text}
                            />
                          </BlurView>
                        </View>
                      </View>
                    )}
                    <View
                      style={{
                        borderRadius: 40,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        borderWidth: 0,
                        borderColor: theme.hairline,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
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
                        />
                        {/* flex YOK, yalnız flexShrink: metin doğal genişliğinde
                            kalsın ki mesafe pili sağ kenara itilmeden hemen
                            yanına yapışsın. Uzun ilçe/şehir adında sarma
                            davranışı flexShrink ile korunuyor. */}
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 15,
                            lineHeight: 22,
                            flexShrink: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          {[profile.districtDisplay, profile.cityDisplay]
                            .filter(Boolean)
                            .join(", ")}
                        </Text>
                        {/* Mesafe pili — backend `distance` göndermezse hiç
                            çizilmez (0 geçerli bir değer, yokluk değil).
                            Dolgusuz: yalnız kenarlık + yazı. Zemin kartın
                            kendi yüzeyi olarak kalıyor, bu yüzden yazı
                            theme.text (ters yüzey yok, polarite dönmüyor).
                            flexShrink: 0 → uzun ilçe/şehir adı pili ezmez,
                            metin sarar. */}
                        {distanceLabel && (
                          <View
                            style={{
                              borderRadius: 999,
                              borderCurve: "continuous",
                              overflow: "hidden",
                              borderWidth: 0.5,
                              borderColor: theme.border,
                              backgroundColor: "transparent",
                              flexShrink: 0,
                            }}
                          >
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 10,
                              }}
                            >
                              <Text
                                className="font-[700] text-[12px]"
                                style={{ color: theme.text }}
                              >
                                {distanceLabel}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                )}
                {/* Action Buttons */}
                {!hideActions && (onPass || onLike) && (
                  <View
                    onLayout={handleActionsLayout}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      // Tek düz satır: şikayet · X · tik · engelle. Dördünün
                      // arasındaki boşluk EŞİT — bu yüzden kutular gliflerini
                      // sarıyor (aksiyonlar 75, moderasyon 40); daha önce 68'lik
                      // kutudan taşan 75px glif aradaki boşluğu göz için
                      // eşitsiz gösteriyordu.
                      // 36 pratik tavan: 230px kutu + 3*36 = 338, en dar yaygın
                      // ekranın (375pt - 32 kenar boşluğu = 343) içinde kalıyor.
                      gap: 36,
                      paddingTop: ACTIONS_ROW_PADDING_TOP,
                      // Moderasyon ikonları artık bu satırın içinde; alt boşluk
                      // her hâlükârda burada kalıyor (içeriğin son öğesi bu).
                      paddingBottom: 40 + insets.bottom + 66,
                    }}
                  >
                    {/* Şikayet — X'in SOLUNDA. */}
                    {onReport && (
                      <ModerationIconButton
                        onPress={onReport}
                        label={t('profile.card.reportAccount')}
                        name="flag.fill"
                        fallback={Flag}
                      />
                    )}
                    <TouchableOpacity
                      onPress={onPass}
                      activeOpacity={0.7}
                      style={{
                        width: 75,
                        height: 75,
                        borderRadius: 38,
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
                        width: 75,
                        height: 75,
                        borderRadius: 38,
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
                    {/* Engelle — tikin SAĞINDA. Bayraktan bir tık kalın:
                        `nosign` ince bir glif, aynı ağırlıkta dolgulu
                        bayrağın yanında sönük kalıyordu. */}
                    {onBlock && (
                      <ModerationIconButton
                        onPress={onBlock}
                        label={t('profile.card.blockAccount')}
                        name="nosign"
                        fallback={Ban}
                        strokeWidth={2}
                        weight="semibold"
                      />
                    )}
                  </View>
                )}
                {/* Aksiyon satırı YOKSA (PreviewModal hideActions ile açıyor)
                    moderasyon ikonları yaslanacakları X/tik olmadığı için kendi
                    satırında, ortalanmış olarak içeriğin en altında durur. */}
                {showModeration && (hideActions || !(onPass || onLike)) && (
                  <View
                    onLayout={handleActionsLayout}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 28,
                      paddingTop: ACTIONS_ROW_PADDING_TOP,
                      paddingBottom: 40 + insets.bottom + 66,
                    }}
                  >
                    {onReport && (
                      <ModerationIconButton
                        onPress={onReport}
                        label={t('profile.card.reportAccount')}
                        name="flag.fill"
                        fallback={Flag}
                      />
                    )}
                    {onBlock && (
                      <ModerationIconButton
                        onPress={onBlock}
                        label={t('profile.card.blockAccount')}
                        name="nosign"
                        fallback={Ban}
                        strokeWidth={2}
                        weight="semibold"
                      />
                    )}
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
