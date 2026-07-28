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
import { colors, gradients } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <View className="flex-1 bg-white">
      <StatusBar style="dark" />

      <LinearGradient
        colors={gradients.welcomeBackdrop}
        locations={[0, 0.55, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
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
            source={require("../../../../assets/lit_name_white.png")}
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
                backgroundColor: "white",
                paddingVertical: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.bgDeep }} className="font-bold text-[14px]">
                {t('auth.welcome.signupButton')}
              </Text>
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
                {t('auth.welcome.loginButton')}
              </Text>
            </PressableScaleButton>
          </View>

          <Text className="text-white opacity-70 text-sm text-center mt-8">
            {t('auth.welcome.termsAccept')
              .split('<1>')[0]}
            <Text className=" underline">{t('auth.welcome.termsLink')}</Text>
            {t('auth.welcome.termsAccept')
              .split('</1>')[1]?.split('<2>')[0]}
            <Text className=" underline">{t('auth.welcome.privacyLink')}</Text>
            {t('auth.welcome.termsAccept')
              .split('</2>')[1]}
          </Text>
        </View>
      </View>
    </View>
  );
}

