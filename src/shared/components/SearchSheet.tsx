import { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X } from 'lucide-react-native';
import chatService from '@/features/chat/chatService';

const DEBOUNCE_MS = 300;

/**
 * Conversation içinde mesaj arama. backend chatService.searchMessages → MessageDto[].
 * Tap → sonucu seçer, parent ChatScreen scroll-to-message yapar.
 */
export default function SearchSheet({ visible, conversationId, onClose, onSelect }: any) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setTotal(0);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await chatService.searchMessages(conversationId, query.trim(), 50);
        setResults(data.matches || []);
        setTotal(data.totalCount || 0);
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, conversationId]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', paddingTop: insets.top }}>
        <View className="flex-row items-center px-3 py-2 border-b border-[#1a1a1a]">
          <TouchableOpacity onPress={onClose} hitSlop={10} className="p-2">
            <X size={24} color="#fff" />
          </TouchableOpacity>
          <View className="flex-1 flex-row items-center bg-[#1f1f1f] rounded-full px-3 py-2 ml-2">
            <SearchIcon size={18} color="#9ca3af" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Mesajlarda ara…"
              placeholderTextColor="#6b7280"
              className="flex-1 text-white text-base ml-2"
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
            {!!query && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={6}>
                <X size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {loading && (
          <View className="py-4 items-center">
            <ActivityIndicator size="small" color="#f57656" />
          </View>
        )}

        {!loading && query.trim().length >= 2 && (
          <Text className="text-gray-500 text-xs px-4 py-2">
            {total} sonuç
          </Text>
        )}

        <FlatList
          data={results}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect?.(item)}
              className="px-4 py-3 border-b border-[#1a1a1a]"
              android_ripple={{ color: '#222' }}
            >
              <Text className="text-gray-400 text-xs mb-1">
                {item.senderDisplayName || 'Kullanıcı'} • {formatTime(item.sentAt)}
              </Text>
              <Text className="text-white text-sm" numberOfLines={2}>
                {item.content}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            !loading && query.trim().length >= 2 ? (
              <View className="items-center py-8">
                <Text className="text-gray-500">Eşleşme yok</Text>
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}
