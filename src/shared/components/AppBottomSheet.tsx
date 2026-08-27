import { useCallback, useEffect, useMemo, useRef } from "react";
import { View, Keyboard } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { colors, scrimAt } from "../theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";

/**
 * Genel amaçlı bottom sheet wrapper'ı. Tüm modal'larda ortak gorhom config'i,
 * backdrop/background defaults'u tek yerde toplar.
 *
 * Declarative API: `visible` boolean'ı ile aç/kapa, ref kullanmaya gerek yok.
 *
 *   <AppBottomSheet visible={open} onClose={() => setOpen(false)} snapPoints={['90%']}>
 *     <SettingsContent />
 *   </AppBottomSheet>
 *
 * Props:
 *   visible — açık/kapalı state
 *   onClose — modal dismiss olduğunda (swipe/backdrop tap/programatik) çağrılır
 *   snapPoints — ['90%'] gibi gorhom snapPoints
 *   footer — sticky bottom footer içeriği (BottomSheetFooter ile sarılır)
 *   backdrop — 'default' (siyah opak) | 'blur' (BlurView dark) | 'none'
 *   enablePanDownToClose, enableOverDrag, enableContentPanningGesture,
 *   enableHandlePanningGesture — gorhom passthrough
 *   handleComponent — null verirsen drag handle kaybolur
 *   backgroundStyle — defaultlara merge edilir (dark + rounded)
 *
 * Internal: present() çağrısı bir frame ertelenir (requestAnimationFrame).
 * gorhom v5.2.14 + reanimated 4.3.1'de useEffect tick'inde present() çağırmak
 * BottomSheetModal'ın internal animated value'larının initialize olmasından
 * önce geliyor → no-op veya kararsız state. Bir frame beklemek, mount commit'i
 * + reanimated UI thread sync tamamlandığı için güvenli timing sağlar.
 */
