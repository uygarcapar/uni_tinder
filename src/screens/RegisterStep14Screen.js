import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { updateMultipleFields } from "../store/slices/profileSlice";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import {
  Check,
  Sparkles,
  Users,
  Briefcase,
  Wind,
  Star,
  Flame,
  Leaf,
  Moon,
  Sun,
  Scale,
  Zap,
  Navigation,
  Mountain,
  Droplets,
  Fish,
} from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

const getZodiacIcon = (name) => {
  const map = {
    Koç: Flame,
    Boğa: Leaf,
    İkizler: Wind,
    Yengeç: Moon,
    Aslan: Sun,
    Başak: Leaf,
    Terazi: Scale,
    Akrep: Zap,
    Yay: Navigation,
    Oğlak: Mountain,
    Kova: Droplets,
    Balık: Fish,
  };
  return map[name] || Star;
};

const PURPOSE_MAP = {
  Flört: {
    icon: Sparkles,
    desc: "Hafif, eğlenceli ve heyecanlı bir bağlantı arıyorum.",
  },
  Arkadaşlık: {
    icon: Users,
    desc: "Yeni insanlarla tanışmak ve sosyal çevreyi genişletmek istiyorum.",
  },
  Network: {
    icon: Briefcase,
    desc: "Profesyonel bağlantılar kurmak ve iş dünyasında tanışmak istiyorum.",
  },
  Öylesine: {
    icon: Wind,
    desc: "Belirli bir beklentim yok, akışına bırakıyorum.",
  },
};

const SectionDescription = ({ children }) => (
  <View
    style={{
      flexDirection: "column",
      marginBottom: 4,
      marginTop: 4,
    }}
  >
    <Text
      style={{
        color: "#9CA3AF",
        fontSize: 15,
        fontWeight: "500",
        marginBottom: 12,
      }}
    >
      {children}
    </Text>
  </View>
);

const SimpleOptionItem = ({ option, isSelected, onPress }) => (
  <AnimatedPressable
    onPress={onPress}
    style={{
      borderRadius: 30,
      borderCurve: "continuous",
      borderWidth: 0.5,
      borderColor: isSelected
        ? "rgba(255,255,255,0.3)"
        : "rgba(255,255,255,0.1)",
      backgroundColor: isSelected ? "#3e3e3e" : "#1E1E1E",
      paddingHorizontal: 20,
      paddingVertical: 18,
      position: "relative",
    }}
  >
    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>
      {option.name}
    </Text>
    {isSelected && (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 20,
          top: 0,
          bottom: 0,
          justifyContent: "center",
        }}
      >
        <Check size={20} color="#fff" strokeWidth={2.5} />
      </View>
    )}
  </AnimatedPressable>
);

const PurposeOptionItem = ({ option, isSelected, onPress }) => {
  const entry = PURPOSE_MAP[option.name];
  const Icon = entry?.icon ?? Star;
  const desc = entry?.desc;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
      }}
    >
      <Icon
        size={20}
        color={isSelected ? "#fff" : "#6B7280"}
        strokeWidth={1.5}
        style={{ marginRight: 14 }}
      />
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text
          style={{
            color: isSelected ? "#fff" : "#9CA3AF",
            fontSize: 15,
            fontWeight: "500",
          }}
        >
          {option.name}
        </Text>
        {desc && (
          <Text
            style={{
              color: isSelected
                ? "rgba(255,255,255,0.5)"
                : "rgba(255,255,255,0.3)",
              fontSize: 14,
              marginTop: 3,
            }}
          >
            {desc}
          </Text>
        )}
      </View>
      {isSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
    </TouchableOpacity>
  );
};

const ZodiacPill = ({ option, isSelected, onPress }) => {
  const Icon = getZodiacIcon(option.name);
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        overflow: "hidden",
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderWidth: 0.5,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: isSelected ? "#fff" : "transparent",
        borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon
        size={20}
        color={isSelected ? "#000" : "#9CA3AF"}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: isSelected ? "#000" : "#9CA3AF",
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {option.name}
      </Text>
    </TouchableOpacity>
  );
};

