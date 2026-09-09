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
  useAnimatedReaction,
  useAnimatedRef,
  useDerivedValue,
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
  isNearBottom,
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
  scrollMax,
  topHitSpeed,
  expanded,
  children,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollY?: SharedValue<number>;
  /** Scroll'un alt sınırı (içerik − görünür alan) — pan momentumu clamp'ler. */
  scrollMax?: SharedValue<number>;
  /**
   * Scroll momentumla TEPEYE çarptığı andaki hız (px/frame) — kartı kapatma
   * kararının girdisi. Ölçüm burada, karar SwipeWrapper'da.
   */
  topHitSpeed?: SharedValue<number>;
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
      // Scroll'un alt sınırı — pan kendi momentumunu buraya CLAMP'liyor (bkz.
      // SwipeWrapper > drivingScroll). Burada ölçülüyor çünkü içerik yüksekliği
      // yalnız scroll event'inde geliyor.
      if (scrollMax)
        scrollMax.value = Math.max(
          0,
          e.contentSize.height - e.layoutMeasurement.height,
        );

      nearBottomSV.value = isNearBottom(
        y,
        e.contentSize.height,
        e.layoutMeasurement.height,
      );
      syncBounces(nearBottomSV.value);

      // Top'a çarpma: bu event'te 0'a indik, öncekinde inmemiştik ve momentum
      // sürüyordu (parmak ekranda değil). Şiddet = son iki frame'in en hızlısı;
      // clamp event'i hızı kırpabildiği için önceki frame de dikkate alınır.
      //
      // SONUCU DEĞİŞTİ: eskiden burada kapak fotoğrafına bir zoom darbesi
      // veriliyordu (impactIntensity → zoomImpactAnimation). Artık kartı
      // KAPATIYOR: aşağı doğru hızlı bir flick, scroll'u tepeye getirip
      // momentumuyla kartı kapalı hâline götürüyor — hareket scroll'un
      // sonunda durmuyor, aynı savrulmayla devam ediyor. Kararı SwipeWrapper
      // veriyor (bkz. oradaki topHitSpeed reaction'ı); burada yalnız ölçüm var.
      const speed = prevY.value - y;
      if (
        momentumSV.value &&
        y <= TOP_HIT_EPS &&
        prevY.value > TOP_HIT_EPS &&
        !justHitSV.value
      ) {
        justHitSV.value = true;
        if (topHitSpeed) topHitSpeed.value = Math.max(speed, prevSpeed.value);
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
    if (topHitSpeed) topHitSpeed.value = 0;
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
    topHitSpeed,
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
  cardChromeAnim,
  cardExpandAnim,
  resetCardExpandState,
} from "@/shared/services/uiBus";
import {
  DISCOVER_CARD_TOP_GAP,
  DISCOVER_HEADER_HEIGHT,
  EXPAND_SCRIM_ALPHA,
  discoverTabBarInset,
} from "@/features/discover/components/discoverHeaderMetrics";
import {
  GraduationCap,
  X,
  Check,
  Sparkles,
  Pen,
  PawPrint,
  MapPin,
  Languages,
  Flag,
  Ban,
  Ruler,
  type LucideIcon,
} from "@/shared/icons";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { easeGradient } from "react-native-easing-gradient";
import { getColors } from "react-native-image-colors";
import {
  colors as theme,
  gradients,
  ink,
  isLight,
  scrimAt,
  withAlpha,
} from "../../../shared/theme/colors";
// YÜZEY kapısı (`HAS_LIQUID_GLASS` değil): native modülün kendi sabitini okuyor
// ve `UIDesignRequiresCompatibility` bayrağını da sayıyor — CardSectionBox da
// aynı kapıdan geçiyor, piller onunla aynı cevabı görmek zorunda.
import { hasLiquidGlassSurface } from "@/shared/theme/glass";
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
import SelfieVerifiedBadge, {
  selfieBadgeSize,
} from "@/features/profile/components/SelfieVerifiedBadge";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import SuperLikeGlassButton, {
  SUPER_LIKE_GLASS_INSET,
  SUPER_LIKE_GLASS_SIZE,
  SUPER_LIKE_INSET,
  SUPER_LIKE_SIZE,
} from "./SuperLikeGlassButton";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_EXPANDED_CORNER_RADIUS,
  CARD_FACE_CORNER_RADIUS,
  CARD_HEADER_TITLE_BOTTOM,
  CARD_OPEN_CORNER_RADIUS,
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

const { height } = Dimensions.get("window");

/**
 * Kart kabuğunun ölçüm gelmeden kullanılan YEDEK yüksekliği.
 *
 * `height - 188` idi ("header çıkarıldı") ve artık yanlış: kabuk kapalı kartta
 * da açık kartın boyunda ve alt ucu ekranın dibinin altına taşıyor (bkz.
 * SwipeWrapper animatedStyle > `bottom`), yani ölçüsü tam olarak EKRAN BOYU.
 *
 * Yanlış yedek kartın ilk karesinde fotoğrafı ~190px kısa çiziyordu: ekran
 * iskeleti bitiyor, kart "fotoğraf üstte, altı boş" hâliyle bir kare görünüyor,
 * sonra onLayout gelince yerine oturuyordu.
 */
const CARD_BOX_FALLBACK_HEIGHT = height;

// Kapaktaki serbest kalp → sağ üstte ASILI KALAN cam buton geçişi
// (bkz. SuperLikeGlassButton). İkisi aynı noktada duruyor ve çekme oranı
// (cardExpandAnim) bu bantlarda ilerledikçe biri sönerken diğeri beliriyor:
// jest yarıda bırakılırsa geçiş de yarıda kalır, parmakla geri sarılabilir.
//
// Bantlar KASTEN üst üste biniyor (0.30-0.45): kesişimde iki katman da yarı
// saydam olduğu için tek bir şeklin kabuk değiştirmesi gibi okunuyor — arka
// arkaya kaybolan/beliren iki ayrı öğe gibi değil.
// Geçiş YALNIZ opaklıkla: bir dönem serbest kalp cam butonun içindeki glyph
// ölçüsüne doğru küçülüyordu (HEART_MORPH_SCALE), ama iki şekil aynı noktada
// olduğu için küçülme "kabuk değiştirme" değil "bir şey gitti, başka bir şey
// geldi" gibi okunuyordu. İkisi de ölçüsünü KORUYOR.
const HEART_MORPH_OUT_END = 0.45;
const HEART_MORPH_IN_START = 0.3;
const HEART_MORPH_IN_END = 0.8;

// Kapak fotoğrafındaki isim satırının puntosu. 36 → 32 → 28 küçüldü; rozet
// ondan TÜRETİLDİĞİ için sayı burada duruyor, JSX'te değil.
const CARD_NAME_FONT = 28;
// Satır kutusu ~1.14em. Rozetin hizası bu kutuya göre hesaplanıyor (aşağıda).
const CARD_NAME_LINE = 32;

// PANELİN BAŞLIK PUNTOSU KALDIRILDI (27/32 idi): panelin başında isim satırı
// yok, isim yalnız sticky şeritte ve puntosu orada (CardStickyHeader >
// TITLE_FONT).

// Premium işaretinin ölçüsü BU DOSYADA DEĞİL: `PremiumBadge` ismin puntosundan
// çıkarıyor (bkz. premiumBadgeFontSize). Buradaki iki punto sabiti onun tek
// girdisi.

// Kapak fotoğrafı ile profil panelinin arasındaki boşluk.
//
// ÖLÇÜ NEGATİF: panel kapağın ALT KISMININ ÜSTÜNE biniyor. Aşağıdan gelirken
// fotoğrafın dibini örtüyor; iki yüzey arasında boşluk değil örtüşme var.
//
// Bir tur pozitife (+16) çekilmişti: panel kapaktan ayrı bir sayfa olarak
// okunsun, arada bir nefes payı kalsın diye. Örtüşme o ayrımı kaybettirmiyor —
// panelin yuvarlak tepesi ve kendi blur zemini kapağın ÜSTÜNDE duruyor, yani
// sınır yine belli, yalnız iki yüzey birbirine giriyor.
//
// ÖLÇÜ TARİHİ (hepsi istek): −64 → −164 → −30 → −60 → −100. −64'te panelin ilk
// bölümü (üniversite kutusu) kapağın dibinin ALTINDA kalıyordu; −164 onu kapağın
// üstüne çıkardı ama fazla derine bindi (kapağın görünen alanından 164px
// gidiyordu); −30 ince kaldı, −60 da yeterli gelmedi. −100 yerleşen değer.
//
// Fark doğrudan panelin ilk kutusuna gidiyor — arada başka bir pay yok, panelin
// kendi üst dolgusu (PANEL_TOP_PAD) sabit.
//
// Örtülen bant kapağın kroması: isim + pill bloğu, "yukarı kaydır" ipucu. Panel
// oraya varana kadar onlar zaten çekilmiş oluyor (ikisi de aynı kanalda —
// bkz. cardChromeAnim), yani panel yazının üstüne binmiyor.
//
// SABİTİ OKUYAN HER ŞEY TÜRETİLMİŞ, elle eşlenen bir ikizi YOK: panelin
// marginTop'u (profileInfoAnimStyle), kapalı kartta bekleme mesafesi
// (panelSlideTravel) ve kapağın dibindeki gölgenin boyu hep buradan çıkıyor.
// Bir dönem sticky şeridin eşiği de bu sayıya bağlıydı ve "ikisi ayrışmasın"
// uyarısı buradaydı; o eşik kalktı, şerit artık kartın açılma oranıyla beliriyor
// (bkz. CardStickyHeader).
//
// Daha da negatife çekmenin bedeli: her piksel kapağın görünen alanından
// gidiyor ve fotoğrafın düz alt kenarını kırpmaya başlıyor.
const PROFILE_PANEL_GAP = -100;

/**
 * ── PANELİN TEPESİNDEKİ GEÇİŞ BANDI KALDIRILDI (2026-09-04, istek) ──────────
 *
 * Burada bir dönem iki yarılı bir "blend" vardı: kapak tarafında fotoğrafın
 * dibini eriten bir blur rampası, panel tarafında da örtüşme payı boyunca
 * (64px) blur + panelin yüzeyini getiren ikinci bir rampa. Kaldırıldı; yerine
 * kapağın dibinde YALNIZ BİR GÖLGE var (aşağıda). Panelin yüzeyi artık kendi
 * üst kenarından itibaren tam — iki yüzey birbirine karışmıyor, panel kapağın
 * dibine gölgesiyle oturuyor.
 *
 * Geri getirilecekse silinen katmanların tuzakları: (1) panel tarafındaki blur
 * kapak tarafındakinin yerine geçmiyor, ÜSTÜNE biniyor — maskesiz bırakılırsa
 * dikişte blur zıplıyor ve panelin yuvarlak üst kenarı ayrı bir levha gibi
 * çiziliyor; (2) banttaki zemin kopyası `contentFit="cover"` olduğu için kutu
 * ORANI panelin asıl zeminiyle eşleşmezse bant başka bir renge düşüyor (kopyanın
 * iç kutusu bu yüzden bant boyunda değil panel boyunda tutuluyordu).
 */

/**
 * ── KAPAĞIN DİBİNDEKİ GÖLGE KALDIRILDI (istek) ─────────────────────────────
 *
 * Burada iki sabit vardı (COVER_SHADOW_HEIGHT = 72, _ALPHA = 0.3): panelin
 * kapağa düşürdüğü gölge, fotoğrafın son bandını panelin üst kenarına doğru
 * koyultuyordu. Kapağın dibi artık gölgeyle değil ERİMEYLE bitiyor (alfa maskesi
 * + blur bandı, bkz. COVER_BOTTOM_MELT_HEIGHT).
 *
 * Geri istenirse render tarafındaki nota bak — orada tek gerçek kısıt yazılı:
 * gölgenin panelin kenarı altında kalan payı DÜZ DOLGU olmak zorundaydı
 * (panelin yuvarlak üst köşelerinin dışındaki çentikler için) ve o düz dolgu
 * erimeyle bağdaşmıyor.
 */

/**
 * Kapak fotoğrafının kabuktan taşan payı — iki ucunda da (px).
 *
 * Fotoğraf, kabuğun AÇIK hâlinden bu kadar daha uzun ve iki ucundan eşit birer
 * bant kırpılıyor. Kapalı kartta bir de kabuğun kendisi kısa olduğu için üst
 * uçtan `expandedLift` kadarı ayrıca kesik kalıyor; açılışta ortaya çıkan bant
 * o (bkz. photoRevealStyle).
 *
 * "Biraz": bu pay büyüdükçe fotoğraftan görülen alan daralıyor.
 */
const PHOTO_CROP = 24;

/**
 * Panelin, EKRANIN DİBİNİN de altında beklemesi için bırakılan fazladan pay.
 *
 * Panel kapalı kartta ekranın dışında durmalı ve açılışla birlikte aşağıdan
 * süzülüp kapağın altına yapışmalı — kapağın devamı değil, ondan ayrı bir
 * sayfa gibi. Bekleme mesafesi SABİT DEĞİL, hesaplanıyor (bkz.
 * panelSlideTravel): kartın dibi ile ekranın dibi arasındaki bant cihazın
 * safe-area'sına göre değişiyor ve sabit bir sayı kimi telefonda panelin ucunu
 * ekranın altında bırakıyordu.
 *
 * TRANSFORM DEĞİL MARGIN, bilerek: panelin içindeki cam kutular ata zincirinde
 * kimliksel olmayan bir transform gördüğü anda efektlerini hiç render etmiyor
 * (bkz. profileInfoAnimStyle notu). Margin bir layout prop'u — kutuların yerini
 * değiştirir, üstlerine dönüşüm katmaz.
 */
const PANEL_SLIDE_MARGIN = 40;

