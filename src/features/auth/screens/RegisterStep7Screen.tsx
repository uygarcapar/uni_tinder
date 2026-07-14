import { useState, useRef } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Check, InfoIcon, ChevronUp, ChevronDown } from "lucide-react-native";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { genderSchema, GenderForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

// Backend Gender'ı enumName ("Male"/"Female"/"NonBinary" vb.) bekliyor.
const GENDER_CATEGORIES = [
  {
    id: 0,
    categoryName: "Erkek",
    subGenders: [
      { id: 0, name: "Erkek", enumName: "Male" },
      { id: 5, name: "Transgender", enumName: "Transgender" },
      { id: 6, name: "Trans Erkek", enumName: "TransMale" },
    ],
  },
  {
    id: 1,
    categoryName: "Kadın",
    subGenders: [
      { id: 1, name: "Kadın", enumName: "Female" },
      { id: 5, name: "Transgender", enumName: "Transgender" },
      { id: 7, name: "Trans Kadın", enumName: "TransFemale" },
    ],
  },
  {
    id: 2,
    categoryName: "Non-Binary",
    subGenders: [
      { id: 2, name: "Non-Binary", enumName: "NonBinary" },
      { id: 8, name: "Genderfluid", enumName: "Genderfluid" },
      { id: 9, name: "Genderqueer", enumName: "Genderqueer" },
      { id: 10, name: "Agender", enumName: "Agender" },
      { id: 11, name: "Bigender", enumName: "Bigender" },
      { id: 12, name: "İnterseks", enumName: "Intersex" },
      { id: 13, name: "Two-Spirit", enumName: "TwoSpirit" },
      { id: 14, name: "Pangender", enumName: "Pangender" },
    ],
  },
];

const getInitialCategory = (gender: any) => {
  if (gender === null || gender === undefined || gender === "") return null;
  for (const cat of GENDER_CATEGORIES) {
    if (cat.subGenders.some((sg) => sg.id === gender || sg.enumName === gender))
      return cat.id;
  }
  return null;
};

const resolveGenderId = (gender: any) => {
  if (typeof gender === "number") return gender;
  if (typeof gender !== "string" || !gender) return null;
  for (const cat of GENDER_CATEGORIES) {
    const sub = cat.subGenders.find((sg) => sg.enumName === gender);
    if (sub) return sub.id;
  }
  return null;
};

const AnimatedPressable = ({ onPress, onLayout, style, activeOpacity = 1, children }: any) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLayout={onLayout}
        style={style}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RegisterStep7Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep7'>) {
  const dispatch = useAppDispatch();
  const { gender } = useAppSelector((s) => (s as any).auth.registrationForm);

  const initialGender = resolveGenderId(gender);

  const [selectedGender, setSelectedGender] = useState(initialGender);
  const [selectedCatId, setSelectedCatId] = useState(() => getInitialCategory(initialGender));
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [measurements, setMeasurements] = useState({});

  const { handleSubmit, setValue, formState: { errors } } = useForm<GenderForm>({
    resolver: zodResolver(genderSchema),
    defaultValues: { gender: typeof gender === "string" ? gender : "" },
  });

  const handleSelectCategory = (category: any) => {
    if (selectedCatId === category.id) {
      toggleSubcategories(category.id);
      return;
    }
    setSelectedGender(category.id);
    setSelectedCatId(category.id);
    setExpandedCategory(null);

    const sub = category.subGenders[0];
    if (sub) setValue("gender", sub.enumName, { shouldValidate: true });
  };

  const handleSelectSubGender = (subGenderId: number, enumName: string) => {
    setSelectedGender(subGenderId);
    setExpandedCategory(null);
    setValue("gender", enumName, { shouldValidate: true });
  };

  const toggleSubcategories = (categoryId: any) => {
    setExpandedCategory((prev) => (prev === categoryId ? null : categoryId));
  };

  const handleNext = handleSubmit(({ gender: enumName }) => {
    dispatch(updateRegistrationField({ field: "gender", value: enumName }));
    navigation.navigate("RegisterStep8");
  });

  return (
    <View className="flex-1 bg-bg">
      <View className="bg-bg pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={7} />

      <View className="flex-1 px-6 py-6 pt-0">
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
            const m = (measurements as any)[category.id] ?? {};

            const selectedSubName =
              isSelected && selectedGender !== category.id
                ? category.subGenders.find((sg) => sg.id === selectedGender)?.name
                : null;

            const subListHeight = m.subListHeight ?? 0;

            return (
              <View
                key={category.id}
                style={{ paddingBottom: isSelected && isExpanded ? subListHeight + 8 : 0 }}
              >
                <View style={{ position: "relative" }}>
                  <AnimatedPressable
                    onPress={() => handleSelectCategory(category)}
                    onLayout={(e: any) => {
                      const { height } = e.nativeEvent.layout;
                      setMeasurements((prev) => ({
                        ...prev,
                        [category.id]: { ...(prev as any)[category.id], pillHeight: height },
                      }));
                    }}
                    style={{
                      borderRadius: 30,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      borderWidth: 0.5,
                      borderColor: isSelected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                      backgroundColor: isSelected ? colors.border2 : colors.surface,
                      paddingHorizontal: 20,
                      paddingVertical: 18,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}>
                      {isSelected && selectedSubName ? selectedSubName : category.categoryName}
                    </Text>
                    {isSelected && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "500" }}>
                          Detaylı Seç
                        </Text>
                        {isExpanded ? (
                          <ChevronUp size={14} color={colors.textSecondary} strokeWidth={2.5} />
                        ) : (
                          <ChevronDown size={14} color={colors.textSecondary} strokeWidth={2.5} />
                        )}
                      </View>
                    )}
                  </AnimatedPressable>

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
                      <Check size={20} color={colors.text} strokeWidth={2.5} />
                    </View>
                  )}
                </View>

                {isSelected && isExpanded && (
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {category.subGenders.map((subGender) => {
                      const isSubSelected = selectedGender === subGender.id;
                      return (
                        <AnimatedPressable
                          key={`${category.id}-${subGender.id}`}
                          onPress={() => handleSelectSubGender(subGender.id, subGender.enumName)}
                          style={{
                            borderRadius: 999,
                            borderCurve: "continuous",
                            overflow: "hidden",
                            borderWidth: 0.5,
                            borderColor: isSubSelected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                            backgroundColor: isSubSelected ? colors.border2 : "transparent",
                            paddingHorizontal: 20,
                            paddingVertical: 16,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500" }}>
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
                              <Check size={18} color={colors.text} strokeWidth={2.5} />
                            </View>
                          )}
                        </AnimatedPressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {errors.gender ? (
          <Text style={{ color: colors.error, textAlign: "center", marginTop: 20, fontSize: 14 }}>
            {errors.gender.message}
          </Text>
        ) : null}
        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <InfoIcon size={16} color={colors.textSecondary} className="mt-3" />
          <Text className="text-gray-400 text-[12px]">
            Detaylı cinsiyet seçenekleri, seni en iyi tanımlayan kimliği seçmene
            yardımcı olur.
          </Text>
        </View>
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressableShared
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.messageOwn }}
          >
            <Text className="text-white py-[20px] font-bold text-[15px] text-center">
              Devam Et
            </Text>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
