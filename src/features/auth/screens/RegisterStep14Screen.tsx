import { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  Animated,
  Easing,
} from "react-native";
// Skeleton nabzı RN Animated ile sürülüyor (yukarıdaki `Animated`); başlık
// şeridinin scroll'a bağlı blur'u reanimated worklet'i istiyor.
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
} from "react-native-reanimated";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { staticGet } from "@/shared/services/staticCache";
import { useTranslation } from 'react-i18next';
import RegisterOptionCheckbox from "@/features/auth/components/RegisterOptionCheckbox";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterStickyHeader, {
  REGISTER_HEADER_HEIGHT,
} from "@/features/auth/components/RegisterStickyHeader";
import RegisterStickyFooter from "@/features/auth/components/RegisterStickyFooter";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { showInfoToast } from "@/shared/services/toaster";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { lifestyleSchema, LifestyleForm } from "@/shared/schemas/formSchemas";
import {
  resolveLocalized,
  useFriendshipIntents,
} from "@/shared/queries/commonQueries";
import i18n from "@/shared/i18n";
import { colors } from "../../../shared/theme/colors";

// Niyet satırı — MODA GÖRE tek ya da çoklu seçim. Satır başındaki niyet ikonu KALDIRILDI:
// ekran tek soruya indi, seçenekler yalnız metin + seçim işareti.
//
// Metin backend'in kısa etiketi ("Uzun süreli") DEĞİL, i18n'deki birinci ağız
// cümlesi ("Uzun süreli bir ilişki tercih ederim"). Anahtar enumName; backend
// yeni bir değer eklerse `defaultValue` ile etikete düşüyor, satır boş kalmıyor.
const IntentOptionItem = memo(({ option, isSelected, onToggle, friends }: any) => {
  const { t } = useTranslation();
  // Flört: i18n'deki birinci ağız cümlesi ("Uzun süreli bir ilişki tercih
  // ederim"), backend etiketi yedek. Arkadaş: aynı desen ama kendi anahtar
  // ailesinden; sunucu etiketi `display` çift dilli geldiği için `resolveLocalized`
  // ile çözülüyor (ham obje render edilirse React patlar).
  const label = friends
    ? t(`discover.friendshipIntents.${option.enumName}`, {
        defaultValue: resolveLocalized(option.display, i18n.language, option.name),
      })
    : t(`auth.step14.intents.${option.enumName}`, { defaultValue: option.name });
  return (
    <AnimatedPressable
      testID={`reg-intent-${option.enumName}`}
      onPress={() => onToggle(option.enumName)}
      // Yaylanma KAPALI: bırakınca scale 1'i aşarsa tam genişlikteki satır
      // seçim anında büyüyüp kayıyormuş gibi görünüyor (bkz. AnimatedPressable).
      pressBounciness={0}
      style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
    >
      {/* lineHeight (22) = kutunun boyu (22): satır yüksekliğini HER ZAMAN metin
          belirliyor, işaret gelince satır uzayıp altındakileri itmiyor. */}
      <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 16, lineHeight: 22, fontWeight: "500", flex: 1, marginRight: 12 }}>
        {label}
      </Text>
      {/* Çıplak tik DEĞİL, kutu: aynı ilişki niyeti listesi keşif filtresinde ve
          profil düzenlemede de var, üçü aynı işareti taşımalı (bkz.
          RegisterOptionCheckbox). Seçim burada TEK — kutu çoklu seçim ima ediyor
          ama seçili satıra tekrar dokunmak temizlediği için davranış aynı. */}
      <RegisterOptionCheckbox selected={isSelected} />
    </AnimatedPressable>
  );
});

const usePulse = () => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
};

const SkeletonSimpleOption = memo(() => {
  const pulse = usePulse();
  return (
    // İkon yuvası YOK — gerçek satırda da ikon kalmadı.
    <Animated.View style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", opacity: pulse }}>
      {/* Dış kap 22 = gerçek satırın lineHeight'i; liste gelince satırlar aynı
          yükseklikte kalıyor, iskeletten içeriğe geçerken zıplama olmuyor. */}
      <View style={{ height: 22, justifyContent: "center" }}>
        <View style={{ width: 140, height: 14, borderRadius: 7, backgroundColor: colors.hairline }} />
      </View>
    </Animated.View>
  );
});

