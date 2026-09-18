import FireGlyph from "@/shared/components/FireGlyph";
import ConsumablePurchaseSheet from "@/features/discover/components/ConsumablePurchaseSheet";
import {
  getFireOffering,
  purchaseFirePack,
} from "@/features/profile/subscriptionService";
import { FIRE_REDEEM_FLOW } from "@/features/discover/fireRedeem";

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
  return (
    <ConsumablePurchaseSheet
      visible={visible}
      onClose={onClose}
      onPurchased={onPurchased}
      flow={FIRE_REDEEM_FLOW}
      fetchOffering={getFireOffering}
      purchasePack={purchaseFirePack}
      i18nPrefix="firePurchase"
      analyticsKind="fire_pack"
      toastIcon="fire"
      autoSelectFirstPack
      snapPoints={["68%", "82%"]}
      renderGlyph={(size, color) => <FireGlyph size={size} color={color} />}
    />
  );
}
