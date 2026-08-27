import type { ReactNode } from "react";
import { View, Text, Dimensions } from "react-native";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { colors, ink } from "@/shared/theme/colors";

/**
 * ProfileScreen'in mağaza şeridindeki tek kartın kabuğu — SuperLike ve Not
 * kartları bunun iki örneği (bkz. ShopCardsRow). Kart yalnız sunum: bakiye
 * çözümü consumableCardBalance.ts'te, satın alma sheet'i çağıranda.
 *
 * Hero'nun (avatar + isim + düzenle) hemen altında, premium upsell kartının
 * üstünde durur. Sayfanın en altındaki iki kocaman kalpli QuotaSection'ın
 * yerini aldı: bakiye artık kartın alt satırında, satın alma aksiyonuyla AYNI
 * yerde duruyor — "kaç hakkım kaldı" ile "nasıl alırım" iki farklı ekran ucuna
 * dağılmıyor.
 *
 * Genişlik SABİT PİKSEL, `flex: 1` DEĞİL. AnimatedPressable style'ı dıştaki
 * Animated.View'a değil içteki TouchableOpacity'ye veriyor: satırda flex hiç
 * işlemiyor, kart içeriğine göre büzülüyor ve sağdaki metin sütunu ("Superlike
 * Al" + kalan hak satırı) 0 genişliğe çöküp GÖRÜNMEZ oluyordu. Tek kartlık
 * sürümde bu tuzak yoktu çünkü kartın açık `width`i vardı — o geri geldi.
 */

const { width } = Dimensions.get("window");
// Şeridin yatay gutter'ı (2×16) ve iki kart arasındaki boşluk (8) düşülüp
// kalan ikiye bölünüyor — bkz. ShopCardsRow, sayılar orayla eşleşmeli.
const ROW_GUTTER = 16;
const ROW_GAP = 8;
const CARD_WIDTH = (width - ROW_GUTTER * 2 - ROW_GAP) / 2;
const CARD_RADIUS = 28;
// Tek kartlık dönemdeki ölçüler — ikinci kart gelince küçültülmüştü, geri
// alındı: kartın kendisi aynı kart olarak kalıyor, yalnız iki tane var.
const BADGE = 52;
const GLYPH = 32;

export default function ConsumableShopCard({
  title,
  subtitle,
  onPress,
  renderGlyph,
  testID,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Rozetin içindeki simge — ürünün kartta/sheet'te kullandığı glyph'in aynısı. */
  renderGlyph: (size: number, color: string) => ReactNode;
  testID?: string;
}) {
  return (
    <AnimatedPressable
      pressScale={0.97}
      onPress={onPress}
      testID={testID}
      style={{
        width: CARD_WIDTH,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: CARD_RADIUS,
        borderCurve: "continuous",
        // Tamamlama accordion'larıyla aynı kabuk: 0.5px beyaz-%10 çizgi +
        // surface zemin. Kart eskiden 2px'lik gradyan halkayla çerçeveliydi,
        // sayfadaki tek "çerçeveli" öğe oydu ve şeritten fırlıyordu.
        borderWidth: 0.5,
        borderColor: colors.hairline,
        backgroundColor: colors.surface,
        overflow: "hidden",
      }}
    >
      {/* Rozet düz beyaz: gradyan kalkınca kart tek renk aksanla okunuyor.
          Zemin açık olduğu için simge KOYU (colors.bg) çiziliyor. */}
      <View
        style={{
          width: BADGE,
          height: BADGE,
          borderRadius: BADGE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.inverseSurface,
          overflow: "hidden",
        }}
      >
        {renderGlyph(GLYPH, colors.bg)}
      </View>

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={2}
          style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: ink(0.55),
            fontSize: 12,
            fontWeight: "500",
            marginTop: 2,
          }}
        >
          {subtitle}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
