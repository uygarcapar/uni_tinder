import { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';

/**
 * Üç noktalı tipik "..." typing animasyonu.
 * Her nokta sırayla scale 0.6 → 1 oluyor.
 */
export default function TypingIndicator({ size = 6, color = '#9ca3af' }) {
  const animations = useRef([
    new Animated.Value(0.4),
    new Animated.Value(0.4),
    new Animated.Value(0.4),
  ]).current;

  useEffect(() => {
    const loops = animations.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, {
            toValue: 1,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.4,
            duration: 300,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animations]);

  return (
    <View
      className="flex-row items-center px-3 py-2 rounded-2xl bg-[#1f1f1f]"
      style={{ alignSelf: 'flex-start' }}
    >
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            marginHorizontal: 2,
            opacity: anim,
            transform: [{ scale: anim }],
          }}
        />
      ))}
    </View>
  );
}
