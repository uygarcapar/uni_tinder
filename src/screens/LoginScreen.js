import React, { useState } from "react";
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
import { login, fetchUserData } from "../store/slices/authSlice";
import { Eye, EyeOff } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardStickyView } from "react-native-keyboard-controller";

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Lütfen tüm alanları doldurun");
      return;
    }

    try {
      const result = await dispatch(login({ email, password })).unwrap();

      // Fetch updated user data after successful login
      const userId = result.user?.userId || result.user?.id;
      const token = result.token;

      if (userId && token) {
        dispatch(fetchUserData({ userId, token }));
      }
    } catch (error) {
      console.log("Login error:", error);
    }
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

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Giriş Yap.</Text>

            {/* Error Message */}
            {error ? (
              <View className="mt-2">
                <Text className="text-[18px] font-normal text-red-500 mb-6">
                  {error}.
                </Text>
              </View>
            ) : (
              <Text className="text-[18px] font-normal text-gray-400 mb-6 mt-2">
                Giriş yapmak için E-Mail ve şifreni kullan.
              </Text>
            )}
          </View>

          {/* Email Input */}
          <View className="mb-4">
            <Text className="text-white text-lg font-semibold mb-2">
              E-Mail
            </Text>
            <TextInput
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className={`border-[0.5px] px-4 py-5 text-[18px] text-white ${
                error ? "border-red-500" : "border-white/10 "
              }`}
              placeholder="ornek@universite.edu.tr"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-white text-lg font-semibold mb-2">Şifre</Text>
            <View
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
              className={`border-[0.5px] px-4 py-[14.5px] flex-row items-center ${
                error ? "border-red-500" : "border-white/10"
              }`}
            >
              <TextInput
                className="flex-1 text-[18px] text-white"
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!loading}
              />
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowPassword(!showPassword)}
                className=""
              >
                <View pointerEvents="none">
                  {showPassword ? (
                    <Eye size={24} strokeWidth={1.5} color="#D1D5DB" />
                  ) : (
                    <EyeOff size={24} strokeWidth={1.5} color="#D1D5DB" />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity activeOpacity={1} className="mb-4">
            <Text className="font-normal text-gray-400 text-[15px]">
              Şifreni mi unutttun?{" "}
              <Text className="font-semibold underline text-white">
                Buradan sıfırla
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleLogin}
            disabled={loading}
            className="rounded-full overflow-hidden"
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#fc5a26", "#fc4526"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              {loading ? (
                <ActivityIndicator className="py-[20px]" color="#fff" />
              ) : (
                <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                  Giriş Yap
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
