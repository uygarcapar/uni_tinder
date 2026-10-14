import { useCallback, useRef } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { Check, InfoIcon } from "@/shared/icons";
import { showInfoToast } from "@/shared/services/toaster";
// AppMode'un tek kaynağı discover/modeTheme — kayıt ekranının kendi kopyası
// olsaydı iki liste ayrışabilirdi (wire değerleri PascalCase string).
import { APP_MODES, type AppMode } from "@/features/discover/modeTheme";
import { MODE_STEP_NUMBER } from "@/features/auth/registrationFlow";
import { colors } from "../../../shared/theme/colors";

/**
 * Kayıt adımı — "Uygulamayı ne için kullanıyorsun?" (Flört / Arkadaş).
 *
 * AKIŞTAKİ YERİ BAĞLAYICI: temel adımlardan (ad, doğum tarihi, cinsiyet, boy)
 * hemen sonra, kendinden sonraki üç adımdan ÖNCE — çünkü üçünü de o üç adım
 * bu cevaba göre şekilleniyor:
 *   • Step10 (kiminle ilgileniyorsun) yalnız Flört'te gösteriliyor
 *   • Step17 (prompt'lar) kataloğu seçilen modla süzülüyor
 *   • Step14 (niyet) Flört'te tek seçim ilişki niyeti, Arkadaş'ta çoklu seçim
 *     arkadaşlık niyeti soruyor
 * Sıra `registrationFlow.ts`ten okunuyor; burada ELLE navigate ediliyor
 * (akışın kalanı gibi) ve HEDEF MODA GÖRE DALLANIYOR — tek yer burası.
 *
 * ADIM ZORUNLU ve ATLANAMAZ: mod seçilmeden sonraki adımların hangi soruyu
 * soracağı belirsiz. "Atla" yok, varsayılan ön-seçim de yok — ön-seçim olsaydı
 * kullanıcı farkında olmadan bir modda kayıt olurdu ve bu, ürünün "flört
 * varsayılan değil" duruşunun tam tersi olurdu.
 *
 * Görsel kalıp Step10'un (InterestedIn) kartlarıyla AYNI: dolgulu seçili kart +
 * sağda tik. Tek fark açıklama satırı — iki mod arasındaki fark tek kelimeyle
 * anlaşılmıyor, kartın altına bir cümle giriyor.
 */
export default function RegisterStepModeScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "RegisterStepMode">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selected = useAppSelector(
    (s) => ((s as any).auth?.registrationForm?.mode as string) || "",
  );

  const pick = useCallback(
    (mode: AppMode) => {
      // Tekrar dokunmak SEÇİMİ TEMİZLEMİYOR (Step14'ün aksine): adım zorunlu,
      // temizlenebilir olması yalnız "devam"ı kilitlemenin yolunu açardı.
      dispatch(updateRegistrationField({ field: "mode", value: mode }));
    },
    [dispatch],
  );

  const handleNext = useCallback(() => {
    if (!selected) {
      showInfoToast({
        title: t("common.error"),
        message: t("auth.stepMode.requiredError"),
        variant: "error",
      });
      return;
    }
    // ⚠️ DALLANMA. Flört'te sıradaki adım InterestedIn; Arkadaş'ta o adım
    // akışta YOK (sunucu InterestedInFlags'i varsayılan bırakıyor) ve doğrudan
    // hobilere geçiliyor. Geri tuşu doğal çalışıyor: atlanan ekran yığına hiç
    // itilmediği için Step13'ten geri bu ekrana düşüyor.
    navigation.navigate(selected === "Friends" ? "RegisterStep13" : "RegisterStep10");
  }, [navigation, selected, t]);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
          <RegisterBackButton onPress={() => navigation.goBack()} />
        </View>
      </View>

      <RegisterProgressBar step={MODE_STEP_NUMBER} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>
            {t("auth.stepMode.title")}
          </Text>
          <Text
            className="text-[18px] font-normal mb-6"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.stepMode.description")}
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {APP_MODES.map((mode) => (
            <ModeCard
              key={mode}
              mode={mode}
              active={selected === mode}
              onPress={pick}
            />
          ))}
        </View>

        <View className="flex-row gap-2 px-2 mr-6 items-start mt-5">
          <SFIcon
            name="info.circle"
            fallback={InfoIcon}
            size={16}
            color={colors.textSecondary}
            // Glif ilk satırın ortasına otursun.
            style={{ marginTop: 1 }}
          />
          <Text
            className="text-[12px]"
            style={{ color: colors.textSecondary, flex: 1, lineHeight: 17 }}
          >
            {t("auth.stepMode.infoText")}
          </Text>
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 32,
          paddingBottom: 32,
          paddingTop: 16,
          backgroundColor: colors.bg,
        }}
      >
        <AnimatedPressableShared
          onPress={handleNext}
          style={{
            borderRadius: 999,
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
          }}
        >
          <Text
            style={{
              color: colors.onInverseSurface,
              paddingVertical: 20,
              fontWeight: "700",
              fontSize: 15,
              textAlign: "center",
            }}
          >
            {t("common.continueButton")}
          </Text>
        </AnimatedPressableShared>
      </View>
    </View>
  );
}

/**
 * Seçim kartı — MODÜL SEVİYESİNDE bileşen (render içinde tanımlanan bileşen
 * her tuşta remount olur; bu ekranda input yok ama kalıp aynı tutuluyor).
 *
 * Kendi `Animated.Value`'sunu taşıyor: Step10'daki yerel AnimatedPressable'ın
 * aynısı, oradan kopyalanmasının sebebi aynı basma hissi (scale 0.97, spring).
 */
function ModeCard({
  mode,
  active,
  onPress,
}: {
  mode: AppMode;
  active: boolean;
  onPress: (mode: AppMode) => void;
}) {
  const { t } = useTranslation();
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.97,
            useNativeDriver: true,
            speed: 20,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            bounciness: 8,
            speed: 20,
          }).start()
        }
        onPress={() => onPress(mode)}
        style={{
          // 24 — Step10'un kartlarıyla aynı yarıçap (30'da iOS tam kapsül
          // çizip `borderCurve`i yutuyor).
          borderRadius: 24,
          borderCurve: "continuous",
          borderWidth: 0.5,
          borderColor: active ? colors.inverseSurface : colors.hairline,
          backgroundColor: active ? colors.inverseSurface : "transparent",
          paddingHorizontal: 20,
          paddingVertical: 18,
          position: "relative",
        }}
      >
        <Text
          style={{
            color: active ? colors.bg : colors.text,
            fontSize: 17,
            fontWeight: "600",
            // Tik için yer: metin glifin altına taşmasın.
            marginRight: 28,
          }}
        >
          {t(`discover.mode.title.${mode}`)}
        </Text>
        <Text
          style={{
            color: active ? colors.bg : colors.textSecondary,
            fontSize: 13,
            lineHeight: 18,
            marginTop: 4,
            marginRight: 28,
            // Seçili kartta açıklama da koyu zemine geçiyor; alfa yerine tam
            // renk — `ink()` burada zemini bilmiyor (dolgu inverseSurface).
            opacity: active ? 0.75 : 1,
          }}
        >
          {t(`discover.mode.description.${mode}`)}
        </Text>
        {active && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: 20,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <SFIcon
              name="checkmark"
              fallback={Check}
              size={20}
              color={colors.bg}
              strokeWidth={2.5}
              weight="bold"
            />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
