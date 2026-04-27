import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { Flame, Heart, HeartCrack, Menu, Lock } from "lucide-react-native";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import profileService from "../services/profileService";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 44) / 2; // 2 columns with padding
const CARD_HEIGHT = CARD_WIDTH * 1.2; // Aspect ratio

export default function LikesScreen() {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const insets = useSafeAreaInsets();

  const fetchWhoLikedMe = async (page = 1) => {
    try {
      setLoading(true);
      const [data, profile] = await Promise.all([
        api.get(`${API_ENDPOINTS.WHO_LIKED_ME}?pageNumber=${page}&pageSize=10`),
        profileService.getMyProfile().catch(() => null),
      ]);

      if (profile?.isPremium) setIsPremium(true);

      if (data.isSuccess && data.result) {
        const profiles = data.result.profiles.map((profile) => ({
          id: profile.profileId.toString(),
          name: profile.displayName,
          age: profile.age,
          mainPhoto: profile.photos?.[0] || "",
          likedAt: profile.likedMeAt,
        }));

        setLikes(profiles);
        setTotalProfiles(data.result.totalProfiles);
        setHasNextPage(data.result.hasNextPage);
        setCurrentPage(data.result.currentPage);
      }
    } catch (error) {
      console.error("❌ Error fetching who liked me:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhoLikedMe();
  }, []);

  const renderLikeCard = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.95}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginBottom: 12,
      }}
    >
      <View className="flex-1 rounded-[40px] overflow-hidden bg-gray-500">
        {/* Main Photo */}
        <Image
          source={{ uri: item.mainPhoto }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />

        {isPremium ? (
          <>
            {/* Gradient Overlay */}
            <MaskedView
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 120,
              }}
              maskElement={
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.85)", "rgba(0,0,0,1)"]}
                  locations={[0, 0.5, 1]}
                  style={{ flex: 1 }}
                />
              }
            >
              <BlurView intensity={60} tint="dark" style={{ flex: 1 }} />
            </MaskedView>

            {/* Name and Age */}
            <View className="absolute bottom-5 left-5 right-5">
              <BlurView
                intensity={90}
                className="mb-1 py-1.5 px-3 overflow-hidden rounded-full self-start flex-row items-center gap-2"
              >
                <Text className="text-white text-[10px] font-bold">
                  Seni beğendi
                </Text>
              </BlurView>
              <Text className="text-white text-[20px] font-bold">
                {item.name}, {item.age}
              </Text>
            </View>
          </>
        ) : (
          /* Blur + Lock overlay for non-premium */
          <BlurView
            intensity={70}
            tint="dark"
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
            <Lock size={40} color="#fff" strokeWidth={2} />
          </BlurView>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-[#121212] items-center justify-center">
        <ActivityIndicator size="large" color="#fc4526" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Custom Header */}
      <SafeAreaView edges={["top"]} className="bg-[#121212]">
        <View
          className="px-6 flex-row items-center justify-between"
          style={{ height: 50 }}
        >
          <Text className="text-white text-[26px] font-bold tracking-wider">
            Beğenenler ({totalProfiles})
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1.5">
              <Menu size={25} strokeWidth={2} color="#fff" fill="#fff" />
            </View>
          </View>
        </View>
      </SafeAreaView>
      <View className="flex-row flex-wrap gap-2 px-6">
        <View
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 10,
            gap: 8,
          }}
          className="bg-white py-3"
        >
          <Text className="text-black font-semibold text-[14px]">Test</Text>
        </View>
      </View>

      {/* Likes Grid */}
      <FlatList
        data={likes}
        renderItem={renderLikeCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center mb-20">
            <HeartCrack size={80} color="#6B7280" strokeWidth={2} />
            <Text className="text-gray-500 font-bold text-[13px] mt-2">
              Henüz seni beğenen kimse yok.
            </Text>
          </View>
        }
        contentContainerStyle={
          likes.length === 0
            ? { flexGrow: 1, paddingBottom: 100 }
            : {
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 120,
              }
        }
        columnWrapperStyle={
          likes.length > 0 ? { justifyContent: "space-between" } : undefined
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Sticky Bottom Button */}
      <View
        className="absolute bottom-0 left-0 right-0 px-6 bg-[#121212]"
        style={{
          paddingBottom: 10,
          paddingTop: 16,
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            borderRadius: 999,
            borderCurve: "continuous",
            overflow: "hidden",
          }}
          className=""
        >
          <LinearGradient
            colors={["#ff173a", "#FF4D4D", "#fc803d"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            className="py-3.5"
          >
            <Text className="text-white py-[18px] font-bold text-[14px] text-center">
              Seni beğenenleri gör
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}
