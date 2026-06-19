import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

const FIRST_STEP = 3;
const LAST_STEP = 15;
const TOTAL_STEPS = LAST_STEP - FIRST_STEP + 1;

export default function RegisterProgressBar({ step }: any) {
  const clamp = (n) => Math.max(0, Math.min(TOTAL_STEPS, n));
  const target = clamp(step - FIRST_STEP + 1) / TOTAL_STEPS;
  const initial = clamp(step - FIRST_STEP) / TOTAL_STEPS;

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
              backgroundColor: "#fff",
              borderRadius: 999,
            },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}