export default function AppBottomSheet({
  visible,
  onClose,
  onPresented,
  snapPoints: snapPointsProp,
  children,
  footer,
  footerComponent: customFooterComponent,
  backdrop = "default",
  backdropComponent: customBackdropComponent,
  enablePanDownToClose = true,
  enableOverDrag = false,
  enableContentPanningGesture,
  enableHandlePanningGesture,
  activeOffsetX,
  activeOffsetY,
  failOffsetX,
  failOffsetY,
  handleComponent,
  handleIndicatorStyle,
  backgroundStyle,
  stackBehavior,
  topInset,
  enableDynamicSizing = false,
  maxDynamicContentSize,
  keyboardBehavior = "extend",
}: any) {
  const ref = useRef(null);
  // gorhom'un `handleDismiss` bir state machine bug'ı taşıyor:
  //   - status === INITIAL veya DISMISSED iken dismiss() çağrılırsa
  //     erken çıkmıyor, status'u DISMISSING'e zehirliyor (sheet henüz mount
  //     olmadığı için forceClose no-op olsa da).
  //   - Sonraki present() çağrısında Portal mount olurken handlePortalRender
  //     status === DISMISSING görüp render'ı iptal ediyor → modal görünmez.
  // Bu yüzden sadece *gerçekten present edilmiş* bir modal'ı dismiss ederiz.
  // Initial mount (visible=false) ve user-driven dismiss (gorhom zaten dismiss
  // etti, onDismiss callback'inde flag'i false'a çekiyoruz) durumlarında
  // wrapper'dan ek dismiss göndermiyoruz.
  const hasPresentedRef = useRef(false);
  const snapPoints = useMemo(() => snapPointsProp, [snapPointsProp]);

  const handleDismiss = useCallback(() => {
    hasPresentedRef.current = false;
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      // present()'i bir frame değil ~6 frame ertele — gorhom'un içsel mount +
      // provider registration + portal sync hızlı JS'te tek-rAF ile settle
      // olamıyor (devtools açıkken çalışıp kapalıyken çalışmama paterni).
      const id = setTimeout(() => {
        ref.current?.present?.();
        hasPresentedRef.current = true;
      }, 100);
      return () => clearTimeout(id);
    }
    // visible=false: sadece daha önce present edildiyse dismiss çağır.
    // İlk mount'ta ve user-driven dismiss sonrasında dismiss() çağırmak
    // gorhom status'unu INITIAL/DISMISSED → DISMISSING'e zehirleyip sonraki
    // present()'i block ediyor.
    if (hasPresentedRef.current) {
      ref.current?.dismiss?.();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props) => {
      if (backdrop === "none") return null;
      if (backdrop === "blur") {
        return (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={1}
            pressBehavior={enablePanDownToClose ? "close" : "none"}
            style={[props.style, { backgroundColor: "transparent" }]}
          >
            <BlurView
              intensity={30}
              tint={plainBlurTint()}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            />
            {/* Blur tek başına arkayı yeterince geri itmiyor: içerik bulanık
                ama AYNI parlaklıkta kalıyor, sheet zeminiyle (colors.bg)
                kontrast oluşmuyor. Blur'un ÜSTÜNE ince bir perde çekiyoruz —
                `scrimAt` her iki modda da siyah, açık modda da karartır. */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: scrimAt(0.28),
              }}
            />
          </BottomSheetBackdrop>
        );
      }
      return (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.5}
          pressBehavior={enablePanDownToClose ? "close" : "none"}
        />
      );
    },
    [backdrop, enablePanDownToClose],
  );

  const renderFooter = useCallback(
    (props) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        {footer}
      </BottomSheetFooter>
    ),
    [footer],
  );

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={snapPoints}
      // gorhom v5 default'u true → sheet kendini içeriğe göre büyütür ve
      // snapPoints sadece "max" gibi davranır. Bu yüzden uzun içerikli
      // modal'lar (FilterModal vb.) snap'i geçip ekranı kaplıyordu. Varsayılan
      // KAPALI: snapPoints katı kalsın, içerik scroll'la sığsın.
      //
      // İçeriği kısa ve sabit olan sheet'ler (not composer'ı gibi) prop'la
      // açabilir: o zaman snapPoints VERİLMEZ, tek detent ölçülen içerik
      // yüksekliğidir (`maxDynamicContentSize` tavanıyla).
      enableDynamicSizing={enableDynamicSizing}
      maxDynamicContentSize={maxDynamicContentSize}
      // "extend": klavye açılınca sheet en yüksek detent'e gider, KLAVYENİN
      // ÜSTÜNE ÇIKMAZ — içerik alanı klavye kadar kısalır ve içerik scroll'a
      // kalır. Input'u klavyenin üstünde TUTMASI gereken sheet'ler
      // "interactive" geçer: sheet klavye kadar yukarı ötelenir.
      keyboardBehavior={keyboardBehavior}
      enablePanDownToClose={enablePanDownToClose}
      enableOverDrag={enableOverDrag}
      enableContentPanningGesture={enableContentPanningGesture}
      enableHandlePanningGesture={enableHandlePanningGesture}
      // Sheet'in kendi pan gesture'ının aktivasyon eşikleri. İçeriğinde yatay
      // swipe olan sheet'ler (LikerSwipeModal) failOffsetX vererek yatay
      // sürüklemeyi sheet'e kaptırmaz, karta bırakır.
      activeOffsetX={activeOffsetX}
      activeOffsetY={activeOffsetY}
      failOffsetX={failOffsetX}
      failOffsetY={failOffsetY}
      onDismiss={handleDismiss}
      // Kapanış animasyonu BAŞLARKEN klavyeyi de indir. gorhom klavyeyi kendisi
      // kapatmıyor: input unmount olana (yani sheet tamamen gidene) kadar açık
      // kalıyor → sheet iniyor, klavye ARDINDAN ayrı bir animasyonla iniyor.
      // `onAnimate` üç kapanış yolunu da kapsıyor (programatik dismiss, aşağı
      // swipe, backdrop tap) — `onDismiss` ise animasyon BİTİNCE geldiği için
      // burada geç kalırdı.
      onAnimate={(_from: number, to: number) => {
        if (to === -1) Keyboard.dismiss();
      }}
      onChange={(index: number) => {
        // index >= 0: modal slide-up animasyonu tamamlandı, snap'lendi.
        // JS thread serbest, parent ağır mount'unu burada güvenle tetikleyebilir.
        // setTimeout'a göre çok daha güvenilir — gorhom callback'i UI thread
        // animasyon bitince fire eder, JS event loop park'lanmasından etkilenmez.
        if (index >= 0) onPresented?.();
      }}
      backdropComponent={customBackdropComponent || renderBackdrop}
      footerComponent={
        customFooterComponent || (footer ? renderFooter : undefined)
      }
      handleComponent={handleComponent}
      handleIndicatorStyle={handleIndicatorStyle}
      stackBehavior={stackBehavior}
      topInset={topInset}
      backgroundStyle={{
        backgroundColor: colors.bg,
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        ...backgroundStyle,
      }}
      // Sheet'in OUTER container'ı default'ta rectangular — sadece backgroundStyle
      // rounded olduğu için içerik (blur, scroll, vs) yuvarlak köşelerin üstüne
      // taşıyordu. Container'a overflow:hidden + matching radius vererek tüm
      // child'ları sheet'in rounded shape'ine clip'liyoruz.
      style={{
        overflow: "hidden",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
    >
      {children}
    </BottomSheetModal>
  );
}
