import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Heart } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors as theme, gradients } from "@/shared/theme/colors";

type SuperLikeHeartProps = {
  size?: number;
  /** Soldan sağa geçen premium parıltısı. */
  shimmer?: boolean;
  style?: any;
};

/**
 * LitPlus tonlu, gradient dolgulu SuperLike kalbi. SwipeCard'daki kalbin
 * ta kendisi — buradan shared olarak kullanılır (LikesScreen kartları, vb.).
 * Lucide fill tek renk aldığı için gradyanı MaskedView ile veriyoruz.
 */
export default function SuperLikeHeart({
  size = 55,
  shimmer = true,
  style,
}: SuperLikeHeartProps) {
  // Band kalpten geniş → parıltının falloff'u yumuşak. Boyutla orantılı ölçekle.
  const bandWidth = size * 2.7;
  const shimmerProgress = useSharedValue(0);
  useEffect(() => {
    if (!shimmer) return;
    shimmerProgress.value = 0;
    shimmerProgress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 4300 }),
      ),
      -1,
      false,
    );
  }, [shimmer, shimmerProgress]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -bandWidth + shimmerProgress.value * (bandWidth + size) },
    ],
  }));

  return (
    <View style={[{ width: size, height: size }, style]}>
      {/* Gradient dolgu — Heart şeklinde maskeli. */}
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Heart size={size} color="black" strokeWidth={0} fill="black" />
        }
      >
        <LinearGradient
          colors={gradients.swipeHeart}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </MaskedView>

      {/* Premium shimmer — kalp şekline maskeli. */}
      {shimmer && (
        <MaskedView
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          maskElement={
            <Heart size={size} color="black" strokeWidth={0} fill="black" />
          }
        >
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: bandWidth,
              },
              shimmerStyle,
            ]}
          >
            <LinearGradient
              {...(easeGradient({
                colorStops: {
                  0: { color: "transparent" },
                  0.5: { color: "rgba(255,255,255,0.22)" },
                  1: { color: "transparent" },
                },
              }) as any)}
              start={{ x: 0, y: 0.35 }}
              end={{ x: 1, y: 0.65 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </MaskedView>
      )}

      {/* İnce açık border */}
      <Heart
        size={size}
        color={theme.swipeHeartBorder}
        strokeWidth={0.1}
        fill="transparent"
      />
    </View>
  );
}
