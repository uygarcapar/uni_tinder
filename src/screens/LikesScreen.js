import { useEffect, useMemo, useRef, useState } from "react";
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
import { BlurView } from "expo-blur";
import {
  Flame,
  Heart,
  HeartCrack,
  Bell,
  Lock,
  Star,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useDispatch, useSelector } from "react-redux";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import profileService from "../services/profileService";
import AnimatedPressable from "../components/AnimatedPressable";
import EmptyState from "../components/EmptyState";
import PurchaseModal from "../components/PurchaseModal";
import WaveFillLogo from "../components/WaveFillLogo";
import { useSwipeStats } from "../queries/swipeQueries";
import { setWhoLikedMeCount } from "../store/slices/swipeSlice";
import uiBus from "../services/uiBus";

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
        marginBottom: 20,
      }}
    >
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
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

        {!showClear && (
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
            <Heart size={28} color="#fff" fill="#fff" strokeWidth={1.5} />
          </View>
        )}
      </View>

      {/* İsim — kartın altında, sola yatık */}
      {showClear && (
        <Text
          numberOfLines={1}
          style={{
            marginTop: 8,
            paddingLeft: 14,
            paddingRight: 4,
            color: "#808080",
            fontSize: 14,
            fontWeight: "600",
            textAlign: "left",
          }}
        >
          {item.age != null ? `${item.name}, ${item.age}` : item.name}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function LikesScreen() {
  const [likes, setLikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  // Redux subscription state — purchase modal sonrası `setPremium` dispatch'i
  // ile anında true olur. Profile fetch'inden gelen profilePremium ile birlikte
  // OR'lanır ki ya başlangıçta zaten premium ise ya da yeni satın alındıysa
  // button kaybolsun.
  const reduxPremium = useSelector((s) => s.subscription?.isPremium);
  const isPremium = profilePremium || reduxPremium;
  const [activeTab, setActiveTab] = useState("all");
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const statsQuery = useSwipeStats();
  const purchaseBottomSheetRef = useRef(null);

  // DiscoverScreen ile aynı fill oranı: premium veya remainingSwipes===-1 → 0.
  const DAILY_SWIPE_LIMIT = 30;
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return 0;
    const used = Math.max(0, DAILY_SWIPE_LIMIT - rem);
    return Math.min(1, used / DAILY_SWIPE_LIMIT);
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

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

      if (profile?.isPremium) setProfilePremium(true);

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
        dispatch(setWhoLikedMeCount(slTotal + lTotal));
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

  // Realtime: socket'ten yeni IncomingLike geldiğinde listeyi reload etmeden prepend et.
  // AppNavigator IncomingLike SignalR event'ini yakalayıp uiBus.emit('incomingLike', payload)
  // çağırır; payload backend IncomingLikeDto = { likerUserId, likerDisplayName,
  // likerPhotoUrl, isSuperLike, likedAt }. Mutual like'ta backend bu event'i
  // göndermez (MatchNotification akışı çalışır) — burada dedup gerekmiyor.
  useEffect(() => {
    const unsub = uiBus.on("incomingLike", (payload) => {
      if (!payload?.likerUserId) return;
      setLikes((prev) => {
        // Aynı liker zaten listedeyse (ör. reconnect race) ekleme.
        const isSuper = !!payload.isSuperLike;
        const dupId = `${isSuper ? "sl" : "l"}_live_${payload.likerUserId}`;
        const existingByUser = prev.some(
          (it) =>
            it.id === dupId ||
            it.likerUserId === payload.likerUserId,
        );
        if (existingByUser) return prev;

        const card = {
          // profileId yok (DTO sadece userId döner) — live kart için sentetik id.
          id: dupId,
          likerUserId: payload.likerUserId,
          name: payload.likerDisplayName || "",
          age: null, // backend payload'da age yok; kart "İsim, " olarak görünür — kabul
          mainPhoto: payload.likerPhotoUrl || "",
          likedAt: payload.likedAt,
          isSuperLike: isSuper,
        };

        // Yeni SuperLike → listenin en başına (en yeni en üstte).
        if (isSuper) return [card, ...prev];

        // Yeni normal Like → SuperLike bloğunun hemen altına, normal like'ların başına.
        const firstNonSuper = prev.findIndex((it) => !it.isSuperLike);
        if (firstNonSuper === -1) return [...prev, card];
        return [
          ...prev.slice(0, firstNonSuper),
          card,
          ...prev.slice(firstNonSuper),
        ];
      });
    });
    return unsub;
  }, []);

  const tabsRow = (
    <View className="pb-3">
      <View className="flex-row flex-wrap gap-2">
        {[
          { key: "all", label: "Tümü", icon: null },
          { key: "like", label: "Beğeni", icon: Heart },
          { key: "superlike", label: "Superlike", icon: Star },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
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
                paddingVertical: 10,
                backgroundColor: isActive ? "#fff" : "transparent",
                borderWidth: 1,
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
    </View>
  );

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Custom Header — ortada lit logo */}
      <View style={{ paddingTop: insets.top, backgroundColor: "#121212" }}>
        <View
          className="px-6 flex-row items-center justify-center relative"
          style={{ height: 50 }}
        >
          <WaveFillLogo fillRatio={swipeFillRatio} />
          <TouchableOpacity
            onPress={() => navigation.navigate("Notifications")}
            hitSlop={10}
            className="absolute right-6"
            activeOpacity={0.7}
          >
            <View pointerEvents="none">
              <Bell size={25} strokeWidth={2} color="#fff" fill="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            {tabsRow}
          </View>
          <LikesSkeletonGrid />
        </>
      ) : (
        /* Likes Grid */
        <FlatList
          data={filteredLikes}
          renderItem={({ item }) => (
            <LikeCard item={item} isPremium={isPremium} />
          )}
          keyExtractor={(item) => item.id}
          numColumns={2}
          ListHeaderComponent={tabsRow}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pb-[50%]">
              <EmptyState
                Icon={HeartCrack}
                iconStrokeWidth={1}
                topOffset={0}
                text={
                  activeTab === "superlike"
                    ? "Henüz süper beğeni yok."
                    : activeTab === "like"
                      ? "Henüz beğeni yok."
                      : "Henüz seni beğenen kimse yok."
                }
              />
            </View>
          }
          contentContainerStyle={
            filteredLikes.length === 0
              ? { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16 }
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

      {/* Sticky Bottom Button — premium değilse göster, basınca purchase modal aç */}
      {!isPremium && (
        <View
          className="absolute bottom-[90px] left-0 right-0 px-6 bg-transparent    "
          style={{
            paddingBottom: 10,
            paddingTop: 16,
          }}
        >
          <AnimatedPressable
            pressScale={0.97}
            onPress={() => purchaseBottomSheetRef.current?.present()}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
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
          </AnimatedPressable>
        </View>
      )}

      <PurchaseModal
        bottomSheetRef={purchaseBottomSheetRef}
        onClose={() => purchaseBottomSheetRef.current?.dismiss()}
      />
    </View>
  );
}
