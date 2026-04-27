import React, { useEffect } from "react";
import { Dimensions } from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolate,
  useDerivedValue,
  useAnimatedReaction,
  Easing, // ✅ Easing eklendi
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "./SwipeCard";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;

// ✅ Animasyon sürelerini daha ince ayarlamak için ayırdık
const EXIT_DURATION = 180; // Kartın ekrandan çıkma süresi (hız korundu ama Easing ile yumuşatıldı)
const FADE_IN_DURATION = 100; // İkonların belirmesi (hızlı)
const FADE_OUT_DURATION = 350; // İkonların kaybolması (daha yavaş, yumuşak fade efekti)
const EXIT_DISTANCE = width * 1.2; // Kartın gideceği mesafe biraz kısaltıldı (daha yavaş gitmiş hissi verir)

export default function SwipeWrapper({
  profile,
  onSwipe,
  isTopCard,
  dragX,
  overlayDragX,
  overlayOpacity,
  buttonDragX,
  programmaticSwipe,
  onPass,
  onLike,
}) {
  const tx = useSharedValue(0);
  const hasVibrated = useSharedValue(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
    }
  }, [isTopCard, dragX, overlayDragX, overlayOpacity, buttonDragX]);

  // Yumuşak çıkış animasyonu ayarı
  const exitConfig = {
    duration: EXIT_DURATION,
    easing: Easing.out(Easing.cubic),
  };
  // Yumuşak fade out ayarı
  const fadeOutConfig = {
    duration: FADE_OUT_DURATION,
    easing: Easing.out(Easing.quad),
  };

  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;

      if (value === 1) {
        dragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(-150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        // Kart yumuşak bir ivmeyle çıkar
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });

        // Overlay (ikonlar) daha uzun sürede fade out olur
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        dragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        // Kart yumuşak bir ivmeyle çıkar
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });

        // Overlay (ikonlar) daha uzun sürede fade out olur
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  const scale = useDerivedValue(() => {
    if (isTopCard) {
      return withSpring(1, { damping: 20, stiffness: 100 });
    }

    return interpolate(
      Math.abs(dragX.value),
      [0, SWIPE_THRESHOLD],
      [0.92, 1],
      Extrapolate.CLAMP,
    );
  });

  const panGesture = Gesture.Pan()
    .enabled(isTopCard)
    .onUpdate((event) => {
      tx.value = event.translationX;
      dragX.value = event.translationX;
      overlayDragX.value = event.translationX;
      buttonDragX.value = event.translationX;

      if (
        !hasVibrated.value &&
        Math.abs(event.translationX) > SWIPE_THRESHOLD
      ) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }

      if (hasVibrated.value && Math.abs(event.translationX) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd(() => {
      hasVibrated.value = false;

      if (tx.value > SWIPE_THRESHOLD) {
        // İkonlar ve butonlar yumuşakça kaybolsun
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);

        // Kartın gidişi Easing ile yumuşatıldı
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });
      } else if (tx.value < -SWIPE_THRESHOLD) {
        // İkonlar ve butonlar yumuşakça kaybolsun
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);

        // Kartın gidişi Easing ile yumuşatıldı
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });
      } else {
        tx.value = withSpring(0);
        dragX.value = withSpring(0);
        overlayDragX.value = withSpring(0);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);

    return {
      transform: [
        { translateX: tx.value },
        { rotate: isTopCard ? `${rotate}deg` : "0deg" },
        { scale: scale.value },
      ],
      opacity: isTopCard
        ? 1
        : interpolate(
            Math.abs(dragX.value),
            [0, SWIPE_THRESHOLD],
            [0.8, 1],
            Extrapolate.CLAMP,
          ),
      zIndex: isTopCard ? 10 : 1,
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[animatedStyle, { position: "absolute", inset: 0 }]}
      >
        <SwipeCard profile={profile} onPass={onPass} onLike={onLike} />
      </Animated.View>
    </GestureDetector>
  );
}
