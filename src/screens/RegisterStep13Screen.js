import React, { useState, useRef, useEffect, useCallback, memo } from "react";
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
  Music,
  Dumbbell,
  Film,
  BookOpen,
  Plane,
  Utensils,
  Camera,
  Gamepad2,
  Music2,
  Palette,
  Coffee,
  Wine,
  Code,
  Dog,
  Cat,
  Trees,
  Flower2,
  Heart,
  Drama,
  Mic2,
  Guitar,
  Piano,
  Mountain,
  Waves,
  BookOpenCheck,
  Lightbulb,
  Briefcase,
  Users,
  Trophy,
  Footprints,
  Fish,
  Smartphone,
  Bike,
  HandMetal,
  Sparkles,
  PartyPopper,
  Tent,
  Sandwich,
  Cake,
  Sunrise,
  Book,
  Languages,
  Puzzle,
  Headphones,
  Newspaper,
  TrendingUp,
  Theater,
  Soup,
  ShoppingBag,
  Orbit,
} from "lucide-react-native";
import RegisterProgressBar from "../components/RegisterProgressBar";
import AnimatedPressable from "../components/AnimatedPressable";

// Icon mapping for hobbies - maps exact backend names to icons
const getHobbyIcon = (hobbyName) => {
  const iconMap = {
    "Fitness & Spor": Dumbbell,
    Yoga: Heart,
    Koşu: Footprints,
    Yüzme: Waves,
    Bisiklet: Bike,
    "Doğa Yürüyüşü": Trees,
    "Kaya Tırmanışı": Mountain,
    Boks: HandMetal,
    "Dövüş Sanatları": Trophy,
    Dans: Music2,
    Pilates: Sparkles,
    "Yemek Pişirme": Utensils,
    Fırıncılık: Cake,
    "Şarap Tadımı": Wine,
    "Kahve Tutkusu": Coffee,
    Gurme: Soup,
    "Vegan Mutfak": Sandwich,
    Miksologluk: Wine,
    Fotoğrafçılık: Camera,
    Resim: Palette,
    Çizim: Palette,
    Yazarlık: BookOpenCheck,
    Şiir: Book,
    "El Sanatları": Sparkles,
    "Kendin Yap (DIY)": Flower2,
    Moda: ShoppingBag,
    Müzik: Headphones,
    Konserler: PartyPopper,
    "Gitar Çalmak": Guitar,
    "Piyano Çalmak": Piano,
    "Şarkı Söylemek": Mic2,
    "DJ'lik": Music,
    Festivaller: PartyPopper,
    Seyahat: Plane,
    Kamp: Tent,
    "Balık Tutma": Fish,
    Sörf: Waves,
    Kayak: Mountain,
    Snowboard: Mountain,
    Bahçıvanlık: Flower2,
    "Plaj Hayatı": Sunrise,
    Okumak: BookOpen,
    Müzeler: Theater,
    "Sanat Galerileri": Palette,
    Tiyatro: Drama,
    Sinema: Film,
    Belgesel: Film,
    Öğrenme: Lightbulb,
    Diller: Languages,
    "Video Oyunları": Gamepad2,
    "Masa Oyunları": Puzzle,
    Satranç: Puzzle,
    Yazılım: Code,
    Oyun: Gamepad2,
    VR: Smartphone,
    "Podcast'ler": Headphones,
    Gönüllülük: Users,
    "Evcil Hayvanlar": Dog,
    Köpekler: Dog,
    Kediler: Cat,
    Meditasyon: Heart,
    Astroloji: Orbit,
    Alışveriş: ShoppingBag,
    "Gece Hayatı": Music2,
    Brunch: Coffee,
    "Sosyal İçici": Wine,
    Network: Briefcase,
    Siyaset: Newspaper,
    Felsefe: BookOpen,
    Bilim: Lightbulb,
    Tarih: Book,
    Yatırım: TrendingUp,
    Girişimcilik: Briefcase,
  };

  return iconMap[hobbyName] || Heart;
};

