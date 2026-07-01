import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
  InteractionManager,
} from "react-native";
import { Image } from "expo-image";
import type { MessageDto } from "@/shared/types";
import Animated, { ZoomIn } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { easeGradient } from "react-native-easing-gradient";
import {
  Host,
  Button as SwiftUIButton,
  Text as SwiftUIText,
} from "@expo/ui/swift-ui";
import {
  buttonStyle,
  tint,
  labelStyle,
  font,
  glassEffect,
  foregroundStyle,
  padding,
  frame,
  controlSize,
} from "@expo/ui/swift-ui/modifiers";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/shared/types/navigation";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";
import {
  ChevronLeft,
  MoreVertical,
  X,
  Infinity as InfinityIcon,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import {
  fetchHistory,
  setActiveConversation,
  appendOptimisticMessage,
  failOptimisticMessage,
  removeOptimisticMessage,
  clearUnreadForConversation,
  fetchChatQuota,
  decrementQuotaLocally,
  reactionsChanged,
  messageDeleted,
  messageEdited,
} from "@/features/chat/chatSlice";
import chatService from "@/features/chat/chatService";
import realtimeService from "@/features/chat/realtimeService";
import MessageBubble from "@/features/chat/components/MessageBubble";
import MessageInput from "@/features/chat/components/MessageInput";
import ChatScrollComponent from "@/features/chat/components/ChatScrollComponent";
import TypingIndicator from "@/features/chat/components/TypingIndicator";
import MessageActionSheet from "@/features/chat/components/MessageActionSheet";
import ImageViewer from "@/features/profile/components/ImageViewer";
import ConversationOptionsSheet from "@/features/chat/components/ConversationOptionsSheet";
import SearchSheet from "@/shared/components/SearchSheet";
import ReportModal from "@/shared/components/ReportModal";
import DateSeparator, { withDateSeparators } from "@/features/chat/components/DateSeparator";
import moderationService from "@/shared/services/moderationService";
import ChatUnlockSheet from "@/features/chat/components/ChatUnlockSheet";
import uiBus from "@/shared/services/uiBus";
import { colors } from "../../../shared/theme/colors";

const ContentType = { Text: 0, Image: 1, Voice: 2, Video: 3, System: 99 };
// Bar opak gövdesi: 16 row py + ~50 HStack (frame 38 + vpad 12) = 66.
// paddingTop = 66 + insets.bottom (inline) → bar opak top'una hizalanır (closed AND open).
// ChatScrollComponent offset = insets.bottom → keyboard açıkken contentInset.top = keyboard - insets.bottom.
const INPUT_BAR_OPAQUE = 66;
const HEADER_CONTENT = 110; // ChatHeader minHeight; fade zone (30) dahil değil — mesajlar fade'e girer

const SYSTEM_MESSAGES_TR = {
  "system.match_created": "Yeni bir eşleşmen var! 🎉 İlk mesajı sen at.",
  "system.conversation_deleted": "Bu sohbet sonlandırıldı.",
};
const i18nResolver = (key, fallback) => SYSTEM_MESSAGES_TR[key] || fallback;

// Selector bucket undefined olduğunda her render'da yeni [] üretmesin diye
// stabil referans — useMemo ve FlatList data prop'unun gereksiz reconcile'ını engeller.
const EMPTY_MESSAGES: MessageDto[] = [];

function latestPartnerSentAt(messages: MessageDto[], myUserId: string | undefined): number {
  if (!myUserId) return 0;
  let latest = 0;
  for (const m of messages) {
    if (m.senderId && m.senderId !== myUserId && !m.isSystemMessage) {
      const t = new Date(m.sentAt).getTime();
      if (t > latest) latest = t;
    }
  }
  return latest;
}

export default function ChatScreen({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Chat'>) {
  const { conversationId, partner, isActive: routeIsActive } = route.params;
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const myUserId = useAppSelector((s) => (s as any).auth.user?.userId || (s as any).auth.user?.id);
  // Bucket'ı bütün olarak seçmek yerine alanları tek tek seçiyoruz — Redux Toolkit/Immer
  // bucket'ın iç alanlarından biri değiştiğinde yeni bucket referansı üretir; bu da bucket'ı
  // tüketen tüm render'ları tetikler. Alan-bazlı selector her birinin referans stabilitesini
  // koruyarak FlatList data prop'unun gereksiz reconcile'ını engeller.
  const messages = useAppSelector(
    (s) => (s as any).chat.messagesByConv[conversationId]?.messages ?? EMPTY_MESSAGES
  ) as MessageDto[];
  const hasMore = useAppSelector(
    (s) => (s as any).chat.messagesByConv[conversationId]?.hasMore ?? false
  );
  const nextCursor = useAppSelector(
    (s) => (s as any).chat.messagesByConv[conversationId]?.nextCursor ?? null
  );
  const loadingHistory = useAppSelector(
    (s) => (s as any).chat.messagesByConv[conversationId]?.loading ?? false
  );

  const typingMap = useAppSelector((s) => (s as any).chat.typingByConv[conversationId]);
  const partnerTyping = useMemo(
    () => Object.keys(typingMap || {}).some((uid: string) => uid !== myUserId),
    [typingMap, myUserId],
  );

  const conv = useAppSelector((s) =>
    (s as any).chat.conversations.find((c: any) => c.conversationId === conversationId),
  );
  const isActive = conv ? conv.isActive : (routeIsActive ?? true);

  const [replyTo, setReplyTo] = useState<any>(null);
  const [actionTarget, setActionTarget] = useState<any>(null);
  const [actionLayout, setActionLayout] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [imageViewer, setImageViewer] = useState<any>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const deliveredAckedRef = useRef(new Set<string>());
  const listRef = useRef<any>(null);
  const quota = useAppSelector((s) => (s as any).chat.quotaByConv?.[conversationId]);
  const isPremium = useAppSelector(selectIsPremium);
  const subscriptionSyncedAt = useAppSelector((s) => (s as any).subscription?.lastSyncedAt);
  const [unlockVisible, setUnlockVisible] = useState(false);

  // isPremiumRef: closure'a takılı kalan eski değeri tüm async/effect handler'lara
  // sızdırmadan, en güncel premium statüsünü okuyabilelim diye.
  const isPremiumRef = useRef(isPremium);
  useEffect(() => {
    isPremiumRef.current = isPremium;
  }, [isPremium]);

  useEffect(() => {
    const unsub = uiBus.on("chatQuotaExhausted", (payload) => {
      if (payload?.conversationId !== conversationId) return;
      // Quota tükendi event'i staleTime'ı bypass etmeli — force ile çek.
      dispatch(fetchChatQuota({ conversationId, force: true }));
      if (!isPremiumRef.current) setUnlockVisible(true);
    });
    return unsub;
  }, [conversationId, dispatch]);

  // Premium statüsü gerçekten değiştiğinde (PurchaseModal → syncSubscriptionWithRetry)
  // quota cache'i bayatlıyor; transition anında force refetch. lastSyncedAt'i dep'e koymadık —
  // mount'ta init effect zaten 30sn stale-time ile bir kez çekecek; sadece premium toggle'da
  // bypass'lı bir ek çağrı yapıyoruz.
  const prevIsPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (prevIsPremiumRef.current !== isPremium) {
      prevIsPremiumRef.current = isPremium;
      if (conversationId) {
        dispatch(fetchChatQuota({ conversationId, force: true }));
      }
    }
  }, [isPremium, conversationId, dispatch]);

  useEffect(() => {
    dispatch(setActiveConversation(conversationId));
    return () => {
      dispatch(setActiveConversation(null));
    };
  }, [conversationId, dispatch]);

  const hadInitialMessagesRef = useRef<boolean | null>(null);
  if (hadInitialMessagesRef.current === null) {
    hadInitialMessagesRef.current = messages.length > 0;
  }

  // markRead debounce damgası: yalnız karşı tarafın yeni bir mesajı geldiğinde
  // (sentAt damgası ilerlediğinde) HTTP atılır; readAt/deliveredAt/reactions push'ları
  // damgayı ilerletmediği için effect koşsa bile network çağrısı tetiklenmez.
  const lastReadSentAtRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!hadInitialMessagesRef.current) {
          await dispatch(
            fetchHistory({ conversationId, cursor: null, pageSize: 30 }),
          );
        }
        if (!mounted) return;
        await realtimeService.joinConversation(conversationId).catch(() => {});
        await chatService.markRead(conversationId).catch(() => {});
        // Init markRead'i kapsadığımız son partner mesajını damgala — sonradan koşan
        // mark-read effect'i aynı durumda tekrar HTTP atmasın.
        lastReadSentAtRef.current = latestPartnerSentAt(messages, myUserId);
        dispatch(clearUnreadForConversation(conversationId));
        // Stale-time gate'i thunk içinde; init'te ilk çağrıyı yapar, sonraki mount'larda
        // 30sn içinde no-op.
        dispatch(fetchChatQuota(conversationId));
      } catch (err) {
        console.warn("chat init err:", err?.message);
      }
    })();
    return () => (mounted = false);
  }, [conversationId, dispatch]);

  // Delivered-ack burst'ünü mount anındaki JS thread baskısından koparıyoruz:
  // ilk girişte 50 undelivered mesajı paralel fetch'lemek yerine bir sonraki idle frame'e bırak.
  useEffect(() => {
    if (!myUserId) return;
    const undelivered = messages.filter(
      (m) =>
        m.senderId &&
        m.senderId !== myUserId &&
        !m.deliveredAt &&
        !m.isSystemMessage &&
        !deliveredAckedRef.current.has(m.id),
    );
    if (undelivered.length === 0) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      undelivered.forEach((m) => {
        deliveredAckedRef.current.add(m.id);
        realtimeService.markMessageDelivered(m.id).catch(() => {});
      });
    });
    return () => handle.cancel?.();
  }, [messages, myUserId]);

  useEffect(() => {
    if (!isActive || !myUserId) return;
    const latest = latestPartnerSentAt(messages, myUserId);
    if (latest > lastReadSentAtRef.current) {
      lastReadSentAtRef.current = latest;
      chatService.markRead(conversationId).catch(() => {});
    }
  }, [messages, conversationId, isActive, myUserId]);

  const loadMoreOlder = useCallback(() => {
    if (loadingHistory || !hasMore || !nextCursor) return;
    dispatch(
      fetchHistory({ conversationId, cursor: nextCursor, pageSize: 30 }),
    );
  }, [conversationId, dispatch, hasMore, loadingHistory, nextCursor]);

  const handleSend = useCallback(
    async ({
      content,
      contentType,
      mediaUrl,
      replyToMessageId,
      clientMessageId,
    }) => {
      if (!isPremiumRef.current && quota && quota.requiresUnlock) {
        setUnlockVisible(true);
        return;
      }

      const optimistic = {
        id: `temp-${clientMessageId}`,
        conversationId,
        senderId: myUserId,
        senderDisplayName: null,
        senderProfileImageUrl: null,
        content,
        sentAt: new Date().toISOString(),
        readAt: null,
        deliveredAt: null,
        isSystemMessage: false,
        systemMessageType: null,
        clientMessageId,
        contentType: contentType ?? ContentType.Text,
        mediaUrl: mediaUrl || null,
        replyTo: replyToMessageId
          ? buildReplyPreview(messages, replyToMessageId)
          : null,
        reactions: [],
        _pending: true,
      };

      dispatch(
        appendOptimisticMessage({ conversationId, message: optimistic }),
      );

      // ÇÖZÜM BURADA: Klavyenin contentInset boşluğunu aşmak için iOS'ta eksi sonsuza yolluyoruz,
      // Native sistem onu otomatik olarak klavye sınırına (tam dibe) sabitleyecektir.
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: Platform.OS === "ios" ? -999999 : 0,
          animated: true,
        });
      }, 100);

      try {
        const useHub =
          realtimeService.isConnected() &&
          contentType === ContentType.Text &&
          !replyToMessageId &&
          !mediaUrl;

        if (useHub) {
          await realtimeService.sendMessage(
            conversationId,
            content,
            clientMessageId,
          );
        } else {
          await chatService.sendMessage({
            conversationId,
            content,
            clientMessageId,
            replyToMessageId,
            contentType,
            mediaUrl,
          });
        }

        dispatch(decrementQuotaLocally({ conversationId }));
      } catch (err) {
        const status = err?.response?.status;
        const paywallType = err?.response?.data?.result?.paywallType;
        if (status === 402 || paywallType === "CHAT_QUOTA_EXHAUSTED") {
          dispatch(
            removeOptimisticMessage({ conversationId, clientMessageId }),
          );
          // 402 → backend authoritative; bayat cache'i bypass et.
          dispatch(fetchChatQuota({ conversationId, force: true }));
          // Premium kullanıcıya quota paywall bottom-sheet gösterme; bayat backend
          // state'in webhook'tan sonra düzelmesini bekle. Banner FE override'ı zaten
          // "Sınırsız" gösteriyor → bu noktada sessizce drop.
          if (!isPremiumRef.current) setUnlockVisible(true);
          return;
        }
        dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
      }
    },
    [conversationId, dispatch, messages, myUserId, quota],
  );

  const handleTypingChange = useCallback(
    (isTyping) => {
      if (isTyping) realtimeService.startTyping(conversationId).catch(() => {});
      else realtimeService.stopTyping(conversationId).catch(() => {});
    },
    [conversationId],
  );

  const handleLongPressMessage = useCallback((message, layout) => {
    if (message._pending || message._failed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionLayout(layout || null);
    setActionTarget(message);
  }, []);

  const handlePickReaction = useCallback(
    async (message, emoji) => {
      if (!message) return;
      const prev = message.reactions || [];
      // Optimistic: aynı emoji varsa count++ (toggle ise backend reconcile eder),
      // yoksa yeni entry ekle. SignalR `reactionsChanged` event'i hemen sonra
      // authoritative listeyi yazar.
      const existing = prev.find((r) => r.emoji === emoji);
      const next = existing
        ? prev.map((r) =>
            r.emoji === emoji ? { ...r, count: (r.count || 1) + 1 } : r,
          )
        : [...prev, { emoji, count: 1 }];
      dispatch(
        reactionsChanged({
          messageId: message.id,
          conversationId: message.conversationId,
          reactions: next,
        }),
      );
      try {
        await chatService.addReaction(message.id, emoji);
      } catch (err) {
        // Rollback
        dispatch(
          reactionsChanged({
            messageId: message.id,
            conversationId: message.conversationId,
            reactions: prev,
          }),
        );
      }
    },
    [dispatch],
  );

  const handleReply = useCallback((message) => {
    if (!message) return;
    setReplyTo({
      id: message.id,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      contentPreview: (message.content || "").slice(0, 120),
      contentType: message.contentType,
      isDeleted: !!message.deletedAt,
    });
  }, []);

  const handleEditStart = useCallback((message) => {
    if (!message) return;
    setEditTarget(message);
    setEditText(message.content || "");
  }, []);

  const handleCopyMessage = useCallback(async (message) => {
    if (!message?.content) return;
    try {
      await Clipboard.setStringAsync(message.content);
      Haptics.selectionAsync().catch(() => {});
    } catch {}
  }, []);

  const handleEditSave = useCallback(async () => {
    if (!editTarget) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === editTarget.content) {
      setEditTarget(null);
      return;
    }
    const prevContent = editTarget.content;
    const prevEditedAt = editTarget.editedAt ?? null;
    // Optimistic: yeni içeriği hemen yansıt. SignalR `messageEdited` authoritative
    // DTO ile aynı state'i tekrar yazar — idempotent.
    dispatch(
      messageEdited({
        id: editTarget.id,
        conversationId: editTarget.conversationId,
        content: trimmed,
        editedAt: new Date().toISOString(),
      }),
    );
    setEditTarget(null);
    setEditText("");
    try {
      await chatService.editMessage(editTarget.id, trimmed);
    } catch (err) {
      // Rollback
      dispatch(
        messageEdited({
          id: editTarget.id,
          conversationId: editTarget.conversationId,
          content: prevContent,
          editedAt: prevEditedAt,
        }),
      );
      Alert.alert(
        "Hata",
        err?.response?.data?.message || "Mesaj düzenlenemedi.",
      );
    }
  }, [editTarget, editText, dispatch]);

  const handleDelete = useCallback(
    async (message, forEveryone) => {
      if (!message) return;
      // Optimistic: hemen sil/redact. SignalR `messageDeleted` event'i geldiğinde
      // aynı state'i tekrar yazacak — idempotent.
      const snapshot = {
        content: message.content,
        mediaUrl: message.mediaUrl,
        deletedAt: message.deletedAt ?? null,
        deletedForEveryone: message.deletedForEveryone ?? false,
      };
      dispatch(
        messageDeleted({
          messageId: message.id,
          conversationId: message.conversationId,
          forEveryone,
          deletedAt: new Date().toISOString(),
        }),
      );
      try {
        await chatService.deleteMessage(message.id, forEveryone);
      } catch (err) {
        // Rollback — orijinal field'ları geri yaz.
        dispatch(
          messageEdited({
            id: message.id,
            conversationId: message.conversationId,
            ...snapshot,
          }),
        );
        Alert.alert("Hata", err?.response?.data?.message || "Silme başarısız.");
      }
    },
    [dispatch],
  );

  const handleRetrySend = useCallback(
    (failedMsg) => {
      if (!failedMsg?._failed) return;
      dispatch(
        removeOptimisticMessage({
          conversationId,
          clientMessageId: failedMsg.clientMessageId,
        }),
      );
      handleSend({
        content: failedMsg.content,
        contentType: failedMsg.contentType,
        mediaUrl: failedMsg.mediaUrl,
        replyToMessageId: failedMsg.replyTo?.id,
        clientMessageId: failedMsg.clientMessageId,
      });
    },
    [conversationId, dispatch, handleSend],
  );

  const handleScrollToReplyTarget = useCallback(
    (reply) => {
      if (!reply?.id) return;
      const idx = messages.findIndex((m) => m.id === reply.id);
      if (idx >= 0) {
        try {
          listRef.current?.scrollToIndex({
            index: idx,
            animated: true,
            viewPosition: 0.5,
          });
        } catch {}
      }
    },
    [messages],
  );

  const handleMediaTap = useCallback((url, contentType) => {
    if (!url) return;
    if (contentType === ContentType.Image) setImageViewer({ uri: url });
  }, []);

  const handleUnmatch = useCallback(async () => {
    try {
      await chatService.deactivateConversation(conversationId);
      navigation.goBack();
    } catch (err) {
      Alert.alert("Hata", "Eşleşme kaldırılamadı.");
    }
  }, [conversationId, navigation]);

  const handleRestore = useCallback(async () => {
    try {
      const ok = await chatService.restoreConversation(conversationId);
      if (!ok)
        Alert.alert("Geri alınamadı", "24 saatlik süre dolmuş olabilir.");
    } catch (err) {
      Alert.alert("Hata", "Geri alma başarısız.");
    }
  }, [conversationId]);

  const handleBlock = useCallback(async () => {
    if (!partner?.userId) return;
    try {
      await moderationService.blockUser(partner.userId);
      Alert.alert(
        "Engellendi",
        "Bu kişi seninle bir daha iletişim kuramayacak.",
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert(
        "Hata",
        err?.response?.data?.message || "Engelleme başarısız.",
      );
    }
  }, [partner?.userId, navigation]);

  const handleSearchSelect = useCallback(
    (msg) => {
      setSearchOpen(false);
      const idx = messages.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        setTimeout(() => {
          try {
            listRef.current?.scrollToIndex({
              index: idx,
              animated: true,
              viewPosition: 0.3,
            });
          } catch {}
        }, 300);
      }
    },
    [messages],
  );

  const canRestore = !isActive;
  const messagesWithSeparators = useMemo(() => {
    const hasRealMessage = messages.some((m) => !m.isSystemMessage);
    const filtered = hasRealMessage
      ? messages.filter(
          (m) => !(m.isSystemMessage && m.localizationKey === "system.match_created"),
        )
      : messages;
    return withDateSeparators(filtered);
  }, [messages]);

  const renderItem = useCallback(
    ({ item }) => {
      if (item.__separator) return <DateSeparator label={item.label} />;
      return (
        <MessageBubble
          message={item}
          isOwn={item.senderId === myUserId}
          onLongPress={(layout) => handleLongPressMessage(item, layout)}
          onReplyTap={handleScrollToReplyTarget}
          onMediaTap={handleMediaTap}
          onRetryTap={() => handleRetrySend(item)}
          onReply={handleReply}
          onEdit={handleEditStart}
          onDelete={handleDelete}
          onCopy={handleCopyMessage}
          onPickReaction={handlePickReaction}
          i18nResolver={i18nResolver}
        />
      );
    },
    [
      myUserId,
      handleLongPressMessage,
      handleScrollToReplyTarget,
      handleMediaTap,
      handleReply,
      handleEditStart,
      handleDelete,
      handleCopyMessage,
      handlePickReaction,
    ],
  );

  const renderScrollComponent = useCallback(
    (scrollProps) => <ChatScrollComponent {...scrollProps} />,
    [],
  );

  const { colors: headerMaskColors, locations: headerMaskLocations } = useMemo(
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

  return (
    <View className="flex-1 bg-bg-deep">
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        }}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MaskedView
            maskElement={
              <LinearGradient
                locations={headerMaskLocations}
                colors={headerMaskColors}
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
        </View>

        <View style={{ paddingTop: insets.top, paddingBottom: 30 }}>
          <ChatHeader
            partner={partner}
            onBack={() => navigation.goBack()}
            onMenu={() => setOptionsOpen(true)}
          />
          <QuotaBanner quota={quota} isPremium={isPremium} />
        </View>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={messagesWithSeparators}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        inverted
        renderScrollComponent={renderScrollComponent}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: insets.top + HEADER_CONTENT,
          paddingTop: INPUT_BAR_OPAQUE + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={10}
        onEndReached={loadMoreOlder}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingHistory && messages.length > 0 ? (
            <View style={{ paddingVertical: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        ListHeaderComponent={
          partnerTyping ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
              <TypingIndicator />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loadingHistory ? (
            <ChatEmptyState
              partnerName={partner?.displayName}
              isActive={isActive}
            />
          ) : null
        }
      />

      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
      >
        <MessageInput
          conversationId={conversationId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={(payload) => {
            handleSend(payload);
            setReplyTo(null);
          }}
          onTypingChange={handleTypingChange}
          disabled={!isActive}
          quotaLocked={
            !isPremium &&
            !quota?.bothPremium &&
            !quota?.isUnlocked &&
            (quota?.requiresUnlock ||
              (quota?.remainingMessages != null &&
                quota.remainingMessages <= 0))
          }
          onLockedPress={() => setUnlockVisible(true)}
        />
      </KeyboardStickyView>

      <MessageActionSheet
        visible={!!actionTarget}
        message={actionTarget}
        layout={actionLayout}
        isOwn={actionTarget?.senderId === myUserId}
        onClose={() => setActionTarget(null)}
        onPickReaction={(emoji) => handlePickReaction(actionTarget, emoji)}
        onReply={() => handleReply(actionTarget)}
        onEdit={() => handleEditStart(actionTarget)}
        onDelete={(forEveryone) => handleDelete(actionTarget, forEveryone)}
      />
      <ImageViewer
        visible={!!imageViewer}
        uri={imageViewer?.uri}
        onClose={() => setImageViewer(null)}
      />
      <ConversationOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        isActive={isActive}
        canRestore={canRestore}
        onSearch={() => setSearchOpen(true)}
        onUnmatch={handleUnmatch}
        onRestore={handleRestore}
        onReport={() => setReportOpen(true)}
        onBlock={handleBlock}
      />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reportedUserId={partner?.userId}
        conversationId={conversationId}
      />
      <SearchSheet
        visible={searchOpen}
        conversationId={conversationId}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
      <EditMessageModal
        target={editTarget}
        text={editText}
        onChangeText={setEditText}
        onCancel={() => setEditTarget(null)}
        onSave={handleEditSave}
      />
      <ChatUnlockSheet
        visible={unlockVisible}
        conversationId={conversationId}
        onClose={() => setUnlockVisible(false)}
      />
    </View>
  );
}

function QuotaBanner({ quota, isPremium }: any) {
  if (!quota && !isPremium) return null;
  if (quota?.bothPremium) return null;

  // FE-side override: kullanıcı premium ise quota banner'ı "Sınırsız" göster, sınır
  // banner'ını gösterme. Backend webhook gecikmesinde bayat quota cache "limit reached"
  // gösteriyordu; isPremium /sync ile zaten doğrulanmış olduğu için güvenli.
  if (isPremium || quota?.isUnlocked) {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: "rgba(52,211,153,0.08)",
          borderBottomWidth: 0.5,
          borderBottomColor: "rgba(255,255,255,0.05)",
        }}
      >
        <InfinityIcon
          size={14}
          color={colors.success}
          strokeWidth={2}
          pointerEvents="none"
        />
        <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>
          Sınırsız sohbet
        </Text>
      </View>
    );
  }

  const remaining = quota.remainingMessages;
  if (remaining == null) return null;

  // Limit dolduğunda banner gösterme — input içinde lock + placeholder hint'i
  // (MessageInput.quotaLocked) artık bu durumu üstleniyor.
  if (remaining <= 0 || quota.requiresUnlock) {
    return null;
  }

  if (remaining <= 10) {
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: "rgba(245,118,86,0.08)",
          borderBottomWidth: 0.5,
          borderBottomColor: "rgba(255,255,255,0.05)",
        }}
      >
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
          {remaining} mesaj hakkın kaldı — ikiniz Premium olursanız sınırsız
          olur
        </Text>
      </View>
    );
  }
  return null;
}

