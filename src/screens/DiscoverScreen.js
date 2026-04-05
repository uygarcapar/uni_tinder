import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  interpolate,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { X, Check, Flame } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur"; // BlurView eklendi
import MaskedView from "@react-native-masked-view/masked-view";
import SwipeWrapper from "../components/SwipeWrapper";
import SwipeOverlay from "../components/SwipeOverlay";

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);
import {
  fetchPotentialMatches,
  performLike,
  performPass,
  nextCard,
  loadMoreProfiles,
} from "../store/slices/swipeSlice";

const AnimatedFlameLoader = () => {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 700 }),
        withTiming(1, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View className="flex-1 justify-center items-center bg-[#121212]">
      <Animated.View className="mb-[90px]" style={animatedStyle}>
        <MaskedView
          style={{ width: 80, height: 80 }}
          maskElement={
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "transparent",
              }}
            >
              <Flame size={80} color="white" fill="white" strokeWidth={1.5} />
            </View>
          }
        >
          <LinearGradient
            colors={["#fc0341", "#FF4D4D", "#fca326"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1 }}
          />
        </MaskedView>
      </Animated.View>
    </View>
  );
};

export default function DiscoverScreen() {
  const dispatch = useDispatch();
  const { potentialMatches, currentIndex, loading, hasNextPage, loadingMore } =
    useSelector((state) => state.swipe);

  const [isSwiping, setIsSwiping] = useState(false);

  const dragX = useSharedValue(0);
  const overlayDragX = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);
  const buttonDragX = useSharedValue(0);
  const programmaticSwipe = useSharedValue(0);

  // Blur görünmesi için katı #1E1E1E renkleri saydam RGBA'ya çevrildi.
  // Aktif gradyan renklerine de hafif bir alpha (0.85) eklendi ki cam hissiyatı korunsun.
  const likeGradientProps = useAnimatedProps(() => {
    const color1 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["rgba(255, 255, 255, 0.05)", "rgba(0, 180, 216, 0.85)"],
    );
    const color2 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["rgba(255, 255, 255, 0.05)", "rgba(61, 255, 175, 0.85)"],
    );
    const color3 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["rgba(255, 255, 255, 0.05)", "rgba(5, 255, 0, 0.85)"],
    );
    return { colors: [color1, color2, color3] };
  });

  const passGradientProps = useAnimatedProps(() => {
    const color1 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["rgba(255, 42, 95, 0.85)", "rgba(255, 255, 255, 0.05)"],
    );
    const color2 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["rgba(255, 77, 77, 0.85)", "rgba(255, 255, 255, 0.05)"],
    );
    const color3 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["rgba(255, 142, 83, 0.85)", "rgba(255, 255, 255, 0.05)"],
    );
    return { colors: [color1, color2, color3] };
  });

  // İkon renkleri tamamen senin orijinal tasarımınla aynı bırakıldı
  const likeIconGradientProps = useAnimatedProps(() => {
    const color1 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["#00FFFF", "#000000"],
    );
    const color2 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["#3DFFAF", "#000000"],
    );
    const color3 = interpolateColor(
      buttonDragX.value,
      [0, 100],
      ["#04ff00", "#000000"],
    );
    return { colors: [color1, color2, color3] };
  });

  const passIconGradientProps = useAnimatedProps(() => {
    const color1 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["#000000", "#fc0341"],
    );
    const color2 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["#000000", "#FF4D4D"],
    );
    const color3 = interpolateColor(
      buttonDragX.value,
      [-100, 0],
      ["#000000", "#ffef42"],
    );
    return { colors: [color1, color2, color3] };
  });

  const likeButtonScale = useAnimatedStyle(() => {
    const scale = interpolate(
      buttonDragX.value,
      [-100, 0, 100],
      [0.92, 1, 1.08],
    );
    return { transform: [{ scale }] };
  });

  const passButtonScale = useAnimatedStyle(() => {
    const scale = interpolate(
      buttonDragX.value,
      [-100, 0, 100],
      [1.08, 1, 0.92],
    );
    return { transform: [{ scale }] };
  });

  useEffect(() => {
    dispatch(fetchPotentialMatches(1));
  }, []);

  useEffect(() => {
    const remainingCards = potentialMatches.length - currentIndex;
    if (remainingCards === 3 && hasNextPage && !loadingMore) {
      dispatch(loadMoreProfiles());
    }
  }, [currentIndex, hasNextPage, loadingMore, potentialMatches.length]);

  const handleSwipe = (direction, userId) => {
    dispatch(nextCard());
    if (direction === "right") dispatch(performLike(userId));
    else dispatch(performPass(userId));
  };

  if (loading && potentialMatches.length === 0) {
    return <AnimatedFlameLoader />;
  }

  const renderStack = () => {
    return potentialMatches
      .slice(currentIndex, currentIndex + 2)
      .reverse()
      .map((profile, index, array) => {
        const isTopCard = index === array.length - 1;
        return (
          <SwipeWrapper
            key={profile.userId}
            profile={profile}
            isTopCard={isTopCard}
            onSwipe={handleSwipe}
            dragX={dragX}
            overlayDragX={overlayDragX}
            overlayOpacity={overlayOpacity}
            buttonDragX={buttonDragX}
            programmaticSwipe={programmaticSwipe}
          />
        );
      });
  };

  const handlePassButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;

    setIsSwiping(true);
    programmaticSwipe.value = 1;

    setTimeout(() => {
      setIsSwiping(false);
    }, 1000);
  };

  const handleLikeButton = () => {
    if (isSwiping || potentialMatches.length <= currentIndex) return;

    setIsSwiping(true);
    programmaticSwipe.value = 2;

    setTimeout(() => {
      setIsSwiping(false);
    }, 1000);
  };

  return (
    <GestureHandlerRootView className="flex-1 bg-[#121212]">
      <View className="flex-1 pt-1 pb-1">
        {potentialMatches.length > currentIndex ? (
          <View className="flex-1 relative">
            {renderStack()}
            <SwipeOverlay dragX={overlayDragX} opacity={overlayOpacity} />

            <View
              className="absolute bottom-4 left-0 right-0 flex-row justify-center items-center gap-[60px]"
              style={{ zIndex: 100 }}
              pointerEvents="box-none"
            >
              {/* PASS BUTTON */}
              <Animated.View style={passButtonScale}>
                <TouchableOpacity
                  onPress={handlePassButton}
                  activeOpacity={0.9}
                  disabled={isSwiping}
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 8,
                    zIndex: 100,
                  }}
                >
                  <View
                    style={{
                      borderRadius: 9999,
                      width: 75,
                      height: 75,
                      overflow: "hidden",
                    }}
                  >
                    {/* Arkaplanı Blur Yapan Katman */}
                    <BlurView
                      intensity={70}
                      tint="dark"
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                      }}
                    />

                    {/* Üstteki Animasyonlu Gradyan (Transparan olduğu için altındaki blur'u gösterir) */}
                    <AnimatedLinearGradient
                      animatedProps={passGradientProps}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaskedView
                        maskElement={
                          <X size={45} color="white" strokeWidth={4} />
                        }
                        style={{ width: 45, height: 45 }}
                      >
                        <AnimatedLinearGradient
                          animatedProps={passIconGradientProps}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ width: 45, height: 45 }}
                        />
                      </MaskedView>
                    </AnimatedLinearGradient>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* LIKE BUTTON */}
              <Animated.View style={likeButtonScale}>
                <TouchableOpacity
                  onPress={handleLikeButton}
                  activeOpacity={0.9}
                  disabled={isSwiping}
                  style={{
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 8,
                    zIndex: 100,
                  }}
                >
                  <View
                    className=""
                    style={{
                      borderRadius: 9999,
                      width: 75,
                      height: 75,
                      overflow: "hidden",
                      borderCurve: "continuous",
                    }}
                  >
                    {/* Arkaplanı Blur Yapan Katman */}
                    <BlurView
                      intensity={70}
                      tint="dark"
                      style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                      }}
                    />

                    {/* Üstteki Animasyonlu Gradyan */}
                    <AnimatedLinearGradient
                      animatedProps={likeGradientProps}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{
                        width: "100%",
                        height: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <MaskedView
                        maskElement={
                          <Check size={45} color="white" strokeWidth={4} />
                        }
                        style={{ width: 45, height: 45 }}
                      >
                        <AnimatedLinearGradient
                          animatedProps={likeIconGradientProps}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ width: 45, height: 45 }}
                        />
                      </MaskedView>
                    </AnimatedLinearGradient>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center mb-20">
            <Flame size={80} color="#6B7280" strokeWidth={2} />
            <Text className="text-gray-500 font-bold text-[13px] mt-2">
              Yeni profiller için bekle.
            </Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
