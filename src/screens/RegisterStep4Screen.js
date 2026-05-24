import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

const PHONE_LENGTH = 10;

export default function RegisterStep4Screen({ navigation }) {
  const dispatch = useDispatch();

  const storedPhoneNumber = useSelector(
    (state) => state.auth.registrationForm.phoneNumber,
  );

  // Redux'tan local 10 haneye düşür ("+90 " prefix'i ve format temizliği).
  const rawAll = (storedPhoneNumber || "").replace(/\D/g, "");
  const localDigits = rawAll.startsWith("90") ? rawAll.slice(2) : rawAll;

  const [error, setError] = useState("");
  const [hasError, setHasError] = useState(false);

  const handleChange = (text) => {
    const clean = text.replace(/\D/g, "").slice(0, PHONE_LENGTH);
    const fullNumber = clean ? `+90 ${clean}` : "";
    dispatch(
      updateRegistrationField({ field: "phoneNumber", value: fullNumber }),
    );
    if (hasError) {
      setHasError(false);
      setError("");
    }
  };

  const handleNext = () => {
    Keyboard.dismiss();
    if (localDigits.length < PHONE_LENGTH) {
      setHasError(true);
      setError("Lütfen geçerli bir telefon numarası gir.");
      return;
    }
    setError("");
    setHasError(false);
    navigation.navigate("RegisterStep5");
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={4} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">İletişim.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Telefon numaran, hesabını güvende tutmana yardımcı olur. Numaranı
              kimse göremez.
            </Text>
          </View>

          {/* Telefon Input Alanı */}
          <Text className="text-gray-300 text-[14px] font-semibold mb-2">
            Telefon Numarası *
          </Text>

          <View
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
              borderWidth: 0.5,
              borderColor: hasError ? "#ef4444" : "rgba(255,255,255,0.1)",
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
            }}
          >
            <Text
              style={{
                color: "#dee0ea",
                fontSize: 18,
                fontWeight: "500",
                marginRight: 10,
              }}
            >
              TR +90
            </Text>
            <TextInput
              style={{
                flex: 1,
                paddingVertical: 16,
                fontSize: 18,
                color: "#fff",
              }}
              keyboardType="number-pad"
              value={localDigits}
              onChangeText={handleChange}
              maxLength={PHONE_LENGTH}
            />
          </View>

          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4 ">
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
              className=""
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
