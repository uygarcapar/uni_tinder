import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "../components/RegisterProgressBar";

export default function RegisterStep6Screen({ navigation }) {
  const dispatch = useDispatch();
  const { password, confirmPassword } = useSelector(
    (state) => state.auth.registrationForm,
  );

  const passwordInputRef = useRef(null);
  const [error, setError] = useState("");

  const updateField = (field, value) => {
    dispatch(updateRegistrationField({ field, value }));
    // Kullanıcı yeni bir şey yazdığında hatayı temizle
    if (error) setError("");
  };

  /**
   * Şifre doğrulama kurallarını kontrol eder.
   * @param {string} pass - Kontrol edilecek şifre.
   * @returns {string | null} - Hata mesajı veya kural geçerliyse null.
   */
  const validatePasswordRules = (pass) => {
    // 1. Kural: En az 8 karakter
    if (pass.length < 8) {
      return "Şifreniz en az 8 karakter olmalıdır.";
    }
    // 2. Kural: En az 1 büyük harf
    if (!/[A-Z]/.test(pass)) {
      return "Şifreniz en az 1 büyük harf içermelidir.";
    }
    // 3. Kural: En az 1 rakam (0-9) (YENİ KURAL)
    if (!/[0-9]/.test(pass)) {
      return "Şifreniz en az 1 rakam (0-9) içermelidir.";
    }
    // 4. Kural: En az 1 özel karakter (YENİ KURAL)
    // Örnek özel karakterler: !@#$%^&*(),.?":{}|<>
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pass)) {
      return "Şifreniz en az 1 özel karakter içermelidir.";
    }

    return null;
  };

  const handleNext = () => {
    Keyboard.dismiss();
    // Önce boşluk kontrolü
    if (!password || !confirmPassword) {
      setError("Lütfen tüm şifre alanlarını doldurun.");
      return;
    }

    // Şifre kurallarını kontrol et
    const validationError = validatePasswordRules(password);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Şifreler eşleşiyor mu?
    if (password !== confirmPassword) {
      setError("Girdiğiniz şifreler birbiriyle eşleşmiyor.");
      return;
    }

    // Her şey tamamsa devam et
    setError("");
    navigation.navigate("RegisterStep7");
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={3} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">
              Şifreni oluştur.
            </Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Güçlü bir şifre, hesabını güvende tutmana yardımcı olur.
            </Text>
          </View>

          {/* Şifre Input */}
          <View className="mb-4">
            <Text className="text-gray-300 text-lg font-semibold mb-2">
              Şifre *
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: error ? "#ef4444" : "rgba(255,255,255,0.1)",
              }}
            >
              <TextInput
                ref={passwordInputRef}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  fontSize: 18,
                  color: "#fff",
                }}
                placeholder="En az 8 karakter"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={(v) => updateField("password", v)}
                secureTextEntry={true}
              />
            </View>
          </View>

          {/* Şifre Tekrar Input */}
          <View className="mb-4">
            <Text className="text-gray-300 text-lg font-semibold mb-2">
              Şifre Tekrar *
            </Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                borderWidth: 0.5,
                borderColor: error ? "#ef4444" : "rgba(255,255,255,0.1)",
              }}
            >
              <TextInput
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  fontSize: 18,
                  color: "#fff",
                }}
                placeholder="Şifrenizi tekrar girin"
                placeholderTextColor="#9CA3AF"
                value={confirmPassword}
                onChangeText={(v) => updateField("confirmPassword", v)}
                secureTextEntry={true}
              />
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
        <View className="px-6 pb-8 pt-4">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
          >
            <LinearGradient
              colors={["#fc4f26", "#fc3c26"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className=""
            >
              <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
