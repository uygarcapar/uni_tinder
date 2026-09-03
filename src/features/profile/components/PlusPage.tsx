import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import { usePurchaseFlow } from "@/features/discover/usePurchaseFlow";
import {
  PurchaseFeatureTable,
  PurchaseFinePrint,
  PurchaseHeading,
  PurchasePlanCarousel,
} from "@/features/discover/components/PurchaseSections";

/**
 * lit plus paywall'ı — SAYFA kabı (ProfileScreen pager'ının ikinci sayfası).
 *
 * Paywall'ın TEK kabı: eskiden aynı içeriği bir bottom sheet de gösteriyordu
 * (PurchaseModal), o kaldırıldı — uygulamadaki bütün girişler buraya geliyor
 * (bkz. features/profile/litPlusEntry).
 *
 * Akış `usePurchaseFlow`ta, görsel parçalar `PurchaseSections`ta; burada yalnız
 * düzen var. Sticky aksiyon şeridi YOK: satın alma plan kartına dokununca
 * başlıyor, geri yükleme ve mağaza uyarısı içeriğin sonunda.
 * Zemin de burada DEĞİL: sayfa şeffaf, arkasında ProfileScreen'in `colors.bg`i.
 */

// Floating tab bar — DiscoverScreen/MessagesScreen ile aynı ölçüler.
const TAB_BAR_HEIGHT = 64;
const TAB_BAR_BOTTOM_GAP = -10;

type Props = {
  /** Kullanıcı bu sekmeye bir kez geçti mi — katalog fetch'inin kapısı. */
  active: boolean;
  /** ScreenHeader'ın progressive blur'unu bu sayfa da sürsün diye. */
  scrollY: SharedValue<number>;
  onSuccess?: () => void;
};

export default function PlusPage({ active, scrollY, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const flow = usePurchaseFlow({ active, onSuccess });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          // Profil sayfasıyla AYNI üst pay: iki sayfa yan yana kayarken
          // içerikleri aynı hattan başlasın.
          paddingTop: insets.top + 60,
          // Yan pay sheet'in gutter'ı ile aynı (20): plan kartlarının
          // `marginHorizontal: -20`ı buna dayanıyor.
          paddingHorizontal: 20,
          // Sticky bir aksiyon şeridi YOK (bkz. PurchaseFinePrint) — alt pay
          // yalnız floating tab bar'ı açacak kadar.
          paddingBottom: insets.bottom + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + 24,
        }}
      >
        <PurchaseHeading flow={flow} />
        <PurchasePlanCarousel flow={flow} />
        <PurchaseFeatureTable flow={flow} />
        <PurchaseFinePrint flow={flow} />
      </Animated.ScrollView>
    </View>
  );
}
