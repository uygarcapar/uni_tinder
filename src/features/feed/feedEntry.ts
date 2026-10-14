import { navigationRef } from "@/shared/services/navigationRef";
import uiBus from "@/shared/services/uiBus";
import { feedEnabledForSession } from "./feedFlag";

/**
 * Akış sekmesinin TEK giriş kapısı — ve belirli bir SAYFASININ.
 *
 * `litPlusEntry.ts`'in birebir kardeşi; tek fark: boolean yerine hangi sayfa
 * istendiği taşınıyor. Gerekçe aynı: uiBus replay YAPMIYOR ve Akış sekmesi
 * lazy mount. Push'tan gelen "yanıtlar sayfasını aç" isteği düz bir emit
 * olsaydı ekran henüz ağaçta olmadığı için boşluğa düşerdi.
 *
 * ⚠️ NAV PARAM KULLANILMIYOR ve bu bilinçli. `{ initialPage: 'replies' }` gibi
 * bir param + effect içinde `setPage` ÇALIŞMIYOR; iki ayrı mekanizma yutuyor:
 *   (a) iOS'ta pager bir SwiftUI TabView ve hosting controller'ı yalnız
 *       `didMoveToWindow`da kuruluyor — pencereye girmeden yapılan seçim kaybolur;
 *   (b) Fabric çocukları TEK TEK mount ediyor ve PagerView
 *       `selectedPage > children.count` olduğunda kırpıyor, yani `initialPage={2}`
 *       ilk çocuk geldiğinde 0'a çöküyor.
 * Tam teşhis: features/profile/screens/ProfileScreen.tsx:695-868.
 * Çözüm üç katmanlı: (1) burası, (2) ekranda `useState` initializer'ıyla doğru
 * sayfada doğmak, (3) pager LANDIĞINI BİLDİRENE kadar ısrarla yeniden uygulamak.
 */

/**
 * `"replies"` KALDIRILDI (iki modlu yapı): yanıt yazarak eşleşme kanalı
 * üründen çıktı, Yanıtlar sayfası da onunla birlikte. Push'tan gelen eski bir
 * "yanıtlar sayfasını aç" isteği artık `openFeed`in tip kapısına takılıyor;
 * `routeFromNotification` o bildirimi Bildirimler'e düşürüyor.
 */
export type FeedPageKey = "feed" | "mine";

export const FEED_OPEN_EVENT = "openFeedPage";

/** Pager sayfa indeksleri — ekran ve bu modül aynı sırayı paylaşmak zorunda. */
export const FEED_PAGE_INDEX: Record<FeedPageKey, number> = {
  feed: 0,
  mine: 1,
};

/**
 * Yeniden uygulama merdiveni. ProfileScreen'deki `PLUS_PAGE_RETRY_MS` ile aynı
 * değerler: ilk deneme bir sonraki frame civarı, sonrakiler lazy mount ve
 * pencereye girme gecikmelerini kapsıyor. Son denemede istek DÜŞÜRÜLÜYOR ki
 * günler sonraki bir ziyareti bayat bir istek kaçırmasın.
 */
export const FEED_PAGE_RETRY_MS = [120, 400, 800] as const;

let pendingPage: FeedPageKey | null = null;

/**
 * Akışı (ve istenen sayfasını) aç.
 *
 * Dönüş `false` = akış bu oturumda KAPALI, hiç navigate edilmedi. Çağıran
 * (routeFromNotification) bu durumda Bildirimler'e düşmek zorunda: sekmesi
 * olmayan bir özelliğin push'u ölü tap üretmemeli.
 */
export function openFeed(page: FeedPageKey = "feed"): boolean {
  if (!feedEnabledForSession()) return false;
  pendingPage = page;
  // ÖNCE haber ver: ekran ayaktaysa sekme öne gelmeden sayfası çevrilmiş olur,
  // kullanıcı geçişin ortasında akış sayfasını görmez.
  uiBus.emit(FEED_OPEN_EVENT, { page });
  if (navigationRef.isReady()) {
    // `as any`: iç içe navigator'ların param tipleri kök tipe bağlı değil —
    // AppNavigator'daki diğer sekme yönlendirmeleriyle aynı kaçış.
    (navigationRef as any).navigate("HomeTabs", { screen: "Feed" });
  }
  return true;
}

/** Bekleyen isteği okur ve TÜKETİR (iki kez uygulanmasın). */
export function consumeFeedRequest(): FeedPageKey | null {
  const pending = pendingPage;
  pendingPage = null;
  return pending;
}

/**
 * İsteği sessizce düşür — kullanıcı jesti KAZANIR.
 * Ekran, parmakla kaydırma başladığında ya da sekme şeridine basıldığında
 * çağırıyor: kullanıcıyla kavga etmemek için.
 */
export function dropFeedRequest(): void {
  pendingPage = null;
}
