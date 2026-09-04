import type { StyleProp, ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { LucideIcon } from "@/shared/icons";
import {
  ZODIAC_GLYPH_PATHS,
  ZODIAC_GLYPH_VIEWBOX,
} from "./icons/ZodiacGlyphs";

/**
 * Burç ikonları — her burç kendi sembolüyle (♈–♓) çizilir, elementel bir
 * karşılıkla (ateş/yaprak) değil.
 *
 * lucide ARAYÜZÜNÜ taklit ediyor (size/color/strokeWidth/style) çünkü
 * PillIconSpec.lucide alanına takılıp SFIcon'un fallback yolundan render
 * ediliyor: `forceFallback: true` ile iki platformda da bu çiziliyor (SF
 * Symbols'ta burç sembolü YOK, bkz. filterEnumIcons → ZODIAC_ICONS).
 *
 * `fill` BİLEREK yok: glifler kontur; SFIcon dolgulu SF varyantlarını taklit
 * etmek için fallback'e fill geçirebiliyor ve burçlarda o dolgu şekli
 * okunmaz bir lekeye çeviriyor.
 */
type ZodiacGlyphProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

function makeZodiacGlyph(enumName: string, paths: readonly string[]) {
  function ZodiacGlyph({
    size = 24,
    color = "currentColor",
    strokeWidth = 2,
    style,
  }: ZodiacGlyphProps) {
    return (
      <Svg
        width={size}
        height={size}
        viewBox={ZODIAC_GLYPH_VIEWBOX}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={style}
      >
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    );
  }
  ZodiacGlyph.displayName = `Zodiac${enumName}`;
  // LucideIcon bir ForwardRefExoticComponent; burçlara ref veren yok, o yüzden
  // forwardRef sarmalamak yerine tipi eşitliyoruz.
  return ZodiacGlyph as unknown as LucideIcon;
}

/** Anahtar backend enumName'i (PascalCase) — bkz. filterEnumIcons. */
export const ZODIAC_GLYPH_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  Object.entries(ZODIAC_GLYPH_PATHS).map(([enumName, paths]) => [
    enumName,
    makeZodiacGlyph(enumName, paths),
  ]),
);
