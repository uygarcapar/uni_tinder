import React, { useEffect, useState } from "react";
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
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import SwipeCard from "@/features/discover/components/SwipeCard";
import uiBus, { cardExpandAnim, cardPullProgress } from "@/shared/services/uiBus";
import { useRenderCount } from "@/shared/debug/useRenderCount";

const { width, height } = Dimensions.get("window");
const SWIPE_THRESHOLD = 85;
const EXIT_HEIGHT = height * 1.2;
const SUPER_LIKE_PULL_THRESHOLD = 50; // pull down ty.value bu px'e ulaşınca süper beğeni "ready"

// Animasyon süreleri
const EXIT_DURATION = 180;
const FADE_IN_DURATION = 100;
const FADE_OUT_DURATION = 350;
const EXIT_DISTANCE = width * 1.2;

function SwipeWrapper({
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
  onSuperLike,
  swipeQuotaExhausted = false,
  superLikeQuotaExhausted = false,
  superLikesRemaining,
}: any) {
  useRenderCount("SwipeWrapper");
  // Expanded'ken kart header'ın üstüne binip orada kalsın (kapatılana kadar).
  // Header bar 50px → yarısı (~25px) kadar hafifçe biner; status bar (insets.top)
  // hesaba katılmaz. cardExpandAnim'e bağlı: expand oranıyla yukarı biner,
  // collapse'de (gesture/chevron) senkron geri iner.
  const HEADER_COVER = 25;
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Scroll bitip rubber-band'in başladığı andaki translationY baseline'ı.
  // Sürekli gesture'da scroll → rubber-band geçişi yumuşak olsun diye.
  const dragOffsetY = useSharedValue(0);
  const hasVibrated = useSharedValue(false);
  // Pull-down sırasında süper-like kalbinin doluluk oranı (0-1). SwipeCard'a iletilir.
  const superLikeProgress = useSharedValue(0);
  // Threshold geçildiğinde haptic gate (gesture başına 1 kez patlasın).
  const superLikeReady = useSharedValue(false);
  // Expand state — sadece top kart için. Pan threshold geçince true olur, ScrollView
  // SwipeCard içinde scrollEnabled={expanded} ile native scroll'a açılır.
  const [expanded, setExpanded] = useState(false);
  const expandedSV = useSharedValue(false); // worklet için mirror
  useEffect(() => {
    expandedSV.value = expanded;
  }, [expanded, expandedSV]);
  const expandHapticFired = useSharedValue(false);
  const collapseHapticFired = useSharedValue(false);
  const EXPAND_PULL_THRESHOLD = 50;

  // Native scroll gesture — pan ile simultaneous çalışsın diye SwipeCard içindeki
  // ScrollView'a uygulanır. Aynı obje referansı pan ve ScrollView arasında paylaşılır.
  const nativeScrollGesture = React.useMemo(() => Gesture.Native(), []);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const triggerSuperLikeHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  // Pull-down sırasında threshold'a kadar artan sıklıkta haptic. Kendini
  // yeniden zamanlayan JS loop'u; interval progress arttıkça kısalır → titreşim
  // hızlanır. progress ref'ten okunur (worklet her frame runOnJS ile günceller).
  const superProgressRef = React.useRef(0);
  const superHapticTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const runSuperLikeHapticTick = () => {
    const p = superProgressRef.current;
    // Yalnızca pull sürerken (0<p<1) çalışır; threshold'da Heavy haptic devralır.
    if (p <= 0.05 || p >= 1) {
      superHapticTimer.current = null;
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const interval = 260 - p * 190; // ~260ms → ~70ms
    superHapticTimer.current = setTimeout(runSuperLikeHapticTick, interval);
  };
  const updateSuperHaptics = (p: number) => {
    superProgressRef.current = p;
    if (p > 0.05 && p < 1 && superHapticTimer.current == null) {
      runSuperLikeHapticTick();
    }
  };
  const resetSuperHaptics = () => {
    superProgressRef.current = 0;
    if (superHapticTimer.current != null) {
      clearTimeout(superHapticTimer.current);
      superHapticTimer.current = null;
    }
  };
  useEffect(() => resetSuperHaptics, []);

  const triggerExpandHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const openPaywall = () => {
    uiBus.emit("swipePaywall", {});
  };

  const openSuperLikePaywall = () => {
    uiBus.emit("superLikePaywall", {});
  };

  // Super-like onaylanınca kalp ikonundan yukarı süzülen kalp patlaması.
  const emitSuperLikeBurst = () => {
    uiBus.emit("superLikeBurst");
  };

  // Worklet'ten okumak için mirror — runOnJS'siz quota check.
  const quotaExhaustedSV = useSharedValue(swipeQuotaExhausted);
  useEffect(() => {
    quotaExhaustedSV.value = swipeQuotaExhausted;
  }, [swipeQuotaExhausted, quotaExhaustedSV]);
  const superLikeExhaustedSV = useSharedValue(superLikeQuotaExhausted);
  useEffect(() => {
    superLikeExhaustedSV.value = superLikeQuotaExhausted;
  }, [superLikeQuotaExhausted, superLikeExhaustedSV]);

  useEffect(() => {
    if (isTopCard) {
      dragX.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      buttonDragX.value = 0;
      hasVibrated.value = false;
    }
  }, [isTopCard, dragX, overlayDragX, overlayOpacity, buttonDragX]);

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

        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 2) {
        dragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        buttonDragX.value = withTiming(150, { duration: FADE_IN_DURATION });
        overlayOpacity.value = withTiming(1, { duration: 50 });

        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });

        overlayOpacity.value = withTiming(0, fadeOutConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        programmaticSwipe.value = 0;
      } else if (value === 3) {
        // Süper beğeni — kart yukarı doğru ucar (biraz daha yavaş)
        runOnJS(emitSuperLikeBurst)();
        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, { duration: 300 });
        ty.value = withTiming(
          -EXIT_HEIGHT,
          { duration: 500, easing: Easing.out(Easing.cubic) },
          () => {
            runOnJS(onSwipe)("up", profile.userId);
          },
        );
        programmaticSwipe.value = 0;
      }
    },
    [isTopCard],
  );

  const scale = useDerivedValue(() => {
    if (isTopCard) {
      return withSpring(1, { damping: 20, stiffness: 100 });
    }

    // Bottom kart scale'i: yatay swipe oranı VE pull-down (super-like) oranı
    // hangisi büyükse onu kullan → her iki gesture'da da arkadaki kart önden büyür.
    const horizontal = Math.abs(dragX.value) / SWIPE_THRESHOLD;
    const vertical = cardPullProgress.value;
    const combined = Math.min(1, Math.max(horizontal, vertical));
    return interpolate(combined, [0, 1], [0.92, 1], Extrapolate.CLAMP);
  });

  // Yatay swipe — asymptotic rubber-band ile orta zorlanma hissi.
  // max=400, c=1.2 → delta=200'de tx ~150 (threshold), delta=400'de ~240,
  // asymptote 400 → daha güçlü pull'da hala kart hareketi var ama dampened.
  const horizontalPan = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      dragX.value = signed;
      overlayDragX.value = signed;
      buttonDragX.value = signed;

      // Haptic: visual tx üzerinden — kart threshold'u görsel olarak geçince patlasın.
      if (!hasVibrated.value && Math.abs(signed) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }
      if (hasVibrated.value && Math.abs(signed) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd((event) => {
      hasVibrated.value = false;

      // Displacement (85) + velocity (2500 + min 60px) — daha kolay swipe.
      const VELOCITY_THRESHOLD = 2500;
      const VELOCITY_MIN_DISPLACEMENT = 60;
      const goRight =
        tx.value > SWIPE_THRESHOLD ||
        (event.velocityX > VELOCITY_THRESHOLD &&
          tx.value > VELOCITY_MIN_DISPLACEMENT);
      const goLeft =
        tx.value < -SWIPE_THRESHOLD ||
        (event.velocityX < -VELOCITY_THRESHOLD &&
          tx.value < -VELOCITY_MIN_DISPLACEMENT);

      // Like kotası bittiyse: sağa swipe gerçekleşmiş olsa bile karta geri
      // dönsün, istek atılmasın, paywall açılsın. Sola swipe (Pass) backend'de
      // kotaya sayılmadığı için burada da bloklanmıyor.
      if (goRight && quotaExhaustedSV.value) {
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
        runOnJS(openPaywall)();
        return;
      }

      if (goRight) {
        dragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        // Expand state varsa swipe boyunca paralel unwind et — yeni top kartı
        // mount olunca instant snap olmasın, swipe ile orantılı geri sarsın.
        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("right", profile.userId);
        });
      } else if (goLeft) {
        dragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        overlayDragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        buttonDragX.value = withTiming(0, fadeOutConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        if (cardExpandAnim.value > 0)
          cardExpandAnim.value = withTiming(0, exitConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(onSwipe)("left", profile.userId);
        });
      } else {
        // Threshold geçemedi — super-like ile aynı spring physics ile bounce-back.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        tx.value = withSpring(0, cfg);
        dragX.value = withSpring(0, cfg);
        overlayDragX.value = withSpring(0, cfg);
        overlayOpacity.value = 1;
        buttonDragX.value = withSpring(0, cfg);
      }
    });

  // Dikey pan: 3 modda çalışır:
  //  - Card mode + pull-down → super-like (mevcut)
  //  - Card mode + pull-up → expand (rubber-band)
  //  - Expanded mode + pull-down (scrollY=0) → collapse (rubber-band)
  // Expanded mode + pull-up: ScrollView native scroll'u handle eder.
  const verticalPan = Gesture.Pan()
    .enabled(isTopCard)
    .activeOffsetY([-15, 15])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .onBegin(() => {
      dragOffsetY.value = 0;
    })
    .onUpdate((event) => {
      if (expandedSV.value) {
        // EXPANDED MODE — sadece scrollY=0'da pull-down ile collapse.
        if (scrollY.value > 0) {
          dragOffsetY.value = event.translationY;
          ty.value = 0;
          return;
        }
        const delta = event.translationY - dragOffsetY.value;
        if (delta > 0) {
          // Expand ile aynı rubber-band + görsel scale — collapse de aynı
          // zorlukta hissedilsin.
          const max = 200;
          const c = 1.0;
          const tyAbs = (delta * max * c) / (max + c * delta);
          ty.value = tyAbs * 0.5; // kart aşağı translate (geri çekiliyor hissi)
          const progress = Math.min(tyAbs / EXPAND_PULL_THRESHOLD, 1);
          // cardExpandAnim 1'den 0'a iner (geri sarma)
          cardExpandAnim.value = 1 - progress;
          if (progress >= 1 && !collapseHapticFired.value) {
            collapseHapticFired.value = true;
            runOnJS(triggerExpandHaptic)();
          } else if (progress < 1 && collapseHapticFired.value) {
            collapseHapticFired.value = false;
          }
        } else {
          // Pull-up expanded'da: scroll handle etmeli
          ty.value = 0;
        }
        return;
      }

      // CARD MODE
      if (scrollY.value > 0) {
        dragOffsetY.value = event.translationY;
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
        return;
      }
      const delta = event.translationY - dragOffsetY.value;
      if (delta > 0) {
        // PULL-DOWN — super-like
        const max = 100;
        const c = 0.5;
        ty.value = (delta * max * c) / (max + c * delta);
        const progress = Math.min(ty.value / SUPER_LIKE_PULL_THRESHOLD, 1);
        superLikeProgress.value = progress;
        cardPullProgress.value = progress;
        cardExpandAnim.value = 0;
        if (progress >= 1 && !superLikeReady.value) {
          superLikeReady.value = true;
          runOnJS(resetSuperHaptics)();
          runOnJS(triggerSuperLikeHaptic)();
        } else if (progress < 1) {
          if (superLikeReady.value) superLikeReady.value = false;
          // Threshold'a kadar artan sıklıkta haptic (JS loop'u kendini zamanlar).
          runOnJS(updateSuperHaptics)(progress);
        }
      } else if (delta < 0) {
        // PULL-UP — expand. cardPullProgress da güncellenir → arkadaki kart
        // pull oranıyla öne büyür (super-like'taki gibi).
        // Pull-down (super-like) ile aynı rubber-band'i kullanmıyoruz: expand
        // sık erişilen bir hareket, super-like ise daha kasıtlı olmalı.
        const absDelta = -delta;
        const max = 200;
        const c = 1.0;
        const tyAbs = (absDelta * max * c) / (max + c * absDelta);
        // Progress/haptic tyAbs üzerinden hesaplanıyor; ty.value (görsel kart
        // translateY) ayrı scale'leniyor → kart daha az yukarı kalksın.
        ty.value = -tyAbs * 0.5;
        const progress = Math.min(tyAbs / EXPAND_PULL_THRESHOLD, 1);
        cardExpandAnim.value = progress;
        superLikeProgress.value = 0;
        cardPullProgress.value = progress;
        runOnJS(resetSuperHaptics)();
        if (progress >= 1 && !expandHapticFired.value) {
          expandHapticFired.value = true;
          runOnJS(triggerExpandHaptic)();
        } else if (progress < 1 && expandHapticFired.value) {
          expandHapticFired.value = false;
        }
      } else {
        ty.value = 0;
        superLikeProgress.value = 0;
        cardPullProgress.value = 0;
        runOnJS(resetSuperHaptics)();
      }
    })
    .onEnd(() => {
      dragOffsetY.value = 0;

      if (expandedSV.value) {
        // EXPANDED MODE release
        const wasCollapseReady = collapseHapticFired.value;
        collapseHapticFired.value = false;
        if (wasCollapseReady) {
          // Threshold geçildi → collapse. paddingBottom cardExpandAnim'e bağlı,
          // spring 1→0 boyunca senkron küçülür.
          runOnJS(setExpanded)(false);
          cardExpandAnim.value = withSpring(0, {
            damping: 16,
            stiffness: 380,
            mass: 1,
          });
          ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        } else {
          // Threshold geçemedi → expanded'a geri snap
          cardExpandAnim.value = withSpring(1, {
            damping: 16,
            stiffness: 380,
            mass: 1,
          });
          ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        }
        return;
      }

      // CARD MODE release
      const wasReady = superLikeReady.value;
      const wasExpandReady = expandHapticFired.value;
      superLikeReady.value = false;
      expandHapticFired.value = false;
      runOnJS(resetSuperHaptics)();

      if (wasReady && superLikeExhaustedSV.value) {
        // SuperLike kotası bitti — kart geri yerine spring ile dönsün, istek yok,
        // ayrı superlike paywall modal'ı açılsın.
        const cfg = { damping: 16, stiffness: 380, mass: 1 };
        ty.value = withSpring(0, cfg);
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        runOnJS(openSuperLikePaywall)();
      } else if (wasReady) {
        runOnJS(emitSuperLikeBurst)();
        ty.value = withTiming(
          -EXIT_HEIGHT,
          { duration: 320, easing: Easing.out(Easing.cubic) },
          () => {
            runOnJS(onSwipe)("up", profile.userId);
          },
        );
      } else if (wasExpandReady) {
        ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        // paddingBottom cardExpandAnim'e bağlı, spring 0→1 boyunca senkron büyür.
        cardExpandAnim.value = withSpring(1, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
        // Bottom kart geri arkaya yerleşsin — bu kart top kalmaya devam.
        cardPullProgress.value = withSpring(0, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
        runOnJS(setExpanded)(true);
      } else {
        ty.value = withSpring(0, { damping: 16, stiffness: 380, mass: 1 });
        superLikeProgress.value = withSpring(0);
        cardPullProgress.value = withSpring(0);
        cardExpandAnim.value = withSpring(0, {
          damping: 16,
          stiffness: 380,
          mass: 1,
        });
      }
    });

  const composedGesture = Gesture.Simultaneous(horizontalPan, verticalPan);

  // Chevron (SwipeCard alt ok) tap ile expand/collapse toggle — pull-up ve
  // pull-down gesture'larıyla aynı spring config'i.
  const handleExpandPress = React.useCallback(() => {
    const cfg = { damping: 16, stiffness: 380, mass: 1 };
    if (expandedSV.value) {
      setExpanded(false);
      cardExpandAnim.value = withSpring(0, cfg);
      ty.value = withSpring(0, cfg);
    } else {
      ty.value = withSpring(0, cfg);
      cardExpandAnim.value = withSpring(1, cfg);
      cardPullProgress.value = withSpring(0, cfg);
      setExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);

    return {
      transform: [
        { translateX: tx.value },
        // ty.value: geçici drag peek/rubber-band. -HEADER_COVER*cardExpandAnim:
        // expanded'ken kalıcı olarak header'ın üstüne binen lift (kapatana kadar).
        // cardExpandAnim global → sadece top karta uygula, arkadaki kart kaymasın.
        {
          translateY:
            ty.value - (isTopCard ? HEADER_COVER * cardExpandAnim.value : 0),
        },
        { rotate: isTopCard ? `${rotate}deg` : "0deg" },
        { scale: scale.value },
      ],
      opacity: isTopCard
        ? 1
        : interpolate(
            // Scale ile aynı combined: horizontal swipe VE vertical pull-down
            // (super-like) hangisi büyükse onu kullan → super-like sırasında da
            // bottom card brightness artar, swipe sonrası "0.8 → 1 zıplaması" olmaz.
            Math.min(
              1,
              Math.max(
                Math.abs(dragX.value) / SWIPE_THRESHOLD,
                cardPullProgress.value,
              ),
            ),
            [0, 1],
            [0.8, 1],
            Extrapolate.CLAMP,
          ),
      zIndex: isTopCard ? 10 : 1,
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[animatedStyle, { position: "absolute", inset: 0 }]}
      >
        <SwipeCard
          profile={profile}
          onPass={onPass}
          onLike={onLike}
          onSuperLike={onSuperLike}
          onExpandPress={handleExpandPress}
          scrollY={scrollY}
          nativeScrollGesture={nativeScrollGesture}
          superLikeProgress={superLikeProgress}
          isTopCard={isTopCard}
          expanded={expanded}
          superLikesRemaining={superLikesRemaining}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// React.memo: DiscoverScreen optimistic stats update'inde re-render olunca
// SwipeWrapper'lar tekrar render edilmesin. Profile + isTopCard + quota
// flag'leri değişmediği sürece skip et. Handler ref'leri DiscoverScreen'de
// useCallback ile stabilize edildi.
export default React.memo(SwipeWrapper, (prev, next) => {
  return (
    prev.profile?.userId === next.profile?.userId &&
    prev.isTopCard === next.isTopCard &&
    prev.swipeQuotaExhausted === next.swipeQuotaExhausted &&
    prev.superLikeQuotaExhausted === next.superLikeQuotaExhausted &&
    prev.superLikesRemaining === next.superLikesRemaining &&
    prev.onSwipe === next.onSwipe &&
    prev.onPass === next.onPass &&
    prev.onLike === next.onLike &&
    prev.onSuperLike === next.onSuperLike
  );
});
