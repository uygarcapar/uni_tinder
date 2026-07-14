import { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  PanResponder,
  Animated,
  Easing,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import * as Haptics from "expo-haptics";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { heightSchema, HeightForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 220;
const RANGE = MAX_HEIGHT - MIN_HEIGHT;

export default function RegisterStep12Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep12'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const initialHeight =
    typeof profile.height === "number" &&
    profile.height >= MIN_HEIGHT &&
    profile.height <= MAX_HEIGHT
      ? profile.height
      : 170;

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<HeightForm>({
    resolver: zodResolver(heightSchema),
    defaultValues: { height: initialHeight },
  });

  const height = watch("height");

  // Slider width — onLayout ile ölçülür, pan responder closure içinde ref olarak okunur.
  const sliderWidthRef = useRef(0);
  const lastHapticHeightRef = useRef(initialHeight);
  const dragStartHeightRef = useRef(initialHeight);
  const valueScale = useRef(new Animated.Value(1)).current;
  const shrinkTimerRef = useRef<any>(null);
  const isScaledUpRef = useRef(false);

  const applyHeight = (newH: number) => {
    if (newH !== lastHapticHeightRef.current) {
      lastHapticHeightRef.current = newH;
      setValue("height", newH, { shouldValidate: false });
      Haptics.selectionAsync().catch(() => {});
      if (!isScaledUpRef.current) {
        isScaledUpRef.current = true;
        Animated.timing(valueScale, {
          toValue: 1.15,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
    }
  };

  const startShrink = () => {
    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    shrinkTimerRef.current = setTimeout(() => {
      isScaledUpRef.current = false;
      Animated.timing(valueScale, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 250);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = lastHapticHeightRef.current;
        if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      },
      onPanResponderMove: (_e, gestureState) => {
        const w = sliderWidthRef.current;
        if (w === 0) return;
        const deltaCm = Math.round((gestureState.dx / w) * RANGE);
        const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeightRef.current + deltaCm));
        applyHeight(newH);
      },
      onPanResponderRelease: startShrink,
      onPanResponderTerminate: startShrink,
    }),
  ).current;

  const handleNext = handleSubmit(({ height: h }) => {
    Keyboard.dismiss();
    dispatch(updateMultipleFields({ height: h, bio: "" }));
    navigation.navigate("RegisterStep13");
  });

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-bg pt-16 pb-6 px-6">
        <TouchableOpacity activeOpacity={1} onPress={() => navigation.goBack()} className="flex-row items-center">
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={12} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Boyun.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Boyunu gir. Sürükleyerek ayarlayabilirsin.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">Boy (cm) *</Text>
            <View
              {...panResponder.panHandlers}
              onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
              style={{ position: "relative" }}
            >
              {/* Thumb */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -4,
                  bottom: -4,
                  left: `${((height - MIN_HEIGHT) / RANGE) * 100}%`,
                  width: 3,
                  marginLeft: -0.75,
                  borderRadius: 2,
                  backgroundColor: colors.textDisabled,
                  zIndex: 0,
                }}
              />
              <View
                style={{
                  borderRadius: 25,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: errors.height ? colors.error : "rgba(255,255,255,0.1)",
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${((height - MIN_HEIGHT) / RANGE) * 100}%`,
                    backgroundColor: "rgba(255,255,255,0.07)",
                  }}
                />
                {/* Cetvel */}
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: 0, right: 0, bottom: 5, height: 6, flexDirection: "row", justifyContent: "space-between" }}
                >
                  {Array.from({ length: RANGE + 1 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 1,
                        height: i % 10 === 0 ? 8 : 5,
                        backgroundColor: i % 10 === 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.15)",
                        alignSelf: "flex-end",
                      }}
                    />
                  ))}
                </View>
                <View pointerEvents="none" style={{ paddingHorizontal: 20, paddingVertical: 20, alignItems: "center", justifyContent: "center" }}>
                  <Animated.Text
                    style={{
                      color: colors.text,
                      fontSize: 22,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                      transform: [{ scale: valueScale }],
                      zIndex: 1,
                    }}
                  >
                    {height} cm
                  </Animated.Text>
                </View>
              </View>
            </View>
          </View>
          {/* Error Message */}
          {errors.height ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {errors.height.message}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-bg">
          <AnimatedPressable
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.messageOwn }}
          >
            <Text className="text-white py-[20px] font-bold text-[15px] text-center">
              Devam Et
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
