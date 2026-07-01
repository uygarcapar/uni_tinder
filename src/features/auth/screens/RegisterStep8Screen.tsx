import { useState, useMemo, useCallback, useEffect } from "react";
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
import {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import { Check, Search, SearchX, ChevronDown } from "lucide-react-native";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "@/shared/constants/api";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { educationSchema, EducationForm } from "@/shared/schemas/formSchemas";
import { colors, gradients } from "../../../shared/theme/colors";

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

const DepartmentPickerContent = ({ initialDepartment, onConfirm, onCancel, departments }: any) => {
  const isValidDepartment = initialDepartment !== null && initialDepartment !== undefined && initialDepartment !== "";
  const localDepartment = isValidDepartment ? String(initialDepartment) : "";
  const [search, setSearch] = useState("");

  const filteredDepartments = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return departments;
    return departments.filter((d: any) => (d.name ?? "").toLocaleLowerCase("tr").includes(q));
  }, [search, departments]);

  const orderedDepartments = useMemo(() => {
    if (!localDepartment) return filteredDepartments;
    const selectedItem = departments.find((d: any) => String(d.id) === localDepartment);
    if (!selectedItem) return filteredDepartments;
    const q = search.trim().toLocaleLowerCase("tr");
    if (q && !(selectedItem.name ?? "").toLocaleLowerCase("tr").includes(q)) return filteredDepartments;
    const rest = filteredDepartments.filter((d: any) => String(d.id) !== localDepartment);
    return [selectedItem, ...rest];
  }, [filteredDepartments, departments, localDepartment, search]);

  return (
    <BottomSheetFlatList
      data={orderedDepartments}
      keyExtractor={(item: any) => String(item.id)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.bg, paddingTop: 32, paddingBottom: 8 }}>
          <View className="flex-row justify-between items-center py-4 px-2">
            <TouchableOpacity onPress={onCancel}>
              <Text className="text-gray-400 text-xl">İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onConfirm(localDepartment)}>
              <Text className="text-white text-xl font-bold">Bitti</Text>
            </TouchableOpacity>
          </View>
          <View style={{ position: "relative", marginBottom: 10 }}>
            <View pointerEvents="none" style={{ position: "absolute", left: 18, top: 0, bottom: 0, justifyContent: "center", zIndex: 1 }}>
              <Search size={18} color={colors.text} strokeWidth={2} />
            </View>
            <BottomSheetTextInput
              defaultValue=""
              onChangeText={setSearch}
              placeholder=""
              autoCorrect={false}
              autoCapitalize="none"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                borderWidth: 0.5,
                borderColor: "rgba(255,255,255,0.1)",
                backgroundColor: "transparent",
                paddingLeft: 44,
                paddingRight: 16,
                paddingVertical: 14,
                color: colors.text,
                fontSize: 16,
              }}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <SearchX size={36} color={colors.text} strokeWidth={1.75} />
          {search.trim() !== "" && (
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "500", marginTop: 12, textAlign: "center" }}>
              '{search.trim()}' bulunamadı
            </Text>
          )}
        </View>
      }
      renderItem={({ item }: any) => {
        const isSelected = item.enumName === localDepartment;
        return (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onConfirm(item.enumName)}
            style={{
              paddingVertical: 20,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              borderCurve: "continuous",
              overflow: "hidden",
              borderRadius: 999,
              backgroundColor: isSelected ? "rgba(255,255,255,0.1)" : "transparent",
              position: "relative",
            }}
          >
            <Text style={{ color: isSelected ? colors.text : colors.textSecondary, fontSize: 16, fontWeight: "400", flex: 1, marginRight: 32 }}>
              {item.name}
            </Text>
            {isSelected && (
              <View pointerEvents="none" style={{ position: "absolute", right: 16, top: 0, bottom: 0, justifyContent: "center" }}>
                <Check size={18} color={colors.text} strokeWidth={2.5} />
              </View>
            )}
          </TouchableOpacity>
        );
      }}
    />
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

  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [departmentVisible, setDepartmentVisible] = useState(false);
  const snapPoints = useMemo(() => ["75%"], []);

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<EducationForm>({
    resolver: zodResolver(educationSchema),
    defaultValues: { department: initialDepartment, yearOfStudy: initialYearOfStudy },
  });

  const department = watch("department");
  const yearOfStudy = watch("yearOfStudy");

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoadingDepartments(true);
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_DEPARTMENTS}`);
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

  const handleOpenDepartmentModal = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setDepartmentVisible(true), 100);
  }, []);

  const confirmDepartmentSelection = (selectedDepartment: string) => {
    setValue("department", selectedDepartment, { shouldValidate: true });
    setDepartmentVisible(false);
  };

  const cancelDepartmentSelection = () => {
    setDepartmentVisible(false);
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.55}
        pressBehavior="close"
        onPress={() => { Keyboard.dismiss(); setDepartmentVisible(false); }}
        style={[props.style, { backgroundColor: "#000" }]}
      />
    ),
    [],
  );

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
                    onPress={() => setValue("yearOfStudy", opt.value, { shouldValidate: true })}
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
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden" }}
          >
            <LinearGradient
              colors={gradients.neutralFade}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="py-3.5"
            >
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>

      {/* Department Bottom Sheet */}
      <AppBottomSheet
        visible={departmentVisible}
        onClose={cancelDepartmentSelection}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ borderRadius: 44 }}
      >
        <DepartmentPickerContent
          initialDepartment={department}
          onConfirm={confirmDepartmentSelection}
          onCancel={cancelDepartmentSelection}
          departments={departments}
        />
      </AppBottomSheet>
    </View>
  );
}
