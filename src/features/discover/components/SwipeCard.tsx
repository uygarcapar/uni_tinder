import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
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
import type {
  AnimatedRef,
  AnimatedStyle,
  SharedValue,
} from "react-native-reanimated";
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
import uiBus, {
  cardExpandAnim,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import {
  GraduationCap,
  X,
  Check,
  Sparkles,
  Pen,
  ArrowDown,
  PawPrint,
  MapPin,
  Languages,
  Flag,
  Ban,
  Ruler,
  type LucideIcon,
} from "@/shared/icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { getColors } from "react-native-image-colors";
import {
  colors as theme,
  gradients,
  ink,
  isLight,
  scrimAt,
  veilSurface,
  withAlpha,
} from "../../../shared/theme/colors";
import { MAX_PROFILE_PROMPTS } from "@/shared/constants/limits";
import {
  photoNoteTarget,
  promptNoteTarget,
} from "@/features/discover/noteTarget";
import type { NoteTarget } from "@/shared/types";
import { buildMapboxStaticUrl } from "@/shared/constants/mapbox";
import { lookupCityCoordinate } from "@/shared/constants/cityCoordinates";
import HobbyIcon from "@/shared/components/HobbyIcon";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import PremiumBadge from "@/shared/components/PremiumBadge";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import SuperLikeGlassButton, {
  SUPER_LIKE_GLASS_GLYPH_SIZE,
  SUPER_LIKE_GLASS_INSET,
  SUPER_LIKE_GLASS_SIZE,
  SUPER_LIKE_INSET,
  SUPER_LIKE_SIZE,
} from "./SuperLikeGlassButton";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_CORNER_RADIUS,
  CARD_EXPANDED_CORNER_RADIUS,
  CARD_HEADER_TITLE_BOTTOM,
} from "./CardStickyHeader";
import CardGlassBackdrop from "./CardGlassBackdrop";
import CardSectionBox from "./CardSectionBox";
import ActivityStatus from "./ActivityStatus";
import NoteGlyph from "@/shared/components/NoteGlyph";
import PillFlow from "@/shared/components/PillFlow";
import PinchZoomable from "@/shared/components/PinchZoomable";
import {
  getAlcoholIcon,
  getPetIcon,
  getSmokingIcon,
} from "@/shared/constants/filterEnumIcons";

import { useRenderCount } from "@/shared/debug/useRenderCount";
import { resolveCardAge } from "../cardPrivacy";
import type { PotentialMatch } from "@/shared/types";

const { width, height } = Dimensions.get("window");
const SCREEN_HEIGHT = height - 188; // Header height (90px) çıkarıldı

// Kapaktaki serbest kalp → sağ üstte ASILI KALAN cam buton geçişi
// (bkz. SuperLikeGlassButton). İkisi aynı noktada duruyor ve çekme oranı
// (cardExpandAnim) bu bantlarda ilerledikçe biri sönerken diğeri beliriyor:
// jest yarıda bırakılırsa geçiş de yarıda kalır, parmakla geri sarılabilir.
//
// Bantlar KASTEN üst üste biniyor (0.30-0.45): kesişimde iki katman da yarı
// saydam olduğu için tek bir şeklin kabuk değiştirmesi gibi okunuyor — arka
// arkaya kaybolan/beliren iki ayrı öğe gibi değil.
const HEART_MORPH_OUT_END = 0.45;
const HEART_MORPH_IN_START = 0.3;
const HEART_MORPH_IN_END = 0.8;
// Serbest kalp sönerken cam butonun İÇİNDEKİ glyph ölçüsüne doğru küçülür →
// iki şekil kesişme anında aynı büyüklükte oluyor.
const HEART_MORPH_SCALE = SUPER_LIKE_GLASS_GLYPH_SIZE / SUPER_LIKE_SIZE;

// Kapak fotoğrafındaki isim satırının puntosu. 36 → 32 → 28 küçüldü; rozet
// ondan TÜRETİLDİĞİ için sayı burada duruyor, JSX'te değil.
const CARD_NAME_FONT = 28;
// Satır kutusu ~1.14em. Rozetin hizası bu kutuya göre hesaplanıyor (aşağıda).
const CARD_NAME_LINE = 32;

// Açılan paneldeki başlık — kapaktaki isim ondan bir tık KÜÇÜK (28 < 30),
// eskiden tersiydi. Rozet burada da puntodan türüyor, o yüzden sayı sabitte.
const PANEL_NAME_FONT = 30;
const PANEL_NAME_LINE = 36;

// Rozetin ölçüsü BU DOSYADA DEĞİL: `PremiumBadge` ismin puntosundan çıkarıyor
// (bkz. premiumBadgeSize). Buradaki iki punto sabiti onun tek girdisi.

// Kapak fotoğrafı ile profil panelinin arasındaki boşluk. Panelin marginTop'u
// ile sticky başlığın eşik hesabı AYNI sayıyı kullanmak zorunda: panelin
// scroll içindeki y'si = kapak yüksekliği + bu boşluk. İkisi ayrışırsa şerit
// isimden önce/sonra açılır.
//
// Ölçü artık NEGATİF: panel kapağın dibine değmekle kalmıyor, altına giriyor.
// 10 → 4 → 0 adımlarının hiçbiri göze yetmedi çünkü kenarlarda iki yuvarlak
// köşenin açtığı hilal mesafe 0 olsa bile duruyor; panel yukarı binince o hilal
// de panelin altında kalıyor. Panel kapaktan SONRA çizildiği için üstte kalır.
// Sınır kapağın alt köşesinin yarıçapı (COVER_PHOTO_RADIUS = 40): oraya kadar
// panel yalnız köşe kıvrımlarının açtığı boşluğu yiyor, ondan sonrası
// fotoğrafın DÜZ kenarını yemeye başlar.
//
// -28 → -36 → -40 → -56 diye yaklaştırıldı; SINIR BİLEREK AŞILDI.
//
// 40'a kadar panel yalnız köşe kıvrımlarının açtığı hilali yiyordu, yani
// bedava. Son 16px ise fotoğrafın DÜZ alt kenarını kırpıyor: panel kapağa
// "bitişik" görünsün diye kapağın ~16px'i feda edildi. Bu bir takas, kaza
// değil — geri almak istersen -40 bedelsiz durakti.
//
// Aşağı doğru serbest ama her piksel kapaktan gider; yukarı doğru -40'ın
// berisine dönmenin bir anlamı yok, orada hilal geri açılır.
const PROFILE_PANEL_GAP = -56;

/**
 * Panelin kendi üst dolgusu — yani ismin (ve altındaki her şeyin) kapağa olan
 * mesafesi. 32 → 24 → 16 → 8: içerik adım adım kapağa yaklaştırıldı.
 *
 * İSMİN ALT MARJIYLA (28) EŞİT DEĞİL, BİLEREK. Boşluklar harflerden değil satır
 * kutusundan ölçülüyor; 30px bold ismin kutusunda harflerin ÜSTÜNDE ~8px
 * leading var ve o pay yalnız ÜSTTEKİ boşluğa biniyor — 16/16 yazıldığında üst
 * gözle belirgin şekilde genişti. Optik karşılığı: 8 + ~8 ≈ 16 üstte, 28 altta
 * (isim başlık olduğu için altına bir tık fazla nefes bırakıldı).
 * Bkz. isim bloğunun `marginBottom` notu — biri değişecekse ikisi birlikte.
 *
 * NE ZAMAN BU, NE ZAMAN PROFILE_PANEL_GAP — ikisi farklı şeyi oynatıyor:
 *   • PROFILE_PANEL_GAP → panelin KENDİ ÜST KENARINI. Her piksel kapak
 *     fotoğrafından gider (bkz. oradaki not).
 *   • Bu sabit → panelin İÇİNİ. Kenar yerinde kalır, içerik yukarı gelir;
 *     kapaktan bir şey yemez.
 *
 * TARİHÇE — burada bir dönem "oynatma" yasağı vardı: bir ara aynı sayı 16'ya
 * indirilmiş ve "yanlış kaldıraç, panelin kenarını değil içini çekiyor" diye
 * geri alınmıştı. O yasağın DAYANAĞI KALKTI: panelin görünür bir kenarı (ve
 * tülü) artık yok, Keşif'te panel şeffaf bir kap — kullanıcının gördüğü tek şey
 * içerik. Yani "içini çekmek" burada tam olarak istenen şey.
 *
 * ── SINIR: KAPAĞIN ALT BANDI ──────────────────────────────────────────────
 * İsim bloğunun tepesi, fotoğrafın alt kenarından `-PROFILE_PANEL_GAP -
 * PANEL_TOP_PAD` = 56 - 8 = 48px yukarıda; yani kapağın son 48px'inin ÜSTÜNE
 * biniyor (panel kapaktan SONRA çizildiği için örter). O bantta iki katman var:
 *
 *   chevron  → `bottom: 30`, 28px kutu  ⇒ 30-58px bandı, YATAYDA ORTALI
 *   not kutusu → `bottom: 74`           ⇒ bu sayı 74'ün altında kaldığı sürece
 *                                         dokunulmuyor
 *
 * Yani çakışma DİKEYDE var ama YATAYDA yok: isim solda başlıyor (panelin px-4'ü
 * + bloğun ml-4'ü ≈ 36px), ok ekranın ortasında. Bedeli UZUN İSİMLERDE ödeniyor
 * — isim + premium ateşi + "burada yeni" rozeti ortaya kadar uzarsa okun
 * üstüne biner. Buradan aşağı inmeden ÖNCE chevron'u expanded'ken söndür
 * (rotate yerine/yanında opacity), yoksa sınır kısa isimlerde de tutmaz.
 *
 * className'de DEĞİL burada: PREVIEW_HEADER_SPACE bu sayıyı okumak zorunda
 * (aşağıdaki not), Tailwind sınıfından okunamaz. Türetilmiş olduğu için bu
 * sayıyı küçültmek ÖNİZLEMEYİ ETKİLEMEZ: oradaki pay aynı miktarda büyür,
 * toplam sabit kalır.
 */
const PANEL_TOP_PAD = 8;

/**
 * Panelin kendi ALT dolgusu — içeriğin panelin dibiyle arasındaki nefes.
 *
 * `p-6`nın 24'ünün yerini alıyor (inline style className'i ezer), tıpkı üst
 * dolgunun yaptığı gibi ve aynı sebeple: sayı burada görünür olsun, Tailwind
 * sınıfının içinde saklı kalmasın.
 *
 * ACTIONS_ROW_PADDING_BOTTOM / PANEL_TAIL_PADDING_BOTTOM İLE KARIŞTIRMA. Onlar
 * panelin İÇİNDEKİ son bloğun kendi payı (biri yüzen tab bar'ın örtmemesi,
 * diğeri rampanın kenarda kesilmemesi için). Bu ise panelin KABININ dolgusu,
 * yani içerideki her şeyin altında kalan ortak pay.
 *
 * 48 → 80: expanded panelde içerik kartın dibine fazla yakın bitiyordu. Burayı
 * büyütmek üç kuyruk varyantının (aksiyon satırı · moderasyon satırı · boş
 * kuyruk) HEPSİNE aynı payı ekler; alt rampayı kaydırmaz (rampa `actionsTop`a
 * çakılı, altındaki düz theme.bg zemin uzar) ve panelin kenar/tül katmanları
 * kabı takip ettiği için onlar da birlikte uzar.
 */
const PANEL_BOTTOM_PAD = 80;




/**
 * Önizlemede (Likes / Chat / Profil) içeriğin sticky şeridin ALTINDAN
 * başlaması için panelin kendi dolgusuna eklenen pay.
 *
 * Panelin İÇİNDE duruyor, kartın zemininde (theme.bg) açılan bir boşluk DEĞİL:
 * önce öyle denendi ve açık modda gri panelin üstünde beyaz bir şerit
 * bırakıyordu — orada kartın tepesinde fotoğraf yok, o zemini örtecek bir şey
 * de yok.
 *
 * Ölçü: şeridin başlık satırının dibi + şeridin durum çubuğundan kaçmak için
 * aldığı pay (CARD_CHROME_TOP_DROP — sheet artık ekranın tepesine dayanıyor,
 * bkz. PreviewModal/LikerSwipeModal `topInset`) + 8 nefes − panelin kendi üst
 * dolgusu (PANEL_TOP_PAD). Daha küçüğü ilk bloğu camın altında bırakır, büyüğü
 * tepede boş şerit açar.
 *
 * TÜRETİLMİŞ, sabit değil: şeridin ölçüsü cam butonun çapından, dolgu da kendi
 * sabitinden geliyor; ikisi de değişebiliyor ve elle yazılmış bir sayı sessizce
 * yanlış kalıyordu. Dolgu küçülünce bu pay aynı oranda büyüyor → önizlemede
 * şeridin altındaki nefes DEĞİŞMİYOR (toplam sabit).
 */
const PREVIEW_HEADER_SPACE =
  CARD_HEADER_TITLE_BOTTOM + CARD_CHROME_TOP_DROP + 8 - PANEL_TOP_PAD;

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

/**
 * Aksiyon/moderasyon satırının ALTINDAKİ pay — expanded içeriğin son boşluğu,
 * yani scroll dibe vurduğunda ikonlarla kartın kenarı arasında kalan alan.
 * Cihazın alt güvenli alanı (`insets.bottom`) buna RENDER SIRASINDA ekleniyor.
 *
 * İki parçası var:
 *   66 — yüzen tab bar'ın kapladığı yükseklik. Bu pay olmadan son satır barın
 *        ARKASINDA kalıyor; nefes değil, örtülmeme payı.
 *   80 — asıl nefes. Eskiden 40'tı; içerik kartın dibinde bitiveriyordu.
 */
const ACTIONS_ROW_PADDING_BOTTOM = 80 + 66;

/**
 * Alt satırın hiç çizilmediği hâlde (bkz. showPanelTail) panelin dibindeki pay.
 * Aksiyon/moderasyon satırlarının payından (ACTIONS_ROW_PADDING_BOTTOM) KISA:
 * oradaki boşluk 75px'lik butonların altında okunuyor, burada altında hiçbir şey
 * yok — aynı sayı kartın dibinde bomboş bir şerit bırakıyordu.
 * Sıfır da değil: rampanın bittiği yerden sonra düz zeminin görünebileceği bir
 * pay kalmalı, yoksa geçiş tam panelin kenarında kesiliyor.
 */
const PANEL_TAIL_PADDING_BOTTOM = 28;

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

// Expanded panelde bölümlerin ARASINA serpiştirilen fotoğraflar (2., 3., 4. ve
// sonrası). Kapaktaki ilk fotoğraf yerinde kalır; galeri artık kenarlara
// basarak gezilmiyor, bütün fotoğraflar bu bloklarla akışın içinde duruyor.
// Oran 4:5 — dikey portre, contentFit="cover" ile kırpılır. Genişlik yüzde
// verilir (sabit px DEĞİL): kart sheet içinde tam ekrandan dar açılabiliyor.
const SECTION_PHOTO_ASPECT = 4 / 5;
// Bölüm kutularının yarıçapı ile aynı (bkz. hobiler/yaşam tarzı/bio kutuları).
const SECTION_PHOTO_RADIUS = 40;
// Kapak fotoğrafının yarıçapı. Expand'de DEĞİŞMİYOR (kart-benzeri görünüm) —
// tek sayı: clipping kutusu, skeleton ve pinch kopyası aynı yerden okuyor.
const COVER_PHOTO_RADIUS = 40;


// "ilişki" ekini alan ilişki niyetleri (bkz. relationshipIntentLabel).
// Anahtar DAİMA enumName: `display` Accept-Language'e göre değişiyor.
const RELATIONSHIP_INTENTS_WITH_SUFFIX = new Set([
  "LongTerm",
  "ShortTerm",
  "LongTermOpenToShort",
  "ShortTermOpenToLong",
]);

// Ek takmadan önce "kelime etikette zaten var mı" kontrolü İKİ dilde birden
// yapılıyor: fallback'e düşen backend display'i hangi dilde geldiyse o dilin
// kelimesini taşıyor ("Uzun süreli ilişki" / "Long term relationship"). Tek
// dile bakmak "Long term relationship ilişki" gibi çift kelime üretiyordu.
const INTENT_SUFFIX_WORDS = ["ilişki", "relationship"];

