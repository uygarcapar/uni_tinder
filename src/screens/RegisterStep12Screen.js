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
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

export default function RegisterStep12Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [height, setHeight] = useState(profile.height?.toString() || "");

  // Error handling states
  const [error, setError] = useState("");
  const [errorFields, setErrorFields] = useState([]);

  const updateHeight = (value) => {
    setHeight(value);
    // Clear error when user types
    if (errorFields.includes("height")) {
      const newErrorFields = errorFields.filter((f) => f !== "height");
      setErrorFields(newErrorFields);
      if (newErrorFields.length === 0) {
        setError("");
      }
    }
  };

  const handleNext = () => {
    Keyboard.dismiss();
    const newErrorFields = [];

    // Height is required
    if (!height || height.trim() === "") {
      newErrorFields.push("height");
    } else {
      const heightNum = parseInt(height);
      if (isNaN(heightNum) || heightNum < 140 || heightNum > 220) {
        newErrorFields.push("height");
        setError("Boy 140-220 cm arasında olmalıdır");
        setErrorFields(newErrorFields);
        return;
      }
    }

    if (newErrorFields.length > 0) {
      setErrorFields(newErrorFields);
      setError("Lütfen boy alanını doldur.");
      return;
    }

    // Clear errors and proceed
    setError("");
    setErrorFields([]);

    dispatch(
      updateMultipleFields({
        height: parseInt(height),
        bio: "",
      }),
    );
    navigation.navigate("RegisterStep13");
  };

  const handleBack = () => {
    navigation.goBack();
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

      <RegisterProgressBar step={12} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Hakkında</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Boyunu gir. Sadece sana uygun eşleşmeler bulmamıza yardımcı
              olacak.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
              Boy (cm) *
            </Text>
            <TextInput
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className={`border-[0.5px] border-white/10 px-4 py-5 text-[18px] text-white ${
                errorFields.includes("height")
                  ? "border-red-500"
                  : "border-gray-300"
              }`}
              placeholder="170"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              value={height}
              onChangeText={updateHeight}
            />
          </View>
          {/* Error Message */}
          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#fc1b26", "#fc1126"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
