import { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Keyboard,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Eye, EyeOff } from "@/shared/icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { authService } from "@/features/auth/authService";
import { parsePasswordError, passwordErrorMessage } from "@/features/auth/passwordErrors";
import { passwordSchema, PasswordForm } from "@/shared/schemas/formSchemas";
import { colors } from "@/shared/theme/colors";
import { useTranslation } from "react-i18next";
import { devLog } from "@/shared/utils/devLog";

/**
 * Şifre sıfırlama akışının 3. adımı: yeni şifre. Kayıt akışındaki
 * RegisterStep3 ile aynı form ve aynı `passwordSchema` kullanılıyor — iki yerde
 * farklı şifre kuralı olmasın.
 *
 * Kodun doğruluğu İLK KEZ burada sınanır: backend'de ayrı bir "kodu doğrula"
 * ucu yok, `ResetPasswordWithCode` e-posta + kod + yeni şifreyi birlikte alır.
 * Hata gövdesi artık ayrım YAPIYOR (`code` alanı):
 *
 *   UT-1006 → kod yanlış/süresi dolmuş  → kod ekranına dön
 *   UT-1012 → 5 hatalı deneme, kod yandı → YENİ kod şart, geri dönüş zorunlu
 *   UT-1010 → yalnız şifre zayıf, KOD GEÇERLİ → sadece formu düzelt, geri dönme
 *
 * Doğrulama sırası önce kod sonra şifre: yanlış kodla gönderilen zayıf şifre
 * UT-1010 değil UT-1006 döner. Yani UT-1010 görüldüyse kod kesin doğruydu.
 */
export default function ResetPasswordScreen({
  route,
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "ResetPassword">) {
  const { t } = useTranslation();
  const { email, resetCode } = route.params;

  const confirmRef = useRef<TextInput>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  // Kod hâlâ geçerliyken (UT-1010) "kodu tekrar gir" kısayolu gösterilmez —
  // kullanıcıyı elindeki çalışan kodu çöpe atmaya yönlendirirdi.
  const [codeRejected, setCodeRejected] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const handleReset = handleSubmit(async ({ password }) => {
    Keyboard.dismiss();
    setLoading(true);
    setApiError("");
    setCodeRejected(false);

    try {
      const response = await authService.resetPassword(email, resetCode, password);
      if (response?.isSuccess) {
        Alert.alert(
          t("auth.forgotPassword.reset.successTitle"),
          t("auth.forgotPassword.reset.successMessage"),
          [
            {
              text: t("common.ok"),
              // navigate (reset değil): Login yığında zaten duruyor, akış
              // oradan başladı — geri dönünce araya sıkışmış sıfırlama
              // ekranları kalmasın diye ona kadar pop edilir.
              onPress: () => navigation.navigate("Login"),
            },
          ],
        );
      } else {
        setApiError(response?.message || t("auth.forgotPassword.reset.errors.failed"));
      }
    } catch (err: any) {
      devLog("ResetPassword error:", err);
      const failure = parsePasswordError(err);
      // UT-1010 dışındaki her ret kodu ilgilendirir: yanlış/süresi dolmuş kod
      // (UT-1006) ya da yanmış kod (UT-1012). İkisinde de tek çıkış yolu geri
      // dönüp kodu düzeltmek veya yenisini istemek.
      setCodeRejected(!failure.keepCode);
      setApiError(
        passwordErrorMessage(failure, t) ||
          t("auth.forgotPassword.reset.errors.network"),
      );
    } finally {
      setLoading(false);
    }
  });

  const formError = errors.password?.message || errors.confirmPassword?.message;
  const displayError = formError || apiError;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <Text className="text-4xl font-bold mb-2" style={{ color: colors.text }}>
            {t("auth.forgotPassword.reset.title")}
          </Text>
          <Text
            className="text-[18px] font-normal mb-8"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.forgotPassword.reset.description")}
          </Text>

          {/* Yeni şifre */}
          <View className="mb-4">
            <Text
              className="text-[14px] font-semibold mb-2"
              style={{ color: colors.neutral200 }}
            >
              {t("auth.forgotPassword.reset.passwordLabel")}
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: displayError ? colors.error : colors.hairline,
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
                    style={{
                      flex: 1,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder={t("auth.forgotPassword.reset.passwordPlaceholder")}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={(v) => {
                      onChange(v);
                      setApiError("");
                      setCodeRejected(false);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                )}
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowPassword(!showPassword)}
              >
                <View pointerEvents="none">
                  {showPassword ? (
                    <SFIcon
                      name="eye.fill"
                      fallback={Eye}
                      size={24}
                      strokeWidth={1.5}
                      color={colors.neutral200}
                    />
                  ) : (
                    <SFIcon
                      name="eye.slash.fill"
                      fallback={EyeOff}
                      size={24}
                      strokeWidth={1.5}
                      color={colors.neutral200}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Yeni şifre tekrar */}
          <View className="mb-4">
            <Text
              className="text-[14px] font-semibold mb-2"
              style={{ color: colors.neutral200 }}
            >
              {t("auth.forgotPassword.reset.confirmLabel")}
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: displayError ? colors.error : colors.hairline,
              }}
            >
              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    ref={confirmRef}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder={t("auth.forgotPassword.reset.confirmPlaceholder")}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={(v) => {
                      onChange(v);
                      setApiError("");
                      setCodeRejected(false);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!loading}
                    returnKeyType="go"
                    onSubmitEditing={handleReset}
                  />
                )}
              />
            </View>
          </View>

          {displayError ? (
            <View className="mt-4">
              <Text className="text-center font-normal" style={{ color: colors.error }}>
                {displayError}
              </Text>
              {/* Kod hatası yalnız bu adımda anlaşılabildiği için dönüş yolu
                  hatanın hemen altında duruyor. Şifre reddedildiyse (UT-1010)
                  gösterilmez: kod hâlâ geçerli, düzeltilecek olan form. */}
              {apiError && codeRejected ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation.goBack()}
                  className="mt-3"
                >
                  <Text
                    className="text-center font-semibold"
                    style={{ color: colors.primary }}
                  >
                    {t("auth.forgotPassword.reset.retryCodeButton")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={handleReset}
            disabled={loading}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.inverseSurface,
            }}
          >
            {loading ? (
              <ActivityIndicator
                className="py-[17.5px]"
                color={colors.onInverseSurface}
              />
            ) : (
              <Text
                className="py-[20px] font-bold text-[15px] text-center"
                style={{ color: colors.onInverseSurface }}
              >
                {t("auth.forgotPassword.reset.submitButton")}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
