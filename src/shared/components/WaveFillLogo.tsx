import { useEffect } from "react";
import { View, Image } from "react-native";
import Animated, {
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  useAnimatedStyle,
  useAnimatedProps,
  Easing,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";
import { colors } from "../theme/colors";

const LOGO_W = 120;
const LOGO_H = 50;
const AnimatedPath = Animated.createAnimatedComponent(Path);

// Lit logo'yu dalgalı + gradient turuncu olarak alttan yukarı doldurur.
// fillRatio (0-1) → kullanılan swipe oranı. 1 = hak doldu (logo titrer).
export default function WaveFillLogo({ fillRatio = 0 }) {
  const phase = useSharedValue(0);
  const fillSV = useSharedValue(fillRatio);
  const shakeX = useSharedValue(0);

  useEffect(() => {
    phase.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 1500, easing: Easing.linear }),
      -1,
      false,
    );
  }, [phase]);

  useEffect(() => {
    fillSV.value = withTiming(fillRatio, { duration: 600 });
  }, [fillRatio, fillSV]);

  useEffect(() => {
    if (fillRatio >= 1) {
      shakeX.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 50 }),
          withTiming(2, { duration: 50 }),
          withTiming(-2, { duration: 50 }),
          withTiming(2, { duration: 50 }),
          withTiming(0, { duration: 50 }),
          withTiming(0, { duration: 1200 }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(shakeX);
      shakeX.value = withTiming(0, { duration: 100 });
    }
  }, [fillRatio, shakeX]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const animatedProps = useAnimatedProps(() => {
    const f = Math.min(1, Math.max(0, fillSV.value));
    const baselineY = Math.min(LOGO_H - 6, LOGO_H - f * LOGO_H);
    const ph = phase.value;
    const amp = 4;
    const freq = 2;
    const segments = 40;
    let d = `M 0 ${baselineY + amp * Math.sin(ph)}`;
    for (let i = 1; i <= segments; i++) {
      const x = (i / segments) * LOGO_W;
      const y =
        baselineY + amp * Math.sin((i / segments) * freq * 2 * Math.PI + ph);
      d += ` L ${x} ${y}`;
    }
    d += ` L ${LOGO_W} ${LOGO_H} L 0 ${LOGO_H} Z`;
    return { d };
  });

  return (
    <Animated.View style={shakeStyle}>
      <MaskedView
        maskElement={
          <Image
            source={require("../../../assets/lit_name_white.png")}
            style={{ width: LOGO_W, height: LOGO_H }}
            resizeMode="contain"
          />
        }
        style={{ width: LOGO_W, height: LOGO_H }}
      >
        <View
          style={{ width: LOGO_W, height: LOGO_H, backgroundColor: colors.text }}
        />
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: LOGO_W,
            height: LOGO_H,
          }}
        >
          <Svg width={LOGO_W} height={LOGO_H}>
            <Defs>
              <SvgLinearGradient id="litFillGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#fa8532" />
                <Stop offset="0.3" stopColor="#fa8532" />
                <Stop offset="0.6" stopColor="#f7521b" />
                <Stop offset="1" stopColor="#f51111" />
              </SvgLinearGradient>
            </Defs>
            <AnimatedPath
              animatedProps={animatedProps}
              fill="url(#litFillGrad)"
            />
          </Svg>
        </View>
      </MaskedView>
    </Animated.View>
  );
}
