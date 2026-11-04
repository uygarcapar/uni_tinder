import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { Flag, Trash2 } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";
import { getDateLocale } from "@/shared/i18n/dateLocale";
import toDisplayLowercase from "@/shared/utils/textCase";
import { formatPostTimestamp } from "../feedText";
import type { FeedPostDto } from "../feedTypes";

/**
 * Akış kartındaki üç noktanın açtığı ara menü — tarih + TEK aksiyon.
 *
 * ProfileOptionsSheet'in kardeşi, kopyası değil: oradaki "Güvenlik" bölümü
 * (şikayet + engelle) bir KİŞİYİ hedefliyor, burası bir GÖNDERİYİ. Engelleme
 * satırı bilerek yok — anonim gönderide engellenecek kimlik de yok, kimlikli
 * gönderide o yol yazarın profil kartından geçiyor. Kendi gönderinde şikayet
 * de yok (kendini şikayet etmek anlamsız): `isMine` ekseni satırı "Sil"e
 * çevirir, iki satırı yan yana koymaz.
 *
 * ONAY BU DOSYADA SORULMUYOR: silme onayı çağıranda (FeedScreen >
 * handleDeletePost'un Alert'i) — ProfileOptionsSheet'in engelleme onayıyla
 * aynı karar, aynı gerekçe (soru iki kez sorulmasın).
 */

/**
 * Tarih — AKSİYONUN ALTINDA, ikonsuz footer (istek: "saat ikonunu kaldır ve
 * butonların en altına koy"). İlk sürümde üstte saat ikonlu bir satırdı;
 * ortalı küçük gri metin, kapsül butonun altında imza gibi okunuyor.
 */
function TimestampFooter({
  createdAt,
}: {
  createdAt: string | null | undefined;
}) {
  const { t } = useTranslation();
  const label = toDisplayLowercase(
    formatPostTimestamp(createdAt, t, getDateLocale()),
  );
  if (!label) return null;
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontSize: 14,
        fontWeight: "400",
        textAlign: "center",
        marginTop: 14,
      }}
    >
      {label}
    </Text>
  );
}

// ProfileOptionsSheet'teki satırın aynısı (o da SettingsModal'ın pill
// patterninden geliyor): radius 36, 0.5 kenar, solda etiket sağda ikon;
// destructive olan dolu kırmızı zemin + ters renk metin alır.
function ActionRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
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

export default function FeedPostOptionsSheet({
  visible,
  onClose,
  post,
  onReport,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  post: FeedPostDto | null;
  onReport?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.options.title")}
      // Akış kartı bir sheet değil (liste satırı), altında minimize edilecek
      // bir sheet yok → stackBehavior gerekmiyor (DiscoverScreen'deki
      // ProfileOptionsSheet ile aynı gerekçe).
      // Tarih + tek satırlık sheet: detent içerikten ölçülüyor (bkz.
      // ProfileOptionsSheet'teki dynamicSizing notu).
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.6}
      // X YOK: swipe-down ve backdrop zaten kapatıyor (aynı karar).
      closeButton={false}
      contentContainerStyle={{ paddingTop: 36, paddingBottom: 48 }}
    >
      {post?.isMine ? (
        <ActionRow
          icon={
            <SFIcon
              name="trash.fill"
              fallback={Trash2}
              size={18}
              color={colors.onInverseSurface}
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          }
          label={t("feed.mine.delete")}
          onPress={() => {
            onClose();
            onDelete?.();
          }}
          destructive
        />
      ) : (
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
        />
      )}
      <TimestampFooter createdAt={post?.createdAt} />
    </AppModal>
  );
}