/**
 * Panelin ÜST köşelerinin yarıçapı — kendi kimliği olan bir sayfa olsun diye.
 *
 * Bir dönem 0'dı (düz): panel kapağın DEVAMI sayılıyordu, iki yüzeyin bakışan
 * kenarları da düz tutulmuştu. Panel artık aşağıdan gelip kapağın altına
 * yapışan ayrı bir yüzey; yuvarlak tepe onu kapaktan ayıran şeylerden biri.
 *
 * Yalnız panelin kendi kutusuna değil, arkasındaki zeminin KIRPMA KUTUSUNA da
 * veriliyor (bkz. backdropClipStyle): panel cam yolunda şeffaf, köşeleri
 * çizen aslında zeminin kırpılması.
 */
const PANEL_TOP_RADIUS = CARD_FACE_CORNER_RADIUS;

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
 * ── KAPAĞIN ALT BANDIYLA ÇAKIŞMA: ARTIK YOK ───────────────────────────────
 * Burada bir sınır hesabı vardı: PROFILE_PANEL_GAP negatifken panel kapağa
 * biniyordu ve ismin tepesi kapağın son 48px'inin ÜSTÜNE denk geliyordu — o
 * bandı kapağın kendi katmanlarıyla (ortadaki chevron, `bottom: 74`teki not
 * kutusu) paylaşmak zorundaydı. Çakışma dikeydeydi, yataydan kurtuluyordu:
 * isim solda, ok ortada. Bedeli uzun isimlerde ödeniyordu.
 *
 * PROFILE_PANEL_GAP pozitife dönünce (panel kapağın ALTINA indi) bant tamamen
 * ayrıldı: panelin hiçbir parçası kapağın üstüne binmiyor. Bu sabiti büyütmek
 * artık yalnız panelin İÇİNİ etkiliyor, kapaktaki hiçbir katmanla yarışmıyor.
 *
 * className'de DEĞİL burada: PREVIEW_HEADER_SPACE bu sayıyı okumak zorunda
 * (aşağıdaki not), Tailwind sınıfından okunamaz. Türetilmiş olduğu için bu
 * sayıyı küçültmek ÖNİZLEMEYİ ETKİLEMEZ: oradaki pay aynı miktarda büyür,
 * toplam sabit kalır.
 */
const PANEL_TOP_PAD = 28;

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
 * Panelin, scroll'un DİBİNDEN aşağı taşan zemin payı (px) — bounce içindir.
 *
 * Alt uçta bounce edildiğinde içerik yukarı kayıyor ve panelin altında kabuğun
 * kendi zemini açığa çıkıyordu: blur'lu foto düz bir çizgiyle kesilip yerini
 * koyu bir bant alıyordu. Panel bu pay kadar daha uzun çiziliyor, yani bounce
 * boyunca da kendi zemini görünüyor.
 *
 * `marginBottom` ile GERİ ALINIYOR (aşağıda): pay yalnız panelin çizimini
 * uzatıyor, scroll'un içerik yüksekliğini DEĞİL. Aksi halde dibe inince
 * ekranda o kadar boş alan kalırdı.
 */
const PANEL_BOUNCE_PAD = 180;

/**
 * Kapağın dibindeki rampanın boyu (px) — yazının durduğu bandı kapsar.
 *
 * İsim + pill bloğu fotoğrafın dibinden ~70px yukarıda başlıyor ve yukarı
 * doğru büyüyor (aktiflik satırı, üniversite pili); "yukarı kaydır" ipucu
 * daha aşağıda. Rampa ikisinin de üstünde bitmeli, yoksa yazının tepesi
 * perdesiz kalıp açık fotoğraflarda kayboluyor.
 *
 * Kısası geçişi sert bir şeride sıkıştırıyor, uzunu fotoğrafın alt yarısını
 * karartmaya başlıyor.
 */
const COVER_TEXT_RAMP_HEIGHT = 340;

/**
 * Kapağın TEPESİNDEKİ rampanın boyu (px) — durum çubuğu ile süper beğeni
 * kalbinin durduğu bandı kapsar.
 *
 * Kalp fotoğrafın tepesinden SUPER_LIKE_INSET kadar aşağıda ve kendi boyu
 * kadar yer kaplıyor; açık kartta bu bandın üstünde bir de durum çubuğu var
 * (kart ekranın tepesine kadar çıkıyor). Rampa ikisinin de altında bitmeli.
 */
const COVER_TOP_RAMP_HEIGHT = 230;




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
// Kapak fotoğrafının yarıçapı ARTIK BURADA DEĞİL: kabukla aynı sayı olmak
// zorunda (ikisi ayrışırsa üst köşelerde aradaki payda kart zemini görünüyor),
// o yüzden kart yüzünün tek kaynağı CARD_FACE_CORNER_RADIUS. Buradaki eski
// sabit 40'tı ve yalnız kapağı biliyordu.

/**
 * Kart yüzünün köşe yarıçapı, AÇILMA ORANINA bağlı: kapalıda 44
 * (CARD_FACE_CORNER_RADIUS), tam açıkta `openRadius` — Keşif'te
 * CARD_OPEN_CORNER_RADIUS (26), önizlemede CARD_EXPANDED_CORNER_RADIUS (35,
 * sheet'in clip'iyle eşleşmek zorunda).
 *
 * NEDEN AÇIKKEN DAHA KARE: açık kart ekranın kenarına dayanıyor ve 44 telefonun
 * köşe maskesinden yuvarlak kalıyor — dört köşede kartla ekran kenarı arasında
 * sayfa zemininden ince bir hilal görünüyordu. Gerekçenin tamamı
 * CARD_OPEN_CORNER_RADIUS'un notunda.
 *
 * ÇEKİŞE BAĞLI, süreye değil: kabuk ve kapak fotoğrafı bu tek fonksiyonu
 * okuyor, yani jest yarıda bırakılırsa köşe de yarıda kalıyor ve parmakla geri
 * sarılabiliyor. Doğrusal: köşe kartın büyümesiyle aynı hızda kareleşmeli,
 * kendi bandı olsaydı hareketin ortasında ayrı bir olay gibi okunurdu.
 *
 * KLEMP ŞART: cardExpandAnim yay ile oturuyor ve 1'i aşabiliyor; klempsiz köşe
 * varış noktasının altına inip bir an fazla kareleşirdi.
 */
function cardCornerRadius(progress: number, openRadius: number) {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  return CARD_FACE_CORNER_RADIUS + (openRadius - CARD_FACE_CORNER_RADIUS) * p;
}


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
// DÜZ (camsız) YOLDA zemin DOĞRUDAN `surface3/4`: iki modda da GRİ, yalnız
// polaritesi dönüyor (koyuda #262626, açıkta #E4E4E8). Bir dönem araya
// `pillFill()` giriyordu ve AÇIK MODDA pilleri fotoğraftaki not diskinin
// beyazına çekiyordu; o beyaz, bölüm kutusu da beyaza dönünce (bkz.
// CardSectionBox dolgusu) kutunun içinde kayboluyordu. Pil artık kendi
// kutusundan bir kademe koyu/açık gri, yani her iki modda da ayrışıyor.
// O YOLA beyaz/siyah bir dolgu GERİ GETİRME: kutu ve not diski zaten o renkte.
//
// CAM YOLUNDA (iOS 26+) dolgu `panelPillFill`ten geliyor — gerekçesi orada.
//
// RENDER SIRASINDA OKU (colors.ts mutasyon sözleşmesi) — bu yüzden `theme.x`
// modül seviyesinde bir sabite alınmıyor.
function distancePillColors(onGlass: boolean) {
  return {
    background: onGlass ? theme.bg : theme.surface4,
    border: ink(0.06),
    text: theme.text,
  };
}

/**
 * Açık paneldeki pillerin (ilgi alanları · yaşam tarzı · sınıf) DOLGUSU.
 *
 * CAM YOLUNDA NOT DİSKİYLE AYNI ZEMİN: `theme.bg` — koyuda siyah, açıkta beyaz.
 * Gerekçe kutunun kendisi: 26+'da bölüm kutuları berrak cam (`glassEffectStyle
 * "clear"`, dolgusuz) ve altlarında blur'lu fotoğraf akıyor. Gri pil orada
 * kendi zemini olan bir kapsül gibi değil, camın içinde asılı duran bulanık bir
 * leke gibi okunuyordu — camın kırdığı şey zaten yarı saydam bir gri. Not
 * diski (bkz. NoteBox > `fallbackStyle`) aynı sorunu KALICI olarak opak
 * siyah/beyazla çözüyor; piller de o dile bağlandı, kartta tek bir "işaret
 * yüzeyi" rengi olsun.
 *
 * KAPI SADECE SÜRÜM DEĞİL, `onGlass`: kutu gerçekten cam mı (`glassPanel &&
 * hasLiquidGlassSurface()`). Camsız yolda kutunun kendi dolgusu da `theme.bg`
 * — pil de oraya çekilirse kutunun içinde TAMAMEN kaybolur (yalnız 0.5'lik
 * hairline'ı kalır). Fotoğrafsız profil ve `profileReady` gelmemiş kart iOS
 * 26'da da o yola düşüyor, yani sürüm kapısı tek başına yetmiyor.
 *
 * RENDER SIRASINDA ÇAĞIR — palet mutasyona uğruyor (colors.ts sözleşmesi).
 */
