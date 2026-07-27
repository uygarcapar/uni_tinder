import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { OtpInput } from "react-native-otp-entry";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { authService } from "@/features/auth/authService";
import {
  setUser,
  clearVerification,
  logout,
  setEmailVerifiedToken,
} from "@/features/auth/authSlice";
import { Mailbox, RotateCcw, ArrowLeft, Check } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

export default function RegisterStep2Screen({ route, navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep2'>) {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAppSelector((s) => (s as any).auth);
  const email = route?.params?.email || user?.email;
  const isRegistrationMode = route?.params?.mode === "registration";
  const isPending = route?.params?.pending === true;

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const dispatch = useAppDispatch();

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value / 2 }],
  }));

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerify = async (verificationCode: string | null = null) => {
    Keyboard.dismiss();
    const finalCode = verificationCode || code;
    if (finalCode.length !== 6) {
      setError(t('auth.step2.validation.codeRequired'));
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isRegistrationMode) {
        // New registration flow: verify-email → save token → go to RegisterStep1
        const response = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.VERIFY_EMAIL_REGISTRATION}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code: finalCode }),
          },
        );
        const data = await response.json();

        if (data.isSuccess && data.result?.emailVerifiedToken) {
          dispatch(setEmailVerifiedToken(data.result.emailVerifiedToken));
          navigation.reset({ index: 0, routes: [{ name: "RegisterStep3" }] });
        } else {
          setError(data.message || "Doğrulama başarısız");
        }
      } else {
        // Login flow: verify → setUser → AppNavigator switches to Main
        const response = await authService.verifyEmailCode(email, finalCode);
        if (response.isSuccess) {
          dispatch(setUser({ isVerified: true, isMailVerified: true }));
          dispatch(clearVerification());
        } else {
          setError(response.message || "Doğrulama başarısız");
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || "Kod doğrulanamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    setResendSuccess(false);
    setError("");

    try {
      let response;
      if (isRegistrationMode) {
        const res = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.SEND_VERIFICATION}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          },
        );
        response = await res.json();
      } else {
        response = await authService.resendVerification(email);
      }

      if (response.isSuccess) {
        setResendSuccess(true);
        setCountdown(60);
        setTimeout(() => setResendSuccess(false), 1500);
      } else {
        setError(response.message || "Kod gönderilemedi");
      }
    } catch {
      setError("Kod gönderilemedi");
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoBack = () => {
    if (isLoggingOut) return;
    if (isAuthenticated && !isRegistrationMode) {
      setIsLoggingOut(true);
      dispatch(logout());
    } else {
      dispatch(clearVerification());
      navigation.goBack();
    }
  };

  return (
    <View className="flex-1 bg-bg -mt-[100px]">
      {resendSuccess && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <View
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              backgroundColor: "rgba(30,30,30,0.95)",
              borderWidth: 0.3,
              borderColor: "rgba(255,255,255,0.15)",
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <SFIcon name="checkmark" fallback={Check} size={20} color={colors.text} strokeWidth={3} weight="bold" />
            <Text className="text-white text-[15px] font-medium">
              {t('auth.step2.resendSuccess')}
            </Text>
          </View>
        </View>
      )}

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Animated.View
          style={[
            {
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 48,
            },
            liftStyle,
          ]}
        >
          <View className="items-center flex flex-col gap-10 p-8">
            <SFIcon name="envelope.fill" fallback={Mailbox} strokeWidth={1} size={100} color={colors.text} />
            <View>
              <Text className="text-3xl font-bold text-white mb-3 text-center">
                {t('auth.step2.title')}
              </Text>
              <Text className="text-white/80 text-[15px] text-center">
                {email}
                {isPending
                  ? t('auth.step2.descriptionPending')
                  : t('auth.step2.description')}
              </Text>
            </View>
          </View>

          <View>
            {/* react-native-otp-entry: tek gizli input + stilli kutular — eski el
                yapımı 6-TextInput'un eksiklerini kapatır: iOS Mail'den oneTimeCode
                autofill, panoya kopyalanan kodu yapıştırma, güvenilir backspace
                (onKeyPress Android soft keyboard'da güvenilmezdi). */}
            <View className="mb-8 p-8 py-4">
              <OtpInput
                numberOfDigits={6}
                type="numeric"
                disabled={loading}
                onTextChange={(text) => {
                  setCode(text);
                  setError("");
                }}
                onFilled={(text) => handleVerify(text)}
                textInputProps={{
                  textContentType: "oneTimeCode",
                  autoComplete: "one-time-code",
                }}
                theme={{
                  containerStyle: { justifyContent: "center", gap: 2 },
                  pinCodeContainerStyle: {
                    width: 48,
                    height: 64,
                    borderRadius: 15,
                    borderCurve: "continuous",
                    backgroundColor: colors.surface,
                    borderWidth: error ? 1 : 0,
                    borderColor: error ? "#dc2626" : "transparent",
                  },
                  focusedPinCodeContainerStyle: {
                    borderWidth: error ? 1 : 0,
                    borderColor: error ? "#dc2626" : "transparent",
                  },
                  pinCodeTextStyle: {
                    color: "#fff",
                    fontSize: 24,
                    fontWeight: "600",
                  },
                  focusStickStyle: { backgroundColor: colors.primary },
                }}
              />
            </View>

            <View className="flex-row mb-3 justify-center items-center py-[15px] pt-0 rounded-full overflow-hidden">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleResend}
                disabled={resendLoading || countdown > 0}
              >
                {resendLoading ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : countdown > 0 ? (
                  <View className="flex-row items-center gap-2">
                    <SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={16} color={colors.neutral200} strokeWidth={2.5} weight="bold" />
                    <Text className="text-gray-300 font-medium">
                      {t('auth.step2.resendCountdown', { countdown })}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row py-[2px] items-center gap-2">
                    <SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={16} color={colors.text} strokeWidth={2.5} weight="bold" />
                    <Text className="text-white font-medium">
                      {t('auth.step2.resendButton')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <AnimatedPressable
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                opacity: loading || code.length < 6 ? 0.5 : 1,
                backgroundColor: colors.messageOwn,
              }}
              onPress={() => handleVerify()}
              disabled={loading || code.length < 6}
            >
              {loading ? (
                <ActivityIndicator className="py-[20px]" color="#fff" />
              ) : (
                <Text className="text-white py-[20px] text-center font-medium text-[15px]">
                  {t('auth.step2.verifyButton')}
                </Text>
              )}
            </AnimatedPressable>
          </View>

          <View className="items-center mt-4">
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleGoBack}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "center",
                gap: 6,
                borderWidth: 0,
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 18,
                paddingVertical: 18,
              }}
            >
              <SFIcon name="arrow.left" fallback={ArrowLeft} size={16} color={colors.text} strokeWidth={2.5} weight="bold" />
              <Text className="text-white font-medium">{t('auth.step2.backButton')}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </View>
  );
}
