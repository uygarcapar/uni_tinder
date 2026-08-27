import { ActivityIndicator, View, Text, TouchableOpacity } from "react-native";
import { colors } from "../theme/colors";
import SFIcon from "./SFIcon";

export default function EmptyState({
  Icon,
  sf,
  iconSize = 100,
  iconColor = colors.neutral100,
  iconStrokeWidth = 1.2,
  text,
  subtitle,
  topOffset = 24,
  containerStyle,
  buttonLabel,
  onButtonPress,
  buttonBusy = false,
}: any) {
  return (
    <View
      style={[
        {
          alignItems: "center",
          paddingTop: topOffset,
          paddingHorizontal: 32,
        },
        containerStyle,
      ]}
    >
      <View
        className="mb-4"
        style={{
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {Icon && sf ? (
          <SFIcon
            name={sf}
            fallback={Icon}
            size={iconSize}
            color={iconColor}
            strokeWidth={iconStrokeWidth}
          />
        ) : Icon ? (
          <Icon
            size={iconSize}
            color={iconColor}
            strokeWidth={iconStrokeWidth}
          />
        ) : null}
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: 21,
          fontWeight: "600",
          textAlign: "center",
          letterSpacing: -0.3,
          marginBottom: subtitle ? 8 : 0,
        }}
      >
        {text}
      </Text>

      {/* `subtitle` prop'u baştan beri vardı ama yalnız başlığın marginBottom'unu
          belirliyordu — çağıranların geçtiği açıklama metinleri (bildirimler,
          mesajlar, beğeniler) hiç çizilmiyordu. */}
      {!!subtitle && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 15,
            lineHeight: 21,
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>
      )}

      {/* Aksiyon butonu — DiscoverScreen'in boş deste kartındaki pill'in aynısı
          (litPlus zemin, 999 radius, 15/600 metin). Orada sola yaslı duruyor,
          burada boş durumun geri kalanı gibi ortalanır. */}
      {!!buttonLabel && !!onButtonPress && (
        <TouchableOpacity
          onPress={onButtonPress}
          disabled={buttonBusy}
          activeOpacity={0.8}
          style={{
            marginTop: 20,
            borderRadius: 999,
            borderCurve: "continuous",
            paddingHorizontal: 20,
            paddingVertical: 12,
            backgroundColor: colors.litPlus,
          }}
        >
          {/* `buttonBusy`: aksiyon uçuşta. Etiket KALDIRILMIYOR, yalnız
              görünmez oluyor — spinner üstüne absolute biniyor ki pill'in
              genişliği oynamasın (aksi halde her denemede buton büzülüp
              açılıyor, kendisi bir flash oluyor). */}
          <Text
            style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: "600",
              opacity: buttonBusy ? 0 : 1,
            }}
          >
            {buttonLabel}
          </Text>
          {buttonBusy && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="small" color={colors.text} />
            </View>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
