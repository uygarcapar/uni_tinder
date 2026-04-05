import React, { useState } from "react";
import { View, Text, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import * as Clipboard from "expo-clipboard";
import { logout } from "../store/slices/authSlice";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";

export default function ProfileScreen() {
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleCopyUserId = async () => {
    if (user?.userId) {
      await Clipboard.setStringAsync(user.userId);
      Alert.alert("Kopyalandı", "User ID panoya kopyalandı");
    }
  };

  const handleDeleteAccount = async () => {
    if (!password.trim()) {
      Alert.alert("Hata", "Lütfen şifrenizi girin");
      return;
    }

    setDeleteLoading(true);
    try {
      console.log("🗑️ Deleting account...");
      console.log("📍 URL:", `${API_BASE_URL}${API_ENDPOINTS.DELETE_ACCOUNT}`);
      console.log("🔑 Token:", token ? "✓ Available" : "✗ Missing");
      console.log("👤 User ID:", user?.userId);

      const requestBody = {
        userId: user?.userId,
        password: password,
      };
      console.log("📦 Request body:", JSON.stringify(requestBody, null, 2));

      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.DELETE_ACCOUNT}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      console.log("📡 Response status:", response.status);

      const data = await response.json();
      console.log("📦 API Response:", JSON.stringify(data, null, 2));

      if (response.ok && data.isSuccess) {
        console.log("✅ Account deleted successfully");
        Alert.alert("Başarılı", "Hesabınız silindi", [
          {
            text: "Tamam",
            onPress: () => {
              setShowDeleteModal(false);
              setPassword("");
              dispatch(logout());
            },
          },
        ]);
      } else {
        console.log("❌ Delete failed:", data.message);
        Alert.alert("Hata", data.message || "Hesap silinemedi");
      }
    } catch (error) {
      console.error("❌ Delete account error:", error);
      Alert.alert("Hata", "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Hesabı Sil",
      "Hesabınızı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.",
      [
        {
          text: "İptal",
          style: "cancel",
        },
        {
          text: "Devam Et",
          style: "destructive",
          onPress: () => setShowDeleteModal(true),
        },
      ]
    );
  };

  return (
    <View className="flex-1 bg-[#121212] p-6">
      <View className="mt-8">
        <Text className="text-3xl font-bold text-white mb-2">
          {user?.firstName} {user?.lastName}
        </Text>
        <Text className="text-gray-300 mb-2">{user?.email}</Text>
        <TouchableOpacity onPress={handleCopyUserId} activeOpacity={0.7}>
          <Text className="text-gray-400 text-[16px] mb-8">
            User ID: {user?.userId} (Kopyalamak için bas)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-500 rounded-2xl py-4 items-center mt-4"
        >
          <Text className="text-white font-bold text-lg">Çıkış Yap</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={confirmDelete}
          className="bg-gray-800 border border-red-500 rounded-2xl py-4 items-center mt-4"
        >
          <Text className="text-red-500 font-bold text-lg">Hesabı Sil</Text>
        </TouchableOpacity>
      </View>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center px-6">
          <View className="bg-[#1E1E1E] rounded-3xl p-6 w-full">
            <Text className="text-white text-2xl font-bold mb-2">
              Hesabı Sil
            </Text>
            <Text className="text-gray-400 text-[16px] mb-6">
              Hesabınızı silmek için şifrenizi girin
            </Text>

            <TextInput
              className="border border-gray-600 rounded-2xl px-4 py-3.5 text-[18px] text-white mb-6"
              placeholder="Şifreniz"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={true}
              editable={!deleteLoading}
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowDeleteModal(false);
                  setPassword("");
                }}
                className="flex-1 bg-gray-700 rounded-2xl py-3.5 items-center"
                disabled={deleteLoading}
              >
                <Text className="text-white font-bold text-[16px]">İptal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDeleteAccount}
                className="flex-1 bg-red-500 rounded-2xl py-3.5 items-center"
                disabled={deleteLoading}
              >
                <Text className="text-white font-bold text-[16px]">
                  {deleteLoading ? "Siliniyor..." : "Sil"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
