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
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import { useTranslation } from 'react-i18next';
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { hobbiesSchema, HobbiesForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import HobbyIcon from "@/shared/components/HobbyIcon";

const SkeletonHobbyCard = memo(() => {
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
  return (
    <Animated.View style={{ flex: 1, minWidth: "30%", minHeight: 104, borderRadius: 32, borderCurve: "continuous", overflow: "hidden", borderWidth: 0.5, borderColor: colors.hairline, backgroundColor: colors.surface, paddingVertical: 0, opacity: pulse, position: "relative" }}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.hairline }} />
        <View style={{ marginTop: 8, width: 48, height: 10, borderRadius: 5, backgroundColor: colors.hairline }} />
      </View>
    </Animated.View>
  );
});

const HobbyItem = memo(({ hobby, isSelected, onPress }: any) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scaleValue, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () => Animated.spring(scaleValue, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  return (
    <Animated.View style={{ flex: 1, minWidth: "30%", transform: [{ scale: scaleValue }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onPress(hobby.enumName)}
        style={{
          borderRadius: 32,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: isSelected ? colors.inverseSurface : colors.hairline,
          backgroundColor: isSelected ? colors.inverseSurface : "transparent",
        }}
        className="py-[26px] items-center justify-center"
      >
        <View pointerEvents="none" className="items-center justify-center">
          <HobbyIcon hobby={hobby.enumName ?? hobby.name} size={28} color={isSelected ? colors.bg : colors.text} strokeWidth={2} />
          <Text
            className="text-[12px] font-medium mt-2 text-center px-1"
            style={{ color: isSelected ? colors.bg : colors.text }}
          >
            {hobby.name}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function RegisterStep13Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep13'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [hobbyCategories, setHobbyCategories] = useState([]);
  const [loadingHobbies, setLoadingHobbies] = useState(false);

  const { handleSubmit, setValue, watch } = useForm<HobbiesForm>({
    resolver: zodResolver(hobbiesSchema),
    defaultValues: { hobbies: profile.hobbies || [] },
  });

  const hobbies = watch("hobbies");

  useEffect(() => { fetchHobbies(); }, []);

  const fetchHobbies = async () => {
    try {
      setLoadingHobbies(true);
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_HOBBIES}`);
      const data = await response.json();
      if (data.isSuccess && data.result) setHobbyCategories(data.result);
      else alert(t('auth.step13.loadError'));
    } catch (error) {
      console.error("Error fetching hobbies:", error);
      alert(t('auth.step13.loadError'));
    } finally {
      setLoadingHobbies(false);
    }
  };

  // Seçim anında store'a da yazılıyor: kullanıcı "Devam"a basmadan geri döner
  // ve ekrana tekrar girerse (screen unmount olur) seçimleri kaybolmasın.
  const toggleHobby = useCallback((enumName: string) => {
    if (!enumName) return;
    const current = hobbies;
    const next = current.includes(enumName)
      ? current.filter((h) => h !== enumName)
      : current.length < 10 ? [...current, enumName] : current;
    if (next === current) return;
    setValue("hobbies", next, { shouldValidate: false });
    dispatch(updateMultipleFields({ hobbies: next }));
  }, [hobbies, setValue, dispatch]);

  const handleNext = handleSubmit(({ hobbies: h }) => {
    dispatch(updateMultipleFields({ hobbies: h }));
    navigation.navigate("RegisterStep14");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      {/* Header */}
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <View className="flex-row items-center justify-center relative">
          <View className="absolute left-0">
            <RegisterBackButton onPress={() => navigation.goBack()} />
          </View>
          <Text className="text-[26px] font-bold tracking-wider" style={{ color: colors.text }}>
            {t('auth.step13.titleWithCount', { count: hobbies.length })}
          </Text>
        </View>
      </View>

      <RegisterProgressBar step={13} />

      <ScrollView
        className="flex-1 px-6 py-6 pt-0"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!loadingHobbies}
      >
        <View className="flex flex-col gap-2 mb-3">
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step13.description')}
          </Text>
        </View>

        {loadingHobbies
          ? Array.from({ length: 5 }).map((_, catIdx) => (
              <View key={catIdx} className="mb-10">
                <View style={{ width: 110, height: 14, borderRadius: 7, backgroundColor: colors.shimmer, alignSelf: "center", marginBottom: 34 }} />
                <View className="flex-row flex-wrap gap-3">
                  {Array.from({ length: 8 }).map((_, i) => <SkeletonHobbyCard key={i} />)}
                </View>
              </View>
            ))
          : (hobbyCategories as any[]).map((category, categoryIndex) => (
              <View key={categoryIndex} className="mb-10">
                <Text className="text-[13px] text-center font-bold mb-10" style={{ color: colors.neutral200 }}>{category.category}</Text>
                <View className="flex-row flex-wrap gap-3">
                  {category.hobbies.map((hobby: any) => (
                    <HobbyItem
                      key={hobby.id}
                      hobby={hobby}
                      isSelected={hobbies.includes(hobby.enumName)}
                      onPress={toggleHobby}
                    />
                  ))}
                </View>
              </View>
            ))}

        <View className="h-20" />
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable
          onPress={handleNext}
          style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }}
        >
          <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
            {t('common.continueButton')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
