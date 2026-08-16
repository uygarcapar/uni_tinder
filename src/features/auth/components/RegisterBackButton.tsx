import { memo } from "react";
import { View, TouchableOpacity, Platform } from "react-native";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
  frame,
  controlSize,
} from "@expo/ui/swift-ui/modifiers";
import { ChevronLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import { colors } from "@/shared/theme/colors";
import { glassFallback } from "@/shared/theme/glass";

type Props = {
  onPress: () => void;
  /** İkon rengi — beyaz zeminli ekranlarda (RegisterScreen) koyu ton geçiliyor. */
  color?: string;
};

// Register akışındaki tek geri butonu. iOS'ta @expo/ui'nin native SwiftUI
// Button'ı ile yuvarlak liquid glass, Android'de düz chevron fallback.
function RegisterBackButton({ onPress, color = colors.text }: Props) {
  const { t } = useTranslation();

  if (Platform.OS === "ios") {
    return (
      <Host matchContents>
        <SwiftUIButton
          label={t("common.back")}
          systemImage="chevron.left"
          onPress={onPress}
          modifiers={[
            buttonStyle("glass"),
            tint(color),
            controlSize("large"),
            labelStyle("iconOnly"),
            font({ size: 22, weight: "semibold" }),
            frame({ width: 44, height: 44 }),
            ...glassFallback({ shape: "circle", color }),
          ]}
        />
      </Host>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.7}>
      <View
        pointerEvents="none"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255,255,255,0.08)",
        }}
      >
        <SFIcon
          name="chevron.left"
          fallback={ChevronLeft}
          size={26}
          color={color}
          strokeWidth={2}
          weight="semibold"
        />
      </View>
    </TouchableOpacity>
  );
}

export default memo(RegisterBackButton);
