import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { onMediaAt, scrimAt } from "@/shared/theme/colors";
import type { Rect } from "./cropStage";

/**
 * Kırpma çerçevesi katmanı: karartma + 3×3 ızgara + köşe tırnakları.
 *
 * Katman ÜST KUTUSUNU doldurur (`absoluteFill`): karartma ebadı çağıranın
 * verdiği bir sayıdan değil ana kutunun kendisinden geliyor (Android'de pencere
 * yüksekliği kök kutudan farklı olabiliyor).
 * `frame` — pencere dikdörtgeni, üst kutunun koordinat uzayında.
 *
 * ⚠️ BU BİLEŞEN, CAM BUTONLARIN KARDEŞİ OLARAK KONMALI, ATASI DEĞİL: kendi
 * opaklığı animasyonlu ve ata zincirinde animasyonlu opaklık liquid glass'ı
 * sessizce düşürüyor (bkz. shared/theme/glass.ts notları).
 */
export function CropFrame({
  visible,
  frame,
  gridStyle,
}: {
  visible: boolean;
  frame: Rect;
  gridStyle: ReturnType<typeof useAnimatedStyle>;
}) {
  /**
   * Çerçeve katmanının iniş/kalkışı.
   *
   * Katman AĞAÇTA KALIYOR, yalnız opaklığı dönüyor: koşullu render'da karartmanın
   * dört dikdörtgeni ilk karede birden belirip göz kırpıyordu. Katmanın içinde
   * cam YOK — butonlar bu katmanın KARDEŞİ olmalı, yoksa animasyonlu opaklık
   * liquid glass'ı sessizce düşürürdü.
   */
  const frameStyle = useAnimatedStyle(
    () => ({ opacity: withTiming(visible ? 1 : 0, { duration: 180 }) }),
    [visible],
  );

  const scrim = scrimAt(0.72);
  const { left, top, width, height } = frame;

  return (
    // Karartma: pencerenin dört yanına dikdörtgen. Yuvarlak delik svg
    // maskesi gerektirirdi; Apple Photos da keskin köşe kullanıyor.
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, frameStyle]}
    >
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: top, backgroundColor: scrim }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: top + height, bottom: 0, backgroundColor: scrim }} />
      <View style={{ position: "absolute", left: 0, width: left, top, height, backgroundColor: scrim }} />
      <View style={{ position: "absolute", left: left + width, right: 0, top, height, backgroundColor: scrim }} />

      <Animated.View style={[{ position: "absolute", left, top, width, height }, gridStyle]}>
        {[1, 2].map((i) => (
          <View
            key={`v${i}`}
            style={{ position: "absolute", top: 0, bottom: 0, left: (width * i) / 3, width: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
          />
        ))}
        {[1, 2].map((i) => (
          <View
            key={`h${i}`}
            style={{ position: "absolute", left: 0, right: 0, top: (height * i) / 3, height: StyleSheet.hairlineWidth, backgroundColor: onMediaAt(0.28) }}
          />
        ))}
      </Animated.View>

      <CornerTicks left={left} top={top} width={width} height={height} />
    </Animated.View>
  );
}

/** Çerçevenin dört köşesindeki L biçimli tırnaklar. */
function CornerTicks({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const LEN = 22;
  const THICK = 2;
  const tick = onMediaAt(0.95);
  const corners = [
    { x: left, y: top, hx: 0, hy: 0, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top, hx: 0, hy: 0, vx: LEN - THICK, vy: 0 },
    { x: left, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: 0, vy: 0 },
    { x: left + width - LEN, y: top + height - LEN, hx: 0, hy: LEN - THICK, vx: LEN - THICK, vy: 0 },
  ];
  return (
    <>
      {corners.map((c, i) => (
        <View key={i} style={{ position: "absolute", left: c.x, top: c.y, width: LEN, height: LEN }}>
          <View style={{ position: "absolute", left: c.hx, top: c.hy, width: LEN, height: THICK, backgroundColor: tick }} />
          <View style={{ position: "absolute", left: c.vx, top: c.vy, width: THICK, height: LEN, backgroundColor: tick }} />
        </View>
      ))}
    </>
  );
}
