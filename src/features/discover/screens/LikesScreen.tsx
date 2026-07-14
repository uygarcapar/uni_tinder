import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  Dimensions,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Host, Button as SwiftUIButton } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
} from "@expo/ui/swift-ui/modifiers";
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
  useAnimatedScrollHandler,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import profileService from "@/features/profile/profileService";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import EmptyState from "@/shared/components/EmptyState";
import LikerSwipeModal from "@/features/discover/components/LikerSwipeModal";
import PurchaseModal from "@/features/discover/components/PurchaseModal";
import ScreenHeader from "@/shared/components/ScreenHeader";
import swipeService from "@/features/discover/swipeService";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { setWhoLikedMeCount } from "@/features/discover/swipeSlice";

import uiBus from "@/shared/services/uiBus";
import { colors, gradients } from "../../../shared/theme/colors";

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
          backgroundColor: colors.surface,
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

function LikeCard({ item, isPremium, onPress }) {
  const [imgLoading, setImgLoading] = useState(
    !!item.mainPhoto && !loadedPhotoUris.has(item.mainPhoto),
  );
  // SuperLike'lar premium olmasa da blur'suz görünür.
  const showClear = isPremium || item.isSuperLike;
  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
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
          backgroundColor: colors.surface,
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
            <Lock size={40} color={colors.text} strokeWidth={2} />
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
            <Heart size={28} color={colors.text} fill={colors.text} strokeWidth={1.5} />
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
            color: colors.neutral500,
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
  const reduxPremium = useAppSelector(selectIsPremium);
  const isPremium = profilePremium || reduxPremium;
  const [activeTab, setActiveTab] = useState("all");
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const statsQuery = useSwipeStats();
  const [purchaseVisible, setPurchaseVisible] = useState(false);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Detay preview state — karta tıklayınca LikerProfile detayını çekip
  // PreviewModal'da SwipeCard layout'unu reuse ederek gösteriyoruz.
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewProfile, setPreviewProfile] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

      if (profile?.isPremium) setProfilePremium(true);

      if (data.isSuccess && data.result) {
        const superLikeProfiles = (data.result.superLikes?.profiles || []).map(
          (p) => ({
            id: `sl_${p.profileId}`,
            userId: p.userId, // LikerProfile detay endpoint'i için lazım
            name: p.displayName,
            age: p.age,
            mainPhoto: p.photos?.[0] || "",
            likedAt: p.likedMeAt,
            isSuperLike: true,
          }),
        );
        const likeProfiles = (data.result.likes?.profiles || []).map((p) => ({
          id: `l_${p.profileId}`,
          userId: p.userId,
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
    } catch {
      // yut
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhoLikedMe();
  }, []);

  // Karta tıklayınca:
  //   - Premium değil → PurchaseModal aç (upsell).
  //   - Premium ise → LikerProfile detayını çek + interactive SwipeWrapper'lı
  //     LikerSwipeModal'ı aç. Kullanıcı sağa/sola kaydırıp like/pass yapabilir;
  //     mutual like ise backend match yaratır, global MatchModal açılır.
  // 404 → liker silinmiş/banlanmış/like'ını geri çekmiş → modal'ı kapat ve
  // listeyi yenile.
  const openLikerProfile = async (item) => {
    if (!isPremium) {
      setPurchaseVisible(true);
      return;
    }
    const likerUserId = item?.userId || item?.likerUserId;
    if (!likerUserId) return;
    setPreviewProfile(null);
    setPreviewLoading(true);
    setPreviewVisible(true);
    try {
      const res = await swipeService.getLikerProfileDetail(likerUserId);
      if (res?.isSuccess && res?.result) {
        setPreviewProfile(res.result);
      } else {
        setPreviewVisible(false);
        fetchWhoLikedMe();
      }
    } catch (e) {
      const status = e?.response?.status ?? e?.status;
      setPreviewVisible(false);
      if (status === 404) {
        // Liker artık erişilebilir değil — listeyi tazele.
        fetchWhoLikedMe();
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewProfile(null);
  };

  // LikerSwipeModal'dan dönen swipe sonrası — like/pass/superlike fark etmez,
  // kullanıcı bu liker'ı handle etti → listeden anında çıkar (backend
  // MatchNotification gelene kadar bekleme). whoLikedMe count'unu da düş.
  const handleLikerSwiped = (likerUserId) => {
    if (!likerUserId) return;
    setLikes((prev) =>
      prev.filter(
        (it) => it.userId !== likerUserId && it.likerUserId !== likerUserId,
      ),
    );
    dispatch(setWhoLikedMeCount(Math.max(0, (likes?.length ?? 1) - 1)));
  };

  // Match olduğunda artık o kişi "incoming like" değil — listeden çıkar.
  // Fetch'ten gelen item'lar `userId`, realtime eklenenler `likerUserId`
  // alanı taşıyor; iki ihtimali de kontrol et.
  useEffect(() => {
    const unsub = uiBus.on("match", (m) => {
      const matchedId = m?.matchedUserId;
      if (!matchedId) return;
      setLikes((prev) => {
        const next = prev.filter(
          (it) => it.userId !== matchedId && it.likerUserId !== matchedId,
        );
        if (next.length !== prev.length) {
          dispatch(setWhoLikedMeCount(Math.max(0, next.length)));
        }
        return next;
      });
    });
    return unsub;
  }, [dispatch]);

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
          (it) => it.id === dupId || it.likerUserId === payload.likerUserId,
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
                backgroundColor: isActive ? colors.text : "transparent",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Text
                style={{
                  color: isActive ? "#000" : colors.text,
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
    <View className="flex-1 bg-bg">
      {loading ? (
        <>
          <View
            style={{ paddingHorizontal: 16, paddingTop: insets.top + 50 + 16 }}
          >
            {tabsRow}
          </View>
          <LikesSkeletonGrid />
        </>
      ) : (
        /* Likes Grid */
        <Animated.FlatList
          data={filteredLikes}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <LikeCard
              item={item}
              isPremium={isPremium}
              onPress={() => openLikerProfile(item)}
            />
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
                subtitle={
                  activeTab === "superlike"
                    ? "Seni süper beğenen birileri olduğunda burada görünecek."
                    : activeTab === "like"
                      ? "Yeni beğeniler geldikçe burada listelenecek."
                      : "Profilini geliştirdikçe seni beğenenlerin sayısı artar."
                }
                buttonLabel={
                  activeTab === "superlike"
                    ? "Süper beğeni gönder"
                    : activeTab === "like"
                      ? "Keşfetmeye git"
                      : "Profilimi geliştir"
                }
                onButtonPress={() =>
                  navigation.navigate(
                    activeTab === "whoLikesMe" ? "Profile" : "Discover",
                  )
                }
              />
            </View>
          }
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: insets.top + 50 + 16,
            paddingBottom: filteredLikes.length === 0 ? 0 : 120,
          }}
          columnWrapperStyle={
            filteredLikes.length > 0
              ? { justifyContent: "space-between" }
              : undefined
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <ScreenHeader
        scrollY={scrollY}
        title="Beğeniler"
        fillRatio={swipeFillRatio}
        rightButton={
          Platform.OS === "ios" ? (
            <Host matchContents>
              <SwiftUIButton
                label="Bildirimler"
                systemImage="bell.fill"
                onPress={() => navigation.navigate("Notifications")}
                modifiers={[
                  buttonStyle("glass"),
                  tint(colors.text),
                  labelStyle("iconOnly"),
                  font({ size: 22, weight: "medium" }),
                ]}
              />
            </Host>
          ) : (
            <TouchableOpacity
              onPress={() => navigation.navigate("Notifications")}
              hitSlop={10}
              activeOpacity={0.7}
            >
              <View pointerEvents="none">
                <Bell size={29} strokeWidth={2} color={colors.text} fill={colors.text} />
              </View>
            </TouchableOpacity>
          )
        }
      />

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
            onPress={() => setPurchaseVisible(true)}
            style={{
              borderRadius: 999,
              borderCurve: "continuous",
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={gradients.neutralFade}
              locations={[0, 0.35, 0.85]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                paddingVertical: 18,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Heart size={16} color="#000" strokeWidth={2.2} />
              <Text
                style={{
                  color: "#000",
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                Seni beğenenleri gör
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      )}

      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => setPurchaseVisible(false)}
      />

      <LikerSwipeModal
        visible={previewVisible}
        profile={previewLoading ? null : previewProfile}
        onClose={handleClosePreview}
        onSwipe={handleLikerSwiped}
      />
    </View>
  );
}
