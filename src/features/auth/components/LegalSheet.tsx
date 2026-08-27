import { View, Text, TouchableOpacity } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { FileText, ShieldCheck, X } from "lucide-react-native";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";

export type LegalDocument = "terms" | "privacy";

/**
 * Kullanım Koşulları / Gizlilik metinlerini SALT OKUNUR gösteren sheet.
 * Onay istemez — onay akışı KVKKConsentScreen'in işi.
 *
 * Gizlilik bölümleri BİLEREK `auth.kvkkConsent.*` altından okunur: aynı metni
 * iki ayrı i18n bloğunda tutarsak biri güncellenip diğeri bayatlıyor. Burada
 * yalnız başlık/açıklama ayrı (`auth.legal.privacy.*`), çünkü onay ekranının
 * açıklaması "okuyup onayla" diyor, salt okunur görünümde yanlış duruyor.
 */
const DOCS = {
  terms: {
    headerPrefix: "auth.legal.terms",
    sectionPrefix: "auth.legal.terms",
    sectionCount: 8,
    sfIcon: "doc.text.fill",
    fallbackIcon: FileText,
  },
  privacy: {
    headerPrefix: "auth.legal.privacy",
    sectionPrefix: "auth.kvkkConsent",
    sectionCount: 6,
    sfIcon: "checkmark.shield.fill",
    fallbackIcon: ShieldCheck,
  },
} as const;

interface LegalSheetProps {
  /** Açılacak belge; null/undefined ise sheet kapalı. */
  document: LegalDocument | null;
  onClose: () => void;
}

export default function LegalSheet({ document, onClose }: LegalSheetProps) {
  const { t } = useTranslation();
  // document null olduğunda da config'e ihtiyacımız var: sheet kapanma
  // animasyonu boyunca içerik render edilmeye devam ediyor, aksi halde metin
  // kapanırken bir anda boşalıyor.
  const doc = DOCS[document ?? "terms"];

  return (
    <AppBottomSheet
      visible={!!document}
      onClose={onClose}
      snapPoints={["92%"]}
      handleComponent={null}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <SFIcon
            name={doc.sfIcon}
            fallback={doc.fallbackIcon}
            size={26}
            color={colors.text}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
          <Text
            style={{
              color: colors.text,
              fontSize: 22,
              fontWeight: "700",
              flex: 1,
            }}
          >
            {t(`${doc.headerPrefix}.title`)}
          </Text>

          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.hairlineSoft,
            }}
          >
            <SFIcon
              name="xmark"
              fallback={X}
              size={14}
              color={colors.textSecondary}
              strokeWidth={2}
              weight="semibold"
            />
          </TouchableOpacity>
        </View>

        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 20,
            paddingHorizontal: 24,
            marginBottom: 8,
          }}
        >
          {t(`${doc.headerPrefix}.description`)}
        </Text>

        <BottomSheetScrollView
          style={{ flex: 1, marginHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 64 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ padding: 8, gap: 16 }}>
            {Array.from({ length: doc.sectionCount }, (_, i) => i + 1).map(
              (n) => (
                <View key={n} style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 20,
                      fontWeight: "600",
                      marginBottom: 12,
                    }}
                  >
                    {t(`${doc.sectionPrefix}.sectionTitle${n}`)}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    {t(`${doc.sectionPrefix}.section${n}Content`)}
                  </Text>
                </View>
              ),
            )}
          </View>
        </BottomSheetScrollView>
      </View>
    </AppBottomSheet>
  );
}
