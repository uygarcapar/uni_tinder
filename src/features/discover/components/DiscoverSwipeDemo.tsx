import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { ArrowLeft, ArrowRight } from "@/shared/icons";
import { discoverSwipeDemoX } from "@/shared/services/uiBus";
import { colors, scrimAt } from "@/shared/theme/colors";

// Beğen/geç eşiğinin (85) altında: demo kartı gerçekten atmıyor.
const DEMO_TX = 55;
const SWING_MS = 550;
const ARROW_SHIFT = 16;
const SWING = { easing: Easing.inOut(Easing.cubic) };

type Props = {
  /** Demo bitti ya da kullanıcı dokunup geçti. */
  onDone: () => void;
};

/** Keşif'e ilk girişte kartı iki yana sallayıp kaydırmayı gösteren tanıtım. */
export default function DiscoverSwipeDemo({ onDone }: Props) {
  const { t } = useTranslation();
  const fade = useSharedValue(0);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    fade.value = withTiming(1, { duration: 250 });
    discoverSwipeDemoX.value = withDelay(
      400,
      withSequence(
        withTiming(DEMO_TX, { duration: SWING_MS, ...SWING }),
        withTiming(-DEMO_TX, { duration: SWING_MS * 1.4, ...SWING }),
        withTiming(0, { duration: SWING_MS, ...SWING }, (finished) => {
          if (finished) runOnJS(finish)();
        }),
      ),
    );
    return () => {
      cancelAnimation(discoverSwipeDemoX);
      discoverSwipeDemoX.value = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız mount'ta oynuyor
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          discoverSwipeDemoX.value,
          [-DEMO_TX, 0],
          [-ARROW_SHIFT, 0],
          "clamp",
        ),
      },
    ],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          discoverSwipeDemoX.value,
          [0, DEMO_TX],
          [0, ARROW_SHIFT],
          "clamp",
        ),
      },
    ],
  }));

  return (
    <Animated.View
      testID="discover-swipe-demo"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: scrimAt(0.45) },
        fadeStyle,
      ]}
    >
      <Pressable
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel={t("discover.swipeDemo.title")}
        style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Animated.View style={leftStyle}>
            <SFIcon
              name="arrow.left"
              fallback={ArrowLeft}
              size={64}
              color={colors.onMedia}
              strokeWidth={1.5}
            />
          </Animated.View>
          <Animated.View style={rightStyle}>
            <SFIcon
              name="arrow.right"
              fallback={ArrowRight}
              size={64}
              color={colors.onMedia}
              strokeWidth={1.5}
            />
          </Animated.View>
        </View>
        <Text
          style={{
            marginTop: 28,
            color: colors.onMedia,
            fontSize: 22,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {t("discover.swipeDemo.title")}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
