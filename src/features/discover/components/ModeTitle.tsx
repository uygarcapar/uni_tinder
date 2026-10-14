import { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { ChevronDown } from "@/shared/icons";
import { colors } from "@/shared/theme/colors";
import type { AppMode } from "../modeTheme";

/**
 * Keşif başlığının ORTASINDAKİ mod adı + chevron. Dokunulunca mod seçici
 * sheet'i açılıyor.
 *
 * ── Neden tam burası ────────────────────────────────────────────────────────
 * Keşif'in yüzen header'ı `space-between` ve iki ucunda 48pt'lik cam buton var
 * (sol: geri al, sağ: filtre); ORTASI BOŞ. O boşluk eskiden WaveFillLogo'nun
 * yeriydi, logo kaldırılınca açıkta kaldı — mod adı doğal olarak oraya oturuyor.
 *
 * ⚠️ ABSOLUTE ORTALANIYOR, üçüncü bir flex çocuk DEĞİL. Flex çocuk olsaydı
 * başlığın genişliği iki cam butonu kendi 16pt insets'lerinden kaydırırdı ve
 * kartın sticky şeridi (CardStickyHeader) onlara hizalı olduğu için kart
 * içeriğiyle header arasındaki hiza bozulurdu.
 *
 * ⚠️ `pointerEvents` dengesi: dış kap `box-none` (kartın jestleri ortadan
 * geçebilsin — header `box-none`), DOKUNULABİLİR ALAN yalnız yazının kendisi
 * kadar. Tam genişlik bir dokunma hedefi kartın dikey Fire çekişini yutardı.
 */
const ModeTitle = memo(function ModeTitle({
  mode,
  onPress,
}: {
  mode: AppMode;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={onPress}
        // Dokunma hedefi metinden bir tık geniş (parmak için), ama satırın
        // tamamı kadar değil.
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            // Fotoğrafın ÜSTÜNDE duruyor olabilir (kart tam ekran): gölge
            // olmadan açık fotoğrafta kayboluyordu. `onMedia` kullanılmadı —
            // kart kapalıyken zemin chrome, orada beyaz yazı ters düşerdi.
            textShadowColor: "rgba(0,0,0,0.35)",
            textShadowRadius: 6,
            textShadowOffset: { width: 0, height: 1 },
          }}
        >
          {t(`discover.mode.title.${mode}`)}
        </Text>
        <SFIcon
          name="chevron.down"
          fallback={ChevronDown}
          size={13}
          color={colors.text}
          strokeWidth={3}
          weight="bold"
        />
      </TouchableOpacity>
    </View>
  );
});

export default ModeTitle;
