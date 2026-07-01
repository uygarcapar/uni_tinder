import { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import {
  Check, Sparkles, Users, Briefcase, Wind, Star, Flame, Leaf, Moon, Sun,
  Scale, Zap, Navigation, Mountain, Droplets, Fish, Cigarette,
} from "lucide-react-native";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { lifestyleSchema, LifestyleForm } from "@/shared/schemas/formSchemas";
import { colors, gradients } from "../../../shared/theme/colors";

const ZODIAC_MAP: Record<string, any> = {
  Koç: Flame, Boğa: Leaf, İkizler: Wind, Yengeç: Moon, Aslan: Sun,
  Başak: Leaf, Terazi: Scale, Akrep: Zap, Yay: Navigation,
  Oğlak: Mountain, Kova: Droplets, Balık: Fish,
};

const PURPOSE_MAP: Record<string, any> = {
  Flört: { icon: Sparkles, desc: "Hafif, eğlenceli ve heyecanlı bir bağlantı arıyorum." },
  Arkadaşlık: { icon: Users, desc: "Yeni insanlarla tanışmak ve sosyal çevreyi genişletmek istiyorum." },
  Network: { icon: Briefcase, desc: "Profesyonel bağlantılar kurmak ve iş dünyasında tanışmak istiyorum." },
  Öylesine: { icon: Wind, desc: "Belirli bir beklentim yok, akışına bırakıyorum." },
};

const getZodiacIcon = (name: string) => ZODIAC_MAP[name] || Star;

const SimpleOptionItem = memo(({ option, isSelected, onToggle }: any) => (
  <AnimatedPressable
    onPress={() => onToggle(option.enumName)}
    style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
  >
    <Cigarette size={20} color={isSelected ? colors.text : colors.textSecondary} strokeWidth={1.5} style={{ marginRight: 14 }} />
    <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: "500", flex: 1, marginRight: 12 }}>{option.name}</Text>
    {isSelected && <Check size={20} color={colors.text} strokeWidth={2.5} />}
  </AnimatedPressable>
));

