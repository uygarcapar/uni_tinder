import { Platform } from "react-native";

/**
 * NATIVE SEKME ŞERİDİNİN YÜKSEKLİĞİ — güvenli alan DIŞINDA.
 *
 * ── Neden bir SABİT, neden `useBottomTabBarHeight()` değil ────────────────
 * O kanca `BottomTabBarHeightContext`i okuyor ve context'i yalnız JS tab bar
 * (`BottomTabView`) sağlıyor. Bu uygulama `createNativeBottomTabNavigator`
 * kullanıyor (gerçek `UITabBarController`), o navigator böyle bir context
 * yayınlamıyor — kanca `undefined` döner ve çağıran sessizce 0 sanır.
 *
 * ── Güvenli alanla TOPLANMASI gerekiyor ───────────────────────────────────
 * `SafeAreaProvider` uygulamanın kökünde ve `initialWindowMetrics` ile
 * kuruluyor (bkz. App.tsx), yani `useSafeAreaInsets().bottom` PENCERENİN
 * dibi (home indicator ~34), sekme şeridini İÇERMİYOR. Şeridin altında
 * kalmaması gereken her yüzey ikisini toplamak zorunda:
 *
 *     bottomPad = insets.bottom + NATIVE_TAB_BAR_HEIGHT
 *
 * iOS'ta 49 UIKit'in standart (compact) tab bar yüksekliği; home indicator
 * payı ayrı geliyor, o yüzden buraya girmiyor. Android'de Material 3
 * navigation bar 80.
 *
 * ⚠️ Bu sayı YALNIZ ŞERİDİN ÜSTÜNDE DURMAK İÇİN. Tam ekranı kaplayan
 * katmanlar (ör. akıştaki harita zemini) bunu KULLANMAZ — onlar şeridin
 * ARKASINA geçmek, yani telefonun dibine dokunmak zorunda.
 */
export const NATIVE_TAB_BAR_HEIGHT = Platform.select({
  ios: 49,
  default: 80,
});
