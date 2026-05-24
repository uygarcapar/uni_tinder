import { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { useDispatch } from "react-redux";
import { updateRegistrationField } from "../store/slices/authSlice";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";
import { InfoIcon } from "lucide-react-native";

const calculateAge = (day, month, year) => {
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function RegisterStep6Screen({ navigation }) {
  const dispatch = useDispatch();

  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const [error, setError] = useState("");
  const [errorFields, setErrorFields] = useState([]);

  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  // Backspace boş kutuda → soldaki kutunun son karakterini silip oraya focus.
  const handleKeyPress = (e, currentField) => {
    if (e.nativeEvent.key !== "Backspace") return;
    if (currentField === "month" && month === "") {
      if (day.length > 0) setDay(day.slice(0, -1));
      dayRef.current?.focus();
    } else if (currentField === "year" && year === "") {
      if (month.length > 0) setMonth(month.slice(0, -1));
      monthRef.current?.focus();
    }
  };


  const clearFieldError = (field) => {
    setErrorFields((prev) => {
      const next = prev.filter((f) => f !== field);
      if (next.length === 0) setError("");
      return next;
    });
  };

  const handleDayChange = (val) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
    setDay(clean);
    clearFieldError("day");
    if (clean.length === 2) monthRef.current?.focus();
  };

  const handleMonthChange = (val) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 2);
    setMonth(clean);
    clearFieldError("month");
    if (clean.length === 2) yearRef.current?.focus();
  };

  const handleYearChange = (val) => {
    const clean = val.replace(/[^0-9]/g, "").slice(0, 4);
    setYear(clean);
    clearFieldError("year");
  };

  const handleNext = () => {
    Keyboard.dismiss();
    const errors = [];
    const d = parseInt(day);
    const mo = parseInt(month);
    const y = parseInt(year);

    if (!day || day.length < 2 || isNaN(d) || d < 1 || d > 31)
      errors.push("day");
    if (!month || month.length < 2 || isNaN(mo) || mo < 1 || mo > 12)
      errors.push("month");
    if (
      !year ||
      year.length < 4 ||
      isNaN(y) ||
      y < 1900 ||
      y > new Date().getFullYear()
    )
      errors.push("year");

    if (errors.length > 0) {
      setErrorFields(errors);
      setError("Geçerli bir doğum tarihi gir.");
      return;
    }

    const age = calculateAge(d, mo, y);
    if (age < 18) {
      setError("Uygulamayı kullanabilmek için 18 yaşından büyük olmalısın.");
      setErrorFields(["day", "month", "year"]);
      return;
    }

    const date = new Date(y, mo - 1, d);
    dispatch(
      updateRegistrationField({
        field: "dateOfBirth",
        value: date.toISOString(),
      }),
    );
    setError("");
    setErrorFields([]);
    navigation.navigate("RegisterStep7");
  };

  const inputStyle = (field) => ({
    borderRadius: 999,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: errorFields.includes(field)
      ? "#ef4444"
      : "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 22,
    fontWeight: "600",
    color: "#fff",
    textAlign: "center",
  });

  return (
    <View className="flex-1 bg-[#121212]">
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => navigation.goBack()}
          className="flex-row items-center"
        >
          <Text className="text-4xl mr-2 text-white">←</Text>
        </TouchableOpacity>
      </View>

      <RegisterProgressBar step={6} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 px-6 py-6 pt-0">
          <View className="flex flex-col gap-2">
            <Text className="text-4xl font-bold text-white">Yaşını gir.</Text>
            <Text className="text-[18px] font-normal text-gray-400 mb-6">
              Doğum tarihin, doğru eşleşmeler bulmamıza yardımcı olur.
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Gün
              </Text>
              <TextInput
                ref={dayRef}
                style={inputStyle("day")}
                placeholder="gg"
                placeholderTextColor="#595959"
                keyboardType="number-pad"
                maxLength={2}
                value={day}
                selection={{ start: day.length, end: day.length }}
                onChangeText={handleDayChange}
                caretHidden
                returnKeyType="next"
                onSubmitEditing={() => monthRef.current?.focus()}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Ay
              </Text>
              <TextInput
                ref={monthRef}
                style={inputStyle("month")}
                placeholder="aa"
                placeholderTextColor="#595959"
                keyboardType="number-pad"
                maxLength={2}
                value={month}
                selection={{ start: month.length, end: month.length }}
                onChangeText={handleMonthChange}
                onKeyPress={(e) => handleKeyPress(e, "month")}
                caretHidden
                returnKeyType="next"
                onSubmitEditing={() => yearRef.current?.focus()}
              />
            </View>

            <View style={{ flex: 2 }}>
              <Text className="text-gray-300 text-[14px] font-semibold mb-2 text-center">
                Yıl
              </Text>
              <TextInput
                ref={yearRef}
                style={inputStyle("year")}
                placeholder="yyyy"
                placeholderTextColor="#595959"
                keyboardType="number-pad"
                maxLength={4}
                value={year}
                selection={{ start: year.length, end: year.length }}
                onChangeText={handleYearChange}
                onKeyPress={(e) => handleKeyPress(e, "year")}
                caretHidden
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          </View>

          {error ? (
            <Text className="text-red-500 text-center font-normal mb-3 mt-4">
              {error}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <KeyboardStickyView offset={{ closed: 0, opened: 15 }}>
        <View className="px-6 pb-8 pt-4">
          <AnimatedPressable
            onPress={handleNext}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text className="text-black py-[20px] font-bold text-[15px] text-center">
                Devam Et
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      </KeyboardStickyView>
    </View>
  );
}
