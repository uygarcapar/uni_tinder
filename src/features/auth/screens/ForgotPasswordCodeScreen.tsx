import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  AppState,
  Platform,
} from "react-native";
import { OtpInput, type OtpInputRef } from "react-native-otp-entry";
import { useForm, useWatch, type Control } from "react-hook-form";
import * as Clipboard from "expo-clipboard";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { authService } from "@/features/auth/authService";
import { Lock, RotateCcw, ArrowLeft, Check, ClipboardPaste } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, ink } from "@/shared/theme/colors";
import { useTranslation } from "react-i18next";
import { parseRetryAfterSeconds } from "@/features/auth/verificationRetry";
import { extractOtp, OTP_LENGTH, type CodeForm } from "@/features/auth/otpCode";
import { devLog } from "@/shared/utils/devLog";

/** ForgotPassword ucu retryAfterSeconds döndürmüyor; yerel bekleme süresi. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * "Devam Et" AYRI bileşen: girilen kodun uzunluğunu (disabled + opacity) yalnız
 * burası bilmek zorunda — RegisterStep2'deki VerifyButton ile aynı gerekçe. Kod
 * ekran state'indeyken her hane 140px kilit ikonunu, başlığı, OTP kutularını ve
 * tekrar-gönder satırını birden yeniden render ediyordu.
 */
