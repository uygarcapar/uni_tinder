import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../../shared/theme/colors";

// Ekran numaralandırması seyrek: Step4 (telefon) ve Step11 (yaş aralığı) kayıt
// akışından çıkarıldı, kalan ekranların adları korundu. Progress'i aritmetikle
// türetmek yerine gerçekten render edilen adımları listeliyoruz — ileride bir
// adım daha düşerse tek yapılacak iş bu diziden silmek.
const VISIBLE_STEPS = [3, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15];
const TOTAL_STEPS = VISIBLE_STEPS.length;

export default function RegisterProgressBar({ step }: { step: number }) {
  // Listede olmayan bir step gelirse (yeni ekran, dizi güncellenmemiş) bar'ı
  // boş bırakmak yerine en yakın alt adıma yaslıyoruz.
  const index = VISIBLE_STEPS.filter((s) => s <= step).length;
  const target = index / TOTAL_STEPS;
  const initial = Math.max(0, index - 1) / TOTAL_STEPS;

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
