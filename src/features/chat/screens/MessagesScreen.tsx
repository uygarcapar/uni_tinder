import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  ZoomIn,
  ZoomOut,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { useNavigation } from "@react-navigation/native";
import {
  MessageCircle,
  Camera as CameraIcon,
  Mic,
  Video,
  Search,
  X,
  ChevronLeft,
} from "lucide-react-native";
import {
  fetchConversations,
  setActiveConversation,
  fetchHistory,
} from "@/features/chat/chatSlice";
import chatService from "@/features/chat/chatService";
import EmptyState from "@/shared/components/EmptyState";
import ScreenHeader from "@/shared/components/ScreenHeader";
import { useSwipeStats } from "@/features/discover/swipeQueries";

export default function MessagesScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const statsQuery = useSwipeStats();

  const { conversations, conversationsLoading } = useAppSelector((s) => (s as any).chat);
  const typingByConv = useAppSelector((s) => (s as any).chat.typingByConv);

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef(null);

  // Scroll-driven search bar collapse: search bar header'a yapışınca alttan
  // yukarı sıkışır (height shrink + overflow:hidden ile alt kenarı kesilir).
  // Magnify icon opacity'si daha hızlı fade eder.
  const SEARCH_BAR_HEIGHT = 44;
  const COMPRESS_START = 12; // pt-3 padding — top of search bar reaches y=0 at this scrollY
  const scrollY = useSharedValue(0);
  const onListScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  const searchBarCompressStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const progress = Math.max(
      0,
      Math.min(1, (y - COMPRESS_START) / SEARCH_BAR_HEIGHT),
    );
    return {
      height: SEARCH_BAR_HEIGHT * (1 - progress),
      opacity: 1 - progress,
    };
  });
  const magnifyOpacityStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    // Magnify hızlı fade — 20px scroll'da tamamen gider.
    const progress = Math.max(0, Math.min(1, (y - COMPRESS_START) / 20));
    return { opacity: 1 - progress };
  });

  // Chevron animasyonu — isSearchActive değişimine göre width + opacity
  // smooth animate edilir. Search bar (flex:1) chevron width değişince
  // doğal olarak ayarlanır (LinearTransition'a gerek kalmaz, böylece
  // scroll-driven height compression hızlı kalır).
  const CHEVRON_WIDTH = 26;
  const CHEVRON_GAP = 8;
  const chevronProgress = useSharedValue(0);
  useEffect(() => {
    chevronProgress.value = withTiming(isSearchActive ? 1 : 0, {
      duration: 220,
    });
  }, [isSearchActive, chevronProgress]);
  const chevronAnimStyle = useAnimatedStyle(() => ({
    width: chevronProgress.value * CHEVRON_WIDTH,
    marginRight: chevronProgress.value * CHEVRON_GAP,
    opacity: chevronProgress.value,
    overflow: "hidden",
  }));

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchQuery("");
    setIsSearchActive(false);
  }, []);

  // Filtrelenmiş conversation listesi — partner display name içinde arama.
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().trim();
    return conversations.filter((c) =>
      (c.partnerDisplayName || "").toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  // DiscoverScreen ile aynı fill oranı: premium veya remainingSwipes===-1 → 0.
  const DAILY_SWIPE_LIMIT = 30;
  const swipeFillRatio = useMemo(() => {
    if (statsQuery.data?.isPremium) return 0;
    const rem = statsQuery.data?.remainingSwipes;
    if (rem == null || rem < 0) return 0;
    const used = Math.max(0, DAILY_SWIPE_LIMIT - rem);
    return Math.min(1, used / DAILY_SWIPE_LIMIT);
  }, [statsQuery.data?.remainingSwipes, statsQuery.data?.isPremium]);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  // WhatsApp davranışı — chat'e girince mesajlar anında gelsin.
  // Conversations yüklenir yüklenmez ilk N sohbetin mesaj history'sini
  // arka planda Redux'a doldur. ChatScreen mount olduğunda bucket dolu
  // → blank ekran/spinner yok. Her conversationId için tek seferlik
  // prefetch (ref ile dedup) — yeni mesaj geldikçe re-trigger olmasın.
  const prefetchedHistoryRef = useRef(new Set());
  useEffect(() => {
    if (!conversations?.length) return;
    conversations.slice(0, 15).forEach((conv) => {
      if (prefetchedHistoryRef.current.has(conv.conversationId)) return;
      prefetchedHistoryRef.current.add(conv.conversationId);
      dispatch(
        fetchHistory({
          conversationId: conv.conversationId,
          cursor: null,
          pageSize: 30,
        }),
      );
    });
  }, [conversations, dispatch]);

  const openChat = useCallback(
    (conv) => {
      dispatch(setActiveConversation(conv.conversationId));
      navigation.navigate("Chat", {
        conversationId: conv.conversationId,
        partner: {
          userId: conv.partnerUserId,
          displayName: conv.partnerDisplayName,
          profileImageUrl: conv.partnerProfileImageUrl,
        },
        isActive: conv.isActive,
      });
    },
    [dispatch, navigation],
  );

  const handleLongPress = useCallback(
    (conv) => {
      if (!conv.isActive) {
        // Kapanmış sohbet — restore offer (24h grace).
        Alert.alert(
          "Eşleşmeyi geri al",
          "Bu sohbet sonlandırıldı. 24 saat içinde geri alabilirsin.",
          [
            { text: "İptal", style: "cancel" },
            {
              text: "Geri Al",
              onPress: async () => {
                try {
                  const ok = await chatService.restoreConversation(
                    conv.conversationId,
                  );
                  if (!ok) {
                    Alert.alert(
                      "Geri alınamadı",
                      "24 saatlik süre dolmuş olabilir.",
                    );
                  }
                  dispatch(fetchConversations());
                } catch (err) {
                  Alert.alert("Hata", "İşlem başarısız.");
                }
              },
            },
          ],
        );
        return;
      }
      // Aktif sohbet — unmatch confirm.
      Alert.alert(
        "Eşleşmeyi kaldır",
        `${conv.partnerDisplayName || "Kullanıcı"} ile sohbeti sonlandır. 24 saat içinde geri alabilirsin.`,
        [
          { text: "İptal", style: "cancel" },
          {
            text: "Kaldır",
            style: "destructive",
            onPress: async () => {
              try {
                await chatService.deactivateConversation(conv.conversationId);
                dispatch(fetchConversations());
              } catch (err) {
                Alert.alert("Hata", "Eşleşme kaldırılamadı.");
              }
            },
          },
        ],
      );
    },
    [dispatch],
  );

  const renderItem = ({ item }) => (
    <ConversationRow
      conv={item}
      isTyping={
        Object.keys(typingByConv?.[item.conversationId] || {}).length > 0
      }
      onPress={() => openChat(item)}
      onLongPress={() => handleLongPress(item)}
    />
  );

  return (
    <View className="flex-1 bg-[#121212]">
      <Animated.FlatList
        data={filteredConversations}
        keyExtractor={(c) => c.conversationId}
        renderItem={renderItem}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          // Search row + pills — scrollable content'in başında. List ile
          // birlikte yukarı kayıp kayboluyor (WhatsApp davranışı).
          <View style={{ paddingTop: insets.top + 50 }}>
            <View className="px-6 pt-3 flex-row items-center">
              <Animated.View
                style={chevronAnimStyle}
                pointerEvents={isSearchActive ? "auto" : "none"}
              >
                <TouchableOpacity
                  onPress={closeSearch}
                  hitSlop={10}
                  activeOpacity={0.7}
                >
                  <View pointerEvents="none">
                    <ChevronLeft size={26} color="#fff" strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={[
                  { flex: 1, overflow: "hidden" },
                  searchBarCompressStyle,
                ]}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => searchInputRef.current?.focus()}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#1E1E1E",
                    borderRadius: 999,
                    borderCurve: "continuous",
                    paddingHorizontal: 16,
                    height: SEARCH_BAR_HEIGHT,
                    gap: 8,
                  }}
                >
                  <Animated.View style={magnifyOpacityStyle}>
                    <Search size={18} color="#fff" strokeWidth={2} />
                  </Animated.View>
                  <TextInput
                    ref={searchInputRef}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    onFocus={() => setIsSearchActive(true)}
                    placeholder=""
                    placeholderTextColor="#808080"
                    selectionColor="#fff"
                    cursorColor="#fff"
                    style={{
                      flex: 1,
                      color: "#fff",
                      fontSize: 18,
                      padding: 0,
                    }}
                  />
                  {searchQuery.length > 0 && (
                    <Animated.View
                      entering={ZoomIn.duration(180)}
                      exiting={ZoomOut.duration(150)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setSearchQuery("")}
                        hitSlop={10}
                        activeOpacity={1}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: "rgba(255,255,255,0.2)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View pointerEvents="none">
                          <X size={14} color="#bfbfbf" strokeWidth={2} />
                        </View>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </View>

            {!isSearchActive && (
              <Animated.View
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(150)}
                className="px-6 pt-3 pb-2 flex-row gap-2"
              >
                {[
                  { key: "all", label: "Tümü" },
                  { key: "unread", label: "Okunmamış" },
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
              </Animated.View>
            )}
          </View>
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 16,
        }}
        ListEmptyComponent={
          isSearchActive && searchQuery.trim().length > 0 ? (
            <View className="flex-1 items-center justify-center pb-[60%] px-8">
              <Search size={48} color="#fff" strokeWidth={1.3} />
              <Text
                className="text-white text-center mt-3"
                style={{ fontSize: 14, fontWeight: "500" }}
              >
                "{searchQuery}" bulunamadı
              </Text>
            </View>
          ) : !isSearchActive && !conversationsLoading ? (
            <View className="flex-1 items-center justify-center pb-[40%]">
              <EmptyState
                Icon={MessageCircle}
                iconStrokeWidth={1.3}
                text="Henüz mesajın yok."
                topOffset={0}
                buttonLabel="Eşleşme bul"
                onButtonPress={() => navigation.navigate("Discover")}
              />
            </View>
          ) : null
        }
      />

      <ScreenHeader
        scrollY={scrollY}
        title="Mesajlar"
        fillRatio={swipeFillRatio}
      />
    </View>
  );
}

