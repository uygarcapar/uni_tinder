import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { ChevronDown } from "lucide-react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SearchableListSheet from "@/shared/components/SearchableListSheet";
import CityPickerModal from "@/features/discover/components/CityPickerModal";
import { useCities, useDistrictsByCity } from "@/shared/queries/commonQueries";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { locationSchema, LocationForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

export default function RegisterStep9Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep9'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [cityVisible, setCityVisible] = useState(false);
  const [districtVisible, setDistrictVisible] = useState(false);
  const districtSnapPoints = useMemo(() => ["75%", "90%"], []);

  const { handleSubmit, setValue, watch } = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      city: typeof profile.city === "string" ? profile.city : "",
      district: typeof profile.district === "string" ? profile.district : "",
    },
  });

  const city = watch("city");
  const district = watch("district");

  const { data: cities = [], isLoading: loadingCities } = useCities();
  const cityMatch = useMemo(
    () => (city ? cities.find((c) => c.enumName === city) : undefined),
    [cities, city],
  );
  const { data: districts = [], isLoading: loadingDistricts } =
    useDistrictsByCity(cityMatch?.id);

  const handleOpenCityModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setCityVisible(true), 100);
  }, []);

  const handleOpenDistrictModal = useCallback(() => {
    if (!city) { alert("Lütfen önce şehir seçin"); return; }
    Keyboard.dismiss();
    setTimeout(() => setDistrictVisible(true), 100);
  }, [city]);

  const getCityLabel = () => {
    if (!city) return "Şehir Seç";
    const selectedCity = (cities as any[]).find((c) => c.enumName === city);
    return selectedCity ? selectedCity.name : "Şehir Seç";
  };

  const getDistrictLabel = () => {
    if (!district) return "İlçe Seç";
    const selectedDistrict = (districts as any[]).find((d) => d.enumName === district);
    return selectedDistrict ? selectedDistrict.name : "İlçe Seç";
  };

  const handleNext = handleSubmit(({ city: c, district: d }) => {
    dispatch(updateMultipleFields({ city: c || null, district: d || null }));
    navigation.navigate("RegisterStep10");
  });

  const handleSkip = () => {
    dispatch(updateMultipleFields({ city: null, district: null }));
    navigation.navigate("RegisterStep10");
  };

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-bg pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.goBack()} className="flex-row items-center">
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
          {!city && !district && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text className="text-gray-400 text-[16px] font-semibold">Atla</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <RegisterProgressBar step={9} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Konum Bilgilerin</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Yaşadığın şehri ve ilçeni seç.
          </Text>
        </View>

        <>
          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">Şehir</Text>
            <TouchableOpacity
              style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
              activeOpacity={1}
              onPress={handleOpenCityModal}
              disabled={loadingCities}
              className=" border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
            >
              {loadingCities ? (
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="small" color={colors.text} /></View>
              ) : (
                <>
                  <Text className={`${city ? "text-white" : "text-gray-400"} text-[16px] font-medium`}>{getCityLabel()}</Text>
                  <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} pointerEvents="none" />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">İlçe</Text>
            <TouchableOpacity
              style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
              activeOpacity={1}
              onPress={handleOpenDistrictModal}
              disabled={!city || loadingDistricts}
              className="  border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
            >
              {loadingDistricts ? (
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="small" color={colors.text} /></View>
              ) : (
                <>
                  <Text className={`${district ? "text-white" : "text-gray-400"} text-[16px] font-medium`}>{getDistrictLabel()}</Text>
                  <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} pointerEvents="none" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      </View>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-bg">
          <AnimatedPressable
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.messageOwn }}
          >
            <Text className="text-white py-[20px] font-bold text-[15px] text-center">
              {!city && !district ? "Atla" : "Devam Et"}
            </Text>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>

      {/* City Picker */}
      {cityVisible && (
        <CityPickerModal
          visible={cityVisible}
          onClose={() => setCityVisible(false)}
          items={cities}
          initialValue={city ?? ""}
          onConfirm={(selectedCity: string) => {
            setCityVisible(false);
            setValue("city", selectedCity, { shouldValidate: true });
            setValue("district", "");
            dispatch(updateMultipleFields({ city: selectedCity, district: null }));
          }}
        />
      )}

      {/* District Picker */}
      {districtVisible && (
        <AppBottomSheet
          visible={districtVisible}
          onClose={() => setDistrictVisible(false)}
          snapPoints={districtSnapPoints}
          backdrop="blur"
          backgroundStyle={{ borderRadius: 44 }}
          handleComponent={null}
          stackBehavior="push"
        >
          <SearchableListSheet
            items={districts}
            initialValue={district ?? ""}
            title="İlçe Seç"
            onConfirm={(selectedDistrict: string) => {
              setDistrictVisible(false);
              setValue("district", selectedDistrict, { shouldValidate: true });
              dispatch(updateMultipleFields({ district: selectedDistrict }));
            }}
            onCancel={() => setDistrictVisible(false)}
          />
        </AppBottomSheet>
      )}
    </View>
  );
}
