import React, {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { Picker } from "@react-native-picker/picker";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";

const CityPickerContent = ({ initialCity, onConfirm, onCancel, cities }) => {
  const isValidCity =
    initialCity !== null && initialCity !== undefined && initialCity !== "";

  const [localCity, setLocalCity] = useState(
    isValidCity ? String(initialCity) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localCity)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localCity}
        onValueChange={(value) => setLocalCity(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Şehir Seçiniz" value="" color="#9CA3AF" />
        {cities.map((city) => (
          <Picker.Item
            key={city.id}
            label={city.name}
            value={String(city.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

const DistrictPickerContent = ({
  initialDistrict,
  onConfirm,
  onCancel,
  districts,
}) => {
  const isValidDistrict =
    initialDistrict !== null &&
    initialDistrict !== undefined &&
    initialDistrict !== "";

  const [localDistrict, setLocalDistrict] = useState(
    isValidDistrict ? String(initialDistrict) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localDistrict)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localDistrict}
        onValueChange={(value) => setLocalDistrict(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="İlçe Seçiniz" value="" color="#9CA3AF" />
        {districts.map((district) => (
          <Picker.Item
            key={district.id}
            label={district.name}
            value={String(district.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

export default function CompleteProfileStep2Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [city, setCity] = useState(
    profile.city !== undefined && profile.city !== null
      ? String(profile.city)
      : "",
  );
  const [district, setDistrict] = useState(
    profile.district !== undefined && profile.district !== null
      ? String(profile.district)
      : "",
  );

  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  const citySheetRef = useRef(null);
  const districtSheetRef = useRef(null);
  const snapPoints = useMemo(() => ["50%"], []);

  // Fetch cities on mount
  useEffect(() => {
    fetchCities();
  }, []);

  // Fetch districts when city changes
  useEffect(() => {
    if (city) {
      fetchDistricts(city);
    } else {
      setDistricts([]);
      setDistrict("");
    }
  }, [city]);

  const fetchCities = async () => {
    try {
      setLoadingCities(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_CITIES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setCities(data.result);
      } else {
        alert("Şehirler yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching cities:", error);
      alert("Şehirler yüklenirken bir hata oluştu");
    } finally {
      setLoadingCities(false);
    }
  };

  const fetchDistricts = async (cityId) => {
    try {
      setLoadingDistricts(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_DISTRICTS}/${cityId}/districts`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setDistricts(data.result);
      } else {
        alert("İlçeler yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching districts:", error);
      alert("İlçeler yüklenirken bir hata oluştu");
    } finally {
      setLoadingDistricts(false);
    }
  };

  const handleOpenCityModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      citySheetRef.current?.present();
    }, 100);
  }, []);

  const handleOpenDistrictModal = useCallback(() => {
    if (!city) {
      alert("Lütfen önce şehir seçin");
      return;
    }
    Keyboard.dismiss();
    setTimeout(() => {
      districtSheetRef.current?.present();
    }, 100);
  }, [city]);

  const confirmCitySelection = (selectedCity) => {
    setCity(selectedCity);
    // Reset district when city changes
    setDistrict("");
    citySheetRef.current?.dismiss();
  };

  const cancelCitySelection = () => {
    citySheetRef.current?.dismiss();
  };

  const confirmDistrictSelection = (selectedDistrict) => {
    setDistrict(selectedDistrict);
    districtSheetRef.current?.dismiss();
  };

  const cancelDistrictSelection = () => {
    districtSheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        pressBehavior="close"
        style={[props.style, { backgroundColor: "transparent" }]}
      >
        <BlurView
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          intensity={30}
          tint="dark"
        />
      </BottomSheetBackdrop>
    ),
    [],
  );

  const getCityLabel = () => {
    if (!city) return "Şehir Seçiniz";
    const selectedCity = cities.find((c) => String(c.id) === String(city));
    return selectedCity ? selectedCity.name : "Şehir Seçiniz";
  };

  const getDistrictLabel = () => {
    if (!district) return "İlçe Seçiniz";
    const selectedDistrict = districts.find(
      (d) => String(d.id) === String(district),
    );
    return selectedDistrict ? selectedDistrict.name : "İlçe Seçiniz";
  };

  const handleNext = () => {
    const updates = {};

    // Only add filled values to updates
    if (city) {
      updates.city = parseInt(city);
    } else {
      updates.city = null;
    }

    if (district) {
      updates.district = parseInt(district);
    } else {
      updates.district = null;
    }

    dispatch(updateMultipleFields(updates));
    navigation.navigate("CompleteProfileStep3");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        city: null,
        district: null,
      }),
    );
    navigation.navigate("CompleteProfileStep3");
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBack}
            className="flex-row items-center"
          >
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
          {!city && !district && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text className="text-gray-400 text-[16px] font-semibold">
                Atla
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">
            Konum Bilgilerin
          </Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Yaşadığın şehri ve ilçeni seç.
          </Text>
        </View>

        {loadingCities ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <>
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Şehir
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenCityModal}
                className=" border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    city ? "text-white" : "text-gray-400"
                  } text-[18px]`}
                >
                  {getCityLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>

            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                İlçe
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenDistrictModal}
                disabled={!city || loadingDistricts}
                className="  border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                {loadingDistricts ? (
                  <View className="flex-1 items-center justify-center">
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <>
                    <Text
                      className={`${
                        district ? "text-white" : "text-gray-400"
                      } text-[18px]`}
                    >
                      {getDistrictLabel()}
                    </Text>
                    <Text className="text-gray-400 text-xl">▼</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#fc5026", "#fc3826"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                {!city && !district ? "Atla" : "Devam Et"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      {/* City Bottom Sheet */}
      <BottomSheetModal
        ref={citySheetRef}
        index={0}
        backgroundStyle={{
          borderRadius: 32,
          backgroundColor: "#121212",
        }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true}
        handleIndicatorStyle={{ backgroundColor: "#4B5563", width: 50 }}
      >
        <CityPickerContent
          initialCity={city}
          onConfirm={confirmCitySelection}
          onCancel={cancelCitySelection}
          cities={cities}
        />
      </BottomSheetModal>

      {/* District Bottom Sheet */}
      <BottomSheetModal
        ref={districtSheetRef}
        index={0}
        backgroundStyle={{
          borderRadius: 32,
          backgroundColor: "#121212",
        }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true}
        handleIndicatorStyle={{ backgroundColor: "#4B5563", width: 50 }}
      >
        <DistrictPickerContent
          initialDistrict={district}
          onConfirm={confirmDistrictSelection}
          onCancel={cancelDistrictSelection}
          districts={districts}
        />
      </BottomSheetModal>
    </View>
  );
}
