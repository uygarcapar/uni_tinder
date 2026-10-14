import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "../../../shared/theme/colors";
import { stepNumbersForMode } from "@/features/auth/registrationFlow";
import { useAppSelector } from "@/shared/hooks/redux";

// Ekran numaralandırması seyrek: Step4 (telefon) ve Step11 (yaş aralığı) kayıt
// akışından çıkarıldı, kalan ekranların adları korundu. Progress'i aritmetikle
// türetmek yerine gerçekten render edilen adımları listeliyoruz.
//
// Sıra registrationFlow.ts'ten geliyor — "kaldığın yerden devam et" de aynı
// diziyi okuyor, ikisi ayrışmasın. DİKKAT: dizi AKIŞ SIRASINDA, sayısal sırada
// DEĞİL (Step16, fotoğraf adımından önce).
// Adım listesi MODA GÖRE: Arkadaş modunda flörte özel adım (InterestedIn)
// akıştan çıkıyor, yani payda da bir kısalıyor. Modül seviyesinde sabit bir
// liste tutulsaydı Arkadaş kullanıcısı son adımda %93'te kalırdı.
function progressIndex(visibleSteps: number[], step: number): number {
  const at = visibleSteps.indexOf(step);
  if (at >= 0) return at + 1;
  // Listede olmayan bir step gelirse (yeni ekran, dizi güncellenmemiş) bar'ı
  // boş bırakmak yerine sayıca kendinden küçük adımların sayısına yaslıyoruz.
  return visibleSteps.filter((s) => s < step).length;
}

export default function RegisterProgressBar({ step }: { step: number }) {
  // Mod seçimi kayıt formunda (henüz profil yok). Seçilmediyse tam akış.
  const mode = useAppSelector(
    (s) => (s as any).auth?.registrationForm?.mode as string | undefined,
  );
  const visibleSteps = stepNumbersForMode(mode);
  const total = visibleSteps.length;
  const index = progressIndex(visibleSteps, step);
  const target = index / total;
  const initial = Math.max(0, index - 1) / total;

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
