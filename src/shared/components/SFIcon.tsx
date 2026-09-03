import { Platform, type StyleProp, type ViewStyle } from "react-native";
import type { SFSymbol } from "expo-symbols";
import type { LucideIcon } from "@/shared/icons";

export type { SFSymbol };

// expo-symbols native modül gerektirir. Dev client henüz rebuild edilmediyse
// native taraf yoktur; o durumda import bile patlayabildiği için modül
// varlığını kontrol edip lazy require ediyoruz. Native yoksa (veya jest'te)
// iOS'ta da lucide fallback render edilir — rebuild sonrası SF Symbols
// otomatik açılır.
type SymbolViewType = typeof import("expo-symbols").SymbolView;
let SymbolView: SymbolViewType | null = null;
if (Platform.OS === "ios") {
  try {
    const { requireOptionalNativeModule } = require("expo-modules-core");
    if (requireOptionalNativeModule?.("SymbolModule") != null) {
      SymbolView = require("expo-symbols").SymbolView as SymbolViewType;
    }
  } catch {
    // expo-modules-core yüklenemedi (test ortamı vb.) → lucide fallback
  }
}

// iOS'ta SF Symbol, Android'de lucide fallback. Uygulama genelindeki tüm
// ikonlar (hobiler hariç — onlar emoji, bkz. HobbyIcon) bunun üzerinden
// render edilir. strokeWidth sadece Android/lucide'a, weight sadece iOS'a
// uygulanır.
export default function SFIcon({
  name,
  fallback: Lucide,
  size,
  color,
  strokeWidth = 1.5,
  weight = "regular",
  fill,
  forceFallback = false,
  style,
}: {
  name: SFSymbol;
  fallback: LucideIcon;
  size: number;
  color: string;
  strokeWidth?: number;
  weight?:
    | "ultraLight"
    | "thin"
    | "light"
    | "regular"
    | "medium"
    | "semibold"
    | "bold"
    | "heavy"
    | "black";
  // Android/lucide fallback'in dolgusu — .fill SF varyantı kullanan call-site'lar
  // Android'de de dolgulu görünsün diye geçirilir (örn. fill={color}).
  fill?: string;
  /**
   * iOS'ta da lucide'ı kullan. SF Symbols'ta karşılığı OLMAYAN kavramlar için:
   * en yakın sembol anlamı taşımıyorsa iki platformda aynı lucide glifini
   * göstermek, iOS'ta yanlış bir sembol çizmekten iyi. Örnek: sigara — SF'te
   * cigarette YOK, en yakını `smoke.fill` ve o bir duman bulutu.
   * `name` yine zorunlu: SF ileride sembolü eklerse bayrağı kaldırmak yetsin.
   */
  forceFallback?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (SymbolView && !forceFallback) {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={weight}
        resizeMode="scaleAspectFit"
        style={style}
      />
    );
  }
  return (
    <Lucide
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      fill={fill}
      style={style}
    />
  );
}
