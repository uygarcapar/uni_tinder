import { useState } from "react";
import { useTranslation } from "react-i18next";
import SuperLikeGlyph from "@/shared/components/SuperLikeGlyph";
import ConsumableShopCard, {
  SHOP_CARD_WIDTH_2UP,
} from "@/features/profile/components/ConsumableShopCard";
import SuperLikePurchaseModal from "@/features/discover/components/SuperLikePurchaseModal";
import { useConsumableCardBalance } from "@/features/profile/consumableCardBalance";

/**
 * Mağaza şeridinin sol kartı: SuperLike paketi satın alma girişi + bakiye.
 * Kabuk ve bakiye çözümü paylaşılıyor (ConsumableShopCard /
 * consumableCardBalance) — burada yalnız ürüne özgü kısım var.
 *
 * Kart premium'da da görünür: SuperLike'ın "sınırsız" hâli yok, premium'da bile
 * tier'a bağlı sonlu bir kota var (haftalık 1 / aylık 2 / yıllık 5, abonelik
 * döngüsüyle yenilenir) ve paket satın alma herkese açık. Premium bu bakiyeye
 * hak VERDİĞİ için `premiumGranted: true`: satın alma ile webhook arasındaki
 * pencerede sayı gösterilmez, free tier'ın sayısını premium'unmuş gibi yazardı.
 */
export default function SuperLikeCard({
  /** Şeritten geliyor; varsayılan iki kartlık genişlik (bkz. ShopCardsRow). */
  cardWidth = SHOP_CARD_WIDTH_2UP,
}: {
  cardWidth?: number;
} = {}) {
  const { t } = useTranslation();
  const { balance, refetch } = useConsumableCardBalance("superLikesRemaining", {
    premiumGranted: true,
  });

  const [sheetVisible, setSheetVisible] = useState(false);

  const subtitle =
    balance.kind === "unknown"
      ? t("profile.superLikeCard.subtitleUnknown")
      : balance.remaining > 0
        ? t("profile.superLikeCard.subtitleCount", { count: balance.remaining })
        : t("profile.superLikeCard.subtitleEmpty");

  return (
    <>
      <ConsumableShopCard
        testID="superlike-card"
        cardWidth={cardWidth}
        title={t("profile.superLikeCard.title")}
        subtitle={subtitle}
        onPress={() => setSheetVisible(true)}
        renderGlyph={(size, color) => <SuperLikeGlyph size={size} color={color} />}
      />

      <SuperLikePurchaseModal
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onPurchased={() => {
          // DiscoverScreen'deki akışın aynısı. Redeem yanıtı bakiyeyi taşımazsa
          // patchStatsBalance no-op kalıyor ve stats staleTime:Infinity olduğu
          // için sayı oturum boyunca eski kalırdı — kredi backend'de yazılmışken
          // ekranda görünmüyordu. Bakiye çözücüsünün merdiveni bu boşluğu
          // kapatmıyor: o yalnız bakiye `null` iken çalışıyor, BAYAT bir sayı
          // için değil.
          refetch();
        }}
      />
    </>
  );
}