// Expanded karttaki bölüm kutuları (üniversite, hobiler, yaşam tarzı, bio,
// prompt, konum + araya giren fotoğraf blokları) ÇERÇEVESİZ. Önceden ortak bir
// pah (`sectionBevel`) vardı — kenarlar arası tonlanan 1px çerçeve; kaldırıldı.
// Kutular zeminden yalnız dolgularıyla ayrışıyor (surfaceTranslucent / surface)
// ve yuvarlak köşeleriyle. Yeni bölüm eklerken çerçeve EKLEME: ritim borderless.
// Konum satırındaki mesafe pilinin ("3 km uzakta") dolgu + yazı rengi.
//
// ARTIK MODA ZIT DEĞİL: iki modda da GRİ yüzey + normal yazı
// (theme.text). Önce koyuda beyaz dolgu + siyah yazı vardı (ink/veil) — pil
// bölümün koyu zemininde fazla parlıyor, satırdaki asıl bilgiyi (şehir adı)
// bastırıyordu. Sonra açık mod griye çevrildi, koyusu beyaz kaldı; ikisi tek
// dile indi.
//
// Dolgu ile yazı TEK yerde: ayrı ayrı değiştirilirse beyaz üstüne beyaz (veya
// gri üstüne beyaz) kalma tuzağı geri gelir. Tokenlar zaten modla dönüyor —
// ink() ve theme.text karşıtına geçiyor.
//
// Zemin `pillFill()`ten: açık modda kartın bütün dolgulu pilleri fotoğraftaki
// not diskiyle aynı beyaza yakın rengi taşıyor. Koyu mod bu pile ÖZEL kalıyor
// (surface4) — oradaki değerler değişmedi.
//
/**
 * Kartın DOLGULU pillerinin zemini — ilgi alanları · yaşam tarzı · sınıf ·
 * mesafe, dördü de buradan.
 *
 * AÇIK MODDA hepsi fotoğrafın sağ altındaki not diskiyle AYNI renk:
 * `veilSurface(NOTE_DISC_FILL_ALPHA)`, yani beyaza yakın. Kartta iki farklı
 * "açık yüzey" dili istemiyoruz; sayı da tek yerde (diskin kendi dolgusuyla
 * ortak) duruyor.
 *
 * KOYU MOD çağıranın elinde: `darkFill` olduğu gibi dönüyor. Sebebi paletin
 * sırası — koyuda yükseklik AÇILMAK demek, yani açık modun token'ını oraya
 * taşımak pili karartırdı; ayrıca koyudaki değerler zaten yerinde.
 *
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi).
 */
function pillFill(darkFill: string): string {
  return isLight() ? veilSurface(NOTE_DISC_FILL_ALPHA) : darkFill;
}

// RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi).
function distancePillColors() {
  return {
    background: pillFill(theme.surface4),
    border: ink(0.06),
    text: theme.text,
  };
}

/**
 * ── KARTTA ARTIK HİÇ İNCE KENAR ÇİZGİSİ YOK ───────────────────────────────
 *
 * Burada iki yardımcı vardı — `cardEdgeColor()` (modla dönen ton: koyuda
 * `hairlineMuted`, açıkta `hairlineStrong`; bir alt kademe fotoğrafın üstünde
 * kayboluyor, aynı kademe açık modda kartı siyah kalemle çizilmiş gösteriyordu)
 * ve `CARD_EDGE_WIDTH = StyleSheet.hairlineWidth` (0.5pt DEĞİL: 3x ekranda 1.5
 * fiziksel piksel ediyor ve yarım pikselin yuvarlanması kenarın ondalık
 * koordinatına bağlı olduğu için sol/sağ kenarlar farklı kalınlıkta çıkıyordu).
 *
 * Önce kapağın kenarı kaldırıldı (fotoğraf zaten kendi kenarıyla sınırlı,
 * üstüne çizgi koymak kartı çerçeveletiyordu), sonra panelinki — o çizgi paneli
 * blur'lu zeminin üstüne yapıştırılmış AYRI BİR LEVHA gibi gösteriyordu
 * (bkz. aşağıda panelin tülünün kaldırıldığı yer). İkisi de gidince
 * yardımcıların çağıranı kalmadı.
 *
 * Kartta yeniden bir hairline'a ihtiyaç olursa yukarıdaki iki gerekçeyi
 * (modla dönen kademe + hairlineWidth) tekrar üretme, git geçmişinden al.
 */

/**
 * Cam yolunda profil panelinin KENDİ yüzeyi — düz gri `surface3`ün çok hafif
 * hâli.
 *
 * Tam şeffaf denendi ve GERİ ALINDI: panelin yuvarlak üst köşeleri ve kapak
 * fotoğrafıyla arasındaki boşluk (PROFILE_PANEL_GAP) hiç görünmüyordu — sabit
 * zemin ikisinin de arkasından kesintisiz aktığı için açık kart, alttan gelen
 * ayrı bir sayfa değil tek parça bir yüzey gibi okunuyordu.
 *
 * Alfa BİLEREK düşük: panelin kenarını göstermeye yetecek kadar, üstündeki cam
 * kutuların kırılmasını öldürmeyecek kadar az (bkz. CardSectionBox — camın
 * altına konan opak katman efekti siliyor). Kontrast isteniyorsa bu sayı
 * oynatılır, panelin altına ikinci bir katman EKLENMEZ.
 *
 * RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi).
 */
function panelVeil(): string {
  return withAlpha(theme.bg, isLight() ? 0.22 : 0.18);
}

/**
 * Panelin tülünün, DİBİNE doğru söndüğü bandın boyu (px).
 *
 * Panel içerik bitince yuvarlak alt köşeleriyle sert bir şekilde kesiliyordu:
 * alt uçta bounce edince o kenar ve altındaki sabit zemin (CardGlassBackdrop)
 * yan yana duruyor, panel zeminin üstüne yapıştırılmış ayrı bir levha gibi
 * görünüyordu. Rampa o dikişi eritiyor — tül aşağı doğru zemine karışıyor.
 *
 * Rampa ZEMİNDE DEĞİL panelde: zemin sabit ve kartı baştan sona kaplamak
 * zorunda (bkz. CardGlassBackdrop'taki not). Sönen şey panelin kendi tülü.
 *
 * Sabit px, yüzde DEĞİL: panelin yüksekliği içerikle birlikte metrelerce
 * olabiliyor, yüzde orada rampayı ekranlar boyu uzatırdı.
 */
const PANEL_FADE_HEIGHT = 160;

/** Rampada bant oluşmasın diye ara durak sayısı (eski alt rampayla aynı reçete). */
const PANEL_FADE_STOPS = 24;

// Not butonu — fotoğrafın İÇİNDE, alt kenarına yaslı konuşma balonu işareti.
//
// Eskiden burada fotoğrafın SAĞ ÜSTÜNDE yüzen yuvarlak bir kalp butonu vardı ve
// hiçbir uca bağlı değildi. Yerini bu buton aldı: not, kartın bütününe değil
// BELİRLİ bir içeriğine (bu fotoğraf, bu prompt cevabı) yazılan yorumlu bir
// beğeni — kutunun hedefin İÇİNDE durması "neye yazdığımı" tek bakışta anlatıyor.
//
// RENK: her üç yerleşimde de TEMAYI TAKİP EDİYOR — `text` (açık modda siyah,
// koyu modda beyaz). Önce düz `litPlus` denendi (Mesajlar'ın boş durumundaki
// birincil CTA rengi); fotoğrafın üstünde renk her zeminde tutmuyordu.
// Açık moddaki okunurluğu artık arkadaki beyaz disk taşıyor (bkz. ZEMİN notu),
// o yüzden nötr ton fotoğrafta da prompt kutusunda da kaybolmuyor.
//
// İŞARET: içinde SF `bubble.left` duran opak litPlus daireydi; şimdi işaretin
// kendisi konuşma balonu — uygulama ikonundan sökülen glyph (NoteGlyph),
// super-like kalbinin (SuperLikeGlyph) kardeşi. İki balon (kap + ikon) üst üste
// binmesin diye tek siluete indi.
//
// ZEMİN: yalnız FOTOĞRAF üstünde, işaretin arkasına disk konuyor
// (NOTE_DISC_SIZE). Rengi `veilSurface` — açık modda BEYAZ, koyu modda bölüm
// kutularıyla aynı aileden bir yüzey grisi, yani işaretin (`text`) karşıtı:
// fotoğrafın altında ne varsa siluetin kenarı her zeminde tutuyor. Koyuda
// `veil` (tam siyah) DEĞİL, bilerek: neredeyse opak siyah disk fotoğrafta
// kesilmiş bir delik gibi duruyordu, yüzey grisi ise panelin kutularıyla aynı
// dili konuşuyor. Prompt kutusundaki kutuda disk YOK — orası fotoğraf değil,
// işaret kutunun düz zemininde zaten okunuyor (siyah disk denendi, GERİ
// ALINDI).
//
// Balonun içindeki kalp DELİK: altındaki ne varsa (fotoğraf, prompt kutusunun
// zemini) oradan görünür, ikinci bir renk taşımıyoruz. Deliği açan şey
// `fillRule="evenodd"` — NoteGlyph'in içinde, oraya bak.
//
// Dokunma hedefi 52 KALDI (glyph kabı saydam): kutunun kalktığı yerde hitbox da
// küçülürse fotoğrafın alt kenarındaki isabet oranı düşer. Yerleşim payları
// (NOTE_BOX_INSET ve türevleri) bu 52'lik kaba göre hesaplı, dokunma.
const NOTE_BOX_SIZE = 52;
/**
 * Çizilen işaretin boyu — dokunma kabından (52) küçük, kabın içinde ortalı.
 * Glyph'in kendi 2/24'lük optik payı da bunun içinde, yani gerçek mürekkep
 * bunun 20/24'ü. Kabı tam dolduran 52 iki yerde de fazla iriydi.
 *
 * İki ölçü var, çünkü işaret iki farklı zeminde duruyor:
 *   FOTOĞRAF — arkasında disk var (NOTE_DISC_SIZE), okunurluğu o taşıyor →
 *              siluet daha küçük durabiliyor.
 *   PROMPT   — disk yok, işaret kutunun zemininde tek başına → bir tık büyük.
 *
 * Prompt ölçüsü butonun çizilmediği girişlerdeki boşluğu da besliyor
 * (bkz. NOTE_BOX_PROMPT_PULL kullanımı) — kutunun altı iki durumda da aynı
 * kalsın diye oradan türetiliyor, elle ikinci bir sayı yazma.
 */
const NOTE_GLYPH_SIZE_PHOTO = 30;
const NOTE_GLYPH_SIZE_PROMPT = 40;
/**
 * İşaretin arkasındaki diskin çapı — hangi renkte çizildiği için bileşenin
 * başındaki ZEMİN notuna bak.
 *
 * Ölçü dokunma kabını (52) tam doldurmuyor ama glyph'in (32) belirgin şekilde
 * üstünde: balon diskin içinde nefes alsın, disk de gerçek bir kap gibi okunsun.
 */
const NOTE_DISC_SIZE = 50;
/**
 * Not diskinin dolgusunun alfası. Tam opak DEĞİL: altındaki fotoğraf bir tık
 * sızsın, disk yapıştırılmış bir pul gibi durmasın.
 *
 * Kartın PİLLERİ de (ilgi alanları · yaşam tarzı · sınıf · mesafe) açık modda
 * bu değerden besleniyor (bkz. pillFill) — ikisi aynı yüzey dili, sayı tek
 * yerde dursun.
 */
const NOTE_DISC_FILL_ALPHA = 0.92;
/** Fotoğrafın kenarından içeri — 40'lık köşe yarıçapının teğetini geçecek kadar. */
const NOTE_BOX_INSET = 14;
/**
 * Kapak fotoğrafındaki kutunun sağ payı. Kapak kartın TAM genişliği, panel
 * içeriği ise 16'lık yan padding'in içinde (`px-4`) — ikisine de aynı 14'ü
 * verince kapaktaki buton diğerlerinden 16px daha sağda kalıyordu. Panel
 * padding'i eklenince üçü de (kapak · bölüm fotoları · prompt kutusu) aynı
 * dikey hatta oturuyor.
 */
const NOTE_BOX_COVER_INSET = NOTE_BOX_INSET + 16;
/**
 * Prompt kutusunda butonun cevaba doğru çekildiği pay. Cevap kabının kendi
 * 14'lük alt padding'i aralığı zaten taşıyor, üstüne tam marj eklenince buton
 * metinden kopuk duruyordu. Butonun HİÇ çizilmediği girişlerde (kendi profil
 * önizlemesi · Likes · sohbet profili) yerine konan boşluk da aynı payı
 * düşüyor: kutunun altı iki durumda da birebir aynı kalıyor.
 */
const NOTE_BOX_PROMPT_PULL = 8;

/**
 * Prompt cevabının satır yüksekliği. Metnin kendi metrikleri PromptsEditor'deki
 * cevap alanıyla BİREBİR aynı olmak zorunda (25 / 600 / 32) — kullanıcı
 * yazarken gördüğü boyutla kartta gördüğü ayrışmasın. Sabit, çünkü baştaki
 * tırnağın dikey hizası da bundan hesaplanıyor.
 */
const PROMPT_ANSWER_LINE_HEIGHT = 32;

/**
 * Cevabın başındaki açılış tırnağı (`quote.opening`). 18'di: 25 puntoluk,
 * 600 ağırlıklı cevabın yanında dipnot gibi kalıyordu — tırnak burada
 * dekorasyon değil, cevabın "alıntı" olduğunu söyleyen işaret.
 *
 * Tavan satır yüksekliği (32): daha büyüğü ilk satırın kutusunu aşar ve ikon
 * metinle aynı hatta oturmaz. Dikey hiza türetiliyor, elle yazılmıyor —
 * (satır − ikon) / 2.
 */
const PROMPT_QUOTE_SIZE = 26;

