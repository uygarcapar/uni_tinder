import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Pressable,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  MapPin,
  GraduationCap,
  BookOpen,
  Heart,
  X,
  Check,
  Cigarette,
  Sparkles,
  Target,
  // Hobby icons
  Music,
  Dumbbell,
  Film,
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
  PartyPopper,
  Tent,
  Sandwich,
  Cake,
  Bird,
  Sunrise,
  Book,
  Languages,
  Puzzle,
  Headphones,
  Newspaper,
  TrendingUp,
  Globe,
  Theater,
  Soup,
  ShoppingBag,
  Orbit,
  ChevronRight,
  Pen,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";

const { width, height } = Dimensions.get("window");
const CARD_HEIGHT = height - 200;
const SCREEN_HEIGHT = height - 188; // Header height (90px) çıkarıldı

// Icon mapping for hobbies
const getHobbyIcon = (hobbyName) => {
  const iconMap = {
    // Fitness & Spor (IDs 0-10)
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
    // Yemek & İçecek (IDs 11-17)
    "Yemek Pişirme": Utensils,
    "Pastacılık & Fırıncılık": Cake,
    "Kahve Kültürü": Coffee,
    "Şarap Tadımı": Wine,
    "Gastronomi Turu": Soup,
    "Vegan & Vejetaryen Mutfağı": Sandwich,
    "Egzotik Yemekler": Utensils,
    // Sanat & Yaratıcılık (IDs 18-25)
    "Resim & Çizim": Palette,
    Fotoğrafçılık: Camera,
    "Müzik Aleti Çalma": Guitar,
    Yazarlık: BookOpenCheck,
    Şiir: BookOpen,
    "El Sanatları": Sparkles,
    "Heykel & Seramik": Palette,
    "Moda & Tasarım": ShoppingBag,
    // Müzik & Eğlence (IDs 26-32)
    "Konser Takibi": Music,
    "Canlı Müzik": Mic2,
    "Elektronik Müzik": Headphones,
    "Rock & Metal": Guitar,
    "Jazz & Blues": Piano,
    "Klasik Müzik": Music2,
    "Müzik Festivalleri": PartyPopper,
    // Doğa & Macera (IDs 33-40)
    Kamp: Tent,
    Trekking: Mountain,
    "Balık Tutma": Fish,
    "Bisiklet Turu": Bike,
    Yelken: Waves,
    Sörf: Waves,
    "Kuş Gözlemciliği": Bird,
    Safari: Camera,
    // Kültür & Öğrenme (IDs 41-48)
    Tarih: BookOpen,
    "Müze Gezmek": BookOpenCheck,
    Tiyatro: Drama,
    Sinema: Film,
    "Opera & Bale": Theater,
    "Yabancı Dil Öğrenme": Languages,
    Okumak: Book,
    Edebiyat: BookOpen,
    // Oyun & Teknologi (IDs 49-55)
    "Video Oyunları": Gamepad2,
    "Masa Oyunları": Puzzle,
    Satranç: Puzzle,
    "E-Spor": Trophy,
    Yazılım: Code,
    "Teknoloji Haberleri": Newspaper,
    Robotik: Smartphone,
    // Sosyal & Yaşam Tarzı (IDs 56-66)
    "Sosyal Aktiviteler": Users,
    Gönüllülük: Heart,
    Seyahat: Plane,
    "Gece Hayatı": PartyPopper,
    "Bar & Pub": Wine,
    Alışveriş: ShoppingBag,
    "Halkla İlişkiler": Users,
    "Medya & İletişim": Globe,
    "Podcast Dinleme": Headphones,
    "Hayvan Sevgisi": Dog,
    "Kedi Sevgisi": Cat,
    // Entelektüel (IDs 67-72)
    "Bilim & Araştırma": Lightbulb,
    Felsefe: BookOpen,
    Psikoloji: Lightbulb,
    Astronomi: Orbit,
    Girişimcilik: Briefcase,
    "Yatırım & Finans": TrendingUp,
  };
  return iconMap[hobbyName] || Heart;
};

