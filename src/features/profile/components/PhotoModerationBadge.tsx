import { View } from "react-native";
import { Check, Clock, AlertTriangle } from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import {
  getModerationTone,
  moderationStatusLabel,
  type PhotoModerationStatus,
} from "../photoModeration";

// Foto üstünde çizildiği için renkler MEDYA katmanından / sabit tokenlardan:
// onMedia tema ile dönmez (bkz. colors.ts "MEDYA ÜSTÜ" bloğu).
const TONE_STYLE: Record<
  ReturnType<typeof getModerationTone>,
  { fg: string; sf: SFSymbol; fallback: any }
> = {
  // Yayında olan fotoğrafta da yeşil onay ikonu var — kullanıcı "bu foto
  // görünüyor mu" sorusunu her kart için aynı yerden okuyabilsin.
  // Approved rozeti hiç çizilmiyor (aşağıda erken dönüş) — yayında olan
  // fotoğrafta hiçbir işaret olmamalı. Bu satır yalnızca tip bütünlüğü için.
  ok: { fg: colors.success, sf: "checkmark", fallback: Check },
  // Review/Pending HATA DEĞİL: nötr ton, kullanıcının yapması gereken bir şey yok.
  info: { fg: colors.onMedia, sf: "clock.fill", fallback: Clock },
  // errorStrong: SettingsModal'daki "Hesabı Sil" dolgusuyla aynı kırmızı —
  // yıkıcı/engelleyici durumların tek tonu. (Sabit token, tema ile dönmez.)
  error: { fg: colors.errorStrong, sf: "exclamationmark.triangle.fill", fallback: AlertTriangle },
};

const BADGE_ICON_SIZE = 18;

/**
 * Fotoğrafın moderasyon rozeti — fotoğrafın SOL ALT köşesinde yalnızca ikon.
 * Metin ve çip zemini bilerek yok: ikon çıplak duruyor, açık fotoğraflarda
 * kaybolmasın diye altına küçük bir gölge atılıyor. Gölge SFIcon'un KENDİ
 * style'ında — böylece iOS'ta gölge dikdörtgen kutunun değil glifin şeklini
 * izliyor. Sebebi moderasyon özeti/alert'i anlatıyor; ekran okuyucuya durum
 * etiketi veriliyor.
 *
 * Yayındaki fotoğrafta hiçbir şey çizmez — rozet yalnızca dikkat isteyen
 * durumların işareti.
 *
 * Kapı `status === 'Approved'` DEĞİL, sunucunun `isVisibleToOthers`'ı:
 * görünürlük kuralı statustan bağımsız değişebiliyor (ör. profil askıya
 * alınınca Approved foto da görünmüyor) — türetseydik o gün sessizce yanlışa
 * düşerdik (sözleşme §2.3).
 */
export default function PhotoModerationBadge({
  status,
  isVisibleToOthers,
}: {
  status: PhotoModerationStatus;
  isVisibleToOthers: boolean;
}) {
  if (isVisibleToOthers) return null;

  // Gizli AMA Approved (ör. profil askıya alınmış / inceleme altında): sorun bu
  // fotoğrafta değil. Yeşil onay ikonu yanıltıcı olurdu — nötr "bekliyor"
  // tonuna düşüyoruz.
  const tone = status === "Approved" ? "info" : getModerationTone(status);
  const style = TONE_STYLE[tone];

  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={moderationStatusLabel(status)}
      style={{
        position: "absolute",
        left: 10,
        bottom: 10,
      }}
    >
      <SFIcon
        name={style.sf}
        fallback={style.fallback}
        size={BADGE_ICON_SIZE}
        strokeWidth={2.5}
        color={style.fg}
        weight="semibold"
        style={{
          shadowColor: colors.shadow,
          shadowOpacity: 0.3,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
        }}
      />
    </View>
  );
}

/**
 * Yayında olmayan fotoğrafın üstündeki karartma. Kullanıcı KENDİ fotoğrafını
 * her durumda görür — bu yüzden gizlemek yerine soluklaştırıyoruz.
 */
export function PhotoModerationScrim({
  isVisibleToOthers,
  borderRadius = 20,
}: {
  isVisibleToOthers: boolean;
  borderRadius?: number;
}) {
  if (isVisibleToOthers) return null;
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
