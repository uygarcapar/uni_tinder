import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { InfoIcon } from "@/shared/icons";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import { authService } from "@/features/auth/authService";
import { emailSchema, EmailForm } from "@/shared/schemas/formSchemas";
import { colors } from "@/shared/theme/colors";
import { useTranslation } from "react-i18next";
import { devLog } from "@/shared/utils/devLog";

/**
 * Şifre sıfırlama akışının 1. adımı: e-posta → kod maili.
 *
 * Backend kullanıcı sayımını (enumeration) engellemek için e-posta KAYITLI
 * OLMASA DA isSuccess:true ve aynı mesajı döner. Bu yüzden burada "hesap var
 * mı" diye dallanmıyoruz — yanıt başarılıysa her hâlükârda kod ekranına
 * geçilir; kayıtlı olmayan adreste kullanıcı kodu asla alamaz ve geri döner.
 */
export default function ForgotPasswordScreen({
  route,
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "ForgotPassword">) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    // Login ekranında yazılmış e-posta varsa taşınır — kullanıcı aynı adresi
    // ikinci kez yazmak zorunda kalmasın.
    defaultValues: { email: route?.params?.email ?? "" },
  });

  const handleSend = handleSubmit(async ({ email }) => {
    Keyboard.dismiss();
    const trimmed = email.trim();
    setLoading(true);
    setError("");

    try {
      const response = await authService.forgotPassword(trimmed);
      if (response?.isSuccess) {
        navigation.navigate("ForgotPasswordCode", { email: trimmed });
      } else {
        setError(response?.message || t("auth.forgotPassword.errors.sendFailed"));
      }
    } catch (err: any) {
      devLog("ForgotPassword error:", err);
      setError(
        err?.response?.data?.message || t("auth.forgotPassword.errors.network"),
      );
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
            {t("auth.forgotPassword.title")}
          </Text>
          <Text
            className="text-[18px] font-normal mb-6"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.forgotPassword.description")}
          </Text>

          <Text className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
            {t("auth.forgotPassword.emailLabel")}
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
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    fontSize: 18,
                    color: colors.text,
                  }}
                  placeholder={t("auth.forgotPassword.emailPlaceholder")}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  returnKeyType="send"
                  value={value}
                  onChangeText={(v) => {
                    onChange(v);
                    setError("");
                  }}
                  onSubmitEditing={handleSend}
                />
              </View>
            )}
          />

          <View className="flex-row gap-2 px-2 items-center mt-3">
            <SFIcon
              name="info.circle"
              fallback={InfoIcon}
              size={16}
              color={colors.textSecondary}
            />
            <Text className="text-[12px] flex-1" style={{ color: colors.textSecondary }}>
              {t("auth.forgotPassword.infoText")}
            </Text>
          </View>

          {displayError ? (
            <Text className="mt-3 px-2" style={{ color: colors.error }}>
              {displayError}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4" style={{ backgroundColor: colors.bg }}>
          <AnimatedPressable
            onPress={handleSend}
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
                {t("auth.forgotPassword.submitButton")}
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
