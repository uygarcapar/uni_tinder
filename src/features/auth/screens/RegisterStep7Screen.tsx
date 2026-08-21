import { View, Text, ActivityIndicator } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { updateRegistrationField } from "@/features/auth/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { InfoIcon } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import RegisterProgressBar from "@/features/auth/components/RegisterProgressBar";
import RegisterBackButton from "@/features/auth/components/RegisterBackButton";
import AnimatedPressableShared from "@/shared/components/AnimatedPressable";
import GenderCategoryPicker from "@/shared/components/GenderCategoryPicker";
import { useGenders } from "@/shared/queries/commonQueries";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { genderSchema, GenderForm } from "@/shared/schemas/formSchemas";
import { colors } from "../../../shared/theme/colors";
import { useTranslation } from 'react-i18next';

// Backend Gender'ı enumName ("Male"/"Female"/"NonBinary" vb.) bekliyor.
// Kategori + alt cinsiyet listesi GET /api/common/genders'tan geliyor (eskiden
// burada hardcode'du); picker EditProfileForm ile paylaşılıyor.

export default function RegisterStep7Screen({ navigation }: NativeStackScreenProps<AuthStackParamList, 'RegisterStep7'>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { gender } = useAppSelector((s) => (s as any).auth.registrationForm);

  const { data: categories = [], isLoading } = useGenders();

  const { handleSubmit, setValue, watch, formState: { errors } } = useForm<GenderForm>({
    resolver: zodResolver(genderSchema),
    defaultValues: { gender: typeof gender === "string" ? gender : "" },
  });

  const selected = watch("gender");

  const handleNext = handleSubmit(({ gender: enumName }) => {
    dispatch(updateRegistrationField({ field: "gender", value: enumName }));
    navigation.navigate("RegisterStep8");
  });

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg }}>
      <View className="pt-16 pb-6 px-6" style={{ backgroundColor: colors.bg }}>
        <RegisterBackButton onPress={() => navigation.goBack()} />
      </View>

      <RegisterProgressBar step={7} />

      <View className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold" style={{ color: colors.text }}>{t('auth.step7.title')}</Text>
          <Text className="text-[18px] font-normal mb-6" style={{ color: colors.textSecondary }}>
            {t('auth.step7.description')}
          </Text>
        </View>

        {isLoading && categories.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : (
          <GenderCategoryPicker
            categories={categories}
            value={selected}
            onChange={(enumName) =>
              setValue("gender", enumName, { shouldValidate: true })
            }
          />
        )}

        {errors.gender ? (
          <Text style={{ color: colors.error, textAlign: "center", marginTop: 20, fontSize: 14 }}>
            {errors.gender.message}
          </Text>
        ) : null}
        <View className="flex-row gap-2 px-2 mr-6 items-center mt-5">
          <SFIcon name="info.circle" fallback={InfoIcon} size={16} color={colors.textSecondary} />
          <Text className="text-[12px]" style={{ color: colors.textSecondary }}>
            {t('auth.step7.infoText')}
          </Text>
        </View>
      </View>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressableShared
            onPress={handleNext}
            style={{ borderRadius: 999, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.inverseSurface }}
          >
            <Text className="py-[20px] font-bold text-[15px] text-center" style={{ color: colors.onInverseSurface }}>
              {t('common.continueButton')}
            </Text>
          </AnimatedPressableShared>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
