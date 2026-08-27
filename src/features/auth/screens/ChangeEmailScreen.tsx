import { useCallback, useEffect, useRef, useState } from "react";
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
import { Eye, EyeOff, RotateCcw, InfoIcon } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { RootStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { authService } from "@/features/auth/authService";
import { logout } from "@/features/auth/authSlice";
import {
  parsePasswordError,
  passwordErrorMessage,
  type PasswordErrorField,
  CODE_TTL_SECONDS,
  CODE_MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from "@/features/auth/passwordErrors";
import { OTP_LENGTH, extractOtp } from "@/features/auth/otpCode";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { showInfoToast } from "@/shared/services/toaster";
import { colors, ink } from "@/shared/theme/colors";
import { devLog } from "@/shared/utils/devLog";

/**
 * Ayarlar → E-posta Değiştir. İki adım, tek ekran — ChangePasswordScreen ile
 * bilinçli olarak aynı iskelet (aynı sözleşme: mevcut şifre → 6 haneli kod).
 *
 *   1 (verify) : mevcut şifre + yeni adres → kod YENİ adrese gider
 *   2 (code)   : kod → adres değişir
 *
 * ŞİFRE AKIŞINDAN AYRILDIĞI YER — ve bu ekranın var oluş sebebi: başarıda
 * backend YENİ TOKEN SETİ VERMİYOR. Tüm refresh token'lar iptal ediliyor, yani
 * kullanıcı MUTLAKA çıkış yapıp yeni adresiyle tekrar giriyor. "Kaydedildi"
 * deyip ekranı kapatmak bir sonraki isteğin 401'iyle kullanıcıyı hiçbir
 * açıklama olmadan login'e atardı.
 *
 * Mevcut şifre navigation param'ıyla taşınmıyor (Sentry route breadcrumb'ları);
 * iki adım aynı ekranın iç durumu.
 */
export default function ChangeEmailScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "ChangeEmail">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const authUser = useAppSelector((s: any) => s.auth?.user);
  const currentEmail = authUser?.email as string | undefined;

  const [step, setStep] = useState<"verify" | "code">("verify");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  // Ortak tip: bu akışta `newPassword` hiç üretilmiyor ama parser'ın alan
  // kümesini daraltmak, oraya yeni bir alan eklendiğinde burayı sessizce
  // uyumsuz bırakırdı (bkz. ChangePasswordScreen'deki aynı not).
  const [errorField, setErrorField] = useState<PasswordErrorField | null>(null);

  // Kod durumu — şifre ekranıyla aynı sözleşme: 15 dakika ömür, 5 hatalı
  // denemede kod yanıyor (UT-1012), sonrasında doğrusu bile çalışmıyor.
  const [attemptsLeft, setAttemptsLeft] = useState(CODE_MAX_ATTEMPTS);
  const [codeBurned, setCodeBurned] = useState(false);
  const [expiresIn, setExpiresIn] = useState(CODE_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);

  const otpRef = useRef<OtpInputRef>(null);
  const emailRef = useRef<TextInput>(null);

  // Tek saniyelik tick iki geri sayımı birden yürütüyor: kodun ömrü ve bekleme
  // kilidi. Adımdan bağımsız — 429 ilk adımda da yenebilir.
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

  // Damga BİLEREK unmount'ta temizlenmiyor. Başarı yolunda ekran tam da
  // unmount olurken (Alert → logout → AuthNavigator) korumaya hâlâ ihtiyaç var:
  // ForceLogout o anda yolda olabilir. Yarım kalan denemeler zaten risk
  // değil — damgayı yalnız BAŞARILI onay bırakıyor, hata yolunda
  // confirmEmailChange kendi catch'inde geri alıyor — ve pencere 20 sn'de
  // kendiliğinden kapanıyor.

  const clearError = useCallback(() => {
    setApiError("");
    setErrorField(null);
  }, []);

  /** Yeni kod geldi → sayaçlar sıfırdan (backend de deneme sayacını sıfırlıyor). */
  const startCodeWindow = useCallback(() => {
    setAttemptsLeft(CODE_MAX_ATTEMPTS);
    setCodeBurned(false);
    setExpiresIn(CODE_TTL_SECONDS);
    setResendIn(RESEND_COOLDOWN_SECONDS);
    setRateLimited(false);
    setCode("");
    otpRef.current?.clear();
  }, []);

  /**
   * Hata gövdesini ekrana bağlar. Adres redleri (UT-1017/1018/1019) `newEmail`
   * alanını işaret ediyor ve kodu TEMİZLEMİYOR — ikinci adımda dönerlerse
   * kullanıcı yazdığı kodu kaybetmesin.
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
        setCode("");
        otpRef.current?.clear();
      } else if (failure.codeAttemptSpent) {
        setAttemptsLeft((n) => Math.max(0, n - 1));
        setCode("");
        otpRef.current?.clear();
      }

      setErrorField(failure.field);
      setApiError(passwordErrorMessage(failure, t));
    },
    [navigation, t],
  );

  // ── Adım 1 — şifreyi doğrula, kodu YENİ adrese iste ─────────────────────
  const handleRequestCode = async () => {
    Keyboard.dismiss();
    if (!currentPassword) {
      setErrorField("currentPassword");
      setApiError(t("auth.password.change.validation.currentRequired"));
      return;
    }
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setErrorField("newEmail");
      setApiError(t("auth.email.change.validation.emailRequired"));
      return;
    }
    // Şekil kontrolü yalnızca "@ var mı" seviyesinde: domain'in DESTEKLENEN bir
    // üniversiteye ait olup olmadığına backend karar veriyor (UT-1019) ve
    // kayıt defteri orada. Burada tahmin yürütmek, listeye yeni üniversite
    // eklendiğinde istemciyi yanlış yere reddeden konuma sokardı.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorField("newEmail");
      setApiError(t("auth.email.change.validation.emailInvalid"));
      return;
    }
    // Backend de UT-1018 ile reddediyor; önden kesmek 5/dk'lık kotadan
    // boşuna istek harcamamak için.
    if (currentEmail && trimmed === currentEmail.trim().toLowerCase()) {
      setErrorField("newEmail");
      setApiError(t("auth.email.errors.sameAsCurrent"));
      return;
    }

    setLoading(true);
    clearError();
    try {
      await authService.requestEmailChangeCode(currentPassword, trimmed);
      setNewEmail(trimmed);
      startCodeWindow();
      setStep("code");
    } catch (err) {
      devLog("RequestEmailChangeCode error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Kod tekrar gönder ───────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    clearError();
    try {
      await authService.requestEmailChangeCode(currentPassword, newEmail);
      startCodeWindow();
      showInfoToast({
        message: t("auth.password.change.resendSuccess"),
        variant: "success",
      });
    } catch (err) {
      devLog("Email change code resend error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Adım 2 — kodu onayla, sonra ÇIKIŞ ───────────────────────────────────
  const handleConfirm = async () => {
    Keyboard.dismiss();
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
      const result = await authService.confirmEmailChange(newEmail, code);

      // Üniversite değiştiyse bunu SÖYLEMEK gerekiyor: kullanıcının keşif
      // havuzu komple değişti (aday havuzu düşürüldü). Sessizce yapılırsa
      // kullanıcı ertesi gün "kimse çıkmıyor, uygulama bozuldu" diye döner.
      const universityName = result?.universityName;
      const message =
        result?.universityChanged && universityName
          ? t("auth.email.change.successWithUniversity", {
              email: result?.newEmail ?? newEmail,
              university: universityName,
            })
          : t("auth.email.change.successMessage", {
              email: result?.newEmail ?? newEmail,
            });

      // Yeni token seti YOK — oturum bitti. Kapanışı bu ekran yönetiyor
      // (damga sayesinde araya hub'ın jenerik toast'ı girmiyor); kullanıcı
      // "Tamam"a basınca login'e düşüyor.
      Alert.alert(t("auth.email.change.successTitle"), message, [
        { text: t("common.ok"), onPress: () => dispatch(logout()) },
      ]);
    } catch (err) {
      devLog("ConfirmEmailChange error:", err);
      applyFailure(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // Kod adımından geri = adresi/şifreyi düzeltmeye dön. Kod sunucuda geçerli
    // kalmaya devam eder; kullanıcı tekrar gelirse yeni kod ister.
    if (step === "code") {
      setStep("verify");
      clearError();
      return;
    }
    navigation.goBack();
  };

  // Rate limit satırı canlı: donmuş bir "60 saniye sonra dene" metni,
  // kullanıcının ne zaman tekrar deneyebileceğini söylemiyor.
  const displayError = rateLimited
    ? t("auth.password.errors.rateLimited", { seconds: resendIn })
    : apiError;
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
              {t("auth.email.change.title")}
            </Text>
            <Text
              className="text-[18px] font-normal mb-8"
              style={{ color: colors.textSecondary }}
            >
              {currentEmail
                ? t("auth.email.change.description", { email: currentEmail })
                : t("auth.email.change.descriptionNoEmail")}
            </Text>

            <Field
              label={t("auth.password.change.currentLabel")}
              placeholder={t("auth.password.change.currentPlaceholder")}
              value={currentPassword}
              onChangeText={(v) => {
                setCurrentPassword(v);
                clearError();
              }}
              secure={!showPassword}
              onToggleSecure={() => setShowPassword((v) => !v)}
              invalid={errorField === "currentPassword"}
              editable={!loading}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
            />

            <Field
              inputRef={emailRef}
              label={t("auth.email.change.newLabel")}
              placeholder={t("auth.email.change.newPlaceholder")}
              value={newEmail}
              onChangeText={(v) => {
                setNewEmail(v);
                clearError();
              }}
              invalid={errorField === "newEmail"}
              editable={!loading}
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={handleRequestCode}
            />

            {/* Uyarı, işlem YAPILMADAN önce: kullanıcı çıkış yapacağını ve
                üniversitesinin değişebileceğini kodu istemeden bilmeli. */}
            <View
              style={{
                borderRadius: 24,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: colors.hairline,
                padding: 16,
                marginTop: 8,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <SFIcon
                name="info.circle"
                fallback={InfoIcon}
                size={18}
                color={colors.textSecondary}
                strokeWidth={2}
                weight="semibold"
              />
              <Text
                style={{
                  flex: 1,
                  color: colors.textSecondary,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {t("auth.email.change.notice")}
              </Text>
            </View>

            {displayError ? (
              <Text className="text-center font-normal mt-4" style={{ color: colors.error }}>
                {displayError}
              </Text>
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
            {t("auth.email.change.codeTitle")}
          </Text>
          {/* Kodun YENİ adrese gittiğini açıkça yazıyoruz: kullanıcı eski
              gelen kutusunu bekleyip "kod gelmedi" diye döndüğünde akış
              tıkanıyor. */}
          <Text
            className="text-[18px] font-normal mb-6"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.email.change.codeDescription", { email: newEmail })}
          </Text>

          <View className="mb-3">
            <OtpInput
              ref={otpRef}
              numberOfDigits={OTP_LENGTH}
              type="numeric"
              onTextChange={(text) => {
                setCode(text);
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

          {/* Kod ömrü + tekrar gönder */}
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
            onPress={step === "verify" ? handleRequestCode : handleConfirm}
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
                  : t("auth.email.change.submitButton")}
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
 * Pill input — ChangePasswordScreen'deki PasswordField'ın react-hook-form'suz
 * hâli. Bu ekranda form yok: iki alan da (şifre, adres) tek seferlik değerler,
 * şemaya bağlanmaları bir şey kazandırmazdı.
 */
function Field({
  label,
  placeholder,
  value,
  onChangeText,
  secure,
  onToggleSecure,
  invalid,
  editable = true,
  inputRef,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secure?: boolean;
  onToggleSecure?: () => void;
  invalid?: boolean;
  editable?: boolean;
  inputRef?: React.RefObject<TextInput | null>;
  keyboardType?: "email-address";
  returnKeyType?: "next" | "go";
  onSubmitEditing?: () => void;
}) {
  return (
    <View className="mb-4">
      <Text
        className="text-[14px] font-semibold mb-2"
        style={{ color: colors.neutral200 }}
      >
        {label}
      </Text>
      <View
        style={{
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: invalid ? colors.error : colors.hairline,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
      >
        <TextInput
          ref={inputRef as any}
          style={{ flex: 1, paddingVertical: 16, fontSize: 18, color: colors.text }}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          editable={editable}
          returnKeyType={returnKeyType}
          submitBehavior={returnKeyType === "next" ? "submit" : undefined}
          onSubmitEditing={onSubmitEditing}
        />
        {onToggleSecure ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onToggleSecure}>
            <View pointerEvents="none">
              <SFIcon
                name={secure ? "eye.slash.fill" : "eye.fill"}
                fallback={secure ? EyeOff : Eye}
                size={24}
                strokeWidth={1.5}
                color={colors.neutral200}
              />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
