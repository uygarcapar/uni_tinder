import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Bell, Heart, MessageCircle, Sparkles, ChevronLeft } from 'lucide-react-native';
import notificationsService from '../services/notificationsService';
import realtimeService from '../services/realtimeService';

const ICONS = {
  Match: { Icon: Sparkles, color: '#f57656' },
  Like: { Icon: Heart, color: '#e0457b' },
  SuperLike: { Icon: Heart, color: '#3b82f6' },
  Message: { Icon: MessageCircle, color: '#34d399' },
  System: { Icon: Bell, color: '#9ca3af' },
  MissedMatch: { Icon: Sparkles, color: '#f59e0b' },
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPage = useCallback(async (p, append = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await notificationsService.getFeed({ page: p, pageSize: 30 });
      setItems((prev) => append ? [...prev, ...data.items] : data.items);
      setHasMore(data.hasMore);
      setPage(data.page);
      // Sayfayı açtıktan sonra hepsini okundu işaretle (UX standardı).
      if (!append) {
        notificationsService.markAllRead().catch(() => {});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loading]);

  useEffect(() => {
    fetchPage(1);
    // NewNotification event'i geldikçe feed'i refresh et.
    const unsub = realtimeService.on('NewNotification', () => {
      fetchPage(1);
    });
    return unsub;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPage(1);
  }, [fetchPage]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  }, [hasMore, loading, page, fetchPage]);

  const handleTap = useCallback(async (item) => {
    if (!item.isRead) {
      notificationsService.markRead(item.id).catch(() => {});
    }
    // Deep-link by type.
    if (item.relatedEntityId) {
      if (item.type === 'Message' || item.type === 'Match') {
        navigation.navigate('Chat', {
          conversationId: item.relatedEntityId,
          partner: undefined,
          isActive: true,
        });
      }
      // Like / SuperLike → Likes tab (gelecekte route eklenebilir)
    }
  }, [navigation]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-[#0a0a0a]">
      <View className="flex-row items-center px-3 py-3 border-b border-[#1a1a1a]">
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} className="p-2">
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold flex-1 ml-2">Bildirimler</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NotificationRow item={item} onPress={() => handleTap(item)} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f57656" />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loading && items.length > 0 ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator size="small" color="#f57656" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center justify-center py-20">
              <Bell size={48} color="#3a3a3a" />
              <Text className="text-white text-lg font-bold mt-4">Henüz bildirim yok</Text>
              <Text className="text-gray-400 text-sm mt-2 text-center px-8">
                Eşleşme + mesajların burada görünecek.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
    </SafeAreaView>
  );
}

function NotificationRow({ item, onPress }) {
  const meta = ICONS[item.type] || ICONS.System;
  const Icon = meta.Icon;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`flex-row items-center px-4 py-3 border-b border-[#1a1a1a] ${
        !item.isRead ? 'bg-[#f57656]/5' : ''
      }`}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: meta.color + '20',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={meta.color} />
      </View>
      <View className="flex-1 ml-3">
        <Text
          className={`text-base ${!item.isRead ? 'text-white font-semibold' : 'text-gray-200'}`}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {!!item.body && (
          <Text className="text-gray-400 text-sm mt-0.5" numberOfLines={2}>
            {item.body}
          </Text>
        )}
        <Text className="text-gray-500 text-xs mt-1">
          {formatTime(item.createdAt)}
        </Text>
      </View>
      {!item.isRead && (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#f57656',
          }}
        />
      )}
    </TouchableOpacity>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m}d`;
  if (h < 24) return `${h}s`;
  if (day < 7) return `${day}g`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
}
