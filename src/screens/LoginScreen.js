import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { login, clearError } from "../store/slices/authSlice";

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

    dispatch(login({ email, password }));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-2 py-12 bg-white">
          {/* Logo/Title Section */}
          <View className="items-center mb-12">
            <Text className="text-5xl font-bold text-black mb-2">
              Uni Tinder
            </Text>
          </View>

          {/* Login Form */}
          <View className="bg-white rounded-3xl p-8">
            <Text className="text-2xl font-bold text-gray-800 mb-6">
              Giriş Yap
            </Text>

            {/* Error Message */}
            {error && (
              <View className="bg-red-100 border border-red-400 rounded-2xl p-4 mb-4">
                <Text className="text-red-700 text-sm">{error}</Text>
              </View>
            )}

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-gray-700 font-semibold mb-2">Email</Text>
              <TextInput
                className="bg-gray-100 rounded-2xl px-4 py-4 text-gray-800"
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
              <Text className="text-gray-700 font-semibold mb-2">Şifre</Text>
              <View className="relative">
                <TextInput
                  className="bg-gray-100 rounded-2xl px-4 py-4 text-gray-800 pr-12"
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-4"
                >
                  <Text className="text-2xl">{showPassword ? "👁️" : "🙈"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity className="mb-6">
              <Text className="text-purple-600 font-semibold text-right">
                Şifremi Unuttum
              </Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              className={`${
                loading ? "bg-purple-400" : "bg-purple-600"
              } rounded-2xl py-4 items-center shadow-lg`}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">Giriş Yap</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View className="flex-row items-center my-6">
              <View className="flex-1 h-px bg-gray-300" />
              <Text className="px-4 text-gray-500">veya</Text>
              <View className="flex-1 h-px bg-gray-300" />
            </View>

            {/* Social Login Buttons */}
            <View className="space-y-3">
              <TouchableOpacity className="bg-blue-600 rounded-2xl py-4 items-center flex-row justify-center">
                <Text className="text-2xl mr-2">📘</Text>
                <Text className="text-white font-semibold">
                  Facebook ile Devam Et
                </Text>
              </TouchableOpacity>

              <TouchableOpacity className="bg-white border-2 border-gray-300 rounded-2xl py-4 items-center flex-row justify-center">
                <Text className="text-2xl mr-2">🔍</Text>
                <Text className="text-gray-700 font-semibold">
                  Google ile Devam Et
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign Up Link */}
          <View className="flex-row justify-center mt-8">
            <Text className="text-black">Hesabın yok mu? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Register")}>
              <Text className="text-black font-bold underline">Kayıt Ol</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
