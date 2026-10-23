import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import SheetBlurBackdrop from "@/shared/components/SheetBlurBackdrop";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ViewStyle,
  StyleProp,
} from "react-native";
import { BottomSheetScrollView, SCROLLABLE_STATUS, useBottomSheetInternal, useScrollEventsHandlersDefault, type ScrollEventsHandlersHookType } from "@gorhom/bottom-sheet";
import { State } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  interpolate,
  Extrapolation,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  Host,
  Button as SwiftUIButton,
  Text as SwiftUIText,
  Image as SwiftUIImage,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  tint,
  labelStyle,
  controlSize,
  font,
  containerShape,
  shapes,
  frame,
  fixedSize,
} from "@expo/ui/swift-ui/modifiers";
import { Check, RotateCcw, X, type LucideIcon } from "@/shared/icons";
import SFIcon, { type SFSymbol } from "./SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors, veil, withAlpha } from "../theme/colors";
import {
  HAS_LIQUID_GLASS,
  glassFallback,
  glassFallbackBorderStyle,
  glassTextClearCapsule,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "../theme/glass";
import GlassFallbackSurface from "./GlassFallbackSurface";
import { chromeBlurTint } from "@/shared/theme/blur";

// Header dikey breakdown:
//   top:20 — title + close/right-slot row (height:46, clearGlassHeader'da 48);
//            20 iPhone üstten nefes payı
//   total = 66 + 8px alt nefes → 74
//
// ⚠️ Eskiden 88'di: 20'de 4px'lik bir drag indicator pill duruyor, satır da
// onun altında 34'ten başlıyordu. Pill KALDIRILDI (uygulamadaki bütün
// sheet'lerde) ve kapladığı 14px'lik bant — pill + altındaki boşluk — header'dan
// düşüldü, yani içerik olduğu gibi 14px yukarı çıktı. paddingTop'unu elle veren
// çağıranlar (closeButton={false} olan sheet'ler) da aynı 14'ü düştü.
const MODAL_HEADER_HEIGHT = 74;
/**
 * Buton satırının bandın tepesinden payı — VARSAYILAN, çağıran `headerButtonTop`
 * ile başka bir çizgiye (örn. kart chrome'unun 14'ü) oturtabilir.
 */
const MODAL_HEADER_ROW_TOP = 20;
const SHEET_TOP_RADIUS = 36;
// Tam ekrana yakın açılan uzun sheet'lerin (FilterModal, profil düzenleme) üst
// köşesi: aynı yarıçap büyük bir yüzeyde daha "keskin" okunuyor, bir tık açmak
// sheet'i arkadaki ekrandan ayırıyor. Yalnız opt-in — varsayılan 36 kalıyor.
export const SHEET_TOP_RADIUS_LARGE = 44;

// Bir sheet'in ÜSTÜNE binen seçici sheet'lerinin (şehir / dil / üniversite /
// prompt) detentleri — TEK YERDE, çünkü hepsinin aynı açılması isteniyor.
//   - İlk durak %75: normal hâl, altta arkadaki sheet'ten bir şerit görünür.
//   - En üst durak %100: seçiciyi AÇAN sheet'le (profil düzenleme / filtreler,
//     ikisi de `fullScreen`) AYNI tepe. Eskiden %90'dı; kullanıcı arama yapmak
//     için yukarı çektiğinde ya da klavye sheet'i en üst detent'e taşıdığında
//     (keyboardBehavior "extend") liste, onu açan sheet'ten daha dar kalıyordu.
//
// ⚠️ `fullScreen` ile BİRLİKTE verilmek zorunda (AppBottomSheet'i doğrudan
// kullananlarda: `topInset={insets.top}`). Yüzdeler modal'da containerHeight −
// topInset üzerinden hesaplanıyor; inset olmadan %100 status bar/dynamic
// island'ın ALTINA değil ekranın tepesine oturur, header çentiğe girer.
export const SHEET_PICKER_SNAP_POINTS = ["75%", "100%"];

// İçerideki input'ların (bkz. useKeyboardAwareField) modal scroll view'ına
// erişebilmesi için. scrollY zaten header animasyonu için tutuluyor; aynı
// değer "şu an neredeyiz" bilgisi olarak scroll hesabında da kullanılıyor.
export const AppModalScrollContext = createContext<{
  scrollRef: React.MutableRefObject<any>;
  scrollY: { value: number };
} | null>(null);

/**
 * Sheet'in scroll olay hattı — gorhom'un varsayılan handler'larını sarar ve iki
 * şey ekler:
 *
 * 1. `scrollY`yi besler (header blur'u + başlık fade'i buradan çiziliyor).
 *    ÖNCEDEN bu, scroll view'ı `Animated.createAnimatedComponent` ile İKİNCİ
 *    kez sarıp ayrı bir `useAnimatedScrollHandler` bağlayarak yapılıyordu. O
 *    yol aynı native scroll view'a ikinci bir olay dinleyicisi takıyor, üstelik
 *    Reanimated prop'u `dummyListener`a çevirdiği için gorhom HER KAREDE
 *    `runOnJS(dummyListener)` çağırıyordu. Tek hat hem ucuz hem de (2)'yi
 *    mümkün kılıyor.
 *
 * 2. Momentum boyunca gorhom'un `contentOffsetY`sini TAZE tutar. Sheet'in hızlı
 *    kaydırmada kendiliğinden kapanmasının sebebi buydu:
 *
 *    gorhom bu değeri yalnız üç anda örnekliyor — onBeginDrag, onEndDrag,
 *    onMomentumEnd (son ikisi o sırada bir sheet animasyonu koşuyorsa hiç
 *    yazmıyor). Kullanıcı hızlı hızlı fiskeleyip momentum bitmeden yeni bir
 *    çekiş başlatınca değer bayat (çoğu zaman 0) kalıyor. Sheet'in pan jesti
 *    "içerik zaten kaydırılmış, bu çekiş listenin" korumasını
 *    (`wasGestureHandledByScrollView`) tam olarak bu değerden okuduğu için
 *    koruma düşüyor; tek detent'li bir sheet'te fiskenin hızı da kapanışa
 *    snap'liyor → modal bir anda kayboluyor.
 *
 *    ⚠️ PARMAK YERDEYKEN YAZILMIYOR (content pan ACTIVE/BEGAN). gorhom sürükleme
 *    matematiğinde `translationY - contentOffsetY` kullanıyor; ikisi birden
 *    canlı olsaydı aynı hareket iki kez sayılır ve sheet parmaktan hızlı inerdi.
 *    Negatif offset (iOS bounce) de yazılmıyor: 0'ın altı "yukarı çekme payı",
 *    kaydırılmış içerik değil.
 */
const useModalScrollEventsHandlers: ScrollEventsHandlersHookType = (
  scrollableRef,
  scrollableContentOffsetY,
) => {
  const { handleOnScroll: baseHandleOnScroll, ...restHandlers } =
    useScrollEventsHandlersDefault(scrollableRef, scrollableContentOffsetY);
  // gorhom `context`i handler'a özel bir generic ile tipliyor; sarmalayıcıdan
  // olduğu gibi geçirebilmek için gevşetiyoruz (davranış değişmiyor).
  const defaultHandleOnScroll = baseHandleOnScroll as
    | ((event: any, context: any) => void)
    | undefined;
  const {
    animatedScrollableState,
    animatedScrollableStatus,
    animatedContentGestureState,
  } = useBottomSheetInternal();
  const scrollY = useContext(AppModalScrollContext)?.scrollY;

  const handleOnScroll = useCallback(
    (event: any, context: any) => {
      "worklet";
      defaultHandleOnScroll?.(event, context);

      const y = event.contentOffset.y;
      if (scrollY) {
        scrollY.value = y;
      }

      if (
        animatedScrollableStatus.value === SCROLLABLE_STATUS.LOCKED ||
        animatedContentGestureState.value === State.ACTIVE ||
        animatedContentGestureState.value === State.BEGAN ||
        y < 0
      ) {
        return;
      }
      const current = animatedScrollableState.get();
      if (current.contentOffsetY === y) return;
      scrollableContentOffsetY.value = y;
      animatedScrollableState.set({ ...current, contentOffsetY: y });
    },
    [
      defaultHandleOnScroll,
      scrollY,
      scrollableContentOffsetY,
      animatedScrollableState,
      animatedScrollableStatus,
      animatedContentGestureState,
    ],
  );

  return { ...restHandlers, handleOnScroll };
};

type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  snapPoints?: any[];
  // true → sheet ekranın en üstüne kadar açılır AMA topInset=safe-area olarak
  // ayarlanır, böylece header status bar/dynamic island altına girmez ve buton
  // pozisyonları kaymaz. Verildiğinde snapPoints ["100%"]'e çekilir.
  fullScreen?: boolean;
  // Sheet'in ÜST köşe yarıçapı (varsayılan SHEET_TOP_RADIUS). Sheet çerçevesi
  // ile header blur'unun kırpması TEK yerden beslensin diye prop: ikisi
  // ayrışırsa blur, köşenin dışına taşan bir dikdörtgen olarak görünüyor.
  cornerRadius?: number;
  // false ise X butonu hiç render edilmez (örn. salt görüntüleme modal'ı).
  closeButton?: boolean;
  // Standart action butonu (Kaydet/Uygula/Devam vs). Verilirse header'ın
  // sağına konur, X otomatik sola gider. Glass (iOS) / pill TouchableOpacity
  // (Android) olarak X ile aynı height'da render edilir.
  //
  // ⚠️ YAZI, header'da artık İSTİSNA: Kaydet/Uygula/Bitti/Sıfırla'nın hepsi
  // glife çevrildi (`actionIcon` / `leftIcon`), çünkü aynı anlamı taşıyan buton
  // sheet'ten sheet'e farklı kelimeyle yazılıyordu. Metin yolu yalnız kendi
  // kelimesi olmadan anlaşılmayan bir eylem için (örn. "Devam") — başka türlü
  // ikon tercih edilir.
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  // Action butonunu METİN KAPSÜLÜ yerine YUVARLAK İKON olarak çizer — X ile
  // birebir aynı kutu (ACTION_HEIGHT), aynı cam malzeme, aynı glif ölçüsü.
  // `actionLabel` ile birlikte verilmez: etiket varsa o kazanır.
  //
  // Kaydetmekten başka işi olmayan sheet'ler için (görünürlük, davet):
  // `actionIcon="checkmark"` → sol üstte X, sağ üstte ✓ — iki buton da
  // uygulamanın yuvarlak cam ikon ölçüsünde.
  actionIcon?: SFSymbol;
  // SF Symbols'ın olmadığı yolda (Android / eski iOS) çizilen Lucide karşılığı.
  // Varsayılan `Check`, yani `actionIcon="checkmark"` tek başına yeterli.
  actionIconFallback?: LucideIcon;
  // Yalnız erişilebilirlik etiketi — ekranda yazı çizilmiyor.
  actionIconLabel?: string;
  // Custom rightSlot — actionLabel'ı override eder; tamamen özel buton için.
  rightSlot?: ReactNode;
  // Header'ın soluna X yerine metin butonu koyar (örn. FilterModal'ın
  // "Sıfırla"sı). Verildiğinde X HİÇ render edilmez — sheet swipe-down ve
  // backdrop ile kapanmaya devam eder. Action butonuyla birebir aynı stil.
  leftLabel?: string;
  onLeftPress?: () => void;
  // `leftLabel`ın İKON hâli — sağdaki `actionIcon` ile birebir aynı kutu
  // (ACTION_HEIGHT), aynı cam malzeme, aynı glif ölçüsü. Header'ın metin
  // butonları yazı yerine glife çevrilirken eklendi: "Sıfırla" →
  // `leftIcon="arrow.counterclockwise"`.
  //
  // `leftLabel` ile birlikte verilmez: etiket varsa o kazanır. Verildiğinde X
  // yine HİÇ render edilmez (leftLabel'ın aynısı).
  leftIcon?: SFSymbol;
  // SF Symbols'ın olmadığı yolda (Android / eski iOS) çizilen Lucide karşılığı.
  // Varsayılan `RotateCcw` — bu slotun bugünkü tek işi sıfırlamak.
  leftIconFallback?: LucideIcon;
  // Yalnız erişilebilirlik etiketi — ekranda yazı çizilmiyor.
  leftIconLabel?: string;
  // Header'ın metin butonları (leftLabel + actionLabel) dolgulu `.regular` cam
  // yerine BERRAK cam çizsin. Yuvarlak ikon butonlarının geçtiği yolun kapsül
  // hâli (bkz. glassTextClearCapsule); opt-in çünkü aynı header'ı kullanan
  // sheet'lerin hepsi henüz çevrilmedi.
  clearGlassActions?: boolean;
  // Header'ın BÜTÜN butonları (X + metin butonları) uygulamanın yuvarlak cam
  // ikon ölçüsüne — `GLASS_ICON_CLEAR_SIZE` — çıkar; X de dolgulu
  // `buttonStyle("glass")` kabuğu yerine berrak cam glife (glassIconClearGlyph)
  // döner, yani ProfileScreen başlığındaki çan/ayarlar butonunun aynısı olur.
  // X'i olmayan sheet'lerde (FilterModal: X yerine "Sıfırla") tek etkisi ölçü.
  //
  // Metin butonlarının MALZEMESİ ayrı knob: `clearGlassActions`. Bu ikisi
  // bağımsız — biri ölçüyü, diğeri dolgulu/berrak camı seçiyor.
  //
  // Opt-in: aynı header'ı kullanan sheet'lerin hepsi henüz çevrilmedi.
  clearGlassHeader?: boolean;
  /**
   * Header'ın YUVARLAK İKON butonlarının (X ve varsa ✓) glifi SABİT BEYAZ
   * (`onMedia`) çizilir — moda dönen `text` yerine.
   *
   * Gerekçe `clearGlassHeader` ile aynı aileden: o yolda butonun kendi kabuğu
   * yok, glif ARKASINDAKİ YÜZEYİN üstünde duruyor. İçerik fotoğraf/gradyan ise
   * (ModeSelectorSheet'in 3:2 mod kartları, sheet'in payına taşan cam X tam
   * onların üstünde yüzüyor) açık temada koyu mürekkep o zeminde kayboluyor.
   *
   * Opt-in ve yalnız İKON butonları: metin butonları (Kaydet/Sıfırla) tema
   * mürekkebinde kalıyor — onlar hiçbir zaman medyanın üstüne binmiyor.
   */
  onMediaHeaderIcons?: boolean;
  /**
   * Header'ın buton satırının (X · başlık · aksiyon) modal'ın TEPESİNE uzaklığı.
   * Varsayılan `MODAL_HEADER_ROW_TOP`.
   *
   * Dışarıdan verilmesinin tek gerekçesi kart yüzeyleriyle hizalanmak: profilden
   * açılan önizleme kartının cam köşe butonları `CARD_CHROME_BUTTON_TOP`'ta (14)
   * duruyor, modal'ın varsayılanı 20 — kullanıcı ikisi arasında gezerken aynı
   * görünen buton zıplıyordu. Pay yalnız SATIRI taşıyor; bandın yüksekliği ve
   * dolayısıyla içeriğin üst payı (MODAL_HEADER_HEIGHT) sabit kalıyor, satırın
   * altındaki fark blur'un sönme kuyruğuna gidiyor.
   */
  headerButtonTop?: number;
  // X'in tarafı: actionLabel/rightSlot varsa default "left", yoksa "right".
  closeSide?: "left" | "right";
  // Başlık scroll'a bağlı belirmek yerine HEP görünür durur. Modal içi
  // drill-down sayfalarında ("Geri" butonunun yanında hangi sayfadayız)
  // başlığın scroll'u beklemesi bilgiyi tamamen gizliyordu.
  titleAlwaysVisible?: boolean;
  // Sheet yüksekliği snapPoints yerine ÖLÇÜLEN İÇERİK kadar olur (gorhom
  // enableDynamicSizing). snapPoints verilmediğinde tek detent içerik
  // yüksekliğidir; maxDynamicContentSize tavanı aşılmaz. Kısa ve sabit içerikli
  // sheet'ler için — uzun/scroll'lu modal'larda snapPoints daha öngörülebilir.
  dynamicSizing?: boolean;
  maxDynamicContentSize?: number;
  // gorhom keyboardBehavior. Varsayılan "extend" (bkz. AppBottomSheet);
  // input'unu klavyenin üstünde tutması gereken sheet'ler "interactive" verir.
  keyboardBehavior?: "extend" | "interactive" | "fillParent";
  // false ise içerik scroll edilmez; header background opacity sabit kalır.
  scrollable?: boolean;
  // Scrollable=true iken scroll'u disable etmek için.
  scrollEnabled?: boolean;
  // Slider/gesture interaction'larıyla çakışmayı önlemek için sheet drag'i
  // runtime'da kapatmak (FilterModal slider'ı kullanıyor).
  enableContentPanningGesture?: boolean;
  // gorhom stackBehavior — başka bir modal üstüne mount edildiğinde nasıl
  // davransın: "push" → arkadaki modal'ı geriye iter, "switch" → kapatır,
  // "replace" → değiştirir. Varsayılan undefined (gorhom default'u).
  stackBehavior?: "push" | "switch" | "replace";
  footer?: ReactNode;
  onPresented?: () => void;
  // Scrollable=true → BottomSheetScrollView contentContainerStyle override.
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Scrollable=false → static container View style override.
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Uygulama genelinde tek modal yapısı. Tüm modal'lar bu wrapper'ı kullanır.
 * İçerik dışındaki her şey (progressive blur header, X butonu, Save slot,
 * scroll-driven title fade) burada — consumer sadece içerik geçer.
 *
 *   <AppModal visible={open} onClose={close} title="Ayarlar">
 *     {sections}
 *   </AppModal>
 *
 *   <AppModal visible={open} onClose={close} title="Profili Düzenle" rightSlot={saveButton}>
 *     {form}
 *   </AppModal>
 *
 *   <AppModal visible={open} onClose={close} title="Fire" snapPoints={["60%"]} scrollable={false}>
 *     {staticContent}
 *   </AppModal>
 */
export default function AppModal({
  visible,
  onClose,
  title,
  snapPoints,
  fullScreen = false,
  cornerRadius = SHEET_TOP_RADIUS,
  closeButton = true,
  actionLabel,
  onAction,
  actionDisabled,
  actionLoading,
  actionIcon,
  actionIconFallback = Check,
  actionIconLabel = "Tamam",
  rightSlot,
  leftLabel,
  onLeftPress,
  leftIcon,
  leftIconFallback = RotateCcw,
  leftIconLabel = "Sıfırla",
  clearGlassActions = false,
  clearGlassHeader = false,
  onMediaHeaderIcons = false,
  headerButtonTop = MODAL_HEADER_ROW_TOP,
  closeSide,
  titleAlwaysVisible = false,
  dynamicSizing = false,
  maxDynamicContentSize,
  keyboardBehavior,
  scrollable = true,
  scrollEnabled = true,
  enableContentPanningGesture,
  stackBehavior,
  footer,
  onPresented,
  contentContainerStyle,
  containerStyle,
  children,
}: AppModalProps) {
  // actionLabel/actionIcon veya rightSlot varsa X sola alınır (Save sağda
  // kalsın); yoksa X sağda.
  const hasRightContent = !!actionLabel || !!actionIcon || !!rightSlot;
  const effectiveCloseSide = closeSide ?? (hasRightContent ? "left" : "right");

  // fullScreen: snapPoints ["100%"] + topInset = safe area top → modal en üste
  // kadar açılır ama header notch/dynamic island altına girmez.
  const insets = useSafeAreaInsets();
  // dynamicSizing'de snapPoints VERİLMEZ: tek detent ölçülen içerik yüksekliği
  // olsun. Varsayılan ["90%"] burada da geçseydi sheet o yüksekliğe kilitlenir,
  // "içerik kadar" hiç devreye girmezdi.
  const effectiveSnapPoints = dynamicSizing
    ? snapPoints
    : (snapPoints ?? (fullScreen ? ["100%"] : ["90%"]));
  const effectiveTopInset = fullScreen ? insets.top : undefined;

  // ── Scroll plumbing ──────────────────────────────────────────────────────
  // scrollY'yi useModalScrollEventsHandlers dolduruyor (bkz. yukarıdaki not) —
  // burada ayrı bir scroll handler YOK.
  const scrollRef = useRef<any>(null);
  const scrollY = useSharedValue(0);

  // Modal her açıldığında scroll'u sıfırla — stale title/blur state'i taşımasın.
  useEffect(() => {
    if (visible) scrollY.value = 0;
  }, [visible, scrollY]);

  // ── Header animations ────────────────────────────────────────────────────
  // 0→60: background opacity 0→1, 55+: title fade-in (450ms easeOutCubic).
  const headerBgStyle = useAnimatedStyle(() => ({
    opacity: scrollable
      ? interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP)
      : 1,
  }));

  const titleTriggered = useSharedValue(0);
  useAnimatedReaction(
    () => (scrollable ? scrollY.value > 55 : false),
    (isPast, prev) => {
      if (isPast !== prev) {
        titleTriggered.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );
  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleAlwaysVisible ? 1 : titleTriggered.value,
    transform: [
      { translateY: titleAlwaysVisible ? 0 : 12 * (1 - titleTriggered.value) },
    ],
  }));

  // ScreenHeader'daki birebir easeGradient — alt kenarın yumuşak fade'i.
  const { colors: bgColors, locations: bgLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  // ── Buttons ──────────────────────────────────────────────────────────────
  // Hem X hem Action glass + controlSize("large") kullanır → aynı height.
  // Android'de iki taraf da aynı px'te yuvarlak/pill TouchableOpacity ile
  // fallback.
  //
  // `clearGlassHeader` verildiğinde sayı 46 değil `GLASS_ICON_CLEAR_SIZE`:
  // X o yolda başlıklardaki çan/ayarlar butonuyla aynı çapa oturuyor ve metin
  // butonu (Kaydet) ondan alçak kalmasın diye ölçü TEK yerden — bu sabitten —
  // besleniyor. Aşağıdaki başlık satırının yüksekliği de buradan geliyor.
  const ACTION_HEIGHT = clearGlassHeader ? GLASS_ICON_CLEAR_SIZE : 46;
  // Sağdaki/soldaki metin butonunun SABİT kutu genişliği. Etiketler kısa
  // (Kaydet / Sıfırla / Uygula / Bitti / Save / Reset); 13px semibold + 18px
  // yatay padding en uzununda bile ~90pt. Kutu onlardan geniş, buton içine
  // kenara yaslanıyor (bkz. aşağıdaki alignment).
  const ACTION_BOX_WIDTH = 120;
  // Etiket puntosu — header'ın METNİ olan bütün butonlarında TEK sayı, camın
  // malzemesinden bağımsız. Bir süre berrak cam yolunda 11'e düşüyordu (dolgusu
  // olmayan kapsülde aynı punto dolgulu kardeşinden iri duruyor diye); o
  // istisna kaldırıldı, modal'dan modal'a değişen etiket boyu dolgu farkından
  // daha çok göze batıyordu. Kapsül `clearGlassHeader` ile 46'dan 48'e çıktığı
  // için 13'ün nefes payı da arttı.
  const ACTION_LABEL_SIZE = 13;

  /**
   * Header'ın YUVARLAK İKON butonu. Sol üstteki X ve (verilirse) sağ üstteki
   * onay işareti TEK bu fonksiyondan çıkıyor: ikisi de ACTION_HEIGHT çapında,
   * aynı cam malzemede ve aynı glif ölçüsünde duruyor. Gövde eskiden X'e özel
   * inline duruyordu; ✓ eklenirken kopyalanmasın diye buraya alındı.
   */
  // Yuvarlak ikon butonlarının glif/tint rengi — bkz. `onMediaHeaderIcons`.
  // Spinner'ın mürekkebi BUNUN DIŞINDA (tema): yükleniyorken butonun kendi
  // opak zemini (`hairlineSoft`) çiziliyor, arkadaki medya görünmüyor.
  const iconGlyphColor = onMediaHeaderIcons ? colors.onMedia : colors.text;

  const renderIconButton = (
    symbol: SFSymbol,
    fallback: LucideIcon,
    onPress?: () => void,
    opts?: { label: string; loading?: boolean; disabled?: boolean },
  ) => {
    // Yükleniyorken buton SPINNER'A dönüyor (ProfileEditModal'ın `savingSlot`
    // deseni): kutu aynı ölçüde kaldığı için header'da hiçbir şey yer
    // değiştirmiyor.
    //
    // ⚠️ Cam buton opacity<1 bir View'a SARILMIYOR — ata zincirindeki opaklık
    // cam efektini sessizce hiç render edilmez hâle getiriyor (bkz. theme/glass
    // + GlassView notları). Disabled hâl bu yüzden yalnız dokunmayı kesiyor.
    if (opts?.loading) {
      return (
        <View
          style={{
            width: ACTION_HEIGHT,
            height: ACTION_HEIGHT,
            borderRadius: 999,
            backgroundColor: colors.hairlineSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      );
    }
    const handlePress = opts?.disabled ? () => {} : (onPress ?? (() => {}));
    const label = opts?.label ?? "";

    return Platform.OS === "ios" ? (
      // matchContents YOK (bkz. SCREEN_HEADER_ACTION_SIZE'daki not): SwiftUI
      // ölçümü ikinci Fabric commit'inde geldiği için Host ilk frame'de 0
      // genişlikte kalıyor, space-between satırında butonlar kenara yapışıp
      // ölçüm gelince yerine zıplıyordu. Host style'ı ile frame() birebir aynı.
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      <GlassFallbackSurface
        shape="circle"
        width={ACTION_HEIGHT}
        height={ACTION_HEIGHT}
      >
        <Host style={{ width: ACTION_HEIGHT, height: ACTION_HEIGHT }}>
          {clearGlassHeader ? (
            // ProfileScreen'in çan/ayarlar butonuyla BİREBİR aynı zincir:
            // kabuk yok, cam glifin üstünde (gerekçenin tamamı
            // glassIconClearGlyph'in başında). `label`/`systemImage` prop'ları
            // YOK — verilseydi native taraf children'ı yok sayardı.
            <SwiftUIButton
              onPress={handlePress}
              modifiers={[
                buttonStyle("plain"),
                tint(iconGlyphColor),
                frame({ width: ACTION_HEIGHT, height: ACTION_HEIGHT }),
                accessibilityLabel(label),
                ...glassFallback({ shape: "circle" }),
              ]}
            >
              <SwiftUIImage
                systemName={symbol}
                color={iconGlyphColor}
                modifiers={glassIconClearGlyph()}
              />
            </SwiftUIButton>
          ) : (
            <SwiftUIButton
              label={label}
              systemImage={symbol}
              onPress={handlePress}
              modifiers={[
                buttonStyle("glass"),
                controlSize("large"),
                tint(iconGlyphColor),
                labelStyle("iconOnly"),
                font({ size: 17, weight: "medium" }),
                // Default capsule yerine tam circle — iconOnly buton kare/yuvarlak görünsün.
                containerShape(shapes.circle()),
                // Kare frame ARTIK her iOS sürümünde: eskiden yalnız glassFallback
                // içinden (yani < 26'da) geliyordu, 26+'da ölçü intrinsic'ti ve
                // Host'un sabit kutusuyla uyuşmuyordu. strokeBorder'ın frame'i
                // takip etmesi için glassFallback'ten ÖNCE (bkz. glass.ts notu).
                frame({ width: ACTION_HEIGHT, height: ACTION_HEIGHT }),
                ...glassFallback({ shape: "circle" }),
              ]}
            />
          )}
        </Host>
      </GlassFallbackSurface>
    ) : (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: ACTION_HEIGHT,
          height: ACTION_HEIGHT,
          borderRadius: 999,
          backgroundColor: colors.hairlineSoft,
          alignItems: "center",
          justifyContent: "center",
          opacity: opts?.disabled ? 0.35 : 1,
        }}
      >
        <SFIcon
          name={symbol}
          fallback={fallback}
          size={20}
          color={iconGlyphColor}
          strokeWidth={2}
          weight="semibold"
          style={{ pointerEvents: "none" }}
        />
      </TouchableOpacity>
    );
  };

  const closeBtn = closeButton
    ? renderIconButton("xmark", X, onClose, { label: "Kapat" })
    : null;

  // Header'ın metin butonu. Sağdaki action (Uygula/Kaydet) ve soldaki leftLabel
  // (Sıfırla) aynı fonksiyondan çıkıyor ki iki taraf birebir aynı ölçüde dursun.
  const renderTextButton = (
    label: string,
    onPress?: () => void,
    opts?: { loading?: boolean; disabled?: boolean; align?: "leading" | "trailing" },
  ) => {
    const inert = !!opts?.loading || !!opts?.disabled;
    const align = opts?.align ?? "trailing";
    // ── iOS 26 ALTI: kapsül SwiftUI'da DEĞİL, RN'de ─────────────────────────
    // 26 altında `buttonStyle("glass")` de `glassEffect` de no-op (bkz.
    // theme/glass.ts) — SwiftUI tarafında butondan geriye yalnız bir etiket
    // kalıyor, GÖRÜNEN her şey (zemin + kenar) zaten fallback'ten geliyordu. O
    // zemin düz bir dolguydu (`glassFallbackFill`), çünkü kutu bilerek butondan
    // geniş bırakılıyor (aşağıdaki `frame({ maxWidth, alignment })`) ve görünen
    // kapsülün genişliğini yalnız SwiftUI biliyor — RN'deki BlurView kutunun
    // şeffaf kalan kısmını da boyardı.
    //
    // Etiketi RN'de çizince o kısıt kalkıyor: ölçü Yoga'da ve İLK commit'te
    // belli, sarmalayıcı kapsüle birebir oturuyor. Böylece zemin de kenar da
    // ProfileScreen'in başlık butonlarıyla (çan/ayarlar) AYNI yerden geliyor —
    // `GlassFallbackSurface`in bulanıklığı + 0.5pt `colors.border`.
    //
    // `Host matchContents` ile de daralırdı ama o yol bu satırda denendi ve geri
    // alındı: SwiftUI ölçümü ikinci Fabric commit'inde geliyor, buton ilk
    // frame'de 0 genişlikte kalıp ölçüm gelince yerine zıplıyordu (aynı not X
    // butonunda). RN metni bu yarışa hiç girmiyor.
    //
    // Aşağıdaki iki SwiftUI dalı artık YALNIZ iOS 26+ çalışıyor.
    if (Platform.OS === "ios" && !HAS_LIQUID_GLASS) {
      return (
        <TouchableOpacity
          onPress={onPress}
          disabled={inert}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {/* width YOK: kapsül içeriğine göre daralıyor, satır space-between
              olduğu için dış kenarı yine header'ın kenarında duruyor. */}
          <GlassFallbackSurface
            shape="capsule"
            height={ACTION_HEIGHT}
            style={{
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              ...glassFallbackBorderStyle(),
            }}
          >
            <Text
              style={{
                color: colors.text,
                // SwiftUI "semibold" karşılığı — 26+'daki kardeşiyle aynı ağırlık.
                fontWeight: "600",
                fontSize: ACTION_LABEL_SIZE,
                includeFontPadding: false,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
          </GlassFallbackSurface>
        </TouchableOpacity>
      );
    }
    if (Platform.OS === "ios" && clearGlassActions) {
      return (
        // Berrak cam yolu: kabuk `buttonStyle`dan DEĞİL etiketin üstündeki
        // `.glassEffect(.clear, in: .capsule)`ten geliyor (gerekçe zinciriyle
        // birlikte glassTextClearCapsule'da). Kutu yine sabit
        // ACTION_BOX_WIDTH — kapsül ondan dar, son frame() ilgili kenara
        // yaslıyor, space-between satırında buton hiç yer değiştirmiyor.
        <Host style={{ width: ACTION_BOX_WIDTH, height: ACTION_HEIGHT }}>
          <SwiftUIButton
            onPress={inert ? () => {} : onPress ?? (() => {})}
            modifiers={[
              buttonStyle("plain"),
              // `label` prop'u YOK: verilirse native taraf children'ı yok
              // sayıyor (bkz. RegisterBackButton) ve cam etiket hiç çizilmiyor.
              accessibilityLabel(label),
              frame({ maxWidth: ACTION_BOX_WIDTH, alignment: align }),
            ]}
          >
            <SwiftUIText
              modifiers={glassTextClearCapsule({
                height: ACTION_HEIGHT,
                fontSize: ACTION_LABEL_SIZE,
              })}
            >
              {label}
            </SwiftUIText>
          </SwiftUIButton>
        </Host>
      );
    }
    return Platform.OS === "ios" ? (
      // X ile aynı gerekçe: matchContents YOK, kutu iki eksende de sabit.
      // Genişlik etikete göre değişemeyeceği için ProfileScreen'deki
      // "Profili Düzenle" deseni: sabit kutu + fixedSize(horizontal) ile
      // kapsül etikete daralır, son frame() onu kutunun ilgili kenarına yaslar.
      // Kalan alan şeffaf — space-between satırında kutunun DIŞ kenarı sabit
      // olduğu için buton hiç yer değiştirmiyor.
      <Host style={{ width: ACTION_BOX_WIDTH, height: ACTION_HEIGHT }}>
        <SwiftUIButton
          label={label}
          onPress={inert ? () => {} : onPress ?? (() => {})}
          modifiers={[
            buttonStyle("glass"),
            controlSize("large"),
            tint(colors.text),
            font({ size: ACTION_LABEL_SIZE, weight: "semibold" }),
            frame({ height: ACTION_HEIGHT }),
            fixedSize({ horizontal: true }),
            // vertical padding GİTTİ: yüksekliği artık frame() veriyor.
            //
            // `glassFallback()` YOK: bu dal artık yalnız iOS 26+ çalışıyor
            // (26 altı yukarıdaki RN dalında), yani zemini de kenarı da native
            // cam çiziyor.
            //
            // Kutu bilerek butondan geniş: maxWidth + alignment butonu kenara
            // yaslayıp kalanı şeffaf bırakıyor, fixedSize de kapsülün etikete
            // daralmasını sağlıyor.
            frame({ maxWidth: ACTION_BOX_WIDTH, alignment: align }),
          ]}
        />
      </Host>
    ) : (
      <TouchableOpacity
        onPress={onPress}
        disabled={inert}
        activeOpacity={0.7}
        style={{
          height: ACTION_HEIGHT,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: colors.hairlineSoft,
          alignItems: "center",
          justifyContent: "center",
          opacity: opts?.disabled ? 0.35 : 1,
        }}
      >
        {opts?.loading ? (
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Text
            style={{
              color: colors.text,
              fontWeight: "700",
              fontSize: ACTION_LABEL_SIZE,
            }}
          >
            {label}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const actionBtn = actionLabel
    ? renderTextButton(actionLabel, onAction, {
        loading: actionLoading,
        disabled: actionDisabled,
        align: "trailing",
      })
    : actionIcon
      ? // İkon yolu: X'in aynısı, yalnız sembolü ve tarafı farklı.
        renderIconButton(actionIcon, actionIconFallback, onAction, {
          label: actionIconLabel,
          loading: actionLoading,
          disabled: actionDisabled,
        })
      : null;

  const leftBtn = leftLabel
    ? renderTextButton(leftLabel, onLeftPress, { align: "leading" })
    : leftIcon
      ? // İkon yolu: sağdaki ✓ ile aynı fonksiyon, yalnız sembolü farklı.
        renderIconButton(leftIcon, leftIconFallback, onLeftPress, {
          label: leftIconLabel,
        })
      : null;

  // actionBtn rightSlot'tan önceliklidir; ikisi de yoksa null.
  const rightContent = actionBtn ?? rightSlot;
  // leftLabel verildiyse X'in yerini o alır (bkz. prop notu).
  const leftElement = leftBtn ?? (effectiveCloseSide === "left" ? closeBtn : null);
  const rightElement = effectiveCloseSide === "right" ? closeBtn : rightContent;

  // ── Backdrop ─────────────────────────────────────────────────────────────
  const renderBackdrop = useCallback(
    (props: any) => <SheetBlurBackdrop {...props} />,
    [],
  );

  const scrollContext = useMemo(
    () => ({ scrollRef, scrollY }),
    [scrollY],
  );

  return (
    <AppBottomSheet
      visible={visible}
      snapPoints={effectiveSnapPoints}
      topInset={effectiveTopInset}
      cornerRadius={cornerRadius}
      onClose={onClose}
      onPresented={onPresented}
      backdropComponent={renderBackdrop}
      handleComponent={null}
      enableContentPanningGesture={enableContentPanningGesture}
      stackBehavior={stackBehavior}
      enableDynamicSizing={dynamicSizing}
      maxDynamicContentSize={maxDynamicContentSize}
      keyboardBehavior={keyboardBehavior}
      footer={footer}
    >
      {/* ─── Content ─── */}
      <AppModalScrollContext.Provider value={scrollContext}>
      {scrollable ? (
        <BottomSheetScrollView
          ref={scrollRef}
          scrollEventsHandlersHook={useModalScrollEventsHandlers}
          scrollEnabled={scrollEnabled}
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={[
            {
              paddingTop: MODAL_HEADER_HEIGHT,
              paddingHorizontal: 20,
              paddingBottom: 40,
            },
            contentContainerStyle,
          ]}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          // Klavye açıkken ilk dokunuş SOĞURULMASIN: varsayılan ("never")
          // scroll view dokunuşu yiyip yalnız klavyeyi kapatıyor, buton ancak
          // ikinci basışta çalışıyordu (bkz. NoteComposerModal'ın Gönder'i).
          // "handled": touchable'lar tek basışta tetiklenir, boşluğa basınca
          // klavye yine kapanır.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </BottomSheetScrollView>
      ) : (
        <View
          style={[
            {
              flex: 1,
              backgroundColor: colors.bg,
              paddingTop: MODAL_HEADER_HEIGHT,
            },
            containerStyle,
          ]}
        >
          {children}
        </View>
      )}
      </AppModalScrollContext.Provider>

      {/* ─── Header ─── */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: MODAL_HEADER_HEIGHT,
          zIndex: 10,
        }}
      >
        {/* Progressive blur background — opacity scroll'a bağlı, üst köşeler
            modal'ın rounded shape'ine clip'leniyor. */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: MODAL_HEADER_HEIGHT,
              borderTopLeftRadius: cornerRadius,
              borderTopRightRadius: cornerRadius,
              overflow: "hidden",
            },
            headerBgStyle,
          ]}
        >
          {Platform.OS === "ios" ? (
            <MaskedView
              style={StyleSheet.absoluteFill}
              maskElement={
                <LinearGradient
                  locations={bgLocations as any}
                  colors={bgColors as any}
                  style={StyleSheet.absoluteFill}
                />
              }
            >
              {/* Derinlik perdesi — koyuda karartır, açıkta AYNI oranlarla
                  beyazlatır (veil). Maske siyah/şeffaf kalır: alfa maskesi. */}
              <LinearGradient
                colors={[veil(1), veil(0.2)]}
                style={StyleSheet.absoluteFill}
              />
              <BlurView
                intensity={15}
                tint={chromeBlurTint()}
                style={StyleSheet.absoluteFill}
              />
            </MaskedView>
          ) : (
            <View
              style={[
                StyleSheet.absoluteFill,
                // Android'de blur yok → düz zemin. Sabit #121212 yerine tema
                // zemini: açık modda beyaz header.
                { backgroundColor: withAlpha(colors.bg, 0.95) },
              ]}
            />
          )}
        </Animated.View>

        {/* Drag handle YOK — ne gorhom'unki (handleComponent={null}) ne de
            bizim çizdiğimiz pill. Sheet aşağı çekilerek ve backdrop'a
            dokunularak kapanmaya devam ediyor; kalkan yalnız çizgi. */}

        {/* Title + buttons aynı satırda. Title absolute centered (screen-center'da),
            butonlar sol/sağ kenarda. */}
        <View
          style={{
            position: "absolute",
            // Pill kalkmadan önce 34'tü (pill'in 4px'i + altındaki 10px boşluk).
            // Varsayılan MODAL_HEADER_ROW_TOP; kart yüzeyleriyle hizalanan
            // sheet'ler `headerButtonTop` ile kendi payını veriyor.
            top: headerButtonTop,
            // left + right İKİSİ DE ŞART: biri düşerse satır ekran genişliğine
            // yayılmaz, içeriği kadar kalır — space-between yayılacak boşluk
            // bulamaz, butonlar yan yana sola toplanır ve ortalanan başlık da
            // onlarla birlikte sola kayar.
            left: 0,
            right: 0,
            // Yükseklik butonun kendisi kadar — `clearGlassHeader` yolunda 46
            // değil 48. Header'ın toplam yüksekliği (74) ikisini de alıyor,
            // alttaki nefes payı 8'den 6'ya iniyor.
            height: ACTION_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
          }}
        >
          <View style={{ paddingVertical: 8 }}>{leftElement}</View>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              },
              titleAnimStyle,
            ]}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 18,
                fontWeight: "700",
                includeFontPadding: false,
                textAlignVertical: "center",
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
          </Animated.View>
          <View style={{ paddingVertical: 8 }}>{rightElement}</View>
        </View>
      </View>
    </AppBottomSheet>
  );
}
