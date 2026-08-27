import { useEffect, useState } from "react";
import { Text, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";

import AppModal from "@/shared/components/AppModal";
import { colors } from "@/shared/theme/colors";
import {
  type PremiumBenefitKey,
  premiumBenefitDetailKey,
  premiumBenefitLabelKey,
} from "@/features/profile/premiumBenefits";

/**
 * Paywall'daki özellik satırının açıklaması.
 *
 * Tablo satırı üç kelime ("Sınırsız geri alma") — kullanıcı ne aldığını
 * anlamadan satın alma butonuna basıyordu. Info ikonu bu sheet'i açıyor:
 * özelliğin ne yaptığı + ücretsiz üyelikte neyin kısıtlı olduğu.
 *
 * `stackBehavior="push"`: PurchaseModal'ın kendisi de bir bottom sheet,
 * kapanmıyor — geride kalıyor, bu sheet üstüne biniyor. Kapanınca kullanıcı
 * plan seçimine döner; açıklama okumak satın alma akışını bozmamalı.
 *
 * Yükseklik `dynamicSizing` ile içerikten: metinler 2-4 satır arasında
 * değişiyor, sabit bir snap point kısasında boşluk uzununda kesik bırakırdı.
 */
export default function PremiumBenefitInfoSheet({
  benefitKey,
  onClose,
}: {
  benefitKey: PremiumBenefitKey | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();

  // Kapanma animasyonu sürerken `benefitKey` null'a düşüyor; son gösterilen
  // maddeyi tutmazsak sheet inerken başlık ve metin bir anda boşalıyor.
  const [shown, setShown] = useState<PremiumBenefitKey | null>(benefitKey);
  useEffect(() => {
    if (benefitKey) setShown(benefitKey);
  }, [benefitKey]);

  return (
    <AppModal
      visible={!!benefitKey}
      onClose={onClose}
      title={shown ? t(premiumBenefitLabelKey(shown)) : ""}
      stackBehavior="push"
      dynamicSizing
      maxDynamicContentSize={windowHeight * 0.6}
      // X YOK: sheet tek bir açıklama paragrafı; swipe-down ve backdrop'a
      // dokunmak zaten kapatıyor, header'daki X iki satırlık içeriğin üstünde
      // gereksiz ağırlık yapıyordu (bkz. ConversationOptionsSheet).
      closeButton={false}
      // Header satırı boşaldığı için varsayılan 88px'lik üst pay fazla; drag
      // pill'in (top:20, h:4) altında metni ferah bırakacak kadarı yetiyor.
      contentContainerStyle={{ paddingTop: 72, paddingBottom: 72 }}
    >
      {/* Başlık İÇERİKTE: AppModal'ın header başlığı scroll'a bağlı fade
          ediyor (55px'ten sonra beliriyor), bu sheet ise içeriği kadar açılıp
          hiç scroll etmiyor → oradaki başlık hep opacity 0 kalırdı.
          Kısa sheet'lerin ortak paterni (bkz. ConsumablePurchaseSheet). */}
      <Text
        style={{
          color: colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 16,
        }}
      >
        {shown ? t(premiumBenefitLabelKey(shown)) : ""}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 15,
          lineHeight: 22,
          fontWeight: "500",
        }}
      >
        {shown ? t(premiumBenefitDetailKey(shown)) : ""}
      </Text>
    </AppModal>
  );
}
