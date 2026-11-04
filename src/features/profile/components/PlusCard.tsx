import { Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import SFIcon from "@/shared/components/SFIcon";
import { ChevronRight } from "@/shared/icons";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import {
  SHOP_CARD_RADIUS,
  SHOP_CARD_PADDING,
  SHOP_CARD_HEIGHT,
  SHOP_CARD_WIDTH_3UP,
} from "@/features/profile/components/ConsumableShopCard";
import { colors, onMediaAt } from "@/shared/theme/colors";
import {
  DEFAULT_APP_MODE,
  modePlusCardGradient,
  type AppMode,
} from "@/features/discover/modeTheme";

/**
 * Mağaza şeridinin YALNIZ premium'da çizilen en sol kartı: "abonesin" rozeti.
 * Fire/Not kartlarının aksine satılacak bir şeyi yok — sağdaki chevron'un
 * söylediği gibi bir yere GÖTÜRÜYOR: plus sayfasına.
 *
 * Abone kullanıcının profil sayfasındaki TEK abonelik yüzeyi bu: eskiden
 * şeridin altında duran kocaman üyelik kartı (plan rozeti, yenileme tarihi,
 * "aboneliği yönet") kaldırıldı, o bilgiler plus sayfasında zaten var.
 * Karşılığı `!showMembershipCard` dalındaki upsell kartı, o duruyor.
 *
 * Kabuk ConsumableShopCard DEĞİL: zemini upsell kartının gradyan ailesinden
 * geliyor (`modePlusCardGradient` — Dating'de litPlusCard kırmızısı, Friends'te
 * friendsPlusCard yeşili) ve rozeti yok, yerine wordmark'ın kendisi duruyor.
 * Ölçüler yine de oradan geliyor (SHOP_CARD_*) — şeritte yan yana duran üç
 * kartın genişliği, köşesi ve boyu ayrı ayrı yazılırsa bir gün ayrışırlar.
 *
 * Boy eşitliğinin satırdaki `alignItems` ile kurulamadığı orada anlatıldı:
 * AnimatedPressable style'ı içteki TouchableOpacity'ye veriyor, dıştaki
 * Animated.View gerilse bile kart içeriği kadar kalıyor. Üstelik içerikten
 * büyük bir sarmalayıcı, basma animasyonunu kartın kendi merkezi yerine o
 * kutunun merkezinden ölçeklerdi. Bu yüzden boy iki kabukta da AÇIK yazılı.
 */
export default function PlusCard({
  /** Şeritten geliyor. Bu kart varsa şerit zaten üç kartlık — varsayılanı da o. */
  cardWidth = SHOP_CARD_WIDTH_3UP,
  /**
   * Seçili mod — zeminin rengi buradan. Varsayılanı DEFAULT_APP_MODE: modu
   * bilmeyen bir çağıran eski kırmızı kartı görür, yeşil "kazara" çıkmaz.
   */
  mode = DEFAULT_APP_MODE,
  onPress,
}: {
  cardWidth?: number;
  mode?: AppMode;
  onPress?: () => void;
} = {}) {
  return (
    <AnimatedPressable
      pressScale={0.97}
      onPress={onPress}
      testID="plus-card"
      style={{
        width: cardWidth,
        height: SHOP_CARD_HEIGHT,
        borderRadius: SHOP_CARD_RADIUS,
        borderCurve: "continuous",
        overflow: "hidden",
      }}
    >
      <LinearGradient
        colors={modePlusCardGradient(mode)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          // Sol kenar kardeş kartlardan geniş: onlarda 10'un hemen ardından
          // yuvarlak rozet geliyor ve köşenin kavisiyle uyuşuyor, burada aynı
          // yere düz bir wordmark oturuyor ve kenara yapışık duruyordu. Sağ
          // taraf 10'da kalıyor — chevron kenarda dursun.
          paddingLeft: SHOP_CARD_PADDING + 6,
          paddingRight: SHOP_CARD_PADDING,
        }}
      >
        {/* Paywall'ın plan kartındaki wordmark'ın aynısı: "+" da Duckie'nin
            kendi glifi, ayrı bir Text'e bölünmüyor (bkz. PurchaseSections).
            lineHeight AÇIK yazılıyor — fontun kendi satır kutusu harflerin
            üstünde boşluk taşıyor ve wordmark satırın ortasına oturmuyordu. */}
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            flex: 1,
            color: colors.onMedia,
            fontSize: 34,
            lineHeight: 36,
            fontFamily: "Duckie-regular",
          }}
        >
          plus+
        </Text>
        {/* Ayarlar satırlarındakiyle aynı chevron, kartın zemini gradyan olduğu
            için textSecondary değil kısık onMedia. */}
        <SFIcon
          name="chevron.right"
          fallback={ChevronRight}
          size={16}
          color={onMediaAt(0.7)}
          strokeWidth={2.5}
          weight="semibold"
        />
      </LinearGradient>
    </AnimatedPressable>
  );
}
