import { Platform } from "react-native";
import {
  background,
  frame,
  padding,
  shapes,
  strokeBorder,
  type ModifierConfig,
  type Shape,
} from "@expo/ui/swift-ui/modifiers";
import { colors } from "@/shared/theme/colors";

/**
 * Liquid Glass yalnızca iOS 26+'da var. @expo/ui altındaki sürümlerde
 * buttonStyle("glass")'ı SESSİZCE .automatic'e, glassEffect()'i de no-op'a
 * düşürüyor (node_modules/@expo/ui/ios/Modifiers/ViewModifierRegistry.swift:1581
 * ve GlassEffectModifier.swift:33). Sonuç: iOS 18 ve altında butonlar zeminsiz,
 * çerçevesiz düz bir label olarak kalıyor — bu yüzden border'ı biz çiziyoruz.
 */
export const HAS_LIQUID_GLASS =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/** "#RRGGBB" | "#RGB" → "rgba(r,g,b,a)". Zaten rgb/rgba ise olduğu gibi döner. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;

  const body = hex.slice(1);
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body.slice(0, 6);
  if (full.length !== 6) return hex;

  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

type GlassFallbackShape = "capsule" | "circle" | "roundedRectangle";

type GlassFallbackOptions = {
  /** Border + zemin şekli. İkon butonu → "circle", metin butonu → "capsule". */
  shape?: GlassFallbackShape;
  /** shape === "roundedRectangle" için köşe yarıçapı. */
  cornerRadius?: number;
  /** Butonun tint'i; zemin bunun düşük alfalı tonundan türetilir. */
  color?: string;
  /** Border kalınlığı (pt). */
  borderWidth?: number;
  /** Türetilen tonları ezmek için doğrudan renk verilebilir. */
  borderColor?: string;
  /** `null` verilirse zemin çizilmez, sadece border kalır. */
  backgroundColor?: string | null;
  /**
   * .automatic buton stili kendiliğinden padding vermiyor; frame()'i olmayan
   * metin butonlarında border yazıya yapışmasın diye boşluk buradan gelir.
   */
  padding?: { horizontal?: number; vertical?: number; all?: number };
  /**
   * frame()'i olmayan ikon butonları için: border'ın tam daire olması ancak
   * kare bir kutu ile mümkün. Yalnızca fallback'te uygulanır, iOS 26'daki
   * native glass ölçüsüne dokunmaz.
   */
  frame?: { width?: number; height?: number };
};

function toShape(shape: GlassFallbackShape, cornerRadius: number): Shape {
  if (shape === "circle") return shapes.circle();
  if (shape === "roundedRectangle") {
    return shapes.roundedRectangle({
      cornerRadius,
      roundedCornerStyle: "continuous",
    });
  }
  return shapes.capsule();
}

/**
 * iOS 26 öncesindeki glass fallback'ine border (+ zemin/padding) ekler; 26 ve
 * üstünde boş dizi döner — native glass kendi kenarını zaten çiziyor.
 *
 * DİKKAT — sıra önemli: @expo/ui, modifiers dizisini SwiftUI zinciri gibi
 * baştan sona reduce ediyor (View+ModifierArray.swift). strokeBorder bir
 * .overlay olduğu için frame()/padding()'den SONRA gelmeli; aksi halde border
 * buton frame'ini değil label'ın kendi ölçüsünü takip eder.
 *
 * @example
 * modifiers={[
 *   buttonStyle("glass"),
 *   tint(colors.text),
 *   labelStyle("iconOnly"),
 *   frame({ width: 44, height: 44 }),
 *   ...glassFallback({ shape: "circle" }),
 * ]}
 */
export function glassFallback({
  shape = "capsule",
  cornerRadius = 8,
  color = colors.text,
  borderWidth = 1,
  borderColor,
  backgroundColor,
  padding: pad,
  frame: box,
}: GlassFallbackOptions = {}): ModifierConfig[] {
  if (HAS_LIQUID_GLASS) return [];

  // Border tint'ten değil nötr griden türüyor: beyaz tint'te saf beyaz çerçeve
  // fazla parlak kalıyordu. Zemin hâlâ tint'i takip ediyor.
  const stroke = borderColor ?? withAlpha(colors.textDisabled, 0.75);
  const fill =
    backgroundColor === null
      ? null
      : backgroundColor ?? withAlpha(color, 0.08);

  const modifiers: ModifierConfig[] = [];
  if (pad) modifiers.push(padding(pad));
  if (box) modifiers.push(frame(box));
  if (fill) modifiers.push(background(fill, toShape(shape, cornerRadius)));
  modifiers.push(
    strokeBorder({
      color: stroke,
      style: { lineWidth: borderWidth },
      shape,
      cornerRadius,
    }),
  );
  return modifiers;
}
