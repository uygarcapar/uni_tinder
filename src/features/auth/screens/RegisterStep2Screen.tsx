import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import { OtpInput, type OtpInputRef } from "react-native-otp-entry";
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
import { Mail, RotateCcw, ArrowLeft, Check, Clock } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, ink } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import { parseRetryAfterSeconds } from '@/features/auth/verificationRetry';
import { extractOtp, OTP_LENGTH } from '@/features/auth/otpCode';

/** Backend retryAfterSeconds döndürmezse kullanılan yerel bekleme süresi. */
const RESEND_COOLDOWN_SECONDS = 60;

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
  // "sent" = mail gerçekten yeniden gitti (CODE_SENT), "pending" = cooldown
  // içindeyiz, backend maili tekrar YOLLAMADI (CODE_PENDING). İkisi de
  // isSuccess:true döndüğü için ayrımı `result.status`'tan yapıyoruz — aksi
  // halde kullanıcıya gitmemiş bir maili beklettiriyoruz.
  const [resendToast, setResendToast] = useState<null | "sent" | "pending">(null);
  // Backend "şu kadar saniye sonra tekrar iste" diyorsa (CODE_PENDING'de kod
  // hâlâ geçerli olduğu için) geri sayım oradan başlar; söylemiyorsa 0.
  const [countdown, setCountdown] = useState(route?.params?.retryAfterSeconds ?? 0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  // onFilled + "Doğrula" butonu aynı anda tetiklenebildiği için (yapıştırma
  // otomatik istek atıyor) setLoading'in async'liğine güvenmiyoruz.
  const submittingRef = useRef(false);

  const dispatch = useAppDispatch();

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleVerify = async (verificationCode: string | null = null) => {
    Keyboard.dismiss();
    const finalCode = verificationCode || code;
    if (finalCode.length !== OTP_LENGTH) {
      setError(t('auth.step2.validation.codeRequired'));
      return;
    }
    if (submittingRef.current) return;

    submittingRef.current = true;
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
      submittingRef.current = false;
      setLoading(false);
    }
  };

  /**
   * Native input'tan gelen ham metni temizleyip kütüphaneye ref üzerinden
   * yazar. setValue → kütüphanenin handleTextChange'i → onTextChange +
   * onFilled zinciri çalıştığı için 6 hane dolduğunda doğrulama isteği
   * kendiliğinden gider.
   */
  const handleOtpChange = useCallback((raw: string) => {
    otpRef.current?.setValue(extractOtp(raw));
  }, []);

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    setResendToast(null);
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
        setResendToast(response?.result?.status === "CODE_PENDING" ? "pending" : "sent");
        setCountdown(parseRetryAfterSeconds(response) ?? RESEND_COOLDOWN_SECONDS);
        setTimeout(() => setResendToast(null), 1500);
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
    <View className="flex-1 -mt-[100px]" style={{ backgroundColor: colors.bg }}>
      {resendToast && (
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
              borderColor: colors.hairlineStrong,
              paddingHorizontal: 20,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            {resendToast === "pending" ? (
              <SFIcon name="clock" fallback={Clock} size={20} color={colors.text} strokeWidth={2} weight="bold" />
            ) : (
              <SFIcon name="checkmark" fallback={Check} size={20} color={colors.text} strokeWidth={3} weight="bold" />
            )}
            <Text className="text-[15px] font-medium" style={{ color: colors.text }}>
              {resendToast === "pending"
                ? t('auth.step2.resendPending', { seconds: countdown })
                : t('auth.step2.resendSuccess')}
            </Text>
          </View>
        </View>
      )}

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 48,
          }}
        >
          <View className="items-center flex flex-col gap-10 p-8">
            <SFIcon name="envelope" fallback={Mail} strokeWidth={1} size={140} color={colors.text} />
            <View>
              <Text className="text-3xl font-bold mb-3 text-center" style={{ color: colors.text }}>
                {t('auth.step2.title')}
              </Text>
              <Text className="text-[18px] text-center" style={{ color: ink(0.8) }}>
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
                ref={otpRef}
                numberOfDigits={OTP_LENGTH}
                type="numeric"
                disabled={loading}
                onTextChange={(text) => {
                  setCode(text);
                  setError("");
                }}
                onFilled={(text) => handleVerify(text)}
                textInputProps={{
                  textContentType: "oneTimeCode",
                  autoComplete:
                    Platform.OS === "android" ? "sms-otp" : "one-time-code",
                  // Kütüphanenin maxLength'i ve numeric filtresi yapıştırmayı
                  // yiyordu; ham metni alıp extractOtp'tan geçiriyoruz.
                  maxLength: undefined,
                  onChangeText: handleOtpChange,
                  // caretHidden caret dikdörtgenini CGRectZero yapıyor, uzun
                  // basınca çıkan Yapıştır menüsü de ona göre konumlandığı için
                  // görünmez oluyordu. Caret'i açık bırakıp rengini şeffaf
                  // yapıyoruz — menü doğru yerde çıkıyor, imleç görünmüyor.
                  caretHidden: false,
                  selectionColor: "transparent",
                }}
                theme={{
                  containerStyle: { justifyContent: "center", gap: 4 },
                  pinCodeContainerStyle: {
                    width: 48,
                    height: 64,
                    borderRadius: 15,
                    borderCurve: "continuous",
                    backgroundColor: colors.surface,
                    borderWidth: error ? 1 : 0,
                    borderColor: error ? colors.error : "transparent",
                  },
                  focusedPinCodeContainerStyle: {
                    borderWidth: error ? 1 : 0,
                    borderColor: error ? colors.error : "transparent",
                  },
                  pinCodeTextStyle: {
                    // Kutunun zemini colors.surface (medya değil) → metin de
                    // tema metin rengi olmalı. onMedia her modda beyaz olduğu
                    // için açık modda gri kutuda görünmüyordu.
                    color: colors.text,
                    fontSize: 30,
                    fontWeight: "600",
                  },
                  focusStickStyle: { backgroundColor: colors.inverseSurface },
                }}
              />
            </View>

            <View className="flex-row mb-3 justify-center items-center gap-4 py-[15px] pt-0 rounded-full overflow-hidden">
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
                    <Text className="font-medium" style={{ color: colors.neutral200 }}>
                      {t('auth.step2.resendCountdown', { countdown })}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row py-[2px] items-center gap-2">
                    <SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={16} color={colors.text} strokeWidth={2.5} weight="bold" />
                    <Text className="font-medium" style={{ color: colors.text }}>
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
                opacity: loading || code.length < OTP_LENGTH ? 0.5 : 1,
                backgroundColor: colors.inverseSurface,
              }}
              onPress={() => handleVerify()}
              disabled={loading || code.length < OTP_LENGTH}
            >
              {loading ? (
                <ActivityIndicator className="py-[20px]" color={colors.onInverseSurface} />
              ) : (
                <Text className="py-[20px] text-center font-medium text-[15px]" style={{ color: colors.onInverseSurface }}>
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
                borderColor: colors.hairlineStrong,
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 18,
                paddingVertical: 18,
              }}
            >
              <SFIcon name="arrow.left" fallback={ArrowLeft} size={16} color={colors.text} strokeWidth={2.5} weight="bold" />
              <Text className="font-medium" style={{ color: colors.text }}>{t('auth.step2.backButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
