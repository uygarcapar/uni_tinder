import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { Picker } from "@react-native-picker/picker";
import { BlurView } from "expo-blur";

// Picker Content Components
const SmokingStatusPickerContent = ({
  initialValue,
  onConfirm,
  onCancel,
  smokingStatuses,
}) => {
  const isValid =
    initialValue !== null && initialValue !== undefined && initialValue !== "";

  const [localValue, setLocalValue] = useState(
    isValid ? String(initialValue) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localValue)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localValue}
        onValueChange={(value) => setLocalValue(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Seçiniz" value="" color="#9CA3AF" />
        {smokingStatuses.map((status) => (
          <Picker.Item
            key={status.id}
            label={status.name}
            value={String(status.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

const ZodiacPickerContent = ({
  initialValue,
  onConfirm,
  onCancel,
  zodiacs,
}) => {
  const isValid =
    initialValue !== null && initialValue !== undefined && initialValue !== "";

  const [localValue, setLocalValue] = useState(
    isValid ? String(initialValue) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localValue)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localValue}
        onValueChange={(value) => setLocalValue(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Seçiniz" value="" color="#9CA3AF" />
        {zodiacs.map((zodiac) => (
          <Picker.Item
            key={zodiac.id}
            label={zodiac.name}
            value={String(zodiac.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

const UsagePurposePickerContent = ({
  initialValue,
  onConfirm,
  onCancel,
  usagePurposes,
}) => {
  const isValid =
    initialValue !== null && initialValue !== undefined && initialValue !== "";

  const [localValue, setLocalValue] = useState(
    isValid ? String(initialValue) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localValue)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localValue}
        onValueChange={(value) => setLocalValue(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Seçiniz" value="" color="#9CA3AF" />
        {usagePurposes.map((purpose) => (
          <Picker.Item
            key={purpose.id}
            label={purpose.name}
            value={String(purpose.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

export default function CompleteProfileStep8Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [smokingStatus, setSmokingStatus] = useState(
    profile.smokingStatus !== undefined && profile.smokingStatus !== null
      ? String(profile.smokingStatus)
      : "",
  );
  const [zodiacSign, setZodiacSign] = useState(
    profile.zodiacSign !== undefined && profile.zodiacSign !== null
      ? String(profile.zodiacSign)
      : "",
  );
  const [usagePurpose, setUsagePurpose] = useState(
    profile.usagePurpose !== undefined && profile.usagePurpose !== null
      ? String(profile.usagePurpose)
      : "",
  );

  const [smokingStatuses, setSmokingStatuses] = useState([]);
  const [zodiacs, setZodiacs] = useState([]);
  const [usagePurposes, setUsagePurposes] = useState([]);

  const [loadingSmokingStatuses, setLoadingSmokingStatuses] = useState(false);
  const [loadingZodiacs, setLoadingZodiacs] = useState(false);
  const [loadingUsagePurposes, setLoadingUsagePurposes] = useState(false);

  const smokingStatusSheetRef = useRef(null);
  const zodiacSheetRef = useRef(null);
  const usagePurposeSheetRef = useRef(null);

  const snapPoints = useMemo(() => ["45%"], []);

  // Fetch all data on mount
  useEffect(() => {
    fetchSmokingStatuses();
    fetchZodiacs();
    fetchUsagePurposes();
  }, []);

  const fetchSmokingStatuses = async () => {
    try {
      setLoadingSmokingStatuses(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_SMOKING_STATUSES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setSmokingStatuses(data.result);
      } else {
        alert("Sigara durumları yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching smoking statuses:", error);
      alert("Sigara durumları yüklenirken bir hata oluştu");
    } finally {
      setLoadingSmokingStatuses(false);
    }
  };

  const fetchZodiacs = async () => {
    try {
      setLoadingZodiacs(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_ZODIACS}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setZodiacs(data.result);
      } else {
        alert("Burçlar yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching zodiacs:", error);
      alert("Burçlar yüklenirken bir hata oluştu");
    } finally {
      setLoadingZodiacs(false);
    }
  };

  const fetchUsagePurposes = async () => {
    try {
      setLoadingUsagePurposes(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_USAGE_PURPOSES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setUsagePurposes(data.result);
      } else {
        alert("Kullanım amaçları yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching usage purposes:", error);
      alert("Kullanım amaçları yüklenirken bir hata oluştu");
    } finally {
      setLoadingUsagePurposes(false);
    }
  };

  const handleOpenSmokingStatusModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      smokingStatusSheetRef.current?.present();
    }, 100);
  }, []);

  const handleOpenZodiacModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      zodiacSheetRef.current?.present();
    }, 100);
  }, []);

  const handleOpenUsagePurposeModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      usagePurposeSheetRef.current?.present();
    }, 100);
  }, []);

  const confirmSmokingStatusSelection = (value) => {
    setSmokingStatus(value);
    smokingStatusSheetRef.current?.dismiss();
  };

  const cancelSmokingStatusSelection = () => {
    smokingStatusSheetRef.current?.dismiss();
  };

  const confirmZodiacSelection = (value) => {
    setZodiacSign(value);
    zodiacSheetRef.current?.dismiss();
  };

  const cancelZodiacSelection = () => {
    zodiacSheetRef.current?.dismiss();
  };

  const confirmUsagePurposeSelection = (value) => {
    setUsagePurpose(value);
    usagePurposeSheetRef.current?.dismiss();
  };

  const cancelUsagePurposeSelection = () => {
    usagePurposeSheetRef.current?.dismiss();
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

  const getSmokingStatusLabel = () => {
    if (!smokingStatus) return "Seçiniz";
    const selected = smokingStatuses.find(
      (s) => String(s.id) === String(smokingStatus),
    );
    return selected ? selected.name : "Seçiniz";
  };

  const getZodiacLabel = () => {
    if (!zodiacSign) return "Seçiniz";
    const selected = zodiacs.find((z) => String(z.id) === String(zodiacSign));
    return selected ? selected.name : "Seçiniz";
  };

  const getUsagePurposeLabel = () => {
    if (!usagePurpose) return "Seçiniz";
    const selected = usagePurposes.find(
      (p) => String(p.id) === String(usagePurpose),
    );
    return selected ? selected.name : "Seçiniz";
  };

  const handleNext = () => {
    // These fields are optional, so we can proceed without validation
    const updatedFields = {};

    if (smokingStatus) {
      updatedFields.smokingStatus = parseInt(smokingStatus);
    } else {
      updatedFields.smokingStatus = null;
    }

    if (zodiacSign) {
      updatedFields.zodiacSign = parseInt(zodiacSign);
    } else {
      updatedFields.zodiacSign = null;
    }

    if (usagePurpose) {
      updatedFields.usagePurpose = parseInt(usagePurpose);
    } else {
      updatedFields.usagePurpose = null;
    }

    dispatch(updateMultipleFields(updatedFields));
    navigation.navigate("CompleteProfileStep8");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        smokingStatus: null,
        zodiacSign: null,
        usagePurpose: null,
      }),
    );
    navigation.navigate("CompleteProfileStep8");
  };

  // Check if all fields are not selected
  const allFieldsEmpty = !smokingStatus && !zodiacSign && !usagePurpose;

  const isLoading =
    loadingSmokingStatuses || loadingZodiacs || loadingUsagePurposes;

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
          {allFieldsEmpty && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text className="text-gray-400 text-[16px] font-semibold">
                Atla
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Yaşam Tarzın</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            İsteğe bağlı bilgiler. Profil eşleşmelerini iyileştirir.
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <>
            {/* Smoking Status */}
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Sigara Kullanımı
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenSmokingStatusModal}
                className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    smokingStatus ? "text-white" : "text-gray-400"
                  } text-[18px]`}
                >
                  {getSmokingStatusLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>

            {/* Zodiac Sign */}
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Burç
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenZodiacModal}
                className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    zodiacSign ? "text-white" : "text-gray-400"
                  } text-[18px]`}
                >
                  {getZodiacLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>

            {/* Usage Purpose */}
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Kullanım Amacı
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenUsagePurposeModal}
                className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    usagePurpose ? "text-white" : "text-gray-400"
                  } text-[18px]`}
                >
                  {getUsagePurposeLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Sticky Button */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
            activeOpacity={1}
            onPress={handleNext}
            className=""
          >
            <LinearGradient
              colors={["#fc1926", "#fc0626"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                {allFieldsEmpty ? "Atla" : "Devam Et"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      {/* Smoking Status Bottom Sheet */}
      <BottomSheetModal
        ref={smokingStatusSheetRef}
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
        <SmokingStatusPickerContent
          initialValue={smokingStatus}
          onConfirm={confirmSmokingStatusSelection}
          onCancel={cancelSmokingStatusSelection}
          smokingStatuses={smokingStatuses}
        />
      </BottomSheetModal>

      {/* Zodiac Bottom Sheet */}
      <BottomSheetModal
        ref={zodiacSheetRef}
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
        <ZodiacPickerContent
          initialValue={zodiacSign}
          onConfirm={confirmZodiacSelection}
          onCancel={cancelZodiacSelection}
          zodiacs={zodiacs}
        />
      </BottomSheetModal>

      {/* Usage Purpose Bottom Sheet */}
      <BottomSheetModal
        ref={usagePurposeSheetRef}
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
        <UsagePurposePickerContent
          initialValue={usagePurpose}
          onConfirm={confirmUsagePurposeSelection}
          onCancel={cancelUsagePurposeSelection}
          usagePurposes={usagePurposes}
        />
      </BottomSheetModal>
    </View>
  );
}
