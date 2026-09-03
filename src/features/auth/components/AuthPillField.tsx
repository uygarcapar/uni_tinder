import { Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { Eye, EyeOff } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";

/**
 * Ayarlardaki kimlik akışlarının pill input'u — RegisterStep3'teki alanın
 * yeniden kullanılabilir hâli. ChangePassword ve ChangeEmail ekranlarında
 * birbirinin kopyası iki yerel bileşen olarak duruyordu; ikisi de bu.
 *
 * YALNIZ react-hook-form: değer `control` + `name` üzerinden okunuyor,
 * kontrollü (useState'li) bir yol BİLEREK yok. Eski çift mod, aynı ekrandaki
 * alanların bir kısmını şemadan geçirip bir kısmını elle doğrulatıyordu —
 * mevcut şifre alanı ekran state'inde durduğu için doğrulaması da elle
 * yazılmıştı ve şemadaki kuralla ayrı yaşıyordu.
 */
export default function AuthPillField<T extends FieldValues>({
  label,
  placeholder,
  control,
  name,
  secure,
  onToggleSecure,
  invalid,
  editable = true,
  onChanged,
  inputRef,
  keyboardType,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  placeholder: string;
  control: Control<T>;
  name: Path<T>;
  secure?: boolean;
  onToggleSecure?: () => void;
  invalid?: boolean;
  editable?: boolean;
  /** Kullanıcı yazmaya başlayınca sunucu hatasını söndürmek için. */
  onChanged?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  keyboardType?: "email-address";
  returnKeyType?: "next" | "go";
  onSubmitEditing?: () => void;
}) {
  return (
    <View className="mb-4">
      <Text
        className="text-[14px] font-semibold mb-2"
        style={{ color: colors.neutral200 }}
      >
        {label}
      </Text>
      <View
        style={{
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: invalid ? colors.error : colors.hairline,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
        }}
      >
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <TextInput
              ref={inputRef}
              style={{
                flex: 1,
                paddingVertical: 16,
                fontSize: 18,
                color: colors.text,
              }}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              value={field.value ?? ""}
              onChangeText={(next) => {
                field.onChange(next);
                onChanged?.();
              }}
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={keyboardType}
              editable={editable}
              returnKeyType={returnKeyType}
              submitBehavior={returnKeyType === "next" ? "submit" : undefined}
              onSubmitEditing={onSubmitEditing}
            />
          )}
        />
        {onToggleSecure ? (
          <TouchableOpacity activeOpacity={0.7} onPress={onToggleSecure}>
            <View pointerEvents="none">
              <SFIcon
                name={secure ? "eye.slash.fill" : "eye.fill"}
                fallback={secure ? EyeOff : Eye}
                size={24}
                strokeWidth={1.5}
                color={colors.neutral200}
              />
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
