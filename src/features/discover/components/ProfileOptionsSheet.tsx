import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Flag, Ban, InfoIcon } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";

/**
 * Beğeni kartının şeridindeki üç noktanın açtığı menü — YALNIZ GÜVENLİK.
 *
 * ConversationOptionsSheet'in kardeşi, kopyası değil: oradaki "Sohbet" bölümü
 * (eşleşmeyi kaldır / geri al) burada olamaz çünkü HENÜZ EŞLEŞME YOK — kart
 * karşı tarafın beğenisi, kullanıcı ona daha yanıt vermemiş. Kaldırılacak bir
 * eşleşme, geri alınacak bir sohbet de yok; geriye iki satır kalıyor.
 *
 * Metinler de o yüzden `chat.options.*` DEĞİL `moderation.options.*`: sohbet
 * dilinde konuşan açıklama ("eski sohbet açılmaz") burada yanlış olurdu — aynı
 * ayrım `moderation.block.*` ile `chat.block.*` arasında da var.
 *
 * ONAY BU DOSYADA SORULMUYOR: engelleme onayını çağıran taraf zaten soruyor
 * (LikerSwipeModal > handleBlockPress) ve o akış kartın altındaki kırmızı
 * satırla ORTAK. Buraya ikinci bir Alert koymak aynı soruyu iki kez sordururdu.
 */
function Section({ title, description }: { title: string; description?: string }) {
  return (
    <View style={{ alignItems: "flex-start", marginTop: 4, marginBottom: 10 }}>
      <Text
        style={{
          color: colors.text,
          fontSize: 20,
          fontWeight: "600",
          marginBottom: description ? 9 : 0,
        }}
      >
        {title}
      </Text>
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
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            strokeWidth={2}
            weight="semibold"
          />
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

// ConversationOptionsSheet'teki satırın aynısı (o da SettingsModal'ın pill
// patterninden geliyor): radius 36, 0.5 kenar, solda etiket sağda ikon;
// destructive olan dolu kırmızı zemin + ters renk metin alır.
function ActionRow({
  icon,
  label,
  onPress,
  destructive,
  marginBottom = 0,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  marginBottom?: number;
}) {
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: destructive ? colors.onInverseSurface : colors.text,
              fontSize: 15,
              fontWeight: "500",
            }}
          >
            {label}
          </Text>
        </View>
        {icon}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileOptionsSheet({
  visible,
  onClose,
  onReport,
  onBlock,
  stackBehavior,
}: any) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("moderation.options.title")}
      // Menü kart sheet'inin ÜSTÜNE açılıyor: `push` onu yerinde bırakır,
      // gorhom'un varsayılanı ("switch") minimize edip `visible`ını
      // kilitliyordu (bkz. AppBottomSheet'teki watchdog notu).
      stackBehavior={stackBehavior}
      // İki satırlık sheet: detent içerikten ölçülüyor, sabit yüzde verilirse
      // altında kocaman bir boşluk kalıyordu (bkz. PremiumBenefitInfoSheet).
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.6}
      // X YOK: swipe-down ve backdrop zaten kapatıyor, iki satırın üstünde
      // fazladan ağırlık yapıyordu (ConversationOptionsSheet ile aynı karar).
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36, paddingBottom: 48 }}
    >
      <Section
        title={t("moderation.options.sectionSafety")}
        description={t("moderation.options.sectionSafetyDescription")}
      />
      <ActionRow
        icon={
          <SFIcon
            name="flag.fill"
            fallback={Flag}
            size={18}
            color={colors.text}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        }
        label={t("moderation.options.report")}
        onPress={() => {
          onClose();
          onReport?.();
        }}
        marginBottom={8}
      />
      <ActionRow
        icon={
          <SFIcon
            name="nosign"
            fallback={Ban}
            size={18}
            color={colors.onInverseSurface}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        }
        label={t("moderation.options.block")}
        onPress={() => {
          onClose();
          onBlock?.();
        }}
        destructive
      />
    </AppModal>
  );
}
