import type { StyleProp, ViewStyle } from "react-native";
import PremiumFlame from "./PremiumFlame";
import { colors } from "../theme/colors";

/**
 * İSMİN YANINDAKİ premium rozeti — yuvarlak zeminin içinde alev.
 *
 * `PremiumFlame`den farkı ne için olduğu: o çıplak bir glyph (toast ikonu, lit
 * shop kartı, fayda listesi — zemini kendinden belli yerler), bu ise bir
 * KİMLİK SATIRI rozeti. Kullanıldığı yerler kart başlıkları (keşif kartının
 * kapağı ve açılmış paneli, yukarı kaydırınca çıkan şerit, Likes kartı) ve
 * profildeki hero ismi. Yeni bir yerde ismin yanına premium işareti koyacaksan
 * `PremiumFlame`i değil BUNU çağır — aksi halde aynı rozet ekrandan ekrana
 * farklı görünür.
 *
 * Ölçü ELLE VERİLMİYOR, yanındaki ismin puntosundan çıkıyor: tek bir kural
 * bütün satırlarda aynı oranı tutuyor ve punto değişince rozet kendiliğinden
 * takip ediyor (bkz. premiumBadgeSize).
 */

/**
 * İsmin puntosundan rozetin ÇAPINI verir.
 *
 * Referans satır kutusu DEĞİL büyük harf bandı: rozet harflerin yanında
 * duruyor, satırın boşluğunda değil. Cap yüksekliği SF Pro'da ≈ 0.7em.
 *
 * 1.15 payı dolu dairenin kendi çapından büyük okunmasını karşılıyor; bandın
 * bir tık üstüne taşıyor, altta da baseline'ı hafifçe geçiyor — chip'lerin
 * normal duruşu. Bir dönem 1.3'tü, halka aleve göre fazla genişti.
 *
 * Alevin daire içindeki oranı BURADA DEĞİL, `PremiumFlame > FLAME_IN_CIRCLE`:
 * glyph kendi kutusunun yalnız 20/24'ünü dolduruyor (bkz. icons/FlameGlyph) ve
 * o pay çağıranın hesabına girmemeli. İkisi BİRLİKTE ayarlanır — payı
 * küçültürken oranı büyütmezsen alev de küçülür.
 */
export const premiumBadgeSize = (fontSize: number): number =>
  Math.round(fontSize * 0.7 * 1.15);

/**
 * Dairenin kenarı — saç telinden de ince, yalnızca zeminin bittiği yeri
 * belirtiyor.
 *
 * 0.1pt `StyleSheet.hairlineWidth` DEĞİL, bilerek: hairline cihaz ölçeğine göre
 * 0.33–0.5pt arası bir ÇİZGİ çiziyor ve bu rozet ölçüsünde (14–24pt çap) çizgi
 * halka gibi okunmaya başlıyor. 0.1'de kalan şey çizgi değil, anti-aliasing'in
 * bıraktığı ton farkı — kartın kalp glifindeki kenarla aynı kalınlık
 * (bkz. SuperLikeGlyph, strokeWidth 0.1).
 *
 * RN'de kenar kutunun İÇİNE çiziliyor: alevin yeri 0.2pt daralıyor, bu ölçüde
 * gözle görünmez.
 */
const BADGE_BORDER_WIDTH = 0.1;

export default function PremiumBadge({
  fontSize,
  size,
  background,
  borderColor,
  style,
}: {
  /** Rozetin yanındaki ismin puntosu — çap bundan türüyor. */
  fontSize: number;
  /**
   * Çapı doğrudan verir ve `fontSize`tan türetmeyi ATLAR.
   *
   * KURAL DEĞİL İSTİSNA: normalde ölçü puntodan çıkmalı, yoksa rozet ekrandan
   * ekrana ayrışır. Tek meşru kullanımı ismin küçük olduğu ama rozetin o
   * ekrandaki TEK premium işareti olduğu satırlar — profil hero'su böyle:
   * türetilen çap (18 punto → 14) orada rozeti değil bir noktayı andırıyordu.
   */
  size?: number;
  /**
   * Dairenin rengi. Varsayılan `colors.bg` ve bu FOTOĞRAF ÜSTÜ satırlar için:
   * kart başlıklarında rozet medyanın üstünde duruyor, tema zemini orada
   * kontrast veriyor.
   *
   * Rozet `bg` zeminli normal bir ekranda duruyorsa (profil hero'su) daire
   * kaybolur — orada `surface` ailesinden bir ton geçir.
   *
   * Renk render anında okunuyor: palet mutasyona uğruyor, modül seviyesinde
   * sabitleme.
   */
  background?: string;
  /**
   * Kenar rengi. Varsayılan `colors.border` — nötr gri ve MODLA DÖNÜYOR
   * (koyu #3A3A3A, açık #DCDCE0). Aynı ton cam fallback'lerinin kenarında da
   * kullanılıyor (bkz. theme/glass > glassFallback), yani rozet uygulamanın
   * geri kalanıyla aynı gri aileden.
   */
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PremiumFlame
      size={size ?? premiumBadgeSize(fontSize)}
      background={background ?? colors.bg}
      // Kenar `style` üzerinden gidiyor: PremiumFlame zaten dış stili DAİREYE
      // uyguluyor ve taban stilinden SONRA yayıyor. Çağıranın kendi `style`i en
      // sonda kalıyor, yani gerekirse kenarı o ezebilir.
      style={[
        {
          borderWidth: BADGE_BORDER_WIDTH,
          borderColor: borderColor ?? colors.border,
        },
        style,
      ]}
    />
  );
}
