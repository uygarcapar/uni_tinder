import { Modal, View, Text, TouchableOpacity, Pressable, Alert } from 'react-native';
import { Search, UserMinus, RotateCcw, AlertTriangle, Flag, Ban } from 'lucide-react-native';

/**
 * ChatScreen header MoreVertical menüsü.
 *
 * Props:
 *   visible, onClose, isActive (conv aktif mi)
 *   onSearch(), onUnmatch(), onRestore()
 *
 * Eylemler aktive duruma göre:
 *   - Aktif sohbet: Search + Unmatch (destructive)
 *   - Kapanmış (kendi unmatch'i, 24h grace): Restore
 */
export default function ConversationOptionsSheet({
  visible,
  onClose,
  isActive = true,
  canRestore = false,
  onSearch,
  onUnmatch,
  onRestore,
  onReport,
  onBlock,
}: any) {
  const handleUnmatch = () => {
    Alert.alert(
      'Eşleşmeyi kaldır',
      'Sohbet 24 saat içinde geri alınabilir. Sonra kalıcı olarak kapanır.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: () => {
            onClose();
            onUnmatch?.();
          },
        },
      ],
    );
  };

  const handleBlock = () => {
    Alert.alert(
      'Kullanıcıyı engelle',
      'Bu kişi sana mesaj atamayacak ve profili sana gösterilmeyecek. Eşleşmeniz kaldırılır.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Engelle',
          style: 'destructive',
          onPress: () => {
            onClose();
            onBlock?.();
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable onPress={() => {}} className="bg-[#121212] rounded-t-3xl pt-3 pb-8">
          <View className="items-center mb-2">
            <View className="w-10 h-1 rounded-full bg-[#3a3a3a]" />
          </View>

          {isActive && (
            <ActionRow
              icon={<Search size={22} color="#fff" />}
              label="Sohbette Ara"
              onPress={() => { onClose(); onSearch?.(); }}
            />
          )}

          {isActive && (
            <ActionRow
              icon={<UserMinus size={22} color="#ef4444" />}
              label="Eşleşmeyi Kaldır"
              destructive
              onPress={handleUnmatch}
            />
          )}

          <ActionRow
            icon={<Flag size={22} color="#f59e0b" />}
            label="Şikayet Et"
            onPress={() => { onClose(); onReport?.(); }}
          />

          <ActionRow
            icon={<Ban size={22} color="#ef4444" />}
            label="Kullanıcıyı Engelle"
            destructive
            onPress={handleBlock}
          />

          {!isActive && canRestore && (
            <ActionRow
              icon={<RotateCcw size={22} color="#34d399" />}
              label="Eşleşmeyi Geri Al"
              onPress={() => { onClose(); onRestore?.(); }}
              accent
            />
          )}

          {!isActive && !canRestore && (
            <View className="px-5 py-4 flex-row items-start">
              <AlertTriangle size={18} color="#9ca3af" style={{ marginTop: 2, marginRight: 12 }} />
              <Text className="text-gray-400 text-sm flex-1">
                Bu sohbet sonlandırıldı. Geri alma süresi doldu.
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({ icon, label, onPress, destructive, accent }: any) {
  const color = destructive ? 'text-red-400' : accent ? 'text-[#34d399]' : 'text-white';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="flex-row items-center px-5 py-4 border-b border-[#1f1f1f]"
    >
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <Text className={`${color} text-base ml-3`}>{label}</Text>
    </TouchableOpacity>
  );
}
