import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Animated,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { ChevronDown } from "lucide-react-native";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import SearchableListSheet from "@/shared/components/SearchableListSheet";
import { useDepartments } from "@/shared/queries/commonQueries";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { educationSchema, EducationForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";

const YEAR_OF_STUDY_OPTIONS = [
  { value: "0", label: "Hazırlık" },
  { value: "1", label: "1. Sınıf" },
  { value: "2", label: "2. Sınıf" },
  { value: "3", label: "3. Sınıf" },
  { value: "4", label: "4. Sınıf" },
  { value: "5", label: "5. Sınıf" },
  { value: "6", label: "6. Sınıf" },
];

const AnimatedPressable = ({ onPress, style, activeOpacity = 1, children }: any) => {
  const scale = new Animated.Value(1);
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={activeOpacity} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} style={style}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RegisterStep8Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep8'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const initialYearOfStudy =
    profile.yearOfStudy !== undefined && profile.yearOfStudy !== null
      ? String(profile.yearOfStudy)
      : "";
  const initialDepartment = typeof profile.department === "string" ? profile.department : "";

  const [departmentVisible, setDepartmentVisible] = useState(false);
  const snapPoints = useMemo(() => ["75%", "90%"], []);

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<EducationForm>({
    resolver: zodResolver(educationSchema),
    defaultValues: { department: initialDepartment, yearOfStudy: initialYearOfStudy },
  });

  const department = watch("department");
  const yearOfStudy = watch("yearOfStudy");

  const { data: departments = [], isLoading: loadingDepartments } =
    useDepartments();

  const handleOpenDepartmentModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setDepartmentVisible(true), 100);
  }, []);

  const confirmDepartmentSelection = (selectedDepartment: string) => {
    setDepartmentVisible(false);
    setValue("department", selectedDepartment, { shouldValidate: true });
    dispatch(updateMultipleFields({ department: selectedDepartment }));
  };

  const cancelDepartmentSelection = () => {
    setDepartmentVisible(false);
  };

  const getDepartmentLabel = () => {
    if (!department) return "Bölüm Seçiniz";
    const selectedDepartment = (departments as any[]).find((d) => d.enumName === department);
    return selectedDepartment ? selectedDepartment.name : "Bölüm Seçiniz";
  };

  const handleNext = handleSubmit(({ department: dept, yearOfStudy: year }) => {
    dispatch(updateMultipleFields({ yearOfStudy: parseInt(year), department: dept }));
    navigation.navigate("RegisterStep9");
  });

  const hasError = !!errors.department || !!errors.yearOfStudy;
  const errorMessage = errors.department?.message || errors.yearOfStudy?.message;

  return (
    <View className="flex-1 bg-bg">
      {/* Header */}
      <View className="bg-bg pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={8} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Eğitim Bilgilerin.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Sınıfını ve bölümünü seç.
            </Text>
          </View>

          {loadingDepartments ? (
            <View className="mb-6">
              <Text className="text-gray-300 text-[14px] font-semibold mb-2">Bölüm *</Text>
              <View
                style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
                className="border-[0.5px] border-white/10 px-4 py-5 flex items-center"
              >
                <ActivityIndicator size="small" color={colors.text} />
              </View>
            </View>
          ) : (
            <View className="mb-6">
              <Text className="text-gray-300 text-[14px] font-semibold mb-2">Bölüm *</Text>
              <TouchableOpacity
                style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
                activeOpacity={1}
                onPress={handleOpenDepartmentModal}
                className="border-[0.5px] border-white/10 px-4 py-5 flex-row items-center justify-between"
              >
                <Text className={`${department ? "text-white" : "text-gray-400"} text-[16px] font-medium`}>
                  {getDepartmentLabel()}
                </Text>
                <ChevronDown size={20} color={colors.textSecondary} strokeWidth={2} pointerEvents="none" />
              </TouchableOpacity>
            </View>
          )}

          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">Sınıf *</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {YEAR_OF_STUDY_OPTIONS.map((opt) => {
                const isSelected = yearOfStudy === opt.value;
                return (
                  <AnimatedPressable
                    key={opt.value}
                    onPress={() => {
                      setValue("yearOfStudy", opt.value, { shouldValidate: true });
                      dispatch(updateMultipleFields({ yearOfStudy: parseInt(opt.value) }));
                    }}
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      borderWidth: 0.5,
                      borderColor: isSelected ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                      backgroundColor: isSelected ? colors.border2 : colors.surface,
                      paddingHorizontal: 18,
                      paddingVertical: 13,
                    }}
                  >
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{opt.label}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          {hasError ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">{errorMessage}</Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-bg">
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

      {/* Department Picker */}
      {departmentVisible && (
        <AppBottomSheet
          visible={departmentVisible}
          onClose={cancelDepartmentSelection}
          snapPoints={snapPoints}
          backdrop="blur"
          backgroundStyle={{ borderRadius: 44 }}
          handleComponent={null}
          stackBehavior="push"
        >
          <SearchableListSheet
            items={departments}
            initialValue={department ?? ""}
            title="Bölüm Seç"
            onConfirm={confirmDepartmentSelection}
            onCancel={cancelDepartmentSelection}
          />
        </AppBottomSheet>
      )}
    </View>
  );
}
