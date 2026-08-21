import { TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { scrimAt } from "@/shared/theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// @gorhom/bottom-sheet için animasyonlu blur backdrop. Sheet animatedIndex'e göre
// opacity 0→1 fade'lenir, sheet kapanırken tersi. Dışarı dokunmak onPress'i tetikler.
export default function BlurBottomSheetBackdrop({
  animatedIndex,
  style,
  onPress,
  intensity = 30,
  dimColor = scrimAt(0.35),
}: any) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, 1],
      Extrapolate.CLAMP,
    ),
  }));
  return (
    <Animated.View style={[style, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onPress}
        style={{ flex: 1 }}
      >
        <AnimatedBlurView
          intensity={intensity}
          tint={plainBlurTint()}
          style={{ flex: 1, backgroundColor: dimColor }}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}
