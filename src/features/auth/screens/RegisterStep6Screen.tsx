import { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { dobSchema, DobForm } from "@/shared/schemas/formSchemas";

export default function RegisterStep6Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep6'>) {
  const dispatch = useAppDispatch();
  const persistedDob = useAppSelector((s) => (s as any).auth.registrationForm.dateOfBirth);

  const initialDob = (() => {
    if (!persistedDob) return { day: "", month: "", year: "" };
    const dt = new Date(persistedDob);
    if (isNaN(dt.getTime())) return { day: "", month: "", year: "" };
    return {
      day: String(dt.getDate()).padStart(2, "0"),
      month: String(dt.getMonth() + 1).padStart(2, "0"),
      year: String(dt.getFullYear()),
    };
  })();

  const dayRef = useRef<any>(null);
  const monthRef = useRef<any>(null);
  const yearRef = useRef<any>(null);

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<DobForm>({
    resolver: zodResolver(dobSchema),
    defaultValues: initialDob,
  });

  // Backspace boş kutuda → soldaki kutunun son karakterini silip oraya focus.
  const handleKeyPress = (e: any, currentField: string, currentValue: string) => {
    if (e.nativeEvent.key !== "Backspace" || currentValue !== "") return;
    if (currentField === "month") {
      dayRef.current?.focus();
    } else if (currentField === "year") {
      monthRef.current?.focus();
    }
  };

  const handleNext = handleSubmit(({ day, month, year }) => {
    Keyboard.dismiss();
    const d = parseInt(day);
    const mo = parseInt(month);
    const y = parseInt(year);
    const date = new Date(y, mo - 1, d);
    dispatch(updateRegistrationField({ field: "dateOfBirth", value: date.toISOString() }));
    navigation.navigate("RegisterStep7");
  });

  const firstError =
    errors.day?.message || errors.month?.message || errors.year?.message;

  const inputStyle = (hasError: boolean) => ({
    borderRadius: 999,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: hasError ? "#ef4444" : "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center" as const,
  });

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

      <RegisterProgressBar step={6} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Yaşını gir.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Doğum tarihin, doğru eşleşmeler bulmamıza yardımcı olur.
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Gün
              </Text>
              <Controller
                control={control}
                name="day"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    ref={dayRef}
                    style={inputStyle(!!errors.day)}
                    placeholder="gg"
                    placeholderTextColor="#595959"
                    keyboardType="number-pad"
                    maxLength={2}
                    value={value}
                    selection={{ start: value.length, end: value.length }}
                    onChangeText={(val) => {
                      const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
                      onChange(clean);
                      if (clean.length === 2) monthRef.current?.focus();
                    }}
                    caretHidden
                    returnKeyType="next"
                    onSubmitEditing={() => monthRef.current?.focus()}
                  />
                )}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Ay
              </Text>
              <Controller
                control={control}
                name="month"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    ref={monthRef}
                    style={inputStyle(!!errors.month)}
                    placeholder="aa"
                    placeholderTextColor="#595959"
                    keyboardType="number-pad"
                    maxLength={2}
                    value={value}
                    selection={{ start: value.length, end: value.length }}
                    onChangeText={(val) => {
                      const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
                      onChange(clean);
                      if (clean.length === 2) yearRef.current?.focus();
                    }}
                    onKeyPress={(e) => handleKeyPress(e, "month", value)}
                    caretHidden
                    returnKeyType="next"
                    onSubmitEditing={() => yearRef.current?.focus()}
                  />
                )}
              />
            </View>

            <View style={{ flex: 2 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Yıl
              </Text>
              <Controller
                control={control}
                name="year"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    ref={yearRef}
                    style={inputStyle(!!errors.year)}
                    placeholder="yyyy"
                    placeholderTextColor="#595959"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={value}
                    selection={{ start: value.length, end: value.length }}
                    onChangeText={(val) => {
                      const clean = val.replace(/[^0-9]/g, "").slice(0, 4);
                      onChange(clean);
                    }}
                    onKeyPress={(e) => handleKeyPress(e, "year", value)}
                    caretHidden
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                )}
              />
            </View>
          </View>

          {firstError ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {firstError}
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
