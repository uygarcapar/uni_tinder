import { useEffect, useMemo } from "react";
import { View, Dimensions } from "react-native";
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../../../shared/theme/colors";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Ölçüler MessageBubble ile hizalı: rounded-full balon, px-4 py-3 (~42px yükseklik),
// %78 maxWidth, marginVertical 2, 12px yatay padding.
const BUBBLE_HEIGHT = 42;
const ROW_PADDING_H = 12;
const CONTENT_WIDTH = SCREEN_WIDTH - ROW_PADDING_H * 2;

// Deterministik varyasyon — her render'da farklı iskelet üretip titreşim yaratmasın.
const WIDTH_RATIOS = [0.62, 0.4, 0.72, 0.34, 0.55, 0.68, 0.45, 0.58];

function SkeletonBubble({
  widthRatio,
  isOwn,
  progress,
}: {
  widthRatio: number;
  isOwn: boolean;
  progress: SharedValue<number>;
}) {
  const bubbleWidth = useMemo(
    () => Math.round(CONTENT_WIDTH * widthRatio),
    [widthRatio],
  );

  // Tüm balonlar tek bir clock'tan besleniyor (progress 0→1); her balon kendi
  // genişliğine göre map'liyor. N ayrı withRepeat loop'u yerine tek driver.
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -bubbleWidth + progress.value * bubbleWidth * 3 }],
  }));

  return (
    <View
      style={{
        paddingHorizontal: ROW_PADDING_H,
        marginVertical: 2,
        alignItems: isOwn ? "flex-end" : "flex-start",
      }}
    >
      <View
        style={{
          width: bubbleWidth,
          height: BUBBLE_HEIGHT,
          borderRadius: BUBBLE_HEIGHT / 2,
          borderCurve: "continuous",
          backgroundColor: colors.surface2,
          overflow: "hidden",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              width: bubbleWidth,
              height: "100%",
            },
            animStyle,
          ]}
        >
          <LinearGradient
            colors={["transparent", colors.shimmer, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>
    </View>
  );
}

type Props = {
  /** Kaç placeholder balon çizilecek. */
  count?: number;
};

export default function MessageSkeleton({ count = 6 }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  const rows = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        widthRatio: WIDTH_RATIOS[i % WIDTH_RATIOS.length],
        isOwn: i % 3 === 1,
      })),
    [count],
  );

  return (
    <View style={{ paddingVertical: 8 }}>
      {rows.map((r, i) => (
        <SkeletonBubble
          key={i}
          widthRatio={r.widthRatio}
          isOwn={r.isOwn}
          progress={progress}
        />
      ))}
    </View>
  );
}
