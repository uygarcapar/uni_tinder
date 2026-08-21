import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HEART_PATH, HEART_VIEWBOX } from "./icons/HeartGlyph";

/**
 * SuperLike ikonu: lucide `Heart` / SF `heart.fill` değil, uygulamaya özel
 * glyph (bkz. icons/HeartGlyph). PremiumFlame'in kalp karşılığı — SwipeCard'ın
 * super-like butonu, ProfileScreen'deki SuperLikeCard rozeti ve
 * SuperLikePurchaseModal aynı şekli paylaşsın diye tek yerde duruyor.
 *
 * Renk kararı çağıranın: `color` düz dolgu, `stroke`/`strokeWidth` ince kontur.
 * Gradyan dolgu isteyen yerler bunu MaskedView'a maskeElement olarak veriyor
 * (`<SuperLikeGlyph color="black" />`) — lucide'de olduğu gibi.
 */
export default function SuperLikeGlyph({
  size = 24,
  color,
  stroke,
  strokeWidth,
  style,
}: {
  size?: number;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg width={size} height={size} viewBox={HEART_VIEWBOX} style={style}>
      <Path
        d={HEART_PATH}
        fill={color ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
