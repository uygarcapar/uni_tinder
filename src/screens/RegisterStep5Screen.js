import React, { useEffect, useRef } from "react";
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
import {
  updateRegistrationField,
  register,
  clearError,
} from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";

export default function RegisterStep5Screen({ navigation }) {
  const dispatch = useDispatch();
  const formData = useSelector((state) => state.auth.registrationForm);
  const { loading, error, needsVerification, pendingVerificationEmail } =
    useSelector((state) => state.auth);
  const inputRef = useRef(null);
  const hasNavigatedToVerification = useRef(false);

  const updateField = (field, value) => {
    dispatch(updateRegistrationField({ field, value }));
    // Kullanıcı yazmaya başladığında hatayı temizle
    if (error) {
      dispatch(clearError());
    }
  };

  useEffect(() => {
    // Only navigate to EmailVerification after successful registration
    // Use ref to prevent re-navigation when coming back from EmailVerification
    console.log('📧 RegisterStep5: needsVerification =', needsVerification);
    console.log('📧 RegisterStep5: hasNavigatedToVerification =', hasNavigatedToVerification.current);

    if (needsVerification && pendingVerificationEmail && !hasNavigatedToVerification.current) {
      console.log('📧 RegisterStep5: Navigating to EmailVerification');
      hasNavigatedToVerification.current = true;
      // Don't clear form - keep data so user can go back and modify email
      navigation.navigate("EmailVerification", {
        email: pendingVerificationEmail,
      });
    }

    // Reset ref when needsVerification becomes false (user went back from EmailVerification)
    if (!needsVerification && hasNavigatedToVerification.current) {
      console.log('📧 RegisterStep5: Resetting navigation flag');
      hasNavigatedToVerification.current = false;
    }
  }, [needsVerification, pendingVerificationEmail]);

  const handleRegister = async () => {
    if (!formData.email) {
      alert("Lütfen üniversite email adresinizi girin");
      return;
    }

    const registrationData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      dateOfBirth: formData.dateOfBirth, // Already an ISO string
      gender: formData.gender, // Already a number (0, 1, or 2)
      email: formData.email,
      password: formData.password,
      universityDomain: "",
      universityName: "",
      phoneNumber: formData.phoneNumber,
      emailVerifiedAt: null,
      lastVerificationCheck: null,
      isUniversityVerified: false,
      role: null,
    };

    console.log(
      "Registration Request Data:",
      JSON.stringify(registrationData, null, 2),
    );

    await dispatch(register(registrationData));
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

      {/* Content */}
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">
              Üniversite E-Maili
            </Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Üniversite e-mail adresin, öğrenci olduğunu doğrulamamıza yardımcı
              olur. Bu kısım zorunlu.
            </Text>
          </View>

          <TextInput
            ref={inputRef}
            className={`border rounded-2xl px-4 py-3.5 text-[18px] text-white ${
              error ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="edu.tr"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
            autoCapitalize="none"
            value={formData.email}
            onChangeText={(v) => updateField("email", v)}
          />

          {error && (
            <View className="mt-3 px-2 rounded-lg">
              <Text className="text-red-700">{error}</Text>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleRegister}
            disabled={loading}
            className="rounded-full overflow-hidden"
          >
            <LinearGradient
              colors={["#fc0d35", "#fc0335"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              {loading ? (
                <ActivityIndicator className="py-[13.5px]" color="#fff" />
              ) : (
                <Text className="text-white py-[16px] font-bold text-[15px] text-center">
                  Kayıt Ol
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
