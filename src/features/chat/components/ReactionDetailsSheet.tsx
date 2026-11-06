import { View, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";

/**
 * Balonun altındaki tepki kapsülüne dokununca açılan sheet.
 *
 *   • KENDİ tepkim varsa: kırmızı "Tepkiyi kaldır" — ikon emojinin kendisi.
 *     Kaldırma uzun-bas menüsündeki aynı emojiye tekrar basmakla AYNI yol
 *     (ChatScreen > handlePickReaction toggle-off): optimistik dispatch +
 *     kalıcı kuyruk + ret halinde geri alma orada; burada ikinci bir kaldırma
 *     yolu YAZMA.
 *   • Karşı tarafın tepkisi salt bilgi satırı (dokunulamaz).
 *
 * Kayıt `message.reactions` (emoji/count/userIds); "benim" kararı userIds ile
 * (reactionPick.ts ile aynı kural). Kullanıcı başına tek tepki var.
 */
export default function ReactionDetailsSheet({
  visible,
  message,
  myUserId,
  partnerName,
  onRemove,
  onClose,
}: {
  visible: boolean;
  message: any;
  myUserId?: string;
  partnerName?: string;
  onRemove: (emoji: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reactions: any[] = message?.reactions || [];
  const isMine = (r: any) =>
    !!myUserId && Array.isArray(r.userIds) && r.userIds.includes(myUserId);
  const mine = reactions.find(isMine);
  // Karşı tarafın tepkileri: kendi payım düşülmüş sayı > 0 olan girdiler.
  const others = reactions.filter(
    (r) => (r.count || 0) - (isMine(r) ? 1 : 0) > 0,
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("chat.reactions.title")}
      dynamicSizing
      scrollable={false}
      closeButton={false}
    >
      <View style={{ gap: 8, paddingTop: 8, paddingBottom: 8 }}>
        {others.map((r) => (
          <View
            key={r.emoji}
            style={{
              borderRadius: 36,
              borderCurve: "continuous",
              borderWidth: 0.5,
              borderColor: colors.hairline,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              paddingHorizontal: 20,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
              {partnerName || t("chat.defaultUserName")}
            </Text>
            <Text style={{ fontSize: 22 }}>{r.emoji}</Text>
          </View>
        ))}

        {mine && (
          // ConversationOptionsSheet'in yıkıcı satırıyla AYNI kalıp (dolu
          // errorStrong + onInverseSurface mürekkep) — iki sheet yan yana
          // açılan aynı sohbetin parçası.
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              onClose();
              onRemove(mine.emoji);
            }}
            style={{
              borderRadius: 36,
              borderCurve: "continuous",
              backgroundColor: colors.errorStrong,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 14,
              paddingHorizontal: 20,
            }}
          >
            <Text
              style={{
                color: colors.onInverseSurface,
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              {t("chat.reactions.remove")}
            </Text>
            <Text style={{ fontSize: 22 }}>{mine.emoji}</Text>
          </TouchableOpacity>
        )}
      </View>
    </AppModal>
  );
}
