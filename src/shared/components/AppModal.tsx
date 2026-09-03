import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
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
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  SCROLLABLE_STATUS,
  useBottomSheetInternal,
  useScrollEventsHandlersDefault,
  type ScrollEventsHandlersHookType,
} from "@gorhom/bottom-sheet";
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
import { X } from "@/shared/icons";
import SFIcon from "./SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors, isLight, veil, withAlpha } from "../theme/colors";
import {
  glassFallback,
  glassFallbackFill,
  glassTextClearCapsule,
} from "../theme/glass";
import GlassFallbackSurface from "./GlassFallbackSurface";
import { chromeBlurTint } from "@/shared/theme/blur";

// Header dikey breakdown:
//   top:20 — drag indicator pill (4px tall), iPhone üstten nefes payı için
//   top:34 — title + close/right-slot row (height:46)
//   total = 80 + 8px alt nefes → 88
const MODAL_HEADER_HEIGHT = 88;
const SHEET_TOP_RADIUS = 36;
// Tam ekrana yakın açılan uzun sheet'lerin (FilterModal, profil düzenleme) üst
// köşesi: aynı yarıçap büyük bir yüzeyde daha "keskin" okunuyor, bir tık açmak
// sheet'i arkadaki ekrandan ayırıyor. Yalnız opt-in — varsayılan 36 kalıyor.
export const SHEET_TOP_RADIUS_LARGE = 44;

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
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  // Custom rightSlot — actionLabel'ı override eder; tamamen özel buton için.
  rightSlot?: ReactNode;
  // Header'ın soluna X yerine metin butonu koyar (örn. FilterModal'ın
  // "Sıfırla"sı). Verildiğinde X HİÇ render edilmez — sheet swipe-down ve
  // backdrop ile kapanmaya devam eder. Action butonuyla birebir aynı stil.
  leftLabel?: string;
  onLeftPress?: () => void;
  // Header'ın metin butonları (leftLabel + actionLabel) dolgulu `.regular` cam
  // yerine BERRAK cam çizsin. Yuvarlak ikon butonlarının geçtiği yolun kapsül
  // hâli (bkz. glassTextClearCapsule); opt-in çünkü aynı header'ı kullanan
  // sheet'lerin hepsi henüz çevrilmedi.
  clearGlassActions?: boolean;
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
 * İçerik dışındaki her şey (progressive blur header, indicator pill, X butonu,
 * Save slot, scroll-driven title fade) burada — consumer sadece içerik geçer.
 *
 *   <AppModal visible={open} onClose={close} title="Ayarlar">
 *     {sections}
 *   </AppModal>
 *
 *   <AppModal visible={open} onClose={close} title="Profili Düzenle" rightSlot={saveButton}>
 *     {form}
 *   </AppModal>
 *
 *   <AppModal visible={open} onClose={close} title="Süper Beğeni" snapPoints={["60%"]} scrollable={false}>
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
  rightSlot,
  leftLabel,
  onLeftPress,
  clearGlassActions = false,
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
  // actionLabel veya rightSlot varsa X sola alınır (Save sağda kalsın); yoksa X sağda.
  const hasRightContent = !!actionLabel || !!rightSlot;
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
  // Android'de iki taraf da 46px yuvarlak/pill TouchableOpacity ile fallback.
  const ACTION_HEIGHT = 46;
  // Sağdaki/soldaki metin butonunun SABİT kutu genişliği. Etiketler kısa
  // (Kaydet / Sıfırla / Uygula / Bitti / Save / Reset); 11-13px semibold + 18px
  // yatay padding en uzununda bile ~90pt. Kutu onlardan geniş, buton içine
  // kenara yaslanıyor (bkz. aşağıdaki alignment).
  const ACTION_BOX_WIDTH = 120;
  // Etiket puntosu. Berrak camda bir tık küçük: `clear` variant'ın dolgusu yok,
  // kapsül yalnız kırılma + kenar parlamasıyla okunuyor ve aynı punto orada
  // dolgulu kardeşinden daha iri duruyordu.
  const ACTION_LABEL_SIZE = clearGlassActions ? 11 : 13;

  const closeBtn = closeButton ? (
    Platform.OS === "ios" ? (
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
          <SwiftUIButton
            label="Kapat"
            systemImage="xmark"
            onPress={onClose}
            modifiers={[
              buttonStyle("glass"),
              controlSize("large"),
              tint(colors.text),
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
        </Host>
      </GlassFallbackSurface>
    ) : (
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.7}
        style={{
          width: ACTION_HEIGHT,
          height: ACTION_HEIGHT,
          borderRadius: 999,
          backgroundColor: colors.hairlineSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SFIcon
          name="xmark"
          fallback={X}
          size={20}
          color={colors.text}
          strokeWidth={2}
          weight="semibold"
          style={{ pointerEvents: "none" }}
        />
      </TouchableOpacity>
    )
  ) : null;

  // Header'ın metin butonu. Sağdaki action (Uygula/Kaydet) ve soldaki leftLabel
  // (Sıfırla) aynı fonksiyondan çıkıyor ki iki taraf birebir aynı ölçüde dursun.
  const renderTextButton = (
    label: string,
    onPress?: () => void,
    opts?: { loading?: boolean; disabled?: boolean; align?: "leading" | "trailing" },
  ) => {
    const inert = !!opts?.loading || !!opts?.disabled;
    const align = opts?.align ?? "trailing";
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
            // Zemin BURADA düz dolgu, `GlassFallbackSurface`in bulanıklığı
            // DEĞİL: kutu bilerek butondan geniş (aşağıdaki maxWidth +
            // alignment) ve görünen kapsülün genişliğini yalnız SwiftUI biliyor
            // — RN'deki BlurView kutunun şeffaf kalan kısmını da boyardı.
            ...glassFallback({
              shape: "capsule",
              padding: { horizontal: 18 },
              backgroundColor: glassFallbackFill(),
            }),
            // Border'dan SONRA: maxWidth kutusu butonu kenara yaslayıp kalanı
            // şeffaf bırakıyor, öncesine konsa çerçeve boş alanı da sarardı.
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
    : null;

  const leftBtn = leftLabel
    ? renderTextButton(leftLabel, onLeftPress, { align: "leading" })
    : null;

  // actionBtn rightSlot'tan önceliklidir; ikisi de yoksa null.
  const rightContent = actionBtn ?? rightSlot;
  // leftLabel verildiyse X'in yerini o alır (bkz. prop notu).
  const leftElement = leftBtn ?? (effectiveCloseSide === "left" ? closeBtn : null);
  const rightElement = effectiveCloseSide === "right" ? closeBtn : rightContent;

  // ── Backdrop ─────────────────────────────────────────────────────────────
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
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

        {/* Custom drag handle — gorhom default kapalı, pill'i blur üstüne
            biz çiziyoruz. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 20,
            left: 0,
            right: 0,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              // Açık modda tam siyah: hairlineMuted (siyah %26) beyaz sheet
              // zemininde 4px'lik pil için fazla soluk kalıyordu. Koyu modda
              // dokunulmuyor — orada beyaz %30 zaten okunuyor.
              backgroundColor: isLight() ? colors.text : colors.hairlineMuted,
            }}
          />
        </View>

        {/* Title + buttons aynı satırda. Title absolute centered (screen-center'da),
            butonlar sol/sağ kenarda. */}
        <View
          style={{
            position: "absolute",
            top: 34,
            left: 0,
            right: 0,
            height: 46,
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
