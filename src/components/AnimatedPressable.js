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
  children,
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e) => {
    Animated.spring(scale, {
      toValue: pressScale,
      useNativeDriver: true,
      speed: 20,
    }).start();
    onPressIn?.(e);
  };

  const handlePressOut = (e) => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
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
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}
