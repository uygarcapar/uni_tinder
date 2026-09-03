import { useId } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
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
//
// `color` verilirse gradyan yerine düz dolgu: lit plus kartı gibi zemini zaten
// kırmızı-turuncu gradyan olan yüzeylerde (gradients.litPlusCard) rozetin
// gradyanı zemine gömülüyor, orada onMedia ile düz çiziliyor.
export const PREMIUM_FLAME_SIZE = 26;

/**
 * `background` verilen rozette alevin, DAİRENİN çapına göre oranı.
 *
 * Çıplak glyph'te `size` doğrudan alevin kutusu; zeminli rozette ise `size`
 * DAİRENİN çapı ve alev onun içine giriyor — çağıran taraf her iki durumda da
 * "rozetin dış ölçüsü" veriyor, hesabı burası yapıyor.
 *
 * 0.67 alevin daire içinde nefes almasını sağlıyor: glyph zaten kendi kutusunun
 * 20/24'ünü dolduruyor (bkz. icons/FlameGlyph), yani görünür alev ≈ çapın
 * yarısından bir tık fazlası. Daha büyüğü (0.8+) kenara değip zemini halkaya
 * çeviriyor.
 *
 * 0.62'den 0.67'ye çıktı ve bu KOZMETİK DEĞİL, bir dengeleme: çağıran taraftaki
 * daire çapı küçüldü (SwipeCard > PREMIUM_FLAME_SIZE, 25 → 23) ama alevin
 * ölçüsü aynı kalsın istendi. Oran sabit kalsaydı glyph de küçülürdü:
 * 23 × 0.67 ≈ 15.4 ≈ 25 × 0.62. Çapı yeniden oynatan bu ikiliyi birlikte
 * düşünmek zorunda.
 */
const FLAME_IN_CIRCLE = 0.67;

export default function PremiumFlame({
  size = PREMIUM_FLAME_SIZE,
  color,
  background,
  style,
}: {
  /** Çıplak glyph'te alevin kutusu, `background` varken DAİRENİN çapı. */
  size?: number;
  color?: string;
  /**
   * Verilirse alev, bu renkte bir DAİRENİN içine oturuyor. Renk buradan
   * gelmek zorunda: bu dosya temaya bakmıyor (toast/lit shop gibi zemini
   * kendi belli olan yerlerde de kullanılıyor), moda göre dönen bir zemin
   * isteyen çağıran `colors.bg`'yi RENDER ANINDA okuyup geçirir — palet
   * mutasyona uğradığı için modül seviyesinde sabitlenemez.
   */
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Aynı ekranda birden fazla rozet olabiliyor (LikesScreen listesi). SVG
  // gradient id'leri global — sabit bir id verilirse yanlış gradyan bağlanır.
  const gradientId = `premiumFlame${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // Zeminli rozette `size` dairenin çapı, alev onun bir oranı.
  const glyphSize = background ? size * FLAME_IN_CIRCLE : size;

  const glyph = (
    <Svg
      width={glyphSize}
      height={glyphSize}
      viewBox={FLAME_VIEWBOX}
      // Zemin varken dış stil DAİREYE gidiyor (hizalama/marj oranın değil
      // rozetin işi), yoksa eskisi gibi doğrudan Svg'ye.
      style={background ? undefined : style}
    >
      {color ? null : (
        <Defs>
          <LinearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={24}
            y2={24}
          >
            {gradients.swipeHeart.map((stopColor, i) => (
              <Stop
                key={stopColor + i}
                offset={i / (gradients.swipeHeart.length - 1)}
                stopColor={stopColor}
              />
            ))}
          </LinearGradient>
        </Defs>
      )}
      <Path d={FLAME_PATH} fill={color ?? `url(#${gradientId})`} />
    </Svg>
  );

  if (!background) return glyph;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          // Tam daire: yarıçap çapın yarısı. `borderCurve` YOK — o yalnız
          // köşeli kutularda anlamlı, tam dairede etkisiz.
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {glyph}
    </View>
  );
}