export default function RegisterStep14Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep14'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  /**
   * MOD DALLANMASI. Flört'te soru tek seçimli ilişki niyeti; Arkadaş'ta ÇOKLU
   * seçimli arkadaşlık niyeti (sunucuda bitmask). İki ayrı ekran yapılmadı
   * çünkü iskelet, başlık şeridi, ilerleme çubuğu, satır bileşeni ve zorunluluk
   * kuralı birebir aynı — ayrı dosya iki kopya bakım demekti.
   */
  const mode = useAppSelector(
    (s) => ((s as any).auth?.registrationForm?.mode as string) || "",
  );
  const isFriends = mode === "Friends";

  const [relationshipIntents, setRelationshipIntents] = useState([]);
  const [loadingRelationshipIntents, setLoadingRelationshipIntents] = useState(false);

  // Arkadaşlık niyetleri react-query'den (ilişki niyetleri staticGet ile elle
  // çekiliyor — o yol tarihsel, dokunulmadı; yenisi mevcut hook'u kullanıyor).
  const friendshipIntentsQuery = useFriendshipIntents();

  const { setValue, watch } = useForm<LifestyleForm>({
    resolver: zodResolver(lifestyleSchema),
    defaultValues: {
      relationshipIntent:
        typeof profile.relationshipIntent === "string" ? profile.relationshipIntent : "",
    },
  });

  const relationshipIntent = watch("relationshipIntent");

  // Arkadaşlık niyetleri RHF DIŞINDA: şema tek stringlik `relationshipIntent`
  // alanı için yazılmış ve submit yolunda resolver hiç çalışmıyor (doğrulama
  // imperative — bkz. handleNext). Dizi alanını şemaya sokmak iki modun
  // doğrulamasını birbirine bağlardı.
  const [friendshipIntents, setFriendshipIntents] = useState<string[]>(() =>
    Array.isArray(profile.friendshipIntents)
      ? profile.friendshipIntents.filter((v: any) => typeof v === "string")
      : [],
  );

  // Başlık şeridinin blur zemini scroll'a bağlı beliriyor (0→60).
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  useEffect(() => {
    // Flört listesi yalnız o modda çekiliyor: Arkadaş kullanıcısı için istek
    // ölü yük olurdu (ve kayıt akışı istek selini bilerek ince tutuyor).
    if (!isFriends) fetchRelationshipIntents();
  }, [isFriends]);

  // staticGet (axios) kullan, ham fetch değil: bu listelerin `name`/`display`
  // alanları backend'de Accept-Language'e göre render ediliyor ve header'ı sadece
  // axios interceptor'ı ekliyor. Kayıt akışında henüz JWT (dolayısıyla language
  // claim'i) yok → header tek dil sinyali. Ham fetch ile header gitmediği için
  // backend default culture'a (tr) düşüyor, EN kullanıcı bu adımda TR seçenek
  // görüyordu. Ayrıca staticGet oturum boyunca tek istek garantisi veriyor.
  const fetchRelationshipIntents = async () => {
    try {
      setLoadingRelationshipIntents(true);
      const data = await staticGet(API_ENDPOINTS.GET_RELATIONSHIP_INTENTS);
      if (data?.isSuccess && data.result) setRelationshipIntents(data.result);
      else alert(t('auth.step14.relationshipIntentError'));
    } catch (e) { console.error(e); alert(t('auth.step14.relationshipIntentError')); }
    finally { setLoadingRelationshipIntents(false); }
  };

  const toggleRelationshipIntent = useCallback((enumName: string) => {
    if (!enumName) return;
    const next = relationshipIntent === enumName ? "" : enumName;
    setValue("relationshipIntent", next);
    dispatch(updateMultipleFields({ relationshipIntent: next === "" ? null : next }));
  }, [relationshipIntent, dispatch, setValue]);

  /** Çoklu seçim: dokunuş ekler/çıkarır, en az bir tane handleNext'te zorunlu. */
  const toggleFriendshipIntent = useCallback(
    (enumName: string) => {
      if (!enumName) return;
      setFriendshipIntents((prev) => {
        const next = prev.includes(enumName)
          ? prev.filter((v) => v !== enumName)
          : [...prev, enumName];
        dispatch(updateMultipleFields({ friendshipIntents: next }));
        return next;
      });
    },
    [dispatch],
  );

  // Adım ZORUNLU: seçim yapılmadan geçilmiyor (eskiden "Atla" ile geçilebilen
  // isteğe bağlı bir adımdı). Doğrulama imperative — Step13/Step17'deki
  // yaklaşımın aynısı, resolver submit yolunda kullanılmıyor.
  const handleNext = () => {
    const missing = isFriends ? friendshipIntents.length === 0 : !relationshipIntent;
    if (missing) {
      showInfoToast({
        title: t('common.error'),
        message: isFriends
          ? t('discover.mode.intentsRequired')
          : t('auth.step14.requiredError'),
        variant: "error",
      });
      return;
    }
    navigation.navigate("RegisterStep16");
  };

  const isLoading = isFriends
    ? friendshipIntentsQuery.isLoading
    : loadingRelationshipIntents;

  // Listeyi ve seçim kuralını tek yerde çöz: aşağıdaki render iki dalı
  // bilmiyor, yalnız "seçenekler + bu seçili mi + dokununca ne olur" biliyor.
  const options: any[] = isFriends
    ? friendshipIntentsQuery.data ?? []
    : (relationshipIntents as any[]);
  const isSelected = (enumName: string) =>
    isFriends
      ? friendshipIntents.includes(enumName)
      : enumName === relationshipIntent;
  const onToggle = isFriends ? toggleFriendshipIntent : toggleRelationshipIntent;

  return (
    <View testID="reg-step14-screen" className="flex-1" style={{ backgroundColor: colors.bg }}>
      <Reanimated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        className="flex-1 px-6"
        // Başlık şeridi zeminsiz ve absolute: içerik altından geçiyor.
        contentContainerStyle={{
          paddingTop: REGISTER_HEADER_HEIGHT,
          paddingBottom: 24,
        }}
      >
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>
            {isFriends ? t('discover.mode.intentsTitle.Friends') : t('auth.step14.title')}
          </Text>
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {isFriends
              ? t('discover.mode.intentsDescription.Friends')
              : t('auth.step14.description')}
          </Text>
        </View>

        {/* Bölüm başlığı YOK: ekran başlığı ("Ne Arıyorsun?") artık aynı şeyi
            söylüyor, ikisi birlikte metni iki kez yazıyordu. */}
        {isLoading ? (
          <View style={{ marginTop: 8, gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => <SkeletonSimpleOption key={i} />)}
          </View>
        ) : (
          options.length > 0 && (
            <View style={{ marginTop: 8, gap: 2 }}>
              {options.map((opt) => (
                <IntentOptionItem
                  // `id` iki listede de var ama Arkadaş listesi bitmask
                  // değerleri taşıyor (1,2,4…) — anahtar olarak enumName daha
                  // güvenli, backend yeni değer eklerse çakışma olmuyor.
                  key={opt.enumName}
                  option={opt}
                  isSelected={isSelected(opt.enumName)}
                  onToggle={onToggle}
                  friends={isFriends}
                />
              ))}
            </View>
          )
        )}
        <View className="h-32" />
      </Reanimated.ScrollView>

      {/* Başlık şeridi içeriğin ÜSTÜNDE: zemin yok, progressive blur + veil.
          Ekran başlığı ("Ne Arıyorsun?") içeriğin ilk elemanı olarak yerinde
          kalıyor, şeridin altından geçiyor.

          "Atla" YOK: adım zorunlu. */}
      <RegisterStickyHeader scrollY={scrollY}>
        <View pointerEvents="box-none" className="pt-16 pb-6 px-6">
          <View
            pointerEvents="box-none"
            style={{ height: 44 }}
            className="flex-row items-center"
          >
            <RegisterBackButton onPress={() => navigation.goBack()} />
          </View>
        </View>

        <RegisterProgressBar step={14} />
      </RegisterStickyHeader>

      {/* Sticky Button */}
      <RegisterStickyFooter>
        <AnimatedPressable testID="reg-btn-next" style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }} onPress={handleNext}>
          <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
            {t('common.continueButton')}
          </Text>
        </AnimatedPressable>
      </RegisterStickyFooter>
    </View>
  );
}
