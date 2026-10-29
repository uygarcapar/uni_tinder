import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
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
  runOnJS,
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
import { PREVIEW_COVER_ASPECT } from "./cardPreviewGeometry";

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
/**
 * Tepeye varış geri bildirimi. `Light`: bu bir onay değil, bir SINIR işareti —
 * Fire eşiğindeki (Medium/Heavy aile) darbeyle karışmamalı.
 *
 * MODÜL SEVİYESİNDE: her kart kendi kopyasını kurmasın, worklet'ten `runOnJS`
 * ile çağrılan sabit bir referans olsun.
 */
function triggerTopHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

function BounceScrollView({
  scrollRef,
  scrollY,
  expanded,
  children,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  scrollY?: SharedValue<number>;
  /**
   * `scrollMax` ve `topHitSpeed` BURADAN KALKTI. İlki pan'in elle sürdüğü
   * scroll momentumunu clamp'liyordu, ikincisi scroll momentumla tepeye
   * çarpınca kartı kapatma kararının girdisiydi — ikisi de aç/kapa modeline
   * aitti (bkz. SwipeWrapper'ın başındaki not).
   */
  expanded: boolean;
  children: React.ReactNode;
}) {
  const [bounces, setBounces] = useState(false);
  // Worklet tarafındaki ayna — her event'te değil, sadece durum değişince
  // runOnJS/setState yapalım.
  const bouncesSV = useSharedValue(false);
  const nearBottomSV = useSharedValue(false);
  /**
   * İçerik ŞU AN tepede mi — tepeye varış haptic'inin mandalı.
   *
   * Bayrak şart: `onScroll` her karede geliyor ve tepede duran bir parmak 0
   * civarında salınıyor. Kapısız bırakılırsa haptic tek bir varışta arka arkaya
   * patlıyor. Yalnız GEÇİŞ anında (tepede değildik, tepeye geldik) tetikleniyor.
   */
  const atTopSV = useSharedValue(true);

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

      // TEPEYE VARIŞ — anlık haptic (istek). Kapağın başına dönmek kartın bir
      // "ucu"; scroll orada sessizce duruyordu.
      //
      // EŞİK 0 DEĞİL `TOP_HIT_EPS`: iOS bounce'ında offset 0'ı hafifçe geçip
      // negatife iniyor ve tam sıfır karşılaştırması o salınımda ıskalıyor.
      //
      // Bu ölçümün yerinde bir dönem "momentumla tepeye çarpma HIZI" vardı ve
      // SwipeWrapper onu okuyup kartı KAPATIYORDU (daha da öncesinde kapak
      // fotoğrafına bir zoom darbesi veriyordu). Kapanacak bir şey kalmadı;
      // geriye yalnız varışın kendisi kaldı.
      const nowAtTop = y <= TOP_HIT_EPS;
      if (nowAtTop !== atTopSV.value) {
        atTopSV.value = nowAtTop;
        if (nowAtTop) runOnJS(triggerTopHaptic)();
      }
    },
  });

  // Kart tepeden düştü (alt karta dönüştü) → scroll'u başa al. Bir dönem bu
  // "collapse" anıydı; kapalı hâl kalkınca geriye yalnız bu kaldı: alt kart
  // tekrar üste çıktığında içerik ortasından doğmasın.
  useEffect(() => {
    if (expanded) return;
    bouncesSV.value = false;
    nearBottomSV.value = false;
    setBounces(false);
    const sv = scrollRef.current as unknown as {
      scrollTo?: (opts: { y: number; animated: boolean }) => void;
    } | null;
    sv?.scrollTo?.({ y: 0, animated: false });
    if (scrollY) scrollY.value = 0;
  }, [expanded, bouncesSV, nearBottomSV, scrollRef, scrollY]);

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
  resetCardExpandState,
} from "@/shared/services/uiBus";
import CardMenuGlassButton from "@/features/discover/components/CardMenuGlassButton";
import CardGlyphGlassButton from "@/features/discover/components/CardGlyphGlassButton";
// Kapak kolonundaki tik / X — üç noktanın (CardMenuGlassButton) sardığı
// kabuğun AYNISI, yalnız glifleri farklı. Kolonun beş dairesi tek malzeme
// olmak zorunda (bkz. kolonun kendi notu).
import CardChromeGlassButton from "@/features/discover/components/CardChromeGlassButton";
import {
  DISCOVER_CARD_EXPAND_LIFT,
  DISCOVER_GLASS_BUTTON_SIZE,
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
  // `gradients` ARTIK BURADA YOK: kapaktaki Fire gradyanı bu dosyanın
  // tek kullanıcısıydı, alevi çizen canvas'a taşındı (FireBurnCanvas).
  colors as theme,
  ink,
  isLight,
  scrimAt,
  withAlpha,
} from "../../../shared/theme/colors";
// YÜZEY kapısı (`HAS_LIQUID_GLASS` değil): native modülün kendi sabitini okuyor
// ve `UIDesignRequiresCompatibility` bayrağını da sayıyor — CardSectionBox da
// aynı kapıdan geçiyor, piller onunla aynı cevabı görmek zorunda.
import { glassOnMediaInk, hasLiquidGlassSurface } from "@/shared/theme/glass";
import { MAX_PROFILE_PROMPTS } from "@/shared/constants/limits";
import {
  photoNoteTarget,
  promptNoteTarget,
} from "@/features/discover/noteTarget";
import type { NoteTarget } from "@/shared/types";
import { buildMapboxStaticUrl } from "@/shared/constants/mapbox";
import { lookupCityCoordinate } from "@/shared/constants/cityCoordinates";
import HobbyIcon from "@/shared/components/HobbyIcon";
import { relationshipIntentLabel as resolveRelationshipIntentLabel } from "@/features/discover/likerCardTeaser";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import PremiumBadge from "@/shared/components/PremiumBadge";
import SelfieVerifiedBadge, {
  selfieBadgeSize,
} from "@/features/profile/components/SelfieVerifiedBadge";
import FireGlassButton from "./FireGlassButton";
import {
  DEFAULT_APP_MODE,
  modeFireNameKey,
  modeFireTint,
  type AppMode,
} from "../modeTheme";
import CardStickyHeader, {
  CARD_CHROME_TOP_DROP,
  CARD_EXPANDED_CORNER_RADIUS,
  CARD_FACE_CORNER_RADIUS,
  CARD_FACE_TOP_CORNER_RADIUS,
  CARD_HEADER_TITLE_BOTTOM,
  CHROME_EDGE_INSET,
  PREVIEW_HEADER_TITLE_BOTTOM,
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

// Şeridin sağ ucunda ASILI KALAN cam butonun belirme bandı: çekme oranı
// (cardExpandAnim / chromeAnim) bu bantta ilerledikçe buton açılıyor, jest
// yarıda bırakılırsa geçiş de yarıda kalır — parmakla geri sarılabilir.
//
// TARİHÇE: sayılar kapaktaki SERBEST ALEV ile cam Fire butonunun çapraz
// sönmesinden kalma (adları da `FIRE_MORPH_*`ydı). Serbest alev kalktı, sonra
// Fire'ın kendisi de şeritten çıktı — oradaki buton artık BEĞEN (bkz.
// aşağıdaki sticky blok). Bant aynı: devredilen şey şeridin ucundaki yuva,
// içine hangi glif oturduğu değil.
const STICKY_ACTION_IN_START = 0.3;
const STICKY_ACTION_IN_END = 0.8;

// Kapak fotoğrafındaki isim satırının puntosu. 36 → 32 → 28 küçüldü; rozet
// ondan TÜRETİLDİĞİ için sayı burada duruyor, JSX'te değil.
const CARD_NAME_FONT = 28;
// Satır kutusu ~1.14em. Rozetin hizası bu kutuya göre hesaplanıyor (aşağıda).
// DIŞA AÇIK: kapağın iskeleti (DiscoverScreen > SkeletonCard) isim bloğunu bu
// boyda çiziyor — ayrışırsa iskeletten karta geçerken satır boy değiştiriyor.
export const CARD_NAME_LINE = 32;

// PANELİN BAŞLIK PUNTOSU KALDIRILDI (27/32 idi): panelin başında isim satırı
// yok, isim yalnız sticky şeritte ve puntosu orada (CardStickyHeader >
// TITLE_FONT).

// Premium işaretinin ölçüsü BU DOSYADA DEĞİL: `PremiumBadge` ismin puntosundan
// çıkarıyor (bkz. premiumBadgeFontSize). Buradaki iki punto sabiti onun tek
// girdisi.

// Kapak fotoğrafı ile profil panelinin arasındaki boşluk.
//
// SIFIR (istek): panel kapağın dibinin TAM ALTINDAN başlıyor — ne örtüşme, ne
// boşluk. Bölümler fotoğrafın ÜSTÜNE binmiyor, altında duruyor.
//
// İKİ YÜZEY ARASINDAKİ GÖRÜNEN NEFES bu sayıdan DEĞİL panelin kendi üst
// dolgusundan geliyor (PANEL_TOP_PAD): burası 0 iken bile ilk kutu kapağın
// dibinden o kadar aşağıda başlıyor. Aralığı büyütmek isteyen önce oraya baksın
// — bu sabiti pozitife çekmek panelin KENDİ kenarını indirir.
//
// ÖLÇÜ TARİHİ (hepsi istek): −64 → −164 → −30 → −60 → −100 → 0. Negatif olduğu
// dönemde soru "panelin ilk kutusu kapağın dibinin NE KADAR ÜSTÜNE binsin"di ve
// örtüşmenin bir işi vardı: kapağın dibi eriyerek bittiği için (alfa maskesi)
// dikişi örtüşme gizliyordu. Erime kaldırılınca örtüşmenin tek etkisi çakışma
// oldu.
//
// Örtülen bant kapağın kromasıydı: isim + pill bloğu. Panel oraya varana kadar
// o blok çekilmiş oluyordu (aynı kanal — bkz. cardChromeAnim), yani panel
// hiçbir zaman yazının üstüne binmiyordu.
//
// SABİTİ OKUYAN HER ŞEY TÜRETİLMİŞ: panelin `marginTop`u buradan geliyor.
const PROFILE_PANEL_GAP = 0;

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
 * Kapaktaki isim + üniversite/ortak nokta bloğunun fotoğrafın dibinden
 * yüksekliği. Tabanı tab bar'ın boyu ekliyor (bkz. coverBottomInset), yani bu
 * sayı bar'ın ÜSTÜNDE kalan nefes.
 *
 * 70 → 30 → 12 (hepsi istek): 70'in altında bir "detaylar için yukarı kaydır"
 * fısıltısı duruyordu, o kalkınca blok 30'a indi; sonra "biraz daha yaklaşsın"
 * denip 12'ye çekildi. Daha da azaltma: 0'a yaklaştıkça blok yüzen bar'ın üst
 * kenarına değiyor ve ikisi tek yığın gibi okunuyor.
 *
 * Ayrıca ÜÇ ŞEY daha bu sayıdan türüyor: chrome devrinin eşiği
 * (chromeHandoffY — blok nerede duruyorsa devir orada tetiklenir), sağ alttaki
 * aksiyon kolonunun tabanı (aynı çizgiden başlasınlar) ve kapağın iskeleti
 * (DiscoverScreen > SkeletonCard — iskeletin yazı bloğu kartınkiyle AYNI
 * çizgide durmalı, yoksa ilk fotoğraf gelince blok yerinden zıplıyor).
 */
export const COVER_NAME_BOTTOM = 12;

/**
 * Kapağın sağ alt köşesindeki aksiyon kolonunun buton çapı ve butonlar arası
 * boşluk.
 *
 * ÜÇÜ AYNI ÖLÇÜ (istek: Instagram'ın sağ alt kolonu gibi): aşağıdan yukarı üç
 * nokta · not · Fire. Tek çap, tek boşluk — ayrışırlarsa kolon merdiven gibi
 * okunuyor.
 *
 * Sayı ORTAK DOSYADAN (DISCOVER_GLASS_BUTTON_SIZE): ekranın üstündeki geri al /
 * filtre ve şeridin iki ucundaki ok / Fire da aynı çapta. Devirde biri
 * diğerinin yerini aldığı için bir tanesi bile ayrışırsa daireler büyüyüp
 * küçülüyor.
 */
const COVER_ACTION_SIZE = DISCOVER_GLASS_BUTTON_SIZE;
/**
 * Kolondaki butonların arası. 12 → 18 (istek): 12'de üç daire tek bir dikey
 * şerit gibi okunuyordu, 18 onları ayrı ayrı butonlar olarak ayırıyor.
 *
 * Kolonun TOPLAM boyu buna bağlı (3 × çap + 2 × boşluk) ve yukarı doğru
 * büyüyor; fazla açmak üst butonu kapağın orta bandına taşır.
 */
const COVER_ACTION_GAP = 18;

/**
 * ⚠️ KARAR İKİLİSİNİN (tik · X) GLİF PUNTOSU İÇİN AYRI SABİT YOK (istek,
 * 2026-10-27: "tik ve x butonlarının icon boyutunu kaydırınca çıkan headerdaki
 * tik boyutu kadar yap").
 *
 * İkisi de `CardChromeGlassButton`a punto GEÇMİYOR, yani glif ortak cam ikon
 * butonundan geliyor: camlı yolda GLASS_ICON_BUTTON.icon (17), camsız yolda
 * CARD_CHROME_FALLBACK_ICON_SIZE (22). Şeridin sağ ucundaki beğen butonu da
 * (aşağıda, "BEĞEN (tik) — ŞERİDİN SAĞ UCU") tam olarak böyle kurulu ve
 * kaydırma devrinde kapaktaki tikin yerini alıyor — iki sayı ayrışınca aynı
 * işaret devrin ortasında büyüyüp küçülüyordu.
 *
 * 17 → 28 → 24 → 17. Ara sayıların gerekçesi "hemen altındaki Fire 29pt çiziyor
 * (FIRE_GLASS_GLYPH_SIZE), yanında 17pt tik yarım işaret gibi okunuyor"du; 28
 * ayrıca Beğeniler'in 72'lik kart köşesinden kopyaydı ve 48'lik kabukta cam
 * kenarına dayanıyordu. Bu tur iriliği değil ŞERİTLE TUTARLILIĞI seçti.
 *
 * Kabuk hiçbir turda değişmedi: çap COVER_ACTION_SIZE'da sabit, dokunma alanı
 * da öyle (nedeni glassIconClearGlyph > `frame` + `contentShape`).
 */

/**
 * Kapağın alt chrome'unun (sol yazı bloğu + sağ buton kolonu) fotoğrafın ALT
 * SINIRINA yaklaşabileceği en küçük mesafe (px).
 *
 * İkisi kaydırırken ekranda SABİT kalıyor (bkz. coverStickyStyle) ama fotoğraf
 * altlarından akıp gidiyor: bir noktada fotoğrafın dibi onları geçip panelin
 * üstünde bırakırdı. Bu pay o sınırı çiziyor — chrome fotoğraftan TAŞMIYOR,
 * dibine bu kadar kala takılıp fotoğrafla birlikte yukarı gidiyor.
 *
 * 10 → 20 → 30 (istek): her turda bir tık daha yukarıda dursunlar. Sayı doğrudan
 * pinlenme mesafesinden düşüyor (tavan = blok yüksekliği − bu pay), yani
 * büyütmek chrome'u sınırdan uzaklaştırırken sticky bandını da kısaltıyor —
 * 30'da band 40px'e indi.
 *
 * Daha da yukarı isteniyorsa kaldıraç ARTIK BURASI DEĞİL: bu sayı bloğun
 * yüksekliğine (COVER_NAME_BOTTOM + tab bar payı ≈ 70) yaklaştıkça sticky bandı
 * sıfıra iniyor ve "kaydırırken yerinde kalma" hissi kayboluyor. O noktada
 * COVER_NAME_BOTTOM büyütülmeli — o, bloğu tab bar'a göre yukarı taşıyor ve
 * bandı kısaltmıyor.
 */
const COVER_STICKY_EDGE_GAP = 30;

/**
 * Üniversite satırının ortak nokta satırına bıraktığı pay (px) — satırın
 * `marginBottom`u.
 *
 * DÖRT YER OKUYOR, o yüzden burada: üniversite satırının kendisi, aynı satırın
 * dikey dolgusu (aşağısı), buton kolonunun tabanı ve kapağın iskeleti
 * (DiscoverScreen > SkeletonCard). Kolon pillere ÜNİVERSİTE TEXTİYLE AYNI
 * mesafede durmak zorunda (istek) — iki sayı ayrışırsa kolon yazıdan farklı bir
 * çizgide duruyor.
 */
export const COVER_UNI_PILLS_GAP = 8;

/**
 * Üniversite satırının kendi dikey dolgusu (`py-1`'in 4'ü).
 *
 * className'den ALINDI çünkü kolonun payı bunu da saymak zorunda: satırın
 * KUTUSU yazının 4px altında bitiyor, yani "textin pillere uzaklığı" = margin +
 * bu dolgu. Kolonun kutusunda böyle bir ölü pay yok (daire kutunun kenarına
 * dayanıyor), o yüzden farkı elle kapatıyoruz.
 *
 * İskelet de bunu okuyor (DiscoverScreen > SkeletonCard): oradaki placeholder
 * satırın boyu "yazı kutusu + bu dolgu" olmak zorunda.
 */
export const COVER_UNI_ROW_PAD = 4;

/**
 * Buton kolonunun tabanı ile ortak nokta satırının arası — üniversite TEXTİNİN
 * aynı satıra olan optik uzaklığı (istek).
 *
 * 10'du (elle seçilmiş bir sayı) ve yazıyla aynı çizgiye denk gelmiyordu.
 * Türetilmiş hâli ikisini birbirine kilitliyor.
 */
const COVER_ACTION_PILLS_GAP = COVER_UNI_PILLS_GAP + COVER_UNI_ROW_PAD;

/**
 * Aksiyon kolonunun sağ payı — kolonun MERKEZİ, ekranın üstündeki filtre
 * butonunun merkeziyle aynı dikey eksende dursun diye (istek).
 *
 * Kenar paylarını eşitlemek YETMİYOR, çünkü iki buton farklı çapta: filtre
 * ortak cam ikon ölçüsünde (48), kolon 52. Aynı kenardan başlasalardı 2px
 * kayarlardı. Fark yarı yarıya geri alınıyor — kutuları değil merkezleri
 * çakıştıran, uygulamada başka yerlerde de kullanılan kalıp.
 */
const COVER_ACTION_RIGHT =
  CHROME_EDGE_INSET + (DISCOVER_GLASS_BUTTON_SIZE - COVER_ACTION_SIZE) / 2;

/**
 * ÖNİZLEMEDEKİ aksiyon kolonunun ana fotoğrafın ALT kenarına payı (px).
 *
 * Keşif'teki ikizinin tabanı isim bloğundan ve ortak nokta satırından türüyor
 * (COVER_NAME_BOTTOM + coverPillsHeight…): orada kolonun altında yazı var.
 * Önizlemede o krom hiç çizilmiyor — fotoğrafın dibi aynı zamanda ilk
 * detent'in dibi (bkz. PREVIEW_COVER_ASPECT) — yani pay doğrudan kenara
 * veriliyor ve sağ payla AYNI sayıda: kolon köşeye eşit uzaklıkta oturuyor.
 *
 * 16, fotoğrafın 40'lık alt köşe yarıçapının içinde kalıyor: daire merkezi
 * köşenin eğrilik merkezine 2.8px uzakta ve 26 yarıçapla toplasa bile 40'ı
 * aşmıyor, yani buton fotoğrafın dışına taşmıyor.
 */
const PREVIEW_COVER_ACTION_BOTTOM = CHROME_EDGE_INSET;

/*
 * `COVER_FIRE_GLYPH_SIZE` (34) KALDIRILDI: kolondaki alev canvas'ının cam
 * diskin içinde kalması için küçültülmüş ölçüsüydü (serbest alev 55'ti ve
 * diskten taşıyordu). Canvas kaldırıldı — alev artık `FireGlassButton`ın
 * berrak varyantındaki duragan glif ve ölçüsünü o dosya veriyor.
 */


/*
 * `COVER_SIDE_INSET` (24, `left-6 right-6`nın karşılığı) KALDIRILDI: kapaktaki
 * yazı grubunun ve aksiyon kolonunun yan payıydı. İkisi de artık ekranın
 * üstündeki yüzen butonlarla hizalanıyor (istek) ve payları oradan geliyor —
 * yazı CHROME_EDGE_INSET'ten (geri al butonunun kenarı), kolon
 * COVER_ACTION_RIGHT'tan (filtre butonunun merkezi).
 */

/**
 * Chrome devrinin süresi — yazıların ve butonların sönüp yerlerini devretmesi.
 *
 * SCROLL'A ORANLI DEĞİL (istek): eşik geçilince devir bu süreyle akıyor.
 * `withTiming`, `withSpring` DEĞİL — yay sonunda salınıyor ve metin
 * opaklığında o salınım titreme olarak okunuyor.
 *
 * 260 ms: göz devri fark edecek kadar uzun, kaydırmanın akışını kesmeyecek
 * kadar kısa.
 */
const CHROME_FADE = { duration: 260, easing: Easing.out(Easing.cubic) };

/**
 * Devir eşiğinin iki yanındaki ölü bant (px). Tam eşikte duran parmak birkaç
 * pikselik titremeyle devri ileri geri açıp kapatmasın.
 */
const CHROME_HYSTERESIS = 12;

/*
 * ── `PANEL_SLIDE_MARGIN` KALDIRILDI ────────────────────────────────────────
 * 40'tı: panelin ekranın dibinin de ALTINDA beklemesi için bırakılan fazladan
 * pay (`panelSlideTravel`in son terimi). Panel artık beklemiyor — kapağın
 * altında statik duruyor (gerekçesi profileInfoAnimStyle'ın silindiği yerde).
 *
 * O notta duran ve hâlâ geçerli olan kural: panelin konumu MARGIN ile
 * veriliyor, transform ile DEĞİL — içindeki cam kutular ata zincirinde
 * kimliksel olmayan bir transform gördüğü anda efektlerini hiç render etmiyor.
 */

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
 * Panelin YATAY dolgusu — `px-4`ün 16'sı, artık açık sayı olarak burada
 * (inline style className'i ezer; değer AYNI, yalnız kaynağı değişti).
 *
 * Sayı burada görünür olsun diye, tıpkı üst/alt dolgunun kaynağının açık
 * yazılması gibi: önizlemenin tam kenar ana fotoğrafı tam olarak BU dolgunun
 * dışında kalmak zorunda ve bunu panelin KARDEŞİ olarak çözüyor — negatif
 * marjla değil (bkz. SectionPhoto > bleed). Yani burayı büyütmek fotoğrafı
 * etkilemez; panelin içindeki her şeyi kenardan uzaklaştırır.
 */
const PANEL_PAD_H = 16;

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
 * Kapağın dibindeki rampanın, İSMİN ÜSTÜNDE bıraktığı sönme kuyruğu (px).
 *
 * Rampanın boyu artık sabit DEĞİL, yazı bloğundan türüyor (bkz.
 * coverTextRampHeight): tab bar payı + bloğun kendi yüksekliği + bu kuyruk.
 * Yani "fotoğrafın dibinden İSME KADAR" — istenen bu.
 *
 * Kuyruk şart: rampa bloğun tam tepesinde biterse ismin üst satırı (aktiflik
 * işareti / uzun isimde ikinci satır) perdenin dışında kalıp açık fotoğraflarda
 * kayboluyor. Kuyruk uzadıkça maskenin sönme bandı da uzuyor, yani geçiş
 * fotoğrafın içinde daha yumuşak tamamlanıyor.
 *
 * 64 → 140 → 220 (istek, iki tur): 64'te perde yazının hemen üstünde bitiyor ve
 * bant blokla birlikte tek bir şerit gibi okunuyordu; 140 sönmeyi fotoğrafın
 * içine yaydı ama hâlâ kısa geldi. 220'de kuyruk bloğun kendi boyu kadar —
 * yani perde ismin üstünde, bloğun bir boyu daha devam edip sönüyor.
 *
 * AYAR NOKTASI BURASI. Rampanın diğer üç terimi (tab bar payı, bloğun bar üstü
 * nefesi, bloğun ölçülen boyu) yerleşimden geliyor; "daha yukarı / daha aşağı"
 * isteyen yalnız bu sayıyı oynatmalı. Çok büyütmek fotoğrafın alt yarısını
 * karartmaya başlıyor — sabit 340'ın bırakıldığı yer tam olarak orasıydı.
 */
const COVER_TEXT_RAMP_TAIL = 220;

/*
 * `COVER_TOP_RAMP_PAD` KALDIRILDI: kapağın tepesindeki rampanın butonların
 * altında bıraktığı sönme kuyruğuydu (24 → 96). Rampanın kendisi kaldırıldı —
 * gerekçesi çizildiği yerde: üstteki blur fotoğrafın değil sticky şeridin işi.
 */




/**
 * Önizlemede (Likes / Chat / Profil) içeriğin sticky şeridin ALTINDAN
 * başlaması için panelin kendi dolgusuna eklenen pay.
 *
 * ARTIK YALNIZ FOTOĞRAFSIZ PROFİLDE: ana fotoğraf varken o blok kartın
 * tepesine dayanıyor ve şerit onun ÜSTÜNDE duruyor (bkz. SectionPhoto >
 * bleed) — pay çizilse fotoğrafın üstünde boş bir şerit açardı.
 *
 * Panelin İÇİNDE duruyor, kartın zemininde (theme.bg) açılan bir boşluk DEĞİL:
 * önce öyle denendi ve açık modda gri panelin üstünde beyaz bir şerit
 * bırakıyordu — orada kartın tepesinde fotoğraf yok, o zemini örtecek bir şey
 * de yok.
 *
 * Ölçü: ÖNİZLEME şeridinin başlık satırının dibi (PREVIEW_HEADER_TITLE_BOTTOM —
 * Keşif'inkinden kısa, çünkü orada satırın üst payı kartın içerik çizgisi) +
 * şeridin köşe diyagonalinden aşağı kayma payı (CARD_CHROME_TOP_DROP — sheet
 * safe-area'nın altında başladığı için şu an 0, bkz. PreviewModal /
 * LikerSwipeModal `topInset`) + 8 nefes − panelin kendi üst dolgusu
 * (PANEL_TOP_PAD). Daha küçüğü ilk bloğu camın altında bırakır, büyüğü tepede
 * boş şerit açar.
 *
 * TÜRETİLMİŞ, sabit değil: şeridin ölçüsü cam butonun çapından, dolgu da kendi
 * sabitinden geliyor; ikisi de değişebiliyor ve elle yazılmış bir sayı sessizce
 * yanlış kalıyordu. Dolgu küçülünce bu pay aynı oranda büyüyor → önizlemede
 * şeridin altındaki nefes DEĞİŞMİYOR (toplam sabit).
 */
const PREVIEW_HEADER_SPACE =
  PREVIEW_HEADER_TITLE_BOTTOM + CARD_CHROME_TOP_DROP + 8 - PANEL_TOP_PAD;

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
/**
 * Önizlemenin TAM KENAR ana fotoğrafının oranı (bkz. SectionPhoto > bleed).
 *
 * SAYI AYRI MODÜLDE (cardPreviewGeometry): aynı oranı kartı taşıyan sheet'ler de
 * okuyor — ilk detentleri bu bloğun boyu (bkz. oradaki not). Buradaki yalnız
 * yerel ad.
 */
const SECTION_PHOTO_BLEED_ASPECT = PREVIEW_COVER_ASPECT;
// Bölüm kutularının yarıçapı ile aynı (bkz. hobiler/yaşam tarzı/bio kutuları).
const SECTION_PHOTO_RADIUS = 40;
// Kapak fotoğrafının yarıçapı ARTIK BURADA DEĞİL: kabukla aynı sayı olmak
// zorunda (ikisi ayrışırsa üst köşelerde aradaki payda kart zemini görünüyor),
// o yüzden kart yüzünün tek kaynağı CARD_FACE_CORNER_RADIUS. Buradaki eski
// sabit 40'tı ve yalnız kapağı biliyordu.

/**
 * Kapağın ÜST köşesinin kabuktan ne kadar DAHA KARE çizildiği (pt).
 *
 * Köşede üç eş eğri üst üste biniyordu — kabuk, panelin boyama kutusu (ikisi de
 * açık modda BEYAZ zemin) ve en üstte kapak fotoğrafı. Üçü aynı yarıçapta
 * olunca kapağın kenar yumuşatması altındaki beyazı sızdırıyor ve sağ/sol üst
 * köşede ince bir beyazlık kalıyordu.
 *
 * Kapağı bir tık KARELEŞTİRMEK köşeyi taşırıyor: kırpmayı tek başına kabuk
 * yapıyor, altındaki beyaz yüzeylerin köşesi tamamen kapağın altında kalıyor.
 * Ekranda görünen eğri değişmiyor (kabuğun eğrisi), yalnız sızıntı kapanıyor.
 *
 * YÖNÜ TERSİNE ÇEVİRME: kapak kabuktan daha YUVARLAK olursa aynı beyazlık geri
 * gelir, hatta büyür (bkz. photoBorderStyle).
 *
 * YALNIZ ÜST İKİ KÖŞE: altta kapağın dibi panelin üstünde gerçek bir kenar,
 * altına sızacak bir yüzey yok — orada kabukla birebir aynı sayı kalıyor.
 */
const COVER_TOP_RADIUS_OVERFILL = 2;

/**
 * Kart yüzünün köşe yarıçapı, AÇILMA ORANINA bağlı: kapalıda 44
 * (CARD_FACE_CORNER_RADIUS), tam açıkta `openRadius`.
 *
 * KEŞİF'TE ARTIK NO-OP: orada `openRadius` da CARD_FACE_CORNER_RADIUS, yani
 * köşe açılma boyunca hiç değişmiyor (gerekçe + tarihçe: openCornerRadius).
 * Fonksiyon duruyor çünkü ÖNİZLEME yolu hâlâ farklı bir varışa gidiyor (35,
 * sheet'in clip'iyle eşleşmek zorunda) ve varış değeri tek satırda geri
 * alınabilir kalsın.
 *
 * ÇEKİŞE BAĞLI, süreye değil: kabuk ve kapak fotoğrafı bu tek fonksiyonu
 * okuyor, yani varışlar yeniden ayrışırsa jest yarıda bırakıldığında köşe de
 * yarıda kalır, parmakla geri sarılabilir. Doğrusal: köşe kartın büyümesiyle
 * aynı hızda değişmeli, kendi bandı olsaydı hareketin ortasında ayrı bir olay
 * gibi okunurdu.
 *
 * KLEMP ŞART: cardExpandAnim yay ile oturuyor ve 1'i aşabiliyor; klempsiz köşe
 * varış noktasını aşıp bir an fazla kareleşirdi.
 */
function cardCornerRadius(progress: number, openRadius: number) {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  return CARD_FACE_CORNER_RADIUS + (openRadius - CARD_FACE_CORNER_RADIUS) * p;
}


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
// kendisi konuşma balonu — uygulama ikonundan sökülen glyph (NoteGlyph). İki
// balon (kap + ikon) üst üste binmesin diye tek siluete indi. Bir dönem
// fire glyph'iyle kardeşti (ikisi de app-icon'dan); o artık alev, bu
// balon app-icon'da kaldı.
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
const NOTE_BOX_SIZE = DISCOVER_GLASS_BUTTON_SIZE;
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
/*
 * `NOTE_DISC_SIZE` KALDIRILDI: fotoğraf üstündeki not diskinin çapıydı. Disk
 * artık ortak cam butonun kabuğu (bkz. CardGlyphGlassButton) ve çapı kolonun
 * sayısından geliyor — COVER_ACTION_SIZE.
 */
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
/*
 * `NOTE_BOX_COVER_INSET` (NOTE_BOX_INSET + 16) KALDIRILDI: kapaktaki not
 * kutusunun yan payıydı — kutu sağa yaslı geniş bir katmandı. Artık sağ alt
 * aksiyon kolonunun içinde ve payı kolondan geliyor.
 */
/**
 * Prompt kutusunda butonun cevaba doğru çekildiği pay. Cevap kabının kendi
 * 14'lük alt padding'i aralığı zaten taşıyor, üstüne tam marj eklenince buton
 * metinden kopuk duruyordu. Butonun HİÇ çizilmediği girişlerde (kendi profil
 * önizlemesi · Likes · sohbet profili) yerine konan boşluk da aynı payı
 * düşüyor: kutunun altı iki durumda da birebir aynı kalıyor.
 */
const NOTE_BOX_PROMPT_PULL = 8;

/*
 * `NOTE_BOX_PANEL_CLEARANCE` (12) KALDIRILDI: kapaktaki not kutusu ile panelin
 * üst kenarı arasındaki nefesti. Kutu panelin bindiği bandın İÇİNDEYKEN
 * (sabit `bottom: 74`) panelin ilk bölümüyle çakışıyordu, bu pay onu kenarın
 * yukarısına alıyordu. Kutu artık sağ alt aksiyon kolonunda ve konumu oradan
 * geliyor.
 *
 * O notta duran ve hâlâ geçerli olan uyarı: çakışmayı `zIndex` ile çözmeye
 * çalışma. Bir tur panele zIndex verilip kutu arkada bırakıldı; çakışma
 * görünmüyordu ama istenen onu YUKARI taşımaktı, üstelik zIndex paneli kapağın
 * bütün katmanlarının üstüne çıkarıyor.
 */

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
  /** Kutu bir FOTOĞRAFIN üstünde mi — kabuğunu o belirliyor. */
  onPhoto?: boolean;
}) {
  const { t } = useTranslation();

  // Görünür etiket kalmadı → butonun ADI yalnız burada. Silme.
  const label = t("note.boxLabel");

  /*
   * ── BASMA ANİMASYONU KALDIRILDI (istek: "liquid effect") ──────────────────
   *
   * `pressAnim` + `scale: 1 − 0.06p` vardı (Fire alevindeki kalıbın aynısı,
   * 180ms/out-quad). Fotoğraf üstündeki disk CAM olunca iki sebeple gitti:
   *   1. O `transform` camın ATASINDAYDI — uygulamada kimliksel olmayan bir ata
   *      transform'u cam efektini sessizce yok ediyor.
   *   2. İstenen geri bildirim zaten camın kendisinde: `interactive: true` ile
   *      iOS 26 basışta kabuğu kendi morph'uyla büküyor (bkz.
   *      CardGlyphGlassButton). Üstüne ölçek koymak iki sinyali üst üste
   *      bindirirdi.
   *
   * PROMPT KUTUSUNDAKİ (onPhoto=false) işaret zeminsiz: orada kabuk yok, o
   * yüzden camın morph'u da yok. Basma geri bildirimi `TouchableOpacity`nin
   * varsayılan solmasına bırakıldı — tek başına duran bir glif için yeterli.
   */

  // FOTOĞRAF ÜSTÜNDE: ortak berrak cam yuvarlak buton. Kolondaki Fire ve üç
  // noktayla AYNI kabuk — üçü yan yana duruyor (bkz. CardGlyphGlassButton).
  if (onPhoto) {
    return (
      // SAĞA YASLI: kutu bölüm fotoğraflarının ve kapağın İÇİNDE, sağ alt
      // köşede duruyor. Sarmalayıcı şart — `CardGlyphGlassButton` kendi
      // hizasını bilmiyor (konumlandırma çağıranın işi) ve pay verilmezse
      // esnek bir kapta sola yapışıyor.
      <View style={{ alignSelf: "flex-end" }}>
        <CardGlyphGlassButton
          onPress={onPress ?? (() => {})}
          label={label}
          size={COVER_ACTION_SIZE}
        >
          <NoteGlyph
            size={NOTE_GLYPH_SIZE_PHOTO}
            // Mürekkep FOTO ÜSTÜ — açık modda da beyaz. Berrak camın dolgusu
            // olmadığı için glifin zemini doğrudan fotoğraf; tema mürekkebiyle
            // açık modda kapağın karanlık yerlerinde kayboluyordu. 26-altı /
            // Android dalı tema mürekkebinde kalıyor (bkz. glassOnMediaInk).
            color={glassOnMediaInk()}
            stroke={theme.swipeHeartBorder}
            strokeWidth={0.1}
          />
        </CardGlyphGlassButton>
      </View>
    );
  }

  // PROMPT KUTUSUNDA: zeminsiz glif. KONUMLANDIRMA ÇAĞIRANIN İŞİ — dikey yeri
  // oradan geliyor, yatayda sağa yaslı.
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ alignSelf: "flex-end" }}
      hitSlop={8}
    >
      <View
        style={{
          width: NOTE_BOX_SIZE,
          height: NOTE_BOX_SIZE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NoteGlyph
          size={NOTE_GLYPH_SIZE_PROMPT}
          color={theme.text}
          stroke={theme.swipeHeartBorder}
          strokeWidth={0.1}
        />
      </View>
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
  bleed = false,
  zoomStyle,
}: {
  uri: string;
  onNotePress?: () => void;
  /**
   * Kutuyu zorla kapat. TEK MÜŞTERİSİ var: önizlemenin ANA fotoğrafı (bkz.
   * çağrıldığı yer, "ÖNİZLEMENİN AKSİYON KOLONU"). Not kutusu artık o
   * kolonun İÇİNDE çiziliyor (tik · X · Fire · not); bu prop olmasaydı
   * `SectionPhoto`nun kendi tam-genişlikte mutlak katmanı (`alignSelf:
   * flex-end`) AYRICA bir kutu çizerdi ve iki bağımsız katman aynı köşeyi
   * (sağ alt) hedefleyip üst üste binerdi.
   *
   * ⚠️ Keşif'in tam ekran kapağı bu prop'un müşterisi DEĞİL — kapak kendi
   * fotoğrafını `SectionPhoto` ÜZERİNDEN çizmiyor (ayrı bir
   * `MaskedView`/`CoverMeltBand` yolu), dolayısıyla `hideNote`u hiç
   * göremiyor. Kapaktaki not kutusu da kendi aksiyon kolonunun içinde
   * doğuyor (bkz. oradaki `NoteBox onPhoto` çağrısı) — AYNI fikir, AYRI
   * kod yolu. Burada grep'le `hideNote` ararsan kapakta hiçbir şey
   * bulamazsın; bu kasıtlı, iki yol birbirine bağlı değil.
   *
   * ⚠️ `previewMode` İLE SÜRÜLMÜYOR ARTIK: önizleme kartlarında not kutusunun
   * olmaması `onNote`un verilmemesinden geliyordu ve iki kapı aynı şeyi
   * söylüyordu — ta ki akış kartı çıkana kadar. O kart `previewMode` ile açılıyor
   * AMA not gönderebiliyor (bkz. feedCardActions); `previewMode` kapısı orada
   * `onNote`u sessizce ölü bırakıyordu. Tek kapı kaldı: kutu `onNotePress`
   * verildiyse çizilir (bkz. noteHandler → `onNote` yokken `undefined`).
   */
  hideNote?: boolean;
  /**
   * TAM KENAR — yalnız önizlemenin ANA (ilk) fotoğrafı: kartın tepesine ve iki
   * yanına dayanır, dolgu yok (istek). Diğer bölüm fotoğrafları panelin
   * dolgusunun İÇİNDE kalıyor — ritim onlarda bozulmuyor.
   *
   * BLOK PANELİN DIŞINDA ÇİZİLİYOR (scroll içeriğinin ilk çocuğu, panelin
   * KARDEŞİ) — bkz. çağrıldığı yer. NEGATİF MARJLA KURMAYA ÇALIŞMA: bir tur
   * panelin içinde `marginHorizontal: -PANEL_PAD_H` ile denendi ve iki yan
   * EŞİT ÇIKMADI. Sebep yüzde genişliğin panelin İÇERİK kutusunu (dolgu
   * düşülmüş hali) çözmesi: negatif marj açık genişliği büyütmüyor, kutuyu
   * yalnız sola kaydırıyor → sol kenar yapışıyor, sağda 2×PANEL_PAD_H eksik
   * kalıyor. `width: "auto"` + stretch da güvenilir çıkmadı. Dolgusuz bir
   * ebeveynin altında bu sorunun kaynağı yok.
   *
   * ÜST KÖŞELER DÜZ: yuvarlak kalsalardı kartın kendi köşesiyle (kabuk +
   * sheet, ikisi de CARD_EXPANDED_CORNER_RADIUS) iç içe iki yarıçap çıkıyordu.
   * Tepeyi kabuğun kırpması yuvarlıyor; ALT köşeler 40'ta kalıyor — blok
   * aşağıda hâlâ akışın bir parçası.
   *
   * ALT MARJ YOK: fotoğrafın altındaki nefesi panelin kendi üst dolgusu
   * (PANEL_TOP_PAD) veriyor, blok artık onun üstünde duruyor.
   *
   * Şeridin altındaki nefes payı (PREVIEW_HEADER_SPACE) bu yolda ÇİZİLMİYOR:
   * sticky şerit artık fotoğrafın üstünde duruyor, tıpkı Keşif'teki kapakta
   * olduğu gibi.
   */
  bleed?: boolean;
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
        bleed && {
          // MARJ YOK, NEGATİF MARJ DA YOK — blok dolgusuz bir ebeveynin
          // altında, yani iki yan kendiliğinden eşit (bkz. bleed prop'u).
          marginBottom: 0,
          // Bölüm fotoğraflarından uzun — bkz. SECTION_PHOTO_BLEED_ASPECT.
          aspectRatio: SECTION_PHOTO_BLEED_ASPECT,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
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
  onFire?: () => void;
  /** Expand sonrası native scroll konumu — SwipeWrapper'ın pan'i okuyor. */
  scrollY?: SharedValue<number>;
  /**
   * Kartın scroll'una dışarıdan erişim. Verilmezse kart kendi ref'ini kurar.
   *
   * Yanında `scrollMax` ve `topHitSpeed` vardı: ilki pan'in ELLE sürdüğü
   * scroll momentumunun sınırı, ikincisi "momentum tepeye çarptı → kartı
   * kapat" kararının girdisiydi. İkisi de aç/kapa modeline aitti (bkz.
   * SwipeWrapper'ın başındaki not).
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /** Pan ile simultaneous çalışan Gesture.Native() örneği. */
  nativeScrollGesture?: ReturnType<typeof Gesture.Native>;
  /*
   * `fireProgress` (pull-down Fire doluluk oranı) ve `pullActive` (parmak
   * ekranda mı) KALDIRILDI: ikisi de kapaktaki alev canvas'ının yanmasını
   * sürüyordu. Alev artık cam bir butonun içindeki duragan glif — kartın
   * çekişten haber almasına gerek kalmadı. Jestin kendi geri bildirimi
   * SwipeWrapper'da (haptic rampası) ve FirePullHint'te duruyor.
   */
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
  /*
   * ── `hideExpandHint` ve `onExpandPress` KALDIRILDI ────────────────────────
   * İlki kapağın altındaki "yukarı kaydır" ipucunu gizliyordu (önizleme
   * sheet'leri kartı zaten AÇIK gösteriyor, kaydırılacak bir şey yok), ikincisi
   * o ipucuna dokunmayı expand/collapse toggle'ına bağlıyordu. İpucu
   * kaldırılınca (istek) ikisinin de okuyanı kalmadı; gerekçenin tamamı
   * çizildiği yerde. `hideExpandHint`in adı bir dönem `hideChevron`dı — orada
   * metin değil bir ok vardı.
   */
  hideFire?: boolean;
  /**
   * Kartın çizildiği uygulama modu — Fire/Spark butonunun rengini ve adını
   * belirliyor (Flört kırmızı "Fire" / Arkadaş yeşil "Spark"). Verilmezse
   * Dating: akıştan açılan kart gibi modu bilmeyen çağıranlar bozulmasın.
   *
   * NOT: kartın NOT glifi (NoteGlyph'in `swipeHeartBorder` kenarı) moda göre
   * DEĞİŞMİYOR — not ayrı bir ürün ve iki modda da aynı balonu taşıyor.
   */
  mode?: AppMode;
  /**
   * Ağır panel kendi kendine ısınsın mı (bkz. profileReady).
   *
   * `false` YALNIZ REWIND YUVASINDA: orada kart ekranda DEĞİL, yalnız ölçülmek
   * için mount ediliyor ve kullanıcı geri al'a hiç basmayabilir. O kartın
   * panelini de kurmak her pass'tan sonra bir tam ekran cam zemin daha açardı —
   * ödediğimiz bedel, kazandığımızdan büyük olurdu.
   *
   * Kart yuvadan çıkıp ekrana geldiğinde prop `true`ya dönüyor ve ısınma orada
   * başlıyor; panel kapağın altında kaldığı için gecikmesi görünmüyor.
   */
  panelWarmup?: boolean;
  /**
   * Kartın en altındaki kırmızı moderasyon ikonları. VERİLMEZSE ÇİZİLMEZ —
   * kendi profilini önizlediğin yerde (ProfileScreen > PreviewModal) bu
   * ikonların çıkmaması buna bağlı.
   */
  onReport?: () => void;
  onBlock?: () => void;
  /**
   * Kapağın sağ alt kolonundaki "üç nokta" — verilmezse buton hiç çizilmez.
   *
   * Kart bir sheet AÇMIYOR: hangi profilin seçeneklerinin açıldığını bilen taraf
   * ekranın kendisi (bkz. DiscoverScreen > ProfileOptionsSheet). Şikayet/engelle
   * de zaten oradan geçiyor.
   */
  onMenu?: () => void;
  superLikesRemaining?: number | null;
  /**
   * Not (yorumlu beğeni) gönderme isteği — hedefiyle birlikte.
   *
   * VERİLMEZSE not kutuları hiç çizilmez: kendi profilini önizlediğin yerde
   * (ProfileScreen > PreviewModal) ve Likes önizlemesinde kendine/karşı tarafa
   * not gönderilemez. TEK KAPI BU PROP.
   *
   * ⚠️ `previewMode` BİR DÖNEM AYNI SONUCU VERİYORDU ve kutular ona da bağlıydı;
   * "iki kapı da aynı şeyi söylüyor" diye zararsız görünüyordu. Zararsız
   * değildi: akış kartı `previewMode` ile açılıyor AMA not gönderebiliyor, o
   * yüzden `onNote` orada sessizce ÖLÜ kaldı — kart not kutusu olmadan açıldı.
   * Gate'ler kaldırıldı (bkz. SectionPhoto > hideNote).
   */
  onNote?: (target: NoteTarget) => void;
  /**
   * Kapağın alt chrome'u (yazı bloğu + sağ buton kolonu) ARTIK YERİNDE — bir kez
   * çağrılır.
   *
   * Neden var: o blokların yerleşimi ÖLÇÜME bağlı (kartın boyu, yazı bloğunun
   * yüksekliği, ortak nokta satırının yüksekliği, pillerin paketlenmesi) ve
   * ölçümler ilk karede henüz yok. İlk kartta bu sıçrama kullanıcının gözünde
   * oluyordu: butonlar bir hizalanıyor, ortak nokta pilleri bir kaybolup geri
   * geliyordu. Keşif bu haberi bekleyip iskeleti o ana kadar ekranda tutuyor
   * (bkz. DiscoverScreen > coverSettled).
   *
   * YALNIZ ÜST KART ve yalnız Keşif (previewMode'da çağrılmıyor): alttaki kart
   * zaten üstünün ardında ölçülüyor, önizlemede kapak hiç çizilmiyor.
   */
  onCoverReady?: () => void;
}

/**
 * Ağır panelin kurulmasından önce beklenen süre — kartın KENDİ mount'undan
 * sayılıyor (bkz. profileReady).
 *
 * Tek işi swipe'ın son karesini geçirmek: destenin yeni alt kartı tam o karede
 * doğuyor, paneli de aynı anda kursak kazanılan bir şey olmazdı. Ondan
 * sonrası boş zaman — bir sonraki swipe'a kadar ~yarım saniye var ve panel o
 * aralıkta sessizce kuruluyor.
 */
const PANEL_WARMUP_MS = 240;

/**
 * Rewind yuvasına düşen kartın panelini bırakma gecikmesi (bkz. profileReady).
 *
 * Isınmadan UZUN ve kasıtlı: swipe'ın hemen ardından gelen geri almada panel
 * hiç sökülmemiş oluyor (kart olduğu gibi dönüyor), sökülme ise swipe karesinin
 * çoktan geçtiği boş zamana düşüyor.
 */
const PANEL_COOLDOWN_MS = 700;

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
  onFire,
  scrollY,
  scrollRef,
  nativeScrollGesture,
  isTopCard = true,
  expanded = false,
  previewMode = false,
  hideFire = false,
  mode = DEFAULT_APP_MODE,
  panelWarmup = true,
  zoomImpact,
  onReport,
  onBlock,
  onMenu,
  onNote,
  onCoverReady,
}: SwipeCardProps) {
  useRenderCount("SwipeCard");
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  /**
   * Kartın açılırken YUKARI kalktığı mesafe — SwipeWrapper'daki HEADER_COVER'ın
   * aynısı, aynı sabitten okunuyor. Ayrışırlarsa fotoğraf açılış boyunca
   * ekranda kaymaya başlar.
   */
  const expandedLift = previewMode ? 0 : DISCOVER_CARD_EXPAND_LIFT;

  /**
   * Kabuğun, KAPALI kartın göründüğü alanın altına taşan payı (bkz.
   * SwipeWrapper animatedStyle > `bottom`).
   *
   * SIFIR: kabuk artık hiçbir yere taşmıyor — kart kabı tüm ekran ve lift de 0
   * (bkz. expandedLift). Kutu, kabın ta kendisi.
   *
   * TARİHÇE: `tabBarInset + expandedLift` idi. Kap üstte şeridin altından
   * başlayıp altta tab bar'a pay bırakırken kabuk o iki payın içine giriyordu;
   * fotoğrafın yüksekliği de bu sayıyı DÜŞEREK hesaplanıyordu ki alt kenarı
   * kapalı kartın göründüğü yerde dursun. Kap tüm ekrana açılınca ikisi de
   * konusuz kaldı.
   */
  const cardBottomDrop = 0;

  /**
   * Kapağın ALT BANDINDAKİ katmanların (isim + pill bloğu, "yukarı kaydır"
   * ipucu, kapak not kutusu) fotoğrafın dibinden yüksekliği.
   *
   * KEŞİF'TE TAB BAR'IN BOYU: kapak artık ekranın dibine kadar iniyor ve yüzen
   * tab bar onun ÜSTÜNE biniyor (bkz. DiscoverScreen'deki kart kabı). Bu pay
   * verilmezse isim/pill bloğu ve ipucu bar'ın ARDINA düşüyor. Kartın kendisi
   * bilerek bar'ın altına giriyor — kaçan yalnız üstündeki yazı.
   *
   * ÖNİZLEMEDE 0: orada kartı bir sheet taşıyor, altında tab bar yok.
   *
   * Bir dönem Keşif'te de 0'dı — o dönem kart kabı bar'a pay bırakıyordu, yani
   * fotoğrafın dibi zaten bar'ın üstünde bitiyordu.
   */
  const coverBottomInset = previewMode
    ? 0
    : discoverTabBarInset(insets.bottom);

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
  /*
   * ── PANELİN BEKLEME MESAFESİ (`panelSlideTravel`) KALDIRILDI ──────────────
   * Panelin kapalı kartta ekranın dibinin de altında bekleyeceği yol:
   * `tabBarInset − PROFILE_PANEL_GAP + PANEL_SLIDE_MARGIN`. Panel artık
   * beklemiyor, kapağın altında statik duruyor (bkz. yukarıdaki not).
   */

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

  // Diğer fotoları arka planda prefetch. Artık panelde bölümlerin arasında
  // GERÇEKTEN render ediliyorlar (bkz. SectionPhoto), ama o ağaç
  // `PANEL_WARMUP_MS` kadar geciktiriliyor — prefetch o kadarlık bir avans
  // veriyor, panel kurulduğunda fotoğraflar cache'ten gelir.
  // Sadece TOP card için: alt kartın paneli de artık kuruluyor, yani fotoları
  // zaten `SectionPhoto` çekiyor — buradaki avansa gerek yok, kapı sırf aynı
  // isteği iki yerden başlatmamak için duruyor.
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
  const localExpandAnim = useSharedValue(1);

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
  const topChromeAnim = useDerivedValue(
    () => (isTopCard ? cardChromeAnim.value : 0),
    [isTopCard],
  );

  /**
   * ── AÇILMA ORANI ARTIK SABİT 1 ────────────────────────────────────────────
   *
   * Kartın "kapalı" bir hâli kalmadı (bkz. SwipeWrapper'ın başındaki not):
   * kapak tüm ekranı kaplıyor, panel onun hemen altında statik duruyor ve
   * içerik ilk dokunuşta kaydırılıyor. Bu kanalın sürdüğü her şey — panelin
   * konumu, zemin tülü, kabuğun boyaması — o yüzden açık uçta donuyor.
   *
   * Sabit bir SharedValue olarak duruyor, ham `1` değil: onu okuyan bir düzine
   * `useAnimatedStyle` var ve hepsini teker teker sadeleştirmek yerine tek
   * yerden besliyoruz. `localExpandAnim` artık iki bağlamda da 1.
   *
   * Burada bir `topExpandAnim` vardı (global `cardExpandAnim`i yalnız üstteki
   * karta süzen türev): deste global bir oran okuduğu için arkadaki kart da
   * açık geometriye geçiyor ve üstteki yana kaydırılırken altından açık hâliyle
   * çıkıyordu. Oran sabitlenince süzülecek bir şey kalmadı.
   */
  const expandAnim = localExpandAnim;

  /**
   * Kapak KROMUNUN devri — panelin açılışından AYRI zamanlanıyor.
   *
   * Krom = kapağın üstünde duran ve açık kartta yeri olmayan katman: isim +
   * pill bloğu, "yukarı kaydır" ipucu ve serbest Fire alevi (o sönmez,
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
   * Üst şeridin (sağ üstte Fire, solda isim satırı) köşe diyagonalinden aşağı
   * kayma payı — bkz. CARD_CHROME_TOP_DROP (şu an 0).
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

  /**
   * ── AĞIR PANEL, KART DESTENİN ALTINDAYKEN KURULUYOR ───────────────────────
   *
   * Kapı bir dönem `isTopCard`'a bağlıydı: panel kart ÜSTE GEÇTİKTEN 100 ms
   * sonra mount oluyordu. Yanlış pencere — swipe'ın bittiği an zaten günün en
   * kalabalık karesi: giden kart unmount oluyor, DiscoverScreen deste
   * memo'sunu yeniden türetiyor, destenin yeni ALT kartı sıfırdan mount
   * ediliyor. Panelin 26 bölüm kutusu, pil ölçüm turları, bölüm fotoğrafları
   * ve statik harita görseli de tam oraya düşüyordu; kullanıcının gördüğü
   * "kart uçtu, arayüz bir an dondu".
   *
   * O kapıyı bir kez kaldırıp ("Test A") lag aynı çıktığı için panel aklanmıştı
   * — AMA O TEST YANLIŞ KURULMUŞTU: gate'i kaldırmak işi ortadan kaldırmıyor,
   * yalnız "üste geçtikten 100 ms sonra"dan "alt kart mount olurken"e taşıyor
   * ve alt kart da zaten aynı karede mount ediliyor. İki hâlde de maliyet aynı
   * yere düşüyor, o yüzden fark görülmedi.
   *
   * Şimdiki kapı KARTIN KENDİ MOUNT'UNDAN sayıyor ve bir daha kapanmıyor: kart
   * destenin altındayken, iki swipe arasındaki boş zamanda kuruluyor. Üste
   * geçtiğinde kurulacak hiçbir şey kalmıyor — `isTopCard` değişimi artık
   * yalnız bir re-render.
   *
   * SÜRE, swipe'ın son karesini BEKLEMEK İÇİN: alt kart tam o karede doğuyor,
   * paneli de aynı anda kursaydık hiçbir şey kazanmazdık.
   *
   * ⚠️ GERİ ALMA REÇETESİ: belirti "alt kart örtülüyken de cam zemin çiziliyor,
   * sürükleme kasıyor" ise suçlu bu kapı (iki kart birden tam ekran BlurView
   * taşıyor). O zaman kapıyı `isTopCard`a geri bağla — ama panelin mount
   * maliyeti swipe karesine geri döner, ölçümü ona göre yap.
   *
   * ÖNİZLEMEDE ERTELEME YOK: bekletecek bir swipe animasyonu yok ve kapak
   * fotoğrafı da çizilmediği için (bkz. previewMode dalı) gösterilecek bir şey
   * kalmıyordu — sheet boş açılıp panel sonradan patlıyordu.
   */
  const [profileReady, setProfileReady] = useState(previewMode);
  useEffect(() => {
    if (previewMode) return;
    // İki yön, iki süre:
    //   • Isınma (panelWarmup) — kart destede, sırası gelecek.
    //   • SOĞUMA — kart rewind yuvasına düştü (bkz. prop'un notu): geri alma
    //     ihtimali için mount KALIYOR ama ağır paneli bırakıyor, yoksa üç kart
    //     birden tam panel taşırdı. Gecikme ŞART: panel swipe'ın tam o
    //     karesinde sökülseydi, kaçınmaya çalıştığımız işin aynısını bu kez
    //     unmount olarak yapardık.
    // Kullanıcı o pencerede geri alırsa panel hiç sökülmüyor — zamanlayıcı
    // iptal oluyor ve kart panelli dönüyor.
    const id = setTimeout(
      () => setProfileReady(panelWarmup),
      panelWarmup ? PANEL_WARMUP_MS : PANEL_COOLDOWN_MS,
    );
    return () => clearTimeout(id);
  }, [previewMode, panelWarmup]);

  /**
   * Kartın AÇIKKEN varacağı köşe yarıçapı. İki bağlamda farklı ve bu FARK
   * KASITLI:
   *
   * ARTIK İKİ DAL AYNI SAYIYA ÇIKIYOR ve dal bilerek duruyor: her bağlamın
   * yarıçapını KENDİ zincirinden okuduğunu gösteriyor, ikisi tesadüfen eşit
   * değil (bkz. CARD_EXPANDED_CORNER_RADIUS — o da kart yüzünden türüyor).
   *
   *   - KEŞİF'TE KAPALIDAKİNİN AYNISI (CARD_FACE_CORNER_RADIUS): köşe açılma
   *     boyunca HİÇ DEĞİŞMİYOR, kart aynı yuvarlaklıkta büyüyor. Aradaki
   *     interpolasyon (bkz. cardCornerRadius) böylece Keşif'te no-op.
   *   - Önizlemede kartı bir sheet taşıyor; kabuk sheet'in clip'iyle aynı sayıyı
   *     okumak ZORUNDA, ayrışırlarsa köşede hilal kalıyor. O yüzden varış orada
   *     sheet'in sayısı — istekle Keşif'inkine eşitlendi (istek: "önizleme
   *     kartlarının üst köşeleri Keşif'teki ana kartla aynı olsun").
   *
   * TARİHÇE: Keşif'te varış CARD_OPEN_CORNER_RADIUS (26) idi — kart açılırken
   * 44'ten oraya iniyor, yani kareleşiyordu. Gerekçesi "açık kart ekranın
   * kenarına dayanıyor, 44 telefonun köşe maskesinden yuvarlak kalıp kenarda
   * sayfa zemininden ince bir hilal bırakıyor"du; o hilal ÜST köşelerde artık
   * mümkün değil (kart safe-area çizgisinde başlıyor, donanım köşesinden uzak),
   * altta ise kabuk zaten ekranın dibinin altına taşıyor. Sabit köşe istendi ve
   * kareleşme kaldırıldı. Geri istenirse tek satır: buradaki varış değeri.
   */
  const openCornerRadius = previewMode
    ? CARD_EXPANDED_CORNER_RADIUS
    : CARD_FACE_CORNER_RADIUS;

  /**
   * Kapak fotoğrafının köşeleri — DÖRDÜ DE aynı sayı: kapalıda
   * CARD_FACE_CORNER_RADIUS, tam açıkta openCornerRadius. KEŞİF'TE İKİSİ DE 44,
   * yani köşe açılma boyunca sabit (bkz. openCornerRadius).
   *
   * Alt iki köşe bir dönem 0'A kadar iniyordu; gerekçe "açık kartta panel
   * kapağın devamı, dibinde kesilmiş bir kenar okunmamalı"ydı. Panel artık
   * kapağın devamı DEĞİL: aşağıdan gelip altına yapışan ayrı bir yüzey (bkz.
   * panelSlideTravel). Kapağın dibi de o yüzden gerçek bir kenar — düzleşince
   * fotoğraf panelin üstünde köşesiz bir blok gibi duruyordu.
   *
   * Kabuk aynı sayıyı okuyor (cardFrameRadiusStyle): ayrışırlarsa aradaki
   * payda kart zemini (açık modda beyaz) görünür.
   *
   * ÜST İKİSİ TEK İSTİSNA: kabuktan COVER_TOP_RADIUS_OVERFILL kadar DAHA KARE,
   * yani kapak köşeyi taşırıyor ve kırpmayı kabuğa bırakıyor. Yön KRİTİK —
   * daha YUVARLAK olsa aradan beyaz sızar (yukarıdaki not), daha KARE olunca
   * kabuğun eğrisi tek belirleyici kalıyor ve altındaki beyaz yüzeylerin köşesi
   * tamamen kapağın altında kalıyor. Silüet değişmiyor: görünen eğri kabuğun.
   */
  const photoBorderStyle = useAnimatedStyle(() => {
    const r = cardCornerRadius(expandAnim.value, openCornerRadius);
    const top = previewMode
      ? r
      : CARD_FACE_TOP_CORNER_RADIUS - COVER_TOP_RADIUS_OVERFILL;
    return {
      borderTopLeftRadius: top,
      borderTopRightRadius: top,
      borderBottomLeftRadius: r,
      borderBottomRightRadius: r,
    };
  });

  /**
   * Kabuğun köşeleri — ALT İKİSİ kapağın birebir aynısı (bkz. photoBorderStyle).
   * Ayrışırlarsa aradaki payda kart zemini (açık modda beyaz) görünür.
   *
   * ÜST İKİSİ KEŞİF'TE BİR TIK DAHA KARE (CARD_FACE_TOP_CORNER_RADIUS):
   * cihazda sağ/sol üst köşede ince bir beyazlık görünüyordu, gerekçesi ve
   * ikinci yarısı o sabitin notunda. Bu stili kabuk ve panelin boyama kutusu
   * BİRLİKTE okuyor, yani ikisinin köşesi yine aynı sayıda kalıyor.
   *
   * ÖNİZLEMEDE DÖRDÜ DE AYNI: orada kabuk sheet'in clip'iyle zincirli
   * (CARD_EXPANDED_CORNER_RADIUS) — üst köşeyi tek başına oynatmak köşede hilal
   * bırakır. expandAnim de orada sabit 1 (localExpandAnim), yani sonuç sabit.
   */
  const cardFrameRadiusStyle = useAnimatedStyle(() => {
    const r = cardCornerRadius(expandAnim.value, openCornerRadius);
    const top = previewMode ? r : CARD_FACE_TOP_CORNER_RADIUS;
    return {
      borderTopLeftRadius: top,
      borderTopRightRadius: top,
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
  // Zoom SADECE foto katmanına uygulanır (bullets/blur/alev/isim ayrı kardeş
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
   * ── "YUKARI KAYDIR" İPUCUNUN STİLİ DE KALDIRILDI ────────────────────────
   *
   * `expandHintAnimStyle` buradaydı: kayma kromdan, sönme expand'in SON
   * bandından (0.55→1) geliyordu — isim/pill çekilirken ipucu duruyor, panel
   * yolun yarısını geçince gidiyordu. İpucunun kendisi kaldırıldı (istek,
   * gerekçesi çizildiği yerde), sürecek bir şey kalmadı.
   *
   * Daha öncesinde aynı yerde `expandAnim` ile 180° dönen bir chevron vardı ve
   * açık kartta kapatma düğmesi işi görüyordu; o da gitmişti. Kapatma yalnız
   * aşağı kaydırmayla.
   */

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
   *   • Keşif'te ayrıca `profileReady`: zemin panelin bir parçası, onunla
   *     birlikte kuruluyor. Kapı bir dönem `isTopCard && profileReady`'ydi
   *     ("arkadaki kart örtülü, orada tam ekran bir zemin kurmanın karşılığı
   *     yok") ve `isTopCard` payı KALDIRILDI: panel artık kart destenin
   *     altındayken ısınıyor (bkz. profileReady), zemin de onunla gelmek
   *     ZORUNDA — kutular düz yüzeyle mount olup cam yüzeye sonradan geçerse
   *     `CardSectionBox` tip değiştiriyor ve panelin tamamı tam da kaçındığımız
   *     karede yeniden mount oluyor.
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
  const glassPanel = !!profile?.photos?.[0] && (previewMode || profileReady);

  /**
   * KABUĞUN cam yolu — zemin (CardGlassBackdrop) ve onun görünmesi için şeffaf
   * bırakılan katmanlar. `glassPanel`DEN AYRI ve KAPISIZ.
   *
   * Ayrılmasının sebebi görünür bir hata: zemin de panelin kapısına bağlıyken
   * kart ekrana `theme.bg` ile geliyor, ısınma bitince (PANEL_WARMUP_MS) zemin
   * bir anda altına giriyordu. Fotoğrafın dibiyle kartın dibi arasındaki bant —
   * yüzen tab bar'ın ardında kalan şerit — bu yüzden önce koyu gelip sonra
   * açılıyordu. Rewind'de apaçık görülüyordu: oraya gelen kart hiç ısınmamış
   * oluyor (yuvada paneli kurulmuyor, bkz. panelWarmup).
   *
   * Zeminin ertelenecek bir maliyeti de yok: tek bir blur'lu fotoğraf, kartın
   * geri kalanıyla aynı karede kuruluyor.
   *
   * BÖLÜM KUTULARI AYRI KALDI (glassPanel): onların camı ilk layout turunda
   * kurulmak ZORUNDA (bkz. "CAM KURULUMUNU GECİKTİRME" notu), yani panelle
   * birlikte doğup birlikte gitmeli. Panel ekranın altında, görünmüyor —
   * gecikmesinin bedeli yok.
   *
   * ÖNİZLEMEDE `glassPanel` İLE AYNI DEĞER (ikisi de fotoğrafa bakıyor): oradaki
   * davranış değişmiyor, zemini zaten sheet çiziyor.
   */
  const coverGlass = !!profile?.photos?.[0];

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
  /*
   * ── PANELİN "AŞAĞIDAN GELME" HAREKETİ KALDIRILDI (istek) ──────────────────
   *
   * `profileInfoAnimStyle` buradaydı: panel kapalı kartta ekranın dibinin de
   * altında bekliyor (`panelSlideTravel`), krom devriyle yukarı süzülüp kapağın
   * altına yapışıyordu. Kanal bilerek `chromeAnim`di — panel, kapağın isim/pill
   * bloğu çekilirken geliyor, blok gidince yerine oturmuş oluyordu.
   *
   * Kartın kapalı hâli kalkınca (bkz. SwipeWrapper'ın başındaki not) hareketin
   * dayanağı da kalmadı: bölümler kapağın hemen altında STATİK duruyor,
   * kaydırdıkça oradan çıkıyorlar. Kanal krom olduğu için devir scroll'a
   * bağlandığında panel KAYDIRDIKÇA yukarı süzülmeye başlıyordu — istenen bu
   * değildi.
   *
   * Mesafe artık tek bir layout sayısı: panelin `marginTop`u = PROFILE_PANEL_GAP
   * (bkz. oradaki not), animasyonsuz.
   */

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
  /*
   * ── ZEMİNİN TÜLÜ KALDIRILDI ──────────────────────────────────────────────
   *
   * `backdropVeilStyle` buradaydı: kapalı kartta blur'lu zemini örten düz
   * `theme.bg` katmanının opaklığı (`1 - chromeAnim`). Gerekçesi kabuğun
   * kapaktan UZUN olmasıydı — aradaki bant kapalı kartta tab bar'ın ardından
   * sızıyordu.
   *
   * O bant kalmadı (kabuk = kap = kapak, bkz. cardBottomDrop) ve kartın kapalı
   * hâli de kalmadı; tül kalsaydı krom devriyle birlikte KAYDIRDIKÇA açılan bir
   * perde olurdu.
   */

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
  /*
   * ── KAPAĞIN DİBİNDEKİ RAMPA ARTIK SÖNMÜYOR (istek) ───────────────────────
   *
   * `bottomBlurAnimStyle` buradaydı: `1 - expandAnim`, yani kart açılırken
   * rampa sönüyordu — gerekçe "açık kartta kapağın dibi panelle komşu ve isim
   * bloğu zaten çekilmiş, rampa orada yalnız fotoğrafı karartır"dı.
   *
   * Kart artık HEP açık, yani o kural rampayı KALICI olarak söndürüyordu:
   * fotoğrafın dibi çıplak kalıyordu. İstenen tersi — ana fotoğrafın iki ucu da
   * progressive blur — tepesini artık sticky şerit taşıyor. Rampa sabit, kendi maskesi
   * zaten yukarı doğru sönüyor.
   */

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

  /*
   * ── `coverTopAnchorStyle` KALDIRILDI ──────────────────────────────────────
   *
   * Kapağın ÜST kenarından `top` ile konumlanan katmanları görünür bantta tutan
   * telafiydi: fotoğraf kabuktan uzun ve `-PHOTO_CROP` konumunda duruyor, yani
   * üst ucundan o kadarı kırpılıyor — `top: 0` ile yerleşen bir katman o
   * kırpılan bantta kalıp hiç görünmüyordu.
   *
   * Okuyanı kalmadı: kapağın tepesindeki rampa kaldırıldı (bkz. oradaki not) ve
   * serbest Fire alevi de `top` ile değil, sağ alt aksiyon kolonunda `bottom`
   * ile yerleşiyor. ALT kenardan ölçülen katmanların böyle bir derdi yok — o
   * kenar kırpılmıyor.
   */

  /*
   * ── `coverNoteAnimStyle` KALDIRILDI ───────────────────────────────────────
   * Kapaktaki not kutusunun geliş animasyonuydu: isim/pill bloğu 0→0.55'te
   * kaybolurken kutu 0.55→1'de beliriyordu (iki katman aynı bantta üst üste
   * binmesin diye). Kutu artık sağ alt aksiyon kolonunda ve hep orada — ayrıca
   * zemini CAM oldu, yani ata opaklığı efekti öldüreceği için böyle bir sönme
   * zinciri zaten kurulamaz.
   */

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
  // de bakılıyor) ek atlanıyor.
  //
  // Kuralın kendisi likerCardTeaser.relationshipIntentLabel'da, TEK yerde:
  // kilitli beğeni kartı da aynı etiketi basıyor, iki kopya ayrışmasın.
  /**
   * Arkadaşlık niyetlerinin GÖRÜNEN etiketleri.
   *
   * Sıra: sunucunun `friendshipIntentsDisplay`i → i18n yedeği → ham enumName.
   * Sunucu önce geliyor çünkü yeni bir niyet eklendiğinde uygulama sürümü
   * çıkmadan görünebilmeli (prompt kataloğunun aynı kuralı).
   */
  const friendshipIntentLabels = useMemo<string[]>(() => {
    const keys: string[] = Array.isArray((profile as any)?.friendshipIntents)
      ? (profile as any).friendshipIntents.filter(
          (v: any) => typeof v === "string",
        )
      : [];
    if (keys.length === 0) return [];
    const display: string[] = Array.isArray(
      (profile as any)?.friendshipIntentsDisplay,
    )
      ? (profile as any).friendshipIntentsDisplay
      : [];
    return keys.map((key, i) => {
      const fromServer = typeof display[i] === "string" ? display[i] : "";
      if (fromServer) return fromServer;
      return t(`discover.friendshipIntents.${key}`, { defaultValue: key });
    });
  }, [
    (profile as any)?.friendshipIntents,
    (profile as any)?.friendshipIntentsDisplay,
    t,
  ]);

  const relationshipIntentLabel = useMemo(
    () =>
      resolveRelationshipIntentLabel(
        t,
        profile?.relationshipIntent,
        profile?.relationshipIntentDisplay,
      ),
    [profile?.relationshipIntentDisplay, profile?.relationshipIntent, t],
  );

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

  // Scroll referansı DIŞARIDAN gelebiliyor (SwipeWrapper tepedeki kartın
  // scroll'una erişmek istiyor); verilmezse kart kendi ref'ini kullanır.
  const localScrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollViewRef = scrollRef ?? localScrollRef;

  /**
   * İçeriği başa sar — şeridin sol ucundaki yukarı okun işi.
   *
   * ANİMASYONLU: mesafe bir ekran boyundan uzun ve anında zıplamak kullanıcıyı
   * nerede olduğundan koparıyor. Krom devri buna ayrıca bakmıyor — scroll 0'a
   * inerken eşiği geçiyor ve şerit kendi süresiyle sönüyor (bkz. chromeHandoffY).
   */
  const scrollToTop = useCallback(() => {
    const sv = scrollViewRef.current as unknown as {
      scrollTo?: (opts: { y: number; animated: boolean }) => void;
    } | null;
    sv?.scrollTo?.({ y: 0, animated: true });
  }, [scrollViewRef]);

  /**
   * ── ÜST CHROME'UN DEVRİ: SCROLL EŞİĞİ + KENDİ SÜRESİ ──────────────────────
   *
   * Devreden katmanlar: kapaktaki isim + pill bloğu ve kapak rampaları (gider),
   * sticky şerit (gelir), ekranın üstündeki cam geri al/filtre butonları
   * (gider — bkz. DiscoverScreen > headerRevealStyle). Hepsi `cardChromeAnim`i
   * okuyor; yazan tek yer burası.
   *
   * EŞİK, ORAN DEĞİL (istek): "kaydırmaya bağlı olmadan animasyona girerek
   * yavaşça" — yani parmakla scrub edilmiyor, eşik geçilince devir kendi
   * süresiyle (CHROME_FADE) akıyor. Bir dönem oran doğrudan çekişe bağlıydı ve
   * yazılar jestin ortasında yarı saydam asılı kalıyordu.
   *
   * EŞİK KAPAĞIN KENDİ İSMİNDEN TÜRÜYOR, sabit bir sayı değil: kapaktaki isim
   * satırı şeridin başlık çizgisinin altına girdiği anda devrediyor — iOS'un
   * large-title devrinin aynısı. Elle yazılmış bir sayı, farklı ekran
   * boylarında ismin çok öncesinde ya da çok sonrasında tetiklenirdi.
   *
   * HİSTEREZİS: iki eşik arası bant (CHROME_HYSTERESIS) — tam eşikte duran
   * parmak birkaç pikselik titremeyle devri ileri geri açıp kapatmasın.
   */
  /**
   * Kapaktaki yazı bloğunun ölçülen yüksekliği (isim + yaş, aktiflik satırı,
   * üniversite / ortak nokta pilleri). Dipteki rampanın boyu bundan türüyor.
   *
   * ÖLÇÜM ŞART, hesap değil: bloğun içi profile göre değişiyor — aktiflik satırı
   * koşullu, pill sayısı değişken, uzun isim ikinci satıra düşüyor. Elle yazılan
   * bir sayı kimi kartta ismin tepesini perdesiz bırakırdı.
   */
  const [coverTextHeight, setCoverTextHeight] = useState(0);
  const handleCoverTextLayout = useCallback((e) => {
    // nativeEvent SENKRON okunuyor — synthetic event handler dönünce havuza
    // geri alınıyor (aynı not kartın onLayout'unda da var).
    const h = e.nativeEvent.layout.height;
    setCoverTextHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  /**
   * Dipteki rampanın boyu — fotoğrafın dibinden İSMİN ÜSTÜNE kadar.
   *
   * Üç terim: tab bar'ın altına giren pay (coverBottomInset), bloğun bar'ın
   * üstünde bıraktığı nefes (COVER_NAME_BOTTOM) ve bloğun kendi boyu. Üstüne
   * sönme kuyruğu (COVER_TEXT_RAMP_TAIL) ekleniyor.
   *
   * Blok henüz ölçülmediyse yalnız yazısız bant + kuyruk kadar: ilk karede
   * rampa kısa doğuyor, ölçüm gelince yerine oturuyor. Sıfır vermekten iyi —
   * fotoğrafın dibi hiçbir karede çıplak kalmıyor.
   */
  const coverTextRampHeight =
    coverBottomInset +
    COVER_NAME_BOTTOM +
    coverTextHeight +
    COVER_TEXT_RAMP_TAIL;

  /**
   * Kapağın alt chrome'unu KAYDIRIRKEN YERİNDE TUTAN pay.
   *
   * `translateY = min(scrollY, tavan)`:
   *   • Tavana kadar — parmak ne kadar kaydırırsa katman o kadar aşağı
   *     ötelenir, yani EKRANDA kıpırdamaz. "Sticky" olan kısım bu.
   *   • Tavandan sonra — öteleme donuyor, katman fotoğrafla birlikte yukarı
   *     gidiyor. Tavan tam olarak "fotoğrafın dibine COVER_STICKY_EDGE_GAP
   *     kala" demek: blok fotoğrafın dibinden zaten o kadar yukarıda
   *     (COVER_NAME_BOTTOM + tab bar payı), aradaki fark kadar pinlenebiliyor.
   *
   * Bloğun kaybolması BURADA DEĞİL: onu krom devri yapıyor (nameAnimStyle /
   * pillsAnimStyle, chromeAnim) — yani şerit ismi devralana kadar ekranda
   * kalıyorlar.
   *
   * ⚠️ SAĞ KOLONDA CAM VAR. Uygulamada kimliksel olmayan bir ata transform'u
   * cam efektini sessizce yok edebiliyor (kodda birkaç yerde uyarı olarak
   * duruyor). Burada bilerek göze alındı, çünkü istenen hareketin başka yolu
   * yok; riski sınırlayan iki şey: (a) kurulum anı temiz — katmanlar
   * scrollY=0'da, yani transform KİMLİKSELken doğuyor; (b) öteleme küçük ve
   * üst sınırı var. Cihazda kabuklar kaybolursa çare transform'u kolondan
   * almak: kolonu scroll'un dışına çıkarıp kart çerçevesine sabitlemek (o
   * zaman iki taraf farklı hareket eder).
   */
  /**
   * Kapaktaki ORTAK NOKTA satırının ölçülen yüksekliği (rozet + piller).
   *
   * Buton kolonunun tabanı bu satırın ÜSTÜNE çekiliyor (istek): piller artık
   * sağa doğru da uzayabiliyor, çünkü altlarındaki şeridi butonlar
   * kaplamıyor. Kolon üniversite satırının diziliminde bitiyor.
   *
   * ÖLÇÜM, hesap değil: satır sarmalı (`flexWrap`) ve pill sayısına göre bir ya
   * da iki satır olabiliyor; sabit bir sayı iki satırlık kartlarda kolonu
   * pillerin üstüne bindirirdi.
   */
  /**
   * Buton kolonunun yanından geçen satırların sağ payı.
   *
   * Kolonun sol kenarı ile yazı bloğunun sağ kenarı arasındaki fark + nefes:
   * kolon bloktan DAHA DIŞARIDA başlıyor (COVER_ACTION_RIGHT <
   * CHROME_EDGE_INSET), o fark da hesaba katılıyor. Pay verilmezse uzun isimler
   * ve üniversite satırı butonların ALTINA giriyor — isim `flexShrink` ile
   * kırpılıyor ama bloğun genişliğine göre, kolonu bilmeden.
   *
   * EN ALTTAKİ SATIRA VERİLMİYOR: kolon pillerin üstünde bitiyor (istek).
   */
  const coverActionClearance =
    COVER_ACTION_SIZE +
    (COVER_ACTION_RIGHT - CHROME_EDGE_INSET) +
    COVER_ACTION_GAP;

  const [coverPillsHeight, setCoverPillsHeight] = useState(0);
  const handleCoverPillsLayout = useCallback((e) => {
    const h = e.nativeEvent.layout.height;
    setCoverPillsHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  }, []);

  /**
   * Ortak nokta pilleri paketlendi mi (bkz. PillFlow > onPacked).
   *
   * Satır sayısı paketlemeyle DEĞİŞEBİLİYOR (ölçüm turu `flexWrap` ile verilen
   * sırayı çiziyor, paketlenmiş tur first-fit ile diziyor) — yani kolonun
   * tabanını besleyen `coverPillsHeight` iki kez oturuyor. "Yerinde" demek için
   * ikisini birlikte beklemek gerekiyor.
   */
  const [coverPillsPacked, setCoverPillsPacked] = useState(false);
  const handleCoverPillsPacked = useCallback(() => {
    setCoverPillsPacked(true);
  }, []);

  /**
   * Kapağın alt chrome'u yerine oturdu mu — iskeletin beklediği haber
   * (bkz. onCoverReady).
   *
   * Dört ölçüm: kartın boyu (yazı bloğu ve kolon bundan önce hiç
   * ÇİZİLMİYOR), yazı bloğunun yüksekliği (dipteki rampa ve sağ pay bundan
   * türüyor) ve ortak nokta satırı varsa onun yüksekliği + paketlenmesi
   * (kolonun tabanı bu ikisinden).
   *
   * Satır hiç yoksa (ortak nokta da "burada yeni" de yok) beklenecek bir şey
   * yok — kolon doğrudan yazı bloğunun hizasında doğuyor.
   */
  const hasCoverPills = showNewBadge || thingsInCommon.length > 0;
  const coverReady =
    measuredCardHeight > 0 &&
    coverTextHeight > 0 &&
    (!hasCoverPills || (coverPillsHeight > 0 && coverPillsPacked));
  /**
   * HABERİ KİMİN VERECEĞİNE ÇAĞIRAN KARAR VERİYOR — burada `isTopCard` kapısı
   * YOK ve olmamalı: Keşif'te rewind, geri gelen kartı ÜST KARTIN ARDINDA
   * ölçtürüyor (bkz. DiscoverScreen > rewindWarmup) ve haberi veren tam olarak
   * o alt kart. Kapı burada olsaydı ısınan kart hiç haber vermez, kart da hiç
   * üste geçmezdi. Prop'u yalnız muhatap karta geçirmek çağıranın işi.
   */
  const coverReadyNotifiedRef = useRef(false);
  useEffect(() => {
    if (previewMode || !coverReady) return;
    if (coverReadyNotifiedRef.current) return;
    coverReadyNotifiedRef.current = true;
    onCoverReady?.();
  }, [coverReady, previewMode, onCoverReady]);

  const coverStickyMax = Math.max(
    0,
    COVER_NAME_BOTTOM + coverBottomInset - COVER_STICKY_EDGE_GAP,
  );
  const coverStickyStyle = useAnimatedStyle(() => {
    if (previewMode) return { transform: [{ translateY: 0 }] as const };
    const y = Math.max(0, scrollY?.value ?? 0);
    return {
      transform: [{ translateY: Math.min(y, coverStickyMax) }] as const,
    };
  });

  const chromeHandoffY =
    photoWindowOpen -
    (COVER_NAME_BOTTOM + coverBottomInset) -
    (cornerDrop + CARD_HEADER_TITLE_BOTTOM);

  useAnimatedReaction(
    () => {
      const y = scrollY?.value ?? 0;
      return y >= chromeHandoffY + CHROME_HYSTERESIS
        ? 1
        : y <= chromeHandoffY - CHROME_HYSTERESIS
          ? 0
          : -1; // bant içinde: kararı değiştirme
    },
    (next, prev) => {
      if (next < 0 || next === prev || !isTopCard || previewMode) return;
      cardChromeAnim.value = withTiming(next, CHROME_FADE);
    },
    [chromeHandoffY, isTopCard, previewMode],
  );

  /*
   * ── ALEVİN YANMA SAATLERİ KALDIRILDI (istek) ──────────────────────────────
   *
   * Burada iki saat ve iki mandal vardı; hepsi Skia ile çizilen alev silüetini
   * (FireBurnCanvas) sürüyordu:
   *   `firePressAnim` / `firePressHeld` — ikona basılı tutunca yanma.
   *   `burnHeat` / `burnPhase`          — `useFrameCallback` ile dalga saati;
   *     oran 0→1 iken frekans BURN_HZ_MIN→MAX, faz 1'de sarılıyor.
   *   `burnGrow`                        — MANDALLI büyüme (jest başladı mı),
   *     ısıdan ayrı kanal: ısı "eşiğe ne kadar kaldı", bu "başladı".
   *
   * Kapaktaki alev artık berrak cam bir butonun içindeki DURAĞAN glif (istek:
   * "basınca davranışı headerdaki gibi liquid glass olsun, ateş çıkmasın
   * icondan") — yanacak bir silüet yok. Geri istenirse `flameBurn` ve
   * `FireBurnCanvas` dosyaları yerinde duruyor; kurulurken bilinmesi gerekenler:
   *   • Büyümenin mandalı ISIYA BAKMAMALI. Isı bırakışta yayla iniyor ve
   *     0.001'in altına saniyeler sonra düşüyor; ona bakan bir mandal parmak
   *     kalktıktan çok sonra kapanıyor, ikon büyük asılı kalıyordu. Doğru
   *     girdiler `pullActive` ve basılı-tutma bayrağı.
   *   • Faz modulo ŞART: sayı büyüdükçe `floor(phase × FRAMES)` hassasiyet
   *     kaybediyor. Sarma diksiz, çünkü bütün harmonikler tam sayı.
   *   • Sönükken ısı VE faz birden sıfırlanmalı — faz ilerlemeyince canvas
   *     silüeti yeniden kurmuyor, dinlenen kart bedava oluyor.
   */

  /*
   * ── `fireMorphStyle` KALDIRILDI ───────────────────────────────────────────
   * Serbest alevin cam butonla ÇAPRAZ SÖNMESİNİ süren stildi: krom kanalında
   * (expandAnim değil) opaklık + cornerDrop kadar kayma. Serbest alev diye bir
   * şey kalmadı — kapaktaki Fire da artık cam bir buton, yani takas edilecek
   * iki şekil yok.
   *
   * O notta duran ve hâlâ geçerli olan kural: alevi RN tarafında ÖLÇEKLEMEYE
   * kalkma. Işımayı da ölçekler ve tabandan pivotlamak `transformOrigin` ile
   * ancak yaklaşık tutturulabiliyor.
   */

  /**
   * Şeridin sağ ucundaki ASILI cam buton (beğen) — kart açılırken belirir.
   * Konumu burada YOK: cornerDrop sabit olduğu için statik style'da duruyor
   * (bkz. aşağıdaki `top`), animasyonlu bir layout prop'u da olmuyor.
   *
   * GİZLEME ÖLÇEKLE, OPAKLIKLA DEĞİL. `opacity: p` ile gizleniyordu ve cam
   * yüzeyler alfayla KAYBOLMUYOR: alfa 0'da bile native taraf efekti çizmeye
   * devam ediyordu. Sonuç, kapalı kartta sağ üstte duran turuncu bir disk —
   * üstelik altındaki gradyanlı serbest alevi de örtüyordu.
   *
   * Ölçek 0'a gitmiyor, 0.01'de duruyor: tam sıfır ölçekte katman kimi karede
   * hiç layout almıyor ve cam geri geldiğinde ilk `layoutSubviews` turunu
   * kaçırıp boş kalabiliyor (efekt o turda kuruluyor).
   */
  const stickyActionStyle = useAnimatedStyle(() => {
    const p = Math.min(
      1,
      Math.max(
        0,
        (chromeAnim.value - STICKY_ACTION_IN_START) /
          (STICKY_ACTION_IN_END - STICKY_ACTION_IN_START),
      ),
    );
    return {
      // Geçiş OPAKLIKLA, boy sabit.
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

  // ── FIRE PARILTISI ARTIK BURADA DEĞİL ────────────────────────────
  // Premium vurgusu (6 sn'de bir soldan sağa geçen shimmer) kalp şeklinde bir
  // `MaskedView` bandı olarak buradaydı. Silüet artık her karede değişebildiği
  // için maske de sabit değil: parıltı, alevi çizen canvas'ın içine taşındı ve
  // aynı path'ten kırpılıyor (bkz. FireBurnCanvas). Ritmi aynı: 1.7 sn
  // süpürme + 4.3 sn bekleme.

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
   * ağacı zaten `profileReady` ile korunuyor.
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
          // `coverGlass` KAPALIYKEN (fotoğrafsız profil) burada kalmak ZORUNDA:
          // o yolda boyama kutusu hiç render edilmiyor (bkz. `coverGlass &&
          // !previewMode` kapısı), kabuk şeffaf bırakılırsa kartın zemini komple
          // kayboluyor. İkisi AYNI bayrağı okumalı — ayrışırlarsa ya zemin ya
          // kabuk kazanır, ikisi de yanlış.
          backgroundColor: coverGlass ? "transparent" : theme.bg,
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
      {coverGlass && !previewMode && (
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
          {/* ÜSTÜNDEKİ DÜZ TÜL KALDIRILDI — gerekçesi yukarıda, stilin
              silindiği yerde. Zemin artık hep açık. */}
        </Animated.View>
      )}

      <ScrollWrapper nativeScrollGesture={nativeScrollGesture}>
        <BounceScrollView
          scrollRef={scrollViewRef}
          scrollY={scrollY}
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
            style={{ backgroundColor: coverGlass ? "transparent" : theme.bg }}
          >
            {/* ANA FOTOĞRAF — YALNIZ önizlemede (Likes / Chat / Profil).
                Orada tam ekran kapak çizilmiyor (bkz. aşağıdaki not), ilk
                fotoğraf akışın ilk bölümü: kartın tepesine ve iki yanına
                dayanan tam kenar blok. Diğer fotoğraflar panelin İÇİNDE,
                bölümlerin arasında, sıraları bozulmadan devam ediyor.

                PANELİN İÇİNDE DEĞİL, KARDEŞİ — ve scroll içeriğinin İLK
                çocuğu. Panelin yatay dolgusu (PANEL_PAD_H) burada yok, yani
                blok iki yanda da kendiliğinden kenara dayanıyor; panelin
                içinde durup dolguyu negatif marjla geri almak iki yanı EŞİT
                ÇIKARMIYORDU (gerekçe SectionPhoto > bleed). Panel hemen
                altından başlıyor ve fotoğrafın altındaki nefesi kendi üst
                dolgusu veriyor.

                NOT KUTUSU `onNote`A BAĞLI (hedef: ana fotoğraf, index 0 —
                Keşif'te kapağın kolonundaki kutuyla AYNI hedef). Çağıran not
                gönderemiyorsa (Profil önizlemesi, "seni beğenenler", sohbet
                kartı) `onNote` hiç verilmiyor ve kutu çizilmiyor; akış kartı
                veriyor çünkü orada not geçerli bir sinyal — Flört'te zorunlu
                iki yoldan biri (bkz. feedCardActions).

                Pinch ile büyütme de AÇIK — o bütün fotoğraflarla aynı kural.

                Top'a çarpma zoom'unu da BU blok taşıyor: Discover'da geri
                bildirimi tam ekran kapak veriyor, önizlemede kapak hiç
                çizilmediği için sinyalin (CardSheetScrollView → zoomImpact)
                görsel karşılığı yoktu. Sadece ANA fotoğraf — aşağıdaki bölüm
                fotoğrafları çarpma anında ekranda bile değil. */}
            {previewMode && allPhotos[0] && (
              // Kap `position: "relative"` — aksiyon kolonu fotoğrafın ALT
              // SAĞINA mutlak oturuyor ve o kolon SectionPhoto'nun KARDEŞİ,
              // çocuğu DEĞİL: fotoğrafın kutusunda `overflow: "hidden"` ve
              // içinde zoom transform'u var; cam butonlar o zincirin altında
              // ya kırpılır ya da (kimliksel olmayan ata transform'u yüzünden)
              // efektlerini hiç render etmez.
              <View style={{ position: "relative" }}>
                <SectionPhoto
                  uri={allPhotos[0]}
                  // Not kutusu BURADAN kolona taşındı (bkz. aşağıdaki
                  // "ÖNİZLEMENİN AKSİYON KOLONU" notu) — `onNotePress`
                  // verilmiyor, `hideNote` zorla kapatıyor. İkisi birden
                  // olmazsa (örn. yalnız `hideNote` unutulursa) aynı hedefi
                  // (index 0) gösteren iki daire aynı köşede üst üste biner.
                  hideNote
                  // Tam kenar: üstten ve yanlardan boşluk yok — YALNIZ bu foto
                  // (bkz. SectionPhoto > bleed).
                  bleed
                  zoomStyle={photoZoomStyle}
                />

                {/* ── ÖNİZLEMENİN AKSİYON KOLONU (istek) ──────────────────────
                    "sadece ana fotonun sağ altında tik ve x butonları olsun
                    aynı discoverscreendeki swipecard gibi".

                    Keşif'in kapak kolonu BURADA ÇİZİLEMİYOR: o kolon tam ekran
                    kapak dalının içinde ve kapak önizlemede hiç render
                    edilmiyor (bkz. aşağıdaki `!previewMode` kapısı) — kartın
                    "kapağı" burada akışın ilk fotoğrafı. O yüzden kolonun
                    önizleme ikizi bu blokta duruyor; kabuk, çap, boşluk ve
                    sıra (tik · X · Fire · not) Keşif'tekiyle AYNI sabitlerden
                    geliyor, yani iki bağlamda tek bir buton dili var.

                    DÖRDÜNCÜ HALKA — NOT: bir dönem kutu burada değil,
                    `SectionPhoto`nun KENDİ tam-genişlikte mutlak katmanındaydı
                    (`alignSelf: flex-end` ile sağ alta oturuyordu) ve bu kolon
                    da AYRICA sağ alta oturuyordu — iki bağımsız katman aynı
                    köşeyi hedefleyince `NoteBox onPhoto` ile `FireGlassButton`
                    (ikisi de aynı çap, aynı cam kabuk: COVER_ACTION_SIZE) üst
                    üste biniyordu. Not artık kolonun İÇİNDE doğuyor, yani
                    "fotoğrafın sağ alt köşesi" artık TEK sahipli — çakışma
                    yapısal olarak imkânsız.

                    `onPress` doğrudan çağıranın karar yoluna gidiyor: sheet
                    isteği atıp kapanıyor (bkz. LikerSwipeModal >
                    triggerAction / triggerFire). `hideActions` (okunur kart —
                    "kaçırdıkların", kendi profilini önizleme) karar
                    butonlarını kaldırıyor ama NOTU DEĞİL (bkz. aşağıdaki
                    koşulun not dalı — `hideActions`'ın dışında): not bağımsız
                    bir sinyal, okunur kartta bile geçerli olabilir.

                    ⚠️ DIŞ KAPI ARTIK SAF `&&` DEĞİL (not dalı `||` ile
                    açılabiliyor) — yani dış kapı açıldı diye üç karar
                    butonunun çizileceği ANLAMINA GELMİYOR. Üçü de (tik, X,
                    Fire) kendi içinde AYRICA `!hideActions &&` taşıyor, tıpkı
                    Keşif'in kapak kolonundaki `!hideActions && onLike` /
                    `!hideActions && onPass` / `!hideActions && !hideFire &&
                    onFire` kalıbıyla (bkz. aşağıdaki kapak bloğu). Bu olmadan
                    `hideActions=true` + `onNote` + (bağımsız bir bayrakla
                    hâlâ verilen) `onLike`/`onPass`/`onFire` kombinasyonunda
                    "okunur kart" üstüne karar butonları sızardı. */}
                {((!hideActions &&
                  !!(onPass || onLike || (!hideFire && onFire))) ||
                  (!!onNote && allPhotos.length > 0)) && (
                  <View
                    style={{
                      position: "absolute",
                      right: COVER_ACTION_RIGHT,
                      bottom: PREVIEW_COVER_ACTION_BOTTOM,
                      alignItems: "center",
                      gap: COVER_ACTION_GAP,
                    }}
                    // Kolonun kendi kutusu dokunma yemiyor, butonlar yiyor:
                    // aradaki boşluklar fotoğrafın pinch jestine kalsın.
                    pointerEvents="box-none"
                  >
                    {!hideActions && onLike && (
                      <CardChromeGlassButton
                        testID="preview-btn-like"
                        onPress={onLike}
                        label={t("likes.likeButton")}
                        systemName="checkmark"
                        fallback={Check}
                        size={COVER_ACTION_SIZE}
                        onMedia
                        // Boyalı tik KEŞİF'TEKİYLE AYNI (istek: "Beğeniler'den
                        // girilen kartlar için de geçerli"). Glif puntosu da
                        // orada olduğu gibi ortak sayıda — bkz. kapak
                        // kolonundaki "GLİF PUNTOSU İÇİN AYRI SABİT YOK" notu.
                        surfaceTint={modeFireTint(mode ?? DEFAULT_APP_MODE)}
                      />
                    )}
                    {!hideActions && onPass && (
                      <CardChromeGlassButton
                        testID="preview-btn-pass"
                        onPress={onPass}
                        label={t("likes.passButton")}
                        systemName="xmark"
                        fallback={X}
                        size={COVER_ACTION_SIZE}
                        onMedia
                      />
                    )}
                    {/* FIRE — kolonun DİBİ, Keşif'teki sırayla aynı.
                        Önizlemede bir dönem yalnız şeridin sağ ucundaki sticky
                        ikizi vardı ve o buton ÖLÜYDÜ: `pointerEvents`i
                        `expanded`a bağlı ve sheet kartı `expanded={false}` ile
                        açıyor, üstelik sheet kendi şeridini aynı köşeye
                        çiziyordu (üç nokta onun altında kalıyordu). O dal
                        artık önizlemede hiç çizilmiyor (bkz. oradaki
                        `!previewMode`), Fire'ın tek yeri burası. */}
                    {!hideActions && !hideFire && onFire && (
                      <FireGlassButton
                        testID="preview-btn-fire"
                        onPress={onFire}
                        // Etiket moda göre: Flört'te "Fire", Arkadaş'ta "Spark".
                        label={t(modeFireNameKey(mode))}
                        mode={mode}
                        variant="clear"
                        size={COVER_ACTION_SIZE}
                      />
                    )}
                    {/* NOT — kolonun DİBİ, Keşif'teki sırayla aynı (tik · X ·
                        Fire · not). Hedef Keşif'teki KAPAĞIN kutusuyla aynı
                        fotoğraf (bkz. yukarıdaki `onNotePress` notu). */}
                    {!!onNote && allPhotos.length > 0 && (
                      <NoteBox onPress={noteHandler(photoNoteTarget(0))} onPhoto />
                    )}
                  </View>
                )}
              </View>
            )}

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
                serbest alev — hepsi önizlemede zaten gizli ya da görünmezdi.

                Yerini KART ZEMİNİNDE bir boşluk almıyor: panel kartın tepesine
                dayanıyor. İlk fotoğraf da panelin dolgusunu negatif marjla geri
                alıp kartın tepesine ve iki yanına dayanıyor (bkz. SectionPhoto >
                bleed) — yani şerit, Keşif'teki kapakta olduğu gibi fotoğrafın
                üstünde duruyor. Fotoğrafsız profilde şeridin altındaki nefes
                payını panel kendi içinde taşıyor (PREVIEW_HEADER_SPACE, bkz.
                oradaki not — beyaz şerit). */}
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
                  (isim, piller, not kutusu, Fire) bu grubun DIŞINDA.

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
                    // SABİT varış değeri yetiyor — Keşif'te köşe zaten hiç
                    // değişmiyor, önizlemede de pinch yalnız expanded'ken etkin
                    // (bir alttaki `enabled`), yani kopya doğduğu anda kaynak
                    // zaten varış noktasında.
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
                    // Üst kart decode kuyruğunda önceliklidir.
                    //
                    // ALTTAKİ KART "low" DEĞİL "normal" (2026-10-26): "low" o
                    // fotoğrafı kuyruğun DİBİNE atıyordu, oysa bir sonraki
                    // basışta ÜSTE ÇIKACAK kart o. Decode yetişmediğinde dalga
                    // çekilirken giden kart görünüyordu. Asıl çözüm kapağın
                    // önceden prefetch'i (bkz. DiscoverScreen > warmCovers); bu
                    // da aynı yarışı kapatıyor.
                    priority={isTopCard ? "high" : "normal"}
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

              {/* ── KAPAĞIN TEPESİNDEKİ RAMPA KALDIRILDI (istek) ───────────
                  Fotoğrafa YAPIŞIK bir progressive blur + koyu perde vardı:
                  boyu üstteki chrome'dan türüyordu (safe-area + cam buton çapı +
                  COVER_TOP_RAMP_PAD), maskesi/perdesi/blur'u dipteki bandın
                  aynadaki hâliydi.

                  KALDIRILDI, ÇÜNKÜ ÜSTTEKİ BLUR FOTOĞRAFIN DEĞİL HEADER'IN İŞİ:
                  aşağı kaydırınca gelen sticky şerit kendi progressive blur'unu
                  zaten taşıyor (bkz. CardStickyHeader — maske + veil perdesi +
                  chrome tint'li BlurView). İki bant üst üste binince kartın
                  tepesi kaydırma boyunca iki kez bulanıklaşıyordu.

                  Fotoğrafın çıplak tepesinde kalan tek chrome, yüzen geri al /
                  filtre butonları. Perdesiz duruyorlar ve durabilirler: ikisi de
                  cam, yani kendi kenarları ve kırılmaları var — ve isme inene
                  kadar zaten ordalar, o noktada şerit onların yerini alıyor
                  (devrin eşiği: chromeHandoffY).

                  DİPTEKİ RAMPA DURUYOR: o bir yazı bloğunu taşıyor (isim, yaş,
                  piller — hepsi sabit beyaz), yani fotoğrafa ait bir okunurluk
                  perdesi. Buradakinin böyle bir yükü yoktu. */}

              {/* KAPAĞIN DİBİNDEKİ RAMPA — yazıyı taşıyan bant: fotoğrafın en
                  altından yukarı doğru AZALARAK sönen PROGRESSIVE BLUR + hafif
                  progressive siyahlık. Üstünde isim + yaş, aktiflik satırı ve
                  üniversite/ortak nokta pilleri duruyor; hepsi `theme.onMedia`,
                  yani sabit beyaz — altlarında açık bir fotoğraf olabilir.

                  BOYU İSİMDEN TÜRÜYOR (bkz. coverTextRampHeight): fotoğrafın
                  dibinden yazı bloğunun tepesine + bir sönme kuyruğu kadar. Bir
                  dönem sabit 340'tı ve bloğun epey üstünde bitiyordu.

                  SÖNMÜYOR: `bottomBlurAnimStyle` ile kart açılırken kayboluyordu
                  (gerekçesi silindiği yerde) — kartın kapalı hâli kalkınca o
                  kural rampayı KALICI olarak söndürüyordu, yani fotoğrafın dibi
                  çıplak kalıyordu. Kapağın istenen hâli zaten bu: iki uçta da
                  progressive blur; tepesini sticky şerit taşıyor.

                  Konum `bottom: 0` yerine mutlak koordinat: parent'ın boyu bir
                  kare için oynasa bile rampa yerinde kalır. */}
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: Math.max(0, photoHeight - coverTextRampHeight),
                    left: 0,
                    right: 0,
                    // +PHOTO_CROP: kutu görünen alanın altına o kadar taşıyor,
                    // rampa da taşsın — yoksa fotoğrafın son bandı perdesiz
                    // kalıyor.
                    height: coverTextRampHeight + PHOTO_CROP,
                  },
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
                      soluk gösteriyordu.

                      YOĞUNLUK 0.06→0.30 İDİ, 0.10→0.42 OLDU (istek: "bi tık
                      daha yoğun"). Üst uç da birlikte kalktı, yalnız dip değil:
                      yalnız dibi koyultmak bandı iki parçaya bölüyor — üstte
                      soluk bir kuyruk, altta belirgin bir şerit.

                      Tavan ~0.5: onun üstünde fotoğraf bastırılmış görünüyor ve
                      kart "karartılmış bir resim" gibi okunuyor. */}
                  <LinearGradient
                    colors={[scrimAt(0.1), scrimAt(0.42)]}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* 15 → 22: perdeyle birlikte bulanıklık da bir tık arttı.
                      Üstteki rampa 15'te kalıyor — orası yalnız iki cam butonu
                      ve durum çubuğunu taşıyor, bu bant ise bir yazı bloğunu. */}
                  <BlurView
                    intensity={22}
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

              {/* Fire Button — COLLAPSED duruş. Uygulamaya özel ALEV
                  glyph'i (bkz. FireGlyph); SF/lucide flame değil ve artık
                  kalp de değil.

                  Kapak fotoğrafının İÇİNDE, scroll içeriğinin parçası ve
                  zeminsiz: fotoğrafın üstünde alevin kendi gradyanı ile ince
                  kenarı okunurluk için yetiyor.

                  ÇİZİMİ SKIA YAPIYOR (bkz. FireBurnCanvas), çünkü çekme
                  sırasında silüetin kendisi oynuyor — RN tarafında bu, maskeyi
                  her karede yeniden kurmak demekti. Canvas ikonun kutusundan
                  TAŞIYOR (uçlar + ışıma); kutuyu buradaki View veriyor, taşma
                  payını canvas kendi içinde hesaplıyor.

                  KROM DEVRİNDE yerini şeritteki cam butona bırakır (aşağıda,
                  ScrollWrapper'ın DIŞINDA) — sönerek. Sticky duruşta alev panel
                  zemininin üstüne de binebildiği için orada zemin şart; onu
                  liquid glass kabuk taşıyor.

                  ── KONUM: SAĞ ALT AKSİYON KOLONU (istek) ────────────────────
                  Kapağın SAĞ ÜST köşesindeydi (`top/right: FIRE_INSET`), sonra
                  bir tur isim satırının sağ ucuna taşındı. Şimdi Instagram'ın
                  sağ alt kolonu gibi: AŞAĞIDAN YUKARI üç nokta · not · Fire,
                  üçü de aynı çaptaki yuvarlak cam butonlar (bkz.
                  COVER_ACTION_SIZE).

                  KOLON YAZI BLOĞUNUN KARDEŞİ, çocuğu değil: yazı bloğu
                  `pointerEvents="none"` (metin dokunma almamalı) ve bu üç buton
                  ALMALI. Tabanı aynı çizgiden (COVER_NAME_BOTTOM +
                  coverBottomInset) başlıyor, yani kolonun dibi ile ismin dibi
                  hizalı.

                  KOLON `Animated.View` DEĞİL ve olmamalı: cam yüzeyler ata
                  zincirinde 1'in altında bir opacity ya da kimliksel olmayan bir
                  transform gördüğü anda efektlerini hiç render etmiyor. Her
                  butonun kendi basma animasyonu var, kolonun yok. */}
              {(!!onMenu || (!!onNote && !previewMode && allPhotos.length > 0) ||
                (!hideActions && !hideFire) ||
                (!hideActions && !!(onPass || onLike))) &&
                measuredCardHeight > 0 && (
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    // TABANI PİLLERİN ÜSTÜNDE (istek): ortak nokta satırı
                    // kolonun altından geçip sağa doğru uzayabilsin. Kolon
                    // böylece üniversite satırının hizasında bitiyor.
                    bottom:
                      COVER_NAME_BOTTOM +
                      coverBottomInset +
                      coverPillsHeight +
                      // Pillere değmesin (bkz. COVER_ACTION_PILLS_GAP). Yalnız
                      // ölçüm geldiyse: piller yoksa eklenecek bir ayrım da yok.
                      (coverPillsHeight > 0 ? COVER_ACTION_PILLS_GAP : 0),
                    right: COVER_ACTION_RIGHT,
                    alignItems: "center",
                    gap: COVER_ACTION_GAP,
                    zIndex: 55,
                  },
                  coverStickyStyle,
                ]}
                pointerEvents="box-none"
              >
              {/* FIRE — kolonun TEPESİ. Şeridin sağ ucundaki butonla AYNI
                  bileşen ve aynı varyant (istek: "basınca davranışı
                  headerdaki gibi liquid glass olsun"): berrak cam daire, basma
                  geri bildirimi camın kendi morph'undan (`interactive: true`).

                  ── ALEV CANVAS'I VE BASMA YANMASI KALDIRILDI (istek) ────────
                  Burada `FireBurnCanvas` vardı: Skia ile çizilen, silüeti her
                  karede oynayan bir alev. İki şey sürüyordu —
                    • `firePressAnim` / `firePressHeld`: basılı tutunca ikon
                      YANIYORDU (dalga hızlanıp kızışıyor, BURN_SCALE ile
                      büyüyor). İstenmedi: "ateş çıkmasın icondan".
                    • `fireProgress`: aşağı çekişte aynı yanma eşiğe doğru
                      ilerliyordu. O sinyal kayboluyor ama jest sessiz
                      kalmıyor — haptic rampası, kartın kendi hareketi ve
                      FirePullHint'in yazısı duruyor.

                  Geri istenirse `flameBurn` / `FireBurnCanvas` dosyaları
                  yerinde; dönecek yer bu blok. Dikkat: canvas'ı cam diskin
                  İÇİNE koymak kabuğu büyütmeden taşıyordu (bkz.
                  COVER_FIRE_GLYPH_SIZE) ve basma ölçeği camın atasına
                  konulamaz. */}
              {/* TİK (beğen) ve X (geç) — KOLONUN TEPESİ.
                  Jest kaldırıldığı için (bkz. SwipeWrapper > "YATAY SWIPE
                  JESTİ KALDIRILDI") beğen/geç'in kapakta bir girişi olmak
                  ZORUNDA: panelin dibindeki büyük X/tik satırı bir ekran boyu
                  aşağıda, oraya inmek her kart için kaydırmak demekti.

                  Kabuk üç noktayla AYNI (CardChromeGlassButton, `onMedia`):
                  kolonun beş dairesi tek malzeme, tek çap. Sıra yukarıdan
                  aşağı tik · X · Fire · not · üç nokta — ilk ikisi istek
                  üzerine bu sırada.

                  `onPress` doğrudan ekranın buton yoluna gidiyor (onLike /
                  onPass): kota kapısı, kilit ve kartın uçuşu orada tek
                  elden sürülüyor (bkz. DiscoverScreen > handleLikeButton).

                  BU DAL YALNIZ KEŞİF: bütün blok tam ekran kapağın içinde ve
                  kapak önizlemede hiç render edilmiyor, o yüzden buradaki
                  gereksiz `!previewMode` kapıları kaldırıldı. Önizlemenin
                  (Beğeniler · Sohbet · Akış) kendi tik/X kolonu AYRI ve ana
                  fotoğrafın üstünde — bkz. "ÖNİZLEMENİN AKSİYON KOLONU". */}
              {!hideActions && onLike && (
                <CardChromeGlassButton
                  testID="discover-btn-like"
                  onPress={onLike}
                  label={t("likes.likeButton")}
                  systemName="checkmark"
                  fallback={Check}
                  size={COVER_ACTION_SIZE}
                  onMedia
                  // TİK ARTIK BOYALI (istek: "aynı Beğeniler'deki kırmızı tik
                  // gibi"): kabuk modun aksiyon rengine boyanıyor, glif beyaz.
                  // X bilerek berrak kalıyor — ayrımın gerekçesi
                  // CardActionGlassButton > `variant` notunda: iki buton da
                  // renkli olsaydı kolon iki lekeye dönüp olumlu aksiyon öne
                  // çıkmıyordu.
                  //
                  // Renk MODLA dönüyor (Flört kırmızı / Arkadaş yeşil), tıpkı
                  // Beğeniler'in kart köşesindeki tik gibi — sabit kırmızı
                  // bırakmak Arkadaş modunda aynı kolonu iki renge bölerdi.
                  //
                  // GLİF PUNTOSU GEÇİLMİYOR: şeridin sağ ucundaki beğen
                  // butonuyla aynı sayı olmalı (bkz. yukarıdaki sabit notu).
                  surfaceTint={modeFireTint(mode ?? DEFAULT_APP_MODE)}
                />
              )}
              {!hideActions && onPass && (
                <CardChromeGlassButton
                  testID="discover-btn-pass"
                  onPress={onPass}
                  label={t("likes.passButton")}
                  systemName="xmark"
                  fallback={X}
                  size={COVER_ACTION_SIZE}
                  onMedia
                  // Kabuk berrak (yukarıdaki not); glif tikle AYNI puntoda —
                  // ikisi de ortak sayıda, ikili tek iriliğte okunmalı.
                />
              )}

              {!hideActions && !hideFire && onFire && (
                <FireGlassButton
                  testID="discover-btn-fire"
                  onPress={onFire}
                  // Etiket moda göre: Flört'te "Fire", Arkadaş'ta "Spark".
                  label={t(modeFireNameKey(mode))}
                  mode={mode}
                  variant="clear"
                  size={COVER_ACTION_SIZE}
                />
              )}

              {/* NOT — kolonun ORTASI. Eskiden kapağın dibinde, panelin üst
                  kenarının yukarısında ayrı bir mutlak katmandı (sağa yaslı
                  geniş bir kutu) ve `coverNoteAnimStyle` ile sönerek geliyordu.
                  O sönme CAM İLE BAĞDAŞMIYOR (ata opaklığı) ve kartın kapalı
                  hâli kalkınca gerekçesi de kalmadı: not kutusu hep orada. */}
              {!!onNote && !previewMode && allPhotos.length > 0 && (
                <NoteBox onPress={noteHandler(photoNoteTarget(0))} onPhoto />
              )}

              {/* ÜÇ NOKTA — kolonun DİBİ. Kapaktaki tek "seçenekler" girişi;
                  şikayet/engelle panelin dibindeki satırda da duruyor ama orası
                  bir ekran boyu aşağıda. Sheet'i çağıran taraf açıyor (bkz.
                  `onMenu`), kart onu bilmiyor. */}
              {!!onMenu && (
                <CardMenuGlassButton
                  onPress={onMenu}
                  label={t("common.menu")}
                  size={COVER_ACTION_SIZE}
                  // Kolon kapaktan hiç taşmıyor → glif foto üstü mürekkepte
                  // (açık modda da beyaz, bkz. glassOnMediaInk).
                  onMedia
                />
              )}
              </Animated.View>
              )}

              {/* Name and Age on Photo — sadece measuredCardHeight set olduktan
                  sonra render. Aksi halde photoHeight fallback (CARD_BOX_FALLBACK_HEIGHT)
                  ile başlayıp actual yüksekliğe geçince name yukarı sıçrar. */}
              {measuredCardHeight > 0 && (
                <Animated.View
                  className="absolute"
                  // Taban className'den ALINDI (`bottom-[70px]`): kapak artık
                  // tab bar'ın altına iniyor, blok o payı da eklemek zorunda
                  // (bkz. coverBottomInset). Inline style className'i ezer.
                  style={[
                    {
                    position: "absolute",
                    bottom: COVER_NAME_BOTTOM + coverBottomInset,
                    // SOL KENAR: ekranın üstündeki geri al butonunun kenarıyla
                    // AYNI çizgi (istek). Yazı bir kutu değil, hizası kenardan
                    // ölçülüyor — butonun merkezine değil sol kenarına
                    // hizalanıyor, yoksa metin görsel olarak içeri kaçıyor.
                    // `left-6` (24) idi; className'den ALINDI ki iki sayı tek
                    // yerden gelsin.
                    left: CHROME_EDGE_INSET,
                    right: CHROME_EDGE_INSET,
                    // KOLON PAYI BLOĞUN TAMAMINDA DEĞİL, SATIR SATIR: kolon
                    // artık pillerin ÜSTÜNDE bitiyor, yani en alttaki satır
                    // (ortak noktalar) tam genişliği kullanabiliyor. Pay yalnız
                    // kolonun yanından geçen iki satıra veriliyor — isim ve
                    // üniversite (bkz. coverActionClearance).
                    },
                    // Sağdaki buton kolonuyla AYNI pin: ikisi tek blok gibi
                    // davranmalı, ayrı sürülürlerse kaydırırken birbirlerinden
                    // ayrılıyorlar.
                    coverStickyStyle,
                  ]}
                  pointerEvents="none"
                  // Dipteki rampa bu bloğun boyundan türüyor (bkz.
                  // coverTextRampHeight) — ölçüm olmadan rampa ismin tepesini
                  // perdesiz bırakıyor.
                  onLayout={handleCoverTextLayout}
                >
                  <Animated.View
                    style={[
                      {
                        marginBottom: 2,
                        gap: 4,
                        // Kolonun yanından geçiyor → pay ŞART (bkz.
                        // coverActionClearance).
                        paddingRight: coverActionClearance,
                      },
                      nameAnimStyle,
                    ]}
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
                      {/* Foto doğrulama rozeti — premium rozetinden AYRI bir
                          işaret, `isVerified`e de katılmıyor. Alan gelmezse
                          (backend'in bu sürümü yok) hiçbir şey çizilmiyor.
                          SIRA: isim → doğrulama → plus. Doğrulama ismin devamı
                          gibi okunmalı, araya ürün işareti GİRMEMELİ. */}
                      <SelfieVerifiedBadge
                        verified={profile.isSelfieVerified}
                        size={selfieBadgeSize(CARD_NAME_FONT)}
                      />
                      {profile.isPremium && (
                        // İşaretin rengi MODLA DÖNMÜYOR: marka tonu `litPlus`,
                        // satırdaki sabit beyaz isim gibi foto üstünde her iki
                        // modda aynı (bkz. PremiumBadge).
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
                          // Kolonun yanından geçiyor → pay ŞART; alttaki ortak
                          // nokta satırına VERİLMİYOR (bkz.
                          // coverActionClearance).
                          paddingRight: coverActionClearance,
                          // Altına rozet sırası geliyorsa aradaki boşluğu
                          // rozetler taşısın, ikisi üst üste binmesin. SON
                          // eleman olduğunda 0: bloğun dibi ile sağdaki buton
                          // kolonunun dibi AYNI çizgide olmalı (istek) ve ikisi
                          // zaten aynı `bottom`tan yerleşiyor — buradaki her
                          // artık pay yazıyı yukarı kaldırıp hizayı bozuyor.
                          //
                          // Kolonun tabanı da bu sayıdan türüyor (bkz.
                          // COVER_ACTION_PILLS_GAP): kolon pillere yazıyla aynı
                          // mesafede duracak.
                          marginBottom:
                            showNewBadge || thingsInCommon.length > 0
                              ? COVER_UNI_PILLS_GAP
                              : 0,
                        },
                        pillsAnimStyle,
                      ]}
                    >
                      <View
                        style={{
                          borderRadius: 999,
                          borderCurve: "continuous",
                          overflow: "hidden",
                          // `py-1` className'den ALINDI: kolonun payı bu ölü
                          // dolguyu da sayıyor (bkz. COVER_UNI_ROW_PAD).
                          paddingVertical: COVER_UNI_ROW_PAD,
                        }}
                        className="flex-row items-center self-start gap-1"
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
                          marginBottom: 0,
                        },
                        pillsAnimStyle,
                      ]}
                      // Kolonun tabanı bu satırın boyundan türüyor (bkz.
                      // coverPillsHeight): ölçüm olmadan kolon pillerin üstüne
                      // biniyor.
                      onLayout={handleCoverPillsLayout}
                    >
                      <PillFlow
                        gap={6}
                        fillWidth
                        // Ölçüm turu GÖRÜNMEZ: etiketler kart başına değişiyor
                        // (üniversite / hobi / burç…), yani genişlik önbelleği
                        // reload sonrası ilk kartta soğuk. Görünür ölçüm turunda
                        // piller önce verilen sırada çizilip bir kare sonra
                        // `fillWidth`in dizdiği yerlerine atlıyordu — kullanıcıya
                        // "pilin yazısı önce başka, sonra kendine geliyor" diye
                        // görünüyor. Veri yerel (deste zaten çekilmiş), o yüzden
                        // görünmezlik TEK kare sürüyor; iskelet gerekmiyor.
                        //
                        // O "tek kare" İLK KARTTA GÖZLE GÖRÜLÜYORDU (piller
                        // kaybolup geri geliyor gibi): orada kart iskeletin
                        // hemen ardından ÜST kart olarak doğuyor, yani görünmez
                        // tur ekranda duran ilk kare oluyor. Sonraki kartlarda
                        // sorun yok — onlar üstteki kartın ardında ölçülüyor.
                        // Çare pili görünür kılmak değil (sıçrama geri gelirdi):
                        // paketlenme haberi Keşif'e gidiyor, iskelet o ana kadar
                        // ekranda tutuluyor (bkz. onCoverReady).
                        hideUntilPacked
                        onPacked={handleCoverPillsPacked}
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
                </Animated.View>
              )}

              {/* ── "DETAYLAR İÇİN YUKARI KAYDIR" İPUCU KALDIRILDI (istek) ──
                  Kapağın dibinde ortalanmış, çekişin ilk anında sönen bir
                  fısıltı vardı (`profile.card.expandHint` + kendi
                  `TouchableOpacity`si, onu expand/collapse toggle'ına bağlayan
                  `onExpandPress` prop'u ve `hideExpandHint` kapısı).

                  Gerekçesi jesti keşfettirmekti; artık keşfedilecek bir jest
                  yok — parmak birkaç piksel yukarı gittiği an kart açılıyor ve
                  hareket kesintisiz scroll'a dönüyor (bkz. SwipeWrapper >
                  OPEN_INTENT_PX). İpucunun yerini hareketin kendisi aldı. */}
            </Animated.View>
            )}

            {/* Ağır içerik (üniversite, hobiler, konum+harita, bölüm
                fotoğrafları). Kapı `isTopCard` DEĞİL: kart destenin altındayken,
                iki swipe arasındaki boş zamanda kuruluyor — üste geçtiğinde
                mount edilecek bir şey kalmıyor. Gerekçenin tamamı ve geri alma
                reçetesi profileReady'nin yanında. */}
            {profileReady && (
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
                    // kendi konumunda çözüldü (bkz. aksiyon kolonu).
                    // Buraya zIndex koymak paneli kapağın tüm katmanlarının —
                    // erime bandı dahil — üstüne çıkarır.
                    // Üst dolgu className'den ALINDI (bkz. PANEL_TOP_PAD):
                    // önizlemedeki nefes payı bu sayıdan türüyor, Tailwind
                    // sınıfı oradan okunamıyordu. Inline style className'i
                    // ezer, yani `p-6`nın 24'ü değil bu geçerli. DEĞER AYNI
                    // (32) — panelin içi kısılmıyor, yalnız kaynağı değişti.
                    paddingTop: PANEL_TOP_PAD,
                    // `px-4`ün 16'sı, açık sayı olarak (bkz. PANEL_PAD_H):
                    // önizlemenin ana fotoğrafı bu payı negatif marjla geri
                    // alıyor, iki yerin aynı sayıyı okuması şart.
                    paddingHorizontal: PANEL_PAD_H,
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
                    // KAPAKLA ARASINDAKİ MESAFE: tek layout sayısı, animasyon
                    // YOK. Bir dönem `profileInfoAnimStyle` panel aşağıdan
                    // gelirken bunu sürüyordu; hareket kaldırıldı (bkz. oradaki
                    // not), geriye sabit değer kaldı. Önizlemede 0 — orada panel
                    // kartın TEPESİNDEN başlıyor, kapak çizilmiyor.
                    marginTop: previewMode ? 0 : PROFILE_PANEL_GAP,
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
                    altından başlasın (bkz. PREVIEW_HEADER_SPACE).
                    ANA FOTOĞRAF VARSA ÇİZİLMİYOR: o blok artık tam kenar
                    (bkz. aşağıdaki `bleed`) ve şerit onun ÜSTÜNDE duruyor —
                    pay burada kalsa fotoğrafın üstünde boş bir şerit açardı.
                    Fotoğrafsız profilde aynen duruyor: orada şeridin altına
                    gelecek ilk şey bir bölüm kutusu. */}
                {previewMode && !allPhotos[0] && (
                  <View style={{ height: PREVIEW_HEADER_SPACE }} />
                )}

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

                {/* ANA FOTOĞRAF BURADA DEĞİL, PANELİN KARDEŞİ olarak
                    scroll'un ilk çocuğu (bkz. yukarısı, kapak dalının
                    ÖNCESİ). Bir tur burada duruyordu ve dolguyu negatif
                    marjla geri alıyordu; iki yan eşit çıkmadı — gerekçe
                    SectionPhoto > bleed'de. Buraya geri taşıma.
                 */}

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
                    {/* px-4 = "Burada ne arıyorum" bölümüyle AYNI yatay iç
                        boşluk: orada da kutunun 16'sının üstüne başlık ve
                        değer metni px-4 ile biniyor (toplam 32). Kep
                        kaldırıldıktan sonra bu kutu tek başına kenara
                        yapışık kalıyordu. Kutunun paddingHorizontal'ını
                        32'ye çıkarmak değil, aynı dili (16 + px-4) kullanmak
                        tercih edildi — iki bölüm birlikte değişsin. */}
                    <View className="flex-row flex-wrap items-center gap-3 px-4">
                      {/* Bölüm + sınıf artık tek satır → uzun bölüm adları
                          taşmasın diye zincir boyunca flex-1 veriliyor;
                          metin sütunu kalan genişliğe sarılır. */}
                      <View className="flex-1 self-start flex-row items-center">
                        <View
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          {/* Üniversite adının başındaki mezuniyet kepi
                              KALDIRILDI (istek): başlık metinle başlıyor.
                              Satır içi boşluk (gap 8) de birlikte gitti —
                              tek çocuk kaldığı için bir işi yoktu. */}
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
                {/* ── ARKADAŞLIK NİYETİ — YALNIZ FRIENDS MODUNDA ────────────
                    İlişki niyeti bölümünün AYNI yuvası, aynı kutu. Sunucu
                    kartı moda göre dolduruyor: Friends görünümünde
                    `relationshipIntent` NULL ve `friendshipIntents` dolu
                    geliyor, yani iki bölüm asla aynı anda çizilmiyor.

                    Niyet ÇOKLU olduğu için tek büyük metin değil PİL AKIŞI —
                    tek değerli ilişki niyetinde 22pt tek satır doğruydu,
                    burada üç-beş değer yan yana duruyor. */}
                {friendshipIntentLabels.length > 0 && (
                  <CardSectionBox
                    glass={glassPanel}
                    elevated
                    style={{
                      marginBottom: 16,
                      paddingHorizontal: 16,
                      paddingVertical: 32,
                    }}
                  >
                    <View className="flex-row items-center mb-6 px-4">
                      <Text className="text-[18px] font-semibold" style={{ color: theme.text }}>
                        {t('profile.card.friendshipIntent')}
                      </Text>
                    </View>
                    <View
                      className="px-4"
                      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                    >
                      {friendshipIntentLabels.map((label) => (
                        <View
                          key={label}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 9,
                            borderRadius: 999,
                            borderCurve: "continuous",
                            // Mod rengiyle değil NÖTR yüzeyle: kart zaten
                            // Friends modunda ve Spark yeşili aksiyonun rengi.
                            // Niyet pilleri bir aksiyon değil bilgi.
                            backgroundColor: theme.surfaceTranslucent,
                            borderWidth: 0.5,
                            borderColor: theme.hairline,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.text,
                              fontSize: 15,
                              fontWeight: "600",
                            }}
                          >
                            {label}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </CardSectionBox>
                )}

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
                    {!!onNote && !!prompt.promptKey ? (
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
                    {/* ⚠️ HER GLİF KENDİ HANDLER'INA BAĞLI — satır ikisini
                        birden varsaymıyor. Akışın Flört kartında düz beğeni YOK
                        (bkz. feedCardActions): `onLike` verilmiyor ve o dalda
                        koşulsuz çizilen bir tik, basıldığında hiçbir şey
                        yapmayan ölü bir buton olurdu. Kapaktaki cam kolon da
                        aynı kuralla çiziliyor (yukarıda). */}
                    {onPass && (
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
                    )}
                    {onLike && (
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
                    )}
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

      {/* Sticky başlık — AÇIK KARTIN TEK BAŞLIĞI: isim + yaş ve premium
          işareti (bkz. CardStickyHeader). Kapaktaki büyük isim çekilirken bu
          geliyor; panelde artık bir isim satırı yok. "24 saat içerisinde
          aktif" ŞERİTTE YOK — ne burada ne önizlemede; satırın tek yeri
          kapağın isim bloğu (bkz. showActivity).

          Scroll'un DIŞINDA, kart çerçevesine göre konumlu: burada kart sabit
          duruyor, kayan içerik. Sheet içindeki kartta (previewMode) durum TERS
          — orada kartın kendisi kayıyor, o yüzden şeridi sheet çiziyor ve bu
          dal hiç girmiyor (`scrollY` de zaten verilmiyor).

          Sırası önemli: ScrollWrapper'dan SONRA (içeriğin üstüne biner), cam
          butondan ÖNCE (buton camın üstünde kalır) ve zIndex YOK — zIndex
          verilseydi butonu da altına alırdı.

          ── BANT DESTENİN ALTINDAKİ KARTTA DA MOUNT EDİLİYOR ──────────────
          Mount kapısı bir dönem cam butonunkiyle aynıydı (`isTopCard &&
          profileReady`) ve gerekçesi "arkadaki kart üstteki tarafından örtülü,
          orada BlurView + MaskedView kurmanın karşılığı yok"du. KARŞILIĞI VAR:
          bandın malzemesi kartın ÜST GÖLGESİ ve kapalı kartta da hep açık
          (bkz. CardStickyHeader > bandRevealStyle). Kapı yüzünden gölge, kart
          üste geçtikten 100ms sonra doğuyordu — swipe bitiyor, kartın tepesi
          bir an sonra kararıyordu (istek: "direkt gölgeli gelsin").

          Alt kart yalnız BANDI alıyor (`bandOnly`): başlık satırı ve köşe cam
          butonları yine kart üste geçerken kuruluyor — kabukları opaklık 0'da
          doğarsa cam efekti hiç kurulmuyor (gerekçe prop'un yanında). */}
      {!!scrollY && (
        <CardStickyHeader
          profile={profile}
          bandOnly={!(isTopCard && profileReady)}
          // `scrollY` ARTIK GEÇİLMİYOR: şeridin scroll'la tek işi "bugün
          // aktif"in sönme eşiğiydi, o satır da şeritten çıktı (bkz.
          // CardStickyHeader — prop'un ve satırın kaldırma notları). Mount
          // kapısı aşağıda yine
          // `scrollY`e bakıyor — orada ölçtüğü şey başka: kartın Keşif'te mi
          // (scroll kartın içinde) yoksa önizlemede mi olduğu.
          // KROM KANALI, expandAnim DEĞİL: şerit kapaktaki büyük ismin YERİNİ
          // alıyor, o da bu kanaldan çekiliyor (nameAnimStyle). expandAnim'e
          // bağlanınca isim kapaktan gidiyor ama şerit yolun kalanını sürdüğü
          // için arada ismin hiç görünmediği birkaç kare kalıyordu.
          progress={chromeAnim}
          // Şeridin başlık satırı, sağ üstteki cam butonla aynı payda insin.
          topInset={cornerDrop}
          // Başlık satırı, ekranın üstündeki yüzen cam butonlarla (geri al /
          // filtre) AYNI çizgide: bant kartın tepesinden başlıyor, onlar
          // safe-area'da duruyor. Bant devirden ÖNCE de görünür (zemini hep
          // açık, bkz. CardStickyHeader > bandRevealStyle) ve devirde yalnız
          // İÇERİĞİ değişiyor — butonlar gidiyor, isim + Fire geliyor.
          titleTop={insets.top}
          // Şeridin sol ucundaki yukarı ok — içerik başa sarılır. Şerit ismi
          // devraldığında kullanıcı bir ekran boyu aşağıda oluyor; kapağa
          // dönmenin başka bir kısayolu yok.
          onScrollTop={scrollToTop}
          // Bandın kendi clip'i kabuğunkiyle aynı olmalı: şerit kartın ÜST
          // köşelerine oturuyor. Kabuktan YUVARLAK kalsaydı üst iki köşede camın
          // çizmediği ince bir dilim görünürdü — o yüzden kabuğun ÜST köşe
          // değeri (CARD_FACE_TOP_CORNER_RADIUS; bu dal yalnız Keşif'te
          // çiziliyor, previewMode'da şeridi sheet taşıyor). Sabit olabiliyor
          // çünkü köşe açılma boyunca hiç değişmiyor (bkz. openCornerRadius) ve
          // şerit ancak kart açıkken görünür oluyor (opaklığı `progress` ile
          // çarpılı).
          radius={CARD_FACE_TOP_CORNER_RADIUS}
        />
      )}

      {/* BEĞEN (tik) — ŞERİDİN SAĞ UCU, duruş: sticky. Scroll'un DIŞINDA, kart
          çerçevesine göre konumlu → içerik altından akıp giderken buton
          şeridin sağ ucunda asılı kalıyor.

          ── BURASI FIRE'DI (istek: "header'da sağ üstte fire yerine like") ───
          Yuvada `FireGlassButton`ın berrak cam varyantı duruyordu (Flört'te
          kırmızı Fire / Arkadaş'ta yeşil Spark). Artık İKİ MODDA DA beğen:
          glif `checkmark`, yani kapaktaki aksiyon kolonunun tepesindeki tikin
          aynısı. Fire o kolonda ve aşağı çekiş jestinde duruyor, yani ikinci
          bir girişi vardı; beğen ise açık kartta en çok istenen aksiyon ve
          şerit onu bir ekran boyu yukarıda sunuyor.

          Mod artık bu yuvada hiç okunmuyor — renk de moda dönmüyor; buton
          kapaktaki tik/X/üç nokta ile tek malzeme, tek mürekkep.

          KABUK: `CardChromeGlassButton` — satırın sol ucundaki yukarı okla
          (CardScrollTopGlassButton) ve kapak kolonunun daireleriyle BİREBİR
          aynı berrak cam zinciri (glassIconClearGlyph), yani şeridin iki ucu
          tek bir buton dili. Fire'ın `glassProminent` + turuncu tint'li hâli
          bir dönem denenip geri alınmıştı; renkli kabuk gitti, şimdi glif de
          nötr.

          Bir tur da `CardSectionBox glass` ile denendi (kapaktaki aksiyon
          kolonunun diskiyle aynı sarmalayıcı) ve geri alındı: o, oktaki native
          liquid glass zincirinin aynısı DEĞİL — iki komşu buton yan yana iki
          farklı cam gibi duruyordu.

          Mount `profileReady` gate'inde: swipe'ın son karesinde yeni top kart
          doğarken bir SwiftUI host'u daha kurmak animasyon kuyruğuna biniyor.
          Buton o an zaten görünmez (expandAnim 0), 100ms sonra gelmesi
          hissedilmiyor — ilk çekmeye çoktan hazır olur.

          Yalnız TOP kart: cardExpandAnim global, arkadaki kartlar da bu bandı
          okur; onlar için native host kurmanın karşılığı yok (üstteki kart
          hepsini örtüyor). */}
      {/* ÖNİZLEMEDE ÇİZİLMİYOR (`!previewMode`): orada bu buton şeridin sağ
          ucunda ÖLÜ duruyordu — `pointerEvents`i `expanded`a bağlı ve sheet
          kartı `expanded={false}` ile açıyor — ve sheet'in kendi şeridindeki
          üç noktayla aynı köşeye biniyordu. Önizlemenin beğen/geç kolonu ana
          fotoğrafın üstünde (yukarıda). */}
      {!previewMode &&
        !hideActions &&
        isTopCard &&
        profileReady &&
        onLike && (
          <Animated.View
            style={[
              {
                position: "absolute",
                // Köşe diyagonalinin biraz altı, SABİT (bkz. cornerDrop).
                // ŞERİDİN SAĞ UCU: aynı bandın solundaki isimle ve devirden
                // önce oradaki filtre butonuyla aynı çizgide (kenar payı
                // CHROME_EDGE_INSET = 16). Yüzen butonlarla AYNI ÇAPTA (ortak
                // sayı), yani dikeyde telafi payı yok: aynı `top`, aynı kutu.
                top: insets.top + cornerDrop,
                right: CHROME_EDGE_INSET,
                width: DISCOVER_GLASS_BUTTON_SIZE,
                height: DISCOVER_GLASS_BUTTON_SIZE,
              },
              stickyActionStyle,
            ]}
            // Collapsed'ken görünmez ama hâlâ fotoğrafın üstünde duruyor —
            // kapalıyken dokunmayı kapağın kendi katmanlarına bırak.
            pointerEvents={expanded ? "auto" : "none"}
          >
            <CardChromeGlassButton
              testID="discover-btn-like-sticky"
              onPress={onLike}
              label={t("likes.likeButton")}
              systemName="checkmark"
              fallback={Check}
              size={DISCOVER_GLASS_BUTTON_SIZE}
              // Şerit açık kartta da KOYU rampanın üstünde duruyor (bkz.
              // CardStickyHeader) — glif iki temada da beyaz.
              onMedia
            />
          </Animated.View>
        )}
    </Animated.View>
  );
}
