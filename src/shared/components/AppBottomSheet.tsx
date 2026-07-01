import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { colors } from "../theme/colors";

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
  handleComponent,
  handleIndicatorStyle,
  backgroundStyle,
  stackBehavior,
  topInset,
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
              tint="dark"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
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
      // modal'lar (FilterModal vb.) snap'i geçip ekranı kaplıyordu. Burada
      // disable ediyoruz: snapPoints katı kalsın, içerik scroll'la sığsın.
      enableDynamicSizing={false}
      keyboardBehavior="extend"
      enablePanDownToClose={enablePanDownToClose}
      enableOverDrag={enableOverDrag}
      enableContentPanningGesture={enableContentPanningGesture}
      enableHandlePanningGesture={enableHandlePanningGesture}
      onDismiss={handleDismiss}
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
