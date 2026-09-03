import React from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { Check, X } from "@/shared/icons";
import { useRenderCount } from "@/shared/debug/useRenderCount";
import { colors } from "@/shared/theme/colors";

const SWIPE_THRESHOLD = 120;

export default function SwipeOverlay({ dragX, opacity }: any) {
  useRenderCount("SwipeOverlay");
  // ✅ TİK (LIKE) ANIMASYONU: Sağa kaydırdıkça merkeze daha fazla girer
  const likeOpacityStyle = useAnimatedStyle(() => {
    const baseOpacity = interpolate(
      dragX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolate.CLAMP,
    );

    // Final değeri -120'ye çekerek merkeze daha çok yaklaştırdık
    const translateX = interpolate(
      dragX.value,
      [0, 60, 120, 250, 450],
      [100, 30, -20, -80, -120], // -120 ile ikon kartın ortasına iyice sokulur
      Extrapolate.CLAMP,
    );

    const scale = interpolate(
      dragX.value,
      [0, 150],
      [0.5, 1.3],
      Extrapolate.CLAMP,
    );

    return {
      opacity: baseOpacity * opacity.value,
      transform: [{ translateX }, { scale }] as any,
    };
  });

  // ✅ X (NOPE) ANIMASYONU: Sola kaydırdıkça merkeze daha fazla girer
  const nopeOpacityStyle = useAnimatedStyle(() => {
    const baseOpacity = interpolate(
      dragX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolate.CLAMP,
    );

    // Final değeri 120'ye çekerek simetriyi sağladık
    const translateX = interpolate(
      dragX.value,
      [-450, -250, -120, -60, 0],
      [120, 80, 20, -30, -100],
      Extrapolate.CLAMP,
    );

    const scale = interpolate(
      dragX.value,
      [-150, 0],
      [1.3, 0.5],
      Extrapolate.CLAMP,
    );

    return {
      opacity: baseOpacity * opacity.value,
      transform: [{ translateX }, { scale }] as any,
    };
  });

  return (
    <View
      style={{ position: "absolute", inset: 0, zIndex: 100 }}
      pointerEvents="none"
    >
      {/* MÜREKKEP MODLA DÖNMEZ ve dönmemeli: perde kartın KAPAK FOTOĞRAFININ
          üstünde duruyor, yani foto üstü. Fotoğraf açık modda da fotoğraftır —
          buradaki soru "hangi tema" değil, "hangi zemin" (bkz. colors.ts,
          `onMedia*` ailesinin notu: foto/gradyan üstü açık modda DA beyaz).

          BEYAZ (`onMedia`), koyu değil. Gerekçe okunurluk değil — glif kartın
          ~%30'unda, üstteki blur perdesinin (SwipeCard > top blur gradient,
          230px) güçlü bandının ALTINDA duruyor, yani çıplak fotoğrafın
          üstünde: beyazın açık fotoğrafta yaşadığı sorunu koyu da koyu
          fotoğrafta yaşıyor, ikisi başa baş. Ayıran şey SİSTEM: bu karttaki
          bütün medya mürekkebi beyaz (isim, üniversite, chevron, kalp) ve
          bütün okunurluk perdeleri İKİ MODDA DA koyu (top/bottom blur
          `tint="dark"`, scrimAt). Koyu glif o perdelerin ters tarafına düşer —
          perde koyulaştıkça kaybolur, yani kartın kendi okunurluk katmanı
          gliften çalar. `onMediaInverse` de bunun için değil: o token SABİT
          AÇIK yüzeyler (marka gradyanı üstündeki beyaz buton) için.

          Tek bileşen İKİ YERE birden bakıyor: Keşif (DiscoverScreen) ve
          Beğeniler'den açılan kart (LikerSwipeModal). Rengi burada değiştirmek
          ikisini birden değiştirir; birini ayırmak istersen prop'a çıkar. */}
      {/* LIKE (TİK) */}
      <Animated.View
        style={[
          likeOpacityStyle,
          { position: "absolute", right: 20, top: "30%" },
        ]}
      >
        <View style={{ width: 140, height: 140 }}>
          <Check size={120} strokeWidth={7} color={colors.onMedia} />
        </View>
      </Animated.View>

      {/* NOPE (X) */}
      <Animated.View
        style={[
          nopeOpacityStyle,
          { position: "absolute", left: 20, top: "30%" },
        ]}
      >
        <View style={{ width: 140, height: 140 }}>
          <X size={120} strokeWidth={7} color={colors.onMedia} />
        </View>
      </Animated.View>
    </View>
  );
}
