import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ChevronRight, ShieldAlert, ShieldCheck } from "@/shared/icons";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import uiBus from "@/shared/services/uiBus";
import { colors } from "@/shared/theme/colors";
import {
  isSelfieFeatureAvailable,
  wasSelfieVerifiedBefore,
} from "../selfie/selfieAvailability";
// Olay adları AYRI modülden: overlay'den import etmek bu satıra expo-camera
// zincirinin tamamını bağlardı (bkz. selfieEvents.ts).
import {
  SELFIE_AVAILABILITY_EVENT,
  SELFIE_OPEN_EVENT,
} from "../selfie/selfieEvents";
import { resolveSelfieVerified } from "../selfie/selfieVerification";

/**
 * Profil ekranındaki doğrulama satırı — akışın TEK giriş noktası.
 *
 * GÖRÜNÜRLÜK İKİ KAPILI, ikisi de geçilmeden hiçbir şey çizilmez:
 *
 *   1. `isSelfieVerified` alanı yanıtta VAR mı (`resolveSelfieVerified !== null`).
 *      Alan yoksa backend'in bu sürümü yok; çalışmayan bir giriş göstermek
 *      kullanıcıyı `UT-6505`'e sürer.
 *   2. Yakın zamanda `UT-6505` alınmadı mı (selfieAvailability penceresi).
 *
 * ÜÇ DURUM:
 *   doğrulanmamış      → "Fotoğrafını Doğrula"
 *   doğrulanmış        → durum satırı, tıklanamaz
 *   sıfırlanmış        → "ana fotoğraf değişikliği nedeniyle sıfırlandı" +
 *                        "Yeniden Doğrula"
 *
 * Üçüncü durumun ayrımı `wasSelfieVerifiedBefore`'dan geliyor: sunucu ikisine de
 * `false` diyor, "hiç doğrulanmadı" ile "doğrulaman düştü" farkını yalnız
 * istemci biliyor. Rehber §5 sessiz düşürmeyi açıkça yasaklıyor — kullanıcı
 * sebebiyle birlikte öğrenmeli.
 */

const TONE: Record<
  "idle" | "verified" | "reset",
  { sf: SFSymbol; fallback: any; color: () => string }
> = {
  idle: { sf: "checkmark.seal", fallback: ShieldCheck, color: () => colors.text },
  verified: { sf: "checkmark.seal.fill", fallback: BadgeCheck, color: () => colors.success },
  // Uyarı tonu ama YIKICI DEĞİL: kullanıcı bir şey kaybetmedi, yeniden
  // doğrulaması gerekiyor.
  reset: { sf: "exclamationmark.shield.fill", fallback: ShieldAlert, color: () => colors.warning },
};

export default function SelfieVerificationRow({
  profile,
  userId,
}: {
  profile: any;
  userId: string | number | null | undefined;
}) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(() => isSelfieFeatureAvailable());

  // `UT-6505` akış ortasında gelirse satır yeniden başlatma beklemeden kaybolur.
  useEffect(
    () => uiBus.on(SELFIE_AVAILABILITY_EVENT, () => setAvailable(isSelfieFeatureAvailable())),
    [],
  );

  const verified = resolveSelfieVerified(profile);
  if (verified === null || !available) return null;

  const wasVerified = wasSelfieVerifiedBefore(userId);
  const state = verified ? "verified" : wasVerified ? "reset" : "idle";
  const tone = TONE[state];

  const title = t(`profile.selfie.row.${state}.title`);
  const subtitle = t(`profile.selfie.row.${state}.subtitle`);

  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        borderRadius: 36,
        borderCurve: "continuous",
        borderWidth: 0.5,
        borderColor: colors.hairline,
        padding: 20,
      }}
    >
      <SFIcon
        name={tone.sf}
        fallback={tone.fallback}
        size={24}
        color={tone.color()}
        style={{ pointerEvents: "none" }}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
          {title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
          {subtitle}
        </Text>
      </View>
      {!verified && (
        <SFIcon
          name="chevron.right"
          fallback={ChevronRight}
          size={16}
          color={colors.textMuted}
          style={{ pointerEvents: "none" }}
        />
      )}
    </View>
  );

  if (verified) {
    return <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{body}</View>;
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <AnimatedPressable
        onPress={() => uiBus.emit(SELFIE_OPEN_EVENT)}
        pressBounciness={0}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {body}
      </AnimatedPressable>
    </View>
  );
}
