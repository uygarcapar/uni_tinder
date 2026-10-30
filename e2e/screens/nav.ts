/**
 * DOLAŞMA.
 *
 * Native tab bar'ın UITabBarItem'ları ETİKETSİZ (TabNavigator.tsx:192
 * `tabBarLabel: Platform.select({ ios: '' })`) ve `@react-navigation/
 * bottom-tabs/unstable` API'sinde testID/accessibilityLabel kolu YOK → `~` ile
 * erişilemiyorlar.
 *
 * KARAR:
 *   • BİRİNCİL yol deep link — hızlı, deterministik, bayrak farkındalığı var.
 *   • Tab'a GERÇEKTEN dokunmak ayrı bir spec'in konusu
 *     (specs/smoke/03-tabbar-reachability) ve indeks kırılganlığı buraya
 *     hapsediliyor; 40 spec'e yayılmıyor.
 *   • Maymun katmanı `nav.tab` eyleminde DOKUNMAYI kullanıyor (insan deep link
 *     atmaz), hata durumunda deep link'e düşüyor.
 */
import { deepLink } from '../support/driver';
import { feedExpectedInSession } from '../support/env';
import { els } from '../support/selectors';

export type TabName = 'Discover' | 'Likes' | 'Feed' | 'Messages' | 'Profile';

/** `AppNavigator.tsx:213-244` içindeki linking config'in birebir karşılığı. */
export type DeepLinkPath =
  | 'discover'
  | 'likes'
  | 'feed'
  | 'messages'
  | 'profile'
  | 'notifications'
  | `chat/${string}`;

const TAB_BAR_BUTTON = (index: number) =>
  `-ios class chain:**/XCUIElementTypeTabBar/XCUIElementTypeButton[${index}]`;

export const Nav = {
  deepLink: (path: DeepLinkPath) => deepLink(path),

  goToDiscover: () => deepLink('discover'),
  goToLikes: () => deepLink('likes'),
  /** ⚠️ Akış bayrağı kapalıyken rota hiç kayıtlı değil → link SESSİZCE yutuluyor. */
  goToFeed: () => deepLink('feed'),
  goToMessages: () => deepLink('messages'),
  goToProfile: () => deepLink('profile'),
  goToNotifications: () => deepLink('notifications'),
  goToChat: (conversationId: string) => deepLink(`chat/${conversationId}`),

  /** Bu oturumda tab bar'da hangi sekmeler var (akış bayrağına göre). */
  tabOrder(): TabName[] {
    return feedExpectedInSession()
      ? ['Discover', 'Likes', 'Feed', 'Messages', 'Profile']
      : ['Discover', 'Likes', 'Messages', 'Profile'];
  },

  /** class chain 1-TABANLI — tab bar'ın gerçek buton indeksi. */
  tabIndex(tab: TabName): number {
    const order = this.tabOrder();
    const i = order.indexOf(tab);
    if (i < 0) {
      throw new Error(
        `${tab} bu oturumda tab bar'da yok (akış bayrağı). Sıra: ${order.join(' → ')}`
      );
    }
    return i + 1;
  },

  tabButton(tab: TabName) {
    return browser.$(TAB_BAR_BUTTON(this.tabIndex(tab)));
  },

  /** GERÇEK dokunma. Çözülemezse çağıran taraf deep link'e düşmeli. */
  async tapTab(tab: TabName): Promise<void> {
    const button = this.tabButton(tab);
    await button.waitForDisplayed({
      timeout: 10_000,
      timeoutMsg:
        `Tab bar butonu ${this.tabIndex(tab)} (${tab}) bulunamadı. ` +
        `iOS 26'da tab bar XCUIElementTypeTabBar olmayabilir — ` +
        `00-tree-dump çıktısındaki gerçek tipi kontrol et.`,
    });
    await button.click();
  },

  /** Tab bar'ın toplam buton sayısı — 03-tabbar-reachability ölçüyor. */
  async tabButtonCount(): Promise<number> {
    const buttons = await els('-ios class chain:**/XCUIElementTypeTabBar/XCUIElementTypeButton');
    return buttons.length;
  },
};
