import { useState, useRef } from "react";
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
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

export default function RegisterStep5Screen({ navigation }) {
  const dispatch = useDispatch();
  const { firstName } = useSelector(
    (state) => state.auth.registrationForm,
  );
  const firstNameInputRef = useRef(null);

  const [error, setError] = useState("");
  const [errorFields, setErrorFields] = useState([]);

  const updateField = (field, value) => {
    dispatch(updateRegistrationField({ field, value }));
    if (errorFields.includes(field)) {
      const newErrorFields = errorFields.filter((f) => f !== field);
      setErrorFields(newErrorFields);
      if (newErrorFields.length === 0) setError("");
    }
  };

  const handleNext = () => {
    Keyboard.dismiss();
    const newErrorFields = [];
    if (!firstName || firstName.trim() === "") newErrorFields.push("firstName");

    if (newErrorFields.length > 0) {
      setErrorFields(newErrorFields);
      setError("Lütfen işaretli tüm alanları doldur.");
      return;
    }

    setError("");
    setErrorFields([]);
    navigation.navigate("RegisterStep6");
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

      <RegisterProgressBar step={5} />

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

          <View className="w-full mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
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
                onChangeText={(v) => updateField("firstName", v)}
              />
            </View>
          </View>

          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