function panelPillFill(onGlass: boolean): string {
  return onGlass ? theme.bg : theme.surface3;
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
 * ── PANELİN KENDİ YÜZEYİ KALDIRILDI ──────────────────────────────────────
 *
 * Burada `panelVeil()` vardı: cam yolunda panelin kendi tülü, `theme.bg`nin
 * ~%20 alfası. Panel artık İKİ BAĞLAMDA DA tamamen şeffaf — altındaki zemin
 * (CardGlassBackdrop) kesintisiz akıyor.
 *
 * Tarihçe, çünkü bir kez geri alınmıştı: tam şeffaflık bir dönem denenip
 * bırakılmıştı, gerekçe panelin yuvarlak üst köşelerinin ve kapakla arasındaki
 * boşluğun görünmemesiydi. O gerekçe panelin kendi kenarını göstermesi
 * gerektiği dönemdendi; bugün panel görünür bir kenarı olmayan şeffaf bir kap
 * ve kullanıcının gördüğü tek yüzey zemin.
 *
 * Kontrast gerekiyorsa panelin altına ikinci bir katman EKLEME — ayarlar
 * zeminde (CardGlassBackdrop) ve orası tek kaynak.
 */

/**
 * ── PANELİN ALT RAMPASI DA KALDIRILDI ─────────────────────────────────────
 *
 * `PANEL_FADE_HEIGHT` (160) ve `PANEL_FADE_STOPS` (24) buradaydı: panelin
 * tülünü dibine doğru söndüren bandın boyu ve durakları. Tül gidince rampanın
 * söndüreceği bir şey de kalmadı.
 *
 * Gerekçesi kayıt için: panel içerik bitince yuvarlak alt köşeleriyle sert
 * kesiliyordu, alt uçta bounce edilince o kenar sabit zeminle yan yana düşüyor
 * ve panel "zeminin üstüne yapıştırılmış ayrı bir levha" gibi duruyordu. Bugün
 * panel tamamen şeffaf, yani ortada eritilecek bir dikiş yok.
 */

/**
 * Kapağın dibindeki ERİME BANDI — açık kartta fotoğrafın son kaç pikseli
 * SÖNEREK bitiyor: bu bant YALNIZ ALFA. Bir dönem yanında maskeli bir
 * `BlurView` de vardı (dibe doğru artan bulanıklık) ve kaldırıldı — kenarı yok
 * eden şey zaten alfaydı, blur sadece son bandın içini yumuşatıyordu.
 *
 * SABİT, ama bir dönem `-PROFILE_PANEL_GAP`ten TÜRETİLİYORDU. Gerekçe şuydu:
 * örtüşme 164px'ken panelin ilk kutusu (üniversite) rampanın neredeyse
 * tamamını örtüyor, 50'lik bir rampanın yalnız son ~16px'i açıkta kalıyordu —
 * yani rampa çalışsa bile göze çarpan tek şey kapağın kenarıydı. Örtüşme
 * incelince o dayanak kalktı: kutu artık bandı örtmüyor, rampa baştan sona
 * görünüyor. Türetmeyi geri koyma, örtüşmeyle bu bandın alakası kalmadı.
 *
 * 50 → 80 (istek): erime kısa kalıyordu, kapak fazla ani bitiyordu. Sayıyı
 * büyütmek rampanın hem BOYUNU hem BAŞLANGIÇ NOKTASINI yukarı taşıyor — alfa
 * profili (MELT_MASK_OPEN_ALPHAS) orana göre serildiği için eğri aynı, yalnız
 * daha uzun bir mesafeye yayılıyor.
 *
 * Kapalı karttaki metin rampasıyla (COVER_TEXT_RAMP_HEIGHT = 340) karıştırma —
 * o bir okunurluk perdesi ve bambaşka bir bant.
 */
const COVER_BOTTOM_MELT_HEIGHT = 80;

/**
 * Erime maskesinin durakları ve TAM AÇIK hâlindeki alfaları.
 *
 * TEK ELEMAN, DEĞİŞEN `colors`: maskedeki gradyan hep mount kalıyor, açılma
 * oranıyla yalnız renk dizisi güncelleniyor (gerekçe CoverMeltBand'da —
 * elemanı takas etmek maskeyi bozuyor). Dizinin UZUNLUĞU HER KARE AYNI olmak
 * zorunda, yoksa durak sayısı değişince gradyan yeniden kuruluyor.
 *
 * Alfalar düz değil sönümlü: 50px'lik bir bantta düz iki duraklı gradyan bant
 * bant görünüyordu, bu eğri onu gizliyor.
 */
const MELT_MASK_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;
const MELT_MASK_OPEN_ALPHAS = [1, 0.86, 0.55, 0.22, 0] as const;

/**
 * Erimenin kaç kademede geldiği.
 *
 * NEDEN KADEMELİ, neden sürekli değil: maske native tarafta layer'ın `maskView`i
 * ve Reanimated'in UI thread'den yaptığı değişiklikler onu YENİDEN BOYATMIYOR
 * (bir tur denendi, hiç çalışmadı). Maskenin güncellenmesi için JS tarafında
 * yeniden render gerekiyor — yani her kare değil, sayılı adımda.
 *
 * SAYI UCUZ DEĞİL. Her adım yalnız küçük bir bileşeni render ediyor (bkz.
 * CoverMeltBand) ama maskeyi değiştirmek MASKELENEN KATMANI — kapağın tamamını —
 * yeniden kompozit ettiriyor. 12'ydi ve kart arka arkaya açılıp kapatılınca
 * gözle görülür şekilde kasıyordu; 6 aynı yumuşaklığı veriyor, maliyeti yarısı.
 * Büyütmeden önce açılışı arka arkaya birkaç kez dene.
 */
const MELT_STEPS = 6;

/**
 * Erime maskesinin dip bandı.
 *
 * AYRI BİLEŞEN, bilerek: açılış boyunca kendi state'i değişiyor ve yalnız bu
 * ağaç yeniden render oluyor. Gövdeyi SwipeCard'ın içine taşıma — orada her
 * adım kartın tamamını render eder.
 *
 * MODÜL SEVİYESİNDE TANIMLI OLMAK ZORUNDA. SwipeCard'ın içinde tanımlansaydı
 * her render'da yeni bir bileşen TİPİ doğar, maske her seferinde unmount/mount
 * olur ve tam da kaçındığımız şey (maskenin bozulması) geri gelirdi.
 */
function CoverMeltBand({
  expandAnim,
  height,
}: {
  expandAnim: SharedValue<number>;
  height: number;
}) {
  const [step, setStep] = useState(0);

  /**
   * DEĞER AYNIYSA STATE'E DOKUNMA. `runOnJS(setStep)` aynı sayıyla çağrılsa bile
   * React bileşeni bir kez daha render ediyor; aşağıdaki reaksiyon her render'da
   * yeniden kurulduğu için bu "render → yeniden kur → tekrar tetikle" döngüsüne
   * dönüşüyordu ve Keşif'te kart gözle görülür şekilde kasıyordu.
   */
  const applyStep = useCallback((next: number) => {
    setStep((prev) => (prev === next ? prev : next));
  }, []);

  useAnimatedReaction(
    () => {
      const p = Math.max(0, Math.min(1, expandAnim.value));
      return Math.round(p * MELT_STEPS);
    },
    (next, prev) => {
      if (next !== prev) runOnJS(applyStep)(next);
    },
    // BAĞIMLILIK DİZİSİ ŞART. Boş bırakılınca reaksiyon HER RENDER'DA yeniden
    // kuruluyor ve yeni kayıtta `prev` null'dan başlıyor → aynı adım için bile
    // callback bir daha koşuyor. Yukarıdaki eşitlik guard'ıyla birlikte döngüyü
    // kapatan ikinci kilit bu; ikisini de kaldırma.
    [applyStep],
  );

  // t=0 → her durak opak (maske düz, kapak keskin bitiyor: kapalı kartta
  // doğrusu bu, orada altında zemin değil kartın kabuğu var).
  // t=1 → MELT_MASK_OPEN_ALPHAS.
  const colors = useMemo(() => {
    const t = step / MELT_STEPS;
    const a = (i: number) =>
      `rgba(0,0,0,${(1 - t * (1 - MELT_MASK_OPEN_ALPHAS[i])).toFixed(3)})`;
    return [a(0), a(1), a(2), a(3), a(4)] as [
      string,
      string,
      string,
      string,
      string,
    ];
  }, [step]);

  return (
    <View
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, height }}
    >
      <LinearGradient
        colors={colors}
        locations={MELT_MASK_STOPS}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * ── KAPAĞIN DİBİNDEKİ SÖNME RAMPASI KALDIRILDI ──────────────────────────────
 *
 * Burada iki sabit vardı (COVER_BOTTOM_FADE_HEIGHT = 260, _STOPS = 24) ve bir
 * MaskedView, kapağın son 260px'ini siyahtan şeffafa indiriyordu: fotoğrafın
 * alt bandı yukarı doğru azalarak şeffaflaşıyor, arkasındaki blur'lu zemin
 * oradan sızıyordu. Panelin zemini kapağın altına "biniyor" gibi görünsün
 * diyeydi.
 *
 * Panel artık kapağa DEĞMİYOR: aşağıdan gelip kendi yuvarlak tepesiyle kartın
 * altına yapışan ayrı bir yüzey (bkz. panelSlideTravel · PANEL_TOP_RADIUS),
 * arada da gerçek bir boşluk var (PROFILE_PANEL_GAP). Eritilecek bir dikiş
 * kalmayınca rampanın tek etkisi fotoğrafın dibini soluk göstermek oluyordu.
 *
 * GERİ İSTENİRSE: rampa maskeyle yapılmalı, kopyayla değil — zeminin blur'lu
 * bir kopyasını kapağın üstüne çizip söndürmek denendi ve dikişte tonlar kaymış
 * duruyordu (kopya kapağın dikdörtgenine, zemin kartın çerçevesine göre `cover`
 * ölçekleniyor; aynı fotoğraf iki farklı kırpmayla çıkıyor).
 */

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
// (NOTE_DISC_SIZE). Rengi bölüm kutularınınkiyle AYNI — koyuda siyah, açıkta
// beyaz (`theme.bg`), yani işaretin (`text`) karşıtı: fotoğrafın altında ne
// varsa siluetin kenarı her zeminde tutuyor. Bir dönem yarı saydam bir yüzey
// grisiydi (veilSurface 0.92); kartın not ve bölüm yüzeyleri tek dile
// indirilince opaklaştı. Prompt kutusundaki kutuda disk YOK — orası fotoğraf değil,
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
// Diskin dolgusunun ALFASI KALDIRILDI (0.92 idi: altındaki fotoğraf bir tık
// sızsın diye). Disk artık bölüm kutularıyla aynı opak zeminde — kartın not ve
// bölüm yüzeyleri tek dil.
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
 * Kapaktaki not kutusu ile PANELİN ÜST KENARI arasındaki nefes payı.
 *
 * Kutunun `bottom`u doğrudan `PROFILE_PANEL_GAP`ten türüyor: panel kapağın son
 * |GAP| pikseline biniyor ve kutu o bandın İÇİNDE kalırsa panelin ilk bölümü
 * (üniversite kutusu) üstüne biner. İkisi çakışmasın diye kutu panelin üst
 * kenarının YUKARISINA alınıyor, bu sayı da aradaki boşluk.
 *
 * Z-SIRASIYLA ÇÖZME. Bir tur panele `zIndex` verilerek kutu arkada bırakıldı;
 * çakışma görünmüyordu ama kutu hâlâ panelin altındaydı — istenen onu YUKARI
 * taşımaktı. Üstelik zIndex paneli kapağın bütün katmanlarının (erime bandı
 * dahil) üstüne çıkarıyor.
 *
 * ELLE SAYI YAZMA: `PROFILE_PANEL_GAP` her oynadığında kutunun da oynaması
 * gerekiyor, ikisi türetmeyle bağlı.
 */
const NOTE_BOX_PANEL_CLEARANCE = 12;

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
            // Dolgu bölüm kutularıyla AYNI: koyuda siyah, açıkta beyaz. Kutunun
            // kendi varsayılanı da bu, yani burada ezmeye gerek yok — ama
            // `fallbackStyle` bilerek duruyor: disk fotoğrafın üstünde ve
            // rengi orada bir tercih, varsayılanın yan etkisi değil.
            //
            // Bir dönem `veilSurface(0.92)` idi (altındaki fotoğraf bir tık
            // sızsın diye); kartın not/bölüm yüzeyleri tek dile indirilince
            // opak zemine geçti.
            fallbackStyle={{
              backgroundColor: theme.bg,
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
  /**
   * Kartın scroll'una dışarıdan YAZMA kapısı.
   *
   * SwipeWrapper'ın pan'i, kart tam açıldıktan sonra taşan hareketi doğrudan
   * buraya `scrollTo` ile yazıyor: parmak kaldırılmadan açılıştan scroll'a
   * geçilebilsin diye (bkz. oradaki drivingScroll). Verilmezse kart kendi
   * ref'ini kurar.
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /** Scroll'un alt sınırı — pan, kendi sürdüğü momentumu buna clamp'liyor. */
  scrollMax?: SharedValue<number>;
  /**
   * Scroll momentumla tepeye çarptığı andaki hız — SwipeWrapper bunu okuyup
   * kartı kapatıyor (aşağı flick, scroll'un sonunda durmayıp devam ediyor).
   */
  topHitSpeed?: SharedValue<number>;
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
  /**
   * Kapağın altındaki "yukarı kaydır" ipucunu hiç çizme.
   *
   * Adı `hideChevron` idi; orada bir ok vardı ve o ok metinle değiştirildi.
   * Çağıranların ikisi de (PreviewModal · LikerSwipeModal) kartı zaten AÇIK
   * gösteriyor, yani kaydırılacak bir şey kalmıyor.
   */
  hideExpandHint?: boolean;
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
  scrollRef,
  scrollMax,
  topHitSpeed,
  nativeScrollGesture,
  superLikeProgress,
  isTopCard = true,
  expanded = false,
  previewMode = false,
  hideExpandHint = false,
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

  /**
   * Kartın açılırken YUKARI kalktığı mesafe — SwipeWrapper'daki HEADER_COVER'ın
   * aynısı, aynı üç sayıdan türüyor. Ayrışırlarsa fotoğraf açılış boyunca
   * ekranda kaymaya başlar.
   */
  const expandedLift = previewMode
    ? 0
    : insets.top + DISCOVER_HEADER_HEIGHT + DISCOVER_CARD_TOP_GAP;

  /**
   * Kabuğun, KAPALI kartın göründüğü alanın altına taşan payı (bkz.
   * SwipeWrapper animatedStyle > `bottom`).
   *
   * Kutu hiç boyut değiştirmiyor; kapalı kartta da açık kartın boyunda ve alt
   * ucu ekranın dibinin altına taşıyor. İki pay:
   *   • tab bar — kapalı kart bar'ın üstünde bitiyor,
   *   • expandedLift — kutu açık kartın boyunda.
   *
   * Fotoğrafın yüksekliği bu payı DÜŞEREK hesaplanıyor: kutu nereye taşarsa
   * taşsın, fotoğrafın alt kenarı kapalı kartın göründüğü yerde durmalı.
   * Altında kalan bant kabuğun kendi zemini ve panelin geleceği alan.
   */
  const cardBottomDrop = previewMode
    ? 0
    : discoverTabBarInset(insets.bottom) + expandedLift;

  /**
   * Kapağın ALT BANDINDAKİ katmanların (isim + pill bloğu, "yukarı kaydır"
   * ipucu, kapak not kutusu) fotoğrafın dibinden yüksekliği.
   *
   * SIFIR: fotoğrafın alt kenarı artık kırpılmıyor, kapalı kartın göründüğü
   * yerde bitiyor — kaçılacak bir bant yok. (Fotoğraf yalnız ÜSTTEN taşıyor.)
   */
  const coverBottomInset = 0;

  // Kart frame'inin gerçek render yüksekliği — onLayout ile ölçülür (KAPALI
  // hâlin boyu; "en küçük ölçüm kazanır", bkz. aşağıdaki onLayout notu).
  const [measuredCardHeight, setMeasuredCardHeight] = useState(0);

  /**
   * Kapak fotoğrafının yüksekliği — kabuktan İKİ KIRPMA PAYI kadar uzun, ve
   * hiç değişmiyor.
   *
   * Kapalı kartta foto kabuğun içinde `-PHOTO_CROP` konumunda duruyor: üstten
   * ve alttan eşit birer bant kırpılıyor. Kart açılırken foto o payı geri
   * alarak yerine oturuyor (bkz. photoRevealStyle) — fotoğraf açılışın parçası
   * oluyor, kabuğun altında pasifçe beklemiyor.
   *
   * Yükseklik animasyonlu DEĞİL, konumu animasyonlu: fotoğrafın kendi layout'u
   * sabit kaldıkça altındaki panel de her karede yeniden yerleşmiyor.
   */
  /**
   * Panelin kapalı kartta bekleyeceği mesafe — ekranın dibinin altı.
   *
   * Panelin üst kenarı kapağın dibinden `PROFILE_PANEL_GAP` kadar yukarıda
   * (ölçü negatif, panel kapağa biniyor). Ekranın dibi ise kartın görünen
   * dibinden `cardBottomDrop − expandedLift` kadar aşağıda. Panelin oradan da
   * aşağıda kalması için ikisinin farkı + bir pay gerekiyor.
   */
  const panelSlideTravel =
    discoverTabBarInset(insets.bottom) -
    PROFILE_PANEL_GAP +
    PANEL_SLIDE_MARGIN;

  /**
   * AÇIK kartta görünen pencerenin boyu — fotoğrafın yüksekliği bu.
   *
   * Kapalı pencere bundan `expandedLift` kadar kısa; fark fotoğrafın iki
   * ucundan eşit kesiliyor (bkz. photoFitStyle). Açılışta pencere o payı geri
   * verdikçe iki uç da açılıyor.
   */
  const photoWindowOpen =
    (measuredCardHeight || CARD_BOX_FALLBACK_HEIGHT) -
    cardBottomDrop +
    (previewMode ? 0 : expandedLift);

  const photoHeight =
    (measuredCardHeight || CARD_BOX_FALLBACK_HEIGHT) -
    cardBottomDrop +
    (previewMode ? 0 : expandedLift + PHOTO_CROP);

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

  // Paneldeki isim satırının ölçümü KALDIRILDI: satırın kendisi yok (bkz.
  // aşağıdaki "BAŞLIK BLOĞU BURADA YOK" notu), dolayısıyla sticky şeridin
  // devraldığı bir eşik de yok — şerit kartın açılma oranıyla beliriyor.
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

  /**
   * ── AÇILMA YALNIZ ÜSTTEKİ KARTA UYGULANIR ─────────────────────────────────
   *
   * `cardExpandAnim` ve `cardChromeAnim` MODÜL SEVİYESİNDE, yani destedeki
   * BÜTÜN kartlar aynı değeri okuyor. Üstteki kart açıkken arkadaki de açık
   * geometriye geçiyordu: normalde üstteki onu örttüğü için görünmüyor, ama
   * kart yana kaydırılırken altından açık hâliyle çıkıyordu.
   *
   * Kanalları burada süzüyoruz — kaynağı düzeltmek yerine okuyucuyu kapatmak
   * bilerek: değer global olmak ZORUNDA (tab bar ve DiscoverScreen de aynı
   * sinyali okuyor, bkz. uiBus), kartın kendi kimliğini bilen tek yer ise
   * burası.
   *
   * `isTopCard` bağımlılıkta: kart üste geçtiği anda türetilmiş değer yeniden
   * kuruluyor ve global değeri izlemeye başlıyor.
   */
  const topExpandAnim = useDerivedValue(
    () => (isTopCard ? cardExpandAnim.value : 0),
    [isTopCard],
  );
  const topChromeAnim = useDerivedValue(
    () => (isTopCard ? cardChromeAnim.value : 0),
    [isTopCard],
  );

  const expandAnim = previewMode ? localExpandAnim : topExpandAnim;

  /**
   * Kapak KROMUNUN devri — panelin açılışından AYRI zamanlanıyor.
   *
   * Krom = kapağın üstünde duran ve açık kartta yeri olmayan katman: isim +
   * pill bloğu, "yukarı kaydır" ipucu ve serbest süper beğeni kalbi (o sönmez,
   * sağ üstteki cam butona dönüşür). Bu katman PARMAKLA devroluyor — çekiş
   * boyunca ilerler, eşikte biter — panel ise ancak BIRAKILINCA açılıyor.
   * Gerekçesi ve sıfırlanma yolları uiBus'ta (bkz. cardChromeAnim).
   *
   * Önizlemede ayrı bir kanal yok: orada kart zaten açık doğuyor, çekiş diye
   * bir şey de yok — expandAnim gibi bu da sabit 1 (localExpandAnim).
   */
  // Üstteki karta süzülmüş hâli (bkz. topChromeAnim) — ham global DEĞİL.
  const chromeAnim = previewMode ? localExpandAnim : topChromeAnim;

  /**
   * Üst şeridin (sağ üstte süper beğeni, solda isim satırı) durum çubuğundan
   * kaçmak için aldığı pay — bkz. CARD_CHROME_TOP_DROP.
   *
   * ÖNİZLEMEDE 0, çünkü orada bu katmanlar kartın İÇİNDE değil: sheet kendi
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
   * Kartın AÇIKKEN varacağı köşe yarıçapı. İki bağlamda farklı ve bu FARK
   * KASITLI: Keşif'te kartı kırpan bir şey yok, kenar doğrudan ekranın kenarı —
   * orada belirgin kare bir köşe isteniyor (26). Önizlemede kartı bir sheet
   * taşıyor ve sheet'in kendi clip'i 35; ayrışırlarsa köşede hilal kalır.
   */
  const openCornerRadius = previewMode
    ? CARD_EXPANDED_CORNER_RADIUS
    : CARD_OPEN_CORNER_RADIUS;

  /**
   * Kapak fotoğrafının köşeleri — DÖRDÜ DE aynı sayı, ve o sayı ÇEKİŞE bağlı:
   * kapalıda CARD_FACE_CORNER_RADIUS, tam açıkta openCornerRadius. Yani kart
   * açıldıkça köşe kareleşiyor (gerekçe: açık kart ekranın kenarına dayanıyor,
   * telefonun köşe maskesinden yuvarlak kalırsa kenarda hilal görünüyor —
   * bkz. cardCornerRadius).
   *
   * Alt iki köşe bir dönem 0'A kadar iniyordu; gerekçe "açık kartta panel
   * kapağın devamı, dibinde kesilmiş bir kenar okunmamalı"ydı. Panel artık
   * kapağın devamı DEĞİL: aşağıdan gelip altına yapışan ayrı bir yüzey (bkz.
   * panelSlideTravel). Kapağın dibi de o yüzden gerçek bir kenar — düzleşince
   * fotoğraf panelin üstünde köşesiz bir blok gibi duruyordu. Şimdiki iniş
   * 44→26, yani kenar hâlâ yuvarlak.
   *
   * Kabuk aynı sayıyı okuyor (cardFrameRadiusStyle): ayrışırlarsa aradaki
   * payda kart zemini (açık modda beyaz) görünür.
   */
  const photoBorderStyle = useAnimatedStyle(() => {
    const r = cardCornerRadius(expandAnim.value, openCornerRadius);
    return {
      borderTopLeftRadius: r,
      borderTopRightRadius: r,
      borderBottomLeftRadius: r,
      borderBottomRightRadius: r,
    };
  });

  /**
   * Kabuğun köşeleri — kapağın birebir aynısı (bkz. photoBorderStyle).
   * Ayrışırlarsa aradaki payda kart zemini (açık modda beyaz) görünür.
   *
   * ÖNİZLEMEDE de aynı formül: orada expandAnim sabit 1 (localExpandAnim) ve
   * varış noktası zaten sheet'in sayısı, yani sonuç sabit
   * CARD_EXPANDED_CORNER_RADIUS.
   */
  const cardFrameRadiusStyle = useAnimatedStyle(() => {
    const r = cardCornerRadius(expandAnim.value, openCornerRadius);
    return {
      borderTopLeftRadius: r,
      borderTopRightRadius: r,
      borderBottomLeftRadius: r,
      borderBottomRightRadius: r,
    };
  });

  /**
   * Fotoğrafı EKRANDA SABİT tutan pay.
   *
   * Kabuk açılırken yukarı kalkıyor (translateY −HEADER_COVER × p) ama alt
   * kenarı yerinde kalıyor, yani kırpma penceresi YUKARI doğru büyüyor.
   * Fotoğraf da kabuğun içinde tam ters yönde (aşağı) kayınca ekrandaki yeri
   * hiç değişmiyor: açılışta hareket eden şey fotoğraf değil, onu gösteren
   * pencere. Fotoğrafın üst bandı açığa çıkarken ALT kenarı hiç kıpırdamıyor.
   *
   * Eskiden yalnız `-PHOTO_CROP × (1−p)` idi: foto kabukla birlikte yukarı
   * kayıyor, yani alt kenarı da HEADER_COVER kadar yükseliyordu.
   *
   * MARGIN, transform değil: panel bu katmanın layout KARDEŞİ (aynı scroll
   * akışında, hemen altında). Transform verseydik foto kayar ama panel yerinde
   * kalır, aradaki boşluk açılış boyunca değişirdi. Margin ile ikisi birlikte
   * iniyor, aralarındaki PROFILE_PANEL_GAP sabit kalıyor.
   */
  const photoRevealStyle = useAnimatedStyle(() => {
    if (previewMode) return { marginTop: 0 };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return { marginTop: -PHOTO_CROP - expandedLift * (1 - p) };
  });

  /**
   * Fotoğrafı görünen pencerede DİKEYDE ORTALAYAN kaydırma.
   *
   * Fotoğraf açık pencerenin boyunda (photoWindowOpen). Kapalı kartta pencere
   * o kadar uzun değil, aradaki fark iki uca eşit dağılıyor: fotoğraf üstten ve
   * alttan aynı miktarda kesiliyor.
   *
   * AÇILIRKEN pencere üstten büyüyor ve fotoğraf o büyümenin YARISI kadar
   * yukarı kayıyor — ortalama noktası da o kadar yukarı gittiği için. Sonuç:
   * açığa çıkan alan üstte ve altta eşit paylaşılıyor, iki uç birden tam
   * hâline yaklaşıyor. Fotoğraf yerinde tutulsaydı yalnız üst uç açılırdı.
   *
   * Sadeleşmiş hâli: windowTop + (windowHeight − açıkPencere) / 2, yani
   * PHOTO_CROP + expandedLift × (1 − p) / 2.
   */
  const photoFitStyle = useAnimatedStyle(() => {
    if (previewMode) return { transform: [{ translateY: 0 }] };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return {
      transform: [
        { translateY: PHOTO_CROP + (expandedLift * (1 - p)) / 2 },
      ] as const,
    };
  });

  // Momentum top'a çarpınca fotoğrafın zoom-in yapıp yaylanarak dönmesi —
  // native top bounce'un yerini alan geri bildirim.
  //
  // KEŞİF'TE ARTIK SÜRÜLMÜYOR: açık kartta aşağı doğru bir flick'in cevabı
  // zoom değil, kartın KAPANMASI (bkz. SwipeWrapper > topHitSpeed). Aynı anda
  // ikisini yapmak "kart kapanıyor ama fotoğraf da büyüyor" gibi iki ayrı
  // hareket okunuyordu. Zoom yolu duruyor, çünkü kartı SARAN scroller'lar
  // (PreviewModal · LikerSwipeModal) sinyali dışarıdan sürmeye devam ediyor.
  //
  // Zoom SADECE foto katmanına uygulanır (bullets/blur/kalp/isim ayrı kardeş
  // katmanlar) → overlay'ler ölçeklenmez, foto clipping kutusu ve köşe
  // yuvarlaklığı sabit kalır.
  const localPhotoZoom = useSharedValue(0);
  const photoZoom = zoomImpact ?? localPhotoZoom;
  const photoZoomStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + PHOTO_ZOOM_MAX * photoZoom.value }] as const,
  }));

  // Sol alttaki isim + pill bloğu, açılışla BİREBİR kayboluyor: bir dönem ilk
  // %55'e sıkıştırılmıştı (önce gitsin diye), ama açılışın kendisi, panelin
  // gelmesi ve bu bloğun çekilmesi tek hareket olmalı — üçü de aynı oranı
  // okuyor (bkz. SwipeWrapper > "KROM AÇILIŞLA BİREBİR").
  const pillsAnimStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, chromeAnim.value));
    return {
      opacity: 1 - p,
      transform: [{ translateY: 10 * p }],
    };
  });

  // Name — pill bloğuyla aynı timing: ikisi tek bir blok gibi gidiyor.
  const nameAnimStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, chromeAnim.value));
    return {
      transform: [{ translateY: 10 * p }],
      opacity: 1 - p,
    };
  });

  /**
   * "Yukarı kaydır" ipucu.
   *
   * Eskiden burada bir chevron vardı ve `expandAnim` ile 180° dönüyordu: açık
   * kartta yukarı bakan bir ok olarak kalıp kapatma düğmesi işi görüyordu. Ok
   * da şeritteki cam karşılığı da gitti: kart açıkken kapatma yalnız aşağı
   * kaydırmayla oluyor, şeridin sol köşesi artık isme ait.
   *
   * İKİ AYRI SÜRÜCÜ, bilerek:
   *   • Kayma  → krom (çekişle birlikte hafifçe yukarı süzülüyor; metnin
   *     söylediği yön ile gittiği yön aynı olsun).
   *   • Sönme  → EXPAND, ve o da yalnız SON bantta (0.55→1). Bir ara krom
   *     söndürüyordu ve ipucu daha çekişin başında kayboluyordu; oysa hareket
   *     devam ederken ekranda kalmalı. Kromdan geç bir bant seçilmesinin
   *     sebebi bu: isim/pill çekilirken ipucu duruyor, ancak panel yolun
   *     yarısını geçince gidiyor.
   *
   * Bant kapak not kutusununkiyle aynı (coverNoteAnimStyle): ipucu giderken o
   * geliyor, ikisi kapağın alt bandında hiç üst üste binmiyor.
   */
  const expandHintAnimStyle = useAnimatedStyle(() => {
    const slide = Math.min(1, chromeAnim.value / 0.55);
    const open = Math.max(0, Math.min(1, (expandAnim.value - 0.55) / 0.45));
    return { opacity: 1 - open, transform: [{ translateY: -10 * slide }] };
  });

  /**
   * Açık kartın zemini düz gri panel (surface3) yerine ANA FOTOĞRAFIN BLUR'LU
   * HALİ mi (bkz. CardGlassBackdrop).
   *
   * BÖLÜM KUTULARI DA BUNA BAĞLI: bayrak ikisini birden yönetiyor — zemin
   * blur'lu fotoğrafsa kutular da cam. Doğrusu bu: fotoğrafsız profilde
   * blur'lanacak bir şey yok, kutular düz zeminin üstünde camdan farksız
   * kalırdı. Cam kutular bir tur KALDIRILIP (hepsi `glass={false}`, düz
   * `surfaceTranslucent`) geri açıldı (istek).
   *
   * SÜRÜM KAPISI KUTULARDA DEĞİL, kutunun İÇİNDE: `glass` verilse de
   * CardSectionBox 26 altında düz `surfaceTranslucent` yüzeyine düşüyor. Zemin
   * de aynı kapıyı okuyor (bkz. CardGlassBackdrop > blurViewPath), yani 26 altı
   * baştan sona ESKİ görünüm — düz kutular + fotoğrafın kendi blur'u + perde.
   *
   * ⚠️ 26+'DA CAM KUTULAR VE `BlurView`'lü ZEMİN BİRLİKTE ÇALIŞIYOR: kutuların
   * ALTINDA bir efekt view var ve bu, kutuların bir dönem "bir görünüp bir
   * kaybolan" hâle geldiği kurulumun ta kendisi. Belirti geri gelirse (bazı
   * kartlarda/bazı bölümlerde cam yok) suçlu kutular DEĞİL, zemin — önce
   * `blurViewPath`i kapat. Ondan sonra CardSectionBox'ın başındaki üç tuzağa
   * bak (ata opacity'si · ilk layoutSubviews · geri dönüşüm).
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
   * Bölüm kutuları GERÇEKTEN cam mı — panel pillerinin zeminini bu belirliyor
   * (bkz. `panelPillFill`). `glassPanel` tek başına yetmiyor: o yalnız "cam
   * İSTENİYOR mu" diyor, kutu 26 altında yine düz opak zemine düşüyor ve orada
   * pil de opak olursa kutunun içinde kaybolurdu. İki koşulun VE'si
   * CardSectionBox'ın kendi dalıyla birebir aynı.
   */
  const glassPills = glassPanel && hasLiquidGlassSurface();

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
  const profileInfoAnimStyle = useAnimatedStyle(() => {
    // Panel AŞAĞIDAN GELİYOR: kapalıyken kartın dibinin de altında bekliyor,
    // açılırken yukarı süzülüp kapağın altına yapışıyor (bkz.
    // panelSlideTravel). Bir dönem sabitti — panel kapağın DEVAMI olsun,
    // parmak ne kadar kaydırırsa o kadar görünsün diye. İstenen bunun tersi:
    // panel kapaktan ayrı, kendi kimliği olan bir sayfa.
    if (previewMode) return { opacity: 1, marginTop: 0 };
    // KROM KANALI, expandAnim DEĞİL: panel, kapağın sol altındaki isim/pill
    // bloğu çekilirken geliyor ve o blok tamamen gittiğinde yerine oturmuş
    // oluyor. Aynı kanala bağlı olmalarının sebebi bu — iki hareket tek bir
    // devir; expandAnim'e bağlıyken panel kromdan sonra da yol almaya devam
    // ediyor, açılış iki ayrı parçaya bölünüyordu (bkz. cardChromeAnim).
    const p = Math.max(0, Math.min(1, chromeAnim.value));
    return {
      opacity: 1,
      marginTop: PROFILE_PANEL_GAP + panelSlideTravel * (1 - p),
    };
  });

  /**
   * Zeminin (CardGlassBackdrop) görünürlüğü — KAPALI KARTTA ÇİZİLMEZ.
   *
   * Zemin kabuğa mutlak ve kabuk kapaktan UZUN: kapağın bittiği yerle kartın
   * dibi arasında bir bant var ve o bant kapalı kartta da ekranda — yüzen tab
   * bar'ın altında kalıyor, tab bar da yarı saydam. Zemin panelin içindeyken bu
   * görünmüyordu (panel scroll içeriğinin altında, ekran dışındaydı); kabuğa
   * taşınınca kapalı kartta o bandı bulanık fotoğrafla boyamaya başladı ve
   * tab bar'ın ardından sızıyordu.
   *
   * GÖRÜNÜRLÜK ZEMİNİN KENDİ ALFASINDA DEĞİL, ÜSTÜNDEKİ TÜLDE. Zemin hep
   * opaklık 1'de duruyor; onu kapatan şey üstüne konan düz renkli bir katman
   * (bkz. backdropVeilStyle) ve çekişle SÖNEN o katman.
   *
   * NEDEN BÖYLE: zeminin içinde tam ekran bir `BlurView` var ve kesirli alfa
   * onu her karede OFFSCREEN katmana zorluyor — kartı arka arkaya açıp kapatmak
   * gözle görülür şekilde kasıyordu. Bir tur alfayı 0/1'e sabitleyerek
   * çözülmüştü ama o da zemini çekişin ilk karesinde bir anda getiriyordu.
   * Düz renkli bir katmanın alfası ise ucuz: kompozit edilecek şey tek renk.
   *
   * TÜLÜN RENGİ `theme.bg`: zemin gelmeden önce orada zaten kabuğun kendi
   * zemini duruyordu, yani tül "yeni bir renk" değil, eski hâlin ta kendisi.
   *
   * PANELLE AYNI KANAL (chromeAnim), bilerek: zemin panelin bir parçası, onunla
   * gelip onunla gidiyor — ayrı bir eşik/zamanlayıcı iki katmanı ayrı düşürür.
   *
   * OPACITY BURADA SERBEST, panelinkinin aksine (bkz. profileInfoAnimStyle'daki
   * yasak): bu view cam kutuların ATASI DEĞİL, kabuk seviyesinde onların
   * KARDEŞİ. Alfa yalnız kendi ağacını etkiliyor.
   */
  const backdropVeilStyle = useAnimatedStyle(() => {
    if (previewMode) return { opacity: 0 };
    const p = Math.max(0, Math.min(1, chromeAnim.value));
    return { opacity: 1 - p };
  });

  /**
   * ── `panelEdgeBlendStyle` KALDIRILDI ──────────────────────────────────────
   *
   * Kapağın dibindeki gölgeyi panelin üst kenarına kilitleyen stildi (konum
   * panelin `marginTop` terimini birebir takip ediyor, opaklık çekişle
   * geliyordu). Gölgenin kendisi kaldırılınca tek okuyucusu kalmadı.
   *
   * Benzer bir şey gerekirse reçetesi buydu: kayma `panelSlideTravel * (1 - p)`
   * ve p KROM kanalından (chromeAnim) — expandAnim'e bağlanırsa momentum
   * yaylarında panelin kenarından kayıyor.
   */

  /**
   * Kapak ile panel arasındaki boşluğa inen karartma — üst şeridin perdesiyle
   * AYNI oran, sayı ortak dosyada (EXPAND_SCRIM_ALPHA; öbür okuyucu
   * DiscoverScreen > headerScrimStyle). İkisi ayrışırsa kartın üstü kararırken
   * arasındaki bant açık kalıyor ve kart iki parçaya bölünmüş gibi okunuyor.
   */
  const cardGapScrimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, expandAnim.value)) * EXPAND_SCRIM_ALPHA,
  }));

  /**
   * Kabuğun KAPALI karttaki taşma payını BOYANMAZ yapan alt inset.
   *
   * Kutu bilerek sabit ve ekranın dibinin altına taşıyor
   * (SwipeWrapper > `bottom: -(HEADER_COVER + tabBarInset)`). Gerekçesi orada
   * yazılı: alt kenar animasyonluyken `bottom` bir layout prop'u olarak
   * transform'dan bir kare geriden geliyor ve açılışta "kart alttan büyüyor"
   * görüntüsü çıkıyordu; kutu sabitlenince hem o titreme hem de
   * `measuredCardHeight`in oynaması bitti.
   *
   * O notta "görsel bir bedeli yok" deniyor ama cümle ALT KART için yazılmış.
   * Üstteki kart kaydırılırken DÖNÜYOR (±15°): ekranın dışında kalması gereken
   * pay yandan içeri giriyor ve kartın altına yapışmış ayrı bir zemin gibi
   * okunuyor.
   *
   * Düzeltme ÖLÇÜYE DEĞİL BOYAMAYA dokunuyor — kutu eskisi gibi sabit ve tam
   * boyunda ölçülüyor (photoHeight onun türevi; kabuk küçültülseydi fotoğraf
   * açılış boyunca kayardı, fee744e'nin çözdüğü titreme geri gelirdi). Yalnız
   * zemini taşıyan katman kapalıyken fotoğrafın dibinde bitiyor, açıldıkça
   * tam boya uzuyor.
   *
   * `expandAnim` ile sürülüyor (chromeAnim ile değil): pay geometrik — kutunun
   * ne kadarının görünür olduğu açılma oranının kendisi.
   */
  const cardPaintInsetStyle = useAnimatedStyle(() => {
    if (previewMode) return { bottom: 0 };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return { bottom: cardBottomDrop * (1 - p) };
  });

  /**
   * ── ZEMİNİN KIRPMA KUTUSU KALDIRILDI ──────────────────────────────────────
   *
   * Zemin kabuğun ilk çocuğuydu ve panelin üst kenarını takip eden bir kutu
   * onu panelin şekliyle sınırlıyordu (transform + ters transform). İki tarafı
   * ayrı ölçüldüğü için hiçbir zaman tam oturmadı:
   *   • Kutu kabuğun boyundan, panel scroll'un içinden geliyor — kabuk açılış
   *     boyunca büyürken (bottom animasyonu) kutu her karede yeniden ölçülüyor
   *     ve içindeki fotoğraf `cover` ile yeniden ölçekleniyordu: zemin sürekli
   *     "oynuyor" gibi görünüyordu.
   *   • Kutunun alt ucu ile zeminin alt ucu arasındaki fark, panelin ortasında
   *     düz bir çizgiyle kesilen bir bant bırakıyordu.
   *
   * Bir ara zemin PANELİN KENDİ ÇOCUĞU yapıldı: panelin `overflow`u onu
   * kırpıyordu, ölçü tek yerden geliyordu ve kutu derdi bitmişti — ama panel
   * scroll içeriğinin parçası olduğu için zemin de içerikle birlikte KAYIYORDU.
   * Bugünkü yer kabuk, kırpma kutusu YOK: kabuğun kendi `overflow`u ve köşe
   * yarıçapı yetiyor (bkz. render tarafındaki not).
   */

  // Kapağın dibindeki rampa — açılma oranıyla sönüyor. Spring overshoot
  // expandAnim'i geçici olarak >1 yapabiliyor → clamp.
  const bottomBlurAnimStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, 1 - expandAnim.value)),
  }));

  /**
   * ── KAPAĞIN DİBİNDEKİ ERİMENİN ANİMASYONLU BİR TARAFI KALMADI ─────────────
   *
   * Burada iki stil vardı ve ikisi de gitti:
   *   • `coverMeltAnimStyle` — açılırken gelen maskeli blur bandını sürüyordu.
   *     Bant kaldırıldı (istek): kapağın dibi artık bulanıklaşmıyor, YALNIZ
   *     sönüyor.
   *   • `coverMeltMaskStyle` — maskenin dip bandını kapatan katmanın opaklığı.
   *     İŞE YARAMADI: maske native tarafta layer'ın `maskView`i oluyor,
   *     Reanimated'in UI thread'den yaptığı değişiklik maskeyi yeniden
   *     boyatmıyor. Maske JS tarafında güncellenmek zorunda — bugün bunu
   *     `CoverMeltBand` yapıyor (açılma oranını okuyup KADEMELİ render, bkz.
   *     MELT_STEPS). Buraya animasyonlu bir stil geri koyma.
   *
   * Yani erime tek katman: alfa maskesi. Blur bir dönem yanındaydı ve tek
   * başına DENENDİĞİNDE yetmemişti — bulanıklaştırmak fotoğrafın kenarını yok
   * etmiyor, yalnız içini yumuşatıyor. Kenarı silen şey baştan beri alfaydı.
   */

  /**
   * Kapağın ÜST kenarından konumlanan katmanları görünür bantta tutan telafi.
   *
   * Fotoğraf kabuktan uzun ve `-(PHOTO_CROP + expandedLift × (1−p))` konumunda
   * duruyor (bkz. photoRevealStyle), yani kapalı kartta üst ucundan ~130px
   * kırpılıyor. `top` ile yerleşen her şey — serbest süper beğeni kalbi — o
   * kırpılan bantta kalıp hiç görünmüyordu. Aynı payı geri vererek katmanı
   * kartın görünen tepesine sabitliyoruz.
   *
   * ALT bandın böyle bir derdi yok: oradakiler `bottom` ile, yani fotoğrafın
   * dibinden ölçülüyor ve o kenar kırpılmıyor.
   */
  const coverTopAnchorStyle = useAnimatedStyle(() => {
    if (previewMode) return { transform: [{ translateY: 0 }] as const };
    const p = Math.max(0, Math.min(1, expandAnim.value));
    return {
      transform: [
        { translateY: PHOTO_CROP + expandedLift * (1 - p) },
      ] as const,
    };
  });

  // Kapak fotoğrafındaki not kutusu — isim/pill bloğu gittikten SONRA gelsin.
  // Onlar 0→0.55 aralığında kayboluyor (nameAnimStyle · pillsAnimStyle), bu da
  // 0.55→1 aralığında beliriyor: iki katman aynı bantta hiç üst üste binmiyor.
  // profileInfoAnimStyle'ı yeniden kullanmıyoruz — oradaki 80px'lik translateY
  // mutlak konumlu bir kutuyu fotoğrafın alt kenarının dışına taşırdı.
  const coverNoteAnimStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (expandAnim.value - 0.55) / 0.45));
    return { opacity: p, transform: [{ translateY: 8 * (1 - p) }] };
  });

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
  // Scroll referansı DIŞARIDAN gelebiliyor: SwipeWrapper'daki pan, kart tam
  // açıldıktan sonra taşan hareketi doğrudan bu ScrollView'a yazıyor (bkz.
  // oradaki drivingScroll). Verilmezse kart kendi ref'ini kullanır —
  // önizlemelerde pan diye bir şey yok.
  const localScrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollViewRef = scrollRef ?? localScrollRef;

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
    // KROM kanalında (expandAnim değil): kabuk değiştirme parmakla çekilirken
    // oluyor ve eşikte bitiyor, panel daha açılmadan — bkz. chromeAnim.
    const morph = Math.min(
      1,
      Math.max(0, chromeAnim.value / HEART_MORPH_OUT_END),
    );
    // Morph ÖLÇEĞE dokunmuyor: geçiş yalnız opaklıkla. Kalp küçülüp cam buton
    // büyüyerek yer değiştiriyordu; istenen, ikisinin aynı boyda kalıp
    // birbirine ÇAPRAZ SÖNMESİ. Kalan çarpan basılma geri bildirimi.
    const scale = 1 + p * 0.35;
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

  /**
   * Asılı cam buton — serbest kalbin tersi bantta belirir. Konumu burada YOK:
   * cornerDrop sabit olduğu için statik style'da duruyor (bkz. aşağıdaki
   * `top`), animasyonlu bir layout prop'u da olmuyor.
   *
   * GİZLEME ÖLÇEKLE, OPAKLIKLA DEĞİL. `opacity: p` ile gizleniyordu ve cam
   * yüzeyler alfayla KAYBOLMUYOR: alfa 0'da bile native taraf efekti çizmeye
   * devam ediyordu. Sonuç, kapalı kartta sağ üstte duran turuncu bir disk —
   * üstelik altındaki gradyanlı serbest kalbi de örtüyordu.
   *
   * Ölçek 0'a gitmiyor, 0.01'de duruyor: tam sıfır ölçekte katman kimi karede
   * hiç layout almıyor ve cam geri geldiğinde ilk `layoutSubviews` turunu
   * kaçırıp boş kalabiliyor (efekt o turda kuruluyor).
   */
  const superLikeStickyStyle = useAnimatedStyle(() => {
    const p = Math.min(
      1,
      Math.max(
        0,
        (chromeAnim.value - HEART_MORPH_IN_START) /
          (HEART_MORPH_IN_END - HEART_MORPH_IN_START),
      ),
    );
    return {
      // Geçiş OPAKLIKLA, boy sabit — serbest kalple çapraz sönüyorlar.
      opacity: p,
      // Ölçek yalnız bir AÇMA/KAPAMA anahtarı, animasyon değil: cam yüzeyler
      // alfa 0'da bile çizilmeye devam ediyor (kapalı kartta sağ üstte duran
      // turuncu disk oydu), o yüzden görünmezken katmanı ölçekle yok ediyoruz.
      // Tam sıfır değil: sıfır ölçekte katman kimi karede layout almıyor ve
      // cam geri gelirken ilk `layoutSubviews` turunu kaçırıp boş kalabiliyor.
      transform: [{ scale: p > 0.001 ? 1 : 0.01 }] as const,
    };
  });

  // ── STICKY BAŞLIĞIN EŞİĞİ KALDIRILDI ─────────────────────────────────────
  // Burada `headerTriggerY` vardı: kapak yüksekliği + panel payı + isim
  // satırının ölçüsünden hesaplanan, "isim şeridin altına indi" çizgisi. Şerit
  // o çizgiyi geçince açılıyordu (iOS'un large-title devri).
  //
  // Panelin isim satırı kalkınca (bkz. "BAŞLIK BLOĞU BURADA YOK") devredilecek
  // bir başlık da kalmadı: şerit artık kartın AÇILMA ORANIYLA beliriyor,
  // scroll'la değil. Eşik ölçen üç parça (nameBlockBottom, bu efekt ve
  // CardStickyHeader'daki `triggerY`) birlikte silindi.

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

  /**
   * KAPAKTAKİ RAMPALARIN YÜKLEME KAPISI KALDIRILDI (`coverRampsReady`).
   *
   * Rampalar fotoğraf `onLoadEnd` verene kadar çizilmiyordu; gerekçe blur'un
   * ilk kare(ler)de düz bir yüzey olarak görünmesiydi. Kendi ara karesini
   * yarattı: fotoğraf geliyor, rampalar bir kare sonra biniyor, o arada
   * kapağın alt bandı yarı saydam duruyordu.
   *
   * Gerekçesi de kalktı: kart artık fotoğrafı ÖNDEN yüklenmeden mount
   * edilmiyor (bkz. DiscoverScreen > firstPhotoReady), yani blur kurulurken
   * altında hazır bir fotoğraf var.
   */


  // Kapakta yalnız ilk foto durur. Kalanlar expanded panelde bölümlerin
  // arasına dağıtılıyor (2. → niyet ile yaşam tarzı arası, 3. → ilgi alanları
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
        // Bölüm kutuları CAM — bkz. glassPanel notu.
        glass={glassPanel}
        // Panelin zemininden ayrışsın diye arkasında hafif gölge.
        elevated
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
                    // Zemin iki modda da GRİ (surface3), yalnız polaritesi
                    // dönüyor — kartın diğer pilleriyle aynı dil.
                    //
                    // CAM YOLUNDA (iOS 26+) gri değil, not diskiyle aynı opak
                    // siyah/beyaz: bkz. panelPillFill.
                    backgroundColor: panelPillFill(glassPills),
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
        // Bölüm kutuları CAM — bkz. glassPanel notu.
        glass={glassPanel}
        // Panelin zemininden ayrışsın diye arkasında hafif gölge.
        elevated
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
                geliyor: düz yolda iki modda da gri yüzey + normal yazı,
                cam yolunda (26+) diğer panel pilleriyle birlikte not
                diskinin opak siyah/beyazı (bkz. oradaki not — sabit
                theme.onMedia / theme.mediaHairline modla dönmediği için
                KULLANILMIYOR).
                flexShrink: 0 → uzun ilçe/şehir adı pili ezmez,
                metin sarar. */}
            {distanceLabel && (
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: distancePillColors(glassPills).border,
                  backgroundColor: distancePillColors(glassPills).background,
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
                    style={{ color: distancePillColors(glassPills).text }}
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
          // Kart kabuğunun KAPALI yarıçapı — kapak fotoğrafı ve sürükleme
          // karartması aynı sayıyı okuyor (bkz. CARD_FACE_CORNER_RADIUS).
          // Açılırken dört köşe de buradan değil bir alttaki
          // cardFrameRadiusStyle'dan sürülüyor, bu yalnız ilk kare.
          borderRadius: CARD_FACE_CORNER_RADIUS,
          borderCurve: "continuous",
          overflow: "hidden",
          // Cam yolunda ÖNİZLEMEDE şeffaf: orada zemini sheet çiziyor ve kart
          // onun ÜSTÜNDE duruyor — opak kalırsa zemini komple örter. Keşif'te
          // zemin kartın İÇİNDE (bir alttaki CardGlassBackdrop), o yüzden burası
          // opak kalabiliyor ve foto yüklenene kadarki boşluğu da o dolduruyor.
          // ZEMİN CAM YOLUNDA BURADA DEĞİL (bkz. cardPaintInsetStyle): kabuk
          // kapalı kartta fotoğraftan uzun; opak bir zemin taşırsa aradaki pay
          // kart dönerken görünüyor. Cam yolunda zemini aşağıdaki boyama kutusu
          // taşıyor ve o kutu kapalıyken fotoğrafın dibinde bitiyor.
          //
          // `glassPanel` KAPALIYKEN burada kalmak ZORUNDA: o yolda boyama kutusu
          // hiç render edilmiyor (bkz. `glassPanel && !previewMode` kapısı),
          // kabuk şeffaf bırakılırsa kartın zemini komple kayboluyor.
          backgroundColor: glassPanel ? "transparent" : theme.bg,
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
      {/* Kabuğun zeminine inen KARARTMA — üst şeridinkiyle aynı perde
          (DiscoverScreen > headerScrimStyle), aynı oran.

          Görüldüğü tek yer kapak ile panel arasındaki boşluk: kapak ve panel
          bu katmandan SONRA çizildiği için onlar örtüyor, açıkta kalan yalnız
          o bant. Kart açılırken üst şerit kararırken aradaki boşluğun beyaz
          kalması, kartı iki parçaya bölünmüş gösteriyordu.

          Kart açıkken ekranın kalanı zaten kartla kaplı; bu yüzden perde
          kabuğun tamamına verilebiliyor, banda özel bir kutu gerekmiyor. */}
      {!previewMode && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "#000" },
            cardGapScrimStyle,
          ]}
        />
      )}

      {/* PANELİN ZEMİNİ — kapak fotoğrafının blur'lu hâli (bkz.
          CardGlassBackdrop).

          SCROLL'UN DIŞINDA, kabuğa mutlak: içerik üstünden akıp giderken zemin
          KIPIRDAMIYOR — ekrana çakılı bir duvar kâğıdı. Bir dönem panelin ilk
          çocuğuydu; orada panelin `overflow`u onu kırpıyordu ama panel scroll
          içeriğinin parçası olduğu için zemin de içerikle birlikte kayıyordu.

          KARARTMANIN ÜSTÜNDE, bilerek: zeminin kendi tabanı opak, yani bir
          önceki katmanı (kabuk karartması) örtüyor. Sırayı ters çevirirsen
          karartma açılışta panelin TAMAMINI koyultur — o perdenin işi kapakla
          panel arasındaki bant, panelin zemini değil.

          SCROLL'DAN ÖNCE: sonraki her şey (kapak, panel, cam kutular) bunun
          ÜSTÜNE çiziliyor. Kapak opak olduğu için kabuğun üst bandında zemin
          zaten görünmüyor; açıkta kaldığı yer panelin şeffaf gövdesi.

          KÖŞELERİ KENDİ TAŞIYOR (cardFrameRadiusStyle + overflow): zeminin
          tabanı OPAK ve dikdörtgen; yalnız kabuğun kırpmasına güvenilince
          kartın alt köşeleri açılırken kareleşmiş görünüyordu. Yarıçap kabuğun
          okuduğu AYNI stilden geliyor, ayrı bir sayı yazma — ayrışırlarsa köşede
          ince bir hilal kalır.

          Bu, panelin şeklini takip eden ESKİ kırpma kutusu DEĞİL: o kutu scroll
          içindeki panelden ölçülüyordu ve kabukla hiç senkron olmadığı için
          zemin açılışta "oynuyordu". Buradaki kutu kabuğun ta kendisi.

          KAPALI KARTTA GÖRÜNMEZ: kabuk kapaktan uzun ve aradaki bant yüzen tab
          bar'ın ardından sızıyordu. Zemini kapatan şey kendi alfası değil,
          üstündeki düz tül — ve o tül ÇEKİŞLE sönüyor, yani zemin parmakla
          birlikte geliyor (bkz. backdropVeilStyle).

          ÖNİZLEMEDE ÇİZİLMEZ: orada zemini sheet taşıyor ve kartın kendisi
          kayıyor (PreviewModal · LikerSwipeModal) — bkz. glassPanel notu. */}
      {glassPanel && !previewMode && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              overflow: "hidden",
              borderCurve: "continuous",
              // Kabuktan devraldı: fotoğraf yüklenene kadarki boşluğu bu
              // dolduruyor ve kapalı kartta fotoğrafın dibinde bitiyor.
              backgroundColor: theme.bg,
            },
            cardFrameRadiusStyle,
            cardPaintInsetStyle,
          ]}
        >
          <CardGlassBackdrop uri={allPhotos[0]} />
          {/* ÇEKİŞE BAĞLI TÜL — zemini kapalı kartta örten, parmakla sönen düz
              katman. Alfa BURADA, zeminin kendisinde DEĞİL: gerekçesi
              backdropVeilStyle'da (blur'lu bir katmanın kesirli alfası pahalı,
              düz rengin alfası ucuz). */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: theme.bg },
              backdropVeilStyle,
            ]}
          />
        </Animated.View>
      )}

      <ScrollWrapper nativeScrollGesture={nativeScrollGesture}>
        <BounceScrollView
          scrollRef={scrollViewRef}
          scrollMax={scrollMax}
          scrollY={scrollY}
          topHitSpeed={topHitSpeed}
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
                  // ZEMİN RENGİ BURADA DEĞİL, medya grubunun içinde: kabın
                  // kendi dolgusu maskenin DIŞINDA kalır ve kapağın dibi
                  // sönerken opak bir dikdörtgen olarak durur
                  // (bkz. COVER_BOTTOM_FADE_HEIGHT).
                  //
                  // KAPAĞIN KENARLIĞI YOK, bilerek: kapak zaten fotoğrafın
                  // kendi kenarıyla sınırlanıyor, üstüne çizgi koymak kartı
                  // çerçeveletiyordu. Panelin kenarı da sonradan kaldırıldı —
                  // kartta artık hiç hairline yok (bkz. yukarıdaki not).
                },
                photoBorderStyle,
                // Kırpılan iki bandın geri kazanılması (bkz. photoRevealStyle).
                photoRevealStyle,
              ]}
              className="relative"
            >
              {/* ── MEDYA GRUBU ────────────────────────────────────────────
                  Kapağın zemini, fotoğrafsız profilin gradyanı ve fotoğrafın
                  kendisi. Yani "kapak" olarak görünen her opak katman; kromu
                  (isim, piller, not kutusu, süper beğeni) bu grubun DIŞINDA.

                  DİPTEKİ SÖNME RAMPASI GERİ GELDİ (istek), ama 260px değil
                  COVER_BOTTOM_MELT_HEIGHT ve YALNIZ AÇIK KARTTA. Bir dönem
                  kaldırılmıştı ve gerekçesi "panel kapağa değmiyor, eritilecek
                  dikiş yok"tu; o dayanak kalktı — panel artık kapağın 164px
                  üstüne biniyor (PROFILE_PANEL_GAP) ve kapağın son pikseli ile
                  panelin zemini yan yana duruyor.

                  ÖNCE YALNIZ BLUR DENENDİ, YETMEDİ: bandı bulanıklaştırmak
                  (aşağıdaki erime katmanı) fotoğrafın içini yumuşatıyor ama
                  KENARINI yok etmiyor — kapak yine düz bir çizgide bitiyordu.
                  Kenarın erimesi için alfanın da inmesi gerekiyor, o yüzden
                  ikisi BİRLİKTE: burada maske (alfa), aşağıda blur.

                  MASKE AÇILMA ORANIYLA KADEMELİ GELİYOR (bkz. CoverMeltBand ·
                  MELT_STEPS). Bir tur `expanded` boolean'ıyla takas ediliyordu
                  ve erime tam açılışta BİR ANDA oluyordu; ondan önce de
                  Reanimated denendi ve maske hiç güncellenmedi.

                  KABIN ZEMİN RENGİ BU GRUBUN İÇİNDE OLMAK ZORUNDA (hemen
                  aşağıdaki `theme.surface` dolgusu): dışarıda kalsaydı maskenin
                  DIŞINDA kalır ve kapağın dibi sönerken opak bir dikdörtgen
                  olarak dururdu. */}
              <MaskedView
                style={{ flex: 1 }}
                maskElement={
                  <View style={{ flex: 1 }}>
                    {/* Bandın ÜSTÜ: düz opak, dokunulmuyor. */}
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: COVER_BOTTOM_MELT_HEIGHT,
                        backgroundColor: "#000",
                      }}
                    />
                    {/* DİPTEKİ BANT — açılma oranıyla opaktan şeffafa.
                        Kademeli, gerekçesi MELT_STEPS'te. */}
                    <CoverMeltBand
                      expandAnim={expandAnim}
                      height={COVER_BOTTOM_MELT_HEIGHT}
                    />
                  </View>
                }
              >
              <View style={StyleSheet.absoluteFill}>
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: theme.surface },
                  ]}
                />

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
              <Animated.View style={[StyleSheet.absoluteFill, photoZoomStyle]}>
                {allPhotos[0] && (
                  <Animated.View style={[StyleSheet.absoluteFill, photoFitStyle]}>
                  <PinchZoomable
                    uri={allPhotos[0]}
                    // Kaynağın köşesiyle AYNI: kopya açılırken köşe zıplamasın.
                    // Kapağın köşesi çekişle 44'ten iniyor (photoBorderStyle) ama
                    // burada SABİT varış değeri yetiyor: pinch yalnız
                    // expanded'ken etkin (bir alttaki `enabled`), yani kopya
                    // doğduğu anda kaynak zaten orada.
                    radius={openCornerRadius}
                    // Kapakta pinch YALNIZ expanded'ken: collapsed'de kapak
                    // kartın kendisi demek, oradaki iki parmak swipe/pull
                    // jestlerinin alanı.
                    enabled={!previewMode && expanded}
                    style={{ flex: 1 }}
                  >
                  <Image
                    source={{ uri: allPhotos[0] }}
                    // AÇIK PENCERENİN BOYUNDA, kutunun değil: fotoğraf açık
                    // kartta tam görünecek kadar uzun, kapalı kartta ise
                    // pencereden uzun kaldığı için iki ucundan eşit kesiliyor
                    // (konumu photoFitStyle ortalıyor). Kutuya (photoHeight)
                    // uzatılsaydı `cover` ölçeği yükseklikten alır, fotoğrafı
                    // yanlardan kırpıp büyütürdü.
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 0,
                      height: photoWindowOpen,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={allPhotos[0]}
                    // Üst kart decode kuyruğunda önceliklidir; alttaki kart
                    // düşük öncelikle arkada yüklenir (algılanan hız).
                    priority={isTopCard ? "high" : "low"}
                    transition={150}
                    // Yalnız modül seviyesindeki cache'e yazıyor: bu kart
                    // artık "yüklendi mi" diye bir STATE tutmuyor (kapak
                    // fotoğrafı hazır olmadan mount edilmiyor — bkz.
                    // DiscoverScreen > firstPhotoReady). Cache'in tek işi
                    // sonraki fotoğrafların prefetch'ini bir kez yapmak.
                    onLoadEnd={() => {
                      loadedPhotoUris.add(allPhotos[0]);
                    }}
                  />
                  </PinchZoomable>
                  </Animated.View>
                )}
              </Animated.View>

              {/* ── KAPAĞIN DİBİNDEKİ GÖLGE KALDIRILDI (istek) ───────────
                  Kapağın son bandını panelin üst kenarına doğru koyultan siyah
                  rampa + altındaki düz dolgu buradaydı. Kapağın dibi artık
                  gölgeyle değil ERİMEYLE bitiyor (maske + blur bandı) — iki
                  geçiş üst üste binince gölgenin düz payı erimenin altında
                  keskin bir çizgi olarak duruyordu, sonra maskenin içine alındı
                  ve bu sefer de dibi gereksiz koyultuyordu.

                  İKİNCİ KALDIRILIŞI: bir dönem aynı rampa "istenen gölge değil
                  BLEND" denip kaldırılmış, 2026-09-04'te istenerek geri
                  konmuştu, aynı gün erime eklenince tekrar kalktı.

                  GERİ İSTENİRSE bilinmesi gereken tek şey: alt payı DÜZ DOLGU
                  olmak zorundaydı (panelin yuvarlak üst köşelerinin dışındaki
                  çentiklerde fotoğraf açıkta kalıyor, gölge oraya inmezse o iki
                  köşe keskin duruyor) — ve o düz dolgu erimeyle bağdaşmıyor.
                  İkisini birlikte isteyen biri çıkarsa gölge de dibe doğru
                  sönmeli, sabit kalmamalı. */}
              </View>
              </MaskedView>

              {/* Sayfa göstergesi (bullets) KALDIRILDI: kapakta tek foto var,
                  gezilecek bir galeri kalmadığı için gösterge de yanıltıcıydı
                  (hep ilk nokta dolu kalırdı). */}

              {/* KAPAĞIN TEPESİNDEKİ RAMPA — yukarıdan aşağı AZALAN blur +
                  gölge. Altında durum çubuğu (açık kartta kart ekranın
                  tepesine çıkıyor) ve süper beğeni kalbi duruyor; ikisi de
                  sabit beyaz, açık bir fotoğrafta perdesiz okunmuyorlar.

                  Kapağın kırpılan üst payı kadar aşağı çekiliyor
                  (coverTopAnchorStyle) — yoksa kalple aynı şekilde görünmeyen
                  bantta kalır.

                  Kalpten ÖNCE çiziliyor: rampa onun altında kalmalı. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: COVER_TOP_RAMP_HEIGHT,
                  },
                  coverTopAnchorStyle,
                ]}
              >
                <MaskedView
                  style={{ flex: 1 }}
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
                  {/* Dipteki rampayla aynı reçete: perde HER İKİ MODDA DA KOYU
                      (üstündeki glifler sabit beyaz), blur da onun üstünde. */}
                  <LinearGradient
                    colors={[scrimAt(0.3), scrimAt(0.06)]}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Dipteki rampayla AYNI yoğunluk: 70'te üst bant alta göre
                      çok daha bulanıktı ve kartın tepesi ayrı bir yüzey gibi
                      duruyordu. */}
                  <BlurView
                    intensity={15}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                </MaskedView>
              </Animated.View>

              {/* KAPAĞIN DİBİNDEKİ RAMPA — kapalı kartta yazıyı taşıyan bant.
                  Fotoğrafın en altından yukarı doğru AZALARAK sönen bir blur +
                  koyu perde; isim + pill bloğu ve "yukarı kaydır" ipucu bunun
                  üstünde duruyor (ikisi de `theme.onMedia`, yani sabit beyaz —
                  altlarında açık bir fotoğraf olabilir).

                  Yüksekliği içeriğin bulunduğu bandı kapsıyor: blok fotoğrafın
                  dibinden ~70px yukarıda başlıyor (bkz. isim bloğunun `bottom`u),
                  rampa ondan da yukarıda bitiyor.

                  AÇILIRKEN SÖNÜYOR (bottomBlurAnimStyle): açık kartta kapağın
                  dibi panelle komşu ve o blok zaten çekilmiş oluyor — rampa
                  orada yalnız fotoğrafı karartırdı.

                  Konum `bottom: 0` yerine sabit absolute koordinat: collapse
                  anında parent height bir kare için değişse bile yerinde kalır.
                  Blok kendi bandından 30px daha uzun, yani dibi blursuz
                  kalmıyor. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: Math.max(0, photoHeight - COVER_TEXT_RAMP_HEIGHT),
                    left: 0,
                    right: 0,
                    height: COVER_TEXT_RAMP_HEIGHT + 30,
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
                  {/* Perde HER İKİ MODDA DA KOYU: fotoğraf açık modda da
                      fotoğraftır, beyaz perde altındaki fotoyu yıkayıp kartı
                      soluk gösteriyordu. Yoğunluk bilinçli düşük (0.06 → 0.30):
                      fotoğrafı bastırmadan yazıyı taşısın. */}
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

              {/* ── KAPAĞIN DİBİNDEKİ BLUR BANDI KALDIRILDI (istek) ──────
                  Açık kartta fotoğrafın son bandını aşağı doğru artan bir
                  bulanıklıkla bitiren maskeli `BlurView` buradaydı. Kapağın
                  dibi artık YALNIZ ALFA ile eriyor (bkz. erime maskesi,
                  COVER_BOTTOM_MELT_HEIGHT) — fotoğraf sönerek bitiyor, ayrıca
                  bulanıklaşmıyor.

                  Geri istenirse iki şey biliniyor olsun: (1) tek başına blur
                  YETMİYOR, kenarı yok eden şey alfa — ikisi bir dönem birlikte
                  duruyordu; (2) `tint` koyu ve yoğunluk tam olduğu için bandı
                  uzatmak kapağın dibinde belirgin bir koyu yıkama bırakıyor,
                  kısa tutulmalı. */}

              {/* KAPAĞIN DİBİNDEKİ GÖLGE ARTIK BURADA DEĞİL, MASKENİN İÇİNDE
                  (yukarıda, medya grubunun son çocuğu). Buraya geri koyma:
                  gölgenin alt payı DÜZ DOLGU ve maskenin dışındayken kapağın
                  dibinde keskin bir çizgi olarak duruyor — erime maskesi
                  fotoğrafı söndürse bile o dikdörtgen sönmüyordu. */}

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
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: SUPER_LIKE_INSET,
                      right: SUPER_LIKE_INSET,
                    },
                    // Kapağın kırpılan üst payını geri veriyor; olmadan kalp
                    // kapalı kartta görünmeyen bantta kalıyor.
                    coverTopAnchorStyle,
                  ]}
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
                </Animated.View>
              )}

              {/* Name and Age on Photo — sadece measuredCardHeight set olduktan
                  sonra render. Aksi halde photoHeight fallback (CARD_BOX_FALLBACK_HEIGHT)
                  ile başlayıp actual yüksekliğe geçince name yukarı sıçrar. */}
              {measuredCardHeight > 0 && (
                <View
                  className="absolute left-6 right-6"
                  // Taban className'den ALINDI (`bottom-[70px]`): kapak artık
                  // tab bar'ın altına iniyor, blok o payı da eklemek zorunda
                  // (bkz. coverBottomInset). Inline style className'i ezer.
                  style={{ position: "absolute", bottom: 70 + coverBottomInset }}
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
                    {/* Premium işareti yaşın sağında ve artık simge DEĞİL,
                        ürünün wordmark'ı: marka renginde küçük "plus+"
                        (bkz. PremiumBadge). Alev glyph'i yalnız zemini kendinden
                        belli yerlerde kaldı (toast, lit shop, fayda listesi). */}
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
                        // İşaretin rengi MODLA DÖNMÜYOR: marka tonu `litPlus`,
                        // satırdaki sabit beyaz isim gibi foto üstünde her iki
                        // modda aynı (bkz. PremiumBadge).
                        <PremiumBadge fontSize={CARD_NAME_FONT} />
                      )}
                      {/* Foto doğrulama rozeti — premium rozetinden AYRI bir
                          işaret, `isVerified`e de katılmıyor. Alan gelmezse
                          (backend'in bu sürümü yok) hiçbir şey çizilmiyor. */}
                      <SelfieVerifiedBadge
                        verified={profile.isSelfieVerified}
                        size={selfieBadgeSize(CARD_NAME_FONT)}
                      />
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
                              //
                              // ZEMİN AÇIKÇA VERİLİYOR: bu piller FOTOĞRAFIN
                              // üstünde duruyor, panelin içindeki bölüm kutuları
                              // gibi opak siyah/beyaz olamazlar — altındaki
                              // fotoğraf bir tık sızmalı. Kutunun varsayılanı
                              // (theme.bg) o yüzden burada eziliyor.
                              fallbackStyle={{
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

                  YALNIZ EXPANDED'ken görünür: collapsed'de bu alanı isim /
                  üniversite / ortak nokta pilleri dolduruyor. Onlar expand'de
                  fade out ediyor (nameAnimStyle · pillsAnimStyle), kutu da tam
                  o boşluğa fade in ediyor — yani kapağın alt bandı iki durumda
                  da tek bir katman taşıyor, üst üste binme yok.

                  KONUMU PANELİN ÜST KENARINDAN TÜRÜYOR, sabit bir sayı DEĞİL:
                  panel kapağın son |PROFILE_PANEL_GAP| pikseline biniyor ve
                  kutu bir dönem o bandın içindeydi (sabit `bottom: 74`), yani
                  panelin ilk bölümüyle çakışıyordu. Artık panelin üst kenarının
                  yukarısında duruyor (bkz. NOTE_BOX_PANEL_CLEARANCE) —
                  PROFILE_PANEL_GAP oynarsa kutu da onunla oynar. */}
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
                        // Panelin üst kenarı + nefes payı. GAP negatif (panel
                        // kapağa biniyor), eksisi o örtüşmenin boyu.
                        // +coverBottomInset: kapak tab bar'ın altına iniyor.
                        bottom:
                          -PROFILE_PANEL_GAP +
                          NOTE_BOX_PANEL_CLEARANCE +
                          coverBottomInset,
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

              {/* "Yukarı kaydır" ipucu — bottom-center, çekişin ilk anında
                  söner (bkz. expandHintAnimStyle). Name overlay gibi
                  measuredCardHeight gate'li → ilk render'da yanlış pozisyondan
                  jump etmesin.

                  DOKUNMA expanded'ken KAPALI: metin o an görünmez (krom
                  devrolmuş) ama kutusu yerinde duruyor, açık panelin üstünde
                  görünmez bir dokunma alanı bırakmayalım. Kart açıkken kapatma
                  yalnız aşağı kaydırmayla — şeritte cam bir buton YOK, o köşe
                  artık isme ait (bkz. CardStickyHeader > TITLE_LEFT_INSET). */}
              {!hideExpandHint && measuredCardHeight > 0 && (
                <View
                  style={{
                    position: "absolute",
                    // +coverBottomInset: kapak tab bar'ın altına iniyor.
                    bottom: 30 + coverBottomInset,
                    left: 0,
                    right: 0,
                    alignItems: "center",
                    zIndex: 60,
                  }}
                  pointerEvents={expanded ? "none" : "box-none"}
                >
                  <TouchableOpacity
                    onPress={onExpandPress}
                    hitSlop={16}
                    activeOpacity={1}
                    disabled={!onExpandPress}
                  >
                    <Animated.View style={expandHintAnimStyle}>
                      <Text
                        style={{
                          // Medya üstündeki her mürekkep onMedia ailesinden
                          // (bkz. colors.ts): burada "gri" = beyazın soluğu.
                          // Düz gri, fotoğrafın koyu bandında okunmuyor.
                          color: theme.onMediaMuted,
                          fontSize: 13,
                          fontWeight: "500",
                          letterSpacing: 0.2,
                        }}
                      >
                        {t("profile.card.expandHint")}
                      </Text>
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
                    // ZINDEX YOK, bilerek. Bir tur 60 verilmişti: kapağın not
                    // kutusu panelin ilk bölümünün üstüne biniyordu ve çözüm
                    // paneli onun üstüne çıkarmak sanılmıştı. Yanlış kaldıraç —
                    // kutu panelin ARDINDA kalmamalı, panelin ÜSTÜNDE (yukarı
                    // tarafında) DURMALI. Doğrusu konum işi ve not kutusunun
                    // kendi `bottom`unda çözüldü (bkz. NOTE_BOX_PANEL_CLEARANCE).
                    // Buraya zIndex koymak paneli kapağın tüm katmanlarının —
                    // erime bandı dahil — üstüne çıkarır.
                    // Üst dolgu className'den ALINDI (bkz. PANEL_TOP_PAD):
                    // önizlemedeki nefes payı bu sayıdan türüyor, Tailwind
                    // sınıfı oradan okunamıyordu. Inline style className'i
                    // ezer, yani `p-6`nın 24'ü değil bu geçerli. DEĞER AYNI
                    // (32) — panelin içi kısılmıyor, yalnız kaynağı değişti.
                    paddingTop: PANEL_TOP_PAD,
                    // Üst dolguyla aynı gerekçe: `p-6`nın 24'ü yerine açık
                    // sayı (bkz. PANEL_BOTTOM_PAD).
                    // +BOUNCE: panel bounce boyunca da kendi zeminini
                    // göstersin; marginBottom aynı payı scroll'dan geri alıyor
                    // (bkz. PANEL_BOUNCE_PAD).
                    paddingBottom:
                      PANEL_BOTTOM_PAD + (previewMode ? 0 : PANEL_BOUNCE_PAD),
                    marginBottom: previewMode ? 0 : -PANEL_BOUNCE_PAD,
                    // KEŞİF'TE DÖRT KÖŞE DE DÜZ (0). Panelin üst köşeleri bir
                    // dönem karşısındaki kenarla (kapağın eski 40'ı) simetrik
                    // tutuluyordu — kapağın dibi yuvarlaktı, panelin tepesi de
                    // ona bakıyordu. Kapağın ALT köşeleri açıkken düzleşince
                    // (bkz. photoBorderStyle) o simetri de düze döndü: panel
                    // kapağın devamı, iki yüzeyin bakışan kenarları düz.
                    // ARAYI KAPATMAK İÇİN YARIÇAPLA OYNAMA — mesafeyi
                    // PROFILE_PANEL_GAP ayarlıyor.
                    //
                    // ÖNİZLEMEDE ESKİ ŞEKİL: üstü düz (panel kartın
                    // TEPESİNDEN başlıyor, yuvarlak köşe kart zeminini şerit
                    // olarak sızdırırdı), altı 40.
                    borderRadius: previewMode ? 40 : 0,
                    borderCurve: "continuous",
                    // Üst köşeler YUVARLAK (bkz. PANEL_TOP_RADIUS): panel
                    // kapağın devamı değil, altına yapışan ayrı bir sayfa.
                    borderTopLeftRadius: previewMode ? 0 : PANEL_TOP_RADIUS,
                    borderTopRightRadius: previewMode ? 0 : PANEL_TOP_RADIUS,
                    // marginTop BURADA DEĞİL, profileInfoAnimStyle'da — sabit
                    // PROFILE_PANEL_GAP, açılırken de kapalıyken de aynı.
                    // Cam yolunda panel ŞEFFAF bir kap, İKİ BAĞLAMDA DA:
                    // altındaki blur'lu zemin (CardGlassBackdrop) baştan sona
                    // kesintisiz aksın. Panelin kendi tülü kaldırıldı — bir
                    // dönem önizlemede duruyordu ve aynı kart Keşif'te başka,
                    // önizlemede başka yoğunlukta görünüyordu. Düz yolda (cam
                    // yok) eski gri zemin.
                    backgroundColor: glassPanel ? "transparent" : theme.surface3,
                    // Panelin ince kenarı KALDIRILDI (bkz. aşağıdaki not) —
                    // buraya `borderWidth` ekleme, o çizgi paneli zeminin
                    // üstünde ayrı bir levha gibi gösteriyordu.
                  },
                  profileInfoAnimStyle,
                ]}
              >
                {/* ZEMİN BURADA DEĞİL, KABUKTA (yukarıda, ScrollWrapper'ın
                    hemen ÖNCESİNDE).

                    Bir dönem panelin İLK ÇOCUĞUYDU ve panelin `overflow`u onu
                    kırpıyordu; ölçü tek yerden geldiği için kurulumu basitti
                    ama panel scroll içeriğinin parçası olduğundan zemin de
                    İÇERİKLE BİRLİKTE KAYIYORDU. İstenen bunun tersi: zemin
                    ekrana çakılı bir duvar kâğıdı, içerik üstünden akıyor.
                    Kabuğa taşındı (bkz. oradaki not).

                    Buraya geri koyma; koyarsan scroll ile kayar. */}

                {/* ── PANELİN KENDİ TÜLÜ KALDIRILDI, İKİ BAĞLAMDA DA ───────
                    `panelVeil()` dolgusu (bg'nin ~%20 alfası) + dibe doğru
                    PANEL_FADE_HEIGHT boyunca sönen rampası buradaydı.

                    Keşif'te zaten kapalıydı: kartın zemini kapak fotoğrafının
                    blur'lu hali (CardGlassBackdrop) ve tül onun üstüne ikinci
                    bir perde koyunca "blur üstüne blur" çıkıyordu.

                    ÖNİZLEMEDE DE (Likes · Chat · Profil) KAPANDI (istek): oradaki
                    zemin de aynı bileşen — sheet onu kendi çiziyor (bkz.
                    LikerSwipeModal · profile/PreviewModal). Tül yalnız orada
                    kalınca aynı kart iki bağlamda iki farklı yoğunlukta
                    görünüyordu: Keşif'te fotoğrafın kendi rengi, önizlemede
                    onun bg ile yıkanmış hâli.

                    Zeminin bütün ayarları (malzeme yoğunluğu, ön-blur, tint)
                    CardGlassBackdrop'ta ve TEK KAYNAK — bir bağlama özel perde
                    eklemek o tekliği bozuyor. */}
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

                {/* BAŞLIK BLOĞU BURADA YOK — İKİ BAĞLAMDA DA.
                    İsim + yaş, premium işareti ve "bugün aktif" yalnız sticky
                    şeritte duruyor (bkz. CardStickyHeader): açık kartta kartın
                    tek başlığı o. Bir dönem Keşif'te panelin başında büyük bir
                    isim satırı vardı ve şerit onu scroll'la DEVRALIYORDU
                    (iOS'un large-title devri); aynı bilgi kartın iki yerinde
                    birden duruyordu, devir de kaldırıldı — şerit artık kartın
                    açılmasıyla birlikte beliriyor.

                    "Burada yeni" rozeti bu blokla birlikte gitti: o sinyal
                    kapalı kartta zaten var (ortak nokta pillerinin yanında) ve
                    şeride taşınmıyor (gerekçe CardStickyHeader'da). */}

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
                    // Bölüm kutuları CAM — bkz. glassPanel notu.
                    glass={glassPanel}
                    // Panelin zemininden ayrışsın diye arkasında hafif gölge.
                    elevated
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
                      // DİĞER KUTULARLA AYNI 16. Bir tur Keşif'te 40'a
                      // çıkarılmıştı ("panelin başı sıkışık" diye), sonra geri
                      // alındı: bu kutunun bölümler arası ritimden ayrılması
                      // için bir sebep yok. Panelin başındaki boşluğu ayarlaman
                      // gerekirse doğru knob burası değil — kenar için
                      // PROFILE_PANEL_GAP, panelin içi için PANEL_TOP_PAD.
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
                                    // istemiyoruz. Cam yolunda o ortak dil de
                                    // birlikte dönüyor (bkz. panelPillFill).
                                    backgroundColor: panelPillFill(glassPills),
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
                    // Bölüm kutuları CAM — bkz. glassPanel notu.
                    glass={glassPanel}
                    // Panelin zemininden ayrışsın diye arkasında hafif gölge.
                    elevated
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

                {/* 2. fotoğraf — "Burada ne arıyorum" ile yaşam tarzı arası.
                    SIRA DEĞİŞTİ (istek): bir dönem üniversite ile niyetin
                    ARASINDAYDI, yani panelin ilk fotoğrafı niyeti aşağı
                    itiyordu. Niyet swipe kararının en belirleyici sinyali
                    olduğu için öne alındı, fotoğraf onun altına indi.

                    Fotoğrafın not hedefi (photoNoteTarget(1)) SIRAYA DEĞİL
                    fotoğrafın kendi indeksine bağlı — yeri değişse de aynı
                    fotoğrafa yazılıyor. */}
                {extraPhotos[0] && (
                  <SectionPhoto
                    uri={extraPhotos[0]}
                    hideNote={previewMode}
                    onNotePress={noteHandler(photoNoteTarget(1))}
                  />
                )}

                {/* Lifestyle Info — ilişki niyeti BURADA DEĞİL, kendi
                    bölümünde (yukarı bkz. "Burada ne arıyorum"). */}
                {(profile.smokingStatusDisplay ||
                  profile.zodiacSignDisplay ||
                  profile.alcoholUsageDisplay ||
                  heightLabel ||
                  petPills.length > 0) && (
                  <CardSectionBox
                    // Bölüm kutuları CAM — bkz. glassPanel notu.
                    glass={glassPanel}
                    // Panelin zemininden ayrışsın diye arkasında hafif gölge.
                    elevated
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
                                // İlgi alanları pilleriyle AYNI zemin — cam
                                // yolunda ikisi birden not diskinin opak
                                // siyah/beyazına düşüyor (bkz. panelPillFill).
                                backgroundColor: panelPillFill(glassPills),
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
                    // Bölüm kutuları CAM — bkz. glassPanel notu.
                    glass={glassPanel}
                    // Panelin zemininden ayrışsın diye arkasında hafif gölge.
                    elevated
                    // Not kutusu artık kutunun İÇİNDE (sağ altta) → alt boşluk
                    // her durumda kutunun kendisinde. Alt pay yatay payla AYNI
                    // (16): buton köşeye eşit uzaklıkta otursun, altında ikinci
                    // bir boşluk bandı kalmasın. Üst pay ayrı ve büyük (48) —
                    // orası başlığın nefes alanı.
                    // (Eski className: `mb-4 p-4 pt-12`.)
                    // `alignSelf: stretch` BİLEREK: kutunun genişliği
                    // panelden gelsin, içeriğinden DEĞİL. İçerikten gelirse
                    // uzun cevap kutuyu panelin dışına taşırıyor ve satır
                    // ekranın kenarında kesiliyor.
                    style={{
                      marginBottom: 16,
                      padding: 16,
                      paddingTop: 48,
                      alignSelf: "stretch",
                    }}
                  >
                    {/* Sorunun kendisi. Satır kabı `flex-row` DEĞİL: tek
                        çocuklu bir satırda Text'in genişliği içeriğinden
                        çıkıyordu (Yoga'da satır çocuğu varsayılan olarak
                        büzülmez) ve uzun sorular sarmak yerine kutunun
                        dışına taşıp kesiliyordu. Blok kapta genişlik
                        kaptan geliyor, metin kendiliğinden sarıyor. */}
                    <View className="mb-2 px-4">
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
                        {/* Cevabın KABI ayrı bir View — Text doğrudan satırın
                            çocuğu DEĞİL. PromptsEditor'deki cevap alanının
                            yapısının aynısı ve sebebi ölçü: sarma genişliği
                            kabın kesin ölçüsünden geliyor, metnin kendi
                            içeriğinden değil. Text'e verilen `flex` ikonun
                            yanında bazı ölçüm turlarında tutmuyor ve satır
                            kutunun dışına taşıp kesiliyordu.
                            `minWidth: 0`: kap içeriğinin altına inebilsin —
                            yoksa uzun bir kelime kabı şişirir.

                            Metrikler PromptsEditor'deki cevap alanıyla BİREBİR
                            aynı (25 / 600 / 32): kullanıcı cevabını düzenlerken
                            gördüğü boyutla kartta gördüğü boyut ayrışmasın. */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 25,
                              fontWeight: "600",
                              lineHeight: PROMPT_ANSWER_LINE_HEIGHT,
                            }}
                          >
                            {prompt.answer}
                          </Text>
                        </View>
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
                    // Bölüm kutuları CAM — bkz. glassPanel notu.
                    glass={glassPanel}
                    // Panelin zemininden ayrışsın diye arkasında hafif gölge.
                    elevated
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
                        {/* Kap ayrı — gerekçesi prompt cevabındakiyle aynı:
                            sarma genişliği kabın kesin ölçüsünden gelsin. */}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 15,
                              lineHeight: 22,
                            }}
                          >
                            {profile.bio}
                          </Text>
                        </View>
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

      {/* KARTIN KENDİ İSKELETİ KALDIRILDI.
          Kart artık kapak fotoğrafı HAZIR OLMADAN mount edilmiyor (bkz.
          DiscoverScreen > firstPhotoReady), yani örtülecek bir yükleme anı yok.
          Buraya bir iskelet konduğunda kartın geometrisiyle (kabuk kartın
          göründüğü alandan uzun, kapak kutusu ondan da uzun ve yukarı
          kaydırılmış) aynı boya oturmuyor, ekranda fazladan bir gri dikdörtgen
          bırakıyordu. */}

      {/* Sticky başlık — AÇIK KARTIN TEK BAŞLIĞI: isim + yaş, premium işareti
          ve "bugün aktif" yalnız burada (bkz. CardStickyHeader). Kapaktaki
          büyük isim çekilirken bu geliyor; panelde artık bir isim satırı yok.

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
          // KROM KANALI, expandAnim DEĞİL: şerit kapaktaki büyük ismin YERİNİ
          // alıyor, o da bu kanaldan çekiliyor (nameAnimStyle). expandAnim'e
          // bağlanınca isim kapaktan gidiyor ama şerit yolun kalanını sürdüğü
          // için arada ismin hiç görünmediği birkaç kare kalıyordu.
          progress={chromeAnim}
          // Şeridin başlık satırı, sağ üstteki cam butonla aynı payda insin.
          topInset={cornerDrop}
          // Bandın kendi clip'i kabuğunkiyle aynı olmalı: şerit kartın ÜST
          // köşelerine oturuyor. Kabuktan YUVARLAK kalsaydı üst iki köşede camın
          // çizmediği ince bir dilim görünürdü — o yüzden kabuğun AÇIK değeri
          // (çekişle 44'ten buraya iniyor, bkz. cardCornerRadius). Sabit
          // olabiliyor çünkü şerit ancak kart açıkken görünür oluyor (opaklığı
          // `progress` ile çarpılı).
          radius={openCornerRadius}
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
