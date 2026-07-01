import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

export default function EmptyState({
  Icon,
  iconSize = 100,
  iconColor = "#dee0ea",
  iconStrokeWidth = 1.2,
  text,
  subtitle,
  topOffset = 24,
  containerStyle,
  buttonLabel,
  onButtonPress,
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
        {Icon && (
          <Icon
            size={iconSize}
            color={iconColor}
            strokeWidth={iconStrokeWidth}
          />
        )}
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
    </View>
  );
}
