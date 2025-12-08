import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';

export default function HomeScreen() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = () => {
    dispatch(logout());
  };

  return (
    <View className="flex-1 bg-white items-center justify-center p-6">
      <View className="bg-gradient-to-br from-purple-100 to-pink-100 rounded-3xl p-8 w-full">
        <Text className="text-3xl font-bold text-purple-600 mb-4 text-center">
          🎉 Hoş Geldin!
        </Text>
        <Text className="text-xl text-gray-700 text-center mb-2">
          {user?.firstName} {user?.lastName}
        </Text>
        <Text className="text-gray-600 text-center mb-8">{user?.email}</Text>

        <View className="bg-white rounded-2xl p-6 mb-6">
          <Text className="text-gray-700 text-center">
            Profilin henüz tamamlanmamış. Profil tamamlama ekranı yakında
            eklenecek!
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          className="bg-red-500 rounded-2xl py-4 items-center"
        >
          <Text className="text-white font-bold text-lg">Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
