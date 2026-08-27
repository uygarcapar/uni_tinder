import { useRef, useState } from "react";
import {
  View,
  Text,
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
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { heightSchema, HeightForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 220;
const RANGE = MAX_HEIGHT - MIN_HEIGHT;
// Cetvelin kutu kenarlarından içeri çekildiği pay: çentikler ve imleç kenara
// dayanmıyor, uçtaki değerler de kutunun köşesine sıkışmıyor. Çentik şeridi,
// imleç ve dolu alan AYNI payı kullanmak zorunda — biri kayarsa imleç
// çizgisi çentiklerle hizasını kaybeder.
const RULER_INSET = 20;

export default function RegisterStep12Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep12'>) {
  const { t } = useTranslation();
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

  // Slider width — onLayout ile ölçülür. Ref pan responder closure'ı için
  // (stable), state ise imleç/dolgu konumunu piksel olarak çizebilmek için:
  // kenar payı yüzde matematiğine sığmıyor, ölçülen genişlik gerekiyor.
  const sliderWidthRef = useRef(0);
  const [sliderWidth, setSliderWidth] = useState(0);
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
        // Sürükleme de kenar payından arındırılmış eksene göre: parmak
        // cetvelin çizili bölümü kadar yol alınca tam RANGE değişsin.
        const usable = sliderWidthRef.current - RULER_INSET * 2;
        if (usable <= 0) return;
        const deltaCm = Math.round((gestureState.dx / usable) * RANGE);
        const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartHeightRef.current + deltaCm));
        applyHeight(newH);
      },
      onPanResponderRelease: startShrink,
      onPanResponderTerminate: startShrink,
    }),
  ).current;

  // İmlecin piksel konumu — çentik şeridiyle aynı daraltılmış eksende.
  const rulerUsable = Math.max(0, sliderWidth - RULER_INSET * 2);
  const thumbX = RULER_INSET + ((height - MIN_HEIGHT) / RANGE) * rulerUsable;

  const handleNext = handleSubmit(({ height: h }) => {
    Keyboard.dismiss();
    dispatch(updateMultipleFields({ height: h, bio: "" }));
    navigation.navigate("RegisterStep13");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <RegisterProgressBar step={12} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step12.title')}</Text>
            <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
              {t('auth.step12.description')}
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-[14px] font-semibold mb-2" style={{ color: colors.neutral200 }}>{t('auth.step12.heightLabel')}</Text>
            <View
              {...panResponder.panHandlers}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                sliderWidthRef.current = w;
                setSliderWidth(w);
              }}
              style={{ position: "relative" }}
            >
              {/* Thumb */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -4,
                  bottom: -4,
                  left: thumbX,
                  width: 3,
                  marginLeft: -1.5,
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
                  borderColor: errors.height ? colors.error : colors.hairline,
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    // Dolgu kutunun sol kenarından başlıyor ama imleçte bitiyor:
                    // ikisi ayrı referans kullanırsa dolgunun ucu çizgiden kayar.
                    width: thumbX,
                    backgroundColor: colors.shimmer,
                  }}
                />
                {/* Cetvel */}
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: RULER_INSET, right: RULER_INSET, bottom: 5, height: 6, flexDirection: "row", justifyContent: "space-between" }}
                >
                  {Array.from({ length: RANGE + 1 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 1,
                        height: i % 10 === 0 ? 8 : 5,
                        backgroundColor: i % 10 === 0 ? colors.hairlineMuted : colors.hairlineStrong,
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
            <Text className="text-center font-normal mb-3 mt-4" style={{ color: colors.error }}>
              {errors.height.message}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }}
          >
            <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
              {t('common.continueButton')}
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
