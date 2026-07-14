import { memo, useEffect, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  ZoomIn,
  ZoomOut,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
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
import { colors } from "../../../shared/theme/colors";

export default function MessagesScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const statsQuery = useSwipeStats();

  // Alan-bazlı seç: chat bucket'ı olarak seçince Immer her chat dispatch'inde
  // yeni bucket referansı üretiyor ve MessagesScreen alakasız her mesaj/typing/
  // quota olayında rerender oluyordu.
  const conversations = useAppSelector((s) => (s as any).chat.conversations);
  const conversationsLoading = useAppSelector((s) => (s as any).chat.conversationsLoading);
  const typingByConv = useAppSelector((s) => (s as any).chat.typingByConv);
  // typingByConv referansı herhangi bir konuşmada typing on/off olduğunda değişir.
  // Bunu primitive boolean map'e indirgeyerek satırlara primitive prop geçiriyoruz
  // → React.memo default shallowEqual, isTyping değişmemişse satırı skip eder.
  const isTypingByConvId = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const cid in (typingByConv || {})) {
      m[cid] = Object.keys(typingByConv[cid] || {}).length > 0;
    }
    return m;
  }, [typingByConv]);

  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef(null);
  // scroll-to-top için FlatList ref'i — search aç/kapa anında listeyi tepeye getirip
  // bar'ın animasyonu ile içeriği aynı yönde hareket ettiriyoruz (mismatch yok).
  const listRef = useRef<any>(null);

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
  // searchActiveProgress'i compress style'lardan önce tanımlıyoruz çünkü
  // bar aktifken scroll-compress disable edilecek.
  const searchActiveProgress = useSharedValue(0);
  const searchBarCompressStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const scrollProgress = Math.max(
      0,
      Math.min(1, (y - COMPRESS_START) / SEARCH_BAR_HEIGHT),
    );
    // Search aktifken bar sticky header — scroll'da incelmesin.
    const progress = scrollProgress * (1 - searchActiveProgress.value);
    return {
      height: SEARCH_BAR_HEIGHT * (1 - progress),
      opacity: 1 - progress,
    };
  });
  const magnifyOpacityStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    // Magnify hızlı fade — 20px scroll'da tamamen gider. Aktifken disable.
    const scrollProgress = Math.max(0, Math.min(1, (y - COMPRESS_START) / 20));
    const progress = scrollProgress * (1 - searchActiveProgress.value);
    return { opacity: 1 - progress };
  });

  // Search aktif olunca:
  //   • search row yukarı kayıyor (paddingTop azalıyor) — bar tepeye yapışıyor
  //   • chevron yavaşça beliriyor (width + opacity)
  //   • piller yumuşakça eriyor (opacity + height collapse) → chat listesi yukarı kayıyor
  //   • header (Lit logo / "Mesajlar") opacity 0 olup gizleniyor
  // Hepsini tek bir shared progress driver'dan besliyoruz → birlikte koreografi.
  const CHEVRON_WIDTH = 26;
  const CHEVRON_GAP = 8;
  const PILLS_HEIGHT = 58; // pt-3 (12) + buton (~38) + pb-2 (8)
  const SEARCH_ROW_INTRINSIC = 24 + SEARCH_BAR_HEIGHT; // pt-3 + bar
  const HEADER_BOTTOM_PADDING_ACTIVE = 0; // aktifken bar altı nefes alanı
  const HEADER_TOP_INACTIVE = insets.top + 50;
  const HEADER_TOP_ACTIVE = insets.top + 8;
  // Spacer (ListHeaderComponent) — search overlay'in işgal ettiği yer kadar boş alan
  // bırakır, böylece ilk chat overlay'in altından başlar. Aktifken pills kaybolduğu için
  // toplam yükseklik düşer → chat listesi otomatik yukarı kayar.
  const INACTIVE_TOTAL = HEADER_TOP_INACTIVE + SEARCH_ROW_INTRINSIC + PILLS_HEIGHT;
  const ACTIVE_TOTAL =
    HEADER_TOP_ACTIVE + SEARCH_ROW_INTRINSIC + HEADER_BOTTOM_PADDING_ACTIVE;
  useEffect(() => {
    searchActiveProgress.value = withTiming(isSearchActive ? 1 : 0, {
      duration: 280,
    });
  }, [isSearchActive, searchActiveProgress]);

  const chevronAnimStyle = useAnimatedStyle(() => ({
    width: searchActiveProgress.value * CHEVRON_WIDTH,
    marginRight: searchActiveProgress.value * CHEVRON_GAP,
    opacity: searchActiveProgress.value,
    overflow: "hidden",
  }));

  const listHeaderPaddingStyle = useAnimatedStyle(() => ({
    paddingTop:
      HEADER_TOP_INACTIVE +
      (HEADER_TOP_ACTIVE - HEADER_TOP_INACTIVE) * searchActiveProgress.value,
    paddingBottom: HEADER_BOTTOM_PADDING_ACTIVE * searchActiveProgress.value,
  }));

  // Search inactive iken overlay scroll ile birlikte yukarı kayar (content gibi
  // davranır). Active iken translateY = 0 → tepeye yapışır (sticky header).
  const overlayTransformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -scrollY.value * (1 - searchActiveProgress.value) },
    ],
  }));

  // Progressive blur backdrop — sadece search aktifken görünür. ScreenHeader'la
  // aynı ease-gradient + BlurView yapısı; mask altta yumuşakça fade eder.
  const blurBackdropStyle = useAnimatedStyle(() => ({
    opacity: searchActiveProgress.value,
  }));
  const { colors: blurMaskColors, locations: blurMaskLocations } = useMemo(
    () =>
      easeGradient({
        colorStops: {
          0: { color: "rgba(0,0,0,0.99)" },
          0.5: { color: "black" },
          1: { color: "transparent" },
        },
      }),
    [],
  );

  // ListHeader spacer — overlay'in işgal ettiği yükseklik kadar boş alan.
  const listHeaderSpacerStyle = useAnimatedStyle(() => ({
    height:
      INACTIVE_TOTAL +
      (ACTIVE_TOTAL - INACTIVE_TOTAL) * searchActiveProgress.value,
  }));

  const pillsAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchActiveProgress.value,
    height: PILLS_HEIGHT * (1 - searchActiveProgress.value),
    overflow: "hidden",
  }));

  const screenHeaderAnimStyle = useAnimatedStyle(() => ({
    opacity: 1 - searchActiveProgress.value,
  }));

  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchQuery("");
    setIsSearchActive(false);
    // Bar tepeye dönerken içeriği de tepeye al → animasyonlar paralel ilerler,
    // bar off-screen kayarken chat'ler yerinde kalmaz, "fark" oluşmaz.
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
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
      // Bir chatten çıkıp hemen başka chate girmeye çalışınca navigate çağrısı
      // bazen düşüyor (TouchableHighlight highlight'ı görünse de ekran açılmıyor,
      // ikinci tap'te açılıyor). Root cause: önceki ChatScreen exit transition'ı
      // devam ederken stack navigator busy oluyor → dispatch drop. Interaction
      // sonuna kadar defer edip clean state'te navigate ediyoruz.
      InteractionManager.runAfterInteractions(() => {
        (navigation as any).navigate("Chat", {
          conversationId: conv.conversationId,
          partner: {
            userId: conv.partnerUserId,
            displayName: conv.partnerDisplayName,
            profileImageUrl: conv.partnerProfileImageUrl,
          },
          isActive: conv.isActive,
        });
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

  // ConversationRow'a conv'i argüman alan STABIL callback'ler geçir — böylece
  // renderItem içinde inline arrow'a gerek kalmaz, satır prop identity'si korunur.
  const handleRowOpen = useCallback((c: any) => openChat(c), [openChat]);
  const handleRowLongPress = useCallback((c: any) => handleLongPress(c), [handleLongPress]);

  const renderItem = useCallback(
    ({ item }: any) => (
      <ConversationRow
        conv={item}
        isTyping={!!isTypingByConvId[item.conversationId]}
        onOpen={handleRowOpen}
        onLongPress={handleRowLongPress}
      />
    ),
    [isTypingByConvId, handleRowOpen, handleRowLongPress],
  );

  return (
    <View className="flex-1 bg-bg">
      <Animated.FlatList
        ref={listRef}
        data={filteredConversations}
        keyExtractor={(c) => c.conversationId}
        renderItem={renderItem}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        initialNumToRender={10}
        windowSize={7}
        ListHeaderComponent={
          // Sadece animasyonlu spacer — search row absolute overlay olarak ayrıca
          // render ediliyor (sticky). Spacer'ın yüksekliği overlay'in işgal ettiği
          // alana eşit, böylece ilk chat overlay'in altından başlar.
          <Animated.View style={listHeaderSpacerStyle} />
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.bottom + 16,
        }}
        ListEmptyComponent={
          isSearchActive && searchQuery.trim().length > 0 ? (
            <View className="flex-1 items-center justify-center pb-[60%] px-8">
              <Search size={48} color={colors.text} strokeWidth={1.3} />
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

      <Animated.View
        pointerEvents={isSearchActive ? "none" : "box-none"}
        style={[
          // zIndex 10 → search overlay'in (zIndex 5) ÜSTÜNDE durur, böylece
          // inactive + scroll'da piller/bar ScreenHeader'ın progressive blur'unun
          // ARKASINA giriyormuş gibi görünür (blur onları kaplar).
          { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
          screenHeaderAnimStyle,
        ]}
      >
        <ScreenHeader
          scrollY={scrollY}
          title="Mesajlar"
          fillRatio={swipeFillRatio}
        />
      </Animated.View>

      {/* Search row + pills overlay.
          - Inactive: translateY = -scrollY → content gibi scroll'la kayar; blur backdrop
            opacity 0 → transparan; ScreenHeader (Lit logo) page header'ı sağlar.
          - Active: translateY = 0 → tepeye yapışır; blur backdrop opacity 1 → progressive
            blurlu siyahlık çıkar (ScreenHeader ile aynı ease-gradient); ScreenHeader fade. */}
      <Animated.View
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, zIndex: 5 },
          listHeaderPaddingStyle,
          overlayTransformStyle,
        ]}
      >
        {/* Progressive blur backdrop — opacity = searchActiveProgress. */}
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            blurBackdropStyle,
          ]}
        >
          <MaskedView
            maskElement={
              <LinearGradient
                locations={blurMaskLocations as any}
                colors={blurMaskColors as any}
                style={StyleSheet.absoluteFill}
              />
            }
            style={StyleSheet.absoluteFill}
          >
            <LinearGradient
              colors={["black", "rgba(0, 0, 0, 0.2)"]}
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
        </Animated.View>

        <View
          className="px-6 pt-3 flex-row items-center"
          style={{ height: SEARCH_ROW_INTRINSIC }}
        >
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
                <ChevronLeft size={26} color={colors.text} strokeWidth={2.5} />
              </View>
            </TouchableOpacity>
          </Animated.View>
          <Animated.View
            style={[
              { flex: 1, justifyContent: "center" },
              searchBarCompressStyle,
            ]}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => searchInputRef.current?.focus()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.surface,
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                paddingHorizontal: 16,
                height: "100%",
                gap: 8,
              }}
            >
              <Animated.View style={magnifyOpacityStyle}>
                <Search size={18} color={colors.text} strokeWidth={2} />
              </Animated.View>
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => {
                  setIsSearchActive(true);
                  // Aktivasyon anında da tepeye al — bar üst pozisyonuna giderken
                  // chat'ler de paralel olarak tepeye scroll'lansın.
                  listRef.current?.scrollToOffset({
                    offset: 0,
                    animated: true,
                  });
                }}
                placeholder=""
                placeholderTextColor={colors.neutral500}
                selectionColor={colors.text}
                cursorColor={colors.text}
                style={{
                  flex: 1,
                  color: colors.text,
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

        <Animated.View
          pointerEvents={isSearchActive ? "none" : "auto"}
          style={pillsAnimStyle}
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
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const ConversationRow = memo(function ConversationRow({
  conv,
  isTyping,
  onOpen,
  onLongPress,
}: any) {
  const isUnread = conv.unreadCount > 0;
  // Stabil parent callback'lerini conv'a bind ediyoruz — memo default shallowEqual
  // prop identity'sini onOpen/onLongPress üzerinden koruyabilsin diye.
  const handlePress = useCallback(() => onOpen(conv), [onOpen, conv]);
  const handleLongPress = useCallback(() => onLongPress(conv), [onLongPress, conv]);
  const subtitle = useMemo(() => {
    if (isTyping)
      return { kind: "text", text: "yazıyor…", className: "text-primary" };
    if (!conv.isActive)
      return {
        kind: "text",
        text: "Sohbet kapatıldı",
        className: "text-gray-400",
      };

    const readClass = isUnread ? "text-white font-semibold" : "text-gray-400";
    const iconColor = isUnread ? colors.text : colors.textSecondary;

    // Media (no text content) — icon + label
    const ct = conv.lastMessageContentType;
    if (ct === 1) return { kind: "media", icon: CameraIcon, text: "Fotoğraf", className: readClass, iconColor };
    if (ct === 2) return { kind: "media", icon: Mic, text: "Sesli mesaj", className: readClass, iconColor };
    if (ct === 3) return { kind: "media", icon: Video, text: "Video", className: readClass, iconColor };

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
      className: readClass,
    };
  }, [
    isTyping,
    conv.lastMessagePreview,
    conv.lastMessageContentType,
    conv.isActive,
    isUnread,
  ]);

  return (
    <TouchableHighlight
      onPress={handlePress}
      onLongPress={handleLongPress}
      underlayColor={colors.surface3}
      activeOpacity={1}
      style={{ backgroundColor: colors.bg }}
    >
      <View className="flex-row items-center px-4 py-2">
        <View>
          {conv.partnerProfileImageUrl ? (
            <Image
              source={{ uri: conv.partnerProfileImageUrl }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              cachePolicy="memory-disk"
              transition={350}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className="text-white text-xl font-bold">
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
                backgroundColor: colors.success,
                borderWidth: 2,
                borderColor: colors.bgDeep,
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
              <subtitle.icon size={14} color={subtitle.iconColor} strokeWidth={2} />
              <Text
                className={`text-[14px] ${subtitle.className}`}
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
              className="ml-2 rounded-full self-center"
              style={{
                backgroundColor: colors.messageOwn,
                width: 10,
                height: 10,
              }}
            />
          )}
        </View>
      </View>
      </View>
    </TouchableHighlight>
  );
});

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
