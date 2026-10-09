import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";
import { formatQuotaReset } from "../feedText";

/**
 * Günlük hak bitti (UT-7304 / UT-7322).
 *
 * ⚠️ BU BİR PAYWALL DEĞİL ve olmamalı: akış hakkı SATIN ALINAMIYOR (consumable
 * ürün yok), Plus yalnız günlük tavanı yükseltiyor. Bu yüzden `paywallType`
 * (FEED_POST_LIMIT / FEED_REPLY_LIMIT) geldiğinde Plus sayfası AÇILMIYOR;
 * burada yumuşak bir satır olarak duruyor. Sert paywall göstermek, kullanıcıya
 * alamayacağı bir şeyi satmaya çalışmak olurdu.
 *
 * Saat `nextResetAt`ten; "20:30" SABİT YAZILMIYOR — sunucu İstanbul'a göre
 * hesaplıyor, cihazın saat dilimi başka olabilir.
 */

export interface FeedQuotaSheetProps {
  visible: boolean;
  onClose: () => void;
  nextResetAt: string | null;
  /** Free kullanıcıya yumuşak Plus satırı; premium'da hiç çizilmiyor. */
  showPlusOffer: boolean;
  onPlusPress: () => void;
}

export default function FeedQuotaSheet({
  visible,
  onClose,
  nextResetAt,
  showPlusOffer,
  onPlusPress,
}: FeedQuotaSheetProps) {
  const { t } = useTranslation();
  const resetLine = formatQuotaReset(nextResetAt, t);

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.quota.exhaustedTitle")}
      dynamicSizing
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 28 }}
    >
      <Text
        style={{
          fontSize: 15,
          lineHeight: 21,
          color: colors.textSecondary,
          marginTop: 4,
        }}
      >
        {/* Saat biliniyorsa onu söyle, bilinmiyorsa genel cümle — uydurma
            saat yanlış bekleme yaratır. */}
        {resetLine ?? t("feed.quota.exhaustedBody")}
      </Text>

      {showPlusOffer ? (
        <Pressable
          onPress={onPlusPress}
          style={{
            marginTop: 20,
            paddingVertical: 13,
            paddingHorizontal: 18,
            borderRadius: 999,
            borderCurve: "continuous",
            backgroundColor: colors.litPlus,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: colors.onMediaInverse,
            }}
          >
            {t("feed.quota.plusOffer")}
          </Text>
        </Pressable>
      ) : (
        <View style={{ height: 4 }} />
      )}
    </AppModal>
  );
}
