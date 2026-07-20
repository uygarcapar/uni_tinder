import { useCallback, useEffect, useState } from "react";
import { View, Modal, Dimensions } from "react-native";
import {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  interpolate,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, ArrowRight } from "lucide-react-native";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SwipeCard from "@/features/discover/components/SwipeCard";
import SwipeOverlay from "@/features/discover/components/SwipeOverlay";
import { useSwipeMutation } from "@/features/discover/swipeQueries";
import { colors } from "../../../shared/theme/colors";

const { width, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_LOW = SCREEN_HEIGHT * 0.85;
const SWIPE_THRESHOLD = 85;
const EXIT_DISTANCE = width * 1.2;
const EXIT_DURATION = 180;
const FADE_OUT_DURATION = 350;
const TUTORIAL_TX = 55; // threshold (85) altında — like/pass tetiklenmesin
const TUTORIAL_SWING_DURATION = 550;
const TUTORIAL_STORAGE_KEY = "likerSwipeTutorialShown";

const exitConfig = { duration: EXIT_DURATION, easing: Easing.out(Easing.cubic) };
const fadeOutConfig = { duration: FADE_OUT_DURATION };
const springConfig = { damping: 16, stiffness: 380, mass: 1 };

function triggerHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export default function LikerSwipeModal({ visible, profile, onClose, onSwipe }: any) {
  const swipeMutation = useSwipeMutation();
  const insets = useSafeAreaInsets();

  const tx = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const hasVibrated = useSharedValue(false);

  const tutorialOpacity = useSharedValue(0);
  const [tutorialActive, setTutorialActive] = useState(false);

  useEffect(() => {
    if (!visible) {
      tx.value = 0;
      overlayDragX.value = 0;
      overlayOpacity.value = 1;
      hasVibrated.value = false;
      tutorialOpacity.value = 0;
      setTutorialActive(false);
      return;
    }

    let cancelled = false;
    AsyncStorage.getItem(TUTORIAL_STORAGE_KEY).then((shown) => {
      if (cancelled || shown) return;
      setTutorialActive(true);
      // Sheet slide-up animasyonu bitince başlat.
      tutorialOpacity.value = withDelay(400, withTiming(1, { duration: 250 }));
      tx.value = withDelay(
        600,
        withSequence(
          withTiming(TUTORIAL_TX, {
            duration: TUTORIAL_SWING_DURATION,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(-TUTORIAL_TX, {
            duration: TUTORIAL_SWING_DURATION * 1.4,
            easing: Easing.inOut(Easing.cubic),
          }),
          withTiming(
            0,
            { duration: TUTORIAL_SWING_DURATION, easing: Easing.inOut(Easing.cubic) },
            () => {
              tutorialOpacity.value = withTiming(0, { duration: 250 }, () => {
                runOnJS(setTutorialActive)(false);
              });
            },
          ),
        ),
      );
      AsyncStorage.setItem(TUTORIAL_STORAGE_KEY, "1").catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [visible, tx, overlayDragX, overlayOpacity, hasVibrated, tutorialOpacity]);

  const handleSwipe = (direction: "left" | "right") => {
    const userId = profile?.userId;
    if (userId) {
      swipeMutation.mutate({ direction, userId });
      onSwipe?.(userId, direction);
    }
    onClose?.();
  };

  const triggerAction = (direction: "left" | "right") => {
    const to = direction === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
    const overlayTarget =
      direction === "right" ? SWIPE_THRESHOLD : -SWIPE_THRESHOLD;
    overlayDragX.value = withTiming(overlayTarget, exitConfig);
    overlayOpacity.value = withTiming(0, fadeOutConfig);
    tx.value = withTiming(to, exitConfig, () => {
      runOnJS(handleSwipe)(direction);
    });
  };

  const horizontalPan = Gesture.Pan()
    .enabled(!tutorialActive)
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((event) => {
      "worklet";
      const delta = event.translationX;
      const absDelta = Math.abs(delta);
      const max = 400;
      const c = 1.2;
      const damped = (absDelta * max * c) / (max + c * absDelta);
      const signed = delta < 0 ? -damped : damped;
      tx.value = signed;
      overlayDragX.value = signed;

      if (!hasVibrated.value && Math.abs(signed) > SWIPE_THRESHOLD) {
        hasVibrated.value = true;
        runOnJS(triggerHaptic)();
      }
      if (hasVibrated.value && Math.abs(signed) < SWIPE_THRESHOLD) {
        hasVibrated.value = false;
      }
    })
    .onEnd((event) => {
      "worklet";
      hasVibrated.value = false;

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

      if (goRight) {
        overlayDragX.value = withTiming(SWIPE_THRESHOLD, exitConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        tx.value = withTiming(EXIT_DISTANCE, exitConfig, () => {
          runOnJS(handleSwipe)("right");
        });
      } else if (goLeft) {
        overlayDragX.value = withTiming(-SWIPE_THRESHOLD, exitConfig);
        overlayOpacity.value = withTiming(0, fadeOutConfig);
        tx.value = withTiming(-EXIT_DISTANCE, exitConfig, () => {
          runOnJS(handleSwipe)("left");
        });
      } else {
        tx.value = withSpring(0, springConfig);
        overlayDragX.value = withSpring(0, springConfig);
        overlayOpacity.value = 1;
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const rotate = interpolate(tx.value, [-width, 0, width], [-15, 0, 15]);
    return {
      transform: [{ translateX: tx.value }, { rotate: `${rotate}deg` }],
    };
  });

  const tutorialOverlayStyle = useAnimatedStyle(() => ({
    opacity: tutorialOpacity.value,
  }));

  const leftArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tx.value, [-TUTORIAL_TX, 0], [-16, 0], "clamp") },
    ],
  }));

  const rightArrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(tx.value, [0, TUTORIAL_TX], [0, 16], "clamp") },
    ],
  }));

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.6}
        pressBehavior={tutorialActive ? "none" : "close"}
      />
    ),
    [tutorialActive],
  );

  return (
    <>
      <AppBottomSheet
        visible={visible}
        onClose={onClose}
        snapPoints={[SHEET_LOW, SCREEN_HEIGHT - insets.top]}
        topInset={insets.top}
        handleComponent={null}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "transparent" }}
        enablePanDownToClose={!tutorialActive}
        enableContentPanningGesture={!tutorialActive}
        enableHandlePanningGesture={!tutorialActive}
      >
        <View style={{ flex: 1, position: "relative" }}>
          {profile && (
            <GestureDetector gesture={horizontalPan}>
              <Animated.View
                pointerEvents={tutorialActive ? "none" : "auto"}
                style={[{ flex: 1 }, animatedStyle]}
              >
                <BottomSheetScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 0 }}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  nestedScrollEnabled
                  scrollEnabled={!tutorialActive}
                >
                  <SwipeCard
                    profile={profile}
                    previewMode
                    expanded
                    hideChevron
                    hideSuperLike
                    onPass={() => triggerAction("left")}
                    onLike={() => triggerAction("right")}
                  />
                </BottomSheetScrollView>
                <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />
              </Animated.View>
            </GestureDetector>
          )}
        </View>
      </AppBottomSheet>

      <Modal
        visible={visible && tutorialActive}
        transparent
        statusBarTranslucent
        animationType="none"
      >
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
            },
            tutorialOverlayStyle,
          ]}
        >
          <Animated.View style={leftArrowStyle}>
            <ArrowLeft size={64} color={colors.text} strokeWidth={1.5} />
          </Animated.View>
          <Animated.View style={rightArrowStyle}>
            <ArrowRight size={64} color={colors.text} strokeWidth={1.5} />
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}
