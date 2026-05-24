import { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  PanResponder,
  Animated,
  Easing,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

const MIN_HEIGHT = 140;
const MAX_HEIGHT = 220;
const RANGE = MAX_HEIGHT - MIN_HEIGHT;

export default function RegisterStep12Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const initialHeight =
    typeof profile.height === "number" &&
    profile.height >= MIN_HEIGHT &&
    profile.height <= MAX_HEIGHT
      ? profile.height
      : 170;

  const [height, setHeight] = useState(initialHeight);

  // Error handling states
  const [error, setError] = useState("");
  const [errorFields, setErrorFields] = useState([]);

  // Slider width — onLayout ile ölçülür, pan responder closure içinde ref olarak okunur.
  const sliderWidthRef = useRef(0);
  const lastHapticHeightRef = useRef(initialHeight);
  // Drag başlangıcındaki yükseklik — relative delta için anchor.
  const dragStartHeightRef = useRef(initialHeight);
  // Değer değişince orta "x cm" text'i bir tık büyüsün — değişim durduktan
  // bir süre sonra (timer) tekrar küçülsün.
  const valueScale = useRef(new Animated.Value(1)).current;
  const shrinkTimerRef = useRef(null);
  // Sürükleme sırasında her cm değişiminde yeniden scale-up animasyonu başlatma —
  // bir kez büyüsün, sonra timer'la küçülsün.
  const isScaledUpRef = useRef(false);

  const applyHeight = (newH) => {
    if (newH !== lastHapticHeightRef.current) {
      lastHapticHeightRef.current = newH;
      setHeight(newH);
      Haptics.selectionAsync().catch(() => {});
      if (errorFields.includes("height")) {
        setErrorFields([]);
        setError("");
      }
      // İlk değişimde tek seferlik scale-up — drag devam ederken tekrar tetiklemiyoruz.
      if (!isScaledUpRef.current) {
        isScaledUpRef.current = true;
        Animated.timing(valueScale, {
          toValue: 1.15,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
    }
  };

  const startShrink = () => {
    if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
    shrinkTimerRef.current = setTimeout(() => {
      isScaledUpRef.current = false;
      Animated.timing(valueScale, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, 250);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Tap absolute pozisyona zıplamasın — anchor'ı kaydet, bekleyen shrink iptal.
      onPanResponderGrant: () => {
        dragStartHeightRef.current = lastHapticHeightRef.current;
        if (shrinkTimerRef.current) clearTimeout(shrinkTimerRef.current);
      },
      // Drag delta'sını mevcut değere uygula → relative slider.
      onPanResponderMove: (_e, gestureState) => {
        const w = sliderWidthRef.current;
        if (w === 0) return;
        const deltaCm = Math.round((gestureState.dx / w) * RANGE);
        const newH = Math.max(
          MIN_HEIGHT,
          Math.min(MAX_HEIGHT, dragStartHeightRef.current + deltaCm),
        );
        applyHeight(newH);
      },
      // Bırakıldığında shrink'i başlat — drag boyunca asla küçülmesin.
      onPanResponderRelease: startShrink,
      onPanResponderTerminate: startShrink,
    }),
  ).current;

  const handleNext = () => {
    Keyboard.dismiss();
    if (height < MIN_HEIGHT || height > MAX_HEIGHT) {
      setErrorFields(["height"]);
      setError(`Boy ${MIN_HEIGHT}-${MAX_HEIGHT} cm arasında olmalıdır`);
      return;
    }

    setError("");
    setErrorFields([]);

    dispatch(
      updateMultipleFields({
        height,
        bio: "",
      }),
    );
    navigation.navigate("RegisterStep13");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleBack}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={12} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Boyun.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Boyunu gir. Sürükleyerek ayarlayabilirsin.
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-300 text-[14px] font-semibold mb-2">
              Boy (cm) *
            </Text>
            <View
              {...panResponder.panHandlers}
              onLayout={(e) => {
                sliderWidthRef.current = e.nativeEvent.layout.width;
              }}
              style={{
                position: "relative",
              }}
            >
              {/* Thumb — dikey gri çubuk; text z-order'da üstte kalsın diye
                  inner box'tan ÖNCE render edilir. Slider box'ın üstünden ve
                  altından hafif taşar. */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -4,
                  bottom: -4,
                  left: `${((height - MIN_HEIGHT) / RANGE) * 100}%`,
                  width: 3,
                  marginLeft: -0.75,
                  borderRadius: 2,
                  backgroundColor: "#4B5563",
                  zIndex: 0,
                }}
              />
              <View
                style={{
                  borderRadius: 25,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: errorFields.includes("height")
                    ? "#ef4444"
                    : "rgba(255,255,255,0.1)",
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${((height - MIN_HEIGHT) / RANGE) * 100}%`,
                    backgroundColor: "rgba(255,255,255,0.07)",
                  }}
                />
                {/* Cetvel — her cm için ince dikey çizgi (RANGE+1 = 81 adet). */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 5,
                    height: 6,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  {Array.from({ length: RANGE + 1 }).map((_, i) => (
                    <View
                      key={i}
                      style={{
                        width: 1,
                        height: i % 10 === 0 ? 8 : 5,
                        backgroundColor:
                          i % 10 === 0
                            ? "rgba(255,255,255,0.3)"
                            : "rgba(255,255,255,0.15)",
                        alignSelf: "flex-end",
                      }}
                    />
                  ))}
                </View>
                <View
                  pointerEvents="none"
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 20,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Animated.Text
                    style={{
                      color: "#fff",
                      fontSize: 22,
                      fontWeight: "700",
                      fontVariant: ["tabular-nums"],
                      transform: [{ scale: valueScale }],
                      zIndex: 1,
                    }}
                  >
                    {height} cm
                  </Animated.Text>
                </View>
              </View>
            </View>
          </View>
          {/* Error Message */}
          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="py-3.5"
            >
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
