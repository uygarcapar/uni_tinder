import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Dimensions,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import {
  Flame,
  Heart,
  HeartCrack,
  Menu,
  Lock,
  Star,
} from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import profileService from "../services/profileService";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 44) / 2; // 2 columns with padding
const CARD_HEIGHT = CARD_WIDTH * 1.2; // Aspect ratio

// ─── Generic skeleton box w/ shimmer ─────────────────────────────────────────
function SkeletonBox({ width: w, height: h, borderRadius = 8, style }) {
  const animW = typeof w === "number" ? w : width;
  const shimmer = useSharedValue(-animW);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(animW * 2, { duration: 1200, easing: Easing.linear }),
      -1,
      false,
    );
  }, [shimmer, animW]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value }],
  }));

  return (
    <View
      style={[
        {
          width: w ?? "100%",
          height: h,
          borderRadius,
          borderCurve: "continuous",
          backgroundColor: "#1E1E1E",
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: animW * 2,
            height: "100%",
          },
          animStyle,
        ]}
      >
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.07)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

function LikesSkeletonGrid() {
  const placeholders = Array.from({ length: 6 });
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 16,
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
      }}
    >
      {placeholders.map((_, i) => (
        <SkeletonBox
          key={i}
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          borderRadius={40}
          style={{ marginBottom: 12 }}
        />
      ))}
    </View>
  );
}

// Daha önce yüklenmiş foto URI'leri — tab değişip remount olunca skeleton'a tekrar düşmesin
const loadedPhotoUris = new Set();

function LikeCard({ item, isPremium }) {
  const [imgLoading, setImgLoading] = useState(
    !!item.mainPhoto && !loadedPhotoUris.has(item.mainPhoto),
  );
  // SuperLike'lar premium olmasa da blur'suz görünür.
  const showClear = isPremium || item.isSuperLike;
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 40,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: "#1E1E1E",
        }}
      >
        {item.mainPhoto ? (
          <Image
            source={{ uri: item.mainPhoto }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
            onLoadStart={() => {
              if (!loadedPhotoUris.has(item.mainPhoto)) setImgLoading(true);
            }}
            onLoadEnd={() => {
              loadedPhotoUris.add(item.mainPhoto);
              setImgLoading(false);
            }}
          />
        ) : null}

        {(imgLoading || !item.mainPhoto) && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            pointerEvents="none"
          >
            <SkeletonBox
              width={CARD_WIDTH}
              height={CARD_HEIGHT}
              borderRadius={40}
            />
          </View>
        )}

        {showClear ? (
          <>
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

            <View className="absolute bottom-5 left-5 right-5">
              <BlurView
                intensity={90}
                className="mb-1 py-1.5 px-3 overflow-hidden rounded-full self-start flex-row items-center gap-2"
              >
                <Text className="text-white text-[10px] font-bold">
                  {item.isSuperLike ? "Süper beğeni" : "Seni beğendi"}
                </Text>
              </BlurView>
              <Text className="text-white text-[20px] font-bold">
                {item.name}, {item.age}
              </Text>
            </View>
          </>
        ) : (
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

        {/* Sağ üst: sadece superlike için dolu kalp (mavi) */}
        {item.isSuperLike && (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
            }}
            pointerEvents="none"
          >
            <Heart
              size={22}
              color="#3B82F6"
              fill="#3B82F6"
              strokeWidth={1.5}
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function LikesScreen() {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalProfiles, setTotalProfiles] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const insets = useSafeAreaInsets();

  const filteredLikes =
    activeTab === "like"
      ? likes.filter((l) => !l.isSuperLike)
      : activeTab === "superlike"
        ? likes.filter((l) => l.isSuperLike)
        : likes;

  const fetchWhoLikedMe = async (page = 1) => {
    try {
      setLoading(true);
      // Yeni API: superLikes ve likes ayrı paginated bölümler.
      // Şimdilik ikisini de tek sayfa olarak çekiyoruz, ileride ayrı paginate edebiliriz.
      const [data, profile] = await Promise.all([
        api.get(
          `${API_ENDPOINTS.WHO_LIKED_ME}?likePageNumber=${page}&likePageSize=10&superLikePageNumber=1&superLikePageSize=10`,
        ),
        profileService.getMyProfile().catch(() => null),
      ]);

      console.log(
        `🔍 WhoLikedMe response (page ${page}):`,
        JSON.stringify(data, null, 2),
      );

      if (profile?.isPremium) setIsPremium(true);

      if (data.isSuccess && data.result) {
        const superLikeProfiles = (data.result.superLikes?.profiles || []).map(
          (p) => ({
            id: `sl_${p.profileId}`,
            name: p.displayName,
            age: p.age,
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: true,
          }),
        );
        const likeProfiles = (data.result.likes?.profiles || []).map((p) => ({
          id: `l_${p.profileId}`,
          name: p.displayName,
          age: p.age,
          mainPhoto: p.photos?.[0] || "",
          likedAt: p.likedMeAt,
          isSuperLike: false,
        }));

        // SuperLike'lar her zaman üstte (vurgulu bölüm).
        setLikes([...superLikeProfiles, ...likeProfiles]);
        const slTotal = data.result.superLikes?.totalProfiles || 0;
        const lTotal = data.result.likes?.totalProfiles || 0;
        setTotalProfiles(slTotal + lTotal);
        setHasNextPage(data.result.likes?.hasNextPage || false);
        setCurrentPage(data.result.likes?.currentPage || 1);
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

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Custom Header */}
      <View style={{ paddingTop: insets.top, backgroundColor: "#121212" }}>
        <View
          className="px-6 flex-row items-center justify-between"
          style={{ height: 50 }}
        >
          <Text className="text-white text-[26px] font-bold tracking-wider">
            Beğenenler{loading ? "" : ` (${totalProfiles})`}
          </Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1.5">
              <Menu size={25} strokeWidth={2} color="#fff" fill="#fff" />
            </View>
          </View>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2 px-6">
        {[
          { key: "all", label: "Tümü", icon: null },
          { key: "like", label: "Beğeni", icon: Heart },
          { key: "superlike", label: "Superlike", icon: Star },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.85}
              onPress={() => setActiveTab(tab.key)}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 13,
                gap: 6,
                backgroundColor: isActive ? "#fff" : "transparent",
                borderWidth: isActive ? 0 : 0.5,
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Text
                style={{
                  color: isActive ? "#000" : "#fff",
                  fontWeight: "600",
                  fontSize: 12,
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <LikesSkeletonGrid />
      ) : (
        /* Likes Grid */
        <FlatList
          data={filteredLikes}
          renderItem={({ item }) => (
            <LikeCard item={item} isPremium={isPremium} />
          )}
          keyExtractor={(item) => item.id}
          numColumns={2}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mb-20">
              <HeartCrack size={80} color="#fff" strokeWidth={1.3} />
              <Text className="text-gray-400 font-bold text-[14px] mt-2">
                {activeTab === "superlike"
                  ? "Henüz süper beğeni yok."
                  : activeTab === "like"
                    ? "Henüz beğeni yok."
                    : "Henüz seni beğenen kimse yok."}
              </Text>
            </View>
          }
          contentContainerStyle={
            filteredLikes.length === 0
              ? { flexGrow: 1, paddingBottom: 100 }
              : {
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 120,
                }
          }
          columnWrapperStyle={
            filteredLikes.length > 0
              ? { justifyContent: "space-between" }
              : undefined
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Sticky Bottom Button */}
      <View
        className="absolute bottom-[90px] left-0 right-0 px-6 bg-transparent    "
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
