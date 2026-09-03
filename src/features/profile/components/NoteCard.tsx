import { useState } from "react";
import { useTranslation } from "react-i18next";
import NoteGlyph from "@/shared/components/NoteGlyph";
import ConsumableShopCard, {
  SHOP_CARD_WIDTH_2UP,
} from "@/features/profile/components/ConsumableShopCard";
import NotePurchaseModal from "@/features/discover/components/NotePurchaseModal";
import { useConsumableCardBalance } from "@/features/profile/consumableCardBalance";

/**
 * Mağaza şeridinin sağ kartı: not paketi satın alma girişi + bakiye.
 * SuperLikeCard'ın birebir eşi, iki ürüne özgü ayrım dışında:
 *
 *   1. `premiumGranted: false` — not premium'la GELMEYEN bir ürün (tier kotası
 *      yok, `quotaNotesRemaining` hep 0). Premium satın alma ile webhook arası
 *      pencere not bakiyesini şüpheli yapmaz, orada sayıyı gizlemek yanlış olur.
 *   2. Simge kartta (SwipeCard'daki NoteBox) ve sheet'te ne ise burada da o:
 *      app-icon'dan sökülen konuşma balonu (NoteGlyph).
 *
 * Bakiye `null` gelebilir ("sözleşme henüz canlı değil") — o durumda sayı
 * yazılmaz, kart yine de çizilir ve satın alma sheet'ini açar; NoteBox'ta
 * olduğu gibi uç canlıya çıkınca istemci sürümü gerekmiyor.
 *
 * Mağaza ürünleri ve RC offering'i (`notes` — çoğul) 2026-08-27'de açıldı;
 * kalan blokaj redeem'in sandbox webhook doğrulaması (bkz. NotePurchaseModal).
 */
export default function NoteCard({
  /** Şeritten geliyor; varsayılan iki kartlık genişlik (bkz. ShopCardsRow). */
  cardWidth = SHOP_CARD_WIDTH_2UP,
}: {
  cardWidth?: number;
} = {}) {
  const { t } = useTranslation();
  const { balance, refetch } = useConsumableCardBalance("notesRemaining", {
    premiumGranted: false,
  });

  const [sheetVisible, setSheetVisible] = useState(false);

  const subtitle =
    balance.kind === "unknown"
      ? t("profile.noteCard.subtitleUnknown")
      : balance.remaining > 0
        ? t("profile.noteCard.subtitleCount", { count: balance.remaining })
        : t("profile.noteCard.subtitleEmpty");

  return (
    <>
      <ConsumableShopCard
        testID="note-card"
        cardWidth={cardWidth}
        title={t("profile.noteCard.title")}
        subtitle={subtitle}
        onPress={() => setSheetVisible(true)}
        renderGlyph={(size, color) => <NoteGlyph size={size} color={color} />}
      />

      <NotePurchaseModal
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPurchased={() => {
          setSheetVisible(false);
          // DiscoverScreen'deki akışın aynısı: redeem yanıtı bakiyeyi
          // taşımazsa stats staleTime:Infinity yüzünden sayı oturum boyunca
          // eski kalırdı.
          refetch();
        }}
      />
    </>
  );
}
