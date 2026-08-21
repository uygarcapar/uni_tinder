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
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import {
  getAlcoholIcon,
  getReligiousViewIcon,
  type PillIconSpec,
} from "@/shared/constants/filterEnumIcons";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
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
    onToggle,
  }: {
    option: any;
    isSelected: boolean;
    icon: PillIconSpec;
    onToggle: (enumName: string) => void;
  }) => (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
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
          color: isSelected ? colors.text : colors.textSecondary,
          fontSize: 14,
          fontWeight: "500",
          flex: 1,
          marginRight: 12,
        }}
      >
        {option.name}
      </Text>
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

export default function RegisterStep16Screen({
  navigation,
}: NativeStackScreenProps<AuthStackParamList, "RegisterStep16">) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [alcoholUsages, setAlcoholUsages] = useState([]);
  const [religiousViews, setReligiousViews] = useState([]);
  const [loadingAlcoholUsages, setLoadingAlcoholUsages] = useState(false);
  const [loadingReligiousViews, setLoadingReligiousViews] = useState(false);

  const { setValue, watch } = useForm<BeliefsForm>({
    resolver: zodResolver(beliefsSchema),
    defaultValues: {
      alcoholUsage:
        typeof profile.alcoholUsage === "string" ? profile.alcoholUsage : "",
      religiousView:
        typeof profile.religiousView === "string" ? profile.religiousView : "",
    },
  });

  const alcoholUsage = watch("alcoholUsage");
  const religiousView = watch("religiousView");

  useEffect(() => {
    fetchAlcoholUsages();
    fetchReligiousViews();
  }, []);

  // staticGet (axios) kullan, ham fetch değil — gerekçe Step14'tekiyle aynı:
  // `name` alanı backend'de Accept-Language'e göre render ediliyor ve header'ı
  // yalnızca axios interceptor'ı ekliyor. Kayıt akışında JWT (dolayısıyla
  // language claim'i) henüz yok.
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
      updateMultipleFields({ alcoholUsage: null, religiousView: null }),
    );
    navigation.navigate("RegisterStep15");
  };

  const allFieldsEmpty = !alcoholUsage && !religiousView;
  const isLoading = loadingAlcoholUsages || loadingReligiousViews;

  // İkonlar enum'a bağlı değil: her iki listede de tek sembol kullanılıyor,
  // ayırt eden şey satır metni (bkz. filterEnumIcons'taki gerekçeler).
  const alcoholIcon = getAlcoholIcon();
  const religiousViewIcon = getReligiousViewIcon();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-between">
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

      <ScrollView className="flex-1 px-6 py-6 pt-0">
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
              <Text style={sectionTitle()}>{t("auth.step16.alcoholLabel")}</Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonOption key={i} />
                ))}
              </View>
            </View>
            <View style={{ marginTop: 28, marginBottom: 32 }}>
              <Text style={sectionTitle()}>
                {t("auth.step16.religiousViewLabel")}
              </Text>
              <View style={{ gap: 2 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonOption key={i} />
                ))}
              </View>
            </View>
          </>
        ) : (
          <>
            {(alcoholUsages as any[]).length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={sectionTitle()}>
                  {t("auth.step16.alcoholLabel")}
                </Text>
                <View style={{ gap: 2 }}>
                  {(alcoholUsages as any[]).map((opt) => (
                    <OptionItem
                      key={opt.id}
                      option={opt}
                      icon={alcoholIcon}
                      isSelected={opt.enumName === alcoholUsage}
                      onToggle={toggleAlcohol}
                    />
                  ))}
                </View>
              </View>
            )}
            {(religiousViews as any[]).length > 0 && (
              <View style={{ marginTop: 28, marginBottom: 32 }}>
                <Text style={sectionTitle()}>
                  {t("auth.step16.religiousViewLabel")}
                </Text>
                <View style={{ gap: 2 }}>
                  {(religiousViews as any[]).map((opt) => (
                    <OptionItem
                      key={opt.id}
                      option={opt}
                      icon={religiousViewIcon}
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
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
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
      </View>
    </View>
  );
}
