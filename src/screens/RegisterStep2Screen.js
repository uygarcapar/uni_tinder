import React, { useState } from "react";
import { View, Text, TouchableOpacity, Platform, TouchableWithoutFeedback, Keyboard } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import DateTimePicker from "@react-native-community/datetimepicker";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faCalendar } from "@fortawesome/free-regular-svg-icons";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";

export default function RegisterStep2Screen({ navigation }) {
  const dispatch = useDispatch();

  // Redux'tan gelen tarih string'ini Date objesine çevir
  const dateOfBirthString = useSelector(
    (state) => state.auth.registrationForm.dateOfBirth,
  );
  const dateOfBirth = new Date(dateOfBirthString);

  const [showDatePicker, setShowDatePicker] = useState(true);

  // Hata mesajı için state
  const [error, setError] = useState("");

  const updateField = (field, value) => {
    dispatch(updateRegistrationField({ field, value }));
  };

  // Yaş Hesaplama Fonksiyonu
  const calculateAge = (dob) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();

    // Eğer doğum ayı henüz gelmediyse veya doğum ayında ama günü gelmediyse yaşı 1 düşür
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleNext = () => {
    const age = calculateAge(dateOfBirth);

    if (age < 18) {
      setError("Uygulamayı kullanabilmek için 18 yaşından büyük olmalısın.");
      return; // Fonksiyonu burada durdur, sayfayı değiştirme
    }

    // Yaş uygunsa hatayı temizle ve devam et
    setError("");
    navigation.navigate("RegisterStep3");
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
          <View className="flex-1">
            <View className="flex flex-col gap-2">
              <Text className="text-4xl font-bold text-white">Yaşını gir.</Text>
              <Text className="text-[18px] font-normal text-gray-400 mb-6">
                Doğum tarihin, doğru eşleşmeler bulmamıza yardımcı olur.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className={`border rounded-2xl px-4 py-3.5 flex-row items-center justify-between ${
                error ? "border-red-500" : "border-gray-300"
              }`}
            >
              <Text className="text-[18px] text-white">
                {dateOfBirth.toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <FontAwesomeIcon size={20} icon={faCalendar} color="#fff" />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={dateOfBirth}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                themeVariant="dark"
                textColor="#FFFFFF"
                onChange={(_, selectedDate) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    // Date objesini ISO string'e çevir ve Redux'a kaydet
                    updateField("dateOfBirth", selectedDate.toISOString());
                    setError(""); // Tarih değişince eski hata mesajını sil
                  }
                }}
                maximumDate={new Date()}
                minimumDate={new Date(1950, 0, 1)}
              />
            )}

            {error ? (
              <Text className="text-red-500 text-center font-normal mb-3 mt-4">
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* Sticky Button with KeyboardStickyView */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-6 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleNext}
            className="rounded-full overflow-hidden"
          >
            <LinearGradient
              colors={["#fc4826", "#fc2f26"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              className="py-3.5"
            >
              <Text className="text-white py-[16px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
