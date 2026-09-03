import { ScrollView } from "react-native";
import SuperLikeCard from "@/features/profile/components/SuperLikeCard";
import NoteCard from "@/features/profile/components/NoteCard";
import PlusCard from "@/features/profile/components/PlusCard";
import {
  SHOP_CARD_WIDTH_2UP,
  SHOP_CARD_WIDTH_3UP,
} from "@/features/profile/components/ConsumableShopCard";

/**
 * ProfileScreen'in mağaza şeridi: SuperLike ve Not kartları yan yana, premium'da
 * en solda bir de PlusCard.
 *
 * Eskiden tek kart vardı ve ekranın YARISINI kaplayıp sağını bilerek boş
 * bırakıyordu ("tek kartlık slider"). İkinci ürün gelince o boşluk kartın
 * kendisi oldu.
 *
 * Şerit üçüncü kartla birlikte YATAY KAYDIRILIR oldu. Alternatif üç kartı
 * ekrana sığdırmaktı ama 1/3 genişlikte (~115px) rozetin yanında "Superlike Al"
 * metnine 35px kalıyordu: kartların ya dikeye dönmesi ya rozetin epey küçülmesi
 * gerekirdi, yani premium kullanıcı free'den BAŞKA bir kart görürdü.
 *
 * Premium DEĞİLKEN içerik tam olarak ekran genişliği kadar (16 + 2 kart + 8 +
 * 16) — ScrollView kaydırmaz.
 *
 * Genişliğin İKİ değeri var ve seçimi burada yapılıyor (SHOP_CARD_WIDTH_2UP /
 * _3UP, ikisi de ConsumableShopCard'da sabit piksel — AnimatedPressable flex'i
 * geçirmiyor, orada anlatıldı). Aşağıdaki gutter/gap sayıları o hesapla
 * eşleşmek ZORUNDA.
 *
 * paddingBottom 16: bölüm ritmi 24 ama premium kartı hemen altında ve o kadar
 * boşluk şeridi hero'dan koparıyordu — bilerek bir tık dar.
 */
export default function ShopCardsRow({
  /** ProfileScreen'deki `showMembershipCard` — alttaki üyelik kartıyla TEK
   *  bayrak: "abonesin" iki yerde birden yazar ya da hiç yazmaz. */
  showPlusCard = false,
  onPlusPress,
}: {
  showPlusCard?: boolean;
  onPlusPress?: () => void;
}) {
  // Üç kartlık şeritte kartlar bir tık dar: üçüncüsünün kenarı ekrandan sarkıp
  // "devamı var" diyor. İki kartlık şeritte kaydırma yok, kartlar şeridi tam
  // dolduruyor — dar genişlik orada sağda ölü boşluk bırakırdı.
  const cardWidth = showPlusCard ? SHOP_CARD_WIDTH_3UP : SHOP_CARD_WIDTH_2UP;

  return (
    <ScrollView
      horizontal
      // İki kartlık hâlde kaydıracak bir şey YOK ve ekran yatay bir
      // PagerView'ın içinde: canlı bir ScrollView, üstünden başlayan yatay
      // sürüklemeyi pager'dan çalıp plus sayfasına geçişi bu şeritte
      // öldürüyordu. Kaydırma yalnız üçüncü kart varken açılıyor.
      scrollEnabled={showPlusCard}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        flexDirection: "row",
        // Sarmalayıcılar içeriklerine yapışsın: gerilen bir sarmalayıcı basma
        // animasyonunu kartın merkezinden kaydırıyor (bkz. PlusCard).
        alignItems: "flex-start",
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 16,
      }}
    >
      {showPlusCard && <PlusCard cardWidth={cardWidth} onPress={onPlusPress} />}
      <SuperLikeCard cardWidth={cardWidth} />
      <NoteCard cardWidth={cardWidth} />
    </ScrollView>
  );
}
