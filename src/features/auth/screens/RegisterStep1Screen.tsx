import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { clearError, setRegistrationEmail } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { InfoIcon } from "lucide-react-native";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailSchema, EmailForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

export default function RegisterStep1Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep1'>) {
  const dispatch = useAppDispatch();
  const { emailVerifiedToken, registrationEmail } = useAppSelector((s) => (s as any).auth);
  const inputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { control, handleSubmit, formState: { errors } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const handleSendVerification = handleSubmit(async ({ email }) => {
    Keyboard.dismiss();
    const trimmed = email.trim();
    setLoading(true);
    setError("");

    // If user already has a valid token for this exact email, skip re-verification
    if (emailVerifiedToken && registrationEmail === trimmed) {
      console.log("⚡ [RegisterStep1] Token already exists for this email — validating before skip");
      try {
        const check = await fetch(`${API_BASE_URL}${API_ENDPOINTS.CHECK_REGISTRATION_TOKEN}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: trimmed, emailVerifiedToken }),
        });
        const checkData = await check.json();
        if (checkData.isSuccess) {
          console.log("✅ [RegisterStep1] Token valid — skipping to Step3");
          setLoading(false);
          navigation.reset({ index: 0, routes: [{ name: "RegisterStep3" }] });
          return;
        }
        console.log("⚠️ [RegisterStep1] Stored token expired — proceeding with new verification");
      } catch {
        // fall through to normal send-verification
      }
    }

    try {
      console.log("📤 [RegisterStep1] Calling send-verification for:", trimmed);
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
      console.log("📥 [RegisterStep1] send-verification status:", status);

      switch (status) {
        case "CODE_SENT":
          dispatch(setRegistrationEmail(trimmed));
          navigation.navigate("RegisterStep2", { email: trimmed, mode: "registration" });
          break;

        case "CODE_PENDING":
          dispatch(setRegistrationEmail(trimmed));
          navigation.navigate("RegisterStep2", { email: trimmed, mode: "registration", pending: true });
          break;

        case "ACCOUNT_EXISTS":
          Alert.alert(
            "Hesap Mevcut",
            data.message || "Bu maile ait bir hesap var, lütfen giriş yapın.",
            [
              { text: "İptal", style: "cancel" },
              { text: "Giriş Yap", onPress: () => navigation.navigate("Login") },
            ],
          );
          break;

        case "INVALID_DOMAIN":
          setError(data.message || "Sadece üniversite e-postası kabul edilir.");
          break;

        default:
          setError(data.message || "Kod gönderilemedi");
      }
    } catch {
      setError("Bağlantı hatası, tekrar dene");
    } finally {
      setLoading(false);
    }
  });

  const displayError = errors.email?.message || error;

  return (
    <View className="flex-1 bg-bg">
      <View className="bg-bg pt-16 pb-6 px-6">
        <TouchableOpacity activeOpacity={1} onPress={() => navigation.goBack()}>
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <Text className="text-4xl font-bold text-white mb-2">
            Üniversite E-Maili
          </Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Üniversite e-mail adresin, öğrenci olduğunu doğrulamamıza yardımcı
            olur.
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
                  borderColor: displayError ? colors.error : "rgba(255,255,255,0.1)",
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
                  placeholder="edu.tr"
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
            <InfoIcon size={16} color={colors.textSecondary} className="mt-3" />
            <Text className="text-gray-400 text-[12px]">
              Sadece akademik e-mail adresleri kabul edilir. Örnek:
              mert@university.edu.tr
            </Text>
          </View>

          {displayError ? (
            <Text className="text-red-500 mt-3 px-2">{displayError}</Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4 bg-bg">
          <AnimatedPressable
            onPress={handleSendVerification}
            disabled={loading}
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
                Devam Et
              </Text>
            )}
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
