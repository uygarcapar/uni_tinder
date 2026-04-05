import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  updateMultipleFields,
  completeProfile,
} from "../store/slices/profileSlice";
import { setProfileCompleted, setUser } from "../store/slices/authSlice";
import * as Location from "expo-location";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, X } from "lucide-react-native";
import { DraxProvider, DraxView } from "react-native-drax";

import ImageCropPicker from "react-native-image-crop-picker";

export default function CompleteProfileStep7Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});
  const loading = useSelector((state) => state.profile.loading);

  const [photos, setPhotos] = useState(profile.photos || []);
  const [receivingIndex, setReceivingIndex] = useState(null);

  const pickImage = async () => {
    const remainingSlots = 6 - photos.length;
    if (remainingSlots <= 0) {
      Alert.alert("Hata", "En fazla 6 fotoğraf ekleyebilirsiniz");
      return;
    }

    try {
      const selectedImages = await ImageCropPicker.openPicker({
        multiple: true,
        maxFiles: remainingSlots,
        mediaType: "photo",
      });

      const newCroppedPhotos = [];

      for (const image of selectedImages) {
        try {
          const croppedImage = await ImageCropPicker.openCropper({
            path: image.path,
            width: 900,
            height: 1200,
            cropperToolbarTitle: "Fotoğrafı Düzenle",
            cropperChooseText: "Seç",
            cropperCancelText: "İptal",
          });

          newCroppedPhotos.push(croppedImage.path);
        } catch (cropError) {
          console.log("Bu fotoğrafın kırpılması iptal edildi.");
        }
      }

      if (newCroppedPhotos.length > 0) {
        setPhotos((prev) => [...prev, ...newCroppedPhotos]);
      }
    } catch (error) {
      console.log("Galeri seçimi iptal edildi:", error);
    }
  };

  const removePhoto = (indexToRemove) => {
    const newPhotos = photos.filter((_, index) => index !== indexToRemove);
    setPhotos(newPhotos);
  };

  const handleReceiveDragDrop = (event, targetIndex) => {
    setReceivingIndex(null);

    const draggedIndex = event.dragged.payload;

    if (draggedIndex !== targetIndex) {
      const newPhotos = [...photos];
      const temp = newPhotos[targetIndex];
      newPhotos[targetIndex] = newPhotos[draggedIndex];
      newPhotos[draggedIndex] = temp;

      setPhotos(newPhotos);
    }
  };

  const handleCompleteProfile = async () => {
    if (photos.length < 2) {
      alert("Lütfen en az 2 fotoğraf yükleyin");
      return;
    }

    // Log profile data to check what's being sent
    console.log(
      "📤 Profile data before submit:",
      JSON.stringify(profile, null, 2),
    );
    console.log("📤 Photos count:", photos.length);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        alert("Konum izni verilmedi. Profil tamamlanamadı.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const completeProfileData = {
        ...profile,
        photos,
        mainPhotoIndex: 0,
      };

      dispatch(updateMultipleFields(completeProfileData));

      const response = await dispatch(
        completeProfile({
          profileData: completeProfileData,
          photos,
          mainPhotoIndex: 0,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
      ).unwrap();

      console.log(
        "✅ Profile completed - Full response:",
        JSON.stringify(response, null, 2),
      );
      console.log("✅ Response.result:", response.result);
      console.log("✅ Response.isSuccess:", response.isSuccess);
      console.log("✅ Response.statusCode:", response.statusCode);

      // Check if backend returned success
      if (!response.isSuccess || response.statusCode !== 200) {
        console.log("❌ Backend returned error despite HTTP 200");
        alert(response.message || "Profil tamamlanırken bir hata oluştu");
        return;
      }

      // CompleteProfile response contains updated user data with isProfileCreated: true
      if (response.result?.user) {
        console.log("✅ Updating user from CompleteProfile response");
        console.log(
          "✅ User object:",
          JSON.stringify(response.result.user, null, 2),
        );
        console.log(
          "✅ isProfileCreated from response:",
          response.result.user.isProfileCreated,
        );
        dispatch(setUser(response.result.user));
      } else {
        // Fallback: manually set isProfileCreated
        console.log("⚠️ No user in response.result.user");
        console.log(
          "⚠️ response.result structure:",
          JSON.stringify(response.result, null, 2),
        );
        dispatch(setProfileCompleted());
      }

      navigation.replace("HomeTabs");
    } catch (error) {
      console.log("❌ CompleteProfile error:", error);
      alert("Profil tamamlanırken bir hata oluştu");
    }
  };

  // 1. DÜZELTME: Izgaradaki toplam eleman sayısını ve boşluk doldurucu ihtiyacını hesapla
  const totalItems = photos.length + (photos.length < 6 ? 1 : 0);
  const needsGhostView = totalItems % 2 !== 0;

  return (
    <DraxProvider>
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

        <ScrollView
          className="flex-1 px-6 py-6 pt-0"
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex flex-col gap-2 mb-6">
            <Text className="text-4xl font-bold text-white">
              Fotoğrafların {photos.length}/6
            </Text>
            <Text className="text-[18px] font-normal text-gray-400">
              Sıralamayı değiştirmek için fotoğrafları birbirinin üzerine
              sürükle. İlk sıradaki ana profil fotoğrafındır.
            </Text>
          </View>

          {/* FOTOĞRAFLAR VE EKLE BUTONU (Grid) */}
          <View className="flex-row flex-wrap justify-between gap-y-5 mb-10">
            {photos.map((photo, index) => {
              const isFirst = index === 0;
              const isReceivingThis = receivingIndex === index;

              return (
                <DraxView
                  key={`photo-${index}-${photo}`}
                  payload={index}
                  longPressDelay={150}
                  draggingStyle={{ opacity: 0.2 }}
                  dragReleasedStyle={{ opacity: 0.5 }}
                  onReceiveDragEnter={() => setReceivingIndex(index)}
                  onReceiveDragExit={() => setReceivingIndex(null)}
                  onReceiveDragDrop={(event) =>
                    handleReceiveDragDrop(event, index)
                  }
                  style={{
                    width: "48%",
                    aspectRatio: 3 / 4,
                  }}
                  className="relative items-center justify-center z-10"
                >
                  <View
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 32,
                      borderCurve: "continuous",
                      overflow: "hidden",
                    }}
                    className="bg-[#1E1E1E]"
                  >
                    {isReceivingThis && (
                      <View
                        className="absolute top-0 left-0 right-0 bottom-0 bg-black/40 z-20"
                        pointerEvents="none"
                      />
                    )}

                    <Image
                      source={{ uri: photo }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />

                    {/* {isFirst && (
                      <View className="absolute bottom-3 self-center bg-black/70 rounded-full px-3 py-1.5 z-30">
                        <Text className="text-white text-[10px] font-bold">
                          Ana Fotoğraf
                        </Text>
                      </View>
                    )} */}
                  </View>

                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 rounded-full w-8 h-8 items-center justify-center z-50 border border-[#696b70] bg-[#1E1E1E]"
                  >
                    <View pointerEvents="none">
                      <X size={16} strokeWidth={3} color="#7a7d82" />
                    </View>
                  </TouchableOpacity>
                </DraxView>
              );
            })}

            {/* FOTOĞRAF EKLEME BUTONU */}
            {photos.length < 6 && (
              // 2. DÜZELTME: Boyutu korumak için sabit bir View içerisine aldık.
              <View style={{ width: "48%", aspectRatio: 3 / 4 }}>
                <TouchableOpacity
                  activeOpacity={1}
                  className="border-[0.5px] border-white/10 bg-[#1E1E1E] items-center justify-center w-full h-full"
                  style={{
                    borderRadius: 32,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                  onPress={pickImage}
                >
                  <View
                    pointerEvents="none"
                    className="items-center justify-center"
                  >
                    <Plus size={40} strokeWidth={2} color="#6B7280" />
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Hayalet Kutu (Sıralama kaymasın diye) */}
            {needsGhostView && (
              <View style={{ width: "48%", aspectRatio: 3 / 4 }} />
            )}
          </View>
        </ScrollView>

        {/* Sticky Button */}
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View className="px-8 pb-8 pt-4 bg-[#121212]">
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleCompleteProfile}
              disabled={loading || photos.length < 2}
              className="rounded-full overflow-hidden"
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <LinearGradient
                colors={
                  loading || photos.length < 2
                    ? ["#9CA3AF", "#6B7280"]
                    : ["#fc0e26", "#fc0326"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                className="py-3.5"
              >
                {loading ? (
                  <View className="py-[20px]">
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : (
                  <Text className="text-white py-[20px] font-bold text-[15px] text-center">
                    Profili Tamamla
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      </View>
    </DraxProvider>
  );
}
