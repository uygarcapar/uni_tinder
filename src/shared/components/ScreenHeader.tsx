import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import Animated, {
  interpolate,
  Extrapolation,
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  Easing,
  useAnimatedProps,
} from "react-native-reanimated";
import { easeGradient } from "react-native-easing-gradient";
import WaveFillLogo from "@/shared/components/WaveFillLogo";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);
const SCROLL_THRESHOLD = 30;
const TITLE_SCROLL_THRESHOLD = 55;

export default function ScreenHeader({
  scrollY,
  title,
  rightButton,
  fillRatio = 0,
}: any) {
  const insets = useSafeAreaInsets();

  // Header Yüksekliği: Bulanıklığın yavaşça erimesi için yeterli mesafe (örneğindeki gibi)
  const headerH = insets.top + 90;

  // --- İŞTE SENİN BULDUĞUN KUSURSUZ EASE-GRADIENT YAPISI ---
  const { colors, locations } = easeGradient({
    colorStops: {
      0: { color: "rgba(0,0,0,0.99)" },
      0.5: { color: "black" },
      1: { color: "transparent" },
    },
  });

  // --- iMESSAGE GİBİ SCROLL İLE BELİRME (Senin attığın örnekteki mantık) ---
  const headerBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 60], // Sayfa en üstteyken 0 (şeffaf), 60px kaydırıldığında 1 (tam opak)
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
    };
  });

  // --- Senin Orijinal Logo ve Başlık Animasyonların ---
  const triggered = useSharedValue(0);
  const titleTriggered = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.value > SCROLL_THRESHOLD,
    (isPast, prev) => {
      if (isPast !== prev) {
        triggered.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );
  useAnimatedReaction(
    () => scrollY.value > TITLE_SCROLL_THRESHOLD,
    (isPast, prev) => {
      if (isPast !== prev) {
        titleTriggered.value = withTiming(isPast ? 1 : 0, {
          duration: 450,
          easing: Easing.out(Easing.cubic),
        });
      }
    },
  );

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - triggered.value,
    transform: [
      { translateY: -20 * triggered.value },
      { scale: 1 + 0.12 * triggered.value },
    ],
  }));

  const logoBlurProps = useAnimatedProps(() => ({
    intensity: 50 * triggered.value,
  }));

  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: titleTriggered.value,
    transform: [{ translateY: 12 * (1 - titleTriggered.value) }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: headerH,
        zIndex: 10,
      }}
    >
      {/* SENİN ÖRNEĞİNDEKİ PROGRESSIVE BLUR SARMALAYICISI
        Scroll yapıldıkça headerBackgroundStyle sayesinde yavaşça belirir.
      */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: headerH,
          },
          headerBackgroundStyle,
        ]}
      >
        <MaskedView
          maskElement={
            <LinearGradient
              locations={locations}
              colors={colors}
              style={StyleSheet.absoluteFill}
            />
          }
          style={StyleSheet.absoluteFill}
        >
          {/* Ekstra derinlik için karanlık gradient */}
          <LinearGradient
            colors={["black", "rgba(0, 0, 0, 0.2)"]}
            style={StyleSheet.absoluteFill}
          />
          {/* Native iOS hissiyatı veren materyal blur */}
          <BlurView
            intensity={15} // Senin örneğindeki gibi hafif ve şık
            tint={
              Platform.OS === "ios"
                ? "systemChromeMaterialDark" // iOS'teki en kaliteli karanlık cam
                : "systemMaterialDark"
            }
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
      </Animated.View>

      {/* --- İçerikler (Başlık, Logo, Buton) --- */}
      {title ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: insets.top,
              left: 21,
              height: 50,
              justifyContent: "center",
            },
            titleAnimStyle,
          ]}
        >
          <Text style={{ color: "#fff", fontSize: 35, fontWeight: "700" }}>
            {title}
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: "absolute",
            top: insets.top,
            left: 0,
            right: 0,
            height: 50,
            alignItems: "center",
            justifyContent: "center",
          },
          logoAnimStyle,
        ]}
      >
        <View>
          <WaveFillLogo fillRatio={fillRatio} />
          {/* Logonun üstüne binen lokal blur */}
          <MaskedView
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -30,
              left: -160,
              right: -160,
              bottom: -30,
            }}
            maskElement={
              <LinearGradient
                colors={[
                  "transparent",
                  "rgba(0,0,0,0.15)",
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,1)",
                  "rgba(0,0,0,0.55)",
                  "rgba(0,0,0,0.15)",
                  "transparent",
                ]}
                locations={[0, 0.18, 0.35, 0.5, 0.65, 0.82, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            }
          >
            <AnimatedBlurView
              pointerEvents="none"
              tint="dark"
              animatedProps={logoBlurProps}
              style={{ flex: 1 }}
            />
          </MaskedView>
        </View>
      </Animated.View>

      {rightButton ? (
        <View
          style={{
            position: "absolute",
            top: insets.top,
            right: 16,
            height: 50,
            justifyContent: "center",
          }}
        >
          {rightButton}
        </View>
      ) : null}
    </View>
  );
}

export const SCREEN_HEADER_LOGO_HEIGHT = 50;
