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
import { LinearGradient } from "expo-linear-gradient";
import {
  KeyboardStickyView,
  useReanimatedKeyboardAnimation,
} from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginForm } from "@/shared/schemas/formSchemas";
import { colors, gradients } from "../../../shared/theme/colors";

export default function LoginScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Login'>) {
  const [showPassword, setShowPassword] = useState(false);

  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => (s as any).auth);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value / 10 }],
  }));

  const { control, handleSubmit } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const handleLogin = handleSubmit(async ({ email, password }) => {
    Keyboard.dismiss();
    try {
      await (dispatch(login({ email, password })) as any).unwrap();
    } catch (e) {
      console.log("Login error:", e);
    }
  });

  return (
    <View className="flex-1 bg-bg">
      <Animated.View style={[{ flex: 1 }, liftStyle]}>
        {/* Header */}
        <View className="bg-bg pt-16 pb-6 px-6">
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.goBack()}
            className="flex-row items-center"
          >
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
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
              <Text className="text-4xl font-bold text-white">Giriş Yap.</Text>

              {/* Error Message */}
              {error ? (
                <View className="mt-2">
                  <Text className="text-[18px] font-normal text-red-500 mb-6">
                    {error}.
                  </Text>
                </View>
              ) : (
                <Text className="text-[18px] font-normal text-gray-400 mb-6 mt-2">
                  Giriş yapmak için E-Mail ve şifreni kullan.
                </Text>
              )}
            </View>

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-white text-lg font-semibold mb-2">
                E-Mail
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
                    placeholder="ornek@universite.edu.tr"
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!loading}
                  />
                )}
              />
            </View>

            {/* Password Input */}
            <View className="mb-6">
              <Text className="text-white text-lg font-semibold mb-2">
                Şifre
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
                      className="flex-1 text-[18px] text-white"
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary}
                      value={value}
                      onChangeText={onChange}
                      secureTextEntry={!showPassword}
                      editable={!loading}
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
                      <Eye size={24} strokeWidth={1.5} color={colors.neutral200} />
                    ) : (
                      <EyeOff size={24} strokeWidth={1.5} color={colors.neutral200} />
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity activeOpacity={1} className="mb-4">
              <Text className="font-normal text-gray-400 text-[15px]">
                Şifreni mi unutttun?{" "}
                <Text className="font-semibold underline text-white">
                  Buradan sıfırla
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>

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
            }}
          >
            <LinearGradient
              colors={gradients.neutralFade}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="py-3.5"
            >
              {loading ? (
                <ActivityIndicator className="py-[17.5px]" color="#000" />
              ) : (
                <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                  Giriş Yap
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
