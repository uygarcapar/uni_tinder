import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { authService } from "../services/authService";
import { setUser, clearVerification, logout } from "../store/slices/authSlice";
import { Mail, Mailbox, RotateCcw } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";

export default function EmailVerificationScreen({ route, navigation }) {
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const email = route?.params?.email || user?.email;
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const inputRefs = useRef([]);
  const dispatch = useDispatch();

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

    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (text && index === 5 && newCode.every((digit) => digit !== "")) {
      handleVerify(newCode.join(""));
    }
  };

  // 1. ÇÖZÜM: Silme işlemi güncellendi
  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === "Backspace") {
      // Eğer mevcut kutu boşsa ve ilk kutuda değilsek
      if (code[index] === "" && index > 0) {
        // Önceki kutunun içeriğini anında sil ve ona odaklan
        const newCode = [...code];
        newCode[index - 1] = "";
        setCode(newCode);
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleVerify = async (verificationCode = null) => {
    const finalCode = verificationCode || code.join("");

    if (finalCode.length !== 6) {
      setError("Lütfen 6 haneli kodu girin");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await authService.verifyEmailCode(email, finalCode);

      if (response.isSuccess) {
        dispatch(
          setUser({
            isVerified: true,
            isMailVerified: true,
          }),
        );
        dispatch(clearVerification());
      } else {
        setError(response.message || "Doğrulama başarısız");
      }
    } catch (err) {
      console.error("❌ Verification error:", err);
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
      const response = await authService.resendVerification(email);

      if (response.isSuccess) {
        setResendSuccess(true);
        setCountdown(60);
        setTimeout(() => setResendSuccess(false), 3000);
      } else {
        setError(response.message || "Kod gönderilemedi");
      }
    } catch (err) {
      console.error(
        "❌ Resend error:",
        err.response?.data?.message || err.message,
      );
      setError(err.response?.data?.message || "Kod gönderilemedi");
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoBack = () => {
    if (isLoggingOut) return;

    if (isAuthenticated) {
      setIsLoggingOut(true);
      dispatch(logout());
    } else {
      dispatch(clearVerification());
      navigation.goBack();
    }
  };

  return (
    // 2. ÇÖZÜM: KeyboardAvoidingView kaldırıldı, yerine standart View eklendi
    <View className="flex-1 bg-[#121212] -mt-[100px]">
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 justify-center px-6 py-12">
          {/* Header */}
          <View className="items-center flex flex-col gap-10 p-8">
            <Mailbox
              strokeWidth={1.5}
              size={100}
              color="#fff"
              className="mb-4"
            />
            <View>
              <Text className="text-3xl font-bold text-white mb-2 text-center">
                E-Mail'ini doğrula.
              </Text>
              <Text className="text-white/80 text-lg text-center px-4">
                Bu adrese gönderilen 6 haneli kodu girin
              </Text>
              <View
                style={{ borderCurve: "continuous" }}
                className="border-[0.5px] border-white/15 items-center flex-row justify-center mt-4 py-3 px-4 rounded-full overflow-hidden self-center"
              >
                <Text
                  style={{ borderCurve: "continuous" }}
                  className="text-white text-lg text-center px-4"
                >
                  {email}
                </Text>
              </View>
            </View>
          </View>

          {/* Verification Form */}
          <View className="">
            {/* Success Message */}
            {resendSuccess && (
              <View className="bg-green-100 border border-green-400 rounded-2xl p-4 mb-6">
                <Text className="text-green-700 text-sm text-center">
                  ✅ Kod başarıyla gönderildi!
                </Text>
              </View>
            )}

            {/* Code Input */}
            <View className="flex-row justify-between mb-8 p-8 py-4">
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (inputRefs.current[index] = ref)}
                  // className içine hata kontrolü eklendi: error varsa kırmızı border ekle
                  className={`w-12 h-16 bg-[#1e1e1e] text-white rounded-[15px] text-center text-2xl font-medium p-0 ${
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
            {/* Resend Code */}
            <View
              style={{ borderCurve: "continuous" }}
              className="flex-row mb-3 justify-center items-center py-[15px] pt-0 rounded-full overflow-hidden"
            >
              <TouchableOpacity
                onPress={handleResend}
                disabled={resendLoading || countdown > 0}
              >
                {resendLoading ? (
                  <ActivityIndicator className="" size="small" color="#fff" />
                ) : countdown > 0 ? (
                  <View className="flex-row  items-center gap-2">
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

            {/* Verify Button */}
            <TouchableOpacity
              style={{
                borderCurve: "continuous",
                opacity:
                  loading || code.some((digit) => digit === "") ? 0.5 : 1,
              }}
              onPress={() => handleVerify()}
              disabled={loading || code.some((digit) => digit === "")}
              className="rounded-full overflow-hidden"
            >
              <LinearGradient
                colors={["#fc5a26", "#fc4526"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className=" items-center"
              >
                {loading ? (
                  <ActivityIndicator className="py-[20px]" color="#fff" />
                ) : (
                  <Text className="text-white py-[20px] text-center font-medium text-[15px]">
                    Doğrula
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Back to Login */}
          <View className="flex-row justify-center mt-8">
            <Text className="text-gray-300">Yanlış email mi? </Text>
            <TouchableOpacity onPress={handleGoBack}>
              <Text className="text-white font-medium">Geri Dön</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  );
}
