import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Check, InfoIcon, ChevronUp, ChevronDown } from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";

const GENDER_CATEGORIES = [
  {
    id: 0,
    categoryName: "Erkek",
    subGenders: [
      { id: 0, name: "Erkek" },
      { id: 5, name: "Transgender" },
      { id: 6, name: "Trans Erkek" },
    ],
  },
  {
    id: 1,
    categoryName: "Kadın",
    subGenders: [
      { id: 1, name: "Kadın" },
      { id: 5, name: "Transgender" },
      { id: 7, name: "Trans Kadın" },
    ],
  },
  {
    id: 2,
    categoryName: "Non-Binary",
    subGenders: [
      { id: 2, name: "Non-Binary" },
      { id: 8, name: "Genderfluid" },
      { id: 9, name: "Genderqueer" },
      { id: 10, name: "Agender" },
      { id: 11, name: "Bigender" },
      { id: 12, name: "İnterseks" },
      { id: 13, name: "Two-Spirit" },
      { id: 14, name: "Pangender" },
    ],
  },
];

const getInitialCategory = (genderId) => {
  if (genderId === null || genderId === undefined || genderId === "")
    return null;
  for (const cat of GENDER_CATEGORIES) {
    if (cat.subGenders.some((sg) => sg.id === genderId)) return cat.id;
  }
  return null;
};

export default function RegisterStep4Screen({ navigation }) {
  const dispatch = useDispatch();
  const { gender } = useSelector((state) => state.auth.registrationForm);

  const initialGender =
    gender !== "" && gender !== null && gender !== undefined ? gender : null;

  const [selectedGender, setSelectedGender] = useState(initialGender);
  // Explicit category state — avoids shared-ID ambiguity (e.g. Transgender id:5 in both Erkek/Kadın)
  const [selectedCatId, setSelectedCatId] = useState(() =>
    getInitialCategory(initialGender),
  );
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [error, setError] = useState("");
  // Per-category measurements: pill height, text width, sub-list height
  const [measurements, setMeasurements] = useState({});

  const handleSelectCategory = (category) => {
    if (selectedCatId === category.id) {
      toggleSubcategories(category.id);
      return;
    }
    setSelectedGender(category.id);
    setSelectedCatId(category.id);
    setExpandedCategory(null);
    setError("");
  };

  const handleSelectSubGender = (subGenderId) => {
    setSelectedGender(subGenderId);
    // selectedCatId intentionally unchanged
    setExpandedCategory(null);
    setError("");
  };

  const toggleSubcategories = (categoryId) => {
    setExpandedCategory((prev) => (prev === categoryId ? null : categoryId));
  };

  const handleNext = () => {
    if (selectedGender === null || selectedGender === undefined) {
      setError("Lütfen bir seçenek seç.");
      return;
    }
    dispatch(
      updateRegistrationField({ field: "gender", value: selectedGender }),
    );
    navigation.navigate("RegisterStep8");
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

      <RegisterProgressBar step={7} />

      <ScrollView
        className="flex-1 px-6 py-6 pt-0"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Cinsiyetin</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            Kendini en iyi tanımlayan seçeneği seç.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {GENDER_CATEGORIES.map((category) => {
            const isSelected = selectedCatId === category.id;
            const isExpanded = expandedCategory === category.id;
            const m = measurements[category.id] ?? {};

            const selectedSubName =
              isSelected && selectedGender !== category.id
                ? category.subGenders.find((sg) => sg.id === selectedGender)
                    ?.name
                : null;

            const subListHeight = m.subListHeight ?? 0;

            return (
              <View
                key={category.id}
                style={{
                  paddingBottom:
                    isSelected && isExpanded ? subListHeight + 8 : 0,
                }}
              >
                {/* Wrapper is position:relative — badge, check, and sub-list anchor here */}
                <View style={{ position: "relative" }}>
                  <TouchableOpacity
                    onPress={() => handleSelectCategory(category)}
                    activeOpacity={0.8}
                    onLayout={(e) => {
                      const { height } = e.nativeEvent.layout;
                      setMeasurements((prev) => ({
                        ...prev,
                        [category.id]: {
                          ...prev[category.id],
                          pillHeight: height,
                        },
                      }));
                    }}
                    style={{
                      borderRadius: 30,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      borderWidth: 0.5,
                      borderColor: isSelected
                        ? "rgba(255,255,255,0.3)"
                        : "rgba(255,255,255,0.1)",
                      backgroundColor: isSelected ? "#3e3e3e" : "#1E1E1E",
                      paddingHorizontal: 20,
                      paddingVertical: 18,
                    }}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 17,
                        fontWeight: "600",
                      }}
                    >
                      {isSelected && selectedSubName
                        ? selectedSubName
                        : category.categoryName}
                    </Text>
                    {isSelected && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: "#9CA3AF",
                            fontSize: 12,
                            fontWeight: "500",
                          }}
                        >
                          Detaylı Seç
                        </Text>
                        {isExpanded ? (
                          <ChevronUp
                            size={14}
                            color="#9CA3AF"
                            strokeWidth={2.5}
                          />
                        ) : (
                          <ChevronDown
                            size={14}
                            color="#9CA3AF"
                            strokeWidth={2.5}
                          />
                        )}
                      </View>
                    )}
                  </TouchableOpacity>

                  {isSelected && m.pillHeight != null && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        right: 20,
                        top: 0,
                        height: m.pillHeight,
                        justifyContent: "center",
                      }}
                    >
                      <Check size={20} color="#fff" strokeWidth={2.5} />
                    </View>
                  )}
                </View>

                {isSelected && isExpanded && (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {category.subGenders.map((subGender) => {
                      const isSubSelected = selectedGender === subGender.id;
                      return (
                        <TouchableOpacity
                          key={`${category.id}-${subGender.id}`}
                          onPress={() => handleSelectSubGender(subGender.id)}
                          activeOpacity={0.8}
                          style={{
                            borderRadius: 999,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            borderWidth: 0.5,
                            borderColor: isSubSelected
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(255,255,255,0.1)",
                            backgroundColor: isSubSelected
                              ? "#3e3e3e"
                              : "transparent",
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: 15,
                              fontWeight: "500",
                            }}
                          >
                            {subGender.name}
                          </Text>
                          {isSubSelected && (
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
                              <Check size={18} color="#fff" strokeWidth={2.5} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
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
        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <InfoIcon size={16} color="#9CA3AF" className="mt-3" />
          <Text className="text-gray-400 text-[12px]">
            Detaylı cinsiyet seçenekleri, seni en iyi tanımlayan kimliği seçmene
            yardımcı olur.
          </Text>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
          >
            <LinearGradient
              colors={["#fc3826", "#fc2926"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
