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
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import {
  Check,
  Cigarette,
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

const SimpleOptionItem = ({ option, isSelected, onPress, icon: Icon }) => (
  <TouchableOpacity
    activeOpacity={1}
    onPress={onPress}
    style={{
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 18,
      }}
    >
      {Icon && (
        <Icon
          size={16}
          color={isSelected ? "#fff" : "#9CA3AF"}
          strokeWidth={1.5}
        />
      )}
      <Text
        style={{
          color: isSelected ? "#fff" : "#9CA3AF",
          fontSize: 15,
          fontWeight: "500",
        }}
      >
        {option.name}
      </Text>
    </View>
    {isSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
  </TouchableOpacity>
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

  const [smokingStatus, setSmokingStatus] = useState(
    profile.smokingStatus !== undefined && profile.smokingStatus !== null
      ? String(profile.smokingStatus)
      : "",
  );
  const [zodiacSign, setZodiacSign] = useState(
    profile.zodiacSign !== undefined && profile.zodiacSign !== null
      ? String(profile.zodiacSign)
      : "",
  );
  const [usagePurpose, setUsagePurpose] = useState(
    profile.usagePurpose !== undefined && profile.usagePurpose !== null
      ? String(profile.usagePurpose)
      : "",
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

  const toggleSmoking = (id) => {
    const next = String(id) === String(smokingStatus) ? "" : String(id);
    setSmokingStatus(next);
    dispatch(
      updateMultipleFields({
        smokingStatus: next === "" ? null : parseInt(next),
      }),
    );
  };

  const toggleZodiac = (id) => {
    const next = String(id) === String(zodiacSign) ? "" : String(id);
    setZodiacSign(next);
    dispatch(
      updateMultipleFields({
        zodiacSign: next === "" ? null : parseInt(next),
      }),
    );
  };

  const toggleUsagePurpose = (id) => {
    const next = String(id) === String(usagePurpose) ? "" : String(id);
    setUsagePurpose(next);
    dispatch(
      updateMultipleFields({
        usagePurpose: next === "" ? null : parseInt(next),
      }),
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
                    fontSize: 17,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Sigara Kullanımı
                </Text>
                <SectionDescription>
                  Sigara kullanım durumunu seç. Bu bilgi, sigara içen veya
                  içmeyen kullanıcıların birbirlerini daha kolay bulmasını
                  sağlar.
                </SectionDescription>
                {smokingStatuses.map((opt) => (
                  <SimpleOptionItem
                    key={opt.id}
                    option={opt}
                    icon={Cigarette}
                    isSelected={String(opt.id) === String(smokingStatus)}
                    onPress={() => toggleSmoking(opt.id)}
                  />
                ))}
              </View>
            )}

            {/* Zodiac Sign */}
            {zodiacs.length > 0 && (
              <View style={{ marginTop: 28 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 17,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Burç
                </Text>
                <SectionDescription>
                  Burç seçimini yap. Bazı kullanıcılar için burç bilgisi, ortak
                  ilgi alanlarını keşfetmek açısından önemli olabilir.
                </SectionDescription>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {zodiacs.map((opt) => (
                    <ZodiacPill
                      key={opt.id}
                      option={opt}
                      isSelected={String(opt.id) === String(zodiacSign)}
                      onPress={() => toggleZodiac(opt.id)}
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
                    fontSize: 17,
                    fontWeight: "600",
                    marginBottom: 6,
                  }}
                >
                  Kullanım Amacı
                </Text>
                <SectionDescription>
                  Lit'i hangi amaçla kullandığını seç.
                </SectionDescription>
                {usagePurposes.map((opt) => (
                  <PurposeOptionItem
                    key={opt.id}
                    option={opt}
                    isSelected={String(opt.id) === String(usagePurpose)}
                    onPress={() => toggleUsagePurpose(opt.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Sticky Button */}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View className="px-8 pb-8 pt-4 bg-[#121212]">
          <TouchableOpacity
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
            activeOpacity={1}
            onPress={handleNext}
            className=""
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
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>

    </View>
  );
}
