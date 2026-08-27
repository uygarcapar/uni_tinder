import { useCallback, useRef } from "react";
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { useTranslation } from "react-i18next";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterStickyHeader, {
  REGISTER_HEADER_HEIGHT,
} from "@/features/auth/components/RegisterStickyHeader";
import RegisterStickyFooter from "@/features/auth/components/RegisterStickyFooter";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import PromptsEditor from "@/shared/components/PromptsEditor";
import { showInfoToast } from "@/shared/services/toaster";
import {
  MIN_PROFILE_PROMPTS,
  PROMPT_ANSWER_MAX_LENGTH,
  countPromptAnswer,
  normalizePromptAnswer,
} from "@/shared/constants/limits";
import { sanitizePrompts } from "@/features/profile/promptPayload";
import type { ProfilePromptAnswer } from "@/shared/types";
import { colors } from "../../../shared/theme/colors";

type Props = NativeStackScreenProps<AuthStackParamList, "RegisterStep17">;

/**
 * Kayıt adımı — "Sorular" (prompt'lar). Bio'nun yerini alan adım.
 *
 * En az 1 cevap zorunlu, en fazla 3. Cevaplar profil slice'ında birikiyor ve
 * son adımda (`registerAndComplete`) indeksli multipart olarak gidiyor.
 *
 * react-hook-form KULLANILMIYOR: değer bir dizi ve tek kaynağı zaten redux
 * (kullanıcı geri gidip dönünce ekran unmount olduğu için form state'i
 * kaybolurdu). Doğrulama "Devam"da imperative koşuyor — Step13'ün hobi
 * seçimindeki yaklaşımın aynısı.
 */
export default function RegisterStep17Screen({ navigation }: Props) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const prompts = useAppSelector((state) => state.profile.prompts);

  // Başlık şeridinin blur zemini scroll'a bağlı beliriyor (0→60).
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  // Her değişiklik doğrudan store'a yazılıyor: kullanıcı "Devam"a basmadan geri
  // dönüp tekrar girerse cevapları kaybolmasın (Step13'teki toggleHobby ile
  // aynı gerekçe).
  // Cevaplar artık her tuşta değil, PromptsEditor'ün "Bitir" pili (ya da alanın
  // odak kaybı) ile geliyor. "Devam"a basmak input'u blur ettiği için commit
  // handleNext'ten HEMEN ÖNCE düşüyor; selector'dan okunan `prompts` ise o
  // karede hâlâ eski değer. Doğrulama bu yüzden ref'ten okunuyor — aksi hâlde
  // kullanıcı yazdığı hâlde "cevap boş" hatası alırdı.
  const promptsRef = useRef<ProfilePromptAnswer[] | null>(null);
  const handleChange = useCallback(
    (next: ProfilePromptAnswer[]) => {
      promptsRef.current = next;
      dispatch(updateMultipleFields({ prompts: next }));
    },
    [dispatch],
  );

  const handleNext = () => {
    Keyboard.dismiss();
    const current = promptsRef.current ?? prompts;

    // Soru seçilmiş ama cevabı boş/çok uzun olan slot varsa devam ettirme.
    // sanitizePrompts bunları sessizce elerdi — kullanıcı yazdığını sandığı
    // cevabın kaybolduğunu sonra fark ederdi.
    const invalid = (current ?? []).some((prompt) => {
      if (!prompt?.promptKey) return false;
      const answer = normalizePromptAnswer(prompt.answer ?? "");
      return !answer || countPromptAnswer(answer) > PROMPT_ANSWER_MAX_LENGTH;
    });
    if (invalid) {
      showInfoToast({
        title: t('common.error'),
        message: t('profile.prompts.errors.generic'),
        variant: "error",
      });
      return;
    }

    const cleaned = sanitizePrompts(current);
    if (cleaned.length < MIN_PROFILE_PROMPTS) {
      showInfoToast({
        title: t('common.error'),
        message: t('profile.prompts.requiredForRegister'),
        variant: "error",
      });
      return;
    }

    dispatch(updateMultipleFields({ prompts: cleaned }));
    navigation.navigate("RegisterStep14");
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Reanimated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          className="flex-1 px-6"
          // Başlık artık zeminsiz ve absolute: içerik altından geçiyor, bu
          // yüzden paddingTop header yüksekliği kadar (bkz. Step13).
          contentContainerStyle={{
            paddingTop: REGISTER_HEADER_HEIGHT,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View>
              <View className="flex flex-col gap-2">
                <Text className="text-4xl font-bold" style={{ color: colors.text }}>
                  {t('auth.step17.title')}
                </Text>
                <Text
                  className="text-[18px] font-normal mb-6"
                  style={{ color: colors.textSecondary }}
                >
                  {t('auth.step17.description')}
                </Text>
              </View>

              {/* Açıklama ile ilk sorunun arası: description'ın mb-6'sı (24)
                  bu blokla 44'e çıkıyor — soru başlıkları açıklamaya
                  yapışmasın. */}
              <View style={{ height: 20 }} />

              <PromptsEditor
                value={prompts ?? []}
                onChange={handleChange}
                // Bottom sheet DEĞİL: burada düz TextInput doğru bileşen.
                // Son cevabın silinmesi burada da engelli — adım zaten en az 1
                // cevap istiyor, kullanıcıyı sıfıra düşürüp "Devam"da hata
                // göstermek yerine silmeyi baştan engelliyoruz.
                allowRemoveLast={false}
              />

              <View className="h-32" />
            </View>
          </TouchableWithoutFeedback>
        </Reanimated.ScrollView>
      </KeyboardAvoidingView>

      {/* Başlık şeridi içeriğin ÜSTÜNDE: zemini yok, progressive blur + veil
          taşıyor. Ekran başlığı ("Tell us about you.") yerinde kalıyor — o
          içeriğin ilk elemanı, şeridin altından geçip kayboluyor. */}
      <RegisterStickyHeader scrollY={scrollY}>
        <View pointerEvents="box-none" className="pt-16 pb-6 px-6">
          <View pointerEvents="box-none" style={{ height: 44 }} className="flex-row items-center">
            <RegisterBackButton onPress={() => navigation.goBack()} />
          </View>
        </View>

        <RegisterProgressBar step={17} />
      </RegisterStickyHeader>

      <RegisterStickyFooter>
        <AnimatedPressable
          onPress={handleNext}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
          }}
        >
          <Text
            className="py-[20px] font-bold text-[15px] text-center"
            style={{ color: colors.onInverseSurface }}
          >
            {t('common.continueButton')}
          </Text>
        </AnimatedPressable>
      </RegisterStickyFooter>
    </View>
  );
}
