import { View, Text, TouchableOpacity, Image } from 'react-native';
import { X, Image as ImageIcon, Mic, Video as VideoIcon, MessageSquareReply } from 'lucide-react-native';

/**
 * 2 modda kullanılır:
 *  1) `mode="composing"` — input üstünde "yanıtla" preview'i + iptal X butonu
 *  2) `mode="bubble"` — bir mesajın bubble'ı içindeki gömülü "şuna yanıt" kapsülü
 */
export default function ReplyPreview({ reply, mode = 'composing', onCancel, isOwn }: any) {
  if (!reply) return null;

  const senderName = reply.senderDisplayName || (reply.isDeleted ? 'Silinmiş' : 'Kullanıcı');
  const preview = reply.isDeleted
    ? 'Bu mesaj silindi'
    : reply.contentType !== 0 && reply.contentType !== undefined
      ? mediaLabel(reply.contentType)
      : (reply.contentPreview || '...');

  const containerCls = mode === 'composing'
    ? 'mx-3 mb-1 px-3 py-2 rounded-2xl bg-[#1f1f1f] flex-row items-center'
    : `mb-1 px-2 py-1.5 rounded-lg ${isOwn ? 'bg-[#ffffff20]' : 'bg-[#00000040]'} border-l-2 border-[#f57656]`;

  return (
    <View className={containerCls}>
      {mode === 'composing' && (
        <MessageSquareReply size={16} color="#f57656" style={{ marginRight: 8 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text className="text-[#f57656] text-xs font-semibold" numberOfLines={1}>
          {senderName}
        </Text>
        <Text className="text-gray-300 text-xs" numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {mode === 'composing' && (
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <X size={18} color="#9ca3af" />
        </TouchableOpacity>
      )}
    </View>
  );
}

function mediaLabel(contentType) {
  // MessageContentType: 0 Text, 1 Image, 2 Voice, 3 Video, 99 System
  switch (contentType) {
    case 1: return '📷 Fotoğraf';
    case 2: return '🎙️ Sesli mesaj';
    case 3: return '🎬 Video';
    default: return '...';
  }
}
