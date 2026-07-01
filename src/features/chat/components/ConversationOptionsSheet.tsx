import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  Search,
  UserMinus,
  RotateCcw,
  AlertTriangle,
  Flag,
  Ban,
  InfoIcon,
} from "lucide-react-native";
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
          <InfoIcon size={16} color={colors.textSecondary} />
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

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  accent?: boolean;
}) {
  const textColor = destructive
    ? colors.error
    : accent
    ? colors.success
    : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: "rgba(255,255,255,0.08)",
      }}
    >
      <View style={{ width: 28, alignItems: "center" }}>{icon}</View>
      <Text
        style={{
          color: textColor,
          fontSize: 16,
          fontWeight: "500",
          marginLeft: 12,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ConversationOptionsSheet({
  visible,
  onClose,
  isActive = true,
  canRestore = false,
  onSearch,
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
    >
      <Section
        title="Sohbet"
        description="Bu sohbete özel hızlı eylemler."
        marginTop={20}
      />
      {isActive && (
        <ActionRow
          icon={<Search size={22} color={colors.text} />}
          label="Sohbette Ara"
          onPress={() => {
            onClose();
            onSearch?.();
          }}
        />
      )}
      {isActive && (
        <ActionRow
          icon={<UserMinus size={22} color={colors.error} />}
          label="Eşleşmeyi Kaldır"
          onPress={handleUnmatch}
          destructive
        />
      )}
      {!isActive && canRestore && (
        <ActionRow
          icon={<RotateCcw size={22} color={colors.success} />}
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
          <AlertTriangle
            size={18}
            color={colors.textSecondary}
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
        icon={<Flag size={22} color={colors.warning} />}
        label="Şikayet Et"
        onPress={() => {
          onClose();
          onReport?.();
        }}
      />
      <ActionRow
        icon={<Ban size={22} color={colors.error} />}
        label="Kullanıcıyı Engelle"
        onPress={handleBlock}
        destructive
      />
    </AppModal>
  );
}
