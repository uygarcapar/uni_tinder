import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { ArrowUp } from "@/shared/icons";
import { colors, scrimAt } from "@/shared/theme/colors";

const ARROW_TRAVEL = 12;
const ARROW_LEG_MS = 550;

type Props = {
  /** Mod başlığının alt kenarı (px): ok tam onun altından başlıyor. */
  top: number;
  onDismiss: () => void;
};

/**
 * Kayıttan sonraki ilk girişte mod başlığını gösteren tanıtım.
 *
 * Perde Keşif'te deste ile üst şeridin ARASINDA çiziliyor: mod başlığı perdenin
 * üstünde parlak kalıyor ve dokunulabiliyor. Kapanış iki yoldan: başlığa
 * dokunmak (seçici açılıyor) ya da "Şimdi değil".
 */
export default function DiscoverModeCoach({ top, onDismiss }: Props) {
  const { t } = useTranslation();
  const bounce = useSharedValue(0);
  const fade = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, { duration: 250 });
    const leg = { duration: ARROW_LEG_MS, easing: Easing.inOut(Easing.quad) };
    bounce.value = withRepeat(
      withSequence(withTiming(ARROW_TRAVEL, leg), withTiming(0, leg)),
      -1,
    );
  }, [bounce, fade]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  return (
    <Animated.View
      testID="discover-mode-coach"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: scrimAt(0.6) },
        fadeStyle,
      ]}
    >
      <View style={{ position: "absolute", top, left: 32, right: 32, alignItems: "center" }}>
        <Animated.View style={arrowStyle}>
          <SFIcon
            name="arrow.up"
            fallback={ArrowUp}
            size={48}
            color={colors.onMedia}
            strokeWidth={1.5}
          />
        </Animated.View>
        <Text
          style={{
            marginTop: 28,
            color: colors.onMedia,
            fontSize: 22,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {t("discover.mode.coach.title")}
        </Text>
        <Pressable
          testID="discover-mode-coach-dismiss"
          onPress={onDismiss}
          hitSlop={12}
          accessibilityRole="button"
          style={{ marginTop: 20 }}
        >
          <Text style={{ color: colors.onMedia, fontSize: 16, fontWeight: "600" }}>
            {t("discover.mode.coach.dismiss")}
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
