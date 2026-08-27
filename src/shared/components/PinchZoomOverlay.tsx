import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import {
  bindZoomOverlay,
  zoomProgress,
  zoomRadius,
  zoomRectH,
  zoomRectW,
  zoomRectX,
  zoomRectY,
  zoomScale,
  zoomTranslateX,
  zoomTranslateY,
} from "./pinchZoom";

/**
 * Pinch ile büyütülen fotoğrafın çizildiği KÖK katman (App.tsx'te, navigator'ın
 * üstünde). Kaynak fotoğrafın ağacında çizilemiyor: kart frame'i, bölüm
 * kutuları ve ScrollView `overflow: hidden` — büyüyen görsel kutusunda
 * kırpılırdı.
 *
 * Boştayken `null` döner: aktif değilken ağaçta hiçbir düğüm yok, dolayısıyla
 * her ekranda taşınan bedeli de yok.
 *
 * `pointerEvents="none"`: katman yalnız GÖRSEL. Jest kaynağın kendi ağacında
 * (PinchZoomable) yaşamaya devam ediyor, yoksa parmaklar bu katmanın altında
 * kalıp pinch'in kendisi kesilirdi.
 */
export default function PinchZoomOverlay() {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    bindZoomOverlay(setUri);
    return () => bindZoomOverlay(null);
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: 0.85 * zoomProgress.value,
  }));

  // Konum/boyut da animated: değerler jest BAŞINDA bir kez yazılıyor (measure),
  // sonra sabit kalıyor — her frame'de değişen tek şey transform.
  const imageStyle = useAnimatedStyle(() => ({
    width: zoomRectW.value,
    height: zoomRectH.value,
    borderRadius: zoomRadius.value,
    transform: [
      { translateX: zoomRectX.value + zoomTranslateX.value },
      { translateY: zoomRectY.value + zoomTranslateY.value },
      { scale: zoomScale.value },
    ] as const,
  }));

  if (!uri) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "#000" },
          backdropStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            borderCurve: "continuous",
            overflow: "hidden",
          },
          imageStyle,
        ]}
      >
        {/* `cachePolicy` + aynı uri → görsel zaten bellekte, kopya ilk frame'de
            hazır: parmak açılırken boş kutu görünmüyor. */}
        <Image
          source={{ uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={uri}
        />
      </Animated.View>
    </View>
  );
}
