import { Modal, View, Text, TouchableOpacity, Pressable } from 'react-native';
import {
  Reply,
  Pencil,
  Trash2,
  Copy,
  Smile,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

/**
 * Mesaj uzun-bas action sheet — emoji reactions + Reply/Edit/Delete/Copy.
 *
 * Edit/Delete sadece KENDİ mesajında + 15 dk pencere içinde gösterilir.
 * Reply/Copy/React her mesaj için.
 *
 * Props:
 *   message, isOwn, visible, onClose
 *   onPickReaction(emoji), onReply(), onEdit(), onDelete(forEveryone), onCopy()
 */
export default function MessageActionSheet({
  message,
  isOwn,
  visible,
  onClose,
  onPickReaction,
  onReply,
  onEdit,
  onDelete,
}) {
  if (!message) return null;

  const canEdit = isOwn
    && !message.isSystemMessage
    && !message.deletedAt
    && message.contentType === 0 // sadece text
    && isWithinEditWindow(message.sentAt);

  const canDelete = isOwn && !message.isSystemMessage && !message.deletedAt;

  const handleCopy = async () => {
    try {
      if (message.content) await Clipboard.setStringAsync(message.content);
      Haptics.selectionAsync().catch(() => {});
    } catch {}
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 360 }}>
          {/* Quick reactions row */}
          <View
            className="flex-row items-center justify-around px-3 py-3 rounded-full bg-[#1f1f1f] mb-3"
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
                  onPickReaction?.(emoji);
                  onClose();
                }}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                hitSlop={4}
              >
                <Text style={{ fontSize: 28 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action list */}
          <View className="rounded-2xl bg-[#1f1f1f] overflow-hidden">
            <ActionRow
              icon={<Reply size={20} color="#fff" />}
              label="Yanıtla"
              onPress={() => { onReply?.(); onClose(); }}
            />
            {!!message.content && (
              <ActionRow
                icon={<Copy size={20} color="#fff" />}
                label="Kopyala"
                onPress={handleCopy}
              />
            )}
            {canEdit && (
              <ActionRow
                icon={<Pencil size={20} color="#fff" />}
                label="Düzenle"
                onPress={() => { onEdit?.(); onClose(); }}
              />
            )}
            {canDelete && (
              <>
                <ActionRow
                  icon={<Trash2 size={20} color="#fca5a5" />}
                  label="Sadece benden sil"
                  destructive
                  onPress={() => { onDelete?.(false); onClose(); }}
                />
                <ActionRow
                  icon={<Trash2 size={20} color="#ef4444" />}
                  label="Herkes için sil"
                  destructive
                  onPress={() => { onDelete?.(true); onClose(); }}
                />
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({ icon, label, destructive, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center px-4 py-3 border-b border-[#262626]"
    >
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <Text
        className={`text-base ml-3 ${destructive ? 'text-red-400' : 'text-white'}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function isWithinEditWindow(sentAtIso) {
  // Backend 15 dk pencere — UI'da preflight gizle/göster.
  if (!sentAtIso) return false;
  const sent = new Date(sentAtIso).getTime();
  if (isNaN(sent)) return false;
  return (Date.now() - sent) < 15 * 60 * 1000;
}
