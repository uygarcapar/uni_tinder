import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { colors, onMediaAt } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';
import LegalSheet, { type LegalDocument } from "../components/LegalSheet";

// Ekran boyutunu alıyoruz (Garanti olsun diye)
const { width, height } = Dimensions.get("window");

// Kusursuz loop için hazırlanmış sürüm: son ~0.6 sn baştaki karelerle
// çapraz geçişe sokulup kırpıldı, böylece bitiş karesi başlangıcın bir
// öncesine denk geliyor ve başa dönüş görünmüyor. Kesme noktası videonun
// en durgun anı (kare 14→15) seçildi.
const BACKGROUND_VIDEO = require("../../../../assets/videos/onboarding-bg2-loop.mp4");

// Perde düz artmıyor, bilerek "bel" veriyor: üstte status bar için hafif
// koyuluk, %32'de en açık nokta (videonun görünmesini istediğimiz bölge —
// bank ve ağaç tüneli orada), sonra alt üçte birde sert yükseliş. Kritik
// yüzeyler (outline buton, %70 opak sözleşme metni) o sert bölgeye denk
// geldiği için neredeyse düz koyu zemine oturuyorlar. Renk katmıyor.
const SCRIM_DARK: readonly [string, string, string, string] = [
  "rgba(0,0,0,0.38)",
  "rgba(0,0,0,0.28)",
  "rgba(0,0,0,0.72)",
  "rgba(0,0,0,0.98)",
];
const SCRIM_LOCATIONS: readonly [number, number, number, number] = [0, 0.32, 0.7, 1];

// Kaynak 9:16, ekran ondan uzun — "cover" yüksekliğe göre ölçeklediği için
// kırpma YATAYDA oluyor, videonun tüm yüksekliği zaten ekranda. Dolayısıyla
// içeriği yukarı kaydırmanın tek yolu görünümü ekrandan uzun tutup üstten
// negatif konumlandırmak. Amaç banktaki çifti buton bloğunun ve perdenin
// koyu bölgesinin üstüne çıkarmak; bedeli ~%7 daha fazla büyütme.
const VIDEO_SHIFT = 64;

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
  const [legalDoc, setLegalDoc] = useState<LegalDocument | null>(null);

  const player = useVideoPlayer(BACKGROUND_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    // Kullanıcının müziğini kesmesin — video zaten sessiz.
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  // Odak değişiminde BİLEREK duraklatmıyoruz: Login/Register'dan geri
  // dönüldüğünde video kaldığı yerden devam etsin, durup-başlaması görünmesin.
  // Uygulama arka plana atılınca iOS/Android zaten oynatmayı kendisi kesiyor.

  return (
    // Video ilk kareyi çizene kadar görünen taban. Turuncu filtre kalktığı için
    // burası da siyah — yoksa açılışta turuncudan koyuya sıçrama oluyor.
    <View className="flex-1" style={{ backgroundColor: "#000", overflow: "hidden" }}>
      <StatusBar style="light" />

      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { top: -VIDEO_SHIFT }]}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
        accessible={false}
      />

      <LinearGradient
        colors={SCRIM_DARK}
        locations={SCRIM_LOCATIONS}
        pointerEvents="none"
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
                backgroundColor: colors.onMedia,
                paddingVertical: 20,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.onMediaInverse }} className="font-bold text-[14px]">
                {t('auth.welcome.signupButton')}
              </Text>
            </PressableScaleButton>

            <PressableScaleButton
              onPress={() => navigation.navigate("Login")}
              className="border-[0.5px] py-[20px] items-center"
              style={{
                borderColor: onMediaAt(0.9),
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <Text className="font-bold text-[14px]" style={{ color: onMediaAt(0.9) }}>
                {t('auth.welcome.loginButton')}
              </Text>
            </PressableScaleButton>
          </View>

          {/* Link'ler iç içe <Text> — sarmalayan paragraf akışı bozulmasın diye
              TouchableOpacity kullanılmıyor; iç <Text>'in kendi onPress'i var.
              suppressHighlighting: iOS'ta basılıyken metnin gri kutuya
              dönmesini engeller, video üstünde çirkin duruyor. */}
          <Text className="opacity-70 text-sm text-center mt-8" style={{ color: colors.onMedia }}>
            {t('auth.welcome.termsAccept')
              .split('<1>')[0]}
            <Text
              className=" underline"
              suppressHighlighting
              accessibilityRole="link"
              onPress={() => setLegalDoc('terms')}
            >
              {t('auth.welcome.termsLink')}
            </Text>
            {t('auth.welcome.termsAccept')
              .split('</1>')[1]?.split('<2>')[0]}
            <Text
              className=" underline"
              suppressHighlighting
              accessibilityRole="link"
              onPress={() => setLegalDoc('privacy')}
            >
              {t('auth.welcome.privacyLink')}
            </Text>
            {t('auth.welcome.termsAccept')
              .split('</2>')[1]}
          </Text>
        </View>
      </View>

      <LegalSheet document={legalDoc} onClose={() => setLegalDoc(null)} />
    </View>
  );
}

