import { View, Text } from "react-native";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import {
  getModerationTone,
  moderationStatusLabel,
  type PhotoModerationStatus,
} from "../photoModeration";

// Foto üstünde çizildiği için renkler MEDYA katmanından: mediaChipBg /
// onMedia tema ile dönmez (bkz. colors.ts "MEDYA ÜSTÜ" bloğu).
const TONE_STYLE: Record<
  ReturnType<typeof getModerationTone>,
  { fg: string; sf: SFSymbol; fallback: any }
> = {
  // Approved rozeti hiç çizilmiyor (aşağıda erken dönüş) — bu satır yalnızca
  // tip bütünlüğü için.
  ok: { fg: colors.success, sf: "checkmark.circle.fill", fallback: CheckCircle2 },
  // Review/Pending HATA DEĞİL: nötr ton, kullanıcının yapması gereken bir şey yok.
  info: { fg: colors.onMedia, sf: "clock.fill", fallback: Clock },
  error: { fg: colors.errorLight, sf: "exclamationmark.triangle.fill", fallback: AlertTriangle },
};

/**
 * Fotoğrafın moderasyon rozeti. `Approved`'ta hiçbir şey çizmez — yayında olan
 * fotoğraf normal görünmeli.
 */
export default function PhotoModerationBadge({
  status,
}: {
  status: PhotoModerationStatus;
}) {
  if (status === "Approved") return null;

  const tone = getModerationTone(status);
  const style = TONE_STYLE[tone];

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingVertical: 5,
        paddingHorizontal: 9,
        borderRadius: 999,
        borderCurve: "continuous",
        backgroundColor: colors.mediaChipBg,
        borderWidth: 0.5,
        borderColor: colors.mediaHairline,
      }}
    >
      <SFIcon
        name={style.sf}
        fallback={style.fallback}
        size={11}
        strokeWidth={2.5}
        color={style.fg}
        weight="semibold"
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 11,
          fontWeight: "600",
          color: style.fg,
        }}
      >
        {moderationStatusLabel(status)}
      </Text>
    </View>
  );
}

/**
 * Yayında olmayan fotoğrafın üstündeki karartma. Kullanıcı KENDİ fotoğrafını
 * her durumda görür — bu yüzden gizlemek yerine soluklaştırıyoruz.
 */
export function PhotoModerationScrim({
  status,
  borderRadius = 20,
}: {
  status: PhotoModerationStatus;
  borderRadius?: number;
}) {
  if (status === "Approved") return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius,
        // mediaScrim DEĞİL — o neredeyse opak siyah (foto altı gradyanı için).
        backgroundColor: colors.mediaScrimSoft,
      }}
    />
  );
}
