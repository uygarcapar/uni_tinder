import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Keyboard,
  Platform,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { OtpInput, type OtpInputRef } from "react-native-otp-entry";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw, Check, Circle } from "@/shared/icons";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { authService } from "@/features/auth/authService";
import { logout, setUserAndToken } from "@/features/auth/authSlice";
import {
  parsePasswordError,
  passwordErrorMessage,
  type PasswordErrorField,
  CODE_TTL_SECONDS,
  CODE_MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from "@/features/auth/passwordErrors";
import { OTP_LENGTH, extractOtp, type CodeForm } from "@/features/auth/otpCode";
import {
  passwordSchema,
  PasswordForm,
  PASSWORD_RULES,
  unmetPasswordRules,
  currentPasswordSchema,
  type CurrentPasswordForm,
} from "@/shared/schemas/formSchemas";
import {
  markSelfPasswordChange,
  clearSelfPasswordChangeMark,
} from "@/shared/utils/sessionGuard";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import AuthPillField from "@/features/auth/components/AuthPillField";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { showInfoToast } from "@/shared/services/toaster";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";

/**
 * Ayarlar → Şifre Değiştir. İki akış, tek ekran:
 *
 *   A (change) : mevcut şifre → onay kodu → yeni şifre. Oturum DEVAM EDER,
 *                cevaptaki yeni token seti diske yazılır.
 *   B+C (reset): "mevcut şifremi hatırlamıyorum" kaçış yolu. Kimliği yalnız
 *                e-posta kodu kanıtlar; sonunda kullanıcı ÇIKIŞ YAPAR çünkü
 *                ResetPasswordWithCode yeni token döndürmüyor.
 *
 * İki adım ayrı route değil aynı ekranın iki durumu: mevcut şifreyi navigation
 * param'ıyla taşımak onu Sentry'nin route breadcrumb'larına düşürürdü.
 *
 * Kaçış yolunda e-posta KULLANICIYA SORULMAZ — oturumdaki adres kullanılır;
 * `ForgotPassword`/`ResetPasswordWithCode` uçlarında `[Authorize]` yok, giriş
 * yapmış kullanıcı da çağırabiliyor.
 */
export default function ChangePasswordScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "ChangePassword">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const authUser = useAppSelector((s: any) => s.auth?.user);
  const email = authUser?.email as string | undefined;

  const [mode, setMode] = useState<"change" | "reset">("change");
  const [step, setStep] = useState<"verify" | "code">("verify");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  // `PasswordErrorField` e-posta değiştirme akışının `newEmail`ini de taşıyor
  // (aynı hata çözümleyici iki akışa da bakıyor). Bu ekranda o değer hiç
  // üretilmiyor; tipi daraltmak yerine ortak tipi kullanıyoruz ki parser'a yeni
  // bir alan eklendiğinde burası sessizce değil derleme zamanında konuşsun.
  const [errorField, setErrorField] = useState<PasswordErrorField | null>(null);

  // Kod durumu. `codeBurned` UT-1012 sonrası: doğru kod bile artık çalışmaz,
  // yeni kod istenene kadar gönderim kapalı.
  const [attemptsLeft, setAttemptsLeft] = useState(CODE_MAX_ATTEMPTS);
  const [codeBurned, setCodeBurned] = useState(false);
  const [expiresIn, setExpiresIn] = useState(CODE_TTL_SECONDS);
  // Aynı geri sayım iki işi görüyor: "tekrar gönder" kilidi ve 429 sonrası
  // bekleme. `rateLimited` ikisini ayırır — sunucu reddettiyse yalnız tekrar
  // gönderme değil ANA AKSİYON da kilitlenmeli (uçlar dakikada 5 istek).
  const [resendIn, setResendIn] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  const confirmRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // Mevcut şifre AYRI form: yeni şifre formunun şemasıyla (passwordSchema)
  // birlikte doğrulanamaz — o şema ResetPasswordScreen'de de kullanılıyor ve
  // orada mevcut şifre diye bir alan yok.
  const verifySchema = useMemo(() => currentPasswordSchema(t), [t]);
  const verifyForm = useForm<CurrentPasswordForm>({
    resolver: zodResolver(verifySchema),
    defaultValues: { currentPassword: "" },
  });

  // Kod da formda (bkz. CodeForm): ekranda ona abone olan hiçbir şey yok —
  // gönder butonu yalnız loading/rate limit'e bakıyor — yani hane girmek
  // sayaç dışında render tetiklemiyor.
  const codeForm = useForm<CodeForm>({ defaultValues: { code: "" } });

  const newPassword = watch("password") ?? "";

  // Tek saniyelik tick iki geri sayımı birden yürütüyor: kodun 15 dakikalık
  // ömrü ve bekleme kilidi. Adımdan bağımsız çalışır — 429 ilk adımda da
  // yenebilir, orada duran bir sayaç kullanıcıyı kilitli bırakırdı.
  useEffect(() => {
    const id = setInterval(() => {
      setExpiresIn((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => {
        if (s <= 1) setRateLimited(false);
        return s > 0 ? s - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const clearError = useCallback(() => {
    setApiError("");
    setErrorField(null);
  }, []);

  /** Yeni kod geldi → sayaçlar sıfırdan başlar (backend de deneme sayacını sıfırlıyor). */
  const startCodeWindow = useCallback(() => {
    setAttemptsLeft(CODE_MAX_ATTEMPTS);
    setCodeBurned(false);
    setExpiresIn(CODE_TTL_SECONDS);
    setResendIn(RESEND_COOLDOWN_SECONDS);
    setRateLimited(false);
    codeForm.setValue("code", "");
    otpRef.current?.clear();
  }, [codeForm]);

  /**
   * Hata gövdesini ekrana bağlar. `keepCode` gelen kodlarda (UT-1003/1010/1011)
   * kod alanı TEMİZLENMEZ: reddedilen şifreydi, kod hâlâ geçerli — sıfırlamak
   * kullanıcıyı boşuna yeni kod istemeye zorlardı.
   */
  const applyFailure = useCallback(
    (err: unknown) => {
      const failure = parsePasswordError(err);

      // Ban ekranını interceptor açtı; burada ikinci bir mesaj gösterme.
      if (failure.accountBlocked) return;
      // 401: refresh de başarısız oldu, logout yolda. Ekranı kapat.
      if (failure.sessionLost) {
        navigation.goBack();
        return;
      }

      if (failure.retryAfterSeconds != null) {
        setResendIn(failure.retryAfterSeconds);
        setRateLimited(true);
      }
      if (failure.codeBurned) {
        setCodeBurned(true);
        setAttemptsLeft(0);
        codeForm.setValue("code", "");
        otpRef.current?.clear();
      } else if (failure.codeAttemptSpent) {
        setAttemptsLeft((n) => Math.max(0, n - 1));
        codeForm.setValue("code", "");
        otpRef.current?.clear();
      }

      setErrorField(failure.field);
      setApiError(passwordErrorMessage(failure, t));
    },
    [codeForm, navigation, t],
  );

  // ── Adım A1 — mevcut şifreyi doğrula, kodu iste ──────────────────────────
  // Boş alan kontrolü şemada (currentPasswordSchema). Klavye geçersiz
  // gönderimde de kapanmalı, yoksa hata satırı klavyenin altında kalıyor.
  const handleRequestCode = verifyForm.handleSubmit(
    async ({ currentPassword }) => {
      Keyboard.dismiss();
      setLoading(true);
      clearError();
      try {
        await authService.requestPasswordChangeCode(currentPassword);
        startCodeWindow();
        setMode("change");
        setStep("code");
      } catch (err) {
        devLog("RequestPasswordChangeCode error:", err);
        applyFailure(err);
      } finally {
        setLoading(false);
      }
    },
    () => Keyboard.dismiss(),
  );

  // ── Kaçış yolu — mevcut şifre bilinmiyorsa B+C akışına aktar ─────────────
  const startResetFlow = async () => {
    if (!email) return;
    setLoading(true);
    clearError();
    try {
      // Kayıtsız adreste bile 200 döner (user enumeration koruması); oturumdaki
      // adresi gönderdiğimiz için burada belirsizlik yok.
      await authService.forgotPassword(email);
      startCodeWindow();
      setMode("reset");
      setStep("code");
    } catch (err) {
      devLog("ForgotPassword (settings) error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmResetFlow = () =>
    Alert.alert(
      t("auth.password.change.forgotCurrent.title"),
      t("auth.password.change.forgotCurrent.message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.continueButton"), onPress: startResetFlow },
      ],
    );

  // ── Kod tekrar gönder ────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    clearError();
    try {
      if (mode === "change") {
        await authService.requestPasswordChangeCode(
          verifyForm.getValues("currentPassword"),
        );
      } else if (email) {
        await authService.forgotPassword(email);
      }
      startCodeWindow();
      showInfoToast({
        message: t("auth.password.change.resendSuccess"),
        variant: "success",
      });
    } catch (err) {
      devLog("Password code resend error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Adım A2 / C — kod + yeni şifre ───────────────────────────────────────
  const handleSubmitNewPassword = handleSubmit(async ({ password }) => {
    Keyboard.dismiss();
    const code = codeForm.getValues("code");
    if (codeBurned) {
      setErrorField("code");
      setApiError(t("auth.password.errors.codeBurned"));
      return;
    }
    if (code.length !== OTP_LENGTH) {
      setErrorField("code");
      setApiError(t("auth.password.change.validation.codeRequired"));
      return;
    }

    setLoading(true);
    clearError();
    try {
      if (mode === "change") {
        const response: any = await authService.changePassword(
          verifyForm.getValues("currentPassword"),
          password,
          code,
        );
        // Token'ları authService diske yazdı; Redux'ı da hizala, yoksa bir
        // sonraki refresh eski token'ı geri yazar. `result.user` şifre
        // değişiminden etkilenmiyor — gelmezse mevcut kullanıcı korunur,
        // undefined yazmak oturumu kullanıcısız bırakırdı.
        const result = response?.result;
        if (result?.accessToken) {
          dispatch(
            setUserAndToken({
              user: result.user ?? authUser,
              token: result.accessToken,
              refreshToken: result.refreshToken,
            }),
          );
        }
        showInfoToast({
          title: t("auth.password.change.successTitle"),
          message: t("auth.password.change.successMessage"),
          variant: "success",
        });
        navigation.goBack();
        return;
      }

      // Sıfırlama akışı: backend tüm oturumları iptal ediyor ve YENİ TOKEN
      // VERMİYOR. Damga, hub'dan gelecek ForceLogout'un araya jenerik bir
      // toast sokmasını engelliyor — kapanışı bu ekran yönetiyor.
      markSelfPasswordChange();
      try {
        await authService.resetPassword(email!, code, password);
      } catch (err) {
        clearSelfPasswordChangeMark();
        throw err;
      }
      Alert.alert(
        t("auth.password.reset.successTitle"),
        t("auth.password.reset.successMessage"),
        [{ text: t("common.ok"), onPress: () => dispatch(logout()) }],
      );
    } catch (err) {
      devLog("Password submit error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  });

  const handleBack = () => {
    // Kod adımından geri = akışı baştan al. Kod sunucuda geçerli kalmaya devam
    // eder, kullanıcı mevcut şifreyi düzeltip tekrar gelirse yeni kod ister.
    if (step === "code" && mode === "change") {
      setStep("verify");
      clearError();
      return;
    }
    navigation.goBack();
  };

  const formError =
    errors.password?.message ||
    errors.confirmPassword?.message ||
    verifyForm.formState.errors.currentPassword?.message;
  // Rate limit satırı canlı: donmuş bir "60 saniye sonra dene" metni,
  // kullanıcının ne zaman tekrar deneyebileceğini söylemiyor.
  const displayError = rateLimited
    ? t("auth.password.errors.rateLimited", { seconds: resendIn })
    : formError || apiError;
  const missingRules = unmetPasswordRules(newPassword);
  const submitDisabled = loading || rateLimited;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={handleBack} />
      </View>

      {step === "verify" ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 px-6 py-6 pt-0">
            <Text className="text-4xl font-bold mb-2" style={{ color: colors.text }}>
              {t("auth.password.change.title")}
            </Text>
            <Text
              className="text-[18px] font-normal mb-8"
              style={{ color: colors.textSecondary }}
            >
              {t("auth.password.change.description")}
            </Text>

            <AuthPillField
              control={verifyForm.control}
              name="currentPassword"
              label={t("auth.password.change.currentLabel")}
              placeholder={t("auth.password.change.currentPlaceholder")}
              secure={!showPassword}
              onToggleSecure={() => setShowPassword((v) => !v)}
              invalid={!!apiError || !!verifyForm.formState.errors.currentPassword}
              editable={!loading}
              onChanged={clearError}
              returnKeyType="go"
              onSubmitEditing={handleRequestCode}
            />

            {displayError ? (
              <Text className="text-center font-normal mt-4" style={{ color: colors.error }}>
                {displayError}
              </Text>
            ) : null}

            {/* Kaçış yolu: mevcut şifre bu akıştaki kimlik kanıtının kendisi,
                atlanamaz — kullanıcı sıfırlama akışına aktarılır. */}
            {email ? (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={confirmResetFlow}
                disabled={loading}
                className="mt-6 self-center"
              >
                <Text className="font-semibold" style={{ color: colors.primary }}>
                  {t("auth.password.change.forgotCurrent.link")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text className="text-4xl font-bold mb-2" style={{ color: colors.text }}>
            {t("auth.password.change.codeTitle")}
          </Text>
          <Text
            className="text-[18px] font-normal mb-6"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.password.change.codeDescription", { email })}
          </Text>

          <View className="mb-3">
            <OtpInput
              ref={otpRef}
              numberOfDigits={OTP_LENGTH}
              type="numeric"
              onTextChange={(text) => {
                codeForm.setValue("code", text);
                if (errorField === "code") clearError();
              }}
              textInputProps={{
                textContentType: "oneTimeCode",
                autoComplete: Platform.OS === "android" ? "sms-otp" : "one-time-code",
                // Kütüphanenin maxLength'i ve numeric filtresi yapıştırmayı
                // yiyor; ham metni extractOtp'tan geçiriyoruz (bkz. otpCode.ts).
                maxLength: undefined,
                onChangeText: (raw: string) => otpRef.current?.setValue(extractOtp(raw)),
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
                  borderWidth: errorField === "code" ? 1 : 0,
                  borderColor: errorField === "code" ? colors.error : "transparent",
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

          {/* Kod ömrü + kalan deneme + tekrar gönder */}
          <View className="flex-row items-center justify-center gap-3 mb-6">
            <Text className="text-[13px]" style={{ color: ink(0.6) }}>
              {expiresIn > 0
                ? t("auth.password.change.expiresIn", { time: formatMmSs(expiresIn) })
                : t("auth.password.change.expired")}
            </Text>
            <View style={{ width: 1, height: 12, backgroundColor: ink(0.2) }} />
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleResend}
              disabled={resendIn > 0 || loading}
            >
              <View className="flex-row items-center gap-1.5">
                <SFIcon
                  name="arrow.counterclockwise"
                  fallback={RotateCcw}
                  size={14}
                  color={resendIn > 0 ? colors.neutral200 : colors.text}
                  strokeWidth={2.5}
                  weight="bold"
                />
                <Text
                  className="text-[13px] font-medium"
                  style={{ color: resendIn > 0 ? colors.neutral200 : colors.text }}
                >
                  {resendIn > 0
                    ? t("auth.password.change.resendCountdown", { countdown: resendIn })
                    : t("auth.password.change.resendButton")}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Kalan deneme yalnız bir hak yandıktan sonra görünür — dolu sayaç
              göstermek kullanıcıyı gereksiz yere tedirgin ediyor. */}
          {!codeBurned && attemptsLeft < CODE_MAX_ATTEMPTS ? (
            <Text className="text-center text-[13px] mb-4" style={{ color: colors.warning }}>
              {t("auth.password.change.attemptsLeft", { count: attemptsLeft })}
            </Text>
          ) : null}

          <AuthPillField
            label={t("auth.password.change.newLabel")}
            placeholder={t("auth.password.change.newPlaceholder")}
            control={control}
            name="password"
            secure={!showPassword}
            onToggleSecure={() => setShowPassword((v) => !v)}
            invalid={!!formError || errorField === "newPassword"}
            editable={!loading}
            onChanged={clearError}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />

          <AuthPillField
            inputRef={confirmRef}
            label={t("auth.password.change.confirmLabel")}
            placeholder={t("auth.password.change.confirmPlaceholder")}
            control={control}
            name="confirmPassword"
            secure={!showPassword}
            invalid={!!formError}
            editable={!loading}
            onChanged={clearError}
            returnKeyType="go"
            onSubmitEditing={handleSubmitNewPassword}
          />

          <PasswordRuleChecklist password={newPassword} missing={missingRules} />

          {displayError ? (
            <Text className="text-center font-normal mt-4" style={{ color: colors.error }}>
              {displayError}
            </Text>
          ) : null}
        </ScrollView>
      )}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={step === "verify" ? handleRequestCode : handleSubmitNewPassword}
            disabled={submitDisabled}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              opacity: submitDisabled ? 0.6 : 1,
              backgroundColor: colors.inverseSurface,
            }}
          >
            {loading ? (
              <ActivityIndicator className="py-[17.5px]" color={colors.onInverseSurface} />
            ) : (
              <Text
                className="py-[20px] font-bold text-[15px] text-center"
                style={{ color: colors.onInverseSurface }}
              >
                {step === "verify"
                  ? t("common.continueButton")
                  : t("auth.password.change.submitButton")}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const formatMmSs = (totalSeconds: number) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Canlı kural listesi. Backend zayıf şifreyi UT-1010 ile ayrı raporluyor, yani
 * bu olmadan da doğru mesaj görünür — ama kullanıcı submit'e basmadan neyi
 * eksik yaptığını görsün ve 5/dk'lık kotadan boşuna istek harcanmasın.
 */
function PasswordRuleChecklist({
  password,
  missing,
}: {
  password: string;
  missing: readonly string[];
}) {
  const { t } = useTranslation();
  if (!password) return null;

  return (
    <View className="mt-1 mb-2 gap-1.5">
      {PASSWORD_RULES.map((rule) => {
        const met = !missing.includes(rule.key);
        return (
          <View key={rule.key} className="flex-row items-center gap-2">
            <SFIcon
              name={met ? "checkmark.circle.fill" : "circle"}
              fallback={met ? Check : Circle}
              size={14}
              color={met ? colors.success : ink(0.35)}
              strokeWidth={2.5}
              weight="bold"
            />
            <Text
              className="text-[13px]"
              style={{ color: met ? colors.success : ink(0.5) }}
            >
              {t(`auth.password.rules.${rule.key}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
