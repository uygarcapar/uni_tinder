import { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { MessageCircle, Trash2, Bell } from 'lucide-react-native';
import {
  fetchConversations,
  setActiveConversation,
} from '../store/slices/chatSlice';
import chatService from '../services/chatService';

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
      navigation.navigate('Chat', {
        conversationId: conv.conversationId,
        partner: {
          userId: conv.partnerUserId,
          displayName: conv.partnerDisplayName,
          profileImageUrl: conv.partnerProfileImageUrl,
        },
        isActive: conv.isActive,
      });
    },
    [dispatch, navigation]
  );

  const handleLongPress = useCallback((conv) => {
    if (!conv.isActive) {
      // Kapanmış sohbet — restore offer (24h grace).
      Alert.alert(
        'Eşleşmeyi geri al',
        'Bu sohbet sonlandırıldı. 24 saat içinde geri alabilirsin.',
        [
          { text: 'İptal', style: 'cancel' },
          {
            text: 'Geri Al',
            onPress: async () => {
              try {
                const ok = await chatService.restoreConversation(conv.conversationId);
                if (!ok) {
                  Alert.alert('Geri alınamadı', '24 saatlik süre dolmuş olabilir.');
                }
                dispatch(fetchConversations());
              } catch (err) {
                Alert.alert('Hata', 'İşlem başarısız.');
              }
            },
          },
        ],
      );
      return;
    }
    // Aktif sohbet — unmatch confirm.
    Alert.alert(
      'Eşleşmeyi kaldır',
      `${conv.partnerDisplayName || 'Kullanıcı'} ile sohbeti sonlandır. 24 saat içinde geri alabilirsin.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deactivateConversation(conv.conversationId);
              dispatch(fetchConversations());
            } catch (err) {
              Alert.alert('Hata', 'Eşleşme kaldırılamadı.');
            }
          },
        },
      ],
    );
  }, [dispatch]);

  const renderItem = ({ item }) => (
    <ConversationRow
      conv={item}
      isTyping={Object.keys(typingByConv?.[item.conversationId] || {}).length > 0}
      onPress={() => openChat(item)}
      onLongPress={() => handleLongPress(item)}
    />
  );

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-[#0a0a0a]">
      <View className="px-5 py-4 border-b border-[#1a1a1a] flex-row items-center justify-between">
        <Text className="text-white text-2xl font-bold">Mesajlar</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Notifications')}
          hitSlop={10}
          className="p-2"
        >
          <Bell size={22} color="#fff" />
        </TouchableOpacity>
      </View>

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
    </SafeAreaView>
  );
}

function ConversationRow({ conv, isTyping, onPress, onLongPress }) {
  const subtitle = useMemo(() => {
    if (isTyping) return 'yazıyor…';
    if (!conv.lastMessagePreview) return 'Konuşmaya başla 👋';
    return conv.lastMessagePreview;
  }, [isTyping, conv.lastMessagePreview]);

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
              backgroundColor: '#262626',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text className="text-white text-xl font-bold">
              {(conv.partnerDisplayName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Online dot */}
        {conv.partnerIsOnline && (
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: '#34d399',
              borderWidth: 2,
              borderColor: '#0a0a0a',
            }}
          />
        )}
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-base font-semibold ${conv.isActive ? 'text-white' : 'text-gray-500'}`}
            numberOfLines={1}
          >
            {conv.partnerDisplayName || 'Kullanıcı'}
          </Text>
          {conv.lastMessageAt && (
            <Text className="text-gray-500 text-xs ml-2">
              {formatRelativeTime(conv.lastMessageAt)}
            </Text>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-1">
          <Text
            className={`text-sm ${isTyping ? 'text-[#f57656]' : 'text-gray-400'}`}
            numberOfLines={1}
            style={{ flex: 1 }}
          >
            {!conv.isActive ? 'Sohbet kapatıldı' : subtitle}
          </Text>

          {conv.unreadCount > 0 && (
            <View
              className="ml-2 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#f57656', minWidth: 22, alignItems: 'center' }}
            >
              <Text className="text-white text-xs font-bold">
                {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
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
      <Text className="text-white text-lg font-bold mt-4">Henüz mesajın yok</Text>
      <Text className="text-gray-400 text-sm text-center mt-2">
        Eşleştiğin kişilerle konuşmaya başlamak için Keşfet sekmesini kullan.
      </Text>
    </View>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'şimdi';
  if (diffMin < 60) return `${diffMin}d`;
  if (diffH < 24) return `${diffH}s`;
  if (diffD < 7) return `${diffD}g`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}
