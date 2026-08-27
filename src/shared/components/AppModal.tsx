import {
  ReactNode,
  createContext,
  useCallback,
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
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  controlSize,
  font,
  containerShape,
  shapes,
} from "@expo/ui/swift-ui/modifiers";
import { X } from "lucide-react-native";
import SFIcon from "./SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors, isLight, veil, withAlpha } from "../theme/colors";
import { glassFallback } from "../theme/glass";
import { chromeBlurTint } from "@/shared/theme/blur";

// Header dikey breakdown:
//   top:20 — drag indicator pill (4px tall), iPhone üstten nefes payı için
//   top:34 — title + close/right-slot row (height:46)
//   total = 80 + 8px alt nefes → 88
const MODAL_HEADER_HEIGHT = 88;
const SHEET_TOP_RADIUS = 36;

const AnimatedBottomSheetScrollView: any = Animated.createAnimatedComponent(
  BottomSheetScrollView,
);

// İçerideki input'ların (bkz. useKeyboardAwareField) modal scroll view'ına
// erişebilmesi için. scrollY zaten header animasyonu için tutuluyor; aynı
// değer "şu an neredeyiz" bilgisi olarak scroll hesabında da kullanılıyor.
export const AppModalScrollContext = createContext<{
  scrollRef: React.MutableRefObject<any>;
  scrollY: { value: number };
} | null>(null);

type AppModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  snapPoints?: any[];
  // true → sheet ekranın en üstüne kadar açılır AMA topInset=safe-area olarak
  // ayarlanır, böylece header status bar/dynamic island altına girmez ve buton
  // pozisyonları kaymaz. Verildiğinde snapPoints ["100%"]'e çekilir.
  fullScreen?: boolean;
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
  // X'in tarafı: actionLabel/rightSlot varsa default "left", yoksa "right".
  closeSide?: "left" | "right";
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
  closeButton = true,
  actionLabel,
  onAction,
  actionDisabled,
  actionLoading,
  rightSlot,
  leftLabel,
  onLeftPress,
  closeSide,
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
  const scrollRef = useRef<any>(null);
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

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
    opacity: titleTriggered.value,
    transform: [{ translateY: 12 * (1 - titleTriggered.value) }],
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

  const closeBtn = closeButton ? (
    Platform.OS === "ios" ? (
      <Host matchContents>
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
            // iOS 26 altında .automatic'e düşüyor: ne zemin ne intrinsic
            // boyut geliyor. Kare frame veriyoruz ki border tam daire olsun ve
            // Android fallback'iyle (ACTION_HEIGHT) aynı ölçüde dursun.
            ...glassFallback({
              shape: "circle",
              frame: { width: ACTION_HEIGHT, height: ACTION_HEIGHT },
            }),
          ]}
        />
      </Host>
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
    opts?: { loading?: boolean; disabled?: boolean },
  ) => {
    const inert = !!opts?.loading || !!opts?.disabled;
    return Platform.OS === "ios" ? (
      <Host matchContents>
        <SwiftUIButton
          label={label}
          onPress={inert ? () => {} : onPress ?? (() => {})}
          modifiers={[
            buttonStyle("glass"),
            controlSize("large"),
            tint(colors.text),
            font({ size: 13, weight: "semibold" }),
            ...glassFallback({
              shape: "capsule",
              padding: { horizontal: 18, vertical: 15 },
            }),
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
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
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
      })
    : null;

  const leftBtn = leftLabel ? renderTextButton(leftLabel, onLeftPress) : null;

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
        <AnimatedBottomSheetScrollView
          ref={scrollRef}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
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
        </AnimatedBottomSheetScrollView>
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
              borderTopLeftRadius: SHEET_TOP_RADIUS,
              borderTopRightRadius: SHEET_TOP_RADIUS,
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
