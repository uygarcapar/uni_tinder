import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  updateMultipleFields,
  registerAndComplete,
} from "../store/slices/profileSlice";
import {
  setUserAndToken,
  clearRegistrationForm,
} from "../store/slices/authSlice";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { Plus, X } from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  runOnJS,
} from "react-native-reanimated";

import ImageCropPicker from "react-native-image-crop-picker";

const { width } = Dimensions.get("window");
const CONTAINER_PADDING = 24; // px-6
const AVAILABLE_WIDTH = width - CONTAINER_PADDING * 2;
const ITEM_WIDTH = AVAILABLE_WIDTH * 0.48;
const ITEM_HEIGHT = ITEM_WIDTH * (4 / 3);
const HORIZONTAL_GAP = AVAILABLE_WIDTH - ITEM_WIDTH * 2;
const ROW_GAP = 20;
const SPRING_CONFIG = { damping: 22, stiffness: 140, mass: 1.4 };

const getPosition = (index) => {
  "worklet";
  return {
    x: (index % 2) * (ITEM_WIDTH + HORIZONTAL_GAP),
    y: Math.floor(index / 2) * (ITEM_HEIGHT + ROW_GAP),
  };
};

const getOrder = (tx, ty, maxIndex) => {
  "worklet";
  const col = Math.round(tx / (ITEM_WIDTH + HORIZONTAL_GAP));
  const row = Math.round(ty / (ITEM_HEIGHT + ROW_GAP));
  return Math.max(0, Math.min(row * 2 + col, maxIndex));
};

