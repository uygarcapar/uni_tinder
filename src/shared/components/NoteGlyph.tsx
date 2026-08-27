import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { NOTE_PATH, NOTE_VIEWBOX } from "./icons/NoteGlyph";

/**
 * Not ikonu: SF `bubble.left` / lucide `MessageCircle` değil, uygulama
 * ikonundan sökülen konuşma balonu glyph'i (bkz. icons/NoteGlyph).
 * SuperLikeGlyph'in kalbiyle kardeş — ikisi de aynı app-icon'un parçası, o
 * yüzden not ürünü nerede görünürse aynı şekli kullanıyor.
 *
 * Balonun içindeki kalp DOLU DEĞİL, delik: altındaki ne varsa (fotoğraf, kart
 * zemini) oradan görünür. İki alt-path'in sarım yönü aynı olduğu için deliği
 * yalnız `fillRule="evenodd"` açıyor — nonzero'da kalp dolar. Değiştirme.
 *
 * Renk kararı çağıranın: `color` düz dolgu, `stroke`/`strokeWidth` ince kontur.
 * Gradyan dolgu isteyen yerler bunu MaskedView'a maskeElement olarak verebilir
 * (`<NoteGlyph color="black" />`) — SuperLikeGlyph'te olduğu gibi; delik orada
 * da maskenin dışında kalır, yani gradyan kalbin içine taşmaz.
 */
export default function NoteGlyph({
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
    <Svg width={size} height={size} viewBox={NOTE_VIEWBOX} style={style}>
      <Path
        d={NOTE_PATH}
        fill={color ?? "none"}
        fillRule="evenodd"
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
