import { useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { MessageCircle, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";

export default function MatchModal({ match, myPhoto, onClose, onSendMessage }: any) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  // PERF: Önceden Animated.Value(0..60) blur intensity'yi useNativeDriver:false
  // ile tween'liyorduk — her frame JS thread'e mesaj gidiyordu. Swipe sonrası
  // match'te JS thread zaten yüklü olduğu için modal kasıyordu. Şimdi BlurView
  // fixed intensity (60), fade-in için sarmalayan Animated.View opacity'si
  // (native driver) kullanılıyor.
  const blurOpacity = useRef(new Animated.Value(0)).current;
  const leftAnim = useRef(new Animated.Value(-60)).current;
  const rightAnim = useRef(new Animated.Value(60)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const backScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (val) => {
    Animated.spring(val, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };
  const handlePressOut = (val) => {
    Animated.spring(val, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();
  };
  useEffect(() => {
    if (!match) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(blurOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(leftAnim, {
        toValue: 0,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.spring(rightAnim, {
        toValue: 0,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    return () => {
      scale.setValue(0.6);
      opacity.setValue(0);
      blurOpacity.setValue(0);
      leftAnim.setValue(-60);
      rightAnim.setValue(60);
    };
  }, [match]);

  if (!match) return null;

  const AVATAR = 150;
  const OVERLAP = 28;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: blurOpacity,
        }}
      >
        <BlurView
          tint="dark"
          intensity={60}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "center",
          alignItems: "center",
          opacity,
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            alignItems: "center",
            paddingHorizontal: 60,
            alignSelf: "stretch",
          }}
        >
          <View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 999,
              marginBottom: 36,
            }}
          >
            <Text className="text-white font-bold text-[35px]">
              It's a Match!
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              height: AVATAR,
            }}
          >
            <Animated.View
              style={{
                transform: [{ translateX: leftAnim }, { rotate: "-6deg" }],
                marginRight: -OVERLAP,
              }}
            >
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  borderWidth: 0.5,
                  borderColor: "#828282",
                  overflow: "hidden",
                  backgroundColor: "#1f1f1f",
                }}
              >
                {myPhoto && (
                  <Image
                    source={{ uri: myPhoto }}
                    style={{ width: "100%", height: "100%" }}
                  />
                )}
              </View>
            </Animated.View>

            <Animated.View
              style={{
                transform: [{ translateX: rightAnim }, { rotate: "6deg" }],
                marginLeft: -OVERLAP,
              }}
            >
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  borderWidth: 0.5,
                  borderColor: "#828282",
                  overflow: "hidden",
                  backgroundColor: "#1f1f1f",
                }}
              >
                {!!match.matchedUserPhoto && (
                  <Image
                    source={{ uri: match.matchedUserPhoto }}
                    style={{ width: "100%", height: "100%" }}
                  />
                )}
              </View>
            </Animated.View>
          </View>

          <Text className="text-white text-[15px] text-center font-semibold mt-8">
            {match.matchedUserName} ile eşleştin. İlk mesajı sen at.
          </Text>

          <Animated.View
            style={{ width: "100%", transform: [{ scale: sendScale }] }}
            className="mt-8"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => onSendMessage?.(match.conversationId)}
              onPressIn={() => handlePressIn(sendScale)}
              onPressOut={() => handlePressOut(sendScale)}
              className="w-full flex-row items-center justify-center py-[16px] rounded-full"
              style={{ backgroundColor: "#fff", borderCurve: "continuous" }}
            >
              <MessageCircle size={18} color="#000" />
              <Text className="text-black font-semibold text-[14px] ml-2">
                Mesaj Gönder
              </Text>
            </TouchableOpacity>
          </Animated.View>
          <Animated.View
            style={{ width: "100%", transform: [{ scale: backScale }] }}
            className="mt-3"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={onClose}
              onPressIn={() => handlePressIn(backScale)}
              onPressOut={() => handlePressOut(backScale)}
              className="w-full flex-row items-center justify-center py-5 rounded-full"
              style={{
                backgroundColor: "rgba(255,255,255,0.15)",
                borderCurve: "continuous",
              }}
            >
              <Text className="text-gray-300 font-medium text-[14px]">
                Geri Dön
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
