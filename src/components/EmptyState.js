import { View, Text } from "react-native";
import { BlurView } from "expo-blur";

export default function EmptyState({
  Icon,
  iconSize = 50,
  iconColor = "#fff",
  iconStrokeWidth = 1.3,
  text,
  topOffset = 24,
  containerStyle,
}) {
  return (
    <View
      style={[
        {
          alignItems: "center",
          paddingTop: topOffset,
        },
        containerStyle,
      ]}
    >
      <BlurView
        intensity={40}
        tint="dark"
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
          paddingVertical: 28,
          borderRadius: 32,
          borderCurve: "continuous",
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        {Icon && (
          <Icon
            size={iconSize}
            color={iconColor}
            strokeWidth={iconStrokeWidth}
          />
        )}
        <Text
          className="text-gray-400"
          style={{
            fontWeight: "500",
            fontSize: 13,
            marginTop: 8,
          }}
        >
          {text}
        </Text>
      </BlurView>
    </View>
  );
}
