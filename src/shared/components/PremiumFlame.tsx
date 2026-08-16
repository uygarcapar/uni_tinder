import { useId } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { FLAME_PATH, FLAME_VIEWBOX } from "./icons/FlameGlyph";
import { gradients } from "../theme/colors";

// Premium rozeti: isim/yaşın sağındaki ateş ikonu. Şekil artık SF/lucide flame
// değil, uygulamaya özel glyph (bkz. icons/FlameGlyph). Dolgu super-like
// kalbiyle aynı: gradients.swipeHeart. SwipeCard, LikesScreen kartı ve
// ProfileScreen hero'su aynı görseli paylaşsın diye tek yerde duruyor.
//
// Gradyan MaskedView + expo-linear-gradient yerine SVG <Defs> ile veriliyor:
// 3 native view (MaskedView + SymbolView maskesi + LinearGradient, offscreen
// compose) → tek Svg. Ayrıca iOS/Android'de birebir aynı şekil.
export const PREMIUM_FLAME_SIZE = 26;

export default function PremiumFlame({
  size = PREMIUM_FLAME_SIZE,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Aynı ekranda birden fazla rozet olabiliyor (LikesScreen listesi). SVG
  // gradient id'leri global — sabit bir id verilirse yanlış gradyan bağlanır.
  const gradientId = `premiumFlame${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <Svg width={size} height={size} viewBox={FLAME_VIEWBOX} style={style}>
      <Defs>
        <LinearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={24}
          y2={24}
        >
          {gradients.swipeHeart.map((color, i) => (
            <Stop
              key={color + i}
              offset={i / (gradients.swipeHeart.length - 1)}
              stopColor={color}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Path d={FLAME_PATH} fill={`url(#${gradientId})`} />
    </Svg>
  );
}
