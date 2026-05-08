import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronLeft, MoreVertical, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  fetchHistory,
  setActiveConversation,
  appendOptimisticMessage,
  failOptimisticMessage,
  removeOptimisticMessage,
  clearUnreadForConversation,
} from '../store/slices/chatSlice';
import chatService from '../services/chatService';
import realtimeService from '../services/realtimeService';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import TypingIndicator from '../components/TypingIndicator';
import MessageActionSheet from '../components/MessageActionSheet';
import ImageViewer from '../components/ImageViewer';
import ConversationOptionsSheet from '../components/ConversationOptionsSheet';
import SearchSheet from '../components/SearchSheet';
import ReportModal from '../components/ReportModal';
import DateSeparator, { withDateSeparators } from '../components/DateSeparator';
import moderationService from '../services/moderationService';

const ContentType = { Text: 0, Image: 1, Voice: 2, Video: 3, System: 99 };

const SYSTEM_MESSAGES_TR = {
  'system.match_created': 'Yeni bir eşleşmen var! 🎉 İlk mesajı sen at.',
  'system.conversation_deleted': 'Bu sohbet sonlandırıldı.',
};
const i18nResolver = (key, fallback) => SYSTEM_MESSAGES_TR[key] || fallback;

export default function ChatScreen({ route, navigation }) {
  const { conversationId, partner, isActive: routeIsActive } = route.params;
  const dispatch = useDispatch();
  const insets = useSafeAreaInsets();

  const myUserId = useSelector((s) => s.auth.user?.userId || s.auth.user?.id);
  const bucket = useSelector((s) => s.chat.messagesByConv[conversationId]);
  const messages = bucket?.messages || [];
  const hasMore = bucket?.hasMore;
  const nextCursor = bucket?.nextCursor;
  const loadingHistory = bucket?.loading;

  const typingMap = useSelector((s) => s.chat.typingByConv[conversationId]);
  const partnerTyping = useMemo(
    () => Object.keys(typingMap || {}).some((uid) => uid !== myUserId),
    [typingMap, myUserId]
  );

  const presence = useSelector((s) => s.chat.presenceByUser[partner?.userId]);
  const conv = useSelector((s) =>
    s.chat.conversations.find((c) => c.conversationId === conversationId)
  );
  const isActive = conv ? conv.isActive : routeIsActive ?? true;

  const [replyTo, setReplyTo] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editText, setEditText] = useState('');
  const [imageViewer, setImageViewer] = useState(null); // { uri }
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const deliveredAckedRef = useRef(new Set()); // tek seferlik ack
  const listRef = useRef(null);

  // Active conversation life-cycle.
  useEffect(() => {
    dispatch(setActiveConversation(conversationId));
    return () => {
      dispatch(setActiveConversation(null));
    };
  }, [conversationId, dispatch]);

  // İlk yüklemede history fetch + Hub join + mark read.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await dispatch(fetchHistory({ conversationId, cursor: null, pageSize: 30 }));
        if (!mounted) return;
        await realtimeService.joinConversation(conversationId).catch(() => {});
        await chatService.markRead(conversationId).catch(() => {});
        dispatch(clearUnreadForConversation(conversationId));
      } catch (err) {
        console.warn('chat init err:', err?.message);
      }
    })();
    return () => { mounted = false; };
  }, [conversationId, dispatch]);

  // Bulk delivered ack — gelen tüm partner mesajlarına delivered ack at.
  // Set ile dedup; her mesaj sadece bir kez ack'lanır.
  useEffect(() => {
    if (!myUserId) return;
    const undelivered = messages.filter(
      (m) =>
        m.senderId
        && m.senderId !== myUserId
        && !m.deliveredAt
        && !m.isSystemMessage
        && !deliveredAckedRef.current.has(m.id)
    );
    undelivered.forEach((m) => {
      deliveredAckedRef.current.add(m.id);
      realtimeService.markMessageDelivered(m.id).catch(() => {});
    });
  }, [messages, myUserId]);

  // Yeni partner mesajı geldiğinde mark-read (active conv açıkken).
  // messages length değişimine react eder; throttle gerekmez (bulk DB update zaten ucuz).
  useEffect(() => {
    if (!isActive) return;
    const hasUnreadFromPartner = messages.some(
      (m) => m.senderId && m.senderId !== myUserId && !m.readAt && !m.isSystemMessage
    );
    if (hasUnreadFromPartner) {
      chatService.markRead(conversationId).catch(() => {});
    }
  }, [messages, conversationId, isActive, myUserId]);

  const loadMoreOlder = useCallback(() => {
    if (loadingHistory || !hasMore || !nextCursor) return;
    dispatch(fetchHistory({ conversationId, cursor: nextCursor, pageSize: 30 }));
  }, [conversationId, dispatch, hasMore, loadingHistory, nextCursor]);

  const handleSend = useCallback(async ({ content, contentType, mediaUrl, replyToMessageId, clientMessageId }) => {
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

    dispatch(appendOptimisticMessage({ conversationId, message: optimistic }));
    listRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      // Hub yolu sadece TEXT için — media/reply zorunlu olarak HTTP (Hub method imzası bu alanları taşımaz).
      const useHub = realtimeService.isConnected()
        && contentType === ContentType.Text
        && !replyToMessageId
        && !mediaUrl;

      if (useHub) {
        await realtimeService.sendMessage(conversationId, content, clientMessageId);
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
    } catch (err) {
      console.warn('send failed:', err?.message);
      dispatch(failOptimisticMessage({ conversationId, clientMessageId }));
    }
  }, [conversationId, dispatch, messages, myUserId]);

  const handleTypingChange = useCallback((isTyping) => {
    if (isTyping) realtimeService.startTyping(conversationId).catch(() => {});
    else realtimeService.stopTyping(conversationId).catch(() => {});
  }, [conversationId]);

  const handleLongPressMessage = useCallback((message) => {
    if (message._pending || message._failed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setActionTarget(message);
  }, []);

  const handlePickReaction = useCallback(async (emoji) => {
    if (!actionTarget) return;
    try {
      await chatService.addReaction(actionTarget.id, emoji);
    } catch (err) {
      console.warn('reaction failed:', err?.message);
    }
  }, [actionTarget]);

  const handleReply = useCallback(() => {
    if (!actionTarget) return;
    setReplyTo({
      id: actionTarget.id,
      senderId: actionTarget.senderId,
      senderDisplayName: actionTarget.senderDisplayName,
      contentPreview: (actionTarget.content || '').slice(0, 120),
      contentType: actionTarget.contentType,
      isDeleted: !!actionTarget.deletedAt,
    });
  }, [actionTarget]);

  const handleEditStart = useCallback(() => {
    if (!actionTarget) return;
    setEditTarget(actionTarget);
    setEditText(actionTarget.content || '');
  }, [actionTarget]);

  const handleEditSave = useCallback(async () => {
    if (!editTarget) return;
    const trimmed = editText.trim();
    if (!trimmed || trimmed === editTarget.content) {
      setEditTarget(null);
      return;
    }
    try {
      await chatService.editMessage(editTarget.id, trimmed);
    } catch (err) {
      Alert.alert('Hata', err?.response?.data?.message || 'Mesaj düzenlenemedi.');
    }
    setEditTarget(null);
    setEditText('');
  }, [editTarget, editText]);

  const handleDelete = useCallback(async (forEveryone) => {
    if (!actionTarget) return;
    try {
      await chatService.deleteMessage(actionTarget.id, forEveryone);
    } catch (err) {
      Alert.alert('Hata', err?.response?.data?.message || 'Silme başarısız.');
    }
  }, [actionTarget]);

  // Failed optimistic mesaj — tap ile yeniden gönder. State'ten çıkar + handleSend tekrar çağır.
  const handleRetrySend = useCallback((failedMsg) => {
    if (!failedMsg?._failed) return;
    dispatch(removeOptimisticMessage({
      conversationId,
      clientMessageId: failedMsg.clientMessageId,
    }));
    handleSend({
      content: failedMsg.content,
      contentType: failedMsg.contentType,
      mediaUrl: failedMsg.mediaUrl,
      replyToMessageId: failedMsg.replyTo?.id,
      clientMessageId: failedMsg.clientMessageId,
    });
  }, [conversationId, dispatch, handleSend]);

  const handleScrollToReplyTarget = useCallback((reply) => {
    if (!reply?.id) return;
    const idx = messages.findIndex((m) => m.id === reply.id);
    if (idx >= 0) {
      try {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      } catch {}
    }
  }, [messages]);

  const handleMediaTap = useCallback((url, contentType) => {
    if (!url) return;
    if (contentType === ContentType.Image) {
      setImageViewer({ uri: url });
    }
    // Video/Voice şimdilik no-op — expo-av ile playback eklenebilir.
  }, []);

  const handleUnmatch = useCallback(async () => {
    try {
      await chatService.deactivateConversation(conversationId);
      navigation.goBack();
    } catch (err) {
      Alert.alert('Hata', 'Eşleşme kaldırılamadı.');
    }
  }, [conversationId, navigation]);

  const handleRestore = useCallback(async () => {
    try {
      const ok = await chatService.restoreConversation(conversationId);
      if (!ok) {
        Alert.alert('Geri alınamadı', '24 saatlik süre dolmuş olabilir.');
      }
    } catch (err) {
      Alert.alert('Hata', 'Geri alma başarısız.');
    }
  }, [conversationId]);

  const handleBlock = useCallback(async () => {
    if (!partner?.userId) return;
    try {
      await moderationService.blockUser(partner.userId);
      Alert.alert('Engellendi', 'Bu kişi seninle bir daha iletişim kuramayacak.');
      navigation.goBack();
    } catch (err) {
      Alert.alert('Hata', err?.response?.data?.message || 'Engelleme başarısız.');
    }
  }, [partner?.userId, navigation]);

  const handleSearchSelect = useCallback((msg) => {
    setSearchOpen(false);
    // Sonuç mesajı state'te yoksa scrollToIndex çalışmayabilir;
    // basit yaklaşım: mevcut listede ara; yoksa kullanıcı uyarılır.
    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx >= 0) {
      setTimeout(() => {
        try {
          listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
        } catch {}
      }, 300);
    }
  }, [messages]);

  // canRestore: sadece kapanmış sohbet + UnmatchedByUserId === self değilse backend
  // false döner; ama şu an conv list'e UnmatchedByUserId yansımadığı için optimistic
  // göstereceğiz — backend authoritative.
  const canRestore = !isActive;

  // Date separator'ları araya iliştir — gün değişimlerinde gösterilir.
  const messagesWithSeparators = useMemo(
    () => withDateSeparators(messages),
    [messages]
  );

  const renderItem = useCallback(({ item }) => {
    if (item.__separator) {
      return <DateSeparator label={item.label} />;
    }
    return (
      <MessageBubble
        message={item}
        isOwn={item.senderId === myUserId}
        onLongPress={() => handleLongPressMessage(item)}
        onReplyTap={handleScrollToReplyTarget}
        onMediaTap={handleMediaTap}
        onRetryTap={() => handleRetrySend(item)}
        i18nResolver={i18nResolver}
      />
    );
  }, [myUserId, handleLongPressMessage, handleScrollToReplyTarget, handleMediaTap]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#0a0a0a]">
      <ChatHeader
        partner={partner}
        isOnline={presence?.isOnline}
        isTyping={partnerTyping}
        onBack={() => navigation.goBack()}
        onMenu={() => setOptionsOpen(true)}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messagesWithSeparators}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
          onEndReached={loadMoreOlder}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingHistory && messages.length > 0 ? (
              <View style={{ paddingVertical: 12 }}>
                <ActivityIndicator size="small" color="#f57656" />
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
              <ChatEmptyState partnerName={partner?.displayName} isActive={isActive} />
            ) : null
          }
          onScrollToIndexFailed={() => {}}
        />

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
        />
      </KeyboardAvoidingView>

      <MessageActionSheet
        visible={!!actionTarget}
        message={actionTarget}
        isOwn={actionTarget?.senderId === myUserId}
        onClose={() => setActionTarget(null)}
        onPickReaction={handlePickReaction}
        onReply={handleReply}
        onEdit={handleEditStart}
        onDelete={handleDelete}
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
    </SafeAreaView>
  );
}

