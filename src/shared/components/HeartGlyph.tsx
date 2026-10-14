import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { HEART_PATH, HEART_VIEWBOX } from "./icons/HeartGlyph";

/**
 * Beğeni kalbi: SF `heart`/`heart.fill` ya da lucide `Heart` DEĞİL, uygulama
 * ikonundan sökülen kalp glyph'i (bkz. icons/HeartGlyph) — Beğeniler
 * sekmesinin tab ikonu da bu şekilden rasterize ediliyor
 * (scripts/gen-tab-icons.js > GLYPHS). Jenerik sistem kalbi onun yanında
 * yabancı kalıyordu.
 *
 * `FireGlyph` ile KARDEŞ DEĞİL ARTIK: Fire ürünü aleve geçti (bkz. FireGlyph
 * notu), bu glyph yalnız "beğeni" anlamını taşıyor.
 *
 * Dolu/outline ayrımı çağıranın:
 *   dolu    → `color` (düz dolgu)
 *   outline → `stroke` + `strokeWidth`, `color` verilmez (fill: none)
 *
 * ⚠️ Tab ikonunun outline'ı İÇ kontur (dolu siluetten mesafe alanıyla
 * türetiliyor, bkz. gen-tab-icons.js), buradaki ise SVG'nin ORTALANMIŞ
 * konturu: aynı kalınlıkta yarısı siluetin dışına taşıyor. Küçük ölçülerde
 * fark gözle ayırt edilmiyor; birebir eşleşmesi gereken bir yer çıkarsa
 * siluet `clipPath` ile kırpılmalı, `strokeWidth` oynatılmamalı.
 *
 * Renk kararı da çağıranın. Gradyan dolgu isteyen yerler bunu MaskedView'a
 * maskeElement olarak verebilir (`<HeartGlyph color="black" />`).
 */
export default function HeartGlyph({
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
