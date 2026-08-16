import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { login } from "@/features/auth/authSlice";
import { Eye, EyeOff } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import { devLog } from '@/shared/utils/devLog';

export default function LoginScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Login'>) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => (s as any).auth);

  const { control, handleSubmit } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleLogin = handleSubmit(async ({ email, password }) => {
    Keyboard.dismiss();
    try {
      await (dispatch(login({ email, password })) as any).unwrap();
    } catch (e) {
      devLog("Login error:", e);
    }
  });

  return (
    <View className="flex-1 bg-bg">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View className="bg-bg pt-16 pb-6 px-6">
          <RegisterBackButton onPress={() => navigation.goBack()} />
        </View>

        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View
            style={{
              flex: 1,
              paddingHorizontal: 24,
              paddingVertical: 24,
              paddingTop: 0,
            }}
          >
            <View className="flex flex-col gap-2">
              <Text className="text-4xl font-bold text-white">{t('auth.login.title')}</Text>

              {/* Error Message */}
              {error ? (
                <View className="mt-2">
                  <Text className="text-[18px] font-normal text-red-500 mb-6">
                    {error}.
                  </Text>
                </View>
              ) : (
                <Text className="text-[18px] font-normal text-gray-400 mb-6 mt-2">
                  {t('auth.login.description')}
                </Text>
              )}
            </View>

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-white text-lg font-semibold mb-2">
                {t('auth.login.emailLabel')}
              </Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                    }}
                    className={`border-[0.5px] px-4 py-5 text-[18px] text-white ${
                      error ? "border-red-500" : "border-white/10 "
                    }`}
                    placeholder={t('auth.login.emailPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                )}
              />
            </View>

            {/* Password Input */}
            <View className="mb-6">
              <Text className="text-white text-lg font-semibold mb-2">
                {t('auth.login.passwordLabel')}
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                className={`border-[0.5px] px-4 py-[14.5px] flex-row items-center ${
                  error ? "border-red-500" : "border-white/10"
                }`}
              >
                <Controller
                  control={control}
                  name="password"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      ref={passwordRef}
                      className="flex-1 text-[18px] text-white"
                      placeholder={t('auth.login.passwordPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry={!showPassword}
                      editable={!loading}
                      returnKeyType="go"
                      onSubmitEditing={handleLogin}
                    />
                  )}
                />
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowPassword(!showPassword)}
                  className=""
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
          </View>
        </TouchableWithoutFeedback>
      </View>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-8 pb-8 pt-4 bg-bg">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleLogin}
            disabled={loading}
            className="rounded-full overflow-hidden"
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.messageOwn,
            }}
          >
            {loading ? (
              <ActivityIndicator className="py-[17.5px]" color="#fff" />
            ) : (
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                {t('auth.login.submitButton')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
