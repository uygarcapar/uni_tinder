import { useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";
import { colors, veil, withAlpha } from "@/shared/theme/colors";
import { chromeBlurTint } from "@/shared/theme/blur";

/**
 * Kayıt adımlarının üstte sabit duran başlık kabı — AppModal'ın (dolayısıyla
 * FilterModal'ın) progressive blur header'ının aynısı, sadece sheet yerine tam
 * ekranda. Zemin rengi YOK: içerik başlığın ALTINDAN geçiyor ve blur + `veil`
 * gradyanı okunabilirliği taşıyor (koyuda karartır, açıkta aynı oranlarla
 * beyazlatır).
 *
 * `scrollY` verilirse zemin AppModal'daki gibi scroll'a bağlı belirir (0→60).
 * Bu bilinçli: sayfa tepedeyken başlığın altında içerik olmadığı için perde de
 * olmamalı, yoksa düz zeminin üstünde sebepsiz bir bant duruyor.
 *
 * Android'de expo-blur'un blurMethod varsayılanı 'none' — orada maskeli blur
 * yerine düz yarı saydam tema zemini kullanılıyor (AppModal ile aynı fallback).
 *
 * Yükseklik SABİT (`REGISTER_HEADER_HEIGHT`) ve içerik kabı o yüksekliğe
 * kilitleniyor — ekranlar da aynı sabiti ScrollView'ın paddingTop'una veriyor.
 * Eskiden yükseklik `onLayout` ile ölçülüp ekrana bildiriliyordu; ölçüm ilk
 * boyanan kareden SONRA geldiği için içerik açılışta bir kez yerinden zıplıyordu
 * (başlığın altında belirip kaybolan boşluk). Ölçüm turu yok, zıplama da yok.
 */
// pt-16 (64) + 44'lük buton satırı + pb-6 (24) + progress bar (4 + mb-4 = 20).
export const REGISTER_HEADER_HEIGHT = 152;

interface RegisterStickyHeaderProps {
  children: React.ReactNode;
  /** Verilirse zemin scroll ile belirir; yoksa hep açık. */
  scrollY?: SharedValue<number>;
  /**
   * Zemin katmanının içerik kutusunun ALTINA taşma payı. Maske yüzde tabanlı
   * olduğu için bu payı büyütmek hem kapalı bölgeyi hem erime kuyruğunu aşağı
   * çekiyor — başlık şeridi ekranda daha uzun bir alana yayılıyor. İçeriğin
   * paddingTop'unu ETKİLEMEZ: ölçülen yükseklik kutunun kendisi.
   */
  overhang?: number;
}

export default function RegisterStickyHeader({
  children,
  scrollY,
  overhang = 56,
}: RegisterStickyHeaderProps) {
  // AppModal/ScreenHeader ile birebir aynı durak seti: üstte tam kapalı, alt
  // kenara doğru eriyor. rgba(0,0,0,a) burada RENK DEĞİL alfa maskesi.
  const { colors: maskColors, locations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  const bgStyle = useAnimatedStyle(() => ({
    opacity: scrollY
      ? interpolate(scrollY.value, [0, 60], [0, 1], Extrapolation.CLAMP)
      : 1,
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: REGISTER_HEADER_HEIGHT,
        zIndex: 10,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: -overhang },
          bgStyle,
        ]}
      >
        {Platform.OS === "ios" ? (
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                locations={locations as any}
                colors={maskColors as any}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <LinearGradient
              colors={[veil(1), veil(0.2)]}
              style={StyleSheet.absoluteFill}
            />
            <BlurView
              intensity={15}
              tint={chromeBlurTint()}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: withAlpha(colors.bg, 0.95) },
            ]}
          />
        )}
      </Animated.View>

      {children}
    </View>
  );
}
