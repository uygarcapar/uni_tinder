import { Platform } from "react-native";
import { useTranslation } from 'react-i18next';
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import DiscoverScreen from "@/features/discover/screens/DiscoverScreen";
import LikesScreen from "@/features/discover/screens/LikesScreen";
import ProfileScreen from "@/features/profile/screens/ProfileScreen";
import MessagesScreen from "@/features/chat/screens/MessagesScreen";
import { useAppSelector } from "@/shared/hooks/redux";
import type { TabParamList } from "@/shared/types/navigation";
import { colors } from "../shared/theme/colors";

const Tab = createNativeBottomTabNavigator<TabParamList>();

type TabIconArgs = { focused: boolean };

// focused → filled variant, idle → outlined. SF Symbols: `name` vs `name.fill`.
const tabIcon = (sfBase: string, materialFilled: string, materialOutlined: string) =>
  ({ focused }: TabIconArgs) =>
    Platform.select({
      ios: { type: "sfSymbol", name: focused ? `${sfBase}.fill` : sfBase },
      android: {
        type: "materialSymbol",
        name: focused ? materialFilled : materialOutlined,
      },
    });

// Discover sekmesi uygulamaya özel alev glyph'ini kullanır (premium rozetiyle
// aynı şekil, bkz. shared/components/icons/FlameGlyph). Native tab bar ikon
// olarak yalnız SF Symbol veya yerel resim kabul ediyor — React component /
// SVG geçilemiyor — o yüzden glyph @1x/@2x/@3x PNG'ye rasterize edildi.
// PNG'ler beyaz+alpha: iOS'ta `tinted` varsayılanı true olduğu için template
// olarak aktif/pasif tint'i alır, Android'de tint uygulanmasa bile koyu tab
// bar üzerinde görünür kalır.
//
// Diğer sekmelerdeki `name` / `name.fill` davranışının karşılığı: idle →
// outline, focused → dolu. Outline elle çizilmedi, dolu siluetten mesafe
// alanıyla türetildi (inner stroke, 1.7pt) — dış siluet ikisinde de aynı,
// yani sekme değişince ikon zıplamaz.
//
// Boyutu/kalınlığı değiştirmek istersen PNG'leri üreten script'ten yeniden
// bas; asset'leri elle ölçekleme, hinting bozulur.
const FLAME_TAB_FILLED = {
  type: "image" as const,
  source: require("../../assets/icons/flame-tab.png"),
};
const FLAME_TAB_OUTLINE = {
  type: "image" as const,
  source: require("../../assets/icons/flame-tab-outline.png"),
};

export default function TabNavigator() {
  const { t } = useTranslation();
  const unreadTotal = useAppSelector((s) => (s as any).chat.unreadTotal as number);
  const whoLikedMeCount = useAppSelector((s) => (s as any).swipe.whoLikedMeCount as number);

  const messagesBadge =
    unreadTotal > 0 ? (unreadTotal > 99 ? "99+" : String(unreadTotal)) : undefined;
  const likesBadge = whoLikedMeCount > 0 ? String(whoLikedMeCount) : undefined;

  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        // lazy:true → açılışta sadece Discover mount olur; Messages/Profile (ve
        // onların fetch'leri: 10× history prefetch, tüm common/* option listeleri,
        // GetMyProfile) ilk kez sekmeye girilince mount olur. ÖNCESİ lazy:false idi
        // (WaveFillLogo'nun mask decode timing'i için); WaveFillLogo statiğe
        // çevrildiği için o kısıt kalktı. Bu, cold-boot istek selini ve eşzamanlı
        // ağır-mount fırtınasını (Fabric commit-storm / crash penceresi) keser.
        lazy: true,
        tabBarActiveTintColor: colors.text,
        // Explicit white inactive tint → iOS 26 liquid glass content'a göre BG
        // adapt etse bile iconlar her zaman beyaz kalır.
        tabBarInactiveTintColor: "rgba(255,255,255,0.7)",
        // 'dark' = legacy UIBlurEffectStyle.dark, fixed-tone. iOS 26 liquid
        // glass'ın content-adaptation davranışını override etmeye en yakın değer.
        tabBarBlurEffect: "dark",
        tabBarStyle: { backgroundColor: "rgba(18,18,18,0.92)" },
      } as any}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          title: t('discover.tabTitle'),
          tabBarIcon: ({ focused }: TabIconArgs) =>
            focused ? FLAME_TAB_FILLED : FLAME_TAB_OUTLINE,
        }}
      />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{
          title: t('likes.tabTitle'),
          tabBarIcon: tabIcon("heart", "favorite", "favorite_border") as any,
          tabBarBadge: likesBadge,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: t('chat.tabTitle'),
          tabBarIcon: tabIcon("message", "chat_bubble", "chat_bubble_outline") as any,
          tabBarBadge: messagesBadge,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: t('profile.tabTitle'),
          tabBarIcon: tabIcon("person", "person", "person_outline") as any,
        }}
      />
    </Tab.Navigator>
  );
}
