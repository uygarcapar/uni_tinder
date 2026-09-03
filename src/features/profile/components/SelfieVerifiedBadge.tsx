import { View } from "react-native";
import { BadgeCheck } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import i18n from "@/shared/i18n";
import { colors } from "@/shared/theme/colors";

/**
 * "Fotoğraf doğrulandı" rozeti — ismin sağında, premium rozetinin (PremiumBadge)
 * yanında ve aynı hizada. ÖLÇÜSÜ ONDAN BAĞIMSIZ: premium yuvarlak zeminli bir
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
export default function SelfieVerifiedBadge({
  verified,
  size = 16,
}: {
  verified: boolean | null | undefined;
  size?: number;
}) {
  if (verified !== true) return null;

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={i18n.t("profile.selfie.badge.label")}
    >
      <SFIcon
        name="checkmark.seal.fill"
        fallback={BadgeCheck}
        size={size}
        color={colors.success}
        fill={colors.success}
        weight="semibold"
        strokeWidth={2}
      />
    </View>
  );
}
