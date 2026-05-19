import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Check, InfoIcon } from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressableShared from "../components/AnimatedPressable";

// Backend InterestedIn enumName ("Men"/"Women"/"NonBinary") bekliyor.
const OPTIONS = [
  { enumName: "Men", label: "Erkek" },
  { enumName: "Women", label: "Kadın" },
  { enumName: "NonBinary", label: "Non-Binary" },
];

const AnimatedPressable = ({ onPress, style, activeOpacity = 1, children }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RegisterStep10Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  // Eski persisted state'lerde number kalmış olabilir → sadece string'leri al.
  const initial =
    Array.isArray(profile.interestedIn) && profile.interestedIn.length > 0
      ? profile.interestedIn.filter((v) => typeof v === "string")
      : [];
  const [selected, setSelected] = useState(initial);
  const [error, setError] = useState("");

  const toggle = (enumName) => {
    setError("");
    setSelected((prev) =>
      prev.includes(enumName)
        ? prev.filter((v) => v !== enumName)
        : [...prev, enumName],
    );
  };

  const handleNext = () => {
    if (selected.length === 0) {
      setError("En az bir seçenek seçmelisin.");
      return;
    }
    dispatch(updateMultipleFields({ interestedIn: selected }));
    navigation.navigate("RegisterStep11");
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => navigation.goBack()}
            className="flex-row items-center"
          >
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
        </View>
      </View>

      <RegisterProgressBar step={10} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">İlgi Alanın</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Kiminle eşleşmek istersin? Birden fazla seçebilirsin.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {OPTIONS.map((opt) => {
            const active = selected.includes(opt.enumName);
            return (
              <AnimatedPressable
                key={opt.enumName}
                onPress={() => toggle(opt.enumName)}
                style={{
                  borderRadius: 30,
                  borderCurve: "continuous",
                  borderWidth: 0.5,
                  borderColor: active
                    ? "rgba(255,255,255,0.3)"
                    : "rgba(255,255,255,0.1)",
                  backgroundColor: active ? "#3e3e3e" : "#1E1E1E",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  position: "relative",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}
                >
                  {opt.label}
                </Text>
                {active && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      right: 20,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                    }}
                  >
                    <Check size={20} color="#fff" strokeWidth={2.5} />
                  </View>
                )}
              </AnimatedPressable>
            );
          })}
        </View>

        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <InfoIcon size={16} color="#9CA3AF" className="mt-3" />
          <Text className="text-gray-400 text-[12px]">
            Seçimlerini profilinden filtreleyerek detaylandırabilirsin.
          </Text>
        </View>

        {error ? (
          <Text
            style={{
              color: "#ef4444",
              textAlign: "center",
              marginTop: 20,
              fontSize: 14,
            }}
          >
            {error}
          </Text>
        ) : null}
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View
          style={{
            paddingHorizontal: 32,
            paddingBottom: 32,
            paddingTop: 16,
            backgroundColor: "#121212",
          }}
        >
          <AnimatedPressableShared
            onPress={handleNext}
            style={{ borderRadius: 999, overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#fc2726", "#fc1b26"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text
                style={{
                  color: "#fff",
                  paddingVertical: 20,
                  fontWeight: "700",
                  fontSize: 15,
                  textAlign: "center",
                }}
              >
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
