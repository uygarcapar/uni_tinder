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
import FireGlyph from "@/shared/components/FireGlyph";
import PremiumBadge from "@/shared/components/PremiumBadge";
import type { PremiumBenefitKey } from "@/features/profile/premiumBenefits";

/**
 * Premium maddesinin simgesi — açıklama sheet'inin tepesindeki büyük ikon
 * (bkz. PremiumBenefitInfoSheet).
 *
 * Maddelerin İKİSİ uygulamanın kendi işaretini kullanır, SF/lucide DEĞİL:
 *  - `fire` → Fire'ın alevi (SwipeCard butonu, kart rozeti, mağaza kartları).
 *  - `premiumBadge` → rozetin TA KENDİSİ, "plus+" wordmark'ı.
 * İkisinde de gerekçe aynı: madde ekranda göreceğin bir işareti vaat ediyor,
 * yerine jenerik bir sembol çizmek "bu, gördüğün o şey mi?" sorusunu doğurur.
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
  Exclude<PremiumBenefitKey, "fire" | "premiumBadge">,
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
  if (benefitKey === "fire") {
    return <FireGlyph size={size} color={color} />;
  }
  // "Profilinde premium rozeti" maddesinin simgesi ROZETİN KENDİSİ: satır
  // birebir o işareti vaat ediyor, o yüzden burada onun bir temsili değil
  // gerçeği duruyor (bkz. PremiumBadge — isim yanındaki wordmark).
  //
  // ⚠️ ESKİDEN `PremiumFlame`Dİ ve artık YANLIŞTI: rozet bir süredir alev
  // değil "plus+" wordmark'ı. Madde alev gösterip profilde wordmark çıkınca
  // vaat edilen şeyle görülen şey tutmuyordu.
  //
  // `fontSize` = YANINDAKİ İSMİN puntosu, çizilen punto değil: PremiumBadge
  // ölçüyü `premiumBadgeFontSize` ile (×0.75) kendi türetiyor. Buradaki slot
  // bir ikon kutusu, yani `size` doğrudan o "isim puntosu" yerine geçiyor —
  // 56'lık slotta wordmark 42 punto çiziliyor. Duckie'nin x yüksekliği düşük
  // (0.338em), yani 42 punto bir harf yığını olarak 56'lık SF glifiyle aynı
  // bantta okunuyor; hesabın tamamı PremiumBadge'de yazılı.
  //
  // Renk marka tonu (`litPlus`) DEĞİL, çağıranın verdiği renk: bu slotta
  // maddeler tek ailede duruyor — yukarıdaki "gradyan yok" kuralıyla aynı
  // gerekçe. `style` dizide sonda geldiği için rozetin kendi rengini eziyor.
  if (benefitKey === "premiumBadge") {
    return <PremiumBadge fontSize={size} style={{ color }} />;
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
