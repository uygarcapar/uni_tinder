import { View, Text, TouchableOpacity, Modal, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ban, Clock, Trash2, type LucideIcon } from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import type { AccountBlockPayload, AccountBlockReason } from "@/shared/utils/accountBlock";
import { colors, ink } from "../../../shared/theme/colors";
import { SUPPORT_EMAIL } from "@/shared/constants/support";

// Yaptırım tipine göre yalnız BAŞLIK ve ikon değişir. Gövde metni her zaman
// backend'den gelir (`message`): admin'in girdiği gerçek gerekçeyle zenginleşmiş
// hâlde geliyor, istemcide ikinci bir metin kaynağı tutmuyoruz.
const ICON_BY_REASON: Record<AccountBlockReason, { sf: SFSymbol; fallback: LucideIcon }> = {
  banned: { sf: "nosign", fallback: Ban },
  suspended: { sf: "clock.badge.exclamationmark.fill", fallback: Clock },
  account_deleted: { sf: "trash.fill", fallback: Trash2 },
};

interface Props {
  block: AccountBlockPayload | null;
  /** Askıda "giriş ekranına dön" — ban/silmede buton hiç render edilmez. */
  onDismiss: () => void;
}

/**
 * Ban / askı / silme süreci ekranı — kapatılamaz.
 *
 * Navigation route DEĞİL, tam ekran Modal: kök navigator `isAuthenticated`'a
 * göre MainNavigator ↔ AuthNavigator arasında geçiş yapıyor ve bu geçiş
 * NavigationContainer'ı `navigationKey` ile remount ediyor. Bir route'a
 * `reset()` atmak yaptırım anında (oturum düşerken) tam da o remount'a denk
 * gelirdi. Modal ağacın dışında durur: hem oturumlu hem oturumsuz durumda,
 * remount'tan bağımsız görünür ve altındaki her şeye dokunuşu keser.
 *
 * Android donanım geri tuşu `onRequestClose` no-op'u ile yutulur (Modal kendi
 * BackHandler'ını kurar); iOS'ta zaten kapatma jesti yok.
 */
export default function AccountBlockedScreen({ block, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!block) return null;

  const { reason, message, action, expiresAt } = block;
  const isSuspended = reason === "suspended";

  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString(getDateLocale(), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const openSupportMail = () => {
    const subject = encodeURIComponent(
      t("auth.accountBlocked.supportSubject", { code: block.errorCode }),
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {});
  };

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => {}}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 28,
          justifyContent: "center",
          gap: 20,
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            borderCurve: "continuous",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(252,33,62,0.12)",
            borderWidth: 0.5,
            borderColor: "rgba(252,33,62,0.4)",
          }}
        >
          <SFIcon
            name={ICON_BY_REASON[reason].sf}
            fallback={ICON_BY_REASON[reason].fallback}
            size={28}
            color={colors.errorStrong}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        </View>

        <Text style={{ color: colors.text, fontSize: 30, fontWeight: "700" }}>
          {t(`auth.accountBlocked.title.${reason}`)}
        </Text>

        {/* Gövde: backend gerekçesi. Boş gelirse tipine göre jenerik metin. */}
        <Text style={{ color: colors.textSecondary, fontSize: 17, lineHeight: 25 }}>
          {message || t(`auth.accountBlocked.fallback.${reason}`)}
        </Text>

        {formattedExpiry && (
          <Text style={{ color: colors.neutral200, fontSize: 15, fontWeight: "600" }}>
            {isSuspended
              ? t("auth.accountBlocked.suspensionEnds", { date: formattedExpiry })
              : t("auth.accountBlocked.deletionDate", { date: formattedExpiry })}
          </Text>
        )}

        <View style={{ gap: 12, marginTop: 12 }}>
          <TouchableOpacity
            onPress={openSupportMail}
            activeOpacity={0.85}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              backgroundColor: colors.messageOwn,
              paddingVertical: 18,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              {/* Backend `action` alanını buton etiketi olarak gönderebiliyor. */}
              {action || t("auth.accountBlocked.contactSupport")}
            </Text>
          </TouchableOpacity>

          {/* Yalnız askıda: süre dolunca gerçekten girebilecek. Ban/silmede
              göstermiyoruz — kullanıcı tekrar deneyip yine 403 yerdi. */}
          {isSuspended && (
            <TouchableOpacity
              onPress={onDismiss}
              activeOpacity={0.85}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: ink(0.2),
                paddingVertical: 18,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                {t("auth.accountBlocked.backToLogin")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
