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
  Alert,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { Picker } from "@react-native-picker/picker";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { logout } from "../store/slices/authSlice";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";

const YearOfStudyPickerContent = ({ initialYear, onConfirm, onCancel }) => {
  const isValidYear =
    initialYear !== null && initialYear !== undefined && initialYear !== "";

  const [localYear, setLocalYear] = useState(
    isValidYear ? String(initialYear) : "0",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onConfirm(localYear)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>

      <Picker
        selectedValue={localYear}
        onValueChange={(value) => setLocalYear(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Hazırlık" value="0" color="#FFFFFF" />
        <Picker.Item label="1. Sınıf" value="1" color="#FFFFFF" />
        <Picker.Item label="2. Sınıf" value="2" color="#FFFFFF" />
        <Picker.Item label="3. Sınıf" value="3" color="#FFFFFF" />
        <Picker.Item label="4. Sınıf" value="4" color="#FFFFFF" />
        <Picker.Item label="5. Sınıf" value="5" color="#FFFFFF" />
        <Picker.Item label="6. Sınıf" value="6" color="#FFFFFF" />
      </Picker>
    </BottomSheetView>
  );
};

const DepartmentPickerContent = ({
  initialDepartment,
  onConfirm,
  onCancel,
  departments,
}) => {
  const isValidDepartment =
    initialDepartment !== null &&
    initialDepartment !== undefined &&
    initialDepartment !== "";

  const [localDepartment, setLocalDepartment] = useState(
    isValidDepartment ? String(initialDepartment) : "",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onConfirm(localDepartment)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>
      <Picker
        selectedValue={localDepartment}
        onValueChange={(value) => setLocalDepartment(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Bölüm Seçiniz" value="" color="#9CA3AF" />
        {departments.map((dept) => (
          <Picker.Item
            key={dept.id}
            label={dept.name}
            value={String(dept.id)}
            color="#FFFFFF"
          />
        ))}
      </Picker>
    </BottomSheetView>
  );
};

export default function CompleteProfileStep1Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [yearOfStudy, setYearOfStudy] = useState(
    profile.yearOfStudy !== undefined && profile.yearOfStudy !== null
      ? String(profile.yearOfStudy)
      : "",
  );
  const [department, setDepartment] = useState(
    profile.department !== undefined && profile.department !== null
      ? String(profile.department)
      : "",
  );

  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);

  const yearOfStudySheetRef = useRef(null);
  const departmentSheetRef = useRef(null);
  const snapPoints = useMemo(() => ["45%"], []);

  const [modalKey, setModalKey] = useState(0);

  // Fetch departments on mount
  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoadingDepartments(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_DEPARTMENTS}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setDepartments(data.result);
      } else {
        alert("Bölümler yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
      alert("Bölümler yüklenirken bir hata oluştu");
    } finally {
      setLoadingDepartments(false);
    }
  };

  const handleOpenYearOfStudyModal = useCallback(() => {
    Keyboard.dismiss();
    setModalKey((prev) => prev + 1);
    yearOfStudySheetRef.current?.present();
  }, []);

  const handleOpenDepartmentModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      departmentSheetRef.current?.present();
    }, 100);
  }, []);

  const confirmYearOfStudySelection = (selectedVal) => {
    setYearOfStudy(selectedVal);
    yearOfStudySheetRef.current?.dismiss();
  };

  const cancelYearOfStudySelection = () => {
    yearOfStudySheetRef.current?.dismiss();
  };

  const confirmDepartmentSelection = (selectedDepartment) => {
    setDepartment(selectedDepartment);
    departmentSheetRef.current?.dismiss();
  };

  const cancelDepartmentSelection = () => {
    departmentSheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1}
        pressBehavior="close"
        onPress={() => {
          Keyboard.dismiss();
          yearOfStudySheetRef.current?.dismiss();
        }}
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

  const getYearOfStudyLabel = () => {
    if (yearOfStudy === "0") return "Hazırlık";
    if (yearOfStudy === "1") return "1. Sınıf";
    if (yearOfStudy === "2") return "2. Sınıf";
    if (yearOfStudy === "3") return "3. Sınıf";
    if (yearOfStudy === "4") return "4. Sınıf";
    if (yearOfStudy === "5") return "5. Sınıf";
    if (yearOfStudy === "6") return "6. Sınıf";
    return "Seçiniz";
  };

  const getDepartmentLabel = () => {
    if (!department) return "Bölüm Seçiniz";
    const selectedDepartment = departments.find(
      (d) => String(d.id) === String(department),
    );
    return selectedDepartment ? selectedDepartment.name : "Bölüm Seçiniz";
  };

  const isYearOfStudySelected = yearOfStudy !== "";

  const handleNext = () => {
    if (yearOfStudy === "" || !department) {
      alert("Lütfen sınıf ve bölüm alanlarını doldurun");
      return;
    }

    const updatedFields = {
      yearOfStudy: parseInt(yearOfStudy),
      department: parseInt(department),
    };

    console.log("📤 Step1: Before dispatch - updatedFields:", updatedFields);
    console.log("📤 Step1: Before dispatch - current profile state:", profile);

    dispatch(updateMultipleFields(updatedFields));

    console.log("📤 Step1: After dispatch - called updateMultipleFields");

    navigation.navigate("CompleteProfileStep2");
  };

  const handleBack = () => {
    Alert.alert(
      "Çıkış Yap",
      "Profil tamamlamadan çıkmak istediğinize emin misiniz?",
      [
        {
          text: "İptal",
          style: "cancel",
        },
        {
          text: "Çıkış Yap",
          style: "destructive",
          onPress: () => dispatch(logout()),
        },
      ],
    );
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleBack}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">
              Eğitim Bilgilerin
            </Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Sınıfını ve bölümünü seç.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-lg font-semibold mb-2">
              Sınıf *
            </Text>
            <TouchableOpacity
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              activeOpacity={1}
              onPress={handleOpenYearOfStudyModal}
              className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
            >
              <Text
                className={`${
                  isYearOfStudySelected ? "text-white" : "text-gray-400"
                } text-[18px]`}
              >
                {getYearOfStudyLabel()}
              </Text>
              <Text className="text-gray-300 text-xl">▼</Text>
            </TouchableOpacity>
          </View>

          {loadingDepartments ? (
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Bölüm *
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                className="border-[0.5px] border-white/10 px-4 py-5 flex items-center"
              >
                <ActivityIndicator size="small" color="#fff" />
              </View>
            </View>
          ) : (
            <View className="mb-4">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Bölüm *
              </Text>
              <TouchableOpacity
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                }}
                activeOpacity={1}
                onPress={handleOpenDepartmentModal}
                className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    department ? "text-white" : "text-gray-400"
                  } text-[18px]`}
                >
                  {getDepartmentLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className=""
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#fc5a26", "#fc4526"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      {/* Year of Study Bottom Sheet */}
      <BottomSheetModal
        ref={yearOfStudySheetRef}
        index={0}
        backgroundStyle={{
          borderRadius: 32,
          backgroundColor: "#121212",
        }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true}
        handleIndicatorStyle={{ backgroundColor: "#E5E7EB", width: 50 }}
      >
        <YearOfStudyPickerContent
          key={modalKey}
          initialYear={yearOfStudy}
          onConfirm={confirmYearOfStudySelection}
          onCancel={cancelYearOfStudySelection}
        />
      </BottomSheetModal>

      {/* Department Bottom Sheet */}
      <BottomSheetModal
        ref={departmentSheetRef}
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
        <DepartmentPickerContent
          initialDepartment={department}
          onConfirm={confirmDepartmentSelection}
          onCancel={cancelDepartmentSelection}
          departments={departments}
        />
      </BottomSheetModal>
    </View>
  );
}
