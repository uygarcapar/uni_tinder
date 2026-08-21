import { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  type TextStyle,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { staticGet } from "@/shared/services/staticCache";
import { useTranslation } from 'react-i18next';
import {
  Check, Wind, Star, Flame, Leaf, Moon, Sun,
  Scale, Zap, Navigation, Mountain, Droplets, Fish, Cigarette,
} from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { getRelationshipIntentIcon } from "@/shared/constants/relationshipIntent";
import { sortZodiacOptions } from "@/shared/constants/filterEnumIcons";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { lifestyleSchema, LifestyleForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

const ZODIAC_MAP: Record<string, { sf: SFSymbol; lucide: any }> = {
  // Backend enumName (PascalCase)
  Aries: { sf: "flame.fill", lucide: Flame }, Taurus: { sf: "leaf.fill", lucide: Leaf },
  Gemini: { sf: "wind", lucide: Wind }, Cancer: { sf: "moon.fill", lucide: Moon },
  Leo: { sf: "sun.max.fill", lucide: Sun }, Virgo: { sf: "leaf.fill", lucide: Leaf },
  Libra: { sf: "scalemass.fill", lucide: Scale }, Scorpio: { sf: "bolt.fill", lucide: Zap },
  Sagittarius: { sf: "location.fill", lucide: Navigation },
  Capricorn: { sf: "mountain.2.fill", lucide: Mountain },
  Aquarius: { sf: "drop.fill", lucide: Droplets }, Pisces: { sf: "fish.fill", lucide: Fish },
  // Legacy TR display fallback
  Koç: { sf: "flame.fill", lucide: Flame }, Boğa: { sf: "leaf.fill", lucide: Leaf },
  İkizler: { sf: "wind", lucide: Wind }, Yengeç: { sf: "moon.fill", lucide: Moon },
  Aslan: { sf: "sun.max.fill", lucide: Sun }, Başak: { sf: "leaf.fill", lucide: Leaf },
  Terazi: { sf: "scalemass.fill", lucide: Scale }, Akrep: { sf: "bolt.fill", lucide: Zap },
  Yay: { sf: "location.fill", lucide: Navigation },
  Oğlak: { sf: "mountain.2.fill", lucide: Mountain },
  Kova: { sf: "drop.fill", lucide: Droplets }, Balık: { sf: "fish.fill", lucide: Fish },
};

const getZodiacIcon = (name: string): { sf: SFSymbol; lucide: any } =>
  ZODIAC_MAP[name] || { sf: "star", lucide: Star };

const SimpleOptionItem = memo(({ option, isSelected, onToggle }: any) => (
  <AnimatedPressable
    onPress={() => onToggle(option.enumName)}
    style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
  >
    {/* forceFallback: SF Symbols'ta cigarette yok, `smoke.fill` duman bulutu
        — iOS'ta da lucide Cigarette çizilsin (bkz. SFIcon.forceFallback). */}
    <SFIcon name="smoke.fill" fallback={Cigarette} forceFallback size={20} color={isSelected ? colors.text : colors.textSecondary} strokeWidth={1.5} style={{ marginRight: 14 }} />
    <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: "500", flex: 1, marginRight: 12 }}>{option.name}</Text>
    {isSelected && <SFIcon name="checkmark" fallback={Check} size={20} color={colors.text} strokeWidth={2.5} weight="bold" />}
  </AnimatedPressable>
));

// İlişki niyeti satırı — tek seçim. İkon enumName'e bağlı (ortak harita).
const IntentOptionItem = memo(({ option, isSelected, onToggle }: any) => {
  const icon = getRelationshipIntentIcon(option.enumName);
  return (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
      style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
    >
      <SFIcon name={icon.sf} fallback={icon.lucide} size={20} color={isSelected ? colors.text : colors.textSecondary} strokeWidth={1.5} style={{ marginRight: 14 }} />
      <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: "500", flex: 1, marginRight: 12 }}>{option.name}</Text>
      {isSelected && <SFIcon name="checkmark" fallback={Check} size={20} color={colors.text} strokeWidth={2.5} weight="bold" />}
    </AnimatedPressable>
  );
});

