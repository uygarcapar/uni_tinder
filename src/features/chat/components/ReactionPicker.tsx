import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

/**
 * Mesaj uzun basışında açılan reaction picker.
 * Modal — full screen overlay, tap outside ile kapanır.
 *
 * Props:
 *  visible, onClose, onPick(emoji)
 */
export default function ReactionPicker({ visible, onClose, onPick }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          className="flex-row items-center px-3 py-3 rounded-full bg-surface-2"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 12,
            elevation: 12,
          }}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onPick(emoji);
                onClose();
              }}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ fontSize: 32 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
