import { Platform } from "react-native";
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import DiscoverScreen from "@/features/discover/screens/DiscoverScreen";
import LikesScreen from "@/features/discover/screens/LikesScreen";
import ProfileScreen from "@/features/profile/screens/ProfileScreen";
import MessagesScreen from "@/features/chat/screens/MessagesScreen";
import { useAppSelector } from "@/shared/hooks/redux";
import type { TabParamList } from "@/shared/types/navigation";

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

export default function TabNavigator() {
  const unreadTotal = useAppSelector((s) => (s as any).chat.unreadTotal as number);
  const whoLikedMeCount = useAppSelector((s) => (s as any).swipe.whoLikedMeCount as number);

  const messagesBadge =
    unreadTotal > 0 ? (unreadTotal > 99 ? "99+" : String(unreadTotal)) : undefined;
  const likesBadge = whoLikedMeCount > 0 ? String(whoLikedMeCount) : undefined;

  return (
    <Tab.Navigator
      id="MainTabs"
      screenOptions={{
        // lazy:false → WaveFillLogo MaskedView mask image'i 1 frame geç decode
        // olmasın diye tüm tab'lar app start'ta mount.
        lazy: false,
        tabBarActiveTintColor: "#ffffff",
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
          title: "Keşfet",
          tabBarIcon: tabIcon("flame", "local_fire_department", "local_fire_department") as any,
        }}
      />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{
          title: "Beğeniler",
          tabBarIcon: tabIcon("heart", "favorite", "favorite_border") as any,
          tabBarBadge: likesBadge,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: "Mesajlar",
          tabBarIcon: tabIcon("message", "chat_bubble", "chat_bubble_outline") as any,
          tabBarBadge: messagesBadge,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profil",
          tabBarIcon: tabIcon("person", "person", "person_outline") as any,
        }}
      />
    </Tab.Navigator>
  );
}
