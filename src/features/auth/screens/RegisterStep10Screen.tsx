import { useRef } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Check, InfoIcon } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { interestedInSchema, InterestedInForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

// Backend InterestedIn enumName ("Men"/"Women"/"NonBinary") bekliyor.

const AnimatedPressable = ({ onPress, style, activeOpacity = 1, children }: any) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={activeOpacity} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} style={style}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RegisterStep10Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep10'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const OPTIONS = [
    { enumName: "Men", label: t('auth.step10.male') },
    { enumName: "Women", label: t('auth.step10.female') },
    { enumName: "NonBinary", label: t('auth.step10.nonBinary') },
  ];
  const profile = useAppSelector((s) => (s as any).profile || {});

  const initial =
    Array.isArray(profile.interestedIn) && profile.interestedIn.length > 0
      ? profile.interestedIn.filter((v: any) => typeof v === "string")
      : [];

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<InterestedInForm>({
    resolver: zodResolver(interestedInSchema),
    defaultValues: { interestedIn: initial },
  });

  const selected = watch("interestedIn");

  const toggle = (enumName: string) => {
    const next = selected.includes(enumName)
      ? selected.filter((v) => v !== enumName)
      : [...selected, enumName];
    setValue("interestedIn", next, { shouldValidate: true });
  };

  const handleNext = handleSubmit(({ interestedIn }) => {
    dispatch(updateMultipleFields({ interestedIn }));
    navigation.navigate("RegisterStep12");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
          <RegisterBackButton onPress={() => navigation.goBack()} />
        </View>
      </View>

      <RegisterProgressBar step={10} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step10.title')}</Text>
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step10.description')}
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {OPTIONS.map((opt) => {
            const active = selected.includes(opt.enumName);
            return (
              <AnimatedPressable
                key={opt.enumName}
                onPress={() => toggle(opt.enumName)}
                style={{
                  borderRadius: 30,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: active ? colors.inverseSurface : colors.hairline,
                  backgroundColor: active ? colors.inverseSurface : "transparent",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  position: "relative",
                }}
              >
                <Text style={{ color: active ? colors.bg : colors.text, fontSize: 17, fontWeight: "600" }}>{opt.label}</Text>
                {active && (
                  <View pointerEvents="none" style={{ position: "absolute", right: 20, top: 0, bottom: 0, justifyContent: "center" }}>
                    <SFIcon name="checkmark" fallback={Check} size={20} color={colors.bg} strokeWidth={2.5} weight="bold" />
                  </View>
                )}
              </AnimatedPressable>
            );
          })}
        </View>

        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <SFIcon name="info.circle" fallback={InfoIcon} size={16} color={colors.textSecondary} />
          <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
            {t('auth.step10.infoText')}
          </Text>
        </View>

        {errors.interestedIn ? (
          <Text style={{ color: colors.error, textAlign: "center", marginTop: 20, fontSize: 14 }}>
            {errors.interestedIn.message}
          </Text>
        ) : null}
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={{ paddingHorizontal: 32, paddingBottom: 32, paddingTop: 16, backgroundColor: colors.bg }}>
          <AnimatedPressableShared onPress={handleNext} style={{ borderRadius: 999, overflow: "hidden", backgroundColor: colors.inverseSurface }}>
            <Text style={{ color: colors.onInverseSurface, paddingVertical: 20, fontWeight: "700", fontSize: 15, textAlign: "center" }}>
              {t('common.continueButton')}
            </Text>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
