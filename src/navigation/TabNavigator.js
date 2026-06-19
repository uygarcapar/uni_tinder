import { Platform } from "react-native";
import { createNativeBottomTabNavigator } from "@react-navigation/bottom-tabs/unstable";
import { useSelector } from "react-redux";
import DiscoverScreen from "../screens/DiscoverScreen";
import LikesScreen from "../screens/LikesScreen";
import ProfileScreen from "../screens/ProfileScreen";
import MessagesScreen from "../screens/MessagesScreen";

const Tab = createNativeBottomTabNavigator();

// focused → filled variant, idle → outlined. SF Symbols: `name` vs `name.fill`.
// Material Symbols: outlined isim genelde `_outline`/`_border` suffix'i alır.
const tabIcon = (sfBase, materialFilled, materialOutlined) => ({ focused }) =>
  Platform.select({
    ios: { type: "sfSymbol", name: focused ? `${sfBase}.fill` : sfBase },
    android: {
      type: "materialSymbol",
      name: focused ? materialFilled : materialOutlined,
    },
  });

export default function TabNavigator() {
  const unreadTotal = useSelector((s) => s.chat.unreadTotal);
  const whoLikedMeCount = useSelector((s) => s.swipe.whoLikedMeCount);

  const messagesBadge =
    unreadTotal > 0
      ? unreadTotal > 99
        ? "99+"
        : String(unreadTotal)
      : undefined;
  const likesBadge = whoLikedMeCount > 0 ? String(whoLikedMeCount) : undefined;

  return (
    <Tab.Navigator
      screenOptions={{
        // lazy:false → WaveFillLogo MaskedView mask image'i 1 frame geç decode
        // olmasın diye tüm tab'lar app start'ta mount.
        lazy: false,
        tabBarActiveTintColor: "#ffffff",
        // Explicit white inactive tint → iOS 26 liquid glass content'a göre BG
        // adapt etse bile iconlar her zaman beyaz kalır.
        tabBarInactiveTintColor: "rgba(255,255,255,0.7)",
        // 'dark' = legacy UIBlurEffectStyle.dark, fixed-tone. iOS 26 liquid
        // glass'ın content-adaptation davranışını override etmeye en yakın
        // değer (systemX varyantları yeni glass API'sine düşüp light content'te
        // BG'yi beyaza çekiyor).
        tabBarBlurEffect: "dark",
        tabBarStyle: { backgroundColor: "rgba(18,18,18,0.92)" },
      }}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{
          title: "Keşfet",
          tabBarIcon: tabIcon(
            "flame",
            "local_fire_department",
            "local_fire_department",
          ),
        }}
      />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{
          title: "Beğeniler",
          tabBarIcon: tabIcon("heart", "favorite", "favorite_border"),
          tabBarBadge: likesBadge,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: "Mesajlar",
          tabBarIcon: tabIcon("message", "chat_bubble", "chat_bubble_outline"),
          tabBarBadge: messagesBadge,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: "Profil",
          tabBarIcon: tabIcon("person", "person", "person_outline"),
        }}
      />
    </Tab.Navigator>
  );
}
