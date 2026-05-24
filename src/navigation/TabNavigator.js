import {
  View,
  TouchableOpacity,
  Image,
  Pressable,
  Text,
  StyleSheet,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import {
  Flame,
  Heart,
  Settings,
  UserRound,
  MessageCircle,
} from "lucide-react-native";
import { useSelector } from "react-redux";
import DiscoverScreen from "../screens/DiscoverScreen";
import LikesScreen from "../screens/LikesScreen";
import ProfileScreen from "../screens/ProfileScreen";
import MessagesScreen from "../screens/MessagesScreen";
import uiBus, { cardExpandAnim } from "../services/uiBus";

const Tab = createBottomTabNavigator();

const FLOATING_BAR_HEIGHT = 66;
const FLOATING_BAR_BOTTOM_GAP = -10;
const FLOATING_BAR_HORIZONTAL = 16;
const ICON_SIZE = 24;

const ROUTE_ICONS = {
  Discover: Flame,
  Likes: Heart,
  Messages: MessageCircle,
  Profile: UserRound,
};

const ROUTE_LABELS = {
  Discover: "Keşfet",
  Likes: "Beğeniler",
  Messages: "Mesajlar",
  Profile: "Profil",
};

// Tamamen custom tab bar — react-navigation'ın BottomTabBar'ını kullanmıyoruz
// (iç iconContainer/label slot layout'u centering'i bozuyor). Doğrudan flex
// row + her item'da flex:1 + center + native Pressable.
function AnimatedTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const unreadTotal = useSelector((s) => s.chat.unreadTotal);
  const whoLikedMeCount = useSelector((s) => s.swipe.whoLikedMeCount);
  const slideDistance =
    FLOATING_BAR_HEIGHT + FLOATING_BAR_BOTTOM_GAP + insets.bottom + 20;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideDistance * cardExpandAnim.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: FLOATING_BAR_HORIZONTAL,
          right: FLOATING_BAR_HORIZONTAL,
          bottom: insets.bottom + FLOATING_BAR_BOTTOM_GAP,
          height: FLOATING_BAR_HEIGHT,
          borderRadius: FLOATING_BAR_HEIGHT / 2.1,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: "rgba(255,255,255,0.12)",
          shadowColor: "#000",
          shadowOpacity: 0.4,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
          flexDirection: "row",
          alignItems: "center",
        },
        animStyle,
      ]}
    >
      {/* Blur arkaplan */}
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      {/* Hafif tint */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(20,20,20,0.35)" },
        ]}
      />
      {/* Iconlar — her biri flex:1, tam ortalı */}
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const IconComponent = ROUTE_ICONS[route.name];
        const color = focused ? "#fff" : "rgba(255,255,255,1)";
        const showBadge = route.name === "Messages" && unreadTotal > 0;
        const badgeText = unreadTotal > 99 ? "99+" : String(unreadTotal);
        const showLikesDot = route.name === "Likes" && whoLikedMeCount > 0;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            android_ripple={{
              color: "rgba(255,255,255,0.08)",
              borderless: true,
            }}
            style={{
              flex: 1,
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              pointerEvents="none"
              style={{ alignItems: "center", justifyContent: "center" }}
            >
              <View>
                {IconComponent && (
                  <IconComponent
                    size={ICON_SIZE}
                    color={color}
                    strokeWidth={1.7}
                    fill={focused ? color : "transparent"}
                  />
                )}
                {showBadge && (
                  <View
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      borderRadius: 8,
                      backgroundColor: "#f57656",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}
                    >
                      {badgeText}
                    </Text>
                  </View>
                )}
                {showLikesDot && (
                  // Instagram tarzı: sayı yok, sadece küçük kırmızı yuvarlak,
                  // ikonun sağ-üstünde. Tab bar bg'sine karşı ince koyu border
                  // ile ayırt edilir.
                  <View
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -4,
                      width: 12,
                      height: 12,
                      borderRadius: 99,
                      backgroundColor: "#FF4D4D",
                      borderWidth: 2,
                      borderColor: "#121212",
                    }}
                  />
                )}
              </View>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: "600",
                  color,
                }}
              >
                {ROUTE_LABELS[route.name]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

function CustomHeader() {
  return (
    <SafeAreaView edges={["top"]} className="bg-[#121212] border-gray-800">
      <View className="px-6 py-7 flex-row items-center justify-center relative">
        <View className="absolute left-0 right-0 items-center justify-center">
          <Image
            source={require("../../assets/lit_name_white.png")}
            style={{ height: 50, width: 120 }}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity
          className="p-2 absolute right-4"
          onPress={() => uiBus.emit("openSettings")}
          hitSlop={10}
        >
          <Settings size={24} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={({ route }) => ({
        // lazy:false → tüm tab'lar app start'ta mount edilir. Aksi takdirde
        // WaveFillLogo'nun MaskedView mask image'i tab'a ilk girişte 1 frame
        // geç decode olup logo flash atıyor (Discover'da görünmüyor çünkü
        // splash arkasında mount oluyor).
        lazy: false,
        header:
          route.name === "Likes" ||
          route.name === "Profile" ||
          route.name === "Discover"
            ? undefined
            : () => <CustomHeader />,
        headerShown: route.name === "Discover" ? false : undefined,
        tabBarHideOnKeyboard: true,
        // Custom tab bar floating + absolute → screen content full height
        // (blur arkasında ekran görünür).
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: FLOATING_BAR_HEIGHT,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
        },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverScreen} />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ headerShown: false }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
    </Tab.Navigator>
  );
}
