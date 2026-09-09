import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import { colors } from "../../../shared/theme/colors";

/**
 * Kalıcı hesap silme onayı — DELETE /api/privacy/account şifre zorunlu tutuyor
 * (işlem geri alınamaz olduğu için niyet teyidi, bkz. PrivacyController).
 *
 * Şifre alanı BİLEREK yerel state'te: AuthPillField react-hook-form `control`
 * istiyor, tek alanlık bu modal için bütün bir form kurmaya değmez. Pill'in
 * görünümü AuthPillField'dan bire bir alındı.
 *
 * `serverError` dışarıdan geliyor — INVALID_PASSWORD'ü ekran yakalayıp buraya
 * veriyor ki modal kapanmadan kullanıcı tekrar deneyebilsin.
 */
export default function DeleteAccountModal({
  visible,
  onClose,
  onConfirm,
  loading,
  serverError,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  loading: boolean;
  serverError: string | null;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [secure, setSecure] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<TextInput | null>(null);

  // Her açılışta sıfırla — önceki denemenin şifresi/hatası taşınmasın.
  useEffect(() => {
    if (!visible) return;
    setPassword("");
    setSecure(true);
    setLocalError(null);
  }, [visible]);

  const error = localError ?? serverError;

  const submit = () => {
    if (loading) return;
    if (!password.trim()) {
      setLocalError(t('deleteAccount.passwordRequired'));
      inputRef.current?.focus();
      return;
    }
    setLocalError(null);
    onConfirm(password);
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('deleteAccount.alertTitle')}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            marginBottom: 24,
          }}
        >
          {t('deleteAccount.alertMsg')}
        </Text>

        <Text
          style={{
            color: colors.neutral200,
            fontSize: 14,
            fontWeight: "600",
            marginBottom: 8,
          }}
        >
          {t('deleteAccount.passwordLabel')}
        </Text>
        <View
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: error ? colors.error : colors.hairline,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
          }}
        >
          <TextInput
            ref={inputRef}
            style={{ flex: 1, paddingVertical: 16, fontSize: 18, color: colors.text }}
            placeholder={t('deleteAccount.passwordPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={(next) => {
              setPassword(next);
              if (error) setLocalError(null);
            }}
            secureTextEntry={secure}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <TouchableOpacity activeOpacity={0.7} onPress={() => setSecure((v) => !v)}>
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
        </View>

        <Text
          style={{
            color: error ? colors.error : colors.textSecondary,
            fontSize: 13,
            marginTop: 8,
            marginLeft: 4,
          }}
        >
          {error ?? t('deleteAccount.passwordHint')}
        </Text>

        <TouchableOpacity
          onPress={submit}
          disabled={loading}
          activeOpacity={0.8}
          style={{
            marginTop: 28,
            borderRadius: 36,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.errorStrong,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 16,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.onInverseSurface} />
          ) : null}
          <Text
            style={{
              color: colors.onInverseSurface,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {loading ? t('deleteAccount.deleting') : t('deleteAccount.confirm')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onClose}
          disabled={loading}
          activeOpacity={0.8}
          style={{ marginTop: 12, padding: 16, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
            {t('deleteAccount.cancel')}
          </Text>
        </TouchableOpacity>
      </View>
    </AppModal>
  );
}