// Bölüm başlıkları (ilişki niyeti / sigara / burç) — skeleton ve gerçek
// içerikte aynı ölçüyü kullanıyor. RENDER SIRASINDA ÇAĞIR (colors.ts mutasyon
// sözleşmesi): modül seviyesinde sabite alınırsa `color` import anında
// donuyordu ve açık modda beyaz zemine beyaz başlık çiziliyordu.
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
    <Animated.View style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.hairline, marginRight: 14 }} />
      <View style={{ width: 120, height: 14, borderRadius: 7, backgroundColor: colors.hairline }} />
    </Animated.View>
  );
});

const SkeletonZodiacPill = memo(({ width: w = 90 }: { width?: number }) => {
  const pulse = usePulse();
  return (
    <Animated.View style={{ borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 11, borderWidth: 0.5, borderColor: colors.hairline, flexDirection: "row", alignItems: "center", gap: 6, opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.hairline }} />
      <View style={{ width: w, height: 12, borderRadius: 6, backgroundColor: colors.hairline }} />
    </Animated.View>
  );
});

const ZodiacPill = memo(({ option, isSelected, onToggle }: any) => {
  const icon = getZodiacIcon(option.enumName ?? option.name);
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
      <SFIcon name={icon.sf} fallback={icon.lucide} size={20} color={isSelected ? colors.bg : colors.textSecondary} strokeWidth={1.5} />
      <Text style={{ color: isSelected ? colors.bg : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{option.name}</Text>
    </AnimatedPressable>
  );
});

export default function RegisterStep14Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep14'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [smokingStatuses, setSmokingStatuses] = useState([]);
  const [zodiacs, setZodiacs] = useState([]);
  const [relationshipIntents, setRelationshipIntents] = useState([]);
  const [loadingSmokingStatuses, setLoadingSmokingStatuses] = useState(false);
  const [loadingZodiacs, setLoadingZodiacs] = useState(false);
  const [loadingRelationshipIntents, setLoadingRelationshipIntents] = useState(false);

  const { setValue, watch } = useForm<LifestyleForm>({
    resolver: zodResolver(lifestyleSchema),
    defaultValues: {
      smokingStatus: typeof profile.smokingStatus === "string" ? profile.smokingStatus : "",
      zodiacSign: typeof profile.zodiacSign === "string" ? profile.zodiacSign : "",
      relationshipIntent:
        typeof profile.relationshipIntent === "string" ? profile.relationshipIntent : "",
    },
  });

  const smokingStatus = watch("smokingStatus");
  const zodiacSign = watch("zodiacSign");
  const relationshipIntent = watch("relationshipIntent");

  useEffect(() => {
    fetchSmokingStatuses();
    fetchZodiacs();
    fetchRelationshipIntents();
  }, []);

  // staticGet (axios) kullan, ham fetch değil: bu listelerin `name`/`display`
  // alanları backend'de Accept-Language'e göre render ediliyor ve header'ı sadece
  // axios interceptor'ı ekliyor. Kayıt akışında henüz JWT (dolayısıyla language
  // claim'i) yok → header tek dil sinyali. Ham fetch ile header gitmediği için
  // backend default culture'a (tr) düşüyor, EN kullanıcı bu adımda TR seçenek
  // görüyordu. Ayrıca staticGet oturum boyunca tek istek garantisi veriyor.
  const fetchSmokingStatuses = async () => {
    try {
      setLoadingSmokingStatuses(true);
      const data = await staticGet(API_ENDPOINTS.GET_SMOKING_STATUSES);
      if (data?.isSuccess && data.result) setSmokingStatuses(data.result);
      else alert(t('auth.step14.smokingError'));
    } catch (e) { console.error(e); alert(t('auth.step14.smokingError')); }
    finally { setLoadingSmokingStatuses(false); }
  };

  const fetchZodiacs = async () => {
    try {
      setLoadingZodiacs(true);
      const data = await staticGet(API_ENDPOINTS.GET_ZODIACS);
      if (data?.isSuccess && data.result) setZodiacs(data.result);
      else alert(t('auth.step14.zodiacError'));
    } catch (e) { console.error(e); alert(t('auth.step14.zodiacError')); }
    finally { setLoadingZodiacs(false); }
  };

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

  const toggleSmoking = useCallback((enumName: string) => {
    if (!enumName) return;
    const next = smokingStatus === enumName ? "" : enumName;
    setValue("smokingStatus", next);
    dispatch(updateMultipleFields({ smokingStatus: next === "" ? null : next }));
  }, [smokingStatus, dispatch, setValue]);

  const toggleZodiac = useCallback((enumName: string) => {
    if (!enumName) return;
    const next = zodiacSign === enumName ? "" : enumName;
    setValue("zodiacSign", next);
    dispatch(updateMultipleFields({ zodiacSign: next === "" ? null : next }));
  }, [zodiacSign, dispatch, setValue]);

  const handleNext = () => { navigation.navigate("RegisterStep16"); };

  const handleSkip = () => {
    dispatch(updateMultipleFields({ smokingStatus: null, zodiacSign: null, relationshipIntent: null }));
    navigation.navigate("RegisterStep16");
  };

  const allFieldsEmpty = !smokingStatus && !zodiacSign && !relationshipIntent;
  const isLoading =
    loadingSmokingStatuses ||
    loadingZodiacs ||
    loadingRelationshipIntents;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
          <RegisterBackButton onPress={() => navigation.goBack()} />
          <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
            <Text className="text-[16px] font-semibold" style={{ color: colors.textSecondary }}>{t('auth.step14.skipButton')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RegisterProgressBar step={14} />

      <ScrollView className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step14.title')}</Text>
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step14.description')}
          </Text>
        </View>

        {isLoading ? (
          <>
            <View style={{ marginTop: 8 }}>
              <Text style={sectionTitle()}>{t('auth.step14.relationshipIntentLabel')}</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 5 }).map((_, i) => <SkeletonSimpleOption key={i} />)}
              </View>
            </View>
            <View style={{ marginTop: 28 }}>
              <Text style={sectionTitle()}>{t('auth.step14.smokingLabel')}</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => <SkeletonSimpleOption key={i} />)}
              </View>
            </View>
            <View style={{ marginTop: 28, marginBottom: 32 }}>
              <Text style={[sectionTitle(), { marginBottom: 24 }]}>{t('auth.step14.zodiacLabel')}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[60, 70, 80, 75, 65, 85, 70, 60, 55, 75, 65, 70].map((w, i) => <SkeletonZodiacPill key={i} width={w} />)}
              </View>
            </View>
          </>
        ) : (
          <>
            {(relationshipIntents as any[]).length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={sectionTitle()}>{t('auth.step14.relationshipIntentLabel')}</Text>
                <View style={{ gap: 2 }}>
                  {(relationshipIntents as any[]).map((opt) => (
                    <IntentOptionItem key={opt.id} option={opt} isSelected={opt.enumName === relationshipIntent} onToggle={toggleRelationshipIntent} />
                  ))}
                </View>
              </View>
            )}
            {(smokingStatuses as any[]).length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text style={sectionTitle()}>{t('auth.step14.smokingLabel')}</Text>
                <View style={{ gap: 2 }}>
                  {(smokingStatuses as any[]).map((opt) => (
                    <SimpleOptionItem key={opt.id} option={opt} isSelected={opt.enumName === smokingStatus} onToggle={toggleSmoking} />
                  ))}
                </View>
              </View>
            )}
            {(zodiacs as any[]).length > 0 && (
              <View style={{ marginTop: 28, marginBottom: 32 }}>
                <Text style={[sectionTitle(), { marginBottom: 24 }]}>{t('auth.step14.zodiacLabel')}</Text>
                {/* Burç sırası (Koç→Balık) backend sırasına bırakılmıyor —
                    kullanıcı kendi burcunu bilinen bir konumda arıyor. */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sortZodiacOptions(zodiacs as any[]).map((opt: any) => (
                    <ZodiacPill key={opt.id} option={opt} isSelected={opt.enumName === zodiacSign} onToggle={toggleZodiac} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
        <View className="h-32" />
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }} onPress={handleNext}>
          <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
            {allFieldsEmpty ? t('auth.step14.skipButton') : t('common.continueButton')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
