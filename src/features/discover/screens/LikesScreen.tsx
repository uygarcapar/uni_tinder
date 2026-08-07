import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Dimensions,
  TouchableOpacity,
  Platform,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
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
import MaskedView from "@react-native-masked-view/masked-view";
import { easeGradient } from "react-native-easing-gradient";
import {
  Heart,
  HeartCrack,
  Bell,
} from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import { useNavigation } from "@react-navigation/native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
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
import SkeletonBox from "@/shared/components/SkeletonBox";
import FilterPills from "@/shared/components/FilterPills";
import SuperLikeHeart from "@/shared/components/SuperLikeHeart";
import swipeService from "@/features/discover/swipeService";
import { useSwipeStats } from "@/features/discover/swipeQueries";
import { setWhoLikedMeCount } from "@/features/discover/swipeSlice";

import uiBus from "@/shared/services/uiBus";
import { colors } from "../../../shared/theme/colors";
import { useRenderCount } from "@/shared/debug/useRenderCount";

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - 44) / 2; // 2 columns with padding
const CARD_HEIGHT = CARD_WIDTH * 1.3; // Aspect ratio

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
        marginBottom: 12,
      }}
    >
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 40,
          borderWidth:0.3,
          borderColor:"#2b2b2b",
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}
      >
        {item.mainPhoto ? (
          <Image
            source={{ uri: item.mainPhoto }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
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
            }}
          />
        )}

        {/* Sağ üst: sadece superlike için LitPlus tonlu gradient kalp */}
        {item.isSuperLike && (
          <View
            style={{
              position: "absolute",
              top: 12,
              right: 12,
            }}
            pointerEvents="none"
          >
            <SuperLikeHeart size={28} />
          </View>
        )}

        {/* İsim & yaş — kartın sol altında, beyaz. Okunabilirlik için alt gradient scrim. */}
        {showClear && (
          <>
            {/* Alt progressive blur — SwipeCard'ın collapsed bottom blur'u gibi.
                Karartma yerine maskeli hafif blur (üstten transparan → alta doğru). */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: CARD_HEIGHT * 0.33,
              }}
            >
              <MaskedView
                style={{ flex: 1 }}
                maskElement={
                  <LinearGradient
                    {...(easeGradient({
                      colorStops: {
                        0: { color: "transparent" },
                        0.5: { color: "black" },
                        1: { color: "rgba(0,0,0,0.99)" },
                      },
                    }) as any)}
                    style={StyleSheet.absoluteFill}
                  />
                }
              >
                <LinearGradient
                  colors={["rgba(0,0,0,0.1)", "rgba(0,0,0,0.45)"]}
                  style={StyleSheet.absoluteFill}
                />
                <BlurView
                  intensity={15}
                  tint={
                    Platform.OS === "ios"
                      ? "systemChromeMaterialDark"
                      : "systemMaterialDark"
                  }
                  style={StyleSheet.absoluteFill}
                />
              </MaskedView>
            </View>
            <View
              style={{
                position: "absolute",
                left: 16,
                right: 12,
                bottom: 24,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  maxWidth: "90%",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    color: "#ffffff",
                    fontSize: 18,
                    fontWeight: "700",
                  }}
                >
                  {item.name}
                </Text>
                {item.age != null && (
                  <Text
                    style={{
                      flexShrink: 0,
                      color: "#ffffff",
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    {`, ${item.age}`}
                  </Text>
                )}
              </View>
              {!!item.universityName && (
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    maxWidth: "90%",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {item.universityName}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Blurlu (kilitli) kartlar — isim/yaş/üni yerine beyaz kutu placeholder.
            Genişlikler gerçek metin uzunluğuna göre dinamik (karakter ≈ px). */}
        {!showClear && (() => {
          const maxW = CARD_WIDTH - 32;
          const nameText =
            item.age != null ? `${item.name || ""}, ${item.age}` : item.name || "";
          const nameW = Math.min(
            maxW,
            Math.max(28, Math.round(nameText.length * 9.5)),
          );
          return (
            <View
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: 20,
              }}
              pointerEvents="none"
            >
              <View
                style={{
                  width: nameW,
                  height: 16,
                  borderRadius: 6,
                  backgroundColor: "rgba(255,255,255,0.9)",
                }}
              />
              <View
                style={{
                  marginTop: 8,
                  width: "80%",
                  height: 12,
                  borderRadius: 5,
                  backgroundColor: "rgba(255,255,255,0.6)",
                }}
              />
            </View>
          );
        })()}
      </View>
    </TouchableOpacity>
  );
}

