import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../../shared/theme/colors";

const FIRST_STEP = 3;
// Step4 (phone) kayıt akışından çıkarıldı; numaralandırma korunuyor ama
// progress 12 visible adım üzerinden hesaplanıyor.
const TOTAL_STEPS = 12;

export default function RegisterProgressBar({ step }: any) {
  const displayStep = step > 4 ? step - 1 : step;
  const clamp = (n) => Math.max(0, Math.min(TOTAL_STEPS, n));
  const target = clamp(displayStep - FIRST_STEP + 1) / TOTAL_STEPS;
  const initial = clamp(displayStep - FIRST_STEP) / TOTAL_STEPS;

  const progress = useSharedValue(initial);

  useEffect(() => {
    progress.value = withTiming(target, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View className="px-6 mb-4">
      <View
        style={{
          height: 4,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.1)",
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              backgroundColor: colors.text,
              borderRadius: 999,
            },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}
