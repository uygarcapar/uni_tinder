import { navigationRef } from "@/shared/services/navigationRef";
import uiBus from "@/shared/services/uiBus";

/**
 * lit plus paywall'ının TEK giriş kapısı.
 *
 * Paywall artık bir bottom sheet değil, Profil sekmesinin ikinci sayfası
 * (bkz. features/profile/components/PlusPage.tsx). Uygulamanın her yerinden
 * açılabildiği için kapı burada toplandı: çağıran "nereye gidileceğini"
 * bilmiyor, yalnız "plus'ı aç" diyor.
 *
 * Neden hem `emit` hem modülde bekleyen bir bayrak: uiBus replay YAPMIYOR ve
 * Profil sekmesi lazy mount. Başka bir sekmeden çağrıldığında ProfileScreen
 * henüz ağaçta olmayabilir, düz bir emit boşluğa düşerdi. İstek bu yüzden
 * bekliyor; ekran ister o an dinliyor olsun (emit → pager'ı çevir), ister
 * sonradan mount olsun (`consumeLitPlusRequest` → pager doğrudan plus
 * sayfasında doğar), aynı istek bir KEZ tüketiliyor.
 * (Aynı desen: uiBus'taki requestPhotoHighlight / consumePhotoHighlight.)
 */
let pendingPlusPage = false;

export const LIT_PLUS_EVENT = "openLitPlus";

export function openLitPlus(): void {
  pendingPlusPage = true;
  // ÖNCE haber ver: ekran ayaktaysa sekme öne gelmeden sayfası çevrilmiş olur,
  // kullanıcı geçişin ortasında profil sayfasını görmez.
  uiBus.emit(LIT_PLUS_EVENT);
  if (navigationRef.isReady()) {
    // Sohbet gibi tab'ların ÜSTÜNDEKİ bir ekrandan çağrıldığında da doğru
    // çalışır: aynı stack'teki "HomeTabs"e dönüp Profil sekmesini seçer.
    // `as any`: AppNavigator'daki diğer sekme yönlendirmeleriyle aynı kaçış —
    // iç içe navigator'ların param tipleri kök tipe bağlı değil.
    (navigationRef as any).navigate("HomeTabs", { screen: "Profile" });
  }
}

/** Bekleyen isteği okur ve TÜKETİR (iki kez uygulanmasın). */
export function consumeLitPlusRequest(): boolean {
  const pending = pendingPlusPage;
  pendingPlusPage = false;
  return pending;
}
