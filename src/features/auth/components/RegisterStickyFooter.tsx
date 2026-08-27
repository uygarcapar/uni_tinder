import { View, StyleSheet, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import { veil } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

/**
 * Kayıt adımlarının en altta sabit duran CTA kabı. Bu footer ScrollView'ın
 * ÜSTÜNDE (absolute) duruyor — altından içerik geçiyor ve şeffaf kaldığı sürece
 * yazılar butonun yanından/altından net görünüyordu. Buraya ScreenHeader'daki
 * progressive blur'un AYNA'sını koyuyoruz: üstte tamamen şeffaf, alta doğru
 * eriyerek kapanan bir maske.
 *
 * Maske şart — düz kenarlı bir blur şeridi ekranı ortadan yatay bir çizgiyle
 * ikiye bölüyor. Maskedeki rgba(0,0,0,a) değerleri RENK DEĞİL alfa matematiği
 * (bkz. colors.ts scrimAt notu), tema ile dönmezler. Renk taşıyan katman
 * `veil()` gradyanı: koyuda karartır, açıkta aynı oranlarla beyazlatır.
 *
 * SADECE absolute footer'lı adımlarda kullan (Step13/14/15/16/17). Butonu
 * normal akışta taşıyan adımlarda (Step9 ve KeyboardStickyView'lı olanlar)
 * altta içerik yok — orada blur hiçbir şey yapmaz, veil ise düz zemini
 * sebepsiz tonlayıp diğer adımlardan farklı gösterir.
 */
const { colors: maskColors, locations } = easeGradient({
  colorStops: {
    0: { color: "transparent" },
    0.5: { color: "black" },
    1: { color: "rgba(0,0,0,0.99)" },
  },
});

interface RegisterStickyFooterProps {
  children: React.ReactNode;
  /** Kaba ek stil (ör. farklı padding). Konum/absolute alanlarını ezme. */
  style?: ViewStyle;
}

export default function RegisterStickyFooter({
  children,
  style,
}: RegisterStickyFooterProps) {
  return (
    <View
      style={[
        {
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 32,
          paddingBottom: 32,
          paddingTop: 16,
        },
        style,
      ]}
    >
      {/* pointerEvents="none": kap absolute olduğu için maskenin şeffaf üst
          ucu da dokunmaları yutuyordu — altındaki listeye scroll geçsin. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <MaskedView
          maskElement={
            <LinearGradient
              locations={locations as any}
              colors={maskColors as any}
              style={StyleSheet.absoluteFill}
            />
          }
          style={StyleSheet.absoluteFill}
        >
          <LinearGradient
            colors={[veil(0.2), veil(1)]}
            style={StyleSheet.absoluteFill}
          />
          <BlurView
            intensity={15}
            tint={chromeBlurTint()}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </View>

      {children}
    </View>
  );
}
