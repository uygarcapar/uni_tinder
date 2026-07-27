import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { KeyboardController } from "react-native-keyboard-controller";
import { REVEAL_MAX } from "./RevealContext";

/**
 * Listeyi SOLA çekince tüm satırları `revealX` kadar kaydıran (saat/okundu kolonu
 * açılır), bırakınca yerine yaylandıran jest + klavye açıkken listeye dokununca
 * klavyeyi kapatan tap jesti. İkisi Gesture.Simultaneous ile birleşir.
 *
 * `revealX` UI-thread'de sürülür; balonlar RevealContext'ten worklet içinde okur →
 * per-frame React render YOK.
 */
export function useRevealGesture() {
  const revealX = useSharedValue(0);

  const revealPan = useMemo(
    () =>
      Gesture.Pan()
        // Sadece SOL çekişi sahiplen (saat kolonunu aç).
        .activeOffsetX(-15)
        // Sağa çekişte fail → native swipe-back (geri git) çalışsın.
        .failOffsetX(15)
        // Dikey harekette fail → liste scroll'una bırak.
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          "worklet";
          if (e.translationX >= 0) {
            revealX.value = 0;
            return;
          }
          const raw = -e.translationX;
          revealX.value =
            raw <= REVEAL_MAX
              ? raw
              : REVEAL_MAX + (raw - REVEAL_MAX) * 0.18; // rubber-band
        })
        .onFinalize(() => {
          "worklet";
          revealX.value = withSpring(0, {
            damping: 20,
            stiffness: 220,
            mass: 0.6,
          });
        }),
    [revealX],
  );

  // Klavye açıkken listeye dokununca klavyeyi kapat. KeyboardController.dismiss()
  // klavye kapalıyken no-op → balon etkileşimlerine karışmaz.
  const dismissTap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .maxDuration(250)
        .onEnd(() => {
          KeyboardController.dismiss();
        }),
    [],
  );

  const listGesture = useMemo(
    () => Gesture.Simultaneous(revealPan, dismissTap),
    [revealPan, dismissTap],
  );

  return { revealX, listGesture };
}
