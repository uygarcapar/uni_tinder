import { View, type StyleProp, type ViewStyle } from "react-native";
import { BadgeCheck } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import i18n from "@/shared/i18n";
import { colors } from "@/shared/theme/colors";

/**
 * "Fotoğraf doğrulandı" rozeti — ismin HEMEN sağında (premium işaretinden ÖNCE:
 * doğrulama ismin bir parçası gibi okunmalı, araya ürün işareti girmemeli) ve
 * aynı hizada. ÖLÇÜSÜ PREMIUM'DAN BAĞIMSIZ: premium yuvarlak zeminli bir
 * chip, bu çıplak bir sembol — aynı sayıya bağlanırlarsa biri diğerini bozuyor.
 *
 * 🔴 METİN: "Fotoğraf Doğrulandı", "Kimlik Doğrulandı" DEĞİL. Bu akış kimliği
 * doğrulamıyor; profildeki fotoğrafların o kişiye ait olduğunu gösteriyor.
 * Ekran okuyucu etiketi de bu yüzden `profile.selfie.badge.label`.
 *
 * `verified` üç durumlu geliyor: `null` = alan sunucudan HİÇ gelmedi (backend'in
 * bu sürümü yok) → `false` ile aynı şeyi yapıyoruz, hiçbir şey çizmiyoruz.
 * Ayrım satırda önemli (bkz. SelfieVerificationRow), rozette değil.
 */
/**
 * İsmin puntosundan rozetin ÖLÇÜSÜNÜ verir — `premiumBadgeSize` ile aynı desen:
 * ölçü JSX'te elle verilmesin, punto değişince rozet kendiliğinden takip etsin.
 *
 * Pay premium'unkinden (0.7 × 1.15) bir tık KÜÇÜK. Sebep dosya başındaki not:
 * premium yuvarlak ZEMİNLİ bir chip, bu ise çıplak bir sembol. Aynı çapta
 * yan yana durduklarında çıplak sembol daha iri okunuyor; hero satırında da
 * bilerek 16 / 18 oranındalar (bkz. ProfileScreen > HERO_VERIFIED_SIZE).
 *
 * Hero'daki iki sabit bu kuraldan TÜREMİYOR ve türemeyecek — orası okunurluk
 * gerekçesiyle açıkça istisna, kendi yorumunda anlatılıyor.
 */
export const selfieBadgeSize = (fontSize: number): number =>
  Math.round(fontSize * 0.7 * 1.02);

export default function SelfieVerifiedBadge({
  verified,
  size = 16,
  color = colors.onMedia,
  style,
}: {
  verified: boolean | null | undefined;
  size?: number;
  /**
   * Varsayılan BEYAZ (`onMedia`): rozetin durduğu yerlerin neredeyse tamamı
   * foto/perde üstü (kart kapağı, sticky başlık, Likes kartı) — orada beyaz
   * ismin kendisiyle aynı mürekkep ve her iki modda sabit.
   *
   * Medya DIŞINDA (profil hero'su gibi uygulama zemini üstünde) beyaz açık
   * modda kaybolur: oralar bu prop'la `text` geçmek ZORUNDA.
   */
  color?: string;
  /**
   * `PremiumBadge` ile aynı kaçış: baseline hizalı satırlarda çağıran
   * `alignSelf: "center"` vermek zorunda — bir View'ın baseline'ı ALT kenarıdır,
   * onsuz sembol yazının altına sarkar (bkz. LikesScreen isim satırı).
   */
  style?: StyleProp<ViewStyle>;
}) {
  if (verified !== true) return null;

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={i18n.t("profile.selfie.badge.label")}
      style={style}
    >
      <SFIcon
        name="checkmark.seal.fill"
        fallback={BadgeCheck}
        size={size}
        // Ne yeşil ne marka rengi: BEYAZ (istek). Yeşil sistem "başarı" tonuydu,
        // marka rengi ise satırdaki `plus` işaretiyle aynı mürekkebe düşüyordu —
        // iki ayrı sinyal tek renk olunca okunmuyordu. Beyaz rozeti ismin
        // mürekkebine bağlar, renk yalnız premium'da kalır.
        color={color}
        fill={color}
        weight="semibold"
        strokeWidth={2}
      />
    </View>
  );
}
