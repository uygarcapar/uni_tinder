import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
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
  Cigarette,
} from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

// 1. Map objelerini global alana taşıdık (Her render'da yeniden oluşturulmasını engeller)
const ZODIAC_MAP = {
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

const getZodiacIcon = (name) => {
  return ZODIAC_MAP[name] || Star;
};

// 2. Alt component'leri React.memo ile sarmaladık
const SimpleOptionItem = memo(({ option, isSelected, onToggle }) => (
  <AnimatedPressable
    onPress={() => onToggle(option.enumName)}
    style={{
      borderRadius: 30,
      borderCurve: "continuous",
      paddingHorizontal: 4,
      paddingVertical: 18,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    <Cigarette
      size={20}
      color={isSelected ? "#fff" : "#9CA3AF"}
      strokeWidth={1.5}
      style={{ marginRight: 14 }}
    />
    <Text
      style={{
        color: isSelected ? "#fff" : "#9CA3AF",
        fontSize: 14,
        fontWeight: "500",
        flex: 1,
        marginRight: 12,
      }}
    >
      {option.name}
    </Text>
    {isSelected && <Check size={20} color="#fff" strokeWidth={2.5} />}
  </AnimatedPressable>
));

const PurposeOptionItem = memo(({ option, isSelected, onToggle }) => {
  const entry = PURPOSE_MAP[option.name];
  const Icon = entry?.icon ?? Star;
  const desc = entry?.desc;
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => onToggle(option.enumName)}
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
});

// Ortak pulse animasyonu — skeleton card'lar için 0.5↔1 opacity döngüsü.
const usePulse = () => {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
};

const SkeletonSimpleOption = memo(() => {
  const pulse = usePulse();
  return (
    <Animated.View
      style={{
        borderRadius: 30,
        borderCurve: "continuous",
        paddingHorizontal: 4,
        paddingVertical: 18,
        flexDirection: "row",
        alignItems: "center",
        opacity: pulse,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.1)",
          marginRight: 14,
        }}
      />
      <View
        style={{
          width: 120,
          height: 14,
          borderRadius: 7,
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      />
    </Animated.View>
  );
});

const SkeletonZodiacPill = memo(({ width: w = 90 }) => {
  const pulse = usePulse();
  return (
    <Animated.View
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        opacity: pulse,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      />
      <View
        style={{
          width: w,
          height: 12,
          borderRadius: 6,
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      />
    </Animated.View>
  );
});

const SkeletonPurposeOption = memo(() => {
  const pulse = usePulse();
  return (
    <Animated.View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        opacity: pulse,
      }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.1)",
          marginRight: 14,
        }}
      />
      <View style={{ flex: 1, marginRight: 12 }}>
        <View
          style={{
            width: 110,
            height: 14,
            borderRadius: 7,
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
        />
        <View
          style={{
            marginTop: 6,
            width: "85%",
            height: 12,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.07)",
          }}
        />
      </View>
    </Animated.View>
  );
});

const ZodiacPill = memo(({ option, isSelected, onToggle }) => {
  const Icon = getZodiacIcon(option.name);
  return (
    <AnimatedPressable
      onPress={() => onToggle(option.enumName)}
      style={{
        borderRadius: 999,
        borderCurve: "continuous",
        // overflow: "hidden" kaldırıldı (Performans için)
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderWidth: 0.5,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: isSelected ? "#3e3e3e" : "transparent",
        borderColor: isSelected
          ? "rgba(255,255,255,0.3)"
          : "rgba(255,255,255,0.1)",
      }}
    >
      <Icon
        size={20}
        color={isSelected ? "#fff" : "#9CA3AF"}
        strokeWidth={1.5}
      />
      <Text
        style={{
          color: isSelected ? "#fff" : "#9CA3AF",
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {option.name}
      </Text>
    </AnimatedPressable>
  );
});

export default function RegisterStep14Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

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

  // 3. useCallback ile referansların sabit kalmasını sağladık (memo'nun çalışması için şart)
  const toggleSmoking = useCallback(
    (enumName) => {
      if (!enumName) return;
      setSmokingStatus((prev) => {
        const next = prev === enumName ? "" : enumName;
        dispatch(
          updateMultipleFields({ smokingStatus: next === "" ? null : next }),
        );
        return next;
      });
    },
    [dispatch],
  );

  const toggleZodiac = useCallback(
    (enumName) => {
      if (!enumName) return;
      setZodiacSign((prev) => {
        const next = prev === enumName ? "" : enumName;
        dispatch(
          updateMultipleFields({ zodiacSign: next === "" ? null : next }),
        );
        return next;
      });
    },
    [dispatch],
  );

  const toggleUsagePurpose = useCallback(
    (enumName) => {
      if (!enumName) return;
      setUsagePurpose((prev) => {
        const next = prev === enumName ? "" : enumName;
        dispatch(
          updateMultipleFields({ usagePurpose: next === "" ? null : next }),
        );
        return next;
      });
    },
    [dispatch],
  );

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
          <>
            {/* Skeleton — gerçek layout ile birebir aynı yapı. */}
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
              <View style={{ gap: 2 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonSimpleOption key={i} />
                ))}
              </View>
            </View>

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
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[60, 70, 80, 75, 65, 85, 70, 60, 55, 75, 65, 70].map(
                  (w, i) => (
                    <SkeletonZodiacPill key={i} width={w} />
                  ),
                )}
              </View>
            </View>

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
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonPurposeOption key={i} />
              ))}
            </View>
          </>
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
                <View style={{ gap: 2 }}>
                  {smokingStatuses.map((opt) => (
                    <SimpleOptionItem
                      key={opt.id}
                      option={opt}
                      isSelected={opt.enumName === smokingStatus}
                      onToggle={toggleSmoking}
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
                      onToggle={toggleZodiac}
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
                    onToggle={toggleUsagePurpose}
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
            colors={["#ffffff", "#e5e7eb", "#9ca3af"]}
            locations={[0, 0.35, 0.85]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="py-3.5"
          >
            <Text className="text-black py-[20px] font-bold text-[15px] text-center">
              {allFieldsEmpty ? "Atla" : "Devam Et"}
            </Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}
