import React from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { Check, X } from "lucide-react-native";
import { useRenderCount } from "@/shared/debug/useRenderCount";

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
      {/* LIKE (TİK) */}
      <Animated.View
        style={[
          likeOpacityStyle,
          { position: "absolute", right: 20, top: "30%" },
        ]}
      >
        <View style={{ width: 140, height: 140 }}>
          <Check size={120} strokeWidth={7} color="#FFFFFF" />
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
          <X size={120} strokeWidth={7} color="#FFFFFF" />
        </View>
      </Animated.View>
    </View>
  );
}
