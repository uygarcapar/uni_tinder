import { View, Text, TouchableOpacity, Alert } from "react-native";
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
  const textColor = destructive ? "#000" : accent ? colors.success : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        borderRadius: 36,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: destructive ? colors.errorStrong : "rgba(255,255,255,0.1)",
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

export default function ConversationOptionsSheet({
  visible,
  onClose,
  isActive = true,
  canRestore = false,
  onUnmatch,
  onRestore,
  onReport,
  onBlock,
}: any) {
  const handleUnmatch = () => {
    Alert.alert(
      "Eşleşmeyi kaldır",
      "Sohbet 24 saat içinde geri alınabilir. Sonra kalıcı olarak kapanır.",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Kaldır",
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
      "Kullanıcıyı engelle",
      "Bu kişi sana mesaj atamayacak ve profili sana gösterilmeyecek. Eşleşmeniz kaldırılır.",
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Engelle",
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
      title="Sohbet Ayarları"
      snapPoints={["45%", "90%"]}
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36 }}
    >
      <Section
        title="Sohbet"
        description="Bu sohbete özel hızlı eylemler."
        marginTop={4}
      />
      {isActive && (
        <ActionRow
          icon={<SFIcon name="person.fill.badge.minus" fallback={UserMinus} size={18} color="#000" strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
          label="Eşleşmeyi Kaldır"
          onPress={handleUnmatch}
          destructive
        />
      )}
      {!isActive && canRestore && (
        <ActionRow
          icon={<SFIcon name="arrow.counterclockwise" fallback={RotateCcw} size={18} color={colors.success} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
          label="Eşleşmeyi Geri Al"
          onPress={() => {
            onClose();
            onRestore?.();
          }}
          accent
        />
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
            Bu sohbet sonlandırıldı. Geri alma süresi doldu.
          </Text>
        </View>
      )}

      <Section
        title="Güvenlik"
        description="Kullanıcıyı şikayet edebilir veya engelleyebilirsin."
      />
      <ActionRow
        icon={<SFIcon name="flag.fill" fallback={Flag} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
        label="Şikayet Et"
        onPress={() => {
          onClose();
          onReport?.();
        }}
        marginBottom={8}
      />
      <ActionRow
        icon={<SFIcon name="nosign" fallback={Ban} size={18} color="#000" strokeWidth={1.5} style={{ pointerEvents: "none" }} />}
        label="Kullanıcıyı Engelle"
        onPress={handleBlock}
        destructive
      />
    </AppModal>
  );
}
