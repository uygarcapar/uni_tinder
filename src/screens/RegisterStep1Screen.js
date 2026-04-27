import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import { Picker } from "@react-native-picker/picker";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";

const GenderPickerContent = ({ initialGender, onConfirm, onCancel }) => {
  const isValidGender =
    initialGender !== null &&
    initialGender !== undefined &&
    initialGender !== "";

  const [localGender, setLocalGender] = useState(
    isValidGender ? String(initialGender) : "0",
  );

  return (
    <BottomSheetView className="flex-1 bg-[#121212] px-4 pb-8">
      <View className="flex-row justify-between items-center py-4 px-4">
        <TouchableOpacity onPress={onCancel}>
          <Text className="text-gray-400 text-xl">İptal</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => onConfirm(localGender)}>
          <Text className="text-white text-xl font-bold">Bitti</Text>
        </TouchableOpacity>
      </View>

      <Picker
        selectedValue={localGender}
        onValueChange={(value) => setLocalGender(value)}
        style={{ height: 200, color: "#FFFFFF" }}
        itemStyle={{ color: "#FFFFFF" }}
      >
        <Picker.Item label="Erkek" value="0" color="#FFFFFF" />
        <Picker.Item label="Kadın" value="1" color="#FFFFFF" />
        <Picker.Item label="Diğer" value="2" color="#FFFFFF" />
      </Picker>
    </BottomSheetView>
  );
};

export default function RegisterStep1Screen({ navigation }) {
  const dispatch = useDispatch();
  const { firstName, lastName, gender } = useSelector(
    (state) => state.auth.registrationForm,
  );

  const bottomSheetModalRef = useRef(null);
  const firstNameInputRef = useRef(null);
  const snapPoints = useMemo(() => ["40%"], []);

  const [modalKey, setModalKey] = useState(0);

  // Hata mesajları ve hatalı alanların tutulduğu stateler
  const [error, setError] = useState("");
  const [errorFields, setErrorFields] = useState([]);

  const updateField = (field, value) => {
    dispatch(updateRegistrationField({ field, value }));

    // Kullanıcı bir şey yazdığında/seçtiğinde o alanın hatasını temizle
    if (errorFields.includes(field)) {
      const newErrorFields = errorFields.filter((f) => f !== field);
      setErrorFields(newErrorFields);
      if (newErrorFields.length === 0) {
        setError(""); // Eğer başka hatalı alan kalmadıysa genel mesajı da sil
      }
    }
  };

  const handlePresentModalPress = useCallback(() => {
    Keyboard.dismiss();
    setModalKey((prev) => prev + 1);
    bottomSheetModalRef.current?.present();
  }, []);

  const confirmGenderSelection = (selectedVal) => {
    updateField("gender", Number(selectedVal));
    bottomSheetModalRef.current?.dismiss();
  };

  const cancelGenderSelection = () => {
    bottomSheetModalRef.current?.dismiss();
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
          bottomSheetModalRef.current?.dismiss();
        }}
        style={[props.style, { backgroundColor: "transparent" }]}
      >
        <BlurView
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          intensity={30}
          tint="dark"
        />
      </BottomSheetBackdrop>
    ),
    [],
  );

  const getGenderLabel = () => {
    if (gender === 0 || String(gender) === "0") return "Erkek";
    if (gender === 1 || String(gender) === "1") return "Kadın";
    if (gender === 2 || String(gender) === "2") return "Diğer";
    return "Seçiniz";
  };

  const isGenderSelected =
    gender !== null && gender !== undefined && gender !== "";

  // Alert yerine lokal stateleri güncelleyerek hata kontrolü
  const handleNext = () => {
    const newErrorFields = [];

    if (!firstName || firstName.trim() === "") newErrorFields.push("firstName");
    if (!lastName || lastName.trim() === "") newErrorFields.push("lastName");
    if (!isGenderSelected) newErrorFields.push("gender");

    if (newErrorFields.length > 0) {
      setErrorFields(newErrorFields);
      setError("Lütfen işaretli tüm alanları doldur.");
      return;
    }

    // Her şey uygunsa hataları temizle ve devam et
    setError("");
    setErrorFields([]);
    navigation.navigate("RegisterStep2");
  };

  return (
    <View className="flex-1 bg-[#121212]">
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">
              Seni tanıyalım.
            </Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Bize biraz kendinden bahset. Seni tanımamıza yardımcı olmak için
              kutucukları doldur.
            </Text>
          </View>

          <View className="flex flex-row w-full gap-2 mb-4">
            <View className="flex-1">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Ad *
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: errorFields.includes("firstName")
                    ? "#ef4444"
                    : "rgba(255,255,255,0.1)",
                }}
              >
                <TextInput
                  ref={firstNameInputRef}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    fontSize: 18,
                    color: "#fff",
                  }}
                  placeholder="Adın"
                  placeholderTextColor="#9CA3AF"
                  value={firstName}
                  onChangeText={(value) => updateField("firstName", value)}
                />
              </View>
            </View>

            <View className="flex-1">
              <Text className="text-gray-300 text-lg font-semibold mb-2">
                Soyad *
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: errorFields.includes("lastName")
                    ? "#ef4444"
                    : "rgba(255,255,255,0.1)",
                }}
              >
                <TextInput
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                    fontSize: 18,
                    color: "#fff",
                  }}
                  placeholder="Soyadın"
                  placeholderTextColor="#9CA3AF"
                  value={lastName}
                  onChangeText={(value) => updateField("lastName", value)}
                />
              </View>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-lg font-semibold mb-2">
              Cinsiyet *
            </Text>
            <TouchableOpacity
              activeOpacity={1}
              onPress={handlePresentModalPress}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: errorFields.includes("gender")
                  ? "#ef4444"
                  : "rgba(255,255,255,0.1)",
                paddingHorizontal: 16,
                paddingVertical: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: isGenderSelected ? "#fff" : "#9CA3AF",
                  fontSize: 18,
                }}
              >
                {getGenderLabel()}
              </Text>
              <Text className="text-gray-300 text-xl">▼</Text>
            </TouchableOpacity>
          </View>

          {/* Hata Mesajı Bölümü */}
          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4 ">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
          >
            <LinearGradient
              colors={["#fc5a26", "#fc4526"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className=""
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        backgroundStyle={{ borderRadius: 32, backgroundColor: "#121212" }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true}
        handleIndicatorStyle={{ backgroundColor: "#E5E7EB", width: 50 }}
      >
        <GenderPickerContent
          key={modalKey}
          initialGender={gender}
          onConfirm={confirmGenderSelection}
          onCancel={cancelGenderSelection}
        />
      </BottomSheetModal>
    </View>
  );
}
