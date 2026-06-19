import { useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";

// Ekran boyutunu alıyoruz (Garanti olsun diye)
const { width, height } = Dimensions.get("window");

const PressableScaleButton = ({ onPress, style, className, children }: any) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={style}
        className={className}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function WelcomeScreen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'Welcome'>) {
  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />

      <LinearGradient
        colors={["#ffffff", "#e3e3e3", "#9e9e9e", "#525252"]}
        locations={[0, 0.3, 0.65, 1]}
        start={{ x: -0.5, y: 0 }}
        end={{ x: 1.5, y: 1 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: height,
          width: width,
        }}
      />

      {/* İÇERİK */}
      {/* z-10 vererek içeriği gradientin üstüne çıkardık */}
      <View className="flex-1 justify-between px-8 py-16 z-10">
        {/* Üst Kısım */}
        <View className="flex-1 justify-center items-center">
          <Image
            source={require("../../assets/lit_name_black.png")}
            style={{
              width: width * 0.7,
              height: 110,
            }}
            resizeMode="contain"
          />
        </View>

        {/* Alt Kısım - Butonlar */}
        <View className="space-y-4 mb-4">
          <View className="flex flex-col gap-3">
            <PressableScaleButton
              onPress={() => navigation.navigate("RegisterStep1")}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <LinearGradient
                colors={["#0a0a0a", "#1a1a1a"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingVertical: 20,
                  alignItems: "center",
                }}
              >
                <Text className="text-white font-bold text-[14px]">
                  Hesap Oluştur
                </Text>
              </LinearGradient>
            </PressableScaleButton>

            <PressableScaleButton
              onPress={() => navigation.navigate("Login")}
              className="border-[0.5px] border-gray-200 py-[20px] items-center"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <Text className="text-gray-200 font-bold text-[14px]">
                Zaten Hesabım Var
              </Text>
            </PressableScaleButton>
          </View>

          <Text className="text-white opacity-70 text-sm text-center mt-8">
            Devam ederek <Text className=" underline">Kullanım Koşulları</Text>{" "}
            ve <Text className=" underline">Gizlilik Politikası</Text>
            'nı kabul etmiş olursun.
          </Text>
        </View>
      </View>
    </View>
  );
}

const FeatureItem = ({ icon, text }: any) => (
  <View className="flex-row items-center bg-white/10 p-3 rounded-2xl border border-white/5">
    <View className="bg-white/20 w-10 h-10 rounded-full items-center justify-center mr-4">
      <Text className="text-xl">{icon}</Text>
    </View>
    <Text className="text-white text-base font-semibold flex-1">{text}</Text>
  </View>
);
