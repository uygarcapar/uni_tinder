import { useRef } from "react";
import { TouchableOpacity, Animated } from "react-native";

export default function AnimatedPressable({
  onPress,
  onPressIn,
  onPressOut,
  onLayout,
  style,
  disabled,
  activeOpacity = 1,
  pressScale = 0.97,
  // Bırakınca yaylanma miktarı. Varsayılan 8 kısa bir "taşma" (scale 1'i geçip
  // geri gelme) üretiyor; buton gibi küçük öğelerde hoş, tam genişlikte liste
  // satırlarında satır büyüyüp kayıyormuş gibi görünüyor → oralarda 0 geçilir.
  pressBounciness = 8,
  testID,
  // İkon-only butonlarda ekran okuyucunun okuyacağı tek şey bu — verilmezse
  // (mevcut çağıranların çoğu) TouchableOpacity'nin davranışı değişmez.
  accessibilityLabel,
  accessibilityRole,
  hitSlop,
  children,
}: any) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.spring(scale, {
      toValue: pressScale,
      useNativeDriver: true,
      speed: 20,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: pressBounciness,
      speed: 20,
    }).start();
    onPressOut?.(e);
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={activeOpacity}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        onLayout={onLayout}
        disabled={disabled}
        style={style}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        hitSlop={hitSlop}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}