export default function RegisterStep14Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  // Backend SmokingStatus/ZodiacSign/UsagePurpose'u enum string bekliyor
  // (örn "Sometimes", "Leo", "Dating"). State'te option.name'i tutuyoruz.
  // Eski persisted state'lerde number/ID kalmış olabilir → string'e zorla.
  const [smokingStatus, setSmokingStatus] = useState(
    typeof profile.smokingStatus === "string" ? profile.smokingStatus : "",
  );
  const [zodiacSign, setZodiacSign] = useState(
    typeof profile.zodiacSign === "string" ? profile.zodiacSign : "",
  );
  const [usagePurpose, setUsagePurpose] = useState(
    typeof profile.usagePurpose === "string" ? profile.usagePurpose : "",
  );

  const [smokingStatuses, setSmokingStatuses] = useState([]);
  const [zodiacs, setZodiacs] = useState([]);
  const [usagePurposes, setUsagePurposes] = useState([]);

  const [loadingSmokingStatuses, setLoadingSmokingStatuses] = useState(false);
  const [loadingZodiacs, setLoadingZodiacs] = useState(false);
  const [loadingUsagePurposes, setLoadingUsagePurposes] = useState(false);

  // Fetch all data on mount
  useEffect(() => {
    fetchSmokingStatuses();
    fetchZodiacs();
    fetchUsagePurposes();
  }, []);

  const fetchSmokingStatuses = async () => {
    try {
      setLoadingSmokingStatuses(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_SMOKING_STATUSES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setSmokingStatuses(data.result);
      } else {
        alert("Sigara durumları yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching smoking statuses:", error);
      alert("Sigara durumları yüklenirken bir hata oluştu");
    } finally {
      setLoadingSmokingStatuses(false);
    }
  };

  const fetchZodiacs = async () => {
    try {
      setLoadingZodiacs(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_ZODIACS}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setZodiacs(data.result);
      } else {
        alert("Burçlar yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching zodiacs:", error);
      alert("Burçlar yüklenirken bir hata oluştu");
    } finally {
      setLoadingZodiacs(false);
    }
  };

  const fetchUsagePurposes = async () => {
    try {
      setLoadingUsagePurposes(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_USAGE_PURPOSES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setUsagePurposes(data.result);
      } else {
        alert("Kullanım amaçları yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching usage purposes:", error);
      alert("Kullanım amaçları yüklenirken bir hata oluştu");
    } finally {
      setLoadingUsagePurposes(false);
    }
  };

  // Backend enumName ("None"/"Aries"/"Dating") bekliyor. State + dispatch enumName.
  const toggleSmoking = (enumName) => {
    if (!enumName) return;
    const next = enumName === smokingStatus ? "" : enumName;
    setSmokingStatus(next);
    dispatch(
      updateMultipleFields({ smokingStatus: next === "" ? null : next }),
    );
  };

  const toggleZodiac = (enumName) => {
    if (!enumName) return;
    const next = enumName === zodiacSign ? "" : enumName;
    setZodiacSign(next);
    dispatch(updateMultipleFields({ zodiacSign: next === "" ? null : next }));
  };

  const toggleUsagePurpose = (enumName) => {
    if (!enumName) return;
    const next = enumName === usagePurpose ? "" : enumName;
    setUsagePurpose(next);
    dispatch(
      updateMultipleFields({ usagePurpose: next === "" ? null : next }),
    );
  };

  const handleNext = () => {
    navigation.navigate("RegisterStep15");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const handleSkip = () => {
    dispatch(
      updateMultipleFields({
        smokingStatus: null,
        zodiacSign: null,
        usagePurpose: null,
      }),
    );
    navigation.navigate("RegisterStep15");
  };

  // Check if all fields are not selected
  const allFieldsEmpty = !smokingStatus && !zodiacSign && !usagePurpose;

  const isLoading =
    loadingSmokingStatuses || loadingZodiacs || loadingUsagePurposes;

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBack}
            className="flex-row items-center"
          >
            <Text className="text-4xl mr-2 text-white">←</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} onPress={handleSkip}>
            <Text className="text-gray-400 text-[16px] font-semibold">
              Atla
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <RegisterProgressBar step={14} />

      <ScrollView className="flex-1 px-6 py-6 pt-0">
        <View className="flex flex-col gap-2">
          <Text className="text-4xl font-bold text-white">Yaşam Tarzın</Text>
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            İsteğe bağlı bilgiler. Profil eşleşmelerini iyileştirir.
          </Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <>
            {/* Smoking Status */}
            {smokingStatuses.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginBottom: 12,
                  }}
                >
                  Sigara Kullanımı
                </Text>
                <View style={{ gap: 12 }}>
                  {smokingStatuses.map((opt) => (
                    <SimpleOptionItem
                      key={opt.id}
                      option={opt}
                      isSelected={opt.enumName === smokingStatus}
                      onPress={() => toggleSmoking(opt.enumName)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Zodiac Sign */}
            {zodiacs.length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginBottom: 12,
                  }}
                >
                  Burç
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {zodiacs.map((opt) => (
                    <ZodiacPill
                      key={opt.id}
                      option={opt}
                      isSelected={opt.enumName === zodiacSign}
                      onPress={() => toggleZodiac(opt.enumName)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Usage Purpose */}
            {usagePurposes.length > 0 && (
              <View style={{ marginTop: 28, marginBottom: 32 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                    marginBottom: 12,
                  }}
                >
                  Kullanım Amacı
                </Text>
                {usagePurposes.map((opt) => (
                  <PurposeOptionItem
                    key={opt.id}
                    option={opt}
                    isSelected={opt.enumName === usagePurpose}
                    onPress={() => toggleUsagePurpose(opt.enumName)}
                  />
                ))}
              </View>
            )}
          </>
        )}
        <View className="h-32" />
      </ScrollView>

      {/* Sticky Button */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
        <AnimatedPressable
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
          }}
          onPress={handleNext}
        >
          <LinearGradient
            colors={["#fc1026", "#fc0826"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="py-3.5"
          >
            <Text className="text-white py-[20px] font-bold text-[15px] text-center">
              {allFieldsEmpty ? "Atla" : "Devam Et"}
            </Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}
