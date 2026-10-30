import { createContext, useContext } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { flightOffset, type FeedFlight } from "../feedCardFlight";

/**
 * Üst bantta yapışan akış kartının HÜCRESİ — FlatList'in
 * `CellRendererComponent`i.
 *
 * ⚠️ NİYE HÜCRE, NİYE `renderItem` İÇİNDEKİ BİR SARMALAYICI DEĞİL: dönüşüm
 * kartın İÇERİK UZAYINDAKİ y'sini bilmek zorunda (ekrandaki yeri = y −
 * scrollY). `renderItem`in döndürdüğü ağaç hücrenin ÇOCUĞU, yani onun
 * `onLayout`u 0 veriyor — ölçülebilen tek şey kendi yüksekliği. Hücrenin
 * `onLayout`u ise doğrudan içerik kabına göre konum veriyor (VirtualizedList
 * kendi metriklerini de bu olaydan besliyor).
 *
 * ⚠️ `onLayout` BİZE VirtualizedList TARAFINDAN VERİLİYOR ve zinciri kırmamak
 * için AYNEN geri çağırılıyor: listenin sanallaştırma defteri (hücre
 * yükseklikleri, görünürlük, `onEndReached`) o olaya bakıyor. Yutulsa liste
 * ölçüsüz kalırdı.
 *
 * ⚠️🔴 Z-SIRASINA DOKUNULMUYOR, bilerek — VARSAYILAN SIRA DOĞRU SIRA.
 * Bir tur `zIndex: BÜYÜK_TABAN - index` ile ters sıraya alındı (yapışan kart
 * ÖNDE) ve GERİ ALINDI (istek: "altına gireceğine üstüne biniyor, kart ters
 * olmuş"). Varsayılan sırada sonra çizilen kart üstte kalıyor, yani yapışıp
 * geride kalan kart bir SONRAKİNİN ALTINA giriyor — istenen de bu. Ters sıranın
 * ikinci bir bedeli de vardı: üstteki kartın gölgesi alttakinin üzerine
 * düşüyordu (bkz. feedRowShell > gölge notu).
 */

export const FeedFlightContext = createContext<FeedFlight | null>(null);

/**
 * ⚠️ Reanimated'ın `Animated.FlatList`i kendi `CellRendererComponent`ini
 * DAYATIYOR (restProps'tan sonra yazıyor), yani dışarıdan verilen yutuluyor.
 * Akış listesi o yüzden `createAnimatedComponent(FlatList)` ile kuruluyor ve
 * `itemLayoutAnimation`ın işini bu hücre kendi `layout` prop'uyla yapıyor —
 * kütüphanenin kendi hücresi de birebir bunu yapıyordu.
 */
const ROW_LAYOUT_TRANSITION = LinearTransition.duration(220);

interface FeedFlightCellProps {
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children?: React.ReactNode;
}

/**
 * ⚠️ `onFocusCapture` BİLEREK ALINMIYOR: VirtualizedList onu da hücreye
 * geçiriyor (son odaklanan hücreyi hatırlamak için) ama RN'in `ViewProps`u o
 * prop'u tiplemiyor, yani tip güvenliğini kıracak bir kaçış gerekirdi.
 * Reanimated'ın KENDİ hücre bileşeni de yalnız `layout`/`onLayout`/`style`
 * geçiriyor — davranış kütüphanenin bugünkü hâliyle birebir aynı.
 */
export default function FeedFlightCell({
  style,
  onLayout,
  children,
}: FeedFlightCellProps) {
  const flight = useContext(FeedFlightContext);

  /**
   * Kartın içerik uzayındaki üst kenarı. −1 = "henüz ölçülmedi" (0 DEĞİL: 0
   * geçerli bir konum ve ilk karede kartı yanlışlıkla yapışma hattının üstünde
   * sayardı). Yukarıdaki kartların boyu değiştikçe (fotoğraf yüklenmesi, yeni
   * başlık) olay tekrar geliyor ve değer kendini düzeltiyor.
   */
  const rowY = useSharedValue(-1);

  const flightStyle = useAnimatedStyle(() => {
    const y = rowY.get();
    const translateY =
      !flight || !flight.enabled || y < 0
        ? 0
        : flightOffset(flight.edge - (y - flight.scrollY.get()));
    // ⚠️ ANAHTARLAR HER KAREDE AYNI: Reanimated kaldırılan stil anahtarını geri
    // almıyor, "duran kart" dalında `{}` dönseydi kart son dönüşümünde donardı.
    return { transform: [{ translateY }] };
  });

  return (
    <Animated.View
      layout={ROW_LAYOUT_TRANSITION}
      style={[style, flightStyle]}
      onLayout={(e) => {
        onLayout?.(e);
        rowY.set(e.nativeEvent.layout.y);
      }}
    >
      {children}
    </Animated.View>
  );
}
