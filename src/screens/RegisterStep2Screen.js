import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { authService } from "../services/authService";
import {
  setUser,
  clearVerification,
  logout,
  setEmailVerifiedToken,
} from "../store/slices/authSlice";
import { Mailbox, RotateCcw, ArrowLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import AnimatedPressable from "../components/AnimatedPressable";

export default function RegisterStep2Screen({ route, navigation }) {
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const email = route?.params?.email || user?.email;
  const isRegistrationMode = route?.params?.mode === "registration";
  const isPending = route?.params?.pending === true;

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const inputRefs = useRef([]);
  const dispatch = useDispatch();

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value / 2 }],
  }));

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleCodeChange = (text, index) => {
    if (text && !/^\d+$/.test(text)) return;
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);
    setError("");
    if (text && index < 5) inputRefs.current[index + 1]?.focus();
    if (text && index === 5 && newCode.every((d) => d !== "")) {
      handleVerify(newCode.join(""));
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === "Backspace" && code[index] === "" && index > 0) {
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verificationCode = null) => {
    Keyboard.dismiss();
    const finalCode = verificationCode || code.join("");
    if (finalCode.length !== 6) {
      setError("Lütfen 6 haneli kodu girin");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isRegistrationMode) {
        // New registration flow: verify-email → save token → go to RegisterStep1
        const response = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.VERIFY_EMAIL_REGISTRATION}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, code: finalCode }),
          },
        );
        const data = await response.json();

        if (data.isSuccess && data.result?.emailVerifiedToken) {
          dispatch(setEmailVerifiedToken(data.result.emailVerifiedToken));
          navigation.reset({ index: 0, routes: [{ name: "RegisterStep3" }] });
        } else {
          setError(data.message || "Doğrulama başarısız");
        }
      } else {
        // Login flow: verify → setUser → AppNavigator switches to Main
        const response = await authService.verifyEmailCode(email, finalCode);
        if (response.isSuccess) {
          dispatch(setUser({ isVerified: true, isMailVerified: true }));
          dispatch(clearVerification());
        } else {
          setError(response.message || "Doğrulama başarısız");
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || "Kod doğrulanamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    setResendSuccess(false);
    setError("");

    try {
      let response;
      if (isRegistrationMode) {
        const res = await fetch(
          `${API_BASE_URL}${API_ENDPOINTS.SEND_VERIFICATION}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          },
        );
        response = await res.json();
      } else {
        response = await authService.resendVerification(email);
      }

      if (response.isSuccess) {
        setResendSuccess(true);
        setCountdown(60);
        setTimeout(() => setResendSuccess(false), 3000);
      } else {
        setError(response.message || "Kod gönderilemedi");
      }
    } catch {
      setError("Kod gönderilemedi");
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoBack = () => {
    if (isLoggingOut) return;
    if (isAuthenticated && !isRegistrationMode) {
      setIsLoggingOut(true);
      dispatch(logout());
    } else {
      dispatch(clearVerification());
      navigation.goBack();
    }
  };

  return (
    <View className="flex-1 bg-[#121212] -mt-[100px]">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Animated.View
          style={[
            {
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: 24,
              paddingVertical: 48,
            },
            liftStyle,
          ]}
        >
          <View className="items-center flex flex-col gap-10 p-8">
            <Mailbox strokeWidth={1} size={100} color="#fff" />
            <View>
              <Text className="text-3xl font-bold text-white mb-3 text-center">
                E-Mail'ini doğrula.
              </Text>
              <Text className="text-white/80 text-[15px] text-center px-3">
                {isPending
                  ? "Bu adrese daha önce kod gönderildi. Mailinizi kontrol edin."
                  : "Bu adrese gönderilen 6 haneli kodu girin"}
              </Text>
              <View
                style={{ borderCurve: "continuous" }}
                className="border-[0.5px] border-white/15 items-center flex-row justify-center mt-5 py-3 px-4 rounded-full overflow-hidden self-center"
              >
                <Text className="text-white text-lg text-center px-4">
                  {email}
                </Text>
              </View>
            </View>
          </View>

          <View>
            {resendSuccess && (
              <View className="bg-green-100 border border-green-400 rounded-2xl p-4 mb-6">
                <Text className="text-green-700 text-sm text-center">
                  ✅ Kod başarıyla gönderildi!
                </Text>
              </View>
            )}

            <View className="flex-row justify-between mb-8 p-8 py-4">
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  className={`w-12 h-16 bg-[#1e1e1e] text-white rounded-[15px] text-center text-2xl font-semibold p-0 ${
                    error ? "border border-red-600" : ""
                  }`}
                  style={{
                    borderCurve: "continuous",
                    overflow: "hidden",
                    textAlignVertical: "center",
                    includeFontPadding: false,
                    paddingVertical: 0,
                    lineHeight: 25,
                  }}
                  value={digit}
                  onChangeText={(text) => handleCodeChange(text, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  keyboardType="number-pad"
                  maxLength={1}
                  editable={!loading}
                  allowFontScaling={false}
                  selectionColor="white"
                  cursorColor="white"
                />
              ))}
            </View>

            <View className="flex-row mb-3 justify-center items-center py-[15px] pt-0 rounded-full overflow-hidden">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleResend}
                disabled={resendLoading || countdown > 0}
              >
                {resendLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : countdown > 0 ? (
                  <View className="flex-row items-center gap-2">
                    <RotateCcw size={16} color="#d1d5db" strokeWidth={2.5} />
                    <Text className="text-gray-300 font-medium">
                      Tekrar gönder ({countdown}s)
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row py-[2px] items-center gap-2">
                    <RotateCcw size={16} color="#fff" strokeWidth={2.5} />
                    <Text className="text-white font-medium">
                      Tekrar Gönder
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <AnimatedPressable
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                opacity: loading || code.some((d) => d === "") ? 0.5 : 1,
              }}
              onPress={() => handleVerify()}
              disabled={loading || code.some((d) => d === "")}
            >
              <LinearGradient
                colors={["#fc5426", "#fc4026"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="items-center"
              >
                {loading ? (
                  <ActivityIndicator className="py-[20px]" color="#fff" />
                ) : (
                  <Text className="text-white py-[20px] text-center font-medium text-[15px]">
                    Doğrula
                  </Text>
                )}
              </LinearGradient>
            </AnimatedPressable>
          </View>

          <View className="items-center mt-4">
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleGoBack}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "center",
                gap: 6,
                borderWidth: 0,
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: 999,
                borderCurve: "continuous",
                paddingHorizontal: 18,
                paddingVertical: 18,
              }}
            >
              <ArrowLeft size={16} color="#fff" strokeWidth={2.5} />
              <Text className="text-white font-medium">Geri Dön</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </View>
  );
}
