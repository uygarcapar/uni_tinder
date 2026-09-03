import {
  Eye,
  Infinity as InfinityIcon,
  MapPin,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "@/shared/icons";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import PremiumFlame from "@/shared/components/PremiumFlame";
import type { PremiumBenefitKey } from "@/features/profile/premiumBenefits";

/**
 * Premium maddesinin simgesi — açıklama sheet'inin tepesindeki büyük ikon
 * (bkz. PremiumBenefitInfoSheet).
 *
 * Maddelerin İKİSİ uygulamanın kendi glif'ini kullanır, SF/lucide DEĞİL:
 * Süper Beğeni'nin kalbi ve premium alevi ürünün her yerinde o şekil
 * (SwipeCard butonu, kart rozeti, mağaza kartları) — bir açıklama ekranında
 * jenerik bir kalp/alev çizmek "bu, gördüğün o şey mi?" sorusunu doğurur.
 * Kalanı SFIcon: iOS'ta SF Symbol, Android'de lucide.
 *
 * Sembol seçimleri ürünle EŞLEŞTİRİLDİ, dekoratif değil:
 *  - `unlimitedUndo` → Discover'ın geri alma butonuyla aynı ok
 *    (`arrow.counterclockwise`, bkz. DiscoverScreen rewind).
 *  - `missedMatchRecovery` de bir "geri getirme" ama ok'u PAYLAŞMIYOR: ikisi
 *    ayrı haklar (biri geçtiğin kartı geri alır, öteki seni beğenmiş birini),
 *    aynı ikon iki satırı tek şeymiş gibi gösterirdi.
 */

type BenefitSymbol = { sf: SFSymbol; fallback: LucideIcon };

const BENEFIT_SYMBOLS: Record<
  Exclude<PremiumBenefitKey, "superLikes" | "premiumBadge">,
  BenefitSymbol
> = {
  unlimitedLikes: { sf: "infinity", fallback: InfinityIcon },
  seeLikes: { sf: "eye", fallback: Eye },
  unlimitedMessages: { sf: "message", fallback: MessageCircle },
  unlimitedUndo: { sf: "arrow.counterclockwise", fallback: RotateCcw },
  advancedFilters: { sf: "slider.horizontal.3", fallback: SlidersHorizontal },
  widerDistance: { sf: "mappin.and.ellipse", fallback: MapPin },
  missedMatchRecovery: { sf: "clock.arrow.circlepath", fallback: RefreshCw },
  discoveryPriority: { sf: "sparkles", fallback: Sparkles },
};

export default function PremiumBenefitIcon({
  benefitKey,
  size,
  color,
}: {
  benefitKey: PremiumBenefitKey;
  size: number;
  color: string;
}) {
  // Glif'ler düz dolgu (gradyan DEĞİL): alev ürününde gradyanlı çiziliyor ama
  // burada tek başına, diğer maddelerin ince çizgili sembolleriyle aynı
  // ailede durması gereken bir ikon — gradyan onu tek başına bir rozete
  // çevirirdi.
  if (benefitKey === "superLikes") {
    return <SuperLikeGlyph size={size} color={color} />;
  }
  if (benefitKey === "premiumBadge") {
    return <PremiumFlame size={size} color={color} />;
  }

  const symbol = BENEFIT_SYMBOLS[benefitKey];
  if (!symbol) return null;

  return (
    <SFIcon
      name={symbol.sf}
      fallback={symbol.fallback}
      size={size}
      color={color}
      // Büyük punto: ince çizgi (varsayılan 1.5) bu boyutta kırılgan duruyor,
      // SF tarafındaki `medium` ağırlığın karşılığı 2.
      strokeWidth={2}
      weight="medium"
    />
  );
}
