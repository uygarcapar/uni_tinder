import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import {
  UserMinus,
  RotateCcw,
  AlertTriangle,
  Flag,
  Ban,
  InfoIcon,
} from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import { formatRestoreWindow } from "@/features/chat/restoreWindow";
import { colors } from "../../../shared/theme/colors";

function Section({
  title,
  description,
  marginTop = 28,
}: {
  title: string;
  description?: string;
  marginTop?: number;
}) {
  return (
    <View
      style={{
        flexDirection: "column",
        alignItems: "flex-start",
        marginTop,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: description ? 9 : 0,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
          {title}
        </Text>
      </View>
      {description ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingRight: 16,
            marginBottom: 4,
          }}
        >
          <SFIcon name="info.circle" fallback={InfoIcon} size={16} color={colors.textSecondary} strokeWidth={2} weight="semibold" />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {description}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// SettingsModal'daki satır patterni: pill (radius 36), 0.5 border, solda etiket
// sağda ikon. Destructive olanlar divider yerine dolu kırmızı zemin + siyah
// metin/ikon alır (SettingsModal "Hesabı Sil" ile birebir aynı).
function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  accent,
  marginBottom = 0,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  accent?: boolean;
  marginBottom?: number;
}) {
  const textColor = destructive ? colors.onInverseSurface : accent ? colors.success : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        borderRadius: 36,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: destructive ? colors.errorStrong : colors.hairline,
        backgroundColor: destructive ? colors.errorStrong : undefined,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        paddingHorizontal: 20,
        marginBottom,
      }}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: textColor, fontSize: 15, fontWeight: "500" }}>
            {label}
          </Text>
        </View>
        {icon}
      </View>
    </TouchableOpacity>
  );
}

/**
 * İki ayrı niyet, İKİ AYRI AKSİYON (ürün kararı):
 *   • "Eşleşmeyi Kaldır" — yumuşak: sohbet kapanır, MESAJLAR SİLİNMEZ, bir süre
 *     sonra çift tekrar eşleşebilir ("anılar canlanır").
 *   • "Şikayet Et / Engelle" — kalıcı: bir daha asla eşleşilmez, geçmiş açılmaz.
 * Tek bir "unmatch" butonu bırakmak taciz senaryosunda kullanıcıyı korumazdı —
 * o kişi cooldown bitince deck'te yeniden görünürdü.
 */
export default function ConversationOptionsSheet({
  visible,
  onClose,
  isActive = true,
  canRestore = false,
  restorableUntil,
  onUnmatch,
  onRestore,
  onReport,
  onBlock,
}: any) {
  const { t } = useTranslation();
  // Kalan süre SUNUCU damgasından — pencere uzunluğu backend config'inde,
  // istemci "24 saat" varsaymaz (bkz. restoreWindow.ts).
  const restoreWindow = canRestore ? formatRestoreWindow(restorableUntil, t) : null;

  const handleUnmatch = () => {
    Alert.alert(
      t("chat.unmatch.title"),
      // Geri alma penceresinin VAR olup olmadığı ancak sunucu yanıtında belli
      // olur (rematch limiti dolmuş olabilir) — burada vaat etmiyoruz.
      t("chat.unmatch.confirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("chat.unmatch.confirmButton"),
          style: "destructive",
          onPress: () => {
            onClose();
            onUnmatch?.();
          },
        },
      ],
    );
  };

  const handleBlock = () => {
    Alert.alert(
      t("chat.block.confirmTitle"),
      t("chat.block.confirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("chat.block.confirmButton"),
          style: "destructive",
          onPress: () => {
            onClose();
            onBlock?.();
          },
        },
      ],
    );
  };

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("chat.options.title")}
      snapPoints={["45%", "90%"]}
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36 }}
    >
      <Section
        title={t("chat.options.sectionChat")}
        description={t("chat.options.sectionChatDescription")}
        marginTop={4}
      />
      {isActive && (
        <ActionRow
          icon={<SFIcon name="person.fill.badge.minus" fallback={UserMinus} size={18} color={colors.onInverseSurface} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
          label={t("chat.options.unmatch")}
          onPress={handleUnmatch}
          destructive
        />
      )}
      {!isActive && canRestore && (
        <>
          <ActionRow
            icon={<SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={18} color={colors.success} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
            label={t("chat.options.restore")}
            onPress={() => {
              onClose();
              onRestore?.();
            }}
            accent
          />
          {restoreWindow ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 13,
                marginTop: 10,
                paddingHorizontal: 4,
              }}
            >
              {t("chat.unmatch.restoreWindowHint", { time: restoreWindow })}
            </Text>
          ) : null}
        </>
      )}
      {!isActive && !canRestore && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            paddingVertical: 10,
            paddingRight: 16,
          }}
        >
          <SFIcon
            name="exclamationmark.triangle.fill"
            fallback={AlertTriangle}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: "400",
              flex: 1,
            }}
          >
            {t("chat.options.restoreExpired")}
          </Text>
        </View>
      )}

      <Section
        title={t("chat.options.sectionSafety")}
        description={t("chat.options.sectionSafetyDescription")}
      />
      <ActionRow
        icon={<SFIcon name="flag.fill" fallback={Flag} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
        label={t("chat.options.report")}
        onPress={() => {
          onClose();
          onReport?.();
        }}
        marginBottom={8}
      />
      <ActionRow
        icon={<SFIcon name="nosign" fallback={Ban} size={18} color={colors.onInverseSurface} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
        label={t("chat.options.block")}
        onPress={handleBlock}
        destructive
      />
    </AppModal>
  );
}
