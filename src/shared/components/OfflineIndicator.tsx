import { View } from "react-native";
import { WifiOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import {
  LOGO_INK_CENTER_Y,
  LOGO_INK_RIGHT,
} from "@/shared/components/logoMetrics";
import { colors } from "@/shared/theme/colors";
import { useIsOffline } from "@/shared/services/networkStatus";

const SIZE = 15;
/** Logonun görünür sağ kenarı ile ikon arasındaki boşluk. */
const GAP = 6;

/**
 * Header'daki Lit logosunun sağında beliren kırmızı "bağlantı yok" ikonu.
 *
 * Banner DEĞİL: yer kaplamıyor, hiçbir şeyi aşağı itmiyor, logonun sağındaki
 * hâlihazırda boş olan alana absolute oturuyor — bkz. logoMetrics.
 *
 * Bilinçli olarak ANİMASYONSUZ. Logo zaten scroll'a bağlı bir Animated.View
 * (opacity + translateY + scale) içinde ve üstünde bir MaskedView blur katmanı
 * var; bu ağacın içine entering/exiting layout animasyonu sokmak bu kod
 * tabanında geçmişi olan commit-storm sınıfına giren bir risk. Gösterge
 * nadiren değişiyor, mount/unmount yeterli.
 */
export default function OfflineIndicator() {
  const offline = useIsOffline();
  const { t } = useTranslation();

  if (!offline) return null;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={t("common.offline")}
      style={{
        position: "absolute",
        left: LOGO_INK_RIGHT + GAP,
        top: LOGO_INK_CENTER_Y - SIZE / 2,
      }}
    >
      <SFIcon
        name="wifi.slash"
        fallback={WifiOff}
        size={SIZE}
        color={colors.errorStrong}
        weight="semibold"
        strokeWidth={2.5}
      />
    </View>
  );
}
