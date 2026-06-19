import { useRef } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateMultipleFields } from "@/features/profile/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Check, InfoIcon } from "lucide-react-native";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { interestedInSchema, InterestedInForm } from "@/shared/schemas/formSchemas";

// Backend InterestedIn enumName ("Men"/"Women"/"NonBinary") bekliyor.
const OPTIONS = [
  { enumName: "Men", label: "Erkek" },
  { enumName: "Women", label: "Kadın" },
  { enumName: "NonBinary", label: "Non-Binary" },
];

const AnimatedPressable = ({ onPress, style, activeOpacity = 1, children }: any) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 20 }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 20 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity activeOpacity={activeOpacity} onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} style={style}>
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RegisterStep10Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep10'>) {
  const dispatch = useAppDispatch();
  const profile = useAppSelector((s) => (s as any).profile || {});

  const initial =
    Array.isArray(profile.interestedIn) && profile.interestedIn.length > 0
      ? profile.interestedIn.filter((v: any) => typeof v === "string")
      : [];

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<InterestedInForm>({
    resolver: zodResolver(interestedInSchema),
    defaultValues: { interestedIn: initial },
  });

  const selected = watch("interestedIn");

  const toggle = (enumName: string) => {
    const next = selected.includes(enumName)
      ? selected.filter((v) => v !== enumName)
      : [...selected, enumName];
    setValue("interestedIn", next, { shouldValidate: true });
  };

  const handleNext = handleSubmit(({ interestedIn }) => {
    dispatch(updateMultipleFields({ interestedIn }));
    navigation.navigate("RegisterStep12");
  });

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity activeOpacity={1} onPress={() => navigation.goBack()} className="flex-row items-center">
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
                  borderColor: active ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.1)",
                  backgroundColor: active ? "#3e3e3e" : "#1E1E1E",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  position: "relative",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}>{opt.label}</Text>
                {active && (
                  <View pointerEvents="none" style={{ position: "absolute", right: 20, top: 0, bottom: 0, justifyContent: "center" }}>
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

        {errors.interestedIn ? (
          <Text style={{ color: "#ef4444", textAlign: "center", marginTop: 20, fontSize: 14 }}>
            {errors.interestedIn.message}
          </Text>
        ) : null}
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={{ paddingHorizontal: 32, paddingBottom: 32, paddingTop: 16, backgroundColor: "#121212" }}>
          <AnimatedPressableShared onPress={handleNext} style={{ borderRadius: 999, overflow: "hidden" }}>
            <LinearGradient
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={{ color: "#000", paddingVertical: 20, fontWeight: "700", fontSize: 15, textAlign: "center" }}>
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
