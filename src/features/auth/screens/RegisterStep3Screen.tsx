import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Eye, EyeOff } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { passwordSchema, PasswordForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

export default function RegisterStep3Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep3'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { password, confirmPassword } = useAppSelector(
    (s) => (s as any).auth.registrationForm,
  );

  const passwordInputRef = useRef<any>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: password || "", confirmPassword: confirmPassword || "" },
  });

  const error = errors.password?.message || errors.confirmPassword?.message;

  const handleNext = handleSubmit(({ password: pw, confirmPassword: cpw }) => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "password", value: pw }));
    dispatch(updateRegistrationField({ field: "confirmPassword", value: cpw }));
    navigation.navigate("RegisterStep5");
  });

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-bg pt-16 pb-6 px-6">
        <RegisterBackButton
          onPress={() =>
            Alert.alert(
              t('auth.step3.confirmCancel.title'),
              t('auth.step3.confirmCancel.message'),
              [
                { text: t('common.no'), style: "cancel" },
                {
                  text: t('common.yes'),
                  style: "destructive",
                  onPress: () => navigation.navigate("Welcome"),
                },
              ],
            )
          }
        />
      </View>

      <RegisterProgressBar step={3} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white mb-8">
              {t('auth.step3.title')}
            </Text>
          </View>

          {/* Şifre Input */}
          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
              {t('auth.step3.passwordLabel')}
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: error ? colors.error : "rgba(255,255,255,0.1)",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
              }}
            >
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    ref={passwordInputRef}
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder={t('auth.step3.passwordPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={!showPassword}
                  />
                )}
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowPassword(!showPassword)}
              >
                <View pointerEvents="none">
                  {showPassword ? (
                    <SFIcon name="eye.fill" fallback={Eye} size={24} strokeWidth={1.5} color={colors.neutral200} />
                  ) : (
                    <SFIcon name="eye.slash.fill" fallback={EyeOff} size={24} strokeWidth={1.5} color={colors.neutral200} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Şifre Tekrar Input */}
          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
              {t('auth.step3.confirmLabel')}
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: error ? colors.error : "rgba(255,255,255,0.1)",
              }}
            >
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder={t('auth.step3.confirmPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    secureTextEntry={!showPassword}
                  />
                )}
              />
            </View>
          </View>

          {/* Error Message */}
          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.text,
            }}
          >
            <Text className="text-black py-[20px] font-bold text-[15px] text-center">
              {t('common.continueButton')}
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
