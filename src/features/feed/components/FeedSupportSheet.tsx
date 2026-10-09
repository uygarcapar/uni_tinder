import { Linking, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";

/**
 * Destek kaynakları — `supportResources: true` geldiğinde.
 *
 * Sunucu gönderide/yanıtta kendine zarar sinyali gördüğünde içeriği YAYINA
 * ALMIYOR ve bu bayrağı dönüyor (hak da düşmüyor). Burada tek iş: yargılamadan,
 * tek ekranda, aranabilir bir yer göstermek.
 *
 * ⚠️ Bu sheet bir HATA ekranı gibi davranmıyor: "gönderin yayınlanmadı" cümlesi
 * ÖNE ÇIKARILMIYOR. O an kullanıcının ihtiyacı moderasyon açıklaması değil.
 *
 * Numaralar TÜRKİYE içindir ve koda gömülü — backend bu uçta kaynak listesi
 * döndürmüyor (sözleşme §5'te yalnız bayrak var). Backend bir gün liste
 * dönerse burası ona bağlanmalı.
 */

interface Resource {
  labelKey: string;
  /** `tel:` ya da `https:` — ikisi de Linking.openURL ile açılıyor. */
  url: string;
}

const RESOURCES: Resource[] = [
  // 112 acil çağrı — hayati tehlike anında tek doğru numara.
  { labelKey: "feed.support.emergency", url: "tel:112" },
  // Sağlık Bakanlığı psikososyal destek hattı.
  { labelKey: "feed.support.helpline", url: "tel:182" },
];

export interface FeedSupportSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function FeedSupportSheet({
  visible,
  onClose,
}: FeedSupportSheetProps) {
  const { t } = useTranslation();

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t("feed.support.title")}
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
        {t("feed.support.body")}
      </Text>

      <View style={{ marginTop: 18 }}>
        {RESOURCES.map((r) => (
          <Pressable
            key={r.url}
            // Hata yutuluyor: hattı açamamak (ör. tabletten arama yok) bu
            // ekranda bir uyarı penceresi açmayı hak etmiyor.
            onPress={() => Linking.openURL(r.url).catch(() => {})}
            style={{
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 16,
              borderCurve: "continuous",
              backgroundColor: colors.surface,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 15.5, fontWeight: "600", color: colors.text }}>
              {t(r.labelKey)}
            </Text>
          </Pressable>
        ))}
      </View>
    </AppModal>
  );
}
