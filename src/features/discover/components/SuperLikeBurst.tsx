import { useEffect, useRef, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Heart } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import uiBus from "@/shared/services/uiBus";
import { gradients } from "@/shared/theme/colors";

const { width } = Dimensions.get("window");

// SwipeCard'daki super-like kalbi: top:28, right:28, 55x55.
const HEART_BOX = 55;
const HEART_TOP = 28;
const HEART_RIGHT = 28;
// DiscoverScreen header: paddingTop(insets.top) + 50px satır; Cards paddingTop:1.
const HEADER_ROW = 50;
const CARDS_PADDING_TOP = 1;

const ORIGIN_X = width - HEART_RIGHT - HEART_BOX / 2;

const PARTICLE_COUNT = 7;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Tek bir uçan kalp — mount olunca yavaşça yukarı süzülüp telefonun üstünden
// çıkarak kaybolur. Parametreler mount başına rastgele → organik görünür.
function Particle({ index, originY }: { index: number; originY: number }) {
  const progress = useSharedValue(0);
  const p = useRef({
    size: rand(30, 50),
    // Yatay yayılım: merkezden simetrik dağılım + hafif jitter.
    driftX: (index - (PARTICLE_COUNT - 1) / 2) * rand(16, 28) + rand(-12, 12),
    // Yukarı çıkış: origin'in üstüne kadar → ekranın tepesinden taşar.
    rise: originY + rand(70, 240),
    duration: rand(2600, 3900), // çok daha yavaş süzülme
    delay: index * rand(50, 120),
    rot: rand(-26, 26),
  }).current;

  useEffect(() => {
    progress.value = withDelay(
      p.delay,
      withTiming(1, { duration: p.duration, easing: Easing.out(Easing.quad) }),
    );
  }, [progress, p.delay, p.duration]);

  const style = useAnimatedStyle(() => {
    const t = progress.value;
    // Hızlı belir, çoğunlukla tam opak kal, son %30'da yukarı çıkarken sön.
    const opacity =
      t < 0.08 ? t / 0.08 : t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    return {
      opacity,
      transform: [
        { translateX: p.driftX * t },
        { translateY: -p.rise * t },
        { scale: 0.5 + t * 0.7 },
        { rotate: `${p.rot * t}deg` },
      ] as const,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: ORIGIN_X - p.size / 2,
          top: originY - p.size / 2,
          width: p.size,
          height: p.size,
        },
        style,
      ]}
    >
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Heart size={p.size} color="black" strokeWidth={0} fill="black" />
        }
      >
        <LinearGradient
          colors={gradients.swipeHeart}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1 }}
        />
      </MaskedView>
    </Animated.View>
  );
}

// Tüm ekranı kaplayan root overlay (header ve kartın ÜSTÜnde). "superLikeBurst"
// event'i gelince bir grup uçan kalp mount eder, animasyon bitince temizler.
export default function SuperLikeBurst() {
  const insets = useSafeAreaInsets();
  const [bursts, setBursts] = useState<number[]>([]);
  const counter = useRef(0);

  // Kalp ikonunun ekran koordinatındaki merkezi (header + card offset).
  const originY =
    insets.top + HEADER_ROW + CARDS_PADDING_TOP + HEART_TOP + HEART_BOX / 2;

  useEffect(() => {
    const unsub = uiBus.on("superLikeBurst", () => {
      const id = counter.current++;
      setBursts((prev) => [...prev, id]);
      setTimeout(
        () => setBursts((prev) => prev.filter((b) => b !== id)),
        5000,
      );
    });
    return unsub;
  }, []);

  if (bursts.length === 0) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bursts.map((id) => (
        <View key={id} style={StyleSheet.absoluteFill}>
          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
            <Particle key={i} index={i} originY={originY} />
          ))}
        </View>
      ))}
    </View>
  );
}
