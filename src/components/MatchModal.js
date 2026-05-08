import { useEffect, useRef } from 'react';
import { Modal, View, Text, Image, TouchableOpacity, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

/**
 * "It's a Match!" overlay — backend MatchNotification event'i geldikten sonra global olarak gösterilir.
 *
 * Props:
 *   match: MatchNotificationDto | null  (null = kapalı)
 *   onClose()
 *   onSendMessage(conversationId)  — "Mesaj At" → ChatScreen'e nav et
 */
export default function MatchModal({ match, onClose, onSendMessage }) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!match) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    return () => {
      scale.setValue(0.6);
      opacity.setValue(0);
    };
  }, [match]);

  if (!match) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.92)',
          justifyContent: 'center',
          alignItems: 'center',
          opacity,
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          style={{ position: 'absolute', top: 60, right: 24 }}
          hitSlop={10}
        >
          <X size={28} color="#fff" />
        </TouchableOpacity>

        <Animated.View style={{ transform: [{ scale }], alignItems: 'center', paddingHorizontal: 32 }}>
          <LinearGradient
            colors={['#f57656', '#e0457b', '#9333ea']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 999,
              marginBottom: 32,
            }}
          >
            <Text className="text-white font-bold text-3xl">It's a Match! 🎉</Text>
          </LinearGradient>

          {!!match.matchedUserPhoto && (
            <View
              style={{
                shadowColor: '#f57656',
                shadowOpacity: 0.5,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <Image
                source={{ uri: match.matchedUserPhoto }}
                style={{
                  width: 180,
                  height: 240,
                  borderRadius: 32,
                  borderWidth: 3,
                  borderColor: '#f57656',
                }}
              />
            </View>
          )}

          <Text className="text-white text-2xl font-bold mt-6">
            {match.matchedUserName}
          </Text>
          <Text className="text-gray-400 text-base mt-2 text-center">
            ile eşleştin! İlk mesajı sen at.
          </Text>

          <TouchableOpacity
            onPress={() => onSendMessage?.(match.conversationId)}
            className="mt-8 flex-row items-center px-8 py-4 rounded-full"
            style={{ backgroundColor: '#f57656' }}
          >
            <MessageCircle size={22} color="#fff" />
            <Text className="text-white font-bold text-base ml-2">Mesaj At</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} className="mt-3 px-4 py-2">
            <Text className="text-gray-400 text-sm">Daha sonra</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