function NoteBox({
  onPress,
  onPhoto = false,
}: {
  onPress?: () => void;
  /** Kutu bir FOTOĞRAFIN üstünde mi — arkasındaki diski o belirliyor. */
  onPhoto?: boolean;
}) {
  const { t } = useTranslation();
  // Basma geri bildirimi SADECE ölçek — opacity sabit (activeOpacity=1).
  // Gradyan dolgu soluklaşınca kutu "sönmüş" gibi duruyordu; küçülme aynı
  // dokunulma hissini rengi bozmadan veriyor. Super-like kalbindeki
  // heartPressAnim ile aynı kalıp ve aynı 180ms/out-quad zamanlaması.
  const pressAnim = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * pressAnim.value }],
  }));
  // KONUMLANDIRMA ÇAĞIRANIN İŞİ. Üç yerde üç farklı yerleşim var (panel
  // fotoğrafının içinde, kapak fotoğrafının içinde + animasyonlu, prompt
  // kutusunun içinde sağ altta); hepsini buraya bayrak olarak taşımak bu
  // bileşeni konumlandırma switch'ine çevirirdi. Dikey konumu çağıran veriyor,
  // yatayda hepsinde aynı: sağa yaslı.
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => {
        pressAnim.value = withTiming(1, {
          duration: 180,
          easing: Easing.out(Easing.quad),
        });
      }}
      onPressOut={() => {
        pressAnim.value = withTiming(0, {
          duration: 180,
          easing: Easing.out(Easing.quad),
        });
      }}
      accessibilityRole="button"
      // Görünür etiket kalmadı → butonun ADI yalnız burada. Silme.
      accessibilityLabel={t("note.boxLabel")}
      style={{ alignSelf: "flex-end" }}
      hitSlop={8}
    >
      <Animated.View
        style={[
          {
            width: NOTE_BOX_SIZE,
            height: NOTE_BOX_SIZE,
            alignItems: "center",
            justifyContent: "center",
          },
          pressStyle,
        ]}
      >
        {/* İşaretin tamamı bu: metin de kalan hak sayısı da YOK. Glyph dokunma
            kabının içinde ortalı, ondan küçük (zemine göre iki ölçü,
            bkz. NOTE_GLYPH_SIZE_*) — kendi 2/24'lük optik payı da cabası.
            Kontur kapak kalbindeki ile aynı ince açık hairline: fotoğrafın
            parlak yerlerinde siluetin kenarını tutuyor.

            FOTOĞRAF ÜSTÜNDE glyph'in arkasında disk var (bkz. ZEMİN notu):
            düz `veilSurface(0.92)` dolgusu. Disk artık mutlak konumlu bir
            KARDEŞ değil, glyph'i SARAN kap — `GlassView` ölçüsünü kendi
            içeriğinden alamayan boş bir overlay olarak sessizce efektsiz
            kalıyor (bkz. CardSectionBox). Ölçü yine sabit (52'lik dokunma kabı
            büyümesin), sadece kap akışın içinde. */}
        {onPhoto ? (
          <CardSectionBox
            // CAM DEĞİL ve bu kalıcı karar: disk fotoğrafın üstünde duruyor,
            // camın kırdığı şey de altındaki fotoğrafın kendisi oluyordu —
            // işaret zeminden ayrışmıyordu. Bir dönem bölüm fotoğraflarında
            // cam, kapakta düz dolgu vardı; ikisi artık AYNI yüzey.
            glass={false}
            radius={999}
            style={{
              width: NOTE_DISC_SIZE,
              height: NOTE_DISC_SIZE,
              alignItems: "center",
              justifyContent: "center",
            }}
            // Cam yokken eski dolgu (bkz. NOTE_DISC_FILL_ALPHA — aynı sayı
            // kartın pillerini de besliyor).
            fallbackStyle={{
              backgroundColor: veilSurface(NOTE_DISC_FILL_ALPHA),
            }}
          >
            <NoteGlyph
              size={NOTE_GLYPH_SIZE_PHOTO}
              color={theme.text}
              stroke={theme.swipeHeartBorder}
              strokeWidth={0.1}
            />
          </CardSectionBox>
        ) : (
          <NoteGlyph
            size={NOTE_GLYPH_SIZE_PROMPT}
            color={theme.text}
            stroke={theme.swipeHeartBorder}
            strokeWidth={0.1}
          />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// Bölümlerin arasına giren fotoğraf bloğu. Kutusu bölüm kutularıyla birebir
// aynı (radius 40 + continuous, çerçevesiz) → panelde ayrı bir kart gibi
// değil, aynı ritmin bir parçası gibi okunur.
//
// Skeleton/shimmer YOK, bilinçli: kart başına 5-6 fotoğraf olabiliyor ve her
// biri sonsuz `withRepeat` sürerse Fabric tarafında gereksiz commit yükü
// birikiyor. Yüklenene kadar kutunun kendi surface zemini duruyor, expo-image
// de `transition` ile üstüne yumuşakça geliyor.
function SectionPhoto({
  uri,
  onNotePress,
  hideNote = false,
  zoomStyle,
}: {
  uri: string;
  onNotePress?: () => void;
  /** Önizleme (Profil / Likes / Chat kartı): fotoğrafın altında not kutusu yok. */
  hideNote?: boolean;
  /**
   * Top'a çarpma zoom'unun animated style'ı (bkz. photoZoomStyle). YALNIZ
   * önizlemedeki ANA fotoğrafa veriliyor — Discover'da aynı geri bildirimi tam
   * ekran kapak taşıyor, önizlemede kapak çizilmediği için onun yerine akışın
   * ilk fotoğrafı büyüyor. Kutunun `overflow: hidden` + sabit yarıçapı
   * değişmediği için foto kutunun içinde yakınlaşır, blok kıpırdamaz.
   */
  zoomStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
}) {
  // Kutu fotoğrafın İÇİNDE (mutlak konumlu) → blok yüksekliğini ve alt
  // boşluğunu değiştirmiyor; `overflow: hidden` sayesinde yuvarlak köşenin
  // dışına da taşmıyor.
  const showNote = !hideNote && !!onNotePress;
  return (
    <View
      style={[
        {
          borderRadius: SECTION_PHOTO_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          width: "100%",
          aspectRatio: SECTION_PHOTO_ASPECT,
          marginBottom: 16,
          backgroundColor: theme.surface,
        },
      ]}
    >
      {/* Zoom katmanı — top'a çarpma geri bildirimi (bkz. zoomStyle).
          `zoomStyle` verilmeyen fotoğraflarda bu View kimliksiz bir kap:
          transform'suz kaldığı için ek bir maliyeti yok. */}
      <Animated.View style={[{ width: "100%", height: "100%" }, zoomStyle]}>
        {/* İki parmakla büyütme — görsel kök katmanda (PinchZoomOverlay)
            çiziliyor, bu kutunun `overflow: hidden`'ı kırpmasın diye.
            Önizlemede de AÇIK: katman artık sheet'lerin üstünde (bkz. App.tsx),
            eskiden kapalıydı çünkü kopya modalın altında kalıyordu. */}
        <PinchZoomable
          uri={uri}
          radius={SECTION_PHOTO_RADIUS}
          style={{ width: "100%", height: "100%" }}
        >
          <Image
            source={{ uri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={150}
            onLoadEnd={() => {
              loadedPhotoUris.add(uri);
            }}
          />
        </PinchZoomable>
      </Animated.View>
      {showNote && (
        <View
          style={{
            position: "absolute",
            left: NOTE_BOX_INSET,
            right: NOTE_BOX_INSET,
            bottom: NOTE_BOX_INSET,
          }}
        >
          <NoteBox onPress={onNotePress} onPhoto />
        </View>
      )}
    </View>
  );
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
// Bileşenin kendisi ./ActivityStatus'a taşındı: sticky şerit de aynı satırı
// çiziyor ve oradan SwipeCard'ı import etmek döngü olurdu (bkz. o dosyanın
// başındaki not).

// "Burada yeni" rozeti — ortak nokta pill'leriyle aynı kapsül (999 +
// continuous), aynı 0.5 hairline kenar, aynı px 12 / py 10 iç boşluk, aynı
// 14px/600 yazı; ortak nokta sırasının EN SOLUNDA, ilk item olarak çiziliyor.
// Ölçüler onlarla birlikte hareket etmek ZORUNDA (yan yana duruyorlar) ve üçü
// de expanded paneldeki yaşam tarzı pillerinin ölçüsünü izliyor.
// Tek AYRIŞTIĞI yer zemin: ortak noktalar yarı saydam (surfaceTranslucent),
// bu rozet OPAK `bg` — açık modda beyaz, koyu modda uygulama zemini
// (#121212). Sıradan öne çıkması için bilinçli.
//
// Sticky şerittekiyle KARIŞTIRMA: orası litPlus dolgulu ayrı bir pil
// (bkz. CardStickyHeader) — bu nötr rozet yalnız Keşif kartında kullanılıyor.
//
// `compact`: yalnız isim satırındaki kullanım için. Orada rozet pill sırasında
// değil, ismin SAĞINDA tek başına duruyor — ortak noktalarla hizalanma derdi
// yok, py 10 orada gereksiz şişkin duruyordu.
function NewMemberBadge({
  label,
  compact = false,
}: {
  label: string;
  compact?: boolean;
}) {
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
      <View
        style={{ paddingHorizontal: 12, paddingVertical: compact ? 5 : 10 }}
      >
        <Text className="font-[600] text-[14px]" style={{ color: theme.text }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

// GetPotentialMatches → her kartın `thingsInCommon` rozetleri. Eşleme `kind`
// ile yapılıyor: dil değişse de sabit kalan PascalCase anahtar o (`label`
// lokalize metin, ona GÜVENME). İkizi `kindName` 2026-08-22'de kaldırıldı;
// enum'lar wire'da her zaman string basılıyor, numaraya dönme riski yok.
//
// SEMBOLLER KARTIN KENDİ BÖLÜMLERİNDEN alınıyor: aynı bilgi kapakta bir
// sembolle, kart açılınca başka bir sembolle görünüyordu (burç kapakta ay,
// panelde sparkles; şehir kapakta bina, konum bölümünde mappin). Buradaki bir
// satırı değiştireceksen ilgili bölümün ikonuna bak:
//   University / Department / YearOfStudy → eğitim bölümü (graduationcap.fill)
//   City / District                       → konum bölümü (mappin)
//   ZodiacSign / Pet                      → yaşam tarzı pilleri
// Aynı sembolün iki rozette tekrar etmesi normal (sigara/alkol pillerindeki
// desen): ayırt eden şey pill metni.
//
// `null` = İKON YOK. Hobi rozeti ikonunu bu haritadan almıyor, ilgi alanı
// pilleriyle aynı emojiyi (HobbyIcon) çiziyor; ilişki niyetinde ise kartın
// hiçbir yerinde sembol yok — kendi başlıklı bölümünde düz metin duruyor,
// rozete kalp koymak orada olmayan bir sembol uyduruyordu.
const THING_IN_COMMON_ICONS: Record<
  string,
  { sf: SFSymbol; lucide: LucideIcon } | null
> = {
  Hobby: null,
  University: { sf: "graduationcap.fill", lucide: GraduationCap },
  Department: { sf: "graduationcap.fill", lucide: GraduationCap },
  City: { sf: "mappin", lucide: MapPin },
  District: { sf: "mappin", lucide: MapPin },
  YearOfStudy: { sf: "graduationcap.fill", lucide: GraduationCap },
  // Konuşulan dilin kartta bölümü YOK — takip edecek bir ikon olmadığı için
  // rozetin kendi sembolü kalıyor.
  SpokenLanguage: { sf: "globe", lucide: Languages },
  RelationshipIntent: null,
  // `UsagePurpose` (ordinal 8) KALDIRILDI: backend bu ortak noktayı artık
  // üretmiyor. Ordinal 8 backend'de REZERVE — Pet=9 / ZodiacSign=10 yerinde,
  // buradaki eşleme isimle yapıldığı için indeks kayması da yok.
  Pet: { sf: "pawprint.fill", lucide: PawPrint },
  ZodiacSign: { sf: "sparkles", lucide: Sparkles },
};

// Backend ileride yeni tür ekleyebilir; bilinmeyen `kind` ÇÖKMEMELİ,
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
  /**
   * Not (yorumlu beğeni) gönderme isteği — hedefiyle birlikte.
   *
   * VERİLMEZSE not kutuları hiç çizilmez: kendi profilini önizlediğin yerde
   * (ProfileScreen > PreviewModal) ve Likes önizlemesinde kendine/karşı tarafa
   * not gönderilemez. `previewMode` de aynı sonucu verir, ama bu prop'un yokluğu
   * daha açık bir sözleşme — çağıran "not gönderilebilir" demediyse gönderilemez.
   */
  onNote?: (target: NoteTarget) => void;
}

// Moderasyon ikonları X/tike doğru bu kadar çekiliyor. Satırın gap'ini
// düşürmek X ile tiki de birbirine yaklaştırırdı; negatif iç margin sadece
// uçtaki iki ikonu içeri alır, satır simetrik kaldığı için ortalama bozulmaz.
const MODERATION_PULL = 10;

// Moderasyon ikonu — şikayet ve engelle. Aksiyon satırı varsa onun İÇİNDE
// duruyor (şikayet X'in solunda, engelle tikin sağında), aksiyonlar gizliyse
// (PreviewModal) kendi satırında. Renk Ayarlar'daki "Hesabı Sil" butonunun
// kırmızısı; 36x36 kutu + 30px glif, like/pass'in 75'inin belirgin altında.
// Etiket accessibilityLabel'da: ikon tek başına duruyor, metin taşımıyor.
function ModerationIconButton({
  onPress,
  label,
  name,
  fallback,
  strokeWidth = 1.5,
  weight = "regular",
  pullToward,
}: {
  onPress: () => void;
  label: string;
  name: SFSymbol;
  fallback: LucideIcon;
  strokeWidth?: number;
  weight?: "regular" | "medium" | "semibold" | "bold" | "heavy" | "black";
  // Merkezin hangi tarafta olduğu; o taraftaki boşluk MODERATION_PULL kadar
  // kısalır. Verilmezse ikon olduğu yerde durur (tek başına duran satır).
  pullToward?: "left" | "right";
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={label}
      // Kutu glifi sarmalıyor (36 ≈ 30px glif + 3px pay): aksiyon satırındaki
      // dört öğenin ARALARINDAKİ boşluk eşit görünsün diye kutular gliflerinin
      // ölçüsünde tutuluyor, dokunma alanını hitSlop büyütüyor (efektif 76px).
      hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      style={{
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        marginRight: pullToward === "right" ? -MODERATION_PULL : 0,
        marginLeft: pullToward === "left" ? -MODERATION_PULL : 0,
      }}
    >
      <View pointerEvents="none">
        <SFIcon
          name={name}
          fallback={fallback}
          size={30}
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
  onNote,
}: SwipeCardProps) {
  useRenderCount("SwipeCard");
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
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

  // Paneldeki büyük isim satırının ALT kenarı (panel içi y). Sticky başlığın
  // eşiği bundan hesaplanıyor — sabit bir sayı tutturulamaz: satırın üstünde
  // koşullu "bugün aktif" rozeti var ve isim iki satıra sarabiliyor.
  const [nameBlockBottom, setNameBlockBottom] = useState<number | null>(null);
  const handleNameBlockLayout = useCallback((e) => {
    const { y, height } = e.nativeEvent.layout;
    const bottom = y + height;
    setNameBlockBottom((prev) =>
      prev != null && Math.abs(prev - bottom) < 1 ? prev : bottom,
    );
  }, []);
  // ScrollView içerik toplam yüksekliği — foto bottom'un gradient pozisyonunu
  // hesaplamak için lazım (blend'in bg ile aynı renge bitmesi için).

  // Diğer fotoları arka planda prefetch. Artık expanded panelde bölümlerin
  // arasında GERÇEKTEN render ediliyorlar (bkz. SectionPhoto), ama o ağaç
  // `profileReady` ile 100ms geciktiriliyor — prefetch o kadarlık bir avans
  // veriyor, panel açıldığında fotoğraflar cache'ten gelir.
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

  /**
   * Köşe butonlarının (sağ üstte süper beğeni, sol üstte "başa dön" oku) durum
   * çubuğundan kaçmak için aldığı pay — bkz. CARD_CHROME_TOP_DROP.
   *
   * ÖNİZLEMEDE 0, çünkü orada bu butonlar kartın İÇİNDE değil: sheet kendi
   * şeridini kartın kardeşi olarak çiziyor ve payı ona kendisi veriyor
   * (PreviewModal / LikerSwipeModal > topInset). Buradan da eklenseydi pay iki
   * kez uygulanırdı.
   */
  const cornerDrop = previewMode ? 0 : CARD_CHROME_TOP_DROP;
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
  //
  // ÖNİZLEMEDE ERTELEME YOK: bekletecek bir swipe animasyonu yok ve kapak
  // fotoğrafı da çizilmediği için (bkz. previewMode dalı) 100ms boyunca
  // gösterilecek bir şey kalmıyordu — sheet boş açılıp panel sonradan
  // patlıyordu.
  const [profileReady, setProfileReady] = useState(previewMode);
  useEffect(() => {
    if (previewMode) {
      setProfileReady(true);
      return;
    }
    if (!isTopCard) {
      setProfileReady(false);
      return;
    }
    const id = setTimeout(() => setProfileReady(true), 100);
    return () => clearTimeout(id);
  }, [isTopCard, previewMode]);

  /**
   * Kapak fotoğrafının köşesi. Expand'de de ROUNDED kalıyor (kart-benzeri
   * görünüm) ama kabukla BİRLİKTE 35'e iniyor: kabuk açıkken telefonun
   * köşesine inerken foto 40'ta kalsaydı, kartın üst iki köşesinde ikisinin
   * arasındaki payda kart zemini (açık modda beyaz) görünürdü — bkz.
   * CARD_EXPANDED_CORNER_RADIUS.
   */
  const photoBorderStyle = useAnimatedStyle(() => {
    if (previewMode) return { borderRadius: COVER_PHOTO_RADIUS };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return {
      borderRadius:
        COVER_PHOTO_RADIUS +
        (CARD_EXPANDED_CORNER_RADIUS - COVER_PHOTO_RADIUS) * p,
    };
  });

  /**
   * Kabuğun köşesi: kapalıyken kart (50), açıkken telefonun köşesi
   * (bkz. CARD_EXPANDED_CORNER_RADIUS). Çekme oranıyla ilerliyor — jest yarıda
   * bırakılırsa köşe de yarı yolda kalır, sıçrama yok.
   *
   * ÖNİZLEMEDE SABİT AÇIK DEĞER: orada kart ekranı değil sheet'i dolduruyor ve
   * sheet de en üst detent'te ekranın tepesine dayanıyor — kabuk, sheet'in
   * clip'i ve şeridin kırpması aynı sayıda olmak zorunda (bkz.
   * CARD_EXPANDED_CORNER_RADIUS). Kapalı hâli yok: previewMode'da expandAnim
   * sabit 1 zaten.
   */
  const cardFrameRadiusStyle = useAnimatedStyle(() => {
    if (previewMode) return { borderRadius: CARD_EXPANDED_CORNER_RADIUS };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return {
      borderRadius:
        CARD_CORNER_RADIUS +
        (CARD_EXPANDED_CORNER_RADIUS - CARD_CORNER_RADIUS) * p,
    };
  });

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

  /**
   * Açık kartın zemini düz gri panel (surface3) yerine ANA FOTOĞRAFIN BLUR'LU
   * HALİ mi — ve dolayısıyla bölüm kutuları cam mı (bkz. CardGlassBackdrop /
   * CardSectionBox).
   *
   * İki kapısı var:
   *   • Fotoğraf ŞART: fotoğrafsız profilde blur'lanacak bir şey yok, kutular
   *     düz zeminin üstünde camdan farksız kalırdı.
   *   • Keşif'te ayrıca `isTopCard && profileReady`: arkadaki kart üstteki
   *     tarafından tamamen örtülü (orada tam ekran bir zemin kurmanın karşılığı
   *     yok) ve swipe'ın son karesinde bir katman daha kurmak animasyon
   *     kuyruğuna biniyor — panelin kendi gate'iyle aynı gerekçe. Önizlemede
   *     böyle bir kuyruk yok, kart zaten açık doğuyor.
   *
   * ZEMİNİ KİM ÇİZİYOR, İKİ BAĞLAMDA FARKLI:
   *   Keşif — scroll kartın İÇİNDE, kart sabit. Zemini kart kendi çerçevesine
   *           mutlak olarak çiziyor (aşağıda).
   *   Sheet — scroll kartın DIŞINDA ve KART kayıyor (bkz. CardSheetScrollView).
   *           Kartın içine konan bir zemin içerikle birlikte kayardı, yani
   *           sabit olmazdı → zemini SHEET çiziyor, scroll'un kardeşi olarak
   *           (PreviewModal · LikerSwipeModal). Kart orada yalnız şeffaflaşır.
   *
   * Hook'lardan ÖNCE hesaplanıyor: aşağıdaki animated style'ın buna ihtiyacı
   * var, `allPhotos` ise erken return'den sonra kuruluyor. `profile?.photos[0]`
   * ile `allPhotos[0]` aynı değer.
   */
  const glassPanel =
    !!profile?.photos?.[0] && (previewMode || (isTopCard && profileReady));

  /**
   * ── CAM KURULUMUNU GECİKTİRME — ÜÇ KEZ DENENDİ, ÜÇÜNDE DE HATANIN SEBEBİ ──
   *
   * Burada bir dönem `entrySettled` vardı: kart üste geçtikten 700ms sonra
   * (SwipeWrapper'ın scale springi bitsin diye) camın kurulmasına izin veren
   * bir kapı. Yanına `cardStackMotion` (destenin kabı) ve `expandAnim === 1`
   * (kutu ekranda mı) koşulları da eklendi. HEPSİ KALDIRILDI, çünkü gecikmenin
   * KENDİSİ hataydı.
   *
   * Kanıt: aynı `CardSectionBox`, aynı kart bileşeni, Likes/Chat/Profil
   * önizlemelerinde HİÇ bozulmuyor. Oradaki tek fark bu kapıların `previewMode`
   * ile anında açılması — yani faz zinciri kutu mount olur olmaz koşuyor.
   * Keşif'te ise 700ms bekliyordu.
   *
   * Native kural (GlassView.swift, expo#43732):
   *
   *   // UIGlassEffect must be created during layoutSubviews
   *   // creating it in didMoveToWindow does not render correctly.
   *
   * Efekt, view'ın İLK layout turunda kurulmak zorunda. Zincir mount ile aynı
   * karede koşarsa son stil ilk `layoutSubviews`e YETİŞİYOR ve efekti native
   * taraf kendi layout turunda kuruyor (önizlemenin yaptığı bu). 700ms
   * beklersek ilk layout çoktan geçmiş oluyor; "regular" ataması layout turunun
   * DIŞINDA kalıyor ve kutu başına tutup tutmuyor — "rastgele bazı sectionlar"
   * belirtisi tam olarak bu.
   *
   * BURAYA YENİ BİR GECİKME/KAPI EKLEME. Camı geciktiren her koşul, onu ilk
   * layout turunun dışına iter ve hatayı geri getirir.
   */


  /**
   * Profile info — fade-in + slide-up. CAM YOLUNDA İKİSİ DE YOK: panel
   * hareketsiz duruyor.
   *
   * Sebep tek ve sert: içindeki `GlassView` kutuları, ata zincirinde alfa 1'in
   * altındayken VEYA kimliksel olmayan bir transform varken efektlerini hiç
   * render etmiyor (bkz. CardSectionBox'taki kural). Panel KAPALIYKEN mount
   * oluyor ve cam orada kuruluyor — o an expandAnim 0, yani eski hâlinde alfa
   * 0 ve translateY 80. İkisi de ihlal.
   *
   * Önizleme kartlarının aynı kutuları hep sorunsuz çalışıyordu: orada
   * expandAnim sabit 1, yani alfa 1 ve translateY 0. Fark buydu.
   *
   * Görsel bedeli yok denecek kadar az: panel collapsed'ken zaten kapak
   * fotoğrafının ALTINDA, katlanmanın dışında duruyor — hareketin görüldüğü
   * tek yer kartın expand ile uzayan son ~29px'iydi.
   *
   * BURAYA YENİ BİR opacity/transform EKLEME. Gerekiyorsa kutuları saran
   * DEĞİL, kutuların İÇİNDEKİ katmana ver.
   */
  const profileInfoAnimStyle = useAnimatedStyle(() =>
    glassPanel
      ? { opacity: 1 }
      : {
          opacity: expandAnim.value,
          transform: [{ translateY: 80 * (1 - expandAnim.value) }],
        },
  );

  // Kapak fotoğrafındaki not kutusu — isim/pill bloğu gittikten SONRA gelsin.
  // Onlar 0→0.55 aralığında kayboluyor (nameAnimStyle · pillsAnimStyle), bu da
  // 0.55→1 aralığında beliriyor: iki katman aynı bantta hiç üst üste binmiyor.
  // profileInfoAnimStyle'ı yeniden kullanmıyoruz — oradaki 80px'lik translateY
  // mutlak konumlu bir kutuyu fotoğrafın alt kenarının dışına taşırdı.
  const coverNoteAnimStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (expandAnim.value - 0.55) / 0.45));
    return { opacity: p, transform: [{ translateY: 8 * (1 - p) }] };
  });

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

  // Üniversite adı DAİMA `*Display`'den: `universityName` DB'deki Türkçe resmî
  // ad, dile göre değişmiyor. Fallback yalnız deploy penceresi için — alanı
  // göndermeyen sunucuda kart üniversitesiz kalmasın.
  const universityLabel =
    profile?.universityNameDisplay || profile?.universityName;

  // İlişki niyeti etiketi = kısa yerel etiket + "ilişki" eki
  // ("Uzun süreli" → "Uzun süreli ilişki").
  //
  // ETİKET ÖNCE YERELDEN, backend display'inden DEĞİL: `display` Accept-Language
  // tr olsa bile İngilizce dönebiliyor ("Long term relationship") ve Türkçe
  // kartta "... relationship" diye karışık bir metin çıkıyordu. enumName başına
  // kısa yerel etiket (filtre pill'leriyle AYNI harita) varsa o basılıyor;
  // yoksa — backend'in sonradan ekleyeceği bir enum — display'e düşülüyor, yani
  // yeni değerde boş etiket çıkmıyor.
  //
  // Ek SADECE süre bildiren dört enum'a takılıyor. `StillFiguringOut`
  // ("Henüz karar vermedim") bir süre değil bir cümle; ek alırsa
  // "Henüz karar vermedim ilişki" gibi bozuk bir metin çıkar. Aynı sebeple
  // listede olmayan (backend'in sonradan ekleyeceği) enum'lar da eksiz
  // basılır — bilmediğimiz bir etikete kör ek takmaktansa düz göstermek
  // güvenli taraf.
  //
  // AYRICA: display'e düşüldüğünde metin kelimeyi ZATEN içerebiliyor ("Uzun
  // süreli ilişki", "Long term relationship" — bkz. FilterModal pill etiketi
  // notu). Kör ek "... ilişki ilişki" üretiyordu; kelime içerideyse (iki dilde
  // de bakılıyor, bkz. INTENT_SUFFIX_WORDS) ek atlanıyor.
  const relationshipIntentLabel = useMemo(() => {
    const enumName = profile?.relationshipIntent;
    const shortLabel = enumName
      ? t(`discover.filters.relationshipIntents.short.${enumName}`, {
          defaultValue: "",
        })
      : "";
    const label = shortLabel || profile?.relationshipIntentDisplay;
    if (!label) return "";
    const suffix = t("profile.card.intentSuffix");
    const needsSuffix =
      RELATIONSHIP_INTENTS_WITH_SUFFIX.has(enumName) &&
      !INTENT_SUFFIX_WORDS.some((word) => containsWord(label, word));
    return needsSuffix ? `${label} ${suffix}` : label;
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
      const kind = typeof item?.kind === "string" ? item.kind : "";
      return [
        {
          // Tek istisna: University rozetinde backend üniversite ADINI
          // gönderiyor; pilde okul adı yerine "Aynı Üniversite" yazıyoruz —
          // isim zaten hemen üstteki universityName satırında duruyor.
          label:
            kind === "University" ? t('profile.card.sameUniversity') : label,
          // Hobi rozeti ikonunu emoji olarak çiziyor (aşağıda ayrı dal), o
          // yüzden ham `label` da taşınıyor: "Aynı Üniversite" gibi yeniden
          // yazılan etiketle karışmasın.
          hobby: kind === "Hobby" ? label : null,
          // `?? DEFAULT` DEĞİL, `in` kontrolü: haritadaki `null` değerler
          // "ikon yok" demek (hobi + ilişki niyeti) — `??` onları da
          // varsayılan tike düşürürdü. Varsayılan yalnız haritada HİÇ
          // olmayan, backend'in sonradan eklediği türler için.
          icon:
            kind in THING_IN_COMMON_ICONS
              ? THING_IN_COMMON_ICONS[kind]
              : DEFAULT_THING_IN_COMMON_ICON,
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

  // ── Panelin ALT SATIRI ────────────────────────────────────────────────────
  // Üç ihtimalden TAM BİRİ çiziliyor ve hangisi olursa olsun `actionsTop`u
  // (alt zemin rampasının başlangıcı) ve alt payı o veriyor:
  //   1. Aksiyon satırı — X/tik (+ yanlarında moderasyon uyduları).
  //   2. Yalnız moderasyon satırı — X/tik yokken ikonlar ortalanır.
  //   3. Boş kuyruk — ikisi de yokken (kendi profilini önizleme). Sırf ölçü
  //      taşır: onsuz `actionsTop` null kalıyor, rampa hiç çizilmiyor ve panel
  //      surface3'te bitiyordu (alt uçta bounce edince zemin rengine geçiş yok).
  const showActionsRow = !hideActions && !!(onPass || onLike);
  const showModerationRow = showModeration && !showActionsRow;
  const showPanelTail = !showActionsRow && !showModerationRow;

  /**
   * X / tik gliflerinin rengi. Cam yolunda (glassPanel) panelin zemini artık düz
   * bir yüzey değil, KAPAK FOTOĞRAFININ blur'lu hali (bkz. CardGlassBackdrop) —
   * yani foto üstü. Açık modda `theme.text` koyu mürekkep ve o zeminin koyu
   * lekelerinde (saç, gölge, koyu kıyafet) glifler kayboluyordu; perdeyi
   * kalınlaştırmak yerine mürekkebi foto üstü ailesine (`onMedia`, sabit beyaz)
   * çekiyoruz — kartın üstündeki diğer medya glifleriyle (chevron, isim) aynı
   * kural. Fotoğrafsız profilde zemin yine düz surface3, orada tema mürekkebi
   * doğru olan. Moderasyon ikonları BUNUN DIŞINDA: onların rengi anlam taşıyan
   * `errorStrong` kırmızısı, iki zeminde de aynı kalıyor.
   */
  const actionGlyphColor = glassPanel ? theme.onMedia : theme.text;

  // İsmin yanındaki ", 23" eki. `distance` ile AYNI tuzak: `age` DTO'da
  // non-nullable int olduğu için karşı taraf `showAge`'i kapattığında backend
  // null yerine **0** gönderiyor — `age != null` kontrolü bunu geçirir ve kartta
  // ", 0" yazardı. Çözüm tek yerde: resolveCardAge (bkz. cardPrivacy.ts).
  const ageSuffix = useMemo(() => {
    const age = resolveCardAge({ age: profile?.age, showAge: profile?.showAge });
    return age != null ? `, ${age}` : "";
  }, [profile?.age, profile?.showAge]);

  // Konum satırındaki mesafe pili. Backend `distance`'ı km cinsinden gönderir;
  // alan yoksa/geçersizse pil hiç çizilmez. Yaklaşıklık bilinçli: km'ye
  // yuvarlanır ve 1 km altı ayrı metne düşer, ondalıklı bir mesafe
  // kullanıcının konumunu fazla keskin ele verir.
  //
  // `0` ARTIK "yok" DEMEK: karşı taraf `showDistance`'ı kapattığında backend
  // alanı null yapamıyor (DTO'da non-nullable int) ve 0 gönderiyor — `showAge`
  // → `age: 0` ile aynı desen. Eskiden 0'ı "çok yakın" diye basıyorduk;
  // gizlenmiş mesafeyi "hemen yanında" diye göstermek yanlış olur. Gerçekten
  // <1 km olan biri de 0 gelirse pil çizilmez, bu kabul edilmiş maliyet.
  const distanceLabel = useMemo(() => {
    const km = profile?.distance;
    if (typeof km !== "number" || !Number.isFinite(km) || km <= 0) return null;
    if (km < 1) return t('profile.card.distanceNear');
    return t('profile.card.distanceAway', { km: Math.round(km) });
  }, [profile?.distance, t]);

  // İlçe + şehir metni. Karşı taraf `showLocation`'ı kapattıysa backend
  // `cityDisplay`/`districtDisplay`ı (ve koordinatları) null gönderir — yani
  // bu alanların dolu geleceği GARANTİ DEĞİL, join'den önce filtrelenmeli
  // yoksa satırda yalnız bir ayraç (", ") kalır.
  const locationLabel = useMemo(() => {
    const parts = [profile?.districtDisplay, profile?.cityDisplay].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }, [profile?.districtDisplay, profile?.cityDisplay]);

  // Konum bölümündeki Mapbox statik haritası. Koordinat KARTTAN GELMİYOR
  // (ProfileCardDto yalnız `cityDisplay`/`districtDisplay` taşıyor), il
  // merkezleri tablosundan çözülüyor — zoom kaba olduğu için ilçe farkı bu
  // ölçekte görünmez. İl tanınmazsa (tabloda yoksa) harita hiç çizilmez,
  // bölüm eski hâline — başlık + konum satırı — düşer. Karşı taraf konumunu
  // gizlediyse `cityDisplay` null gelir → tablo eşleşmez → harita da çizilmez;
  // ayrı bir kontrole gerek yok.
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

  /**
   * Kartı kapatan aksiyon: önce içeriği başa sar, sonra collapse.
   *
   * SIRA ÖNEMLİ — doğrudan collapse edilirse kart, içerik ortasında kaymış
   * hâlde kapanıyor ve bir sonraki açılış o offset'ten başlıyor. 180ms, scroll
   * animasyonunun collapse başlamadan ilerlemesine yetecek kadar.
   *
   * İKİ GİRİŞİ var ve ikisi de aynı yeri çağırıyor: kapak fotoğrafının
   * dibindeki ok ve sticky şeritteki cam buton (bkz. CardCollapseGlassButton).
   * İkincisi birincisi ekrandan çıktığı için var.
   */
  const handleCollapse = useCallback(() => {
    const sv = scrollViewRef.current as unknown as {
      scrollTo?: (opts: { y: number; animated: boolean }) => void;
    } | null;
    sv?.scrollTo?.({ y: 0, animated: true });
    setTimeout(() => onExpandPress?.(), 180);
  }, [scrollViewRef, onExpandPress]);

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
  // Aynı style expand morph'unu da taşıyor (ayrı bir useAnimatedStyle DEĞİL):
  // iki style de `transform` yazsaydı sonraki diziyi tamamen ezerdi, pull
  // scale/rotate'i kaybolurdu. Çakışma riski yok, çünkü SwipeWrapper'da
  // pull-down (super-like) ile pull-up (expand) ayrı dallar — ikisi aynı anda
  // ilerlemiyor.
  const heartPullStyle = useAnimatedStyle(() => {
    const pull = superLikeProgress ? superLikeProgress.value : 0;
    const p = Math.max(pull, heartPressAnim.value);
    const amp = p * 8; // titreşim genliği (derece), pull arttıkça artar
    const angle = Math.sin(shakePhase.value * Math.PI * 2) * amp;
    // Expand ederken yerini cam butona bırakır: söner + glyph ölçüsüne küçülür.
    const morph = Math.min(
      1,
      Math.max(0, expandAnim.value / HEART_MORPH_OUT_END),
    );
    const scale = (1 + p * 0.35) * (1 - (1 - HEART_MORPH_SCALE) * morph);
    // Cam ikizi SABİT olarak cornerDrop kadar aşağıda duruyor; kalp oraya
    // sönerken yaklaşsın: kesişme bandında (0.30-0.45) iki şekil üst üste
    // olmalı, yoksa kabuk değiştirme değil yer değiştirme gibi okunur.
    // `morph` üzerinden ilerliyor (expandAnim değil): kayma tam kalp
    // görünmez olduğu anda (0.45) tamamlanıyor, kesişmede fark ≤3px kalıyor.
    // translateY EN BAŞTA: ölçekten sonra gelirse kayma da ölçeklenir.
    const drop = cornerDrop * morph;
    return {
      opacity: 1 - morph,
      transform: [
        { translateY: drop },
        { scale },
        { rotate: `${angle}deg` },
      ] as const,
    };
  });

  // Asılı cam buton — serbest kalbin tersi bantta belirir. Konumu burada YOK:
  // cornerDrop sabit olduğu için statik style'da duruyor (bkz. aşağıdaki
  // `top`), animasyonlu bir layout prop'u da olmuyor.
  const superLikeStickyStyle = useAnimatedStyle(() => {
    const p = Math.min(
      1,
      Math.max(
        0,
        (expandAnim.value - HEART_MORPH_IN_START) /
          (HEART_MORPH_IN_END - HEART_MORPH_IN_START),
      ),
    );
    return { opacity: p, transform: [{ scale: 0.8 + 0.2 * p }] as const };
  });

  // ── Sticky başlığın eşiği: isim şeridin altına indiği an ─────────────────
  // Şeridi ÇİZEN taraf CardStickyHeader; burada yalnız eşik ölçülüyor. Değer
  // shared value'da tutuluyor, worklet closure'ında DEĞİL: kapak yüksekliği ve
  // isim satırının ölçüsü ayrı ayrı geç geliyor, her değişimde worklet'leri
  // yeniden kurmak yerine tek bir bandı güncelliyoruz.
  //
  // YALNIZ KEŞİF'İN derdi: orada büyük isim kartın fotoğrafında/panelinde
  // duruyor ve şerit onu devralıyor. Önizlemede kartın kendi ismi hiç
  // çizilmiyor, şerit de scroll beklemeden açık doğuyor (alwaysOpen) — orada
  // ölçülecek bir devir noktası yok.
  const headerTriggerY = useSharedValue(Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    if (nameBlockBottom == null) {
      // Panel henüz ölçülmedi → eşik ulaşılamaz, şerit hiç açılmaz.
      headerTriggerY.value = Number.MAX_SAFE_INTEGER;
      return;
    }
    // Şeridin başlık satırı cornerDrop kadar aşağıda duruyor → devir çizgisi de
    // o kadar aşağıda: pay eklenmezse isim şeridin altına girmeden devir
    // tamamlanmış sayılırdı.
    headerTriggerY.value =
      photoHeight +
      PROFILE_PANEL_GAP +
      nameBlockBottom -
      (CARD_HEADER_TITLE_BOTTOM + cornerDrop);
  }, [nameBlockBottom, photoHeight, headerTriggerY, cornerDrop]);

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

  // Kapakta yalnız ilk foto durur. Kalanlar expanded panelde bölümlerin
  // arasına dağıtılıyor (2. → üniversite ile niyet arası, 3. → ilgi alanları
  // ile yaşam tarzı arası, 4. → 1.-2. prompt arası, 5. → 2.-3. prompt arası,
  // 6. → konumun üstüne, gerisi konumun altına).
  // Kenarlara basarak galeri gezme KALDIRILDI: aynı fotoğraflar zaten akışın
  // içinde, gizli bir dokunma alanı tutmanın anlamı kalmadı.
  const extraPhotos = allPhotos.slice(1);

  // Çizilebilir prompt'lar. Sunucu sırayı garanti ediyor (`OrderBy(DisplayOrder)`),
  // burada yalnızca eksik alanlı kayıtlar ve tavanı aşan fazlalık eleniyor.
  //
  // Boş liste KALICI OLARAK geçerli bir durum: migration'dan gelen kullanıcıların
  // hiç prompt'u yok. O durumda bölüm çizilmiyor ve kart bio'ya düşüyor.
  const promptSections = useMemo(
    () =>
      (profile.prompts ?? [])
        .filter((p) => !!p?.promptDisplay && !!p?.answer)
        .slice(0, MAX_PROFILE_PROMPTS),
    [profile.prompts],
  );

  // Prompt'ların ARASINA giren fotoğraflar: 4. foto 1.-2., 5. foto 2.-3.
  // prompt arasına. Slot yalnız İKİ prompt arasında var — son prompt'un altına
  // düşmez, orası konum bölümünün alanı. Prompt sayısı yetmiyorsa (kimsenin
  // prompt'u olmayabiliyor) o fotoğraflar yerleşmez ve aşağıdaki artakalan
  // bloğuna, profil sırasını koruyarak düşer.
  const promptGapPhotos = new Map<number, number>();
  for (let i = 0; i < 2; i += 1) {
    if (promptSections.length > i + 1 && extraPhotos[2 + i]) {
      promptGapPhotos.set(i, 2 + i);
    }
  }

  // Akışta SABİT yeri olan fotoğrafların index'leri; kalanlar konumun altında.
  const placedPhotoIndexes = new Set<number>([
    0,
    1,
    // 6. foto — konum bölümünün ÜSTÜ.
    4,
    ...promptGapPhotos.values(),
  ]);
  const trailingPhotos = extraPhotos
    .map((uri, index) => ({ uri, index }))
    .filter(({ index }) => index >= 2 && !placedPhotoIndexes.has(index));

  /**
   * Not kutusunun basma handler'ı. `onNote` verilmediyse `undefined` döner —
   * SectionPhoto/NoteBox o zaman kutuyu hiç çizmez (önizleme kartları).
   *
   * useCallback YOK, bilerek: her kutu KENDİ hedefiyle ayrı bir closure istiyor,
   * memoize etmek hedef sayısı kadar hook gerektirirdi (kural ihlali). Kart
   * ağacı zaten `isTopCard` + `profileReady` ile korunuyor.
   */
  const noteHandler = (target: NoteTarget) =>
    onNote ? () => onNote(target) : undefined;

  // İlgi alanları bölümü — çizildiği YER prompt sayısına bağlı olduğu için
  // (aşağıya bak) burada bir kez kuruluyor, iki ayrı yerde aynı JSX'i
  // tekrarlamayalım.
  const interestsSection =
    profile.hobbies && profile.hobbies.length > 0 ? (
      <CardSectionBox
        glass={glassPanel}
        // Ölçüler eski className'den (`mb-4 p-4 py-8`) birebir taşındı: cam
        // yolunda kutunun KENDİSİ native bir view, NativeWind oraya sınıf
        // uygulamıyor.
        style={{ marginBottom: 16, paddingHorizontal: 16, paddingVertical: 32 }}
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
                    // İki modda da gri dolgu, tonu moda göre:
                    // açıkta mesafe pilinin ("3 km uzakta")
                    // grisiyle AYNI token (surface4) — aynı panelde
                    // iki farklı gri tonu istemiyoruz; koyuda
                    // zeminden bir tık açık koyu gri. Saydam pil her
                    // iki zeminde de yalnız hairline'ıyla duruyor ve
                    // kayboluyordu.
                    //
                    // KOYUDA mesafe pili takip EDİLMEZ: orada dolgu
                    // beyaz (ink(1)) ve yazısı veil(1) ile birlikte
                    // çalışıyor; buradaki yazı theme.text olduğu için
                    // beyaz dolgu okunmaz hale gelirdi.
                    //
                    // Açık modda zemin not diskiyle aynı beyaza yakın renk,
                    // koyuda surface3 (bkz. pillFill).
                    backgroundColor: pillFill(theme.surface3),
                    borderWidth: 0.5,
                    borderColor: theme.border,
                  }}
                >
                  {/* px 12 / py 8 — yaşam tarzı pilleriyle AYNI ölçü; kapaktaki
                      ortak nokta pilleri (NewMemberBadge / thingsInCommon)
                      10'da kaldı, oradaki piller kart üstünde tek başına
                      duruyor, buradakiler ise onlarca yan yana. Tarihçe:
                      py 14 kapsül değil dikey tablet gibiydi, 6 fazla inceydi;
                      10 → 8 bu iki bölümün sıkışması için. */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      gap: 8,
                    }}
                  >
                    {/* İkon kutusu ve emoji 13px — yaşam tarzı pilindeki
                        SFIcon ile AYNI sayı (o da 13). Sembol emojiden optik
                        olarak küçük kalıyor (SFIcon'un size'ı SymbolView'ın
                        çerçevesi, sembol oraya scaleAspectFit ediliyor; emoji
                        ise em kutusunu dolduruyor) — iki bölümün pilleri
                        birebir aynı yükseklikte olsun diye sayılar eşit
                        tutuldu. Emoji kutudan biraz taşar (HobbyIcon açık height
                        verdiği için kırpılmaz): lineHeight 13*1.25≈16,
                        yani üstten/alttan ~1.5px. Pilin 8px dikey padding'i
                        bunu rahat karşılıyor, sarmalayıcının
                        overflow:hidden'ı glifi kırpmıyor. Pil yüksekliğini
                        14px'lik metnin satır kutusu belirlediği için bu
                        küçülme pilin ölçüsünü değiştirmiyor. */}
                    <View
                      style={{
                        height: 13,
                        justifyContent: "center",
                        alignItems: "center",
                        overflow: "visible",
                      }}
                    >
                      <HobbyIcon
                        hobby={enumName ?? label}
                        size={13}
                        color={theme.text}
                        strokeWidth={1.5}
                      />
                    </View>
                    <Text className="font-[600] text-[14px]" style={{ color: theme.text }}>
                      {label}
                    </Text>
                  </View>
                </View>
              ),
            };
          })}
        />
      </CardSectionBox>

    ) : null;

  // 6. fotoğraf ve konum bölümü — ikisi de SON prompt'un ÜSTÜNE taşındı
  // (konum ile son prompt yer değiştirdi). Prompt yoksa dayanacak kart
  // olmadığı için eski yerlerinde çiziliyorlar; JSX iki dalda da aynı
  // olsun diye burada bir kez kuruluyor.
  const photo6Section = extraPhotos[4] ? (
      <SectionPhoto
        uri={extraPhotos[4]}
        hideNote={previewMode}
        onNotePress={noteHandler(photoNoteTarget(5))}
      />
    
  ) : null;

  // Konum — şehir/ilçe VEYA mesafeden en az biri varsa çizilir. İkisi ayrı
  // gizlilik ayarı (`showLocation` / `showDistance`) olduğu için "şehri gizle
  // ama mesafeyi göster" geçerli bir kombinasyon: bölümü yalnız cityDisplay'e
  // bağlarsak o kullanıcının mesafesi de kaybolurdu.
  const locationSection =
    locationLabel || distanceLabel ? (
      <CardSectionBox
        glass={glassPanel}
        // Başlık kalktı → üst payı büyüten `pt-8` de gitti, kutu
        // simetrik: haritanın çevresinde her yönde aynı boşluk.
        // (Eski className: `mb-4 p-4 py-5`.)
        style={{ marginBottom: 16, paddingHorizontal: 16, paddingVertical: 20 }}
      >
        {/* Bölüm BAŞLIKSIZ: harita + altındaki şehir/mesafe satırı
            neye baktığını zaten anlatıyor, "Konum" başlığı aynı
            bilgiyi üçüncü kez tekrarlıyordu. */}
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
              {/* İğne zemini blur DEĞİL, düz dolgu: harita
                  görüntüsü blur'un altından sızınca iğne
                  karışıyordu. Açıkta beyaz / koyuda koyu gri —
                  ikonun rengi zaten `text` olduğu için iki modda da
                  kontrast korunuyor. Koyuda TAM SİYAH değil: koyu
                  harita karosunun üstünde daire delik gibi
                  duruyordu, `surface4` + bir tık daha belirgin gölge
                  onu haritadan ayırıyor. overflow:hidden YOK; gölge
                  aynı View'da clip'lenirdi. */}
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  borderCurve: "continuous",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isLight() ? "#FFFFFF" : theme.surface4,
                  shadowColor: theme.shadow,
                  shadowOpacity: isLight() ? 0.16 : 0.35,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 3,
                }}
              >
                <SFIcon
                  name="mappin"
                  fallback={MapPin}
                  size={22}
                  color={theme.text}
                />
              </View>
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
                davranışı flexShrink ile korunuyor.

                Konum gizliyken Text HİÇ basılmıyor (boş string'le
                bırakılsa gap: 8 iğneyle pil arasında ölü boşluk
                bırakırdı). */}
            {locationLabel && (
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: "500",
                  lineHeight: 22,
                  flexShrink: 1,
                  flexWrap: "wrap",
                }}
              >
                {locationLabel}
              </Text>
            )}
            {/* Mesafe pili — backend `distance` göndermezse veya
                0 gönderirse (gizlenmiş mesafe) hiç çizilmez.
                Dolgu/yazı/çerçeve üçlüsü distancePillColors()'tan
                geliyor: iki modda da gri yüzey + normal yazı (bkz.
                oradaki not — sabit theme.onMedia / theme.mediaHairline
                modla dönmediği için KULLANILMIYOR).
                flexShrink: 0 → uzun ilçe/şehir adı pili ezmez,
                metin sarar. */}
            {distanceLabel && (
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: distancePillColors().border,
                  backgroundColor: distancePillColors().background,
                  flexShrink: 0,
                }}
              >
                {/* Ölçüler Beğeniler ekranındaki "Nasıl alırım?" piliyle
                    AYNI: px 12 / py 6 / 13px / 700. Eskiden 8/10/12 idi —
                    dar ve uzun, yani kapsül değil dikey bir kutu gibi
                    duruyordu; uygulamada tek bir pil ölçüsü dili olsun. */}
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  }}
                >
                  <Text
                    className="font-[700] text-[13px]"
                    style={{ color: distancePillColors().text }}
                  >
                    {distanceLabel}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </CardSectionBox>

    ) : null;

  return (
    // Sağlayıcı kartın TAMAMINI sarıyor: cam kutular birden çok yerde (panel
    // bölümleri · bölüm fotoğrafı not diskleri), hepsi aynı sinyali okumalı.
    // Provider bir host view çizmiyor, ağaca maliyeti yok.
    <Animated.View
      style={[
        {
          // Kart kabuğunun yarıçapı — şerit ve kartı taşıyan sheet aynı sayıyı
          // okuyor (bkz. CARD_CORNER_RADIUS). Açıkken telefonun köşesine
          // iniyor, bir alttaki cardFrameRadiusStyle bunu eziyor.
          borderRadius: CARD_CORNER_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          // Cam yolunda ÖNİZLEMEDE şeffaf: orada zemini sheet çiziyor ve kart
          // onun ÜSTÜNDE duruyor — opak kalırsa zemini komple örter. Keşif'te
          // zemin kartın İÇİNDE (bir alttaki CardGlassBackdrop), o yüzden burası
          // opak kalabiliyor ve foto yüklenene kadarki boşluğu da o dolduruyor.
          backgroundColor:
            glassPanel && previewMode ? "transparent" : theme.bg,
        },
        cardFrameRadiusStyle,
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
      {/* Kartın SABİT zemini — ana fotoğrafın blur'lu hali. Scroll'un DIŞINDA
          ve kart çerçevesine göre mutlak: içerik üstünden akıp giderken zemin
          kıpırdamıyor (bkz. CardGlassBackdrop). Sırası önemli: ScrollWrapper'ın
          ÖNÜNDE, yani her şeyin altında.

          ÖNİZLEMEDE BURADA ÇİZİLMEZ: orada kartın kendisi kayıyor, zemin de
          onunla birlikte kayardı. Aynı bileşeni sheet scroll'un KARDEŞİ olarak
          çiziyor (PreviewModal · LikerSwipeModal) — bkz. glassPanel notu. */}
      {glassPanel && !previewMode && <CardGlassBackdrop uri={allPhotos[0]} />}

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
              frame'inin #121212 bg'siyle uyumlu.

              Cam yolunda ŞEFFAF: altındaki sabit blur'lu zemin (bkz.
              CardGlassBackdrop) görünsün. Opak kalsaydı zemini komple
              örterdi. */}
          <View
            style={{ backgroundColor: glassPanel ? "transparent" : theme.bg }}
          >
            {/* Photo Gallery — expanded olurken borderRadius 40→0 anime.
                Fotoğrafı OLMAYAN profilde de aynı ağaç çiziliyor, sadece
                görsellerin yerinde nötr bir zemin durur (bkz. aşağıdaki
                placeholder). Eskiden ayrı bir dal vardı: sabit 500px, köşe
                yarıçapı yok, "fotoğraf yok" yazısı — kartın bütün kabuğunu
                (blur'lar, isim bloğu, chevron, aksiyonlar) kaybettiği için
                yapı bozuluyor ve altta düz bir kesik kalıyordu.

                ÖNİZLEMEDE HİÇ ÇİZİLMİYOR (Likes / Chat / Profil kartı): orada
                kart zaten açık doğuyor, yani tam ekran kapak bir kez bile
                "kapak" olarak görünmüyordu — kullanıcının kaydırıp geçmesi
                gereken ölü bir ekran boyu oluyordu. İlk fotoğraf onun yerine
                panelin en üstüne, ismin ALTINA taşındı (aşağıda). Kapakla
                birlikte yalnız ona ait katmanlar da gidiyor: üst/alt blur,
                foto üstündeki isim + pill bloğu, chevron, kapak not kutusu ve
                serbest kalp — hepsi önizlemede zaten gizli ya da görünmezdi.

                Yerini KART ZEMİNİNDE bir boşluk almıyor: panel kartın tepesine
                dayanıyor ve nefes payını kendi içinde taşıyor
                (PREVIEW_HEADER_SPACE). Bkz. oradaki not — beyaz şerit. */}
            {!previewMode && (
            <Animated.View
              style={[
                {
                  borderCurve: "continuous",
                  overflow: "hidden",
                  height: photoHeight,
                  backgroundColor: theme.surface,
                  // KAPAĞIN KENARLIĞI YOK, bilerek: kapak zaten fotoğrafın
                  // kendi kenarıyla sınırlanıyor, üstüne çizgi koymak kartı
                  // çerçeveletiyordu. Panelin kenarı da sonradan kaldırıldı —
                  // kartta artık hiç hairline yok (bkz. yukarıdaki not).
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

              {/* Kapak = SADECE ilk foto. Diğerleri eskiden burada opacity 0
                  ile mount ediliyordu (kenara basınca anında geçsin diye);
                  galeri gezme kalkınca o kopyalara gerek kalmadı — hepsi
                  aşağıdaki bölümlerin arasında bir kez çiziliyor. */}
              {/* Zoom katmanı — top'a çarpma geri bildirimi (photoZoomStyle).
                  Parent clipping kutusu ve borderRadius sabit kaldığı için
                  foto kartın içinde yakınlaşır, kart kıpırdamaz. */}
              <Animated.View style={[{ flex: 1 }, photoZoomStyle]}>
                {allPhotos[0] && (
                  <PinchZoomable
                    uri={allPhotos[0]}
                    // Kaynağın köşesiyle AYNI: kopya açılırken köşe zıplamasın.
                    // Pinch YALNIZ açık kartta çalışıyor (bir alttaki
                    // `enabled`), orada kapağın köşesi de kabukla birlikte
                    // 35'te — bkz. photoBorderStyle. Sabit 40 yazıldığı dönemde
                    // pinch başında köşe bir karede zıplıyordu.
                    radius={
                      expanded ? CARD_EXPANDED_CORNER_RADIUS : COVER_PHOTO_RADIUS
                    }
                    // Kapakta pinch YALNIZ expanded'ken: collapsed'de kapak
                    // kartın kendisi demek, oradaki iki parmak swipe/pull
                    // jestlerinin alanı.
                    enabled={!previewMode && expanded}
                    style={{ flex: 1 }}
                  >
                  <Image
                    source={{ uri: allPhotos[0] }}
                    // absoluteFill — ELLE width/height VERME. Mutlak çocuk
                    // kabın İÇ kutusundan (kenarlığın içinden) başlıyor ama
                    // ölçü DIŞ kutununki olunca sağ/alt kenarlığın üstüne 0.5px
                    // taşıyor ve onları boyayarak siliyordu: kapağın çizgisi
                    // yalnız solda görünüyordu. Inset 0 tam iç kutuyu doldurur,
                    // dört kenar da açıkta kalır. `contentFit="cover"` ölçüyü
                    // buradan alıyor, açık genişlik/yüksekliğe gerek yok.
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={allPhotos[0]}
                    // Üst kart decode kuyruğunda önceliklidir; alttaki kart
                    // düşük öncelikle arkada yüklenir (algılanan hız).
                    priority={isTopCard ? "high" : "low"}
                    transition={150}
                    onLoadEnd={() => {
                      const photo = allPhotos[0];
                      loadedPhotoUris.add(photo);
                      setLoadedPhotos((prev) => {
                        if (prev.has(photo)) return prev;
                        const next = new Set(prev);
                        next.add(photo);
                        return next;
                      });
                    }}
                  />
                  </PinchZoomable>
                )}
              </Animated.View>

              {/* Skeleton overlay — kapak fotoğrafı henüz yüklenmediyse */}
              {allPhotos[0] && !loadedPhotos.has(allPhotos[0]) && (
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
                    borderRadius={COVER_PHOTO_RADIUS}
                  />
                </View>
              )}

              {/* Sayfa göstergesi (bullets) KALDIRILDI: kapakta tek foto var,
                  gezilecek bir galeri kalmadığı için gösterge de yanıltıcıydı
                  (hep ilk nokta dolu kalırdı). */}

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

              {/* Super Like Button — COLLAPSED duruş. Uygulamaya özel kalp
                  glyph'i (SuperLikeGlyph); lucide Heart değil.

                  Kapak fotoğrafının İÇİNDE, scroll içeriğinin parçası ve
                  zeminsiz: fotoğrafın üstünde kalbin kendi gradyanı ile ince
                  kenarı okunurluk için yetiyor.

                  EXPAND EDİLİRKEN yerini aynı noktadaki cam butona bırakır
                  (aşağıda, ScrollWrapper'ın DIŞINDA) — çekme oranıyla sönerek.
                  Sticky duruşta kalp panel zemininin üstüne de binebildiği
                  için orada zemin şart; onu artık liquid glass kabuk taşıyor.

                  pointerEvents: expanded'ken görünmez olsa da hitSlop'u cam
                  butonun çevresinde dokunma yakalamaya devam ederdi. */}
              {!hideActions && !hideSuperLike && (
                <View
                  style={{
                    position: "absolute",
                    top: SUPER_LIKE_INSET,
                    right: SUPER_LIKE_INSET,
                  }}
                  pointerEvents={expanded ? "none" : "auto"}
                >
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
                      style={[
                        { width: SUPER_LIKE_SIZE, height: SUPER_LIKE_SIZE },
                        heartPullStyle,
                      ]}
                    >
                      {/* LitPlus tonlu gradient dolgu — kalp şeklinde maskelenir
                          (tek path tek renk aldığı için gradyanı MaskedView ile
                          veriyoruz). */}
                      <MaskedView
                        style={StyleSheet.absoluteFill}
                        maskElement={
                          <SuperLikeGlyph size={SUPER_LIKE_SIZE} color="black" />
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
                          <SuperLikeGlyph size={SUPER_LIKE_SIZE} color="black" />
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
                        size={SUPER_LIKE_SIZE}
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
                        gradients.swipeHeart (bkz. kalp / SuperLikeFlame). */}
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        className="font-bold"
                        // Punto/satır className'de DEĞİL: rozetin ölçüsü bu
                        // sayıdan türüyor (bkz. PremiumBadge), Tailwind sınıfına
                        // gömülü kalsa rozet sessizce ayrışırdı. Kapak ismi
                        // artık panel başlığının (30) ALTINDA — "kapak daha
                        // büyük" ilişkisi bilerek terk edildi.
                        //
                        // Foto üstünde, koyu perdenin üstünde duruyor →
                        // her iki modda SABİT beyaz (theme.text değil).
                        style={{
                          flexShrink: 1,
                          color: theme.onMedia,
                          fontSize: CARD_NAME_FONT,
                          lineHeight: CARD_NAME_LINE,
                        }}
                      >
                        {profile.displayName}
                        {ageSuffix}
                      </Text>
                      {profile.isPremium && (
                        // Zemin varsayılan (`colors.bg`) — MODLA DÖNER, açıkta
                        // beyaz koyuda #121212. Satırdaki isim foto üstü chrome
                        // olduğu için sabit beyazken rozet bilerek temaya bağlı.
                        <PremiumBadge fontSize={CARD_NAME_FONT} />
                      )}
                    </View>
                  </Animated.View>

                  {/* University & Usage Purpose — expand olunca fade out.
                      üniversite yoksa hiç render etme → name'in altında
                      boşluk kalmasın, isim bottom'a otursun. */}
                  {universityLabel && (
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
                          {universityLabel}
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
                          marginTop: universityLabel ? 0 : 6,
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
                            <CardSectionBox
                              // CAM DEĞİL, ve bu kalıcı bir karar: bu piller
                              // `pillsAnimStyle` ile SÖNEREK gidiyor (kart
                              // açılırken opacity 1→0) ve cam, atasının
                              // opacity'si 1'in altına düştüğü anda hiç render
                              // edilmiyor — kütüphanenin belgelenmiş kısıtı,
                              // bkz. CardSectionBox'taki "ATA ZİNCİRİNDE
                              // OPACITY < 1 OLAMAZ" notu. Bir dönem cam
                              // yapıldı; "bazı camlar gelmiyor" belirtisinin
                              // kaynaklarından biri buydu.
                              //
                              // Cam istenirse önce fade'i atadan almak gerekir:
                              // kapsülün sönmesi camın kendi "none" geçişiyle,
                              // içindeki yazı/ikonun sönmesi de ÇOCUĞA verilen
                              // opacity ile yapılmalı.
                              glass={false}
                              radius={999}
                              // Kenarlık yalnız camsız yolda: camda çerçeve
                              // kırılmayı öldürüyor.
                              fallbackStyle={{
                                borderWidth: 0.5,
                                borderColor: theme.hairline,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 6,
                                  // Ölçüler expanded panelin yaşam tarzı /
                                  // ilgi alanı pillerini izliyor (px 12 /
                                  // 14px); eskiden 16/12/13 idi ve aynı kart
                                  // açılıp kapanırken piller boyut değiştiriyor
                                  // gibi duruyordu. Dikey pay orada 6, BURADA
                                  // 10: kapak pilleri fotoğrafın üstünde
                                  // duruyor ve panelin sakin zemininde yeten
                                  // pay burada kapsülü inceltiyordu. Padding
                                  // Text'in kendisine değil satıra veriliyor,
                                  // yoksa ikon padding dışında kalıyor.
                                  paddingHorizontal: 12,
                                  paddingVertical: 10,
                                }}
                              >
                                {/* Üç dal: hobi emojisi (ilgi alanı
                                    pilleriyle aynı HobbyIcon — kutu 13px,
                                    oradaki notun aynısı), sembol, ya da
                                    HİÇBİRİ. İkonsuz dalda satırın `gap`i tek
                                    çocukla çalıştığı için etiket kapsülde
                                    kendi başına ortalı kalıyor, ek pay yok. */}
                                {thing.hobby ? (
                                  <View
                                    style={{
                                      height: 13,
                                      justifyContent: "center",
                                      alignItems: "center",
                                      overflow: "visible",
                                    }}
                                  >
                                    <HobbyIcon
                                      hobby={thing.hobby}
                                      size={13}
                                      color={theme.text}
                                      strokeWidth={1.5}
                                    />
                                  </View>
                                ) : thing.icon ? (
                                  <SFIcon
                                    name={thing.icon.sf}
                                    fallback={thing.icon.lucide}
                                    size={13}
                                    color={theme.text}
                                    strokeWidth={2}
                                    weight="semibold"
                                  />
                                ) : null}
                                <Text
                                  className="font-[600] text-[14px]"
                                  style={{ color: theme.text }}
                                >
                                  {thing.label}
                                </Text>
                              </View>
                            </CardSectionBox>
                          ),
                          })),
                        ]}
                      />
                    </Animated.View>
                  )}
                </View>
              )}

              {/* Ana fotoğrafın not kutusu — kapak fotoğrafının İÇİNDE, alt
                  kenarına yaslı (panel fotoları ile aynı yerleşim).
                  Chevron'un (bottom:30, 28px glif) üstünde duracak kadar
                  yukarıda; ikisi aynı köşeyi paylaşmıyor.

                  YALNIZ EXPANDED'ken görünür: collapsed'de bu alanı isim /
                  üniversite / ortak nokta pilleri dolduruyor. Onlar expand'de
                  fade out ediyor (nameAnimStyle · pillsAnimStyle), kutu da tam
                  o boşluğa fade in ediyor — yani kapağın alt bandı iki durumda
                  da tek bir katman taşıyor, üst üste binme yok. */}
              {!!onNote &&
                !previewMode &&
                allPhotos.length > 0 &&
                measuredCardHeight > 0 && (
                  <Animated.View
                    style={[
                      {
                        position: "absolute",
                        left: NOTE_BOX_COVER_INSET,
                        right: NOTE_BOX_COVER_INSET,
                        bottom: 74,
                        zIndex: 55,
                      },
                      coverNoteAnimStyle,
                    ]}
                    pointerEvents={expanded ? "box-none" : "none"}
                  >
                    {/* Diskin camsızlığı artık NoteBox'ın kendi kararı (bkz.
                        oradaki not) — burada ayrıca kapatmaya gerek yok. Zaten
                        kapatılmak ZORUNDAYDI: bu kutu `coverNoteAnimStyle` ile
                        sönerek geliyor (opacity 0→1) ve cam, atasının opacity'si
                        1'in altındayken hiç render edilmiyor. */}
                    <NoteBox
                      onPress={noteHandler(photoNoteTarget(0))}
                      onPhoto
                    />
                  </Animated.View>
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
                      if (expanded) handleCollapse();
                      else onExpandPress?.();
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
            )}

            {/* Heavy content (university, hobbies, location+map, vb.) sadece
                top card'da + isTopCard true olduktan 100ms sonra render →
                swipe sonu mount lag'i için defer. */}
            {isTopCard && profileReady && (
              /* Profile Info — ayrı kart görünümü: kendi borderRadius'u, foto
                 altında PROFILE_PANEL_GAP kadar boşluk. Zemin düz gri
                 (surface3: açıkta #E4E4E8,
                 koyuda #262626) — eskiden fotonun baskın renginden theme.bg'ye
                 inen bir LinearGradient vardı. */
              <Animated.View
                className="p-6 px-4"
                style={[
                  {
                    overflow: "hidden",
                    // Üst dolgu className'den ALINDI (bkz. PANEL_TOP_PAD):
                    // önizlemedeki nefes payı bu sayıdan türüyor, Tailwind
                    // sınıfı oradan okunamıyordu. Inline style className'i
                    // ezer, yani `p-6`nın 24'ü değil bu geçerli. DEĞER AYNI
                    // (32) — panelin içi kısılmıyor, yalnız kaynağı değişti.
                    paddingTop: PANEL_TOP_PAD,
                    // Üst dolguyla aynı gerekçe: `p-6`nın 24'ü yerine açık
                    // sayı (bkz. PANEL_BOTTOM_PAD).
                    paddingBottom: PANEL_BOTTOM_PAD,
                    borderRadius: 40,
                    borderCurve: "continuous",
                    // Üst köşeler KARŞISINDAKİ KENARLA aynı yarıçapta
                    // (COVER_PHOTO_RADIUS): panelin tepesi ile kapak
                    // fotoğrafının dibi birbirine bakıyor, iki eğri simetrik
                    // olsun. Bir ara kartın kabuğuyla aynı olsun diye 50
                    // verilmişti, kenarlarda daha da büyük bir boşluk
                    // okunuyordu. YARIÇAPI KÜÇÜLTEREK ARAYI KAPATMAYA ÇALIŞMA:
                    // denendi (20), panelin şekli değişiyor ve istenen bu
                    // değil — mesafeyi PROFILE_PANEL_GAP ayarlıyor.
                    //
                    // Önizlemede DÜZ (0): orada panel kartın TEPESİNDEN
                    // başlıyor, üstünde kapak yok — yuvarlak köşe de aradaki
                    // boşluk da kart zeminini panelin üstünde şerit/hilal
                    // olarak sızdırırdı. Dış şekli zaten kartın kendi yarıçapı
                    // kesiyor.
                    borderTopLeftRadius: previewMode ? 0 : COVER_PHOTO_RADIUS,
                    borderTopRightRadius: previewMode ? 0 : COVER_PHOTO_RADIUS,
                    marginTop: previewMode ? 0 : PROFILE_PANEL_GAP,
                    // Cam yolunda panel ŞEFFAF bir kap: altındaki blur'lu zemin
                    // (CardGlassBackdrop) baştan sona kesintisiz aksın. Kendi
                    // tülü YALNIZ önizlemede kalıyor ve orada da burada değil,
                    // ilk çocuktaki katmanda — dibe doğru sönebilmesi gerekiyor
                    // (bkz. PANEL_FADE_HEIGHT). Düz yolda eski gri zemin.
                    backgroundColor: glassPanel ? "transparent" : theme.surface3,
                    // Panelin ince kenarı KALDIRILDI (bkz. aşağıdaki not) —
                    // buraya `borderWidth` ekleme, o çizgi paneli zeminin
                    // üstünde ayrı bir levha gibi gösteriyordu.
                  },
                  profileInfoAnimStyle,
                ]}
              >
                {/* ── PANELİN KENDİ LEVHASI KEŞİF'TE YOK ────────────────────
                    Burada iki katman vardı ve ikisi birlikte panelin zeminden
                    KOPUK, ayrı bir levha gibi okunmasına sebep oluyordu:

                      • Tül — `panelVeil()` dolgusu (bg'nin ~%20 alfası), dibe
                        doğru PANEL_FADE_HEIGHT boyunca sönen.
                      • PANEL_EDGE — o levhanın ince kenarı: üst + iki üst köşe
                        yayı + iki yan, DİP YOK.

                    Kartın zemini zaten kapak fotoğrafının blur'lu hali
                    (CardGlassBackdrop) ve kendi perdesini taşıyor
                    (backdropScrim). Tül onun ÜSTÜNE ikinci bir perde koyup
                    kenarıyla çerçeveleyince "blur üstüne blur" çıkıyordu.
                    KALDIRILDI: panel artık şeffaf bir kap, altında baştan sona
                    tek ve aynı blur'lu zemin akıyor.

                    ÖNİZLEMEDE (Likes / Chat / Profil) TÜL DURUYOR — orada zemini
                    sheet çiziyor ve panelin kendi perdesi hâlâ kontrast taşıyor.
                    Kenar zaten `!previewMode` kapısındaydı, yani oraya hiç
                    girmiyordu.

                    Geri koyacaksan ikisini BİRLİKTE koy: kenar tek başına, artık
                    var olmayan bir levhanın etrafını çiziyor. */}
                {glassPanel && previewMode && (
                  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                    <View style={{ flex: 1, backgroundColor: panelVeil() }} />
                    {/* Alt rampanın rengi tülün ŞEFFAF hâli
                        (`withAlpha(bg, 0)`), düz `"transparent"` DEĞİL: o şeffaf
                        SİYAH demek ve açık modda rampanın ortası kirli griye
                        düşüyor. */}
                    <LinearGradient
                      {...(easeGradient({
                        colorStops: {
                          0: { color: panelVeil() },
                          1: { color: withAlpha(theme.bg, 0) },
                        },
                        extraColorStopsPerTransition: PANEL_FADE_STOPS,
                      }) as any)}
                      style={{ height: PANEL_FADE_HEIGHT }}
                    />
                  </View>
                )}
                {/* Alt zemin — ikon satırının hizasında surface3'ten
                    theme.bg'ye (açık modda beyaz) çözülüp düz devam eder.
                    İlk çocuk olarak duruyor: mutlak konumlu ama sonraki
                    kardeşlerinin ALTINDA boyanır, ikonlar üstünde kalır.
                    Rampa ikon çizgisinde BİTER, yukarı doğru uzar — o yüzden
                    top = satır y'si + üst boşluk - fade. easeGradient: düz iki
                    duraklı LinearGradient uçlarda görünür bir kesim bırakıyor,
                    çok duraklı bezier rampa iki ucu da eritiyor.

                    CAM YOLUNDA HİÇ ÇİZİLMİYOR: rampanın işi gri paneli sayfa
                    zeminine bağlamaktı, ikisi de kalktı — panel şeffaf, altında
                    baştan sona aynı blur'lu zemin var. Çizilseydi opak bir
                    dikdörtgen olarak o zemini örterdi. */}
                {!glassPanel && actionsTop != null && (
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
                {/* Önizlemede panelin kendi nefes payı — içerik sticky şeridin
                    altından başlasın (bkz. PREVIEW_HEADER_SPACE). */}
                {previewMode && <View style={{ height: PREVIEW_HEADER_SPACE }} />}

                {/* Önizlemede başlık bloğu BURADA HİÇ YOK — isim/yaş da,
                    "bugün aktif" ve "burada yeni" rozetleri de sticky şeritte,
                    tek satırda duruyor (bkz. CardStickyHeader). Şerit orada
                    scroll beklemeden açık doğuyor (`alwaysOpen`) ve kartın tek
                    başlığı; aynı bilgileri bir de panelin başında yazmak onları
                    üst üste iki kez göstermek olurdu. */}
                {previewMode ? null : (
                  /* Name + Age — expanded'ken kartın üst tarafında görünür
                     (photo overlay'deki name'i replace eder; o fade-out olur).
                     Premium ateşi collapsed başlıktakiyle aynı.

                     KUTUSUZ, bilerek — VE BU BİR KEZ DENENİP GERİ ALINDI, İKİ
                     KEZ: başlık, altındaki bölümlerle aynı malzemeden bir
                     kutuya girince panelin başlığı değil ilk bölümü gibi
                     okunuyor. İkinci denemede kutu bölümlerden ayrışsın diye
                     yarıçapı küçültüldü (32), genişliği içeriğe indirildi ve
                     altına fazladan nefes verildi; yine tutmadı. Zemine karşı
                     kontrastı ZEMİNİN KENDİ PERDESİ taşıyor
                     (CardGlassBackdrop > backdropScrim); panelin tülü artık
                     yalnız önizlemede var. Camla sarma. */
                <View
                  className="ml-4"
                  style={{
                    paddingHorizontal: 4,
                    gap: 4,
                    // İsmin ALT boşluğu. Üstteki PANEL_TOP_PAD (8) ile eşit
                    // DEĞİL ve eşitlemeye çalışma — iki ayrı sebeple:
                    //
                    // 1) OPTİK DÜZELTME. Boşluklar harflerden değil SATIR
                    //    KUTUSUNDAN ölçülüyor: isim 30px bold ve kutunun
                    //    tepesiyle harflerin tepesi arasında ~8px leading var.
                    //    O pay ÜSTTEKİ boşluğa ekleniyor, alttakine eklenmiyor
                    //    (aşağıda kutuyu descender dolduruyor). Bir süre ikisi
                    //    de 16 yazıyordu ve ekranda üst belirgin şekilde geniş
                    //    duruyordu; üst sayı bu yüzden leading kadar küçük.
                    // 2) İsim başlık, altındaki kutular gövde: aralarında
                    //    kutular arası ritimden (16) FAZLA nefes olsun diye
                    //    16 → 24 → 28. Yani 8 (üst) + ~8 (leading) ≈ 16 optik
                    //    üst, 28 optik alt.
                    //
                    // Not: profil "bugün aktif" ise ismin ÜSTÜNDE ayrıca yeşil
                    // ActivityStatus satırı çiziliyor (+~22px). O boşluk bu
                    // sayılarla ilgili değil, ayrı bir katman.
                    marginBottom: 28,
                  }}
                  // Sticky başlığın eşiği bu satırın alt kenarından geliyor.
                  onLayout={handleNameBlockLayout}
                >
                  {/* Satır foto üstündekiyle AYNI çiziliyor
                      (bkz. ActivityStatus). */}
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
                      className="font-bold"
                      // Punto/satır className'de DEĞİL: rozet bu sayıdan
                      // türüyor (bkz. PremiumBadge). text-3xl ile aynı ölçü.
                      //
                      // SABİT BEYAZ (`onMedia`, modla dönmez): isim panelin tek
                      // kutusuz metni ve altında blur'lu FOTOĞRAF var — kartın
                      // kapak üstündeki ismiyle aynı kural. Kutuların içindeki
                      // yazılar bundan ayrı: onlar camın üstünde chrome sayılıyor
                      // ve `theme.text` ile tema mürekkebini izliyor. (Başlık
                      // kutuya alınırsa bu satır da `theme.text` olmak zorunda —
                      // denendi, kutu geri alındı, mürekkep de geri alındı.)
                      style={{
                        flexShrink: 1,
                        color: theme.onMedia,
                        fontSize: PANEL_NAME_FONT,
                        lineHeight: PANEL_NAME_LINE,
                      }}
                    >
                      {profile.displayName}
                      {ageSuffix}
                    </Text>
                    {profile.isPremium && (
                      // Kapaktakiyle AYNI rozet: kart açılırken biri diğerinin
                      // yerini alıyor, ikisi ayrı görünürse geçiş sırıtıyor.
                      // Ölçü farkı yalnız puntodan (30 > 28).
                      <PremiumBadge fontSize={PANEL_NAME_FONT} />
                    )}
                    {showNewBadge && (
                      <NewMemberBadge
                        label={t("profile.card.newMember")}
                        compact
                      />
                    )}
                  </View>
                </View>
                )}

                {/* Ana fotoğraf — YALNIZ önizlemede (Likes / Chat / Profil).
                    Orada tam ekran kapak çizilmiyor (bkz. yukarıdaki not), ilk
                    fotoğraf akışın ilk bölümü — şeridin hemen altındaki ilk
                    blok. Diğer fotoğraflar aşağıdaki bölümlerin arasında,
                    sıraları bozulmadan devam ediyor.

                    Not kutusu yok: önizlemedeki bütün bölüm fotoğraflarıyla
                    aynı kural (bkz. SectionPhoto prop'ları). Pinch ile büyütme
                    ise AÇIK — o da hepsiyle aynı kural.

                    Top'a çarpma zoom'unu da BU blok taşıyor: Discover'da geri
                    bildirimi tam ekran kapak veriyor, önizlemede kapak hiç
                    çizilmediği için sinyalin (CardSheetScrollView → zoomImpact)
                    görsel karşılığı yoktu. Sadece ANA fotoğraf — aşağıdaki
                    bölüm fotoğrafları çarpma anında ekranda bile değil. */}
                {previewMode && allPhotos[0] && (
                  <SectionPhoto
                    uri={allPhotos[0]}
                    hideNote
                    zoomStyle={photoZoomStyle}
                  />
                )}

                {/* University & Department */}
                {profile.showUniversity && profile.departmentDisplay && (
                  <CardSectionBox
                    glass={glassPanel}
                    // Bu kutunun yarıçapı diğerlerinden bir tık küçük (38).
                    radius={38}
                    // ÜST MARJ YOK. Burada bir dönem `marginTop: -12` (eski
                    // `-mt-3`) vardı: ismin o zamanki `mb-10`unun 12'sini geri
                    // kısan snug pay. İsmin alt marjı artık PANEL_TOP_PAD'den
                    // okunuyor (bkz. oradaki not) ve doğrudan istenen boşluğu
                    // yazıyor — negatif pay onun üstüne binip ismin altını
                    // üstünden farklı yapıyordu. Geri koyma; boşluk isim
                    // tarafında ayarlanır. (Eski className: `p-4 py-9
                    // rounded-[38px] mb-4`.)
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 36,
                      marginBottom: 16,
                    }}
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
                          <View className="flex-col items-start gap-2 flex-1">
                            <Text className="font-semibold text-[21px]" style={{ color: theme.text }}>
                              {universityLabel}
                            </Text>
                            {/* Bölüm + sınıf yan yana: sınıf artık nokta
                                ayraçlı metin değil, bölümün SAĞINDA duran gri
                                kapsül. Uzun bölüm adı sarabilsin diye metne
                                flex-shrink veriliyor, pil ise kendi boyunda
                                kalıyor. Sınıf bilinmiyorsa pil hiç çizilmez. */}
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text
                                className="font-medium text-[17px] shrink"
                                style={{ color: theme.text }}
                              >
                                {profile.departmentDisplay}
                              </Text>
                              {yearOfStudyLabel ? (
                                <View
                                  style={{
                                    borderRadius: 999,
                                    borderCurve: "continuous",
                                    // Dolgu artık `hairline` yıkaması değil,
                                    // kartın DİĞER pilleriyle (ilgi alanları ·
                                    // yaşam tarzı · mesafe) aynı tema grisi:
                                    // aynı panelde iki farklı pil dili
                                    // istemiyoruz.
                                    backgroundColor: pillFill(theme.surface3),
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                  }}
                                >
                                  {/* Yazı `text`: açık modda siyah, koyu modda
                                      beyaz. Gri (textSecondary) DEĞİL — zemin
                                      zaten gri, ikisi birlikte okunmuyordu. */}
                                  <Text
                                    className="font-[600] text-[13px]"
                                    style={{ color: theme.text }}
                                  >
                                    {yearOfStudyLabel}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  </CardSectionBox>
                )}

                {/* 2. fotoğraf — üniversite ile "Burada ne arıyorum" arası. */}
                {extraPhotos[0] && (
                  <SectionPhoto
                    uri={extraPhotos[0]}
                    hideNote={previewMode}
                    onNotePress={noteHandler(photoNoteTarget(1))}
                  />
                )}

                {/* Kullanım amacı kartı KALDIRILDI: alan üründen çıktı,
                    `usagePurposeDisplay` artık response'ta dönmüyor. */}

                {/* İlişki niyeti — swipe kararının en belirleyici sinyali
                    olduğu için yaşam tarzı pilleri arasında kaybolmuyor,
                    kendi başlıklı bölümünde ve ilgi alanlarından ÖNCE
                    duruyor. */}
                {/* Kapı `display` DEĞİL etiketin kendisi: etiket artık yerel
                    haritadan da gelebiliyor, yani display boş gelse bile
                    enumName varsa bölüm basılabilir. */}
                {relationshipIntentLabel && (
                  <CardSectionBox
                    glass={glassPanel}
                    // Zemin niyete göre değişen gradyandı; kart içindeki diğer
                    // bölümlerle (yaşam tarzı, ilgi alanları) aynı yüzeye
                    // çekildi. (Eski className: `mb-4 p-4 py-8`.)
                    style={{
                      marginBottom: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 32,
                    }}
                  >
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
                  </CardSectionBox>
                )}

                {/* Lifestyle Info — ilişki niyeti BURADA DEĞİL, kendi
                    bölümünde (yukarı bkz. "Burada ne arıyorum"). */}
                {(profile.smokingStatusDisplay ||
                  profile.zodiacSignDisplay ||
                  profile.alcoholUsageDisplay ||
                  heightLabel ||
                  petPills.length > 0) && (
                  <CardSectionBox
                    glass={glassPanel}
                    // Eski className: `mb-4 p-4 py-8`.
                    style={{
                      marginBottom: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 32,
                    }}
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
                                // İki modda da gri dolgu, tonu moda göre:
                                // açıkta mesafe pilinin ("3 km uzakta") grisiyle
                                // AYNI token (surface4) — aynı panelde iki farklı
                                // gri tonu istemiyoruz; koyuda zeminden bir tık
                                // açık koyu gri. Saydam pil her iki zeminde de
                                // yalnız hairline'ıyla duruyor ve kayboluyordu.
                                //
                                // KOYUDA mesafe pili takip EDİLMEZ: orada dolgu
                                // beyaz (ink(1)) ve yazısı veil(1) ile birlikte
                                // çalışıyor; buradaki yazı theme.text olduğu için
                                // beyaz dolgu okunmaz hale gelirdi.
                                // İlgi alanları pilleriyle AYNI zemin.
                                backgroundColor: pillFill(theme.surface3),
                                borderWidth: 0.5,
                                borderColor: theme.border,
                              }}
                            >
                              {/* Ölçü ilgi alanı pilleriyle AYNI: px 12 / py 8
                                  ve ikon 13. Kapaktaki ortak nokta pilleri
                                  py 10'da kaldı (bkz. ilgi alanı pilindeki
                                  not).

                                  İkon 18 → 13: 18'de SFIcon çerçevesi 14px'lik
                                  metnin satır kutusundan yüksekti ve pil ilgi
                                  alanı pillerinden bir tık uzun çiziliyordu.
                                  13'te iki bölümün pilleri birebir aynı
                                  yükseklikte. Sembol emojiden optik olarak
                                  küçük kalıyor (SymbolView'ın çerçevesine
                                  scaleAspectFit ediliyor) — bu, ölçü
                                  eşitliği için kabul edilmiş maliyet. */}
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  paddingHorizontal: 12,
                                  paddingVertical: 8,
                                  gap: 8,
                                }}
                              >
                                <SFIcon
                                  name={sf}
                                  fallback={lucide}
                                  forceFallback={forceFallback}
                                  size={13}
                                  color={theme.text}
                                />
                                <Text className="font-[600] text-[14px]" style={{ color: theme.text }}>
                                  {label}
                                </Text>
                              </View>
                            </View>
                          ),
                        }))}
                    />
                  </CardSectionBox>
                )}

                {/* 3. fotoğraf — yaşam tarzı ile 1. prompt arası. */}
                {extraPhotos[1] && (
                  <SectionPhoto
                    uri={extraPhotos[1]}
                    hideNote={previewMode}
                    onNotePress={noteHandler(photoNoteTarget(2))}
                  />
                )}

                {/* Hiç prompt yoksa ilgi alanları yukarıdaki akışa
                    giremiyor (dayanağı 1. prompt kartı) → eski yerinde,
                    prompt bloğundan önce çizilir. */}
                {promptSections.length === 0 && interestsSection}

                {/* Prompt'lar — bio'nun yerini alan bölüm. Her cevap kendi
                    kutusunda, başlığı sorunun kendisi.

                    `promptDisplay` sunucuda İZLEYİCİNİN diline çözülmüş geliyor
                    (diğer `*Display` alanlarıyla aynı kural), `answer` ise ham.
                    Alan gelmeyen kayıt çizilmiyor: katalogdan çözmek için karta
                    bir query eklemek gerekirdi ve kart render bütçesi buna
                    uygun değil — sözleşme gereği alan zaten dolu gelir. */}
                {promptSections.map((prompt, index) => (
                  <Fragment key={`${prompt.promptKey}-${index}`}>
                  {/* Konum + 6. fotoğraf, SON prompt'un ÜSTÜNDE: konum ile
                      son prompt yer değiştirdi. */}
                  {index === promptSections.length - 1 && (
                    <Fragment>
                      {locationSection}
                      {photo6Section}
                    </Fragment>
                  )}
                  <CardSectionBox
                    glass={glassPanel}
                    // Not kutusu artık kutunun İÇİNDE (sağ altta) → alt boşluk
                    // her durumda kutunun kendisinde. Alt pay yatay payla AYNI
                    // (16): buton köşeye eşit uzaklıkta otursun, altında ikinci
                    // bir boşluk bandı kalmasın. Üst pay ayrı ve büyük (48) —
                    // orası başlığın nefes alanı.
                    // (Eski className: `mb-4 p-4 pt-12`.)
                    style={{ marginBottom: 16, padding: 16, paddingTop: 48 }}
                  >
                    <View className="flex-row items-center mb-2 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {prompt.promptDisplay}
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
                          name="quote.opening"
                          fallback={Pen}
                          size={PROMPT_QUOTE_SIZE}
                          color={theme.text}
                          // İlk satırın ortasına otursun: (satır − ikon) / 2.
                          // Türetilmiş — ikon büyüyünce hiza kendiliğinden
                          // düzeliyor, elle yazılmış bir pay bayatlamıyor.
                          style={{
                            marginTop:
                              (PROMPT_ANSWER_LINE_HEIGHT - PROMPT_QUOTE_SIZE) /
                              2,
                          }}
                        />
                        {/* Metrikler PromptsEditor'deki cevap alanıyla BİREBİR
                            aynı (25 / 600 / 32): kullanıcı cevabını düzenlerken
                            gördüğü boyutla kartta gördüğü boyut ayrışmasın. */}
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 25,
                            fontWeight: "600",
                            lineHeight: PROMPT_ANSWER_LINE_HEIGHT,
                            flex: 1,
                            flexShrink: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          {prompt.answer}
                        </Text>
                      </View>
                    </View>
                    {/* Not butonu prompt kutusunun İÇİNDE, sağ altta —
                        fotoğraflardaki yerleşimin aynısı: not hedefin içinde
                        durur, altına iliştirilmiş ayrı bir kontrol gibi değil.
                        Akışta (mutlak değil) → uzun cevaplarda metnin üstüne
                        binmiyor, kutu onun kadar uzuyor.
                        Negatif marj: bkz. NOTE_BOX_PROMPT_PULL. Efektif
                        boşluk ~6px.
                        Buton çizilmeyen girişlerde (kendi profil önizlemesi,
                        Likes, sohbet profili) yerine boşluk konuyor — yoksa
                        kutu bir anda daralıp cevap metni tabana yapışıyor.
                        Ölçü 52'lik DOKUNMA kabı değil işaretin kendisi
                        (NOTE_GLYPH_SIZE_PROMPT): boşlukta mürekkep yok,
                        hitbox'ın payını da bırakınca alt bant butonlu haline
                        göre şişkin duruyordu. */}
                    {!!onNote && !previewMode && !!prompt.promptKey ? (
                      <View style={{ marginTop: -NOTE_BOX_PROMPT_PULL }}>
                        <NoteBox
                          onPress={noteHandler(promptNoteTarget(prompt.promptKey))}
                        />
                      </View>
                    ) : (
                      <View
                        style={{
                          height: NOTE_GLYPH_SIZE_PROMPT - NOTE_BOX_PROMPT_PULL,
                        }}
                      />
                    )}
                  </CardSectionBox>
                  {/* İlgi alanları — 1. prompt ile 2. prompt'un arasında.
                      Eskiden prompt'ların TAMAMINDAN önce geliyordu; ilk
                      prompt kartıyla yer değiştirdi. Prompt yoksa bölüm
                      buradan hiç çizilmez, aşağıdaki fallback devralır. */}
                  {index === 0 && interestsSection}
                  {/* Prompt ARASI fotoğraf (4. ve 5.) — son prompt'un altına
                      düşmüyor, bkz. promptGapPhotos. */}
                  {promptGapPhotos.has(index) && (
                    <SectionPhoto
                      uri={extraPhotos[promptGapPhotos.get(index)!]}
                      hideNote={previewMode}
                      onNotePress={noteHandler(
                        photoNoteTarget(promptGapPhotos.get(index)! + 1),
                      )}
                    />
                  )}
                  </Fragment>
                ))}

                {/* Bio — GEÇİŞ FAZI FALLBACK'İ, yalnız hiç prompt yokken.
                    Lansmanda kimsenin prompt'u yok ama bir kısım kullanıcının
                    bio'su dolu; ikisini birden kesersek o kartlar boşalırdı.
                    Kullanıcı prompt doldurdukça bölüm kendiliğinden sönüyor,
                    backend Faz 4'te alanı düşürünce bu blok silinecek. */}
                {promptSections.length === 0 && profile.bio && (
                  <CardSectionBox
                    glass={glassPanel}
                    // Eski className: `mb-4 p-4 py-5 pt-8`.
                    style={{
                      marginBottom: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 20,
                      paddingTop: 32,
                    }}
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
                  </CardSectionBox>
                )}

                {/* Prompt yoksa son prompt kartı da yok → konum ve 6.
                    fotoğraf eski sıralarında (foto sonra konum) kalır. */}
                {promptSections.length === 0 && (
                  <Fragment>
                    {photo6Section}
                    {locationSection}
                  </Fragment>
                )}

                {/* Artakalan fotoğraflar (7. ve sonrası + prompt azlığından
                    yerleşemeyenler) — konumun altında, profil sırasını
                    koruyarak alt alta. Araya girecek bölüm kalmadı, aksiyon
                    satırından önceki son blok bunlar. */}
                {trailingPhotos.map(({ uri, index }) => (
                  <SectionPhoto
                    key={`extra-${index}`}
                    uri={uri}
                    hideNote={previewMode}
                    // `extraPhotos` ana fotoğrafı atlayarak başlıyor
                    // (allPhotos.slice(1)) → profildeki gerçek index +1.
                    onNotePress={noteHandler(photoNoteTarget(index + 1))}
                  />
                ))}

                {/* Action Buttons */}
                {showActionsRow && (
                  <View
                    onLayout={handleActionsLayout}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      // Tek düz satır: şikayet · X · tik · engelle. Kutular
                      // gliflerini sarıyor (aksiyonlar 75, moderasyon 36);
                      // daha önce 68'lik kutudan taşan 75px glif aradaki
                      // boşluğu göz için eşitsiz gösteriyordu.
                      // 36 pratik tavan: 222px kutu - 2*MODERATION_PULL +
                      // 3*36 = 310, en dar yaygın ekranın (375pt - 32 kenar
                      // boşluğu = 343) içinde kalıyor.
                      gap: 36,
                      paddingTop: ACTIONS_ROW_PADDING_TOP,
                      // Moderasyon ikonları artık bu satırın içinde; alt boşluk
                      // her hâlükârda burada kalıyor (içeriğin son öğesi bu).
                      paddingBottom: ACTIONS_ROW_PADDING_BOTTOM + insets.bottom,
                    }}
                  >
                    {/* Şikayet — X'in SOLUNDA. Dolgusuz (`flag`) bayrak; içi
                        boş glif ince kaldığı için `nosign` ile aynı ağırlığa
                        çekiliyor, yoksa yanında sönük duruyor. */}
                    {onReport && (
                      <ModerationIconButton
                        onPress={onReport}
                        label={t('profile.card.reportAccount')}
                        name="flag"
                        fallback={Flag}
                        strokeWidth={2}
                        weight="semibold"
                        pullToward="right"
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
                          color={actionGlyphColor}
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
                          color={actionGlyphColor}
                          strokeWidth={5}
                          weight="heavy"
                        />
                      </View>
                    </TouchableOpacity>
                    {/* Engelle — tikin SAĞINDA. */}
                    {onBlock && (
                      <ModerationIconButton
                        onPress={onBlock}
                        label={t('profile.card.blockAccount')}
                        name="nosign"
                        fallback={Ban}
                        strokeWidth={2}
                        weight="semibold"
                        pullToward="left"
                      />
                    )}
                  </View>
                )}
                {/* Aksiyon satırı YOKSA (PreviewModal hideActions ile açıyor)
                    moderasyon ikonları yaslanacakları X/tik olmadığı için kendi
                    satırında, ortalanmış olarak içeriğin en altında durur. */}
                {showModerationRow && (
                  <View
                    onLayout={handleActionsLayout}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 28,
                      paddingTop: ACTIONS_ROW_PADDING_TOP,
                      paddingBottom: ACTIONS_ROW_PADDING_BOTTOM + insets.bottom,
                    }}
                  >
                    {onReport && (
                      <ModerationIconButton
                        onPress={onReport}
                        label={t('profile.card.reportAccount')}
                        name="flag"
                        fallback={Flag}
                        strokeWidth={2}
                        weight="semibold"
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
                {/* Boş kuyruk — bkz. showPanelTail. Yalnız ÖLÇÜ taşır: alt
                    zemin rampasının başlangıcını (`actionsTop`) ve panelin alt
                    payını yukarıdaki iki satır veriyordu, ikisi de yokken panel
                    surface3'te bitiyor ve alt uçta bounce edince zemin rengine
                    geçiş hiç çizilmiyordu.
                    ÜST pay ikisiyle aynı (rampa hep aynı yerde başlasın), ALT
                    pay ise daha KISA: o satırlarda payın altında 75px'lik
                    butonlar duruyor ve boşluk onlarla birlikte okunuyor;
                    burada çizilecek bir şey yok, aynı payı bırakmak kartın
                    dibinde bomboş bir şerit bırakıyordu. */}
                {showPanelTail && (
                  <View
                    onLayout={handleActionsLayout}
                    pointerEvents="none"
                    style={{
                      paddingTop: ACTIONS_ROW_PADDING_TOP,
                      paddingBottom: PANEL_TAIL_PADDING_BOTTOM + insets.bottom,
                    }}
                  />
                )}
              </Animated.View>
            )}
          </View>
        </BounceScrollView>
      </ScrollWrapper>

      {/* Sticky başlık — paneldeki büyük isim şeridin altından kayıp gidince
          aynı isim burada belirir (bkz. CardStickyHeader).

          Scroll'un DIŞINDA, kart çerçevesine göre konumlu: burada kart sabit
          duruyor, kayan içerik. Sheet içindeki kartta (previewMode) durum TERS
          — orada kartın kendisi kayıyor, o yüzden şeridi sheet çiziyor ve bu
          dal hiç girmiyor (`scrollY` de zaten verilmiyor).

          Sırası önemli: ScrollWrapper'dan SONRA (içeriğin üstüne biner), cam
          butondan ÖNCE (buton camın üstünde kalır) ve zIndex YOK — zIndex
          verilseydi butonu da altına alırdı.

          Mount kapısı cam butonunkiyle aynı: arkadaki kart üstteki tarafından
          örtülü, orada BlurView + MaskedView kurmanın karşılığı yok. */}
      {!!scrollY && isTopCard && profileReady && (
        <CardStickyHeader
          profile={profile}
          scrollY={scrollY}
          triggerY={headerTriggerY}
          progress={expandAnim}
          // Kapağın dibindeki ok akıp gittiği için şeritte cam bir karşılığı
          // duruyor. Kapı `onExpandPress`: kartı kapatma yetkisi olmayan
          // girişlerde (varsa) buton da çizilmesin.
          onCollapse={onExpandPress ? handleCollapse : undefined}
          // Sol üstteki ok, sağ üstteki cam butonla aynı payda insin.
          topInset={cornerDrop}
          // Bandın kendi clip'i kabuğunkiyle aynı olmalı: şerit yalnız kart
          // TAM AÇIKKEN görünüyor, o yüzden sabit açık değeri yetiyor. 50'de
          // bırakılsaydı bandın köşesi kabuğunkinden yuvarlak kalır ve üst iki
          // köşede camın çizmediği ince bir dilim görünürdü.
          radius={CARD_EXPANDED_CORNER_RADIUS}
        />
      )}

      {/* Super Like Button — EXPANDED duruş: sticky. Scroll'un DIŞINDA, kart
          çerçevesine göre konumlu → panel altından akıp giderken buton sağ
          üstte asılı kalıyor. Kabuk kalpten büyük olduğu için köşe boşluğu da
          farklı (SUPER_LIKE_GLASS_INSET): iki şeklin MERKEZİ çakışıyor, geçiş
          yer değiştirme değil kabuk değiştirme gibi görünsün.

          Mount `profileReady` gate'inde: swipe'ın son karesinde yeni top kart
          doğarken bir SwiftUI host'u daha kurmak animasyon kuyruğuna biniyor.
          Buton o an zaten görünmez (expandAnim 0), 100ms sonra gelmesi
          hissedilmiyor — ilk çekmeye çoktan hazır olur.

          Yalnız TOP kart: cardExpandAnim global, arkadaki kartlar da bu bandı
          okur; onlar için native host kurmanın karşılığı yok (üstteki kart
          hepsini örtüyor). */}
      {!hideActions &&
        !hideSuperLike &&
        isTopCard &&
        profileReady &&
        onSuperLike && (
          <Animated.View
            style={[
              {
                position: "absolute",
                // Köşe diyagonalinin biraz altı, SABİT (bkz. cornerDrop).
                top: SUPER_LIKE_GLASS_INSET + cornerDrop,
                right: SUPER_LIKE_GLASS_INSET,
                width: SUPER_LIKE_GLASS_SIZE,
                height: SUPER_LIKE_GLASS_SIZE,
              },
              superLikeStickyStyle,
            ]}
            // Collapsed'ken görünmez ama hâlâ fotoğrafın üstünde duruyor —
            // kapalıyken dokunmayı altındaki serbest kalbe bırak.
            pointerEvents={expanded ? "auto" : "none"}
          >
            <SuperLikeGlassButton
              onPress={onSuperLike}
              label={t("discover.stats.superLikesLabel")}
            />
          </Animated.View>
        )}
    </Animated.View>
  );
}