function SortablePhoto({
  id,
  index,
  positions,
  maxIndex,
  children,
  onDragStart,
  onDragEnd,
  disabled = false,
}) {
  const isDragging = useSharedValue(false);
  const position = getPosition(index);

  const translateX = useSharedValue(position.x);
  const translateY = useSharedValue(position.y);

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  useAnimatedReaction(
    () => positions.value[id],
    (newIndex) => {
      if (!isDragging.value && newIndex !== undefined) {
        const pos = getPosition(newIndex);
        translateX.value = withSpring(pos.x, SPRING_CONFIG);
        translateY.value = withSpring(pos.y, SPRING_CONFIG);
      }
    },
  );

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .onStart(() => {
      isDragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(onDragStart)();
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
      translateY.value = startY.value + event.translationY;

      const newIndex = getOrder(translateX.value, translateY.value, maxIndex);
      const oldIndex = positions.value[id];

      if (newIndex !== oldIndex && newIndex !== undefined) {
        const newPositions = { ...positions.value };
        for (const key in newPositions) {
          if (newPositions[key] === newIndex) {
            newPositions[key] = oldIndex;
            break;
          }
        }
        newPositions[id] = newIndex;
        positions.value = newPositions;
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      const finalPos = getPosition(positions.value[id]);
      translateX.value = withSpring(finalPos.x, SPRING_CONFIG);
      translateY.value = withSpring(finalPos.y, SPRING_CONFIG, () => {
        runOnJS(onDragEnd)(positions.value);
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: withSpring(isDragging.value ? 1.05 : 1, SPRING_CONFIG) },
    ],
    zIndex: isDragging.value ? 100 : 0,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

function PhotoCard({ photo, onRemove }) {
  return (
    <View style={{ width: "100%", height: "100%" }}>
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 32,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: "#1E1E1E",
        }}
      >
        <Image
          source={{ uri: photo }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onRemove}
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          borderRadius: 999,
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          backgroundColor: "#1E1E1E",
          borderWidth: 0.4,
          borderColor: "#696b70",
        }}
      >
        <View pointerEvents="none">
          <X size={16} strokeWidth={3} color="#7a7d82" />
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default function RegisterStep15Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});
  const loading = useSelector((state) => state.profile.loading);

  const [photos, setPhotos] = useState(profile.photos || []);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [error, setError] = useState("");
  const positions = useSharedValue({});

  useEffect(() => {
    const newPositions = {};
    photos.forEach((photo, i) => {
      newPositions[photo] = i;
    });
    positions.value = newPositions;
  }, [photos]);

  // Geri stepe gidip dönünce fotolar kaybolmasın diye redux'a sync et
  useEffect(() => {
    dispatch(updateMultipleFields({ photos }));
  }, [photos, dispatch]);

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

  const removePhoto = (photoToRemove) => {
    setPhotos((prev) => prev.filter((p) => p !== photoToRemove));
  };

  const handleDragStart = () => {
    setIsDraggingPhoto(true);
  };

  const handleDragEnd = (newPositions) => {
    setIsDraggingPhoto(false);
    const newOrder = [...photos].sort(
      (a, b) => newPositions[a] - newPositions[b],
    );
    const isChanged = newOrder.some((p, i) => p !== photos[i]);
    if (isChanged) {
      setPhotos(newOrder);
    }
  };

  const handleCompleteProfile = async () => {
    setError("");
    if (photos.length < 2) {
      setError("Lütfen en az 2 fotoğraf yükleyin");
      return;
    }

    console.log(
      "📤 Profile data before submit:",
      JSON.stringify(profile, null, 2),
    );
    console.log("📤 Photos count:", photos.length);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Konum izni verilmedi. Profil tamamlanamadı.");
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const response = await dispatch(
        registerAndComplete({
          photos,
          mainPhotoIndex: 0,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }),
      ).unwrap();

      if (!response?.isSuccess) {
        setError(response?.message || "Kayıt tamamlanırken bir hata oluştu");
        return;
      }

      // Save tokens + user — AppNavigator will switch to MainNavigator automatically
      dispatch(
        setUserAndToken({
          user: response.result.user,
          token: response.result.token,
          refreshToken: response.result.refreshToken,
        }),
      );
      dispatch(clearRegistrationForm());
    } catch (err) {
      console.log("❌ CompleteProfile error:", err);
      const message =
        typeof err === "string"
          ? err
          : err?.message || "Profil tamamlanırken bir hata oluştu";
      setError(message);
    }
  };

  // Grid layout calculations
  const totalSlots = photos.length + (photos.length < 6 ? 1 : 0);
  const numRows = Math.max(1, Math.ceil(totalSlots / 2));
  const containerHeight = numRows * ITEM_HEIGHT + (numRows - 1) * ROW_GAP;
  const addPos = getPosition(photos.length);

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

      <RegisterProgressBar step={15} />

      <ScrollView
        className="flex-1 px-6 py-6 pt-0"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex flex-col gap-2 mb-6">
          <Text className="text-4xl font-bold text-white">
            Fotoğrafların {photos.length}/6
          </Text>
          <Text className="text-[18px] font-normal text-gray-400">
            Sıralamayı değiştirmek için fotoğrafları birbirinin üzerine sürükle.
            İlk sıradaki ana profil fotoğrafındır.
          </Text>
          {error ? (
            <Text className="text-red-500 text-[14px] font-normal mt-2">
              {error}
            </Text>
          ) : null}
        </View>

        {/* Grid */}
        <View
          style={{
            height: containerHeight,
            position: "relative",
            marginBottom: 40,
          }}
        >
          {photos.map((photo, index) => (
            <SortablePhoto
              key={photo}
              id={photo}
              index={index}
              positions={positions}
              maxIndex={photos.length - 1}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              disabled={loading}
            >
              <PhotoCard
                photo={photo}
                onRemove={loading ? undefined : () => removePhoto(photo)}
              />
            </SortablePhoto>
          ))}

          {photos.length < 6 && (
            <View
              style={{
                position: "absolute",
                left: addPos.x,
                top: addPos.y,
                width: ITEM_WIDTH,
                height: ITEM_HEIGHT,
              }}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={pickImage}
                disabled={loading}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 32,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  borderWidth: 0.5,
                  borderColor: "rgba(255,255,255,0.1)",
                  backgroundColor: "#1E1E1E",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <View pointerEvents="none">
                  <Plus size={40} strokeWidth={2} color="#6B7280" />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable
          onPress={handleCompleteProfile}
          disabled={loading || photos.length < 2 || isDraggingPhoto}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            opacity:
              loading || photos.length < 2 || isDraggingPhoto ? 0.5 : 1,
          }}
        >
          <LinearGradient
            colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
            locations={[0, 0.35, 0.85]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="py-3.5"
          >
            {loading ? (
              <View className="py-[18px]">
                <ActivityIndicator color="#000" />
              </View>
            ) : (
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                Profili Tamamla
              </Text>
            )}
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}
