import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
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
import { register } from "../store/slices/authSlice";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";

// --- GORHOM & BLUR IMPORTS ---
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
// -----------------------------

export default function RegisterScreen({ navigation }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: new Date(2000, 0, 1),
    gender: "",
    phoneNumber: "",
    universityDomain: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- BOTTOM SHEET REF & STATE ---
  // Modal'ı kontrol etmek için ref kullanıyoruz
  const bottomSheetModalRef = useRef(null);
  const [tempGender, setTempGender] = useState("");

  // Modal'ın ne kadar yükseleceği (örn: %40)
  const snapPoints = useMemo(() => ["40%"], []);

  const dispatch = useDispatch();
  const { loading, error, needsVerification, pendingVerificationEmail } =
    useSelector((state) => state.auth);

  useEffect(() => {
    if (needsVerification && pendingVerificationEmail) {
      navigation.replace("EmailVerification", {
        email: pendingVerificationEmail,
      });
    }
  }, [needsVerification, pendingVerificationEmail]);

  const updateField = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  // --- MODAL FONKSİYONLARI ---

  // Modalı Aç
  const handlePresentModalPress = useCallback(() => {
    setTempGender(formData.gender || "");
    bottomSheetModalRef.current?.present();
  }, [formData.gender]);

  // Modalı Kapat (Kaydet)
  const confirmGenderSelection = () => {
    updateField("gender", tempGender);
    bottomSheetModalRef.current?.dismiss();
  };

  // Modalı Kapat (İptal)
  const cancelGenderSelection = () => {
    bottomSheetModalRef.current?.dismiss();
  };

  // --- CUSTOM BACKDROP (BLUR EFEKTİ BURADA) ---
  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={1} // Görünür kalsın (ama rengi şeffaf olacak)
        pressBehavior="close" // Tıklayınca kapansın
        // İŞTE ÇÖZÜM: Kendi siyah rengini transparan yapıyoruz 👇
        style={[props.style, { backgroundColor: "transparent" }]}
      >
        {/* Şimdi BlurView direkt arkadaki uygulamayı görebiliyor */}
        <BlurView
          style={{
            // Absolute fill ile tüm alanı kaplatıyoruz
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          intensity={30} // Blur şiddetini artırdım biraz daha belirgin olsun
          tint="dark" // "light" veya "dark" deneyebilirsin
        />
      </BottomSheetBackdrop>
    ),
    []
  );

  // ---------------------------------------------

  const getGenderLabel = () => {
    switch (formData.gender) {
      case "Male":
        return "Erkek";
      case "Female":
        return "Kadın";
      case "PreferNotToSay":
        return "Belirtmek İstemiyorum";
      default:
        return "Seçiniz";
    }
  };

  const validateStep = () => {
    switch (currentStep) {
      case 1:
        if (!formData.firstName || !formData.lastName) {
          alert("Lütfen ad ve soyad alanlarını doldurun");
          return false;
        }
        if (!formData.gender) {
          alert("Lütfen cinsiyetinizi seçin");
          return false;
        }
        return true;
      case 2:
        return true;
      case 3:
        if (!formData.password || !formData.confirmPassword) {
          alert("Lütfen şifre alanlarını doldurun");
          return false;
        }
        if (formData.password !== formData.confirmPassword) {
          alert("Şifreler eşleşmiyor");
          return false;
        }
        if (formData.password.length < 8) {
          alert("Şifre en az 8 karakter olmalıdır");
          return false;
        }
        return true;
      case 4:
        if (!formData.phoneNumber) {
          alert("Lütfen telefon numaranızı girin");
          return false;
        }
        return true;
      case 5:
        if (!formData.email) {
          alert("Lütfen üniversite email adresinizi girin");
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep()) {
      if (currentStep < 5) setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleRegister = async () => {
    if (!validateStep()) return;
    const registrationData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      dateOfBirth: formData.dateOfBirth.toISOString(),
      gender: formData.gender,
      email: formData.email,
      password: formData.password,
      universityDomain: formData.universityDomain || "university.edu",
      phoneNumber: formData.phoneNumber,
      isUniversityVerified: false,
    };
    await dispatch(register(registrationData));
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <View>
            <View className="flex flex-col gap-2">
              <Text className="text-4xl font-bold text-gray-900">
                Seni tanıyalım
              </Text>
              <Text className="text-[16px] font-normal text-gray-500 mb-6">
                Bize biraz kendinden bahset. Seni tanımamıza yardımcı olmak için
                kutucukları doldur.
              </Text>
            </View>

            <View className="mb-4">
              <Text className="text-gray-900 text-lg font-semibold mb-2">
                Ad *
              </Text>
              <TextInput
                className="border-2 rounded-2xl px-4 py-4 text-[18px] text-gray-900"
                placeholder="Adın"
                placeholderTextColor="#9CA3AF"
                value={formData.firstName}
                onChangeText={(value) => updateField("firstName", value)}
              />
            </View>

            <View className="mb-4">
              <Text className="text-gray-900 text-lg font-semibold mb-2">
                Soyad *
              </Text>
              <TextInput
                className="border-2 rounded-2xl px-4 py-4 text-[18px] text-gray-900"
                placeholder="Soyadın"
                placeholderTextColor="#9CA3AF"
                value={formData.lastName}
                onChangeText={(value) => updateField("lastName", value)}
              />
            </View>

            {/* Cinsiyet Seçim Butonu */}
            <View className="mb-4 relative">
              <Text className="text-gray-900 text-lg font-semibold mb-2">
                Cinsiyet *
              </Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handlePresentModalPress} // Burası ref ile açıyor
                className="border-2 border-gray-900 rounded-2xl px-4 py-4 flex-row items-center justify-between"
              >
                <Text className="text-gray-900 text-base">
                  {getGenderLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      // ... (Diğer case'ler 2, 3, 4, 5 aynı kalacak, sadece case 1 değişti)
      case 2:
        return (
          <View>
            {/* Burası aynı, sadece kısalttım */}
            <Text className="text-3xl font-bold text-gray-800 mb-2">
              Doğum tarihin
            </Text>
            {/* ... */}
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              className="bg-gray-100 rounded-2xl px-4 py-3 flex-row items-center justify-between"
            >
              <Text className="text-gray-800 text-base">
                {formData.dateOfBirth.toLocaleDateString("tr-TR", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
              <Text className="text-2xl">📅</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={formData.dateOfBirth}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, selectedDate) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selectedDate) updateField("dateOfBirth", selectedDate);
                }}
                maximumDate={new Date()}
                minimumDate={new Date(1950, 0, 1)}
              />
            )}
          </View>
        );
      case 3:
        // Case 3 (Password) kodların buraya gelecek (değişiklik yok)
        return (
          <View>
            <Text className="text-3xl font-bold text-gray-800 mb-2">
              Güvenlik
            </Text>
            {/* ... existing code ... */}
            <View className="mb-4">
              <Text className="text-gray-700 font-semibold mb-2">Şifre *</Text>
              <View className="relative">
                <TextInput
                  className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 pr-12"
                  placeholder="En az 8 karakter"
                  value={formData.password}
                  onChangeText={(v) => updateField("password", v)}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3"
                >
                  <Text className="text-2xl">{showPassword ? "👁️" : "🙈"}</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Confirm Password kısmı da buraya */}
            <View className="mb-4">
              <TextInput
                className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-800 pr-12"
                placeholder="Şifrenizi tekrar girin"
                value={formData.confirmPassword}
                onChangeText={(v) => updateField("confirmPassword", v)}
                secureTextEntry={!showConfirmPassword}
              />
            </View>
          </View>
        );
      case 4:
        // Case 4 (Phone) kodların buraya gelecek
        return (
          <View>
            <Text className="text-3xl font-bold text-gray-800 mb-2">
              İletişim
            </Text>
            <TextInput
              className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-800"
              placeholder="+90 555"
              keyboardType="phone-pad"
              value={formData.phoneNumber}
              onChangeText={(v) => updateField("phoneNumber", v)}
            />
          </View>
        );
      case 5:
        // Case 5 (Email) kodların buraya gelecek
        return (
          <View>
            <Text className="text-3xl font-bold text-gray-800 mb-2">
              Üniversite
            </Text>
            <TextInput
              className="bg-gray-100 rounded-2xl px-4 py-3 text-gray-800"
              placeholder="edu.tr"
              keyboardType="email-address"
              autoCapitalize="none"
              value={formData.email}
              onChangeText={(v) => updateField("email", v)}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white"
    >
      {/* Header */}
      <View className="bg-white pt-12 pb-4 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleBack}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2">←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-6 py-8 pt-0">
          <View className="flex-1">{renderStep()}</View>

          {/* Buttons */}
          <View className="mt-8">
            {currentStep === 5 ? (
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleRegister}
                disabled={loading}
                className={`${
                  loading ? "bg-purple-400" : "bg-purple-600"
                } rounded-full py-4 items-center`}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-lg">Kayıt Ol</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={1}
                onPress={handleNext}
                className="bg-purple-600 rounded-full py-4 items-center"
              >
                <Text className="text-white font-bold text-lg">Devam Et</Text>
              </TouchableOpacity>
            )}
          </View>

          <View className="flex-row justify-center mt-6 mb-8">
            <Text className="text-gray-600">Zaten hesabın var mı? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text className="text-purple-600 font-bold">Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* --- GORHOM BOTTOM SHEET MODAL --- */}
      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        backgroundStyle={{
          borderRadius: 32,
          backgroundColor: "white",
        }}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        enablePanDownToClose={true} // Aşağı çekince kapansın
        handleIndicatorStyle={{ backgroundColor: "#E5E7EB", width: 50 }} // Gri tutma çubuğu
      >
        <BottomSheetView className="flex-1 bg-white px-4 pb-8">
          {/* Modal Header */}
          <View className="flex-row justify-between items-center py-4 mb-2">
            <TouchableOpacity onPress={cancelGenderSelection}>
              <Text className="text-gray-500 text-lg">İptal</Text>
            </TouchableOpacity>
            <Text className="text-lg font-bold text-gray-800">Cinsiyet</Text>
            <TouchableOpacity onPress={confirmGenderSelection}>
              <Text className="text-purple-600 text-lg font-bold">Bitti</Text>
            </TouchableOpacity>
          </View>

          {/* Picker Content */}
          <Picker
            selectedValue={tempGender}
            onValueChange={(value) => setTempGender(value)}
            style={{ height: 200 }}
          >
            <Picker.Item label="Seçiniz..." value="" color="#9CA3AF" />
            <Picker.Item label="Erkek" value="Male" />
            <Picker.Item label="Kadın" value="Female" />
            <Picker.Item label="Belirtmek İstemiyorum" value="PreferNotToSay" />
          </Picker>
        </BottomSheetView>
      </BottomSheetModal>
    </KeyboardAvoidingView>
  );
}
