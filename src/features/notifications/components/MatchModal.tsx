import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { MessageCircle } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import * as Haptics from "expo-haptics";
import { CannonConfetti } from "react-native-fast-confetti";
import { useTranslation } from "react-i18next";
import { colors } from "../../../shared/theme/colors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const CONFETTI_PER_SIDE = 55;
const CONFETTI_COLORS = [
  "#FF4D6D",
  "#FF8FA3",
  "#FFB703",
  "#FFD60A",
  "#06D6A0",
  "#3DDC97",
  "#4CC9F0",
  "#4895EF",
  "#9B5DE5",
  "#F15BB5",
  colors.primaryHot,
  colors.text,
];

// Konfeti: react-native-fast-confetti (Skia Atlas API) — eski implementasyon
// her match'te 110 ayrı Animated.View mount edip 110 ShadowTree node'u tek
// seferde commit ediyordu; commit-storm geçmişi olan bir app'te gereksiz risk.
// Artık tüm parçalar TEK Skia canvas node'unda, fizik UI thread'de. İki yan
// "cannon" origin eski sol/sağ patlama tasarımını korur.
function ConfettiBurst() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <CannonConfetti colors={CONFETTI_COLORS} fadeOutOnEnd sprayDuration={150}>
        <CannonConfetti.Origin
          position={{ x: -50, y: SCREEN_H * 0.4 }}
          target={{ x: SCREEN_W * 0.55, y: 40 }}
          count={CONFETTI_PER_SIDE}
        />
        <CannonConfetti.Origin
          position={{ x: SCREEN_W + 50, y: SCREEN_H * 0.4 }}
          target={{ x: SCREEN_W * 0.45, y: 40 }}
          count={CONFETTI_PER_SIDE}
        />
      </CannonConfetti>
    </View>
  );
}

export default function MatchModal({ match, myPhoto, onClose, onSendMessage }: any) {
  const { t } = useTranslation();
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
  const titleShake = useRef(new Animated.Value(0)).current;
  const sendShake = useRef(new Animated.Value(0)).current;
  const sendLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const [myLoaded, setMyLoaded] = useState(!myPhoto);
  const [matchLoaded, setMatchLoaded] = useState(!match?.matchedUserPhoto);
  const imagesReady = myLoaded && matchLoaded;

  useEffect(() => {
    setMyLoaded(!myPhoto);
    setMatchLoaded(!match?.matchedUserPhoto);
  }, [match?.conversationId, myPhoto, match?.matchedUserPhoto]);

  useEffect(() => {
    if (!match) return;
    const t = setTimeout(() => {
      setMyLoaded(true);
      setMatchLoaded(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [match?.conversationId]);

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
    if (!match || !imagesReady) return;
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

    Animated.sequence([
      Animated.delay(120),
      Animated.timing(titleShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: -0.6, duration: 50, useNativeDriver: true }),
      Animated.timing(titleShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();

    // "Mesaj Gönder" butonu dikkat titremesi: açılışta daha uzun süren bir burst,
    // sonrasında sonsuz tekrar eden nabız. Genlik ve hız ikisinde de aynı — açılış
    // yalnızca daha çok salınım yapıyor, daha sert değil.
    const wig = (toValue: number, duration: number) =>
      Animated.timing(sendShake, { toValue, duration, useNativeDriver: true });

    const AMP = 0.7;

    const intro = Animated.sequence([
      Animated.delay(650),
      wig(AMP, 70),
      wig(-AMP, 70),
      wig(AMP, 70),
      wig(-AMP, 70),
      wig(AMP * 0.7, 65),
      wig(-AMP * 0.7, 65),
      wig(AMP * 0.7, 65),
      wig(-AMP * 0.7, 65),
      wig(AMP * 0.4, 60),
      wig(-AMP * 0.4, 60),
      wig(0, 60),
    ]);

    intro.start(({ finished }) => {
      if (!finished) return;
      sendLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.delay(1600),
          wig(AMP, 70),
          wig(-AMP, 70),
          wig(AMP * 0.7, 65),
          wig(-AMP * 0.7, 65),
          wig(AMP * 0.4, 60),
          wig(0, 60),
        ]),
      );
      sendLoopRef.current.start();
    });

    return () => {
      intro.stop();
      sendLoopRef.current?.stop();
      sendLoopRef.current = null;
      scale.setValue(0.6);
      opacity.setValue(0);
      blurOpacity.setValue(0);
      leftAnim.setValue(-60);
      rightAnim.setValue(60);
      titleShake.setValue(0);
      sendShake.setValue(0);
    };
  }, [match, imagesReady]);

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
        {imagesReady && (
          <ConfettiBurst key={`confetti-${match.conversationId}`} />
        )}
        <Animated.View
          style={{
            transform: [{ scale }],
            alignItems: "center",
            paddingHorizontal: 60,
            alignSelf: "stretch",
          }}
        >
          <Animated.View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 999,
              marginBottom: 36,
              transform: [
                {
                  translateX: titleShake.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-10, 0, 10],
                  }),
                },
                {
                  rotate: titleShake.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ["-6deg", "0deg", "6deg"],
                  }),
                },
              ],
            }}
          >
            <Text className="text-white font-bold text-[35px]">
              {t('match.title')}
            </Text>
          </Animated.View>

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
                  backgroundColor: colors.surface2,
                }}
              >
                {myPhoto && (
                  <Image
                    source={{ uri: myPhoto }}
                    style={{ width: "100%", height: "100%" }}
                    cachePolicy="memory-disk"
                    transition={0}
                    contentFit="cover"
                    onLoad={() => setMyLoaded(true)}
                    onError={() => setMyLoaded(true)}
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
                  backgroundColor: colors.surface2,
                }}
              >
                {!!match.matchedUserPhoto && (
                  <Image
                    source={{ uri: match.matchedUserPhoto }}
                    style={{ width: "100%", height: "100%" }}
                    cachePolicy="memory-disk"
                    transition={0}
                    contentFit="cover"
                    onLoad={() => setMatchLoaded(true)}
                    onError={() => setMatchLoaded(true)}
                  />
                )}
              </View>
            </Animated.View>
          </View>

          <Text className="text-white text-[15px] text-center font-semibold mt-8">
            {t('match.subtitle', { name: match.matchedUserName })}
          </Text>

          <Animated.View
            style={{
              width: "100%",
              transform: [
                { scale: sendScale },
                {
                  translateX: sendShake.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [-5, 0, 5],
                  }),
                },
                {
                  rotate: sendShake.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ["-1.2deg", "0deg", "1.2deg"],
                  }),
                },
              ],
            }}
            className="mt-8"
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => onSendMessage?.(match.conversationId)}
              onPressIn={() => handlePressIn(sendScale)}
              onPressOut={() => handlePressOut(sendScale)}
              className="w-full flex-row items-center justify-center py-[16px] rounded-full"
              style={{ backgroundColor: colors.litPlus, borderCurve: "continuous" }}
            >
              <SFIcon name="message.fill" fallback={MessageCircle} size={18} color="#fff" strokeWidth={2} weight="semibold" />
              <Text className="text-white font-semibold text-[14px] ml-2">
                {t('match.sendMessage')}
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
                {t('match.back')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
