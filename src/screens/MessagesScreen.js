import { useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import {
  MessageCircle,
  Bell,
  Camera as CameraIcon,
  Mic,
  Video,
} from "lucide-react-native";
import {
  fetchConversations,
  setActiveConversation,
} from "../store/slices/chatSlice";
import chatService from "../services/chatService";

export default function MessagesScreen() {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const { conversations, conversationsLoading } = useSelector((s) => s.chat);
  const typingByConv = useSelector((s) => s.chat.typingByConv);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  const onRefresh = useCallback(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

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
      {/* Custom Header */}
      <SafeAreaView edges={["top"]} className="bg-[#121212]">
        <View
          className="px-6 flex-row items-center justify-between"
          style={{ height: 50 }}
        >
          <Text className="text-white text-[26px] font-bold tracking-wider">
            Mesajlar
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate("Notifications")}
            hitSlop={10}
          >
            <Bell size={25} strokeWidth={2} color="#fff" fill="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {conversationsLoading && conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#f57656" />
        </View>
      ) : conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.conversationId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={conversationsLoading}
              onRefresh={onRefresh}
              tintColor="#f57656"
            />
          }
        />
      )}
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

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <MessageCircle size={56} color="#3a3a3a" />
      <Text className="text-white text-lg font-bold mt-4">
        Henüz mesajın yok
      </Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        Eşleştiğin kişilerle konuşmaya başlamak için Keşfet sekmesini kullan.
      </Text>
    </View>
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