function ContinueButton({
  control,
  label,
  onPress,
}: {
  control: Control<CodeForm>;
  label: string;
  onPress: () => void;
}) {
  const code = useWatch({ control, name: "code" }) || "";
  const disabled = code.length < OTP_LENGTH;

  return (
    <AnimatedPressable
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: colors.inverseSurface,
      }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text
        className="py-[20px] text-center font-medium text-[15px]"
        style={{ color: colors.onInverseSurface }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/**
 * Şifre sıfırlama akışının 2. adımı: 6 haneli kod. Ekran yapısı bilinçli olarak
 * RegisterStep2 (e-posta doğrulama) ile aynı — aynı OtpInput teması, yapıştırma
 * ve tekrar-gönder mantığı.
 *
 * TEK FARK: burada kodu SUNUCUYA sormuyoruz. Backend'de "sıfırlama kodunu
 * doğrula" diye ayrı bir uç yok; kod ve yeni şifre `ResetPasswordWithCode`'a
 * TEK istekte gidiyor. Bu yüzden bu ekran kodu yalnız taşır, doğruluğu bir
 * sonraki adımda anlaşılır ve hata oraya düşer (kullanıcı "Kodu tekrar gir" ile
 * buraya döner).
 */
export default function ForgotPasswordCodeScreen({
  route,
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "ForgotPasswordCode">) {
  const { t } = useTranslation();
  const email = route.params.email;

  // Kod ekran state'inde DEĞİL, react-hook-form'da: gövde forma abone
  // olmadığı için hane girmek burayı hiç render etmiyor (bkz. ContinueButton).
  const { control, getValues, setValue } = useForm<CodeForm>({
    defaultValues: { code: "" },
  });
  const [error, setError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendToast, setResendToast] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN_SECONDS);
  const [clipboardHasText, setClipboardHasText] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  // onFilled + "Devam Et" aynı anda tetiklenebiliyor (yapıştırma otomatik
  // ilerletiyor) — çift navigate iki ekran üst üste iterdi.
  const navigatingRef = useRef(false);

  // Kullanıcı yanlış kodla geri döndüğünde tekrar ilerleyebilmeli.
  useEffect(
    () => navigation.addListener("focus", () => { navigatingRef.current = false; }),
    [navigation],
  );

  // Panoda metin var mı? (içeriği okumaz → iOS'ta izin uyarısı çıkmaz)
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      Clipboard.hasStringAsync()
        .then((has) => {
          if (!cancelled) setClipboardHasText(has);
        })
        .catch(() => {});
    };
    check();
    // Kullanıcı kodu mail uygulamasından kopyalayıp geri döndüğünde yakala.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleContinue = (otp: string | null = null) => {
    Keyboard.dismiss();
    const finalCode = otp || getValues("code");
    if (finalCode.length !== OTP_LENGTH) {
      setError(t("auth.forgotPassword.code.validation.codeRequired"));
      return;
    }
    if (navigatingRef.current) return;

    navigatingRef.current = true;
    setError("");
    navigation.navigate("ResetPassword", { email, resetCode: finalCode });
  };

  /**
   * Native input'tan gelen ham metni temizleyip kütüphaneye ref üzerinden
   * yazar — mailden kopyalanan "Kodun: 123456" gibi metinler de çalışsın diye
   * (bkz. otpCode.ts).
   */
  const handleOtpChange = useCallback((raw: string) => {
    otpRef.current?.setValue(extractOtp(raw));
  }, []);

  /** Uzun basma menüsü çıkmadığında da çalışan garantili yapıştırma yolu. */
  const handlePasteFromClipboard = async () => {
    try {
      const pasted = extractOtp((await Clipboard.getStringAsync()) ?? "");
      if (pasted.length !== OTP_LENGTH) {
        setError(t("auth.forgotPassword.code.validation.clipboardEmpty"));
        return;
      }
      setError("");
      otpRef.current?.setValue(pasted); // onFilled → handleContinue
    } catch {
      setError(t("auth.forgotPassword.code.validation.clipboardEmpty"));
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    setResendToast(false);
    setError("");

    try {
      const response = await authService.forgotPassword(email);
      if (response?.isSuccess) {
        setResendToast(true);
        // Uç şu an retryAfterSeconds göndermiyor; gönderirse ona uyulur.
        setCountdown(parseRetryAfterSeconds(response) ?? RESEND_COOLDOWN_SECONDS);
        setTimeout(() => setResendToast(false), 1500);
      } else {
        setError(response?.message || t("auth.forgotPassword.errors.sendFailed"));
      }
    } catch (err: any) {
      devLog("ForgotPassword resend error:", err);
      setError(
        err?.response?.data?.message || t("auth.forgotPassword.errors.network"),
      );
    } finally {
      setResendLoading(false);
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
            <SFIcon
              name="checkmark"
              fallback={Check}
              size={20}
              color={colors.text}
              strokeWidth={3}
              weight="bold"
            />
            <Text className="text-[15px] font-medium" style={{ color: colors.text }}>
              {t("auth.forgotPassword.code.resendSuccess")}
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
            <SFIcon
              name="lock.rotation"
              fallback={Lock}
              strokeWidth={1}
              size={140}
              color={colors.text}
            />
            <View>
              <Text
                className="text-3xl font-bold mb-3 text-center"
                style={{ color: colors.text }}
              >
                {t("auth.forgotPassword.code.title")}
              </Text>
              <Text className="text-[18px] text-center" style={{ color: ink(0.8) }}>
                {email}
                {t("auth.forgotPassword.code.description")}
              </Text>
            </View>
          </View>

          <View>
            <View className="mb-8 p-8 py-4">
              <OtpInput
                ref={otpRef}
                numberOfDigits={OTP_LENGTH}
                type="numeric"
                onTextChange={(text) => {
                  setValue("code", text);
                  // Hata YALNIZ varken siliniyor: koşulsuz setError("") her
                  // hanede ekranı gereksiz yere uyandırıyordu.
                  if (error) setError("");
                }}
                onFilled={(text) => handleContinue(text)}
                textInputProps={{
                  textContentType: "oneTimeCode",
                  autoComplete:
                    Platform.OS === "android" ? "sms-otp" : "one-time-code",
                  // Kütüphanenin maxLength'i ve numeric filtresi yapıştırmayı
                  // yiyor; ham metni alıp extractOtp'tan geçiriyoruz.
                  maxLength: undefined,
                  onChangeText: handleOtpChange,
                  // caret'i açık bırakıp şeffaflaştırıyoruz ki uzun basınca
                  // çıkan Yapıştır menüsü doğru yerde konumlansın.
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
                    color: colors.text,
                    fontSize: 30,
                    fontWeight: "600",
                  },
                  focusStickStyle: { backgroundColor: colors.inverseSurface },
                }}
              />
            </View>

            {error ? (
              <Text className="text-center mb-4" style={{ color: colors.error }}>
                {error}
              </Text>
            ) : null}

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
                    <SFIcon
                      name="arrow.counterclockwise"
                      fallback={RotateCcw}
                      size={16}
                      color={colors.neutral200}
                      strokeWidth={2.5}
                      weight="bold"
                    />
                    <Text className="font-medium" style={{ color: colors.neutral200 }}>
                      {t("auth.forgotPassword.code.resendCountdown", { countdown })}
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row py-[2px] items-center gap-2">
                    <SFIcon
                      name="arrow.counterclockwise"
                      fallback={RotateCcw}
                      size={16}
                      color={colors.text}
                      strokeWidth={2.5}
                      weight="bold"
                    />
                    <Text className="font-medium" style={{ color: colors.text }}>
                      {t("auth.forgotPassword.code.resendButton")}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {clipboardHasText && (
                <>
                  <View style={{ width: 1, height: 14, backgroundColor: ink(0.2) }} />
                  <TouchableOpacity activeOpacity={0.8} onPress={handlePasteFromClipboard}>
                    <View className="flex-row py-[2px] items-center gap-2">
                      <SFIcon
                        name="doc.on.clipboard"
                        fallback={ClipboardPaste}
                        size={16}
                        color={colors.text}
                        strokeWidth={2.5}
                        weight="bold"
                      />
                      <Text className="font-medium" style={{ color: colors.text }}>
                        {t("auth.forgotPassword.code.pasteButton")}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <ContinueButton
              control={control}
              label={t("common.continueButton")}
              onPress={() => handleContinue()}
            />
          </View>

          <View className="items-center mt-4">
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => navigation.goBack()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "center",
                gap: 6,
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 18,
                paddingVertical: 18,
              }}
            >
              <SFIcon
                name="arrow.left"
                fallback={ArrowLeft}
                size={16}
                color={colors.text}
                strokeWidth={2.5}
                weight="bold"
              />
              <Text className="font-medium" style={{ color: colors.text }}>
                {t("auth.forgotPassword.code.backButton")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
