import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";

/**
 * Genel amaçlı bottom sheet wrapper'ı. Tüm modal'larda ortak gorhom config'i,
 * remount workaround'u, backdrop/background defaults'u tek yerde toplar.
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
 * Internal: visible true→false→true cycle'ında modal subtree'sini remount eder
 * (gorhom v5 + reanimated 4 uyumsuzluk fix'i). reanimated v3 ve gorhom v6
 * geldiğinde key bumping kaldırılabilir.
 */
export default function AppBottomSheet({
  visible,
  onClose,
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
}) {
  const ref = useRef(null);
  const [mountKey, setMountKey] = useState(0);
  const snapPoints = useMemo(() => snapPointsProp, [snapPointsProp]);

  // visible true olduğunda key bump et + present. false olduğunda dismiss.
  useEffect(() => {
    if (visible) {
      setMountKey((k) => k + 1);
    } else {
      ref.current?.dismiss?.();
    }
  }, [visible]);

  // Key değiştikten sonra (yeni mount commit olduktan sonra) present.
  useEffect(() => {
    if (visible && mountKey > 0) {
      const id = setTimeout(() => ref.current?.present?.(), 0);
      return () => clearTimeout(id);
    }
  }, [mountKey, visible]);

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
      key={mountKey}
      ref={ref}
      snapPoints={snapPoints}
      enablePanDownToClose={enablePanDownToClose}
      enableOverDrag={enableOverDrag}
      enableContentPanningGesture={enableContentPanningGesture}
      enableHandlePanningGesture={enableHandlePanningGesture}
      onDismiss={onClose}
      backdropComponent={customBackdropComponent || renderBackdrop}
      footerComponent={
        customFooterComponent || (footer ? renderFooter : undefined)
      }
      handleComponent={handleComponent}
      handleIndicatorStyle={handleIndicatorStyle}
      stackBehavior={stackBehavior}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        ...backgroundStyle,
      }}
    >
      {children}
    </BottomSheetModal>
  );
}