function ConversationRow({ conv, isTyping, onPress, onLongPress }) {
  const subtitle = useMemo(() => {
    if (isTyping)
      return { kind: "text", text: "yazıyor…", className: "text-[#f57656]" };
    if (!conv.isActive)
      return {
        kind: "text",
        text: "Sohbet kapatıldı",
        className: "text-gray-400",
      };

    // Media (no text content) — icon + label
    const ct = conv.lastMessageContentType;
    if (ct === 1) return { kind: "media", icon: CameraIcon, text: "Fotoğraf" };
    if (ct === 2) return { kind: "media", icon: Mic, text: "Sesli mesaj" };
    if (ct === 3) return { kind: "media", icon: Video, text: "Video" };

    if (!conv.lastMessagePreview) {
      return {
        kind: "text",
        text: "Konuşmaya başla 👋",
        className: "text-gray-400",
      };
    }
    return {
      kind: "text",
      text: conv.lastMessagePreview,
      className: "text-gray-400",
    };
  }, [
    isTyping,
    conv.lastMessagePreview,
    conv.lastMessageContentType,
    conv.isActive,
  ]);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      className="flex-row items-center px-4 py-3"
    >
      <View>
        {conv.partnerProfileImageUrl ? (
          <Image
            source={{ uri: conv.partnerProfileImageUrl }}
            style={{ width: 56, height: 56, borderRadius: 28 }}
          />
        ) : (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: "#262626",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text className="text-white text-[xl] font-bold">
              {(conv.partnerDisplayName || "?").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Online dot */}
        {conv.partnerIsOnline && (
          <View
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: "#34d399",
              borderWidth: 2,
              borderColor: "#0a0a0a",
            }}
          />
        )}
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-[16px] font-semibold ${conv.isActive ? "text-white" : "text-gray-500"}`}
            numberOfLines={1}
          >
            {conv.partnerDisplayName || "Kullanıcı"}
          </Text>
          {conv.lastMessageAt && (
            <Text className="text-gray-500 text-[16px] font-normal ml-2">
              {formatRelativeTime(conv.lastMessageAt)}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-1">
          {subtitle.kind === "media" ? (
            <View className="flex-row items-center" style={{ flex: 1, gap: 4 }}>
              <subtitle.icon size={14} color="#9CA3AF" strokeWidth={2} />
              <Text
                className="text-[14px] text-gray-400"
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {subtitle.text}
              </Text>
            </View>
          ) : (
            <Text
              className={`text-[14px] ${subtitle.className}`}
              numberOfLines={1}
              style={{ flex: 1 }}
            >
              {subtitle.text}
            </Text>
          )}

          {conv.unreadCount > 0 && (
            <View
              className="ml-2 px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: "#f57656",
                minWidth: 22,
                alignItems: "center",
              }}
            >
              <Text className="text-white text-xs font-bold">
                {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();

  const startOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.floor(
    (startOfDay(now) - startOfDay(d)) / (1000 * 60 * 60 * 24),
  );

  if (dayDiff <= 0) {
    return d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (dayDiff === 1) return "Dün";
  if (dayDiff < 7) {
    return d.toLocaleDateString("tr-TR", { weekday: "long" });
  }
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" });
}
