import { View } from "react-native";
import SuperLikeCard from "@/features/profile/components/SuperLikeCard";
import NoteCard from "@/features/profile/components/NoteCard";

/**
 * ProfileScreen'in mağaza şeridi: SuperLike ve Not kartları yan yana.
 *
 * Eskiden tek kart vardı ve ekranın YARISINI kaplayıp sağını bilerek boş
 * bırakıyordu ("tek kartlık slider"). İkinci ürün gelince o boşluk kartın
 * kendisi oldu.
 *
 * Kart genişliği burada DEĞİL, ConsumableShopCard'da sabit piksel olarak
 * hesaplanıyor (AnimatedPressable flex'i geçirmiyor — orada anlatıldı).
 * Aşağıdaki gutter/gap sayıları o hesapla eşleşmek ZORUNDA.
 *
 * paddingBottom 16: bölüm ritmi 24 ama premium kartı hemen altında ve o kadar
 * boşluk şeridi hero'dan koparıyordu — bilerek bir tık dar.
 */
export default function ShopCardsRow() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "stretch",
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 16,
      }}
    >
      <SuperLikeCard />
      <NoteCard />
    </View>
  );
}
