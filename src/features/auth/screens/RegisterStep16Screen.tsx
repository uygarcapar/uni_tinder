import { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  type TextStyle,
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
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import {
  getAlcoholIcon,
  getSmokingIcon,
  getZodiacIcon,
  sortZodiacOptions,
  type PillIconSpec,
} from "@/shared/constants/filterEnumIcons";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterStickyHeader, {
  REGISTER_HEADER_HEIGHT,
} from "@/features/auth/components/RegisterStickyHeader";
import RegisterStickyFooter from "@/features/auth/components/RegisterStickyFooter";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { beliefsSchema, BeliefsForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

// Step14'ün SimpleOptionItem'ıyla aynı satır; farkı ikonun sabit değil
// dışarıdan gelmesi (alkol kadeh, dini görüş eller-ve-parıltı).
const OptionItem = memo(
  ({
    option,
    isSelected,
    icon,
    label,
    onToggle,
  }: {
    option: any;
    isSelected: boolean;
    icon: PillIconSpec;
    /** Gösterilecek metin — verilmezse backend etiketi. */
    label?: string;
    onToggle: (enumName: string) => void;
  }) => (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
      // Step14'teki satırlarla aynı: yaylanma kapalı, yoksa seçim anında satır
      // scale 1'i aşıp büyüyor/kayıyor gibi görünüyor.
      pressBounciness={0}
      style={{
        borderRadius: 30,
        borderCurve: "continuous",
        paddingHorizontal: 4,
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <SFIcon
        name={icon.sf}
        fallback={icon.lucide}
        forceFallback={icon.forceFallback}
        size={20}
        color={isSelected ? colors.text : colors.textSecondary}
        strokeWidth={1.5}
        style={{ marginRight: 14 }}
      />
      <Text
        style={{
          // Step14'ün seçenek satırıyla AYNI ölçü (14 → 16): iki ekran akışta
          // arka arkaya geliyor, satırlar farklı boyutta durmasın.
          color: isSelected ? colors.text : colors.textSecondary,
          fontSize: 16,
          // lineHeight (22) > ikon boyu (20): satır yüksekliğini metin belirliyor,
          // tik gelip gidince satır uzayıp kısalmıyor.
          lineHeight: 22,
          fontWeight: "500",
          flex: 1,
          marginRight: 12,
        }}
      >
        {label ?? option.name}
      </Text>
      {/* Tik yuvası HER ZAMAN çiziliyor (koşullu olan yalnız ikon): yoksa
          seçilince metnin genişliği daralıp satır kayıyor. Yükseklik de sabit —
          boş View'ın boyu 0. */}
      <View style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
        {isSelected && (
          <SFIcon
            name="checkmark"
            fallback={Check}
            size={20}
            color={colors.text}
            strokeWidth={2.5}
            weight="bold"
          />
        )}
      </View>
    </AnimatedPressable>
  ),
);

// RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon sözleşmesi): modül seviyesinde
// sabite alınırsa `color` import anında donuyor ve açık modda beyaz zemine
// beyaz başlık çiziliyor.
const sectionTitle = (): TextStyle => ({
  color: colors.text,
  fontSize: 18,
  fontWeight: "700",
  marginBottom: 12,
});

const usePulse = () => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
};

const SkeletonOption = memo(() => {
  const pulse = usePulse();
  return (
    <Animated.View
      style={{
        borderRadius: 30,
        borderCurve: "continuous",
        paddingHorizontal: 4,
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        opacity: pulse,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: colors.hairline,
          marginRight: 14,
        }}
      />
      <View
        style={{
          width: 120,
          height: 14,
          borderRadius: 7,
          backgroundColor: colors.hairline,
        }}
      />
    </Animated.View>
  );
});

// Pil iskeleti — burç ve dini görüş ızgaralarının ikisi de kullanıyor.
const SkeletonPill = memo(({ width: w = 90 }: { width?: number }) => {
  const pulse = usePulse();
  return (
    <Animated.View style={{ borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 11, borderWidth: 0.5, borderColor: colors.hairline, flexDirection: "row", alignItems: "center", gap: 6, opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.hairline }} />
      <View style={{ width: w, height: 12, borderRadius: 6, backgroundColor: colors.hairline }} />
    </Animated.View>
  );
});

// Dini görüş pili — burç pilinin ikonsuz kardeşi. İkon YOK (bilinçli):
// `getReligiousViewIcon` her değer için AYNI sembolü döndürüyor, dokuz pilde
// tekrar eden aynı ikon ayırt etmiyor, yalnız gürültü ekliyordu.
const PlainPill = memo(({ option, isSelected, onToggle }: any) => (
  <AnimatedPressable
    onPress={() => onToggle(option.enumName)}
    style={{
      borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 16, paddingVertical: 11,
      borderWidth: 0.5, flexDirection: "row", alignItems: "center",
      backgroundColor: isSelected ? colors.inverseSurface : "transparent",
      borderColor: isSelected ? colors.inverseSurface : colors.hairline,
    }}
  >
    <Text style={{ color: isSelected ? colors.onInverseSurface : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{option.name}</Text>
  </AnimatedPressable>
));

// Burç pili — Step14'ten TAŞINDI. İkon ortak haritadan (`getZodiacIcon`).
const ZodiacPill = memo(({ option, isSelected, onToggle }: any) => {
  const icon = getZodiacIcon(option.enumName);
  return (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
      style={{
        borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 11,
        borderWidth: 0.5, flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: isSelected ? colors.inverseSurface : "transparent",
        borderColor: isSelected ? colors.inverseSurface : colors.hairline,
      }}
    >
      <SFIcon name={icon.sf} fallback={icon.lucide} size={20} color={isSelected ? colors.onInverseSurface : colors.textSecondary} strokeWidth={1.5} />
      {/* Pil yazı boyutu 14: hobi pilleri ve dini görüş pilleriyle ORTAK ölçü. */}
      <Text style={{ color: isSelected ? colors.onInverseSurface : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{option.name}</Text>
    </AnimatedPressable>
  );
});

export default function RegisterStep16Screen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "RegisterStep16">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [smokingStatuses, setSmokingStatuses] = useState([]);
  const [alcoholUsages, setAlcoholUsages] = useState([]);
  const [zodiacs, setZodiacs] = useState([]);
  const [religiousViews, setReligiousViews] = useState([]);
  const [loadingSmokingStatuses, setLoadingSmokingStatuses] = useState(false);
  const [loadingAlcoholUsages, setLoadingAlcoholUsages] = useState(false);
  const [loadingZodiacs, setLoadingZodiacs] = useState(false);
  const [loadingReligiousViews, setLoadingReligiousViews] = useState(false);

  const { setValue, watch } = useForm<BeliefsForm>({
    resolver: zodResolver(beliefsSchema),
    defaultValues: {
      smokingStatus:
        typeof profile.smokingStatus === "string" ? profile.smokingStatus : "",
      alcoholUsage:
        typeof profile.alcoholUsage === "string" ? profile.alcoholUsage : "",
      zodiacSign:
        typeof profile.zodiacSign === "string" ? profile.zodiacSign : "",
      religiousView:
        typeof profile.religiousView === "string" ? profile.religiousView : "",
    },
  });

  const smokingStatus = watch("smokingStatus");
  const alcoholUsage = watch("alcoholUsage");
  const zodiacSign = watch("zodiacSign");
  const religiousView = watch("religiousView");

  // Başlık şeridinin blur zemini scroll'a bağlı beliriyor (0→60).
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  useEffect(() => {
    fetchSmokingStatuses();
    fetchAlcoholUsages();
    fetchZodiacs();
    fetchReligiousViews();
  }, []);

  // staticGet (axios) kullan, ham fetch değil — gerekçe Step14'tekiyle aynı:
  // `name` alanı backend'de Accept-Language'e göre render ediliyor ve header'ı
  // yalnızca axios interceptor'ı ekliyor. Kayıt akışında JWT (dolayısıyla
  // language claim'i) henüz yok.
  const fetchSmokingStatuses = async () => {
    try {
      setLoadingSmokingStatuses(true);
      const data = await staticGet(API_ENDPOINTS.GET_SMOKING_STATUSES);
      if (data?.isSuccess && data.result) setSmokingStatuses(data.result);
      else alert(t("auth.step16.smokingError"));
    } catch (e) {
      console.error(e);
      alert(t("auth.step16.smokingError"));
    } finally {
      setLoadingSmokingStatuses(false);
    }
  };

  const fetchZodiacs = async () => {
    try {
      setLoadingZodiacs(true);
      const data = await staticGet(API_ENDPOINTS.GET_ZODIACS);
      if (data?.isSuccess && data.result) setZodiacs(data.result);
      else alert(t("auth.step16.zodiacError"));
    } catch (e) {
      console.error(e);
      alert(t("auth.step16.zodiacError"));
    } finally {
      setLoadingZodiacs(false);
    }
  };

  const fetchAlcoholUsages = async () => {
    try {
      setLoadingAlcoholUsages(true);
      const data = await staticGet(API_ENDPOINTS.GET_ALCOHOL_USAGES);
      if (data?.isSuccess && data.result) setAlcoholUsages(data.result);
      else alert(t("auth.step16.alcoholError"));
    } catch (e) {
      console.error(e);
      alert(t("auth.step16.alcoholError"));
    } finally {
      setLoadingAlcoholUsages(false);
    }
  };

  const fetchReligiousViews = async () => {
    try {
      setLoadingReligiousViews(true);
      const data = await staticGet(API_ENDPOINTS.GET_RELIGIOUS_VIEWS);
      if (data?.isSuccess && data.result) setReligiousViews(data.result);
      else alert(t("auth.step16.religiousViewError"));
    } catch (e) {
      console.error(e);
      alert(t("auth.step16.religiousViewError"));
    } finally {
      setLoadingReligiousViews(false);
    }
  };

  const toggleSmoking = useCallback(
    (enumName: string) => {
      if (!enumName) return;
      const next = smokingStatus === enumName ? "" : enumName;
      setValue("smokingStatus", next);
      dispatch(updateMultipleFields({ smokingStatus: next === "" ? null : next }));
    },
    [smokingStatus, dispatch, setValue],
  );

  const toggleZodiac = useCallback(
    (enumName: string) => {
      if (!enumName) return;
      const next = zodiacSign === enumName ? "" : enumName;
      setValue("zodiacSign", next);
      dispatch(updateMultipleFields({ zodiacSign: next === "" ? null : next }));
    },
    [zodiacSign, dispatch, setValue],
  );

  const toggleAlcohol = useCallback(
    (enumName: string) => {
      if (!enumName) return;
      const next = alcoholUsage === enumName ? "" : enumName;
      setValue("alcoholUsage", next);
      dispatch(updateMultipleFields({ alcoholUsage: next === "" ? null : next }));
    },
    [alcoholUsage, dispatch, setValue],
  );

  const toggleReligiousView = useCallback(
    (enumName: string) => {
      if (!enumName) return;
      const next = religiousView === enumName ? "" : enumName;
      setValue("religiousView", next);
      dispatch(
        updateMultipleFields({ religiousView: next === "" ? null : next }),
      );
    },
    [religiousView, dispatch, setValue],
  );

  const handleNext = () => {
    navigation.navigate("RegisterStep15");
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        smokingStatus: null,
        alcoholUsage: null,
        zodiacSign: null,
        religiousView: null,
      }),
    );
    navigation.navigate("RegisterStep15");
  };

  const allFieldsEmpty =
    !smokingStatus && !alcoholUsage && !zodiacSign && !religiousView;
  const isLoading =
    loadingSmokingStatuses ||
    loadingAlcoholUsages ||
    loadingZodiacs ||
    loadingReligiousViews;

  // Sigara ve alkol satırlarında ikon enum'a bağlı değil, liste başına tek
  // sembol; ayırt eden şey satır metni (bkz. filterEnumIcons'taki gerekçeler).
  // Burç ikonu enumName'e göre değişiyor (ZodiacPill içinde), dini görüş
  // pillerinde ikon yok (bkz. PlainPill).
  const smokingIcon = getSmokingIcon();
  const alcoholIcon = getAlcoholIcon();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
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
            {t("auth.step16.title")}
          </Text>
          <Text
            className="text-[18px] font-normal mb-6"
            style={{ color: colors.textSecondary }}
          >
            {t("auth.step16.description")}
          </Text>
        </View>

        {isLoading ? (
          <>
            <View style={{ marginTop: 8 }}>
              <Text style={sectionTitle()}>{t("auth.step16.smokingLabel")}</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonOption key={i} />
                ))}
              </View>
            </View>
            <View style={{ marginTop: 28 }}>
              <Text style={sectionTitle()}>{t("auth.step16.alcoholLabel")}</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonOption key={i} />
                ))}
              </View>
            </View>
            <View style={{ marginTop: 28 }}>
              <Text style={[sectionTitle(), { marginBottom: 24 }]}>
                {t("auth.step16.zodiacLabel")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[60, 70, 80, 75, 65, 85, 70, 60, 55, 75, 65, 70].map((w, i) => (
                  <SkeletonPill key={i} width={w} />
                ))}
              </View>
            </View>
            <View style={{ marginTop: 28, marginBottom: 32 }}>
              <Text style={[sectionTitle(), { marginBottom: 24 }]}>
                {t("auth.step16.religiousViewLabel")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[70, 85, 60, 55, 65, 75, 80, 60, 110].map((w, i) => (
                  <SkeletonPill key={i} width={w} />
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {(smokingStatuses as any[]).length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={sectionTitle()}>
                  {t("auth.step16.smokingLabel")}
                </Text>
                <View style={{ gap: 2 }}>
                  {(smokingStatuses as any[]).map((opt) => (
                    <OptionItem
                      key={opt.id}
                      option={opt}
                      icon={smokingIcon}
                      label={t(`auth.step16.smoking.${opt.enumName}`, {
                        defaultValue: opt.name,
                      })}
                      isSelected={opt.enumName === smokingStatus}
                      onToggle={toggleSmoking}
                    />
                  ))}
                </View>
              </View>
            )}
            {(alcoholUsages as any[]).length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text style={sectionTitle()}>
                  {t("auth.step16.alcoholLabel")}
                </Text>
                <View style={{ gap: 2 }}>
                  {(alcoholUsages as any[]).map((opt) => (
                    <OptionItem
                      key={opt.id}
                      option={opt}
                      icon={alcoholIcon}
                      label={t(`auth.step16.alcohol.${opt.enumName}`, {
                        defaultValue: opt.name,
                      })}
                      isSelected={opt.enumName === alcoholUsage}
                      onToggle={toggleAlcohol}
                    />
                  ))}
                </View>
              </View>
            )}
            {(zodiacs as any[]).length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text style={[sectionTitle(), { marginBottom: 24 }]}>
                  {t("auth.step16.zodiacLabel")}
                </Text>
                {/* Burç sırası (Koç→Balık) backend sırasına bırakılmıyor —
                    kullanıcı kendi burcunu bilinen bir konumda arıyor. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sortZodiacOptions(zodiacs as any[]).map((opt: any) => (
                    <ZodiacPill
                      key={opt.id}
                      option={opt}
                      isSelected={opt.enumName === zodiacSign}
                      onToggle={toggleZodiac}
                    />
                  ))}
                </View>
              </View>
            )}
            {(religiousViews as any[]).length > 0 && (
              <View style={{ marginTop: 28, marginBottom: 32 }}>
                <Text style={[sectionTitle(), { marginBottom: 24 }]}>
                  {t("auth.step16.religiousViewLabel")}
                </Text>
                {/* Burç gibi pil ızgarası: dokuz kısa etiket satır satır
                    listelenince sayfa gereksiz uzuyordu. Sıra backend'den
                    geldiği gibi — burçtaki kanonik sıra gibi bir beklenti yok. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(religiousViews as any[]).map((opt) => (
                    <PlainPill
                      key={opt.id}
                      option={opt}
                      isSelected={opt.enumName === religiousView}
                      onToggle={toggleReligiousView}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <View className="h-32" />
      </Reanimated.ScrollView>

      {/* Başlık şeridi içeriğin ÜSTÜNDE: zemin yok, progressive blur + veil.
          Ekran başlığı ("Your Habits and Beliefs") içeriğin ilk elemanı olarak
          yerinde kalıyor, şeridin altından geçiyor. */}
      <RegisterStickyHeader scrollY={scrollY}>
        <View pointerEvents="box-none" className="pt-16 pb-6 px-6">
          <View
            pointerEvents="box-none"
            style={{ height: 44 }}
            className="flex-row items-center justify-between"
          >
            <RegisterBackButton onPress={() => navigation.goBack()} />
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text
                className="text-[16px] font-semibold"
                style={{ color: colors.textSecondary }}
              >
                {t("auth.step16.skipButton")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <RegisterProgressBar step={16} />
      </RegisterStickyHeader>

      {/* Sticky Button */}
      <RegisterStickyFooter>
        <AnimatedPressable
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: colors.inverseSurface,
          }}
          onPress={handleNext}
        >
          <Text
            className="py-[20px] font-bold text-[15px] text-center"
            style={{ color: colors.onInverseSurface }}
          >
            {allFieldsEmpty
              ? t("auth.step16.skipButton")
              : t("common.continueButton")}
          </Text>
        </AnimatedPressable>
      </RegisterStickyFooter>
    </View>
  );
}
