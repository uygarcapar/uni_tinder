import { Easing, withSequence, withSpring, withTiming } from "react-native-reanimated";

/**
 * Kart scroll'unun bounce + "top'a çarpma" ayarları. TEK KAYNAK:
 *   - Discover'daki kart (SwipeCard > BounceScrollView, worklet scroll handler)
 *   - Sheet içindeki kart (CardSheetScrollView, gorhom'un JS'e forward ettiği
 *     onScroll) — PreviewModal + LikerSwipeModal
 * ikisi de buradaki sabitleri ve yardımcıları kullanır, böylece "aynı ayarlar"
 * iki yerde ayrışmaz.
 *
 * Kural:
 *  1) ALT UÇ — içeriğin son BOUNCE_ZONE px'inde native bounce açık.
 *  2) TOP — bounce HİÇ açılmaz (scrollY=0'daki pull-down başka bir jest:
 *     Discover'da collapse, sheet'te pan-down-to-close). Yerine momentum top'a
 *     çarptığında çarpma şiddetiyle orantılı foto zoom'u veriyoruz.
 *  TOP_SAFE_GAP: içerik kısa olup alt-uç zone'u top'a taşarsa bile kural (1)
 *  top'un bu kadar yakınında bounce açmaz.
 */
export const BOUNCE_ZONE = 800;
export const TOP_SAFE_GAP = 160;
// Top'a varış sayılan eşik (px).
export const TOP_HIT_EPS = 0.5;
// Çarpma şiddeti: event başına (≈1 frame) kat edilen px. Bu değerin altı
// zoom tetiklemez, IMPACT_MAX'te zoom tam güçtedir.
export const IMPACT_MIN = 8;
export const IMPACT_MAX = 55;
// Tam güçte zoom oranı (foto %12 yakınlaşır). Foto katmanının parent'ı
// overflow:"hidden" + sabit borderRadius olduğu için büyüme kartın içinde
// kırpılır; bu oranı yükseltmek kartın kendi kutusunu taşırmaz.
export const PHOTO_ZOOM_MAX = 0.12;

/**
 * Alt uçta mıyız? maxY: içeriğin gerçek scroll menzili. y > maxY = alt uçta
 * bounce halindeyiz → doğal olarak true kalır, animasyon ortasında bounces
 * kapanıp snap etmez.
 */
export function isNearBottom(
  y: number,
  contentHeight: number,
  layoutHeight: number,
) {
  "worklet";
  const maxY = contentHeight - layoutHeight;
  const threshold = Math.max(TOP_SAFE_GAP, maxY - BOUNCE_ZONE);
  return maxY > TOP_SAFE_GAP && y > threshold;
}

/**
 * Çarpma hızını (px/event) 0-1 aralığına clamp'ler ve ease-out eğrisinden
 * geçirir. Doğrusal eşlemede orta hızlı çarpmalar (çoğu gerçek fling burada)
 * menzilin ancak yarısını alıyordu ve zoom fark edilmiyordu; quad-out ile
 * momentumun alt-orta bandı daha cömert karşılık verir, tepe yine yalnız
 * IMPACT_MAX'te. Örn. yarı hız: 0.50 → 0.75.
 */
export function impactIntensity(impact: number) {
  "worklet";
  const p = (impact - IMPACT_MIN) / (IMPACT_MAX - IMPACT_MIN);
  const c = p < 0 ? 0 : p > 1 ? 1 : p;
  return 1 - (1 - c) * (1 - c);
}

/**
 * Yumuşak büyü, yaylanarak geri dön — bounce'un yerini alan geri bildirim.
 *
 * Büyüme süresi şiddete göre uzuyor (140→215ms): sert çarpmada daha uzun yol
 * kat edildiği için sabit sürede hız artıyor ve hareket "sıçrama" gibi
 * okunuyordu; süreyi menzille birlikte büyütmek algılanan hızı sabit tutuyor.
 * Easing quad yerine cubic-out — girişteki ivme daha az sert.
 *
 * Dönüş yayı neredeyse kritik sönümlü (ζ = 17 / (2·√(90·0.9)) ≈ 0.94): eski
 * 15/130/0.7 (ζ ≈ 0.79) gözle görülür şekilde salınıp duruyordu. Şimdi tek,
 * çok hafif bir taşma yapıp süzülerek yerine oturuyor.
 */
export function zoomImpactAnimation(intensity: number) {
  "worklet";
  return withSequence(
    withTiming(intensity, {
      duration: 140 + 75 * intensity,
      easing: Easing.out(Easing.cubic),
    }),
    withSpring(0, { damping: 17, stiffness: 90, mass: 0.9 }),
  );
}
