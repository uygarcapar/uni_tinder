import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import {
  clearError,
  clearRegistrationForm,
  setRegistrationEmail,
} from "@/features/auth/authSlice";
import { clearProfile } from "@/features/profile/profileSlice";
import {
  FIRST_REGISTRATION_STEP,
  isRegistrationStep,
  registrationResumeStack,
} from "@/features/auth/registrationFlow";
import { checkRegistrationToken } from "@/features/auth/registrationToken";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { InfoIcon } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailSchema, EmailForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import { devLog } from '@/shared/utils/devLog';
import { parseRetryAfterSeconds } from '@/features/auth/verificationRetry';

export default function RegisterStep1Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep1'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { emailVerifiedToken, registrationEmail, registrationStep } = useAppSelector(
    (s) => (s as any).auth,
  );
  const inputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { control, handleSubmit, formState: { errors } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  /**
   * Cihazda yarım kalmış BAŞKA bir kaydın taslağı varsa yeni e-postaya sızmasın.
   *
   * `clearRegistrationForm` yalnız auth tarafını temizliyor; 12 adımlık cevaplar
   * (hobiler, bio, boy, fotoğraflar) profile slice'ında duruyordu ve aynı
   * telefonda kayıt olan ikinci kişinin formu bunlarla dolu açılıyordu.
   * E-posta AYNIYSA temizlemiyoruz — token'ı süresi dolduğu için baştan
   * doğrulayan kullanıcı cevaplarını korusun.
   */
  const startFreshIfEmailChanged = (email: string) => {
    if (registrationEmail && registrationEmail !== email) {
      devLog("🧹 [RegisterStep1] Different email — dropping previous draft");
      dispatch(clearProfile());
      dispatch(clearRegistrationForm());
    }
  };

  const handleSendVerification = handleSubmit(async ({ email }) => {
    Keyboard.dismiss();
    // Küçük harfe indirgeme, taslak sahipliğinin tek işareti olan e-posta
    // karşılaştırmasını (startFreshIfEmailChanged + Step1 kısayolu + Step15
    // token kontrolü) yazım farkına duyarsız kılıyor: "Ali@uni.edu.tr" ile
    // "ali@uni.edu.tr" backend'de AYNI adres, istemcide farklı iki string'di.
    const trimmed = email.trim().toLowerCase();
    setLoading(true);
    setError("");

    // If user already has a valid token for this exact email, skip re-verification
    if (emailVerifiedToken && registrationEmail === trimmed) {
      devLog("⚡ [RegisterStep1] Token already exists for this email — validating before skip");
      const check = await checkRegistrationToken(trimmed, emailVerifiedToken);
      if (check === "valid") {
        // Soğuk açılış resume'siyle AYNI yığın: eskiden burada Step3'e reset
        // ediliyordu, kullanıcı verisi dolu 12 adımı yeniden tıklıyordu.
        const step = isRegistrationStep(registrationStep)
          ? registrationStep
          : FIRST_REGISTRATION_STEP;
        const stack = registrationResumeStack(step);
        devLog("✅ [RegisterStep1] Token valid — resuming at", step);
        setLoading(false);
        navigation.reset({
          index: stack.length - 1,
          routes: stack.map((name) => ({ name })),
        });
        return;
      }
      // 'invalid' → yeni doğrulama; 'unknown' (ağ) → yine normal akış denenir.
      devLog("⚠️ [RegisterStep1] Stored token not usable — proceeding with new verification");
    }

    try {
      devLog("📤 [RegisterStep1] Calling send-verification for:", trimmed);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.SEND_VERIFICATION}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed }),
        },
      );
      const data = await response.json();
      const status = data?.result?.status;
      // Backend, yeniden gönderime kaç saniye kaldığını döndürüyor; Step2'deki
      // "tekrar gönder" geri sayımı bu değerle başlıyor. Alan yoksa akış eskisi
      // gibi çalışır (geri sayım 0).
      const retryAfterSeconds = parseRetryAfterSeconds(data);
      devLog("📥 [RegisterStep1] send-verification status:", status, "retryAfter:", retryAfterSeconds);

      switch (status) {
        case "CODE_SENT":
          startFreshIfEmailChanged(trimmed);
          dispatch(setRegistrationEmail(trimmed));
          navigation.navigate("RegisterStep2", { email: trimmed, mode: "registration", retryAfterSeconds });
          break;

        case "CODE_PENDING":
          startFreshIfEmailChanged(trimmed);
          dispatch(setRegistrationEmail(trimmed));
          navigation.navigate("RegisterStep2", { email: trimmed, mode: "registration", pending: true, retryAfterSeconds });
          break;

        case "ACCOUNT_EXISTS":
          Alert.alert(
            t('auth.step1.errors.accountExistsTitle'),
            data.message || t('auth.step1.errors.accountExists'),
            [
              { text: t('common.cancel'), style: "cancel" },
              { text: t('auth.step1.errors.loginAction'), onPress: () => navigation.navigate("Login") },
            ],
          );
          break;

        case "INVALID_DOMAIN":
          setError(data.message || t('auth.step1.errors.invalidDomain'));
          break;

        // Domain .edu(.tr) ama üniversite backend registry'sinde yok → akış
        // burada biter, kod ekranına geçilmez. Seçim adımı olmadığı için
        // fallback picker da yok.
        case "UNSUPPORTED_UNIVERSITY":
          setError(data.message || t('auth.step1.errors.unsupportedUniversity'));
          break;

        default:
          setError(data.message || t('auth.step1.errors.sendFailed'));
      }
    } catch {
      setError(t('auth.step1.errors.network'));
    } finally {
      setLoading(false);
    }
  });

  const displayError = errors.email?.message || error;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <Text className="text-4xl font-bold mb-2" style={{ color: colors.text }}>
            {t('auth.step1.title')}
          </Text>
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step1.description')}
          </Text>

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: displayError ? colors.error : colors.hairline,
                }}
              >
                <TextInput
                  ref={inputRef}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    fontSize: 18,
                    color: colors.text,
                  }}
                  placeholder={t('auth.step1.emailPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={(v) => {
                    onChange(v);
                    setError("");
                    dispatch(clearError());
                  }}
                />
              </View>
            )}
          />
          <View className="flex-row gap-2 px-2 items-center mt-3">
            <SFIcon name="info.circle" fallback={InfoIcon} size={16} color={colors.textSecondary} />
            <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
              {t('auth.step1.infoText')}
            </Text>
          </View>

          {displayError ? (
            <Text className="mt-3 px-2" style={{ color: colors.error }}>{displayError}</Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={handleSendVerification}
            disabled={loading}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.inverseSurface,
            }}
          >
            {loading ? (
              <ActivityIndicator className="py-[17.5px]" color={colors.onInverseSurface} />
            ) : (
              <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
                {t('common.continueButton')}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
