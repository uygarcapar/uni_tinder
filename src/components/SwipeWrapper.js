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
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "./SwipeCard";

const { width } = Dimensions.get("window");
const SWIPE_THRESHOLD = 120;

export default function SwipeWrapper({
  profile,
  onSwipe,
  isTopCard,
  dragX,
  overlayDragX,
  overlayOpacity,
  buttonDragX,
  programmaticSwipe,
}) {
  const tx = useSharedValue(0);
  const hasVibrated = useSharedValue(false);

  // Haptic feedback fonksiyonu
  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ✅ DÜZELTME: Kart en üste (aktif) duruma geçtiğinde değerleri sıfırla.
  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
    }
  }, [isTopCard, dragX, overlayDragX, overlayOpacity, buttonDragX]);

  // Programmatic swipe'ı izle
  useAnimatedReaction(
    () => programmaticSwipe?.value,
    (value, previous) => {
      if (!isTopCard || value === 0 || value === previous) return;

      if (value === 1) {
        // Left swipe animation
        dragX.value = withTiming(-150, { duration: 200 });
        overlayDragX.value = withTiming(-150, { duration: 200 });
        buttonDragX.value = withTiming(-150, { duration: 200 });
        overlayOpacity.value = withTiming(1, { duration: 100 });

        tx.value = withSpring(-width * 1.5, { velocity: 15 }, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });

        // Overlay'i fade out yap
        overlayOpacity.value = withTiming(0, { duration: 250, delay: 200 });
        buttonDragX.value = withTiming(0, { duration: 250, delay: 200 });

        // Reset trigger
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        // Right swipe animation
        dragX.value = withTiming(150, { duration: 200 });
        overlayDragX.value = withTiming(150, { duration: 200 });
        buttonDragX.value = withTiming(150, { duration: 200 });
        overlayOpacity.value = withTiming(1, { duration: 100 });

        tx.value = withSpring(width * 1.5, { velocity: 15 }, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });

        // Overlay'i fade out yap
        overlayOpacity.value = withTiming(0, { duration: 250, delay: 200 });
        buttonDragX.value = withTiming(0, { duration: 250, delay: 200 });

        // Reset trigger
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard]
  );

  const scale = useDerivedValue(() => {
    // Eğer kart en üstteyse, arkadaki animasyondan etkilenmeden
    // direkt tam boyutta (1) kalmalıdır.
    if (isTopCard) {
      return withSpring(1, { damping: 20, stiffness: 100 });
    }

    // Arkadaki kartın sürükleme sırasındaki büyüme oranı
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

      // Threshold geçildiğinde bir kere titreşim yap
      if (!hasVibrated.value && Math.abs(event.translationX) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }

      // Threshold'un altına düştüğünde flag'i sıfırla (tekrar geçişte titreşsin)
      if (hasVibrated.value && Math.abs(event.translationX) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd(() => {
      // Reset vibration flag
      hasVibrated.value = false;
      if (tx.value > SWIPE_THRESHOLD) {
        // Butonların renklerini yumuşak geçişle sıfırla
        buttonDragX.value = withTiming(0, { duration: 250 });
        // Overlay'i 250ms'de opacity azalarak kapat (translateX değişmesin)
        overlayOpacity.value = withTiming(0, { duration: 250 });
        tx.value = withSpring(width * 1.5, { velocity: 15 }, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });
      } else if (tx.value < -SWIPE_THRESHOLD) {
        // Butonların renklerini yumuşak geçişle sıfırla
        buttonDragX.value = withTiming(0, { duration: 250 });
        // Overlay'i 250ms'de opacity azalarak kapat (translateX değişmesin)
        overlayOpacity.value = withTiming(0, { duration: 250 });
        tx.value = withSpring(-width * 1.5, { velocity: 15 }, () => {
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
      // Opaklık ayarı: Üstteki hep 1, alttaki kaydırma sırasında netleşir
      opacity: isTopCard
        ? 1
        : interpolate(
            Math.abs(dragX.value),
            [0, SWIPE_THRESHOLD],
            [0.8, 1],
            Extrapolate.CLAMP,
          ),
      zIndex: isTopCard ? 10 : 1, // Z-index garantisi
    };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[animatedStyle, { position: "absolute", inset: 0 }]}
      >
        <SwipeCard profile={profile} />
      </Animated.View>
    </GestureDetector>
  );
}
