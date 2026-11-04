import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import SFIcon from "@/shared/components/SFIcon";
import { InfoIcon } from "@/shared/icons";
import { showInfoToast } from "@/shared/services/toaster";
import ModeChoiceCard from "@/features/discover/components/ModeChoiceCard";
// AppMode'un tek kaynağı discover/modeTheme — kayıt ekranının kendi kopyası
// olsaydı iki liste ayrışabilirdi (wire değerleri PascalCase string).
import { APP_MODES, type AppMode } from "@/features/discover/modeTheme";
import { MODE_STEP_NUMBER } from "@/features/auth/registrationFlow";
import { useAsksFriendsPool } from "@/features/auth/useAsksFriendsPool";
import { colors } from "../../../shared/theme/colors";

/**
 * Kayıt adımı — "Uygulamayı ne için kullanıyorsun?" (Flört / Arkadaş).
 *
 * AKIŞTAKİ YERİ BAĞLAYICI: temel adımlardan (ad, doğum tarihi, cinsiyet, boy)
 * hemen sonra, kendinden sonraki üç adımdan ÖNCE — çünkü üçünü de o üç adım
 * bu cevaba göre şekilleniyor:
 *   • Step10 (kiminle ilgileniyorsun) Flört'te her zaman, Arkadaş'ta yalnız
 *     Non-Binary kullanıcıda gösteriliyor (orada soru havuz sorusu oluyor)
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
 * Kartlar ModeChoiceCard'ın "select" varyantı — Keşif'teki mod seçicinin
 * fotoğraflı 3:2 kartlarının aynısı, seçim sağ üstteki checkbox'ta (kalıp ve
 * mürekkep gerekçeleri o dosyada). Ön-seçim olmadığı için sönükleştirme
 * buradan sürülüyor: hiçbir şey seçili değilken İKİ KART DA TAM PARLAK,
 * seçim gelince yalnız diğeri sönüyor.
 */
export default function RegisterStepModeScreen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "RegisterStepMode">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const selected = useAppSelector(
    (s) => ((s as any).auth?.registrationForm?.mode as string) || "",
  );
  // Arkadaş'ta Step10'un gösterilip gösterilmeyeceği buradan: Non-Binary
  // kullanıcıda ekran "arkadaş modunda kimleri görmek istersin" sorusu olarak
  // kalıyor. Seçim `pick` ile redux'a yazıldığı için "Devam"a basıldığında
  // hook güncel modu okuyor.
  const asksFriendsPool = useAsksFriendsPool();

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
    // ⚠️ DALLANMA. Flört'te sıradaki adım InterestedIn. Arkadaş'ta o adım
    // KOŞULLU: Non-Binary kullanıcıda "arkadaş modunda kimleri görmek
    // istersin" sorusu olarak kalıyor, diğerlerinde atlanıyor çünkü değeri
    // sunucu kendi cinsiyetinden türetip kilitliyor.
    //
    // Geri tuşu doğal çalışıyor: atlanan ekran yığına hiç itilmediği için
    // Step13'ten geri bu ekrana düşüyor.
    //
    // Türetme redux'a YAZILIYOR: ilerleme çubuğu paydayı oradan okuyor ve
    // kataloğu (React Query) kayıt akışının her ekranına taşımak zorunda
    // kalmıyor. Her geçişte yeniden yazılıyor — kullanıcı geri dönüp
    // cinsiyetini ya da modunu değiştirirse değer bayat kalmasın.
    dispatch(
      updateRegistrationField({
        field: "asksFriendsPool",
        value: asksFriendsPool,
      }),
    );
    const skipInterestedIn = selected === "Friends" && !asksFriendsPool;
    navigation.navigate(skipInterestedIn ? "RegisterStep13" : "RegisterStep10");
  }, [asksFriendsPool, dispatch, navigation, selected, t]);

  return (
    <View testID="reg-stepmode-screen" className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
          <RegisterBackButton onPress={() => navigation.goBack()} />
        </View>
      </View>

      <RegisterProgressBar step={MODE_STEP_NUMBER} />

      {/* İçerik KAYDIRILABİLİR (Devam footer'ı sabit): iki 3:2 kart + başlık +
          bilgi satırı sabit kolona sığmıyor — 6.1"te bilgi satırı footer'ın
          altında kalıyor, SE sınıfında taşma ~180pt ve boşluk kısmak
          kurtarmıyor. Kartlar tam genişlik 3:2 kalıyor, nefesi scroll veriyor. */}
      <ScrollView
        testID="reg-stepmode-scroll"
        className="flex-1"
        // px-6 py-6 pt-0'ın karşılığı — contentContainer'da className
        // kullanmıyoruz (css-interop'un sessiz düşme tuzağından uzak dur).
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
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
            <ModeChoiceCard
              key={mode}
              mode={mode}
              variant="select"
              active={selected === mode}
              dimmed={selected !== "" && selected !== mode}
              testID={`reg-mode-${mode}`}
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
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 32,
          paddingBottom: 32,
          paddingTop: 16,
          backgroundColor: colors.bg,
        }}
      >
        <AnimatedPressableShared
          testID="reg-btn-next"
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

