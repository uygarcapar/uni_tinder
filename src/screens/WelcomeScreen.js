import { View, Text, TouchableOpacity, Dimensions, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";

// Ekran boyutunu alıyoruz (Garanti olsun diye)
const { width, height } = Dimensions.get("window");

export default function WelcomeScreen({ navigation }) {
  return (
    <View className="flex-1 bg-white">
      <StatusBar style="light" />

      {/* 1. style prop'u kullandık.
         2. absolute yaptık.
         3. width ve height'i elle verdik ki kaçarı olmasın.
      */}
      <LinearGradient
        colors={["#fc0335", "#FF4D4D", "#fc7126"]}
        start={{ x: 0.1, y: 0.2 }}
        end={{ x: 0.9, y: 0.8 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: height, // Tüm ekran yüksekliği
          width: width, // Tüm ekran genişliği
        }}
      />

      {/* İÇERİK */}
      {/* z-10 vererek içeriği gradientin üstüne çıkardık */}
      <View className="flex-1 justify-between px-8 py-16 z-10">
        {/* Üst Kısım */}
        <View className="flex-1 justify-center items-center">
          <Image
            source={require("../../assets/lit_name_white.png")}
            style={{
              width: width * 0.7,
              height: 100,
            }}
            resizeMode="contain"
          />
        </View>

        {/* Alt Kısım - Butonlar */}
        <View className="space-y-4 mb-4">
          <View className="flex flex-col gap-4">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("RegisterStep1")}
              className="bg-white py-5 items-center"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <Text className="text-[#FD297B] font-bold text-[15px]">
                Hesap Oluştur
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => navigation.navigate("Login")}
              className="border-[0.5px] border-white py-5 items-center"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <Text className="text-white font-bold text-[15px]">
                Zaten Hesabım Var
              </Text>
            </TouchableOpacity>
          </View>

          <Text className="text-white text-sm text-center mt-8">
            Devam ederek <Text className=" underline">Kullanım Koşulları</Text>{" "}
            ve <Text className=" underline">Gizlilik Politikası</Text>
            'nı kabul etmiş olursun.
          </Text>
        </View>
      </View>
    </View>
  );
}

const FeatureItem = ({ icon, text }) => (
  <View className="flex-row items-center bg-white/10 p-3 rounded-2xl border border-white/5">
    <View className="bg-white/20 w-10 h-10 rounded-full items-center justify-center mr-4">
      <Text className="text-xl">{icon}</Text>
    </View>
    <Text className="text-white text-base font-semibold flex-1">{text}</Text>
  </View>
);
