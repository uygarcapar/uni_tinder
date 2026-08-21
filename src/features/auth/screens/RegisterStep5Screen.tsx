import { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { firstNameSchema, FirstNameForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

export default function RegisterStep5Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep5'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { firstName } = useAppSelector(
    (s) => (s as any).auth.registrationForm,
  );
  const firstNameInputRef = useRef<any>(null);

  const { control, handleSubmit, formState: { errors } } = useForm<FirstNameForm>({
    resolver: zodResolver(firstNameSchema),
    defaultValues: { firstName: firstName || "" },
  });

  const handleNext = handleSubmit(({ firstName: name }) => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "firstName", value: name }));
    navigation.navigate("RegisterStep6");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <RegisterProgressBar step={5} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold" style={{ color: colors.text }}>
              {t('auth.step5.title')}
            </Text>
            <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
              {t('auth.step5.description')}
            </Text>
          </View>

          <View className="w-full mb-4">
            <Text className="text-[14px] font-semibold mb-2" style={{ color: colors.neutral200 }}>
              {t('auth.step5.nameLabel')}
            </Text>
            <Controller
              control={control}
              name="firstName"
              render={({ field: { onChange, value } }) => (
                <View
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    borderWidth: 0.5,
                    borderColor: errors.firstName
                      ? colors.error
                      : colors.hairline,
                  }}
                >
                  <TextInput
                    ref={firstNameInputRef}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder={t('auth.step5.namePlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                  />
                </View>
              )}
            />
          </View>

          {errors.firstName ? (
            <Text className="text-center font-normal mb-3 mt-4" style={{ color: colors.error }}>
              {errors.firstName.message}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.inverseSurface,
            }}
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
