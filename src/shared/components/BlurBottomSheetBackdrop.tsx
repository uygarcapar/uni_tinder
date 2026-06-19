import { TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolate,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// @gorhom/bottom-sheet için animasyonlu blur backdrop. Sheet animatedIndex'e göre
// opacity 0→1 fade'lenir, sheet kapanırken tersi. Dışarı dokunmak onPress'i tetikler.
export default function BlurBottomSheetBackdrop({
  animatedIndex,
  style,
  onPress,
  intensity = 30,
  dimColor = "rgba(0,0,0,0.35)",
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
          tint="dark"
          style={{ flex: 1, backgroundColor: dimColor }}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}
