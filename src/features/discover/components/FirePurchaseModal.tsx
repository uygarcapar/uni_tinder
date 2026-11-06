import { useTranslation } from "react-i18next";
import FireGlyph from "@/shared/components/FireGlyph";
import ConsumablePurchaseSheet from "@/features/discover/components/ConsumablePurchaseSheet";
import {
  getFireOffering,
  purchaseFirePack,
} from "@/features/profile/subscriptionService";
import { FIRE_REDEEM_FLOW } from "@/features/discover/fireRedeem";
import { useAppMode } from "@/features/discover/useAppMode";
import { modeFireNameKey } from "@/features/discover/modeTheme";

/**
 * Fire paketi (consumable) satın alma sheet'i.
 *
 * Kabuğun tamamı ConsumablePurchaseSheet'te — burada yalnız bu ürünün kimliği
 * duruyor: RC offering'i, redeem sözleşmesi, simge ve metin öneki. Not paketi
 * (NotePurchaseModal) aynı kabuğu farklı config'le kullanıyor.
 *
 * Not sheet'iyle aynı iki karar burada da geçerli: açılışta en küçük kademe
 * seçili gelir ve snap yüksekliği içeriğe göre (dört kademe = iki sıra + üç-dört
 * satır açıklama) yükseltilmiştir — kabuğun 55/70 varsayılanında alt sıra sticky
 * footer'ın altında kalıyordu, içerik de scroll etmiyor.
 */
export default function FirePurchaseModal({
  visible,
  onClose,
  onPurchased,
}: any) {
  const { t } = useTranslation();
  // Ürün adı MODA GÖRE ("Fire" / "Spark") — consumable wire'da tek (superlike),
  // moda dönen yalnız görünen ad. Sheet'in TÜM metinleri bu değeri alıyor.
  const { mode } = useAppMode();
  return (
    <ConsumablePurchaseSheet
      visible={visible}
      onClose={onClose}
      onPurchased={onPurchased}
      flow={FIRE_REDEEM_FLOW}
      fetchOffering={getFireOffering}
      purchasePack={purchaseFirePack}
      i18nPrefix="firePurchase"
      i18nParams={{ fire: t(modeFireNameKey(mode)) }}
      analyticsKind="fire_pack"
      toastIcon="fire"
      autoSelectFirstPack
      snapPoints={["68%", "82%"]}
      renderGlyph={(size, color) => (
        <FireGlyph size={size} color={color} mode={mode} />
      )}
    />
  );
}