const PurposeOptionItem = memo(({ option, isSelected, onToggle }: any) => {
  const entry = PURPOSE_MAP[option.name];
  const Icon = entry?.icon ?? Star;
  const desc = entry?.desc;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => onToggle(option.enumName)}
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 }}
    >
      <Icon size={20} color={isSelected ? colors.text : colors.textMuted} strokeWidth={1.5} style={{ marginRight: 14 }} />
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 15, fontWeight: "500" }}>{option.name}</Text>
        {desc && <Text style={{ color: isSelected ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)", fontSize: 14, marginTop: 3 }}>{desc}</Text>}
      </View>
      {isSelected && <Check size={20} color={colors.text} strokeWidth={2.5} />}
    </TouchableOpacity>
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

const SkeletonSimpleOption = memo<{}>(() => {
  const pulse = usePulse();
  return (
    <Animated.View style={{ borderRadius: 30, borderCurve: "continuous", paddingHorizontal: 4, paddingVertical: 18, flexDirection: "row", alignItems: "center", opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 14 }} />
      <View style={{ width: 120, height: 14, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.1)" }} />
    </Animated.View>
  );
});

const SkeletonZodiacPill = memo(({ width: w = 90 }: { width?: number }) => {
  const pulse = usePulse();
  return (
    <Animated.View style={{ borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 11, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.1)", flexDirection: "row", alignItems: "center", gap: 6, opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)" }} />
      <View style={{ width: w, height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.1)" }} />
    </Animated.View>
  );
});

const SkeletonPurposeOption = memo<{}>(() => {
  const pulse = usePulse();
  return (
    <Animated.View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, opacity: pulse }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", marginRight: 14 }} />
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={{ width: 110, height: 14, borderRadius: 7, backgroundColor: "rgba(255,255,255,0.1)" }} />
        <View style={{ marginTop: 6, width: "85%", height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.07)" }} />
      </View>
    </Animated.View>
  );
});

const ZodiacPill = memo(({ option, isSelected, onToggle }: any) => {
  const Icon = getZodiacIcon(option.name);
  return (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
      style={{
        borderRadius: 999, borderCurve: "continuous", paddingHorizontal: 12, paddingVertical: 11,
        borderWidth: 0.5, flexDirection: "row", alignItems: "center", gap: 6,
        backgroundColor: isSelected ? colors.border2 : "transparent",
        borderColor: isSelected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon size={20} color={isSelected ? colors.text : colors.textSecondary} strokeWidth={1.5} />
      <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{option.name}</Text>
    </AnimatedPressable>
  );
});

export default function RegisterStep14Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep14'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [smokingStatuses, setSmokingStatuses] = useState([]);
  const [zodiacs, setZodiacs] = useState([]);
  const [usagePurposes, setUsagePurposes] = useState([]);
  const [loadingSmokingStatuses, setLoadingSmokingStatuses] = useState(false);
  const [loadingZodiacs, setLoadingZodiacs] = useState(false);
  const [loadingUsagePurposes, setLoadingUsagePurposes] = useState(false);

  const { setValue, watch } = useForm<LifestyleForm>({
    resolver: zodResolver(lifestyleSchema),
    defaultValues: {
      smokingStatus: typeof profile.smokingStatus === "string" ? profile.smokingStatus : "",
      zodiacSign: typeof profile.zodiacSign === "string" ? profile.zodiacSign : "",
      usagePurpose: typeof profile.usagePurpose === "string" ? profile.usagePurpose : "",
    },
  });

  const smokingStatus = watch("smokingStatus");
  const zodiacSign = watch("zodiacSign");
  const usagePurpose = watch("usagePurpose");

  useEffect(() => {
    fetchSmokingStatuses();
    fetchZodiacs();
    fetchUsagePurposes();
  }, []);

  const fetchSmokingStatuses = async () => {
    try {
      setLoadingSmokingStatuses(true);
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_SMOKING_STATUSES}`);
      const data = await res.json();
      if (data.isSuccess && data.result) setSmokingStatuses(data.result);
      else alert("Sigara durumları yüklenirken bir hata oluştu");
    } catch (e) { console.error(e); alert("Sigara durumları yüklenirken bir hata oluştu"); }
    finally { setLoadingSmokingStatuses(false); }
  };

  const fetchZodiacs = async () => {
    try {
      setLoadingZodiacs(true);
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_ZODIACS}`);
      const data = await res.json();
      if (data.isSuccess && data.result) setZodiacs(data.result);
      else alert("Burçlar yüklenirken bir hata oluştu");
    } catch (e) { console.error(e); alert("Burçlar yüklenirken bir hata oluştu"); }
    finally { setLoadingZodiacs(false); }
  };

  const fetchUsagePurposes = async () => {
    try {
      setLoadingUsagePurposes(true);
      const res = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_USAGE_PURPOSES}`);
      const data = await res.json();
      if (data.isSuccess && data.result) setUsagePurposes(data.result);
      else alert("Kullanım amaçları yüklenirken bir hata oluştu");
    } catch (e) { console.error(e); alert("Kullanım amaçları yüklenirken bir hata oluştu"); }
    finally { setLoadingUsagePurposes(false); }
  };

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

  const toggleUsagePurpose = useCallback((enumName: string) => {
    if (!enumName) return;
    const next = usagePurpose === enumName ? "" : enumName;
    setValue("usagePurpose", next);
    dispatch(updateMultipleFields({ usagePurpose: next === "" ? null : next }));
  }, [usagePurpose, dispatch, setValue]);

  const handleNext = () => { navigation.navigate("RegisterStep15"); };

  const handleSkip = () => {
    dispatch(updateMultipleFields({ smokingStatus: null, zodiacSign: null, usagePurpose: null }));
    navigation.navigate("RegisterStep15");
  };

  const allFieldsEmpty = !smokingStatus && !zodiacSign && !usagePurpose;
  const isLoading = loadingSmokingStatuses || loadingZodiacs || loadingUsagePurposes;

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-bg pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.goBack()} className="flex-row items-center">
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
            <Text className="text-gray-400 text-[16px] font-semibold">Atla</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RegisterProgressBar step={14} />

      <ScrollView className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Yaşam Tarzın</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            İsteğe bağlı bilgiler. Profil eşleşmelerini iyileştirir.
          </Text>
        </View>

        {isLoading ? (
          <>
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Sigara Kullanımı</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => <SkeletonSimpleOption key={i} />)}
              </View>
            </View>
            <View style={{ marginTop: 28 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Burç</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[60, 70, 80, 75, 65, 85, 70, 60, 55, 75, 65, 70].map((w, i) => <SkeletonZodiacPill key={i} width={w} />)}
              </View>
            </View>
            <View style={{ marginTop: 28, marginBottom: 32 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Kullanım Amacı</Text>
              {Array.from({ length: 4 }).map((_, i) => <SkeletonPurposeOption key={i} />)}
            </View>
          </>
        ) : (
          <>
            {(smokingStatuses as any[]).length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Sigara Kullanımı</Text>
                <View style={{ gap: 2 }}>
                  {(smokingStatuses as any[]).map((opt) => (
                    <SimpleOptionItem key={opt.id} option={opt} isSelected={opt.enumName === smokingStatus} onToggle={toggleSmoking} />
                  ))}
                </View>
              </View>
            )}
            {(zodiacs as any[]).length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Burç</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {(zodiacs as any[]).map((opt) => (
                    <ZodiacPill key={opt.id} option={opt} isSelected={opt.enumName === zodiacSign} onToggle={toggleZodiac} />
                  ))}
                </View>
              </View>
            )}
            {(usagePurposes as any[]).length > 0 && (
              <View style={{ marginTop: 28, marginBottom: 32 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 12 }}>Kullanım Amacı</Text>
                {(usagePurposes as any[]).map((opt) => (
                  <PurposeOptionItem key={opt.id} option={opt} isSelected={opt.enumName === usagePurpose} onToggle={toggleUsagePurpose} />
                ))}
              </View>
            )}
          </>
        )}
        <View className="h-32" />
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }} onPress={handleNext}>
          <LinearGradient colors={gradients.neutralFade} locations={[0, 0.35, 0.85]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} className="py-3.5">
            <Text className="text-black py-[20px] font-bold text-[15px] text-center">
              {allFieldsEmpty ? "Atla" : "Devam Et"}
            </Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}
