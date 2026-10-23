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
        // BASIŞ SÖNMESİ YOK (istek). Varsayılan opaklık düşüşü burada iki
        // sorun doğuruyordu: başlık kapak fotoğrafının üstünde duruyor ve
        // sönerken bir an okunmaz hâle geliyor, üstelik dokunuşun açtığı şey
        // tam ekran bir sheet — geri bildirimi zaten sheet'in kendisi
        // veriyor, araya giren sönme iki hareketi üst üste bindiriyor.
        activeOpacity={1}
        onPress={onPress}
        // Dokunma hedefi metinden bir tık geniş (parmak için), ama satırın
        // tamamı kadar değil.
        hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Text
          style={{
            // SABİT BEYAZ (`onMedia`), moda dönen `text` DEĞİL (istek: "light
            // mode'da en üstteki title'ı beyazla yaz"). Başlık her zaman tam
            // ekran kapak fotoğrafının üstünde duruyor — kartın "kapalı" hâli
            // (zemini chrome olan, koyu mürekkebin doğru olduğu düzen) 2026-10
            // temizliğinde kalktı, yani tema mürekkebinin gerekçesi de kalmadı.
            // Açık temada koyu yazı açık fotoğrafta da koyu fotoğrafta da
            // gölgeye bel bağlıyordu; beyaz + aşağıdaki gölge iki temada aynı
            // okunurluğu veriyor (kartın diğer kapak glifleriyle de aynı aile).
            color: colors.onMedia,
            // 17 → 21. Başlık tam ekran bir kartın üstünde, iki yanındaki
            // 48pt'lik cam butonların arasında duruyor; 17 o ölçekte navigasyon
            // başlığından çok bir alt etiket gibi okunuyordu. 21 iki butonla
            // optik olarak aynı ağırlıkta — daha büyüğü (24+) satırı cam
            // butonların yüksekliğinden taşırıyor.
            fontSize: 21,
            fontWeight: "700",
            // Fotoğrafın ÜSTÜNDE duruyor (kart tam ekran): beyaz yazı da gölge
            // olmadan açık fotoğrafta kayboluyor.
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
          // Punto 17→21'e çıkınca 13 küçük kaldı: chevron başlığın parçası,
          // ondan bağımsız bir glif değil — oran korunuyor.
          size={15}
          // Başlığın mürekkebiyle AYNI aile: chevron yazının parçası.
          color={colors.onMedia}
          strokeWidth={3}
          weight="bold"
        />
      </TouchableOpacity>
    </View>
  );
});

export default ModeTitle;
