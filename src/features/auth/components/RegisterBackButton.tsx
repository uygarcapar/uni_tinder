import { memo } from "react";
import { View, TouchableOpacity, Platform } from "react-native";
import { Host, Button as SwiftUIButton, Image as SwiftUIImage } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  frame,
  accessibilityLabel,
} from "@expo/ui/swift-ui/modifiers";
import { ChevronLeft } from "@/shared/icons";
import { useTranslation } from "react-i18next";
import SFIcon from "@/shared/components/SFIcon";
import GlassFallbackSurface from "@/shared/components/GlassFallbackSurface";
import { colors } from "@/shared/theme/colors";
import {
  glassFallback,
  glassIconClearGlyph,
  GLASS_ICON_CLEAR_SIZE,
} from "@/shared/theme/glass";

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
      // Host'a SABİT ölçü veriliyor, `matchContents` DEĞİL: intrinsic ölçü
      // native taraftan bir kare sonra geliyor ve o ilk karede host 0×0 kalıyor.
      // SwiftUI butonu sıfır ölçülü host'ta kırpılmadığı için kutusu
      // origin'e ORTALANARAK çiziliyor — buton ekranın soluna taşmış görünüp
      // ölçü gelince yerine sıçrıyordu. Ölçü zaten `frame` modifier'ıyla sabit.
      // Sarmalayıcı iOS 26 ALTINDA zemini veriyor, 26+'da hiç render olmuyor.
      <GlassFallbackSurface
        shape="circle"
        width={GLASS_ICON_CLEAR_SIZE}
        height={GLASS_ICON_CLEAR_SIZE}
      >
        <Host
          style={{ width: GLASS_ICON_CLEAR_SIZE, height: GLASS_ICON_CLEAR_SIZE }}
        >
          <SwiftUIButton
            onPress={onPress}
            modifiers={[
              // Kabuk YOK, berrak cam glifin üstünde — ekran başlıklarındaki
              // geri butonlarıyla aynı zincir; bkz. glassIconClearGlyph.
              buttonStyle("plain"),
              tint(color),
              frame({
                width: GLASS_ICON_CLEAR_SIZE,
                height: GLASS_ICON_CLEAR_SIZE,
              }),
              // `label` prop'u YOK: verildiği anda native taraf children'ı tamamen
              // yok sayıyor (bkz. @expo/ui/ios/Button/Button.swift), yani özel
              // ölçülü glif çizilmiyor. Erişilebilir ad bu yüzden modifier'dan.
              accessibilityLabel(t("common.back")),
              ...glassFallback({ shape: "circle" }),
            ]}
          >
            <SwiftUIImage
              systemName="chevron.left"
              color={color}
              modifiers={glassIconClearGlyph()}
            />
          </SwiftUIButton>
        </Host>
      </GlassFallbackSurface>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} hitSlop={10} activeOpacity={0.7}>
      <View
        pointerEvents="none"
        style={{
          width: GLASS_ICON_CLEAR_SIZE,
          height: GLASS_ICON_CLEAR_SIZE,
          borderRadius: 999,
          borderCurve: "continuous",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.hairlineSoft,
        }}
      >
        <SFIcon
          name="chevron.left"
          fallback={ChevronLeft}
          size={22}
          color={color}
          strokeWidth={2}
          weight="semibold"
        />
      </View>
    </TouchableOpacity>
  );
}

export default memo(RegisterBackButton);
