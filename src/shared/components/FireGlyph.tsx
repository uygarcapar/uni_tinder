import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { FLAME_PATH, FLAME_VIEWBOX } from "./icons/FlameGlyph";

/**
 * Fire ikonu: ALEV (bkz. icons/FlameGlyph) — SF `heart.fill` / lucide
 * `Heart` değil, app-icon'un kalbi de değil.
 *
 * KALPTEN ALEVE GEÇİLDİ (istek): ürünün Fire kutlaması zaten ekranı
 * süpüren bir alev dalgası (bkz. FireFlameCanvas) ve keşif kartında ikon
 * çekme sırasında YANIYOR (bkz. flameBurn / FireBurnCanvas). Kalp o
 * hareketin içinde bir yabancıydı: titreşen bir kalp ile alevden bir kutlama
 * aynı jestin iki ucunda duruyordu.
 *
 * ÖLÇÜ DEĞİŞMEDİ, o yüzden çağıran tarafların `size`'ı oynamadı: iki glyph de
 * aynı 24'lük grid'e, UZUN KENARI 20 olacak şekilde bakelendi (kalp 20×16.95
 * yatay, alev 15.04×20 dikey). Yani aynı `size`ta optik ağırlıkları eşit, yalnız
 * yönleri farklı.
 *
 * Renk kararı çağıranın: `color` düz dolgu, `stroke`/`strokeWidth` ince kontur.
 * Gradyan dolgu isteyen yerler bunu MaskedView'a maskeElement olarak veriyor
 * (`<FireGlyph color="black" />`) — lucide'de olduğu gibi.
 *
 * GRADYANI KENDİNDEN OLAN İKİZİ VAR: `PremiumFlame` aynı path'i tek `Svg`
 * içinde `<Defs>` gradyanıyla çiziyor (zemini kendinden belli yerler için).
 * Fire ürününü işaretleyen her yer BUNU çağırsın — ikisi aynı şekli
 * çiziyor ama anlamları ayrı, `PremiumFlame` lit plus'ın işareti.
 *
 * Not ürününün glyph'i (NoteGlyph) hâlâ app-icon'dan sökülen konuşma balonu:
 * iki ürün artık aynı aileden DEĞİL ve bu kasıtlı — not "yorumlu beğeni",
 * Fire ise ürünün ateş hattı.
 */
export default function FireGlyph({
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
    <Svg width={size} height={size} viewBox={FLAME_VIEWBOX} style={style}>
      <Path
        d={FLAME_PATH}
        fill={color ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
