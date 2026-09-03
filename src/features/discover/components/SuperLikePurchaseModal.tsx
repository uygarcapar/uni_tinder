import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import ConsumablePurchaseSheet from "@/features/discover/components/ConsumablePurchaseSheet";
import {
  getSuperlikeOffering,
  purchaseSuperlikePack,
} from "@/features/profile/subscriptionService";
import { SUPERLIKE_REDEEM_FLOW } from "@/features/discover/superlikeRedeem";

/**
 * SuperLike paketi (consumable) satın alma sheet'i.
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
export default function SuperLikePurchaseModal({
  visible,
  onClose,
  onPurchased,
}: any) {
  return (
    <ConsumablePurchaseSheet
      visible={visible}
      onClose={onClose}
      onPurchased={onPurchased}
      flow={SUPERLIKE_REDEEM_FLOW}
      fetchOffering={getSuperlikeOffering}
      purchasePack={purchaseSuperlikePack}
      i18nPrefix="superLikePurchase"
      analyticsKind="superlike_pack"
      toastIcon="superLike"
      autoSelectFirstPack
      snapPoints={["68%", "82%"]}
      renderGlyph={(size, color) => <SuperLikeGlyph size={size} color={color} />}
    />
  );
}
