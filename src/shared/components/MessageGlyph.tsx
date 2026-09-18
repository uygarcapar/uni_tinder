import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { MESSAGE_PATH, MESSAGE_VIEWBOX } from "./icons/MessageGlyph";

/**
 * Mesaj ikonu: SF `message.fill` / lucide `MessageCircle` değil, mesaj
 * sekmesinin tab bar ikonuyla BİREBİR aynı glyph (bkz. icons/MessageGlyph —
 * oradan hem bu bileşen hem gen-tab-icons.js besleniyor). Sohbete götüren her
 * yer aynı balonu göstersin diye var: MatchModal'ın "mesaj gönder" CTA'sı
 * sekmedeki ikonla aynı şekli taşıyor.
 *
 * NoteGlyph'in kardeşi ama aynısı DEĞİL: bu, o balonun kalp oyuğu olmayan hâli.
 * Not ürünü ile sohbet ayrı okunsun diye ikisi ayrı duruyor; oyuk gerekiyorsa
 * NoteGlyph'i kullan.
 *
 * Tek kapalı alt-path olduğu için `fillRule` gerekmiyor. Renk kararı çağıranın:
 * `color` düz dolgu, `stroke`/`strokeWidth` ince kontur.
 */
export default function MessageGlyph({
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
    <Svg width={size} height={size} viewBox={MESSAGE_VIEWBOX} style={style}>
      <Path
        d={MESSAGE_PATH}
        fill={color ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Svg>
  );
}