export default function SwipeCard({
  profile,
  hideActions = false,
  onPass,
  onLike,
}) {
  const [isFilled, setIsFilled] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  if (!profile) return null;

  // Combine all photos into one array
  const allPhotos =
    profile.photos && profile.photos.length > 0 ? profile.photos : [];

  const handlePhotoPress = (event) => {
    const touchX = event.nativeEvent.locationX;
    const isRightSide = touchX > width / 2;

    if (isRightSide) {
      // Sağ tarafa basıldı - sonraki fotoğraf
      if (currentPhotoIndex < allPhotos.length - 1) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentPhotoIndex((prev) => prev + 1);
      }
    } else {
      // Sol tarafa basıldı - önceki fotoğraf
      if (currentPhotoIndex > 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentPhotoIndex((prev) => prev - 1);
      }
    }
  };

  return (
    <View
      style={{
        borderRadius: 40,
        borderCurve: "continuous",
        overflow: "hidden",
      }}
      className="flex-1 bg-[#121212]"
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        style={{ height: CARD_HEIGHT }}
      >
        {/* Photo Gallery */}
        {allPhotos.length > 0 ? (
          <View
            style={{
              borderRadius: 40,
              borderCurve: "continuous",
              overflow: "hidden",
              height: SCREEN_HEIGHT,
            }}
            className="relative bg-gray-500"
          >
            {/* 0 Gecikmeli Tap Alanı ve Görseller */}
            <Pressable onPress={handlePhotoPress} style={{ flex: 1 }}>
              {allPhotos.map((photo, index) => (
                <Image
                  key={index}
                  source={{ uri: photo }}
                  style={{
                    position: "absolute",
                    width: width,
                    height: SCREEN_HEIGHT,
                    opacity: currentPhotoIndex === index ? 1 : 0,
                  }}
                  resizeMode="cover"
                />
              ))}
            </Pressable>

            {/* Pagination Indicator - Bullets */}
            {allPhotos.length > 1 && (
              <View
                className="absolute top-6 left-0 right-0 items-center z-50"
                pointerEvents="none"
              >
                <View className="flex-row gap-[4px]">
                  {allPhotos.map((_, index) => (
                    <View
                      key={index}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor:
                          index === currentPhotoIndex
                            ? "#fff"
                            : "rgba(255,255,255,0.4)",
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Top Blur Gradient Overlay */}
            <MaskedView
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 230,
                pointerEvents: "none",
              }}
              maskElement={
                <LinearGradient
                  colors={["rgba(0,0,0,1)", "rgba(0,0,0,0.4)", "transparent"]}
                  locations={[0, 0.6, 1]}
                  style={{ flex: 1 }}
                />
              }
            >
              <BlurView intensity={90} tint="dark" style={{ flex: 1 }} />
            </MaskedView>

            {/* Bottom Blur Gradient Overlay */}
            <MaskedView
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 330,
                pointerEvents: "none",
              }}
              maskElement={
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.6)", "rgba(0,0,0,1)"]}
                  locations={[0, 0.6, 1]}
                  style={{ flex: 1 }}
                />
              }
            >
              <BlurView intensity={90} tint="dark" style={{ flex: 1 }} />
            </MaskedView>

            {/* Like Button - hidden in preview mode */}
            {!hideActions && (
              <View className="absolute top-6 right-6">
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setIsFilled(!isFilled)}
                >
                  <View
                    className="flex items-center justify-center"
                    style={{
                      borderRadius: 9999,
                      width: 56,
                      height: 56,
                      overflow: "hidden",
                    }}
                  >
                    <View pointerEvents="none">
                      <Heart
                        size={35}
                        color="#fff"
                        strokeWidth={1.5}
                        fill={isFilled ? "#fff" : "transparent"}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Name and Age on Photo */}
            <View
              className="absolute bottom-10 left-6 right-6"
              pointerEvents="none"
            >
              {profile.isPremium && (
                <BlurView
                  intensity={90}
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                  className=" mb-2 py-3 px-3 self-start flex-row items-center gap-2"
                >
                  <Text className="text-white text-[11px] font-bold">
                    Premium
                  </Text>
                </BlurView>
              )}
              <View className="flex-col items-start mb-1 gap-1">
                <Text className="text-white text-4xl font-bold">
                  {profile.displayName}, {profile.age}
                </Text>
              </View>

              {/* University & Usage Purpose */}
              <View className="mb-4 mt-1 flex-row flex-wrap gap-2">
                <View
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                  className="flex-row items-center border-[0.5px] border-white/10 self-start px-3 py-3 gap-2"
                >
                  <GraduationCap size={20} color="#d1d5db" strokeWidth={1.5} />
                  <Text className="ml-[2px] text-gray-300 font-medium text-[14px]">
                    {profile.universityName}
                  </Text>
                </View>
                {profile.usagePurposeDisplay && (
                  <View
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                    }}
                    className="flex-row items-center border-[0.5px] border-white/10 self-start px-3 py-3 gap-2"
                  >
                    <Target size={20} color="#d1d5db" strokeWidth={1.5} />
                    <Text className="ml-[2px] text-gray-300 font-medium text-[14px]">
                      {profile.usagePurposeDisplay}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View className="w-full h-[500px] bg-gray-200 items-center justify-center">
            <Text className="text-gray-400 text-lg">No photo</Text>
          </View>
        )}

        {/* Profile Info */}
        <View className="p-6 px-2">
          {/* University & Department */}
          {profile.showUniversity && profile.departmentDisplay && (
            <View className=" p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  Eğitim
                </Text>
              </View>
              <View className="flex-row flex-wrap items-center gap-3">
                <View
                  className=" self-start flex-row items-center border-[0.5px] border-white/10"
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    shadowColor: "#fff",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.02,
                    shadowRadius: 15,
                    elevation: 5,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      gap: 8,
                    }}
                  >
                    <GraduationCap size={18} color="#fff" strokeWidth={1.5} />
                    <View className="flex-col items-start gap-1">
                      <Text className="text-white font-medium text-[14px]">
                        {profile.universityName}
                      </Text>
                      <Text className="text-gray-300 font-medium text-[14px]">
                        {profile.departmentDisplay}
                      </Text>
                      <Text className="text-gray-400 font-normal text-[14px]">
                        {profile.yearOfStudyDisplay ||
                          (profile.yearOfStudy === 0
                            ? "Hazırlık"
                            : `${profile.yearOfStudy}. Sınıf`)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          )}

          {profile.hobbies && profile.hobbies.length > 0 && (
            <View className="mb-4 p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  Hobiler
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {profile.hobbies.map((hobby, index) => {
                  const HobbyIcon = getHobbyIcon(hobby);
                  return (
                    <View
                      key={index}
                      className="self-start  border-[0.5px] border-white/10"
                      style={{
                        borderRadius: 999,
                        borderCurve: "continuous",
                        overflow: "hidden",
                        shadowColor: "#fff",
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.02,
                        shadowRadius: 15,
                        elevation: 5,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 12,
                          paddingVertical: 14,
                          gap: 8,
                        }}
                      >
                        <HobbyIcon size={18} color="#fff" strokeWidth={1.5} />
                        <Text className="text-white font-medium text-[14px]">
                          {hobby}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Location Info */}
          {(profile.cityDisplay || profile.districtDisplay) && (
            <View className="mb-4 p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  Konum
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {profile.cityDisplay && profile.districtDisplay && (
                  <View
                    className="self-start  border-[0.5px] border-white/10"
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      shadowColor: "#fff",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.02,
                      shadowRadius: 15,
                      elevation: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        gap: 8,
                      }}
                    >
                      <MapPin size={18} color="#fff" strokeWidth={1.5} />
                      <View className="flex-col items-start gap-1">
                        <Text className="text-white font-medium text-[14px]">
                          {profile.districtDisplay}, {profile.cityDisplay}
                        </Text>
                        <Text className="text-gray-400 font-normal text-[14px]">
                          {profile.distance} km uzakta
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Lifestyle Info */}
          {(profile.smokingStatusDisplay || profile.zodiacSignDisplay) && (
            <View className="mb-4 p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  Yaşam Tarzı
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {profile.smokingStatusDisplay && (
                  <View
                    className="self-start  border-[0.5px] border-white/10"
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      shadowColor: "#fff",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.02,
                      shadowRadius: 15,
                      elevation: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        gap: 8,
                      }}
                    >
                      <Cigarette size={18} color="#fff" strokeWidth={1.5} />
                      <Text className="text-white font-medium text-[14px]">
                        {profile.smokingStatusDisplay}
                      </Text>
                    </View>
                  </View>
                )}
                {profile.zodiacSignDisplay && (
                  <View
                    className="self-start  border-[0.5px] border-white/10"
                    style={{
                      borderRadius: 999,
                      borderCurve: "continuous",
                      overflow: "hidden",
                      shadowColor: "#fff",
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.02,
                      shadowRadius: 15,
                      elevation: 5,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 12,
                        paddingVertical: 14,
                        gap: 8,
                      }}
                    >
                      <Sparkles size={18} color="#fff" strokeWidth={1.5} />
                      <Text className="text-white font-medium text-[14px]">
                        {profile.zodiacSignDisplay} Burcu
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Relationship Preference */}
          {profile.usagePurposeDisplay && (
            <View className="mb-4 p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  İlişki Tercihi
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <View
                  className="self-start  border-[0.5px] border-white/10"
                  style={{
                    borderRadius: 999,
                    borderCurve: "continuous",
                    overflow: "hidden",
                    shadowColor: "#fff",
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.02,
                    shadowRadius: 15,
                    elevation: 5,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 12,
                      paddingVertical: 14,
                      gap: 8,
                    }}
                  >
                    <Target size={18} color="#fff" strokeWidth={1.5} />
                    <Text className="text-white font-medium text-[14px]">
                      {profile.usagePurposeDisplay}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Bio */}
          {profile.bio && (
            <View className="mb-4 p-4">
              <View className="flex-row items-center mb-4">
                <Text className="text-gray-300 text-[13px] font-bold">
                  Biyografi
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  shadowColor: "#fff",
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.02,
                  shadowRadius: 15,
                  elevation: 5,
                }}
                className="self-start  border-[0.5px] border-white/10"
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    gap: 8,
                  }}
                >
                  <Pen size={18} color="#fff" strokeWidth={1.5} />
                  <Text className="text-white font-normal text-[14px] leading-6">
                    {profile.bio}
                  </Text>
                </View>
              </View>
            </View>
          )}
          {/* Action Buttons */}
          {!hideActions && (onPass || onLike) && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 80,
                paddingVertical: 40,
                paddingBottom: 40,
              }}
            >
              <TouchableOpacity
                onPress={onPass}
                activeOpacity={0.7}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View pointerEvents="none">
                  <X size={75} color="#fff" strokeWidth={5} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onLike}
                activeOpacity={0.8}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View pointerEvents="none">
                  <Check size={75} color="#fff" strokeWidth={5} />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
