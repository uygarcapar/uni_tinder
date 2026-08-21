import { memo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { REVEAL_MAX } from "@/features/chat/components/RevealContext";
import { colors, ink } from "../../../shared/theme/colors";

/** Liste verisindeki sanal satırın kimliği — keyExtractor ve getItemType okur. */
export const HIDDEN_HISTORY_ROW_ID = "__hidden_history__";

/**
 * Rematch kapısı: aynı çift tekrar eşleştiğinde eski mesajlar OTOMATİK AÇILMAZ
 * (karşı taraf o konuşmayı hatırlamıyor olabilir; geçmişin aniden geri gelmesi
 * tekinsiz). Bunun yerine sohbetin en üstünde bu kapı durur.
 *
 * Geçmiş ORTAKTIR — bir taraf açınca ikisi de görür (backend karşı tarafa
 * ConversationHistoryRevealed yayınlar).
 *
 * "Yükleniyor" state'i BURADA yerel: liste satırı itemsAreEqual ile yapısal
 * karşılaştırılıyor, busy'yi yukarıda tutmak her basışta veri kimliğini
 * değiştirip listeyi yeniden kurdururdu.
 */
const HiddenHistoryBanner = memo(function HiddenHistoryBanner({
  onReveal,
}: {
  onReveal: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onReveal();
    } finally {
      setBusy(false);
    }
  };

  return (
    // Ekran alanında ortala: sağdaki REVEAL_MAX şeridi saat kolonuna ait.
    <View className="items-center px-4 py-3" style={{ marginRight: REVEAL_MAX }}>
      <View
        className="px-4 py-3 border items-center"
        style={{
          backgroundColor: colors.surface5,
          borderColor: colors.surface3,
          borderRadius: 24,
          borderCurve: "continuous",
          maxWidth: 320,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <SFIcon
            name="bubble.left.and.bubble.right.fill"
            fallback={MessageSquare}
            size={16}
            color={colors.textPlaceholder}
            strokeWidth={2}
            weight="semibold"
          />
          <Text className="text-[15px]" style={{ color: colors.textPlaceholder }}>
            {t("chat.hiddenHistory.title")}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handlePress}
          disabled={busy}
          activeOpacity={0.8}
          className="mt-3 px-4 py-2"
          style={{
            borderRadius: 20,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: ink(0.14),
            minWidth: 160,
            alignItems: "center",
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text
              className="text-[15px] font-semibold"
              style={{ color: colors.text }}
            >
              {t("chat.hiddenHistory.action")}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default HiddenHistoryBanner;
