import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import ConsumablePurchaseSheet from "@/features/discover/components/ConsumablePurchaseSheet";
import {
  getRecoveryOffering,
  purchaseRecoveryPack,
} from "@/features/profile/subscriptionService";
import { RECOVERY_REDEEM_FLOW } from "@/features/discover/recoveryRedeem";

/**
 * Kaçırılan eşleşme kurtarma paketi (consumable) satın alma sheet'i.
 *
 * SuperLike sheet'iyle aynı kabuk (ConsumablePurchaseSheet), farklı config.
 * Kurtarma hakkı 2026-08-22'den beri free'de YALNIZCA buradan geliyor (tier
 * kotası 0), premium'da tier kotasının üstüne ekleniyor.
 *
 * `onUpsellPremium` verilirse footer'da "abonelik de bu hakkı veriyor"
 * bağlantısı çizilir. Çağıran bunu YALNIZ free kullanıcıda geçmeli — sözleşme
 * §3: premium'a abonelik teklifi gösterilmemeli, ona satılacak tek şey paket.
 */
export default function RecoveryPurchaseModal({
  visible,
  onClose,
  onPurchased,
  onUpsellPremium,
}: {
  visible: boolean;
  onClose?: () => void;
  onPurchased?: (result: unknown) => void;
  onUpsellPremium?: (() => void) | null;
}) {
  const { t } = useTranslation();
  return (
    <ConsumablePurchaseSheet
      visible={visible}
      onClose={onClose}
      onPurchased={onPurchased}
      flow={RECOVERY_REDEEM_FLOW}
      fetchOffering={getRecoveryOffering}
      purchasePack={purchaseRecoveryPack}
      i18nPrefix="recoveryPurchase"
      analyticsKind="recovery_pack"
      toastIcon="recovery"
      renderGlyph={(size, color) => (
        <SFIcon
          name="arrow.counterclockwise"
          fallback={RotateCcw}
          size={size}
          color={color}
          strokeWidth={2}
          weight="semibold"
        />
      )}
      secondaryAction={
        onUpsellPremium
          ? {
              label: t("recoveryPurchase.premiumUpsell"),
              onPress: onUpsellPremium,
            }
          : null
      }
    />
  );
}