function ChatHeader({ partner, onBack, onMenu }: any) {
  const displayName = partner?.displayName || "Kullanıcı";
  return (
    <View
      style={{
        position: "relative",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 88,
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 24,
          top: 8,
        }}
      >
        {Platform.OS === "ios" ? (
          <Host matchContents>
            <SwiftUIButton
              label="Geri"
              systemImage="chevron.left"
              onPress={onBack}
              modifiers={[
                buttonStyle("glass"),
                tint(colors.text),
                controlSize("large"),
                labelStyle("iconOnly"),
                font({ size: 22, weight: "semibold" }),
                frame({ width: 44, height: 44 }),
              ]}
            />
          </Host>
        ) : (
          <TouchableOpacity onPress={onBack} hitSlop={10} className="p-2">
            <ChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ alignItems: "center", maxWidth: "60%" }}>
        <Animated.View
          entering={ZoomIn.springify().damping(11).mass(0.7).stiffness(140)}
        >
          {partner?.profileImageUrl ? (
            <Image
              source={{ uri: partner.profileImageUrl }}
              style={{ width: 65, height: 65, borderRadius: 999 }}
              cachePolicy="memory-disk"
              transition={400}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: 65,
                height: 65,
                borderRadius: 999,
                backgroundColor: colors.surface3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text className="text-white font-bold">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={{ marginTop: 6 }}>
          {Platform.OS === "ios" ? (
            <Host matchContents>
              <SwiftUIText
                modifiers={[
                  padding({ horizontal: 10, vertical: 4 }),
                  glassEffect({
                    glass: { variant: "regular" },
                    shape: "capsule",
                  }),
                  foregroundStyle(colors.text),
                  font({ size: 13, weight: "semibold" }),
                ]}
              >
                {displayName}
              </SwiftUIText>
            </Host>
          ) : (
            <BlurView
              intensity={50}
              tint="dark"
              style={{
                borderRadius: 999,
                overflow: "hidden",
                paddingHorizontal: 12,
                paddingVertical: 4,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: "600",
                  maxWidth: 140,
                }}
              >
                {displayName}
              </Text>
            </BlurView>
          )}
        </View>
      </View>

      <View
        style={{
          position: "absolute",
          right: 24,
          top: 8,
        }}
      >
        {Platform.OS === "ios" ? (
          <Host matchContents>
            <SwiftUIButton
              label="Menü"
              systemImage="ellipsis"
              onPress={onMenu}
              modifiers={[
                buttonStyle("glass"),
                controlSize("large"),
                tint(colors.text),
                labelStyle("iconOnly"),
                font({ size: 20, weight: "semibold" }),
                frame({ width: 44, height: 44 }),
              ]}
            />
          </Host>
        ) : (
          <TouchableOpacity hitSlop={10} className="p-2" onPress={onMenu}>
            <MoreVertical size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function EditMessageModal({ target, text, onChangeText, onCancel, onSave }: any) {
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <Pressable onPress={() => {}} className="bg-surface-2 rounded-2xl p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-semibold text-base">
              Mesajı düzenle
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={6}>
              <X size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            maxLength={2000}
            className="text-white text-base bg-bg-deep rounded-xl p-3"
            style={{ minHeight: 80, maxHeight: 160, textAlignVertical: "top" }}
            placeholderTextColor={colors.textMuted}
          />
          <Text className="text-gray-500 text-xs mt-2">
            15 dakika içinde gönderilen mesajlar düzenlenebilir.
          </Text>
          <View className="flex-row justify-end mt-3">
            <TouchableOpacity onPress={onCancel} className="px-4 py-2 mr-2">
              <Text className="text-gray-400">İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-white font-semibold">Kaydet</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function buildReplyPreview(messages, replyToId) {
  const original = messages.find((m) => m.id === replyToId);
  if (!original) return null;
  return {
    id: original.id,
    senderId: original.senderId,
    senderDisplayName: original.senderDisplayName,
    contentPreview: (original.content || "").slice(0, 120),
    contentType: original.contentType ?? 0,
    isDeleted: !!original.deletedAt,
  };
}

function ChatEmptyState({ partnerName, isActive }: any) {
  return (
    <View
      style={{
        transform: [{ scaleY: -1 }],
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
        paddingHorizontal: 32,
      }}
    >
      <Text style={{ fontSize: 36, marginBottom: 12 }}>👋</Text>
      <Text className="text-white text-lg font-bold text-center">
        {isActive
          ? `${partnerName || "Yeni eşleşmen"} ile sohbete başla`
          : "Bu sohbet kapalı"}
      </Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        {isActive
          ? "İlk mesajı sen at — gerisini doğal akışına bırak."
          : "Geçmiş mesajları görüntüleyebilirsin."}
      </Text>
    </View>
  );
}
