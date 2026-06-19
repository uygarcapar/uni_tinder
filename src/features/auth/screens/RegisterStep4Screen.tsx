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
import { phoneSchema, PhoneForm } from "@/shared/schemas/formSchemas";

const PHONE_LENGTH = 10;

export default function RegisterStep4Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep4'>) {
  const dispatch = useAppDispatch();

  const storedPhoneNumber = useAppSelector(
    (s) => (s as any).auth.registrationForm.phoneNumber,
  );

  // Redux'tan local 10 haneye düşür ("+90 " prefix'i ve format temizliği).
  const rawAll = (storedPhoneNumber || "").replace(/\D/g, "");
  const initialDigits = rawAll.startsWith("90") ? rawAll.slice(2) : rawAll;

  const { control, handleSubmit, formState: { errors } } = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: initialDigits },
  });

  const handleNext = handleSubmit(({ phone }) => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "phoneNumber", value: `+90 ${phone}` }));
    navigation.navigate("RegisterStep5");
  });

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

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: errors.phone ? "#ef4444" : "rgba(255,255,255,0.1)",
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
                  value={value}
                  onChangeText={(text) => {
                    const clean = text.replace(/\D/g, "").slice(0, PHONE_LENGTH);
                    onChange(clean);
                  }}
                  maxLength={PHONE_LENGTH}
                />
              </View>
            )}
          />

          {errors.phone ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {errors.phone.message}
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