function ChatHeader({ partner, isOnline, isTyping, onBack, onMenu }) {
  const subtitle = isTyping ? 'yazıyor…' : isOnline ? 'çevrimiçi' : 'çevrimdışı';
  return (
    <View className="flex-row items-center px-3 py-2 border-b border-[#1a1a1a]">
      <TouchableOpacity onPress={onBack} hitSlop={10} className="p-2 mr-1">
        <ChevronLeft size={26} color="#fff" />
      </TouchableOpacity>

      {partner?.profileImageUrl ? (
        <Image
          source={{ uri: partner.profileImageUrl }}
          style={{ width: 38, height: 38, borderRadius: 19 }}
        />
      ) : (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: '#262626',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-white font-bold">
            {(partner?.displayName || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      <View className="flex-1 ml-3">
        <Text className="text-white text-base font-semibold" numberOfLines={1}>
          {partner?.displayName || 'Kullanıcı'}
        </Text>
        <Text
          className={`text-xs ${isTyping ? 'text-[#f57656]' : isOnline ? 'text-[#34d399]' : 'text-gray-500'}`}
        >
          {subtitle}
        </Text>
      </View>

      <TouchableOpacity hitSlop={10} className="p-2" onPress={onMenu}>
        <MoreVertical size={22} color="#9ca3af" />
      </TouchableOpacity>
    </View>
  );
}

function EditMessageModal({ target, text, onChangeText, onCancel, onSave }) {
  if (!target) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Pressable onPress={() => {}} className="bg-[#1f1f1f] rounded-2xl p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-semibold text-base">Mesajı düzenle</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={6}>
              <X size={20} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <TextInput
            value={text}
            onChangeText={onChangeText}
            multiline
            autoFocus
            maxLength={2000}
            className="text-white text-base bg-[#0a0a0a] rounded-xl p-3"
            style={{ minHeight: 80, maxHeight: 160, textAlignVertical: 'top' }}
            placeholderTextColor="#6b7280"
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
              style={{ backgroundColor: '#f57656' }}
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
    contentPreview: (original.content || '').slice(0, 120),
    contentType: original.contentType ?? 0,
    isDeleted: !!original.deletedAt,
  };
}

// Inverted FlatList — empty state yatayda alta düşer; ortalayan wrapper.
function ChatEmptyState({ partnerName, isActive }) {
  return (
    <View
      style={{
        // Inverted için transform — empty state yukarı dönmesin.
        transform: [{ scaleY: -1 }],
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 32,
      }}
    >
      <Text style={{ fontSize: 36, marginBottom: 12 }}>👋</Text>
      <Text className="text-white text-lg font-bold text-center">
        {isActive
          ? `${partnerName || 'Yeni eşleşmen'} ile sohbete başla`
          : 'Bu sohbet kapalı'}
      </Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        {isActive
          ? 'İlk mesajı sen at — gerisini doğal akışına bırak.'
          : 'Geçmiş mesajları görüntüleyebilirsin.'}
      </Text>
    </View>
  );
}
