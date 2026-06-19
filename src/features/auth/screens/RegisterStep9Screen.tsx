import { useState, useMemo, useCallback, useEffect } from "react";
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
import { BottomSheetBackdrop } from "@gorhom/bottom-sheet";
import { ChevronDown } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SearchableListSheet from "@/shared/components/SearchableListSheet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { locationSchema, LocationForm } from "@/shared/schemas/formSchemas";

export default function RegisterStep9Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep9'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [cityVisible, setCityVisible] = useState(false);
  const [districtVisible, setDistrictVisible] = useState(false);
  const snapPoints = useMemo(() => ["75%"], []);

  const { handleSubmit, setValue, watch } = useForm<LocationForm>({
    resolver: zodResolver(locationSchema),
    defaultValues: {
      city: typeof profile.city === "string" ? profile.city : "",
      district: typeof profile.district === "string" ? profile.district : "",
    },
  });

  const city = watch("city");
  const district = watch("district");

  useEffect(() => { fetchCities(); }, []);

  useEffect(() => {
    if (!city || cities.length === 0) { setDistricts([]); return; }
    const match = (cities as any[]).find((c) => c.enumName === city);
    if (match) fetchDistricts(match.id);
  }, [city, cities]);

  const fetchCities = async () => {
    try {
      setLoadingCities(true);
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_CITIES}`);
      const data = await response.json();
      if (data.isSuccess && data.result) setCities(data.result);
      else alert("Şehirler yüklenirken bir hata oluştu");
    } catch (error) {
      console.error("Error fetching cities:", error);
      alert("Şehirler yüklenirken bir hata oluştu");
    } finally {
      setLoadingCities(false);
    }
  };

  const fetchDistricts = async (cityId: any) => {
    try {
      setLoadingDistricts(true);
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_DISTRICTS}/${cityId}/districts`);
      const data = await response.json();
      if (data.isSuccess && data.result) setDistricts(data.result);
      else alert("İlçeler yüklenirken bir hata oluştu");
    } catch (error) {
      console.error("Error fetching districts:", error);
      alert("İlçeler yüklenirken bir hata oluştu");
    } finally {
      setLoadingDistricts(false);
    }
  };

  const handleOpenCityModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setCityVisible(true), 100);
  }, []);

  const handleOpenDistrictModal = useCallback(() => {
    if (!city) { alert("Lütfen önce şehir seçin"); return; }
    Keyboard.dismiss();
    setTimeout(() => setDistrictVisible(true), 100);
  }, [city]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={1} pressBehavior="close" style={[props.style, { backgroundColor: "transparent" }]}>
        <BlurView style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} intensity={30} tint="dark" />
      </BottomSheetBackdrop>
    ),
    [],
  );

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
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
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
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="small" color="#fff" /></View>
              ) : (
                <>
                  <Text className={`${city ? "text-white" : "text-gray-400"} text-[16px] font-medium`}>{getCityLabel()}</Text>
                  <ChevronDown size={20} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
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
                <View className="flex-1 items-center justify-center"><ActivityIndicator size="small" color="#fff" /></View>
              ) : (
                <>
                  <Text className={`${district ? "text-white" : "text-gray-400"} text-[16px] font-medium`}>{getDistrictLabel()}</Text>
                  <ChevronDown size={20} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      </View>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <AnimatedPressable
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="py-3.5"
            >
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                {!city && !district ? "Atla" : "Devam Et"}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>

      {/* City Bottom Sheet */}
      <AppBottomSheet
        visible={cityVisible}
        onClose={() => setCityVisible(false)}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ borderRadius: 44 }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <SearchableListSheet
          initialValue={city}
          onConfirm={(selectedCity: string) => { setValue("city", selectedCity, { shouldValidate: true }); setValue("district", ""); setCityVisible(false); }}
          onCancel={() => setCityVisible(false)}
          items={cities}
        />
      </AppBottomSheet>

      {/* District Bottom Sheet */}
      <AppBottomSheet
        visible={districtVisible}
        onClose={() => setDistrictVisible(false)}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ borderRadius: 44 }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <SearchableListSheet
          initialValue={district}
          onConfirm={(selectedDistrict: string) => { setValue("district", selectedDistrict, { shouldValidate: true }); setDistrictVisible(false); }}
          onCancel={() => setDistrictVisible(false)}
          items={districts}
        />
      </AppBottomSheet>
    </View>
  );
}