export default function LikesScreen() {
  useRenderCount("LikesScreen");
  const { t } = useTranslation();
  const [likes, setLikes] = useState([]);
  // Event handler'larda güncel listeye erişmek için — setLikes updater'ının
  // içinde dispatch etmek render sırasında TabNavigator'ı güncelliyordu.
  const likesRef = useRef([]);
  const whoLikedMeInFlightRef = useRef(false);
  likesRef.current = likes;
  const [loading, setLoading] = useState(true);
  const [_currentPage, setCurrentPage] = useState(1);
  const [_hasNextPage, setHasNextPage] = useState(false);
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
  const [_previewLoading, setPreviewLoading] = useState(false);

  // DiscoverScreen ile aynı fill oranı: (limit - kalan) / limit.
  // Premium / -1 / limit bilinmiyor → 0.
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    const limit = statsQuery.data?.dailySwipeLimit;
    if (rem == null || rem < 0) return 0;
    if (limit == null || limit <= 0) return 0;
    const used = Math.max(0, limit - rem);
    return Math.min(1, used / limit);
  }, [
    statsQuery.data?.remainingSwipes,
    statsQuery.data?.dailySwipeLimit,
    statsQuery.data?.isPremium,
  ]);

  const filteredLikes =
    activeTab === "like"
      ? likes.filter((l) => !l.isSuperLike)
      : activeTab === "superlike"
        ? likes.filter((l) => l.isSuperLike)
        : likes;

  const fetchWhoLikedMe = async (page = 1) => {
    // In-flight dedupe: preload mount'u + kullanıcı navigasyonu/premium-transition
    // aynı anda tetikleyince istek çiftleniyordu (Sentry trace kanıtlı). State
    // (loading) async güncellendiği için guard ref ile senkron tutulur.
    if (whoLikedMeInFlightRef.current) return;
    whoLikedMeInFlightRef.current = true;
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
            universityName: p.universityName || "",
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
          universityName: p.universityName || "",
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
      whoLikedMeInFlightRef.current = false;
    }
  };

  useEffect(() => {
    fetchWhoLikedMe();
  }, []);

  // Premium false→true geçişinde listeyi tazele. Bu ekran react-query
  // kullanmadığı için PurchaseModal'ın refetchPremiumScoped'u buraya dokunmuyor;
  // liste free scope'ta çekilmiş olabiliyor (backend free kullanıcıya kısıtlı
  // alan dönerse foto/isim eksik kalırdı). Transition'ı dinlemek PurchaseModal'ın
  // onSuccess callback'inin yerini tutar ve premium'un başka bir ekrandan
  // (Discover/Profile) veya restore ile alındığı durumu da kapsar.
  const prevIsPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (prevIsPremiumRef.current === isPremium) return;
    prevIsPremiumRef.current = isPremium;
    if (isPremium) fetchWhoLikedMe();
  }, [isPremium]);

  // Karta tıklayınca:
  //   - Premium DEĞİL ve normal like → PurchaseModal aç (upsell).
  //   - Premium ise VEYA gelen bir SuperLike ise → LikerProfile detayını çek +
  //     interactive SwipeWrapper'lı LikerSwipeModal'ı aç. Kullanıcı sağa/sola
  //     kaydırıp like/pass yapabilir; mutual like ise backend match yaratır,
  //     global MatchModal açılır.
  // SuperLike istisnası kartın görselindekiyle aynı kural (bkz. LikeCard
  // `showClear`): SuperLike zaten blur'suz gösteriliyor, dolayısıyla ona
  // dokununca paywall açmak görsel sözleşmeyi bozuyordu — SuperLike'ın
  // karşılığı, free kullanıcının da o kişiyi görüp yanıtlayabilmesi.
  // 404 → liker silinmiş/banlanmış/like'ını geri çekmiş → modal'ı kapat ve
  // listeyi yenile.
  const openLikerProfile = async (item) => {
    if (!isPremium && !item?.isSuperLike) {
      setPurchaseVisible(true);
      return;
    }
    const likerUserId = item?.userId || item?.likerUserId;
    if (!likerUserId) return;
    setPreviewProfile(null);
    setPreviewLoading(true);
    try {
      const res = await swipeService.getLikerProfileDetail(likerUserId);
      if (res?.isSuccess && res?.result) {
        setPreviewProfile(res.result);
        setPreviewVisible(true);
      } else {
        fetchWhoLikedMe();
      }
    } catch (e) {
      const status = e?.response?.status ?? e?.status;
      if (status === 404) {
        fetchWhoLikedMe();
      } else if (status === 401 || status === 403) {
        // Backend LikerProfile'ı premium'a kilitliyorsa free kullanıcının
        // SuperLike dokunuşu sessizce ölmesin: paywall'a düş. Bu dal ancak
        // backend SuperLike istisnasını tanımıyorsa çalışır — kalıcı çözüm
        // orada, burası sadece ölü dokunuşa karşı emniyet.
        setPurchaseVisible(true);
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
    const next = likesRef.current.filter(
      (it) => it.userId !== likerUserId && it.likerUserId !== likerUserId,
    );
    likesRef.current = next;
    setLikes(next);
    dispatch(setWhoLikedMeCount(Math.max(0, next.length)));
  };

  // Match olduğunda artık o kişi "incoming like" değil — listeden çıkar.
  // Fetch'ten gelen item'lar `userId`, realtime eklenenler `likerUserId`
  // alanı taşıyor; iki ihtimali de kontrol et.
  useEffect(() => {
    const unsub = uiBus.on("match", (m) => {
      const matchedId = m?.matchedUserId;
      if (!matchedId) return;
      const prev = likesRef.current;
      const next = prev.filter(
        (it) => it.userId !== matchedId && it.likerUserId !== matchedId,
      );
      if (next.length === prev.length) return;
      likesRef.current = next;
      setLikes(next);
      dispatch(setWhoLikedMeCount(Math.max(0, next.length)));
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
    <FilterPills
      style={{ marginBottom: 12 }}
      activeTab={activeTab}
      onChange={setActiveTab}
      tabs={[
        { key: "all", label: t('likes.tabAll') },
        { key: "like", label: t('likes.tabLike') },
        { key: "superlike", label: t('likes.tabSuperLike') },
      ]}
    />
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
                sf="heart.slash"
                iconStrokeWidth={1}
                topOffset={0}
                text={
                  activeTab === "superlike"
                    ? t('likes.emptySuperLike')
                    : activeTab === "like"
                      ? t('likes.emptyLike')
                      : t('likes.emptyAll')
                }
                subtitle={
                  activeTab === "superlike"
                    ? t('likes.emptySuperLikeSubtitle')
                    : activeTab === "like"
                      ? t('likes.emptyLikeSubtitle')
                      : t('likes.emptyAllSubtitle')
                }
                buttonLabel={
                  activeTab === "superlike"
                    ? t('likes.superLikeButton')
                    : activeTab === "like"
                      ? t('likes.discoverButton')
                      : t('likes.profileButton')
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
            paddingBottom: filteredLikes.length === 0 ? 0 : 200,
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
        title={t('likes.title')}
        fillRatio={swipeFillRatio}
        rightButton={
          Platform.OS === "ios" ? (
            <Host matchContents>
              <SwiftUIButton
                label={t('common.notifications')}
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
                <SFIcon name="bell.fill" fallback={Bell} size={29} strokeWidth={2} color={colors.text} weight="semibold" />
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
              colors={[colors.litPlus, colors.litPlus]}
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
              <SFIcon name="heart" fallback={Heart} size={16} color={colors.text} strokeWidth={2.2} weight="semibold" />
              <Text
                style={{
                  color: colors.text,
                  fontWeight: "700",
                  fontSize: 14,
                }}
              >
                {t('likes.viewButton')}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </View>
      )}

      {/* Satın alma sonrası liste tazelemesi onSuccess'te değil, isPremium
          false→true transition effect'inde (yukarıda) yapılıyor. */}
      <PurchaseModal
        visible={purchaseVisible}
        onClose={() => setPurchaseVisible(false)}
      />

      <LikerSwipeModal
        visible={previewVisible}
        profile={previewProfile}
        onClose={handleClosePreview}
        onSwipe={handleLikerSwiped}
      />
    </View>
  );
}
