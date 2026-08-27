import NoteGlyph from "@/shared/components/NoteGlyph";
import ConsumablePurchaseSheet from "@/features/discover/components/ConsumablePurchaseSheet";
import {
  getNoteOffering,
  purchaseNotePack,
} from "@/features/profile/subscriptionService";
import { NOTE_REDEEM_FLOW } from "@/features/discover/noteRedeem";

/**
 * Not paketi (consumable) satın alma sheet'i.
 *
 * SuperLike ve kurtarma sheet'leriyle aynı kabuk (ConsumablePurchaseSheet),
 * farklı config. `secondaryAction` YOK: not premium'la gelen bir hak değil,
 * herkes için yalnızca satın alınabilir bir ürün — "abonelik de bunu veriyor"
 * bağlantısı yanlış olurdu.
 *
 * Kademeler `note_2` / `_4` / `_6` / `_8` — SuperLike'tan (5/10/15/20) bilinçli
 * olarak KÜÇÜK: not yazmak daha ağır bir aksiyon, tüketimi yavaş. Adet istemcide
 * sabit değil, `creditsFromProductId` ile ürün id'sinden okunuyor; fiyat da sabit
 * değil, kartta daima RC'nin `priceString`i var → ASC'de kademe/fiyat oynatmak FE
 * sürümü gerektirmez (backend'in ürün→kredi tablosu güncellenmeli).
 *
 * Simge kartta (SwipeCard'daki NoteBox) ne ise burada da o: app-icon'dan sökülen
 * konuşma balonu (NoteGlyph). Önce SF `bubble.left` duruyordu — kullanıcı ürünü
 * kartta gördüğü şekille tanıyor, iki farklı balon aynı ürünü iki ürün gibi
 * gösteriyordu.
 *
 * Açılışta İLK paket (en küçük kademe, `note_2`) seçili geliyor: kademeler zaten
 * küçük ve birbirine yakın, boş seçimle açılıp CTA'yı ölü göstermek fazladan bir
 * dokunuş istiyordu. SuperLike/kurtarma sheet'lerinde bu KAPALI kalıyor.
 *
 * ⚠️ Mağaza ürünleri ve RC offering'i (`note`) henüz açılmadı; o zamana kadar
 * sheet "paketler yüklenemedi" durumunda kalır.
 */
export default function NotePurchaseModal({
  visible,
  onClose,
  onPurchased,
}: {
  visible: boolean;
  onClose?: () => void;
  onPurchased?: (result: unknown) => void;
}) {
  return (
    <ConsumablePurchaseSheet
      visible={visible}
      onClose={onClose}
      onPurchased={onPurchased}
      flow={NOTE_REDEEM_FLOW}
      fetchOffering={getNoteOffering}
      purchasePack={purchaseNotePack}
      i18nPrefix="notePurchase"
      analyticsKind="note_pack"
      toastIcon="note"
      autoSelectFirstPack
      // Paylaşılan kabuğun 55/70'inden yüksek: sheet içeriği SCROLL ETMİYOR
      // (AppBottomSheet children'ı düz View), notun açıklaması üç-dört satır ve
      // altında dört kademe (2/4/6/8) iki sıra hâlinde duruyor. 55'te alt sıra
      // sticky footer'ın altında kalıyordu.
      snapPoints={["68%", "82%"]}
      renderGlyph={(size, color) => <NoteGlyph size={size} color={color} />}
    />
  );
}
