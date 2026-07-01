import {
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
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { register } from "@/features/auth/authSlice";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";

// --- GORHOM & BLUR IMPORTS ---
import {
  BottomSheetView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { colors } from "../../../shared/theme/colors";
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
  const [genderVisible, setGenderVisible] = useState(false);
  const [tempGender, setTempGender] = useState("");

  // Input ref'i - picker kapanınca odaklanmak için
  const firstNameInputRef = useRef(null);

  // Modal'ın ne kadar yükseleceği (örn: %40)
  const snapPoints = useMemo(() => ["40%"], []);

  const dispatch = useAppDispatch();
  const { loading, error, needsVerification, pendingVerificationEmail } =
    useAppSelector((s) => (s as any).auth);

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
    Keyboard.dismiss(); // Klavyeyi kapat
    setTempGender(formData.gender || "Male"); // Mevcut değeri tempGender'a kopyala
    setGenderVisible(true);
  }, [formData.gender]);

  // Modalı Kapat (Kaydet)
  const confirmGenderSelection = () => {
    updateField("gender", tempGender); // Sadece Bitti'ye basınca güncelle
    setGenderVisible(false);
    // Modal kapandıktan sonra input'a focus yap
    setTimeout(() => {
      firstNameInputRef.current?.focus();
    }, 300);
  };

  // Modalı Kapat (İptal)
  const cancelGenderSelection = () => {
    setGenderVisible(false);
    // Modal kapandıktan sonra input'a focus yap
    setTimeout(() => {
      firstNameInputRef.current?.focus();
    }, 300);
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
        onPress={() => {
          // Backdrop'a basınca modal kapansın ve input'a focus yap
          setGenderVisible(false);
          setTimeout(() => {
            firstNameInputRef.current?.focus();
          }, 300);
        }}
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
      if (currentStep < 5) {
        setCurrentStep(currentStep + 1);
      }
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

            <View className="flex flex-row w-full gap-2 mb-4">
              <View className="flex-1">
                <Text className="text-gray-900 text-lg font-semibold mb-2">
                  Ad *
                </Text>
                <TextInput
                  ref={firstNameInputRef}
                  className="border border-gray-300 rounded-2xl px-4 py-3.5 text-[18px] text-gray-900"
                  placeholder="Adın"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.firstName}
                  onChangeText={(value) => updateField("firstName", value)}
                  autoFocus={true}
                />
              </View>

              <View className="flex-1">
                <Text className="text-gray-900 text-lg font-semibold mb-2">
                  Soyad *
                </Text>
                <TextInput
                  className="border border-gray-300  rounded-2xl px-4 py-3.5 text-[18px] text-gray-900"
                  placeholder="Soyadın"
                  placeholderTextColor={colors.textSecondary}
                  value={formData.lastName}
                  onChangeText={(value) => updateField("lastName", value)}
                />
              </View>
            </View>

            {/* Cinsiyet Seçim Butonu */}
            <View className="mb-4 relative">
              <Text className="text-gray-900 text-lg font-semibold mb-2">
                Cinsiyet *
              </Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={handlePresentModalPress} // Burası ref ile açıyor
                className="border border-gray-300  rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
              >
                <Text
                  className={`${
                    formData.gender ? "text-gray-900" : "text-gray-500"
                  } text-[18px]`}
                >
                  {getGenderLabel()}
                </Text>
                <Text className="text-gray-400 text-xl">▼</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
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

      <View className="flex-1 px-6 py-6 pt-0">
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
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text className="text-white font-bold text-lg">Kayıt Ol</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={1}
              onPress={handleNext}
              className="bg-primary rounded-full py-3.5 items-center"
            >
              <Text className="text-white font-bold text-lg">Devam Et</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* --- GENDER PICKER --- */}
      <AppBottomSheet
        visible={genderVisible}
        onClose={cancelGenderSelection}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ borderRadius: 32, backgroundColor: "white" }}
      >
        <BottomSheetView className="flex-1 bg-white px-4 pb-8">
          {/* Modal Header */}
          <View className="flex-row justify-between items-center py-4 px-4">
            <TouchableOpacity onPress={cancelGenderSelection}>
              <Text className="text-gray-500 text-xl">İptal</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={confirmGenderSelection}>
              <Text className="text-black text-xl font-bold">Bitti</Text>
            </TouchableOpacity>
          </View>

          {/* Picker Content */}
          <Picker
            selectedValue={tempGender}
            onValueChange={(value) => setTempGender(value)}
            style={{ height: 200 }}
          >
            <Picker.Item label="Erkek" value="Male" />
            <Picker.Item label="Kadın" value="Female" />
            <Picker.Item label="Belirtmek İstemiyorum" value="PreferNotToSay" />
          </Picker>
        </BottomSheetView>
      </AppBottomSheet>
    </KeyboardAvoidingView>
  );
}
