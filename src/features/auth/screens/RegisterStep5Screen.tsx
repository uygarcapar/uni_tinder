import { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  TouchableWithoutFeedback,
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
import { firstNameSchema, FirstNameForm } from "@/shared/schemas/formSchemas";
import { colors, gradients } from "../../../shared/theme/colors";

export default function RegisterStep5Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep5'>) {
  const dispatch = useAppDispatch();
  const { firstName } = useAppSelector(
    (s) => (s as any).auth.registrationForm,
  );
  const firstNameInputRef = useRef<any>(null);

  const { control, handleSubmit, formState: { errors } } = useForm<FirstNameForm>({
    resolver: zodResolver(firstNameSchema),
    defaultValues: { firstName: firstName || "" },
  });

  const handleNext = handleSubmit(({ firstName: name }) => {
    Keyboard.dismiss();
    dispatch(updateRegistrationField({ field: "firstName", value: name }));
    navigation.navigate("RegisterStep6");
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

      <RegisterProgressBar step={5} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">
              Seni tanıyalım.
            </Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Bize biraz kendinden bahset. Seni tanımamıza yardımcı olmak için
              kutucukları doldur.
            </Text>
          </View>

          <View className="w-full mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
              Ad *
            </Text>
            <Controller
              control={control}
              name="firstName"
              render={({ field: { onChange, value } }) => (
                <View
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    borderWidth: 0.5,
                    borderColor: errors.firstName
                      ? colors.error
                      : "rgba(255,255,255,0.1)",
                  }}
                >
                  <TextInput
                    ref={firstNameInputRef}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      fontSize: 18,
                      color: colors.text,
                    }}
                    placeholder="Adın"
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={onChange}
                  />
                </View>
              )}
            />
          </View>

          {errors.firstName ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {errors.firstName.message}
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
              colors={gradients.neutralFade}
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
