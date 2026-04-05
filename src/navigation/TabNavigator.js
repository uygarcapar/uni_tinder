import React from "react";
import { View, TouchableOpacity, Image } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  Flame,
  Heart,
  Settings,
  UserRound,
  MessageCircle,
} from "lucide-react-native";
import DiscoverScreen from "../screens/DiscoverScreen";
import LikesScreen from "../screens/LikesScreen";
import ProfileScreen from "../screens/ProfileScreen";

// Temporary Messages Screen
function MessagesScreen() {
  return null;
}

const Tab = createBottomTabNavigator();

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
        <TouchableOpacity className="p-2 absolute right-4">
          <Settings size={24} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function TabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: route.name === "Likes" ? undefined : () => <CustomHeader />,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: "#121212",
          borderTopWidth: 0,
          borderTopColor: "#262626",
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 0),
          height: 50 + Math.max(insets.bottom, 0),
          paddingHorizontal: 12,
        },
        tabBarActiveTintColor: "#fff",
        tabBarInactiveTintColor: "#737373",
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "600",
          marginTop: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          marginTop: -8,
        },
        tabBarIcon: ({ focused, color }) => {
          let IconComponent;
          let iconSize = 24;

          if (route.name === "Discover") {
            IconComponent = Flame;
          } else if (route.name === "Likes") {
            IconComponent = Heart;
          } else if (route.name === "Messages") {
            IconComponent = MessageCircle;
          } else if (route.name === "Profile") {
            IconComponent = UserRound;
          }

          return (
            <View pointerEvents="none">
              <IconComponent
                size={iconSize}
                color={color}
                strokeWidth={2}
                fill={focused ? color : "transparent"}
              />
            </View>
          );
        },
      })}
    >
      <Tab.Screen
        name="Discover"
        component={DiscoverScreen}
        options={{ tabBarLabel: "Keşfet" }}
      />
      <Tab.Screen
        name="Likes"
        component={LikesScreen}
        options={{
          tabBarLabel: "Beğeniler",
          headerShown: false
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ tabBarLabel: "Mesajlar" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: "Profil" }}
      />
    </Tab.Navigator>
  );
}
