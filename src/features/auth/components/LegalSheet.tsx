import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import AppModal, { SHEET_TOP_RADIUS_LARGE } from "@/shared/components/AppModal";
import PolicyMarkdown from "@/shared/components/PolicyMarkdown";
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
 *
 * Kabuk `AppModal` — uygulamanın tek modal yapısı. Önceden ham `AppBottomSheet`
 * üstüne elle yazılmış bir başlık satırı (ikon + 22px başlık + yuvarlak X)
 * duruyordu; o düzen uygulamanın geri kalanındaki progressive-blur header'dan
 * ayrı kalıyordu. Başlık artık header'ın işi (`titleAlign="left"` → hep görünür,
 * X'in solunda), ikon da onunla birlikte kalktı: AppModal header'ında ikon slotu
 * yok ve aynı başlığı iki kez yazmanın anlamı yoktu.
 */
const DOCS = {
  terms: {
    headerPrefix: "auth.legal.terms",
    sectionPrefix: "auth.legal.terms",
    sectionCount: 8,
  },
  privacy: {
    headerPrefix: "auth.legal.privacy",
    sectionPrefix: "auth.kvkkConsent",
    // Aydınlatma metni 1.0 → 15 bölüm (4 ve 5 fotoğraf doğrulamanın iki açık
    // rızası). `tr.ts`/`en.ts`'teki bölüm sayısıyla birebir olmalı; fazlası boş
    // başlık, eksiği sessizce kırpılmış metin.
    sectionCount: 15,
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
    <AppModal
      visible={!!document}
      onClose={onClose}
      title={t(`${doc.headerPrefix}.title`)}
      // Uzun okuma metni — sheet en üste kadar açılıyor (topInset safe area,
      // yani header çentiğin altında kalıyor). Köşe yarıçapı da tam ekrana
      // yakın açılan sheet'lerin opt-in'i: aynı 36 bu boyda daha keskin
      // okunuyordu.
      fullScreen
      cornerRadius={SHEET_TOP_RADIUS_LARGE}
      // X, ProfileEditModal'ın (ve profil başlığındaki çan/ayarların) BİREBİR
      // aynı butonu: kabuğu olmayan berrak cam, yuvarlak, GLASS_ICON_CLEAR_SIZE
      // çapında. Ölçüyü bu knob veriyor — satırın kendi payları (üstten 20,
      // sağdan 16) ikisinde de varsayılan ve ikisi de `fullScreen`, yani
      // buton ekranın sağına/üstüne ProfileEditModal'ın onay butonuyla aynı
      // uzaklıkta duruyor.
      clearGlassHeader
      // Başlık belgenin kimliği; scroll'u bekleyip belirmesinin anlamı yok.
      titleAlign="left"
      // Metnin son satırı ekranın dibine yapışmasın. Header payı (74) ve yatay
      // pay (20) AppModal'dan geliyor.
      contentContainerStyle={{ paddingBottom: 56 }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          marginTop: 4,
          marginBottom: 20,
        }}
      >
        {t(`${doc.headerPrefix}.description`)}
      </Text>

      <View style={{ gap: 16 }}>
        {Array.from({ length: doc.sectionCount }, (_, i) => i + 1).map((n) => (
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
            <PolicyMarkdown
              source={t(`${doc.sectionPrefix}.section${n}Content`)}
            />
          </View>
        ))}
      </View>
    </AppModal>
  );
}
