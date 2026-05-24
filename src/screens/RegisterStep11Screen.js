import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import MultiSlider from "@ptomasroos/react-native-multi-slider";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";
import { InfoIcon } from "lucide-react-native";

export default function RegisterStep11Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [ageRange, setAgeRange] = useState([
    profile.ageRangeMin ?? 18,
    profile.ageRangeMax ?? 65,
  ]);

  const handleValuesChange = (values) => {
    setAgeRange(values);
  };

  const handleNext = () => {
    if (ageRange[0] >= ageRange[1]) {
      alert("Minimum yaş maksimum yaştan küçük olmalıdır");
      return;
    }

    if (ageRange[1] - ageRange[0] < 5) {
      alert("Yaş aralığı en az 5 yıl olmalıdır");
      return;
    }

    dispatch(
      updateMultipleFields({
        ageRangeMin: ageRange[0],
        ageRangeMax: ageRange[1],
      }),
    );
    navigation.navigate("RegisterStep12");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        ageRangeMin: null,
        ageRangeMax: null,
      }),
    );
    navigation.navigate("RegisterStep12");
  };

  // Check if age range is at default values
  const isDefaultRange = ageRange[0] === 18 && ageRange[1] === 65;

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
          {isDefaultRange && (
            <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
              <Text className="text-gray-400 text-[16px] font-semibold">
                Atla
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <RegisterProgressBar step={11} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Yaş Aralığı</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Görmeyi tercih ettiğin yaş aralığını seç.
          </Text>
        </View>

        {/* Multi Slider */}
        <View className="mb-2 items-center">
          <MultiSlider
            values={ageRange}
            onValuesChange={handleValuesChange}
            min={18}
            max={65}
            step={1}
            sliderLength={320}
            minMarkerOverlapDistance={100}
            selectedStyle={{
              backgroundColor: "#fff",
            }}
            unselectedStyle={{
              backgroundColor: "#374151",
            }}
            markerStyle={{
              backgroundColor: "#fff",
              height: 28,
              width: 28,
              borderRadius: 100,
              borderWidth: 0,
              marginTop: 2,
              shadowColor: "transparent",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0,
              shadowRadius: 0,
              elevation: 0,
            }}
            containerStyle={{
              height: 40,
            }}
            trackStyle={{
              height: 4,
              borderRadius: 3,
            }}
          />
        </View>
        {/* Age Range Display */}
        <View className="flex-row justify-between mb-4">
          <View>
            <Text className="text-white text-2xl font-bold">
              {ageRange[0]} yaş
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-white text-2xl font-bold">
              {ageRange[1] === 65 ? "65+" : ageRange[1]} yaş
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <InfoIcon size={16} color="#9CA3AF" className="mt-3" />
          <Text className="text-gray-400 text-[12px]">
            Seçtiğin yaş aralığına göre eşleşmeler göreceksin. Daha geniş bir
            aralık seçmek, daha fazla eşleşme görmene yardımcı olabilir.
          </Text>
        </View>
      </View>

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
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="py-3.5"
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