// Hobi kartının skeleton versiyonu — yüklenirken HobbyItem ile aynı boyut/şekil,
// içinde icon + text yerine pulse animasyonlu placeholder bloklar.
const SkeletonHobbyCard = memo(() => {
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

  return (
    <Animated.View
      style={{
        flex: 1,
        minWidth: "45%",
        minHeight: 148,
        borderRadius: 50,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "#1E1E1E",
        paddingVertical: 0,
        opacity: pulse,
        position: "relative",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
        />
        <View
          style={{
            marginTop: 8,
            width: 60,
            height: 12,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.1)",
          }}
        />
      </View>
    </Animated.View>
  );
});

// Gereksiz render'ları engellemek için memo ile sarmalandı
const HobbyItem = memo(({ hobby, isSelected, onPress }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  const Icon = getHobbyIcon(hobby.name);

  const handlePressIn = () => {
    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
      bounciness: 8,
      speed: 20,
    }).start();
  };

  return (
    <Animated.View
      style={{
        flex: 1,
        minWidth: "45%",
        transform: [{ scale: scaleValue }],
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onPress(hobby.enumName)}
        style={{
          borderRadius: 50,
          borderCurve: "continuous",
          overflow: "hidden",
        }}
        className={` border-[0.5px] py-[45px] items-center justify-center ${
          isSelected
            ? "bg-[#3e3e3e] border-white/30"
            : "bg-[#1E1E1E] border-white/10"
        }`}
      >
        <View pointerEvents="none" className="items-center justify-center">
          <Icon size={32} color="#FFFFFF" strokeWidth={2} />
          <Text className="text-[14px] font-medium mt-3 text-white text-center px-2">
            {hobby.name}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function RegisterStep13Screen({ navigation }) {
  const dispatch = useDispatch();
  const profile = useSelector((state) => state.profile || {});

  const [hobbies, setHobbies] = useState(profile.hobbies || []);
  const [hobbyCategories, setHobbyCategories] = useState([]);
  const [loadingHobbies, setLoadingHobbies] = useState(false);

  useEffect(() => {
    fetchHobbies();
  }, []);

  const fetchHobbies = async () => {
    try {
      setLoadingHobbies(true);
      const response = await fetch(
        `${API_BASE_URL}${API_ENDPOINTS.GET_HOBBIES}`,
      );
      const data = await response.json();

      if (data.isSuccess && data.result) {
        setHobbyCategories(data.result);
      } else {
        alert("Hobiler yüklenirken bir hata oluştu");
      }
    } catch (error) {
      console.error("Error fetching hobbies:", error);
      alert("Hobiler yüklenirken bir hata oluştu");
    } finally {
      setLoadingHobbies(false);
    }
  };

  // Backend Hobbies'i enum constant array bekliyor (örn ["Gym", "Yoga"]).
  // State'te hobby.enumName tutuluyor; id/Türkçe name değil.
  const toggleHobby = useCallback((enumName) => {
    if (!enumName) return;
    setHobbies((prev) => {
      if (prev.includes(enumName)) {
        return prev.filter((h) => h !== enumName);
      } else {
        if (prev.length < 10) {
          return [...prev, enumName];
        }
        return prev;
      }
    });
  }, []);

  const handleNext = () => {
    if (hobbies.length === 0) {
      alert("Lütfen en az bir hobi seçin");
      return;
    }

    dispatch(
      updateMultipleFields({
        hobbies,
      }),
    );
    navigation.navigate("RegisterStep14");
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="bg-[#121212] pt-16 pb-6 px-6">
        <View className="flex-row items-center justify-center relative">
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBack}
            className="absolute left-0"
          >
            <Text className="text-4xl text-white">←</Text>
          </TouchableOpacity>
          <Text className="text-white text-[26px] font-bold tracking-wider">
            Hobiler {hobbies.length}/10
          </Text>
        </View>
      </View>

      <RegisterProgressBar step={13} />

      <ScrollView
        className="flex-1 px-6 py-6 pt-0"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!loadingHobbies}
      >
        <View className="flex flex-col gap-2 mb-3">
          <Text className="text-[18px] font-normal text-gray-400 mb-6">
            İlgi alanlarını seç. Seninle ortak noktası olan kişilerle eşleşmeni
            sağlar.
          </Text>
        </View>

        {loadingHobbies
          ? Array.from({ length: 5 }).map((_, catIdx) => (
              <View key={catIdx} className="mb-10">
                {/* Kategori başlığı placeholder — gerçek text ile aynı yer/yükseklikte. */}
                <View
                  style={{
                    width: 110,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "rgba(255,255,255,0.07)",
                    alignSelf: "center",
                    marginBottom: 34,
                  }}
                />
                <View className="flex-row flex-wrap gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonHobbyCard key={i} />
                  ))}
                </View>
              </View>
            ))
          : hobbyCategories.map((category, categoryIndex) => (
              <View key={categoryIndex} className="mb-10">
                <Text className="text-[13px] text-center font-bold text-gray-300 mb-10">
                  {category.category}
                </Text>
                <View className="flex-row flex-wrap gap-3">
                  {category.hobbies.map((hobby) => (
                    <HobbyItem
                      key={hobby.id}
                      hobby={hobby}
                      isSelected={hobbies.includes(hobby.enumName)}
                      onPress={toggleHobby}
                    />
                  ))}
                </View>
              </View>
            ))}

        {/* ScrollView sonu boşluğu */}
        <View className="h-20" />
      </ScrollView>

      {/* Sticky Button with KeyboardStickyView */}
      <View className="px-8 pb-8 pt-4 absolute bottom-0 left-0 right-0">
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
            className="py-3.5"
          >
            <Text className="text-black py-[20px] font-bold text-[15px] text-center">
              Devam Et
            </Text>
          </LinearGradient>
        </AnimatedPressable>
      </View>
    </View>
  );
}
