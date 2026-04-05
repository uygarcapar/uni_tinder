import React, { useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import turkey_flag from "../../assets/flags/turkey.png";

export default function RegisterStep4Screen({ navigation }) {
  const dispatch = useDispatch();
  const phoneInputRef = useRef(null);

  // Redux'tan gelen değer (eğer daha önce girildiyse)
  const storedPhoneNumber = useSelector(
    (state) => state.auth.registrationForm.phoneNumber,
  );

  // Telefon formatı fonksiyonu
  const formatPhoneNumber = (text) => {
    // 1. Sadece rakamları al
    const cleaned = text.replace(/\D/g, "");

    // 2. Maksimum 10 karakter (Başındaki 0'ı veya +90'ı almayacağız, sadece 5xx...)
    const match = cleaned.substring(0, 10);

    // 3. Parçalara böl: XXX XXX XX XX
    let formatted = match;
    if (match.length > 3) {
      formatted = `${match.slice(0, 3)} ${match.slice(3)}`;
    }
    if (match.length > 6) {
      formatted = `${formatted.slice(0, 7)} ${match.slice(6)}`;
    }
    if (match.length > 8) {
      formatted = `${formatted.slice(0, 10)} ${match.slice(8)}`;
    }

    return formatted;
  };

  const handleChangeText = (text) => {
    // Kullanıcının inputunu formatla
    const formatted = formatPhoneNumber(text);

    // Redux'a kaydederken başına +90 ekleyerek tam halini kaydediyoruz
    // Örnek Redux değeri: "+90 555 123 45 67"
    const fullNumber = formatted ? `+90 ${formatted}` : "";

    dispatch(
      updateRegistrationField({ field: "phoneNumber", value: fullNumber }),
    );
  };

  const handleNext = () => {
    // Basit validasyon: +90 hariç en az 10 rakam olmalı
    const justNumbers = storedPhoneNumber?.replace(/\D/g, "") || "";
    // +90 (2 rakam) + 10 rakam = 12 rakam olmalı toplamda
    if (justNumbers.length < 12) {
      alert("Lütfen geçerli bir telefon numarası girin");
      return;
    }
    navigation.navigate("RegisterStep5");
  };

  // Inputta gösterilecek değeri ayarla (+90 kısmını siliyoruz, çünkü onu statik gösterdik)
  const displayValue = storedPhoneNumber
    ? storedPhoneNumber.replace("+90 ", "").replace("+90", "")
    : "";

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
            <Text className="text-4xl font-bold text-white">İletişim</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Telefon numaran, hesabını güvende tutmana yardımcı olur. Numaranı
              kimse göremez.
            </Text>
          </View>

          {/* Telefon Input Alanı */}
          <Text className="text-white text-lg font-semibold mb-2">
            Telefon Numarası *
          </Text>

          <View className="flex-row items-center border border-gray-300 rounded-2xl px-4 py-3.5">
            {/* Sabit +90 Alanı */}
            <View className="flex-row items-center border-r border-gray-300 pr-3 mr-3">
              <Image
                source={turkey_flag}
                style={{ width: 20, height: 20, marginRight: 8 }}
                resizeMode="cover"
              />
              <Text className="text-[18px] text-white font-medium">+90</Text>
            </View>

            {/* Dinamik Input */}
            <TextInput
              ref={phoneInputRef}
              className="flex-1 text-[18px] text-white h-full"
              placeholder="5XX XXX XX XX"
              placeholderTextColor="#9CA3AF"
              keyboardType="number-pad"
              value={displayValue}
              onChangeText={handleChangeText}
              maxLength={13}
            />
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
              colors={["#fc2235", "#fc0d35"]}
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
