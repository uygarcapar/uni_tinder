import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../../shared/theme/colors";
import { REGISTRATION_STEP_NUMBERS } from "@/features/auth/registrationFlow";

// Ekran numaralandırması seyrek: Step4 (telefon) ve Step11 (yaş aralığı) kayıt
// akışından çıkarıldı, kalan ekranların adları korundu. Progress'i aritmetikle
// türetmek yerine gerçekten render edilen adımları listeliyoruz.
//
// Sıra registrationFlow.ts'ten geliyor — "kaldığın yerden devam et" de aynı
// diziyi okuyor, ikisi ayrışmasın. DİKKAT: dizi AKIŞ SIRASINDA, sayısal sırada
// DEĞİL (Step16, fotoğraf adımından önce).
const VISIBLE_STEPS = REGISTRATION_STEP_NUMBERS;
const TOTAL_STEPS = VISIBLE_STEPS.length;

function progressIndex(step: number): number {
  const at = VISIBLE_STEPS.indexOf(step);
  if (at >= 0) return at + 1;
  // Listede olmayan bir step gelirse (yeni ekran, dizi güncellenmemiş) bar'ı
  // boş bırakmak yerine sayıca kendinden küçük adımların sayısına yaslıyoruz.
  return VISIBLE_STEPS.filter((s) => s < step).length;
}

export default function RegisterProgressBar({ step }: { step: number }) {
  const index = progressIndex(step);
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
          backgroundColor: colors.hairline,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              backgroundColor: colors.inverseSurface,
              borderRadius: 999,
            },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}
