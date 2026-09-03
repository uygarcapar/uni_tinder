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
// Şeridin yatay gutter'ı (2×16) ve kartlar arasındaki boşluk (8) — bkz.
// ShopCardsRow, sayılar orayla eşleşmeli.
const ROW_GUTTER = 16;
const ROW_GAP = 8;
const CARD_RADIUS = 28;
// Rozet + simge bir tık küçüldü (52/32 → 44/26): kartı DARALTMAK için, serbest
// kalan ~8px'i metin sütunu alıyor. Metin de bir ara yarım punto inmişti
// (14/12 → 13/11) ama okunmuyordu, 14/13'e geri çıktı — daraltmayı artık
// yalnız rozet taşıyor. Başlık ile alt satır aynı puntoda; ayrım ağırlık
// (700/500) ve renk (%55 ink). Başlık iki satıra kırılabiliyor (numberOfLines:
// 2) ve kart boyu sabit olduğu için "Superlike Al" dar kartta kırılırsa
// rozetin dengesi bozulur — punto buradan yukarı çıkarsa kontrol edilmeli.
const BADGE = 44;
const GLYPH = 26;
const CARD_PADDING = 10;
// Kartın boyu DEĞİŞMEDİ (2×10 + 52 = 72): daralan kart, kısalan kart değil.
// Rozet 44'e inince gövdede 8px boşluk kalıyor, rozet ortalanıyor.
//
// Boy yine de AÇIK yazılı, içerikten türetilmiyor: şeritteki üç kart farklı
// içerikle (rozet + iki satır metin / tek satır wordmark + chevron) doluyor ve
// içerik-güdümlü boy, dilde ya da bakiye metninde bir kırılma olduğu anda
// kartlardan birini komşularından uzun yapıyordu. AnimatedPressable flex'i
// geçirmediği için satırdaki `alignItems: stretch` de bunu düzeltemiyor
// (bkz. yukarıdaki genişlik notu) — tek yol iki kabuğun aynı sabiti yazması.
const CARD_HEIGHT = 72;

/**
 * Kart genişliği şeritteki kart SAYISINA bağlı, çünkü şerit iki farklı şey:
 *
 *   2 kart (abone değil) — kaydırma yok, kartlar şeridi tam dolduruyor.
 *   3 kart (abone)       — kaydırılıyor; kartlar bir tık dar, böylece üçüncü
 *                          kartın kenarı ekrandan sarkıp "devamı var" diyor.
 *
 * Tek bir dar genişlik iki durumda da kullanılsaydı, abone olmayan kullanıcının
 * şeridinin sağında kaydırılamayan ölü bir boşluk kalırdı.
 */
export const SHOP_CARD_WIDTH_2UP = (width - ROW_GUTTER * 2 - ROW_GAP) / 2;
export const SHOP_CARD_WIDTH_3UP = Math.round(SHOP_CARD_WIDTH_2UP * 0.96);
export const SHOP_CARD_RADIUS = CARD_RADIUS;
export const SHOP_CARD_PADDING = CARD_PADDING;
export const SHOP_CARD_HEIGHT = CARD_HEIGHT;

export default function ConsumableShopCard({
  title,
  subtitle,
  onPress,
  renderGlyph,
  testID,
  cardWidth,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Şeritten geliyor: kart sayısına göre 2UP ya da 3UP genişliği. */
  cardWidth: number;
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
        width: cardWidth,
        height: CARD_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: CARD_PADDING,
        paddingVertical: CARD_PADDING,
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
            fontSize: 13,
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
