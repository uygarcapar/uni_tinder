import { View, Text, TouchableOpacity } from 'react-native';
import { X, MessageSquareReply } from 'lucide-react-native';
import SFIcon from '@/shared/components/SFIcon';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../shared/theme/colors';

/**
 * 2 modda kullanılır:
 *  1) `mode="composing"` — input üstünde "yanıtla" preview'i + iptal X butonu
 *  2) `mode="bubble"` — bir mesajın bubble'ı içindeki gömülü "şuna yanıt" kapsülü
 */
export default function ReplyPreview({ reply, mode = 'composing', onCancel, isOwn }: any) {
  const { t } = useTranslation();
  if (!reply) return null;

  const senderName =
    reply.senderDisplayName ||
    (reply.isDeleted ? t('chat.replyPreview.deletedSender') : t('chat.defaultUserName'));
  const preview = reply.isDeleted
    ? t('chat.replyPreview.deletedMessage')
    : reply.contentType !== 0 && reply.contentType !== undefined
      ? mediaLabel(reply.contentType, t)
      : (reply.contentPreview || '...');

  const containerCls = mode === 'composing'
    ? 'mx-3 mb-1 px-3 py-2 rounded-2xl bg-surface-2 flex-row items-center'
    : `mb-1 px-2 py-1.5 rounded-lg ${isOwn ? 'bg-[#ffffff20]' : 'bg-[#00000040]'} border-l-2 border-primary`;

  return (
    <View className={containerCls}>
      {mode === 'composing' && (
        <SFIcon name="arrowshape.turn.up.left.fill" fallback={MessageSquareReply} size={16} color={colors.primary} style={{ marginRight: 8 }} />
      )}
      <View style={{ flex: 1 }}>
        <Text className="text-primary text-xs font-semibold" numberOfLines={1}>
          {senderName}
        </Text>
        <Text className="text-gray-300 text-xs" numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {mode === 'composing' && (
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <SFIcon name="xmark" fallback={X} size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Eski (media'lı) mesajlara yanıt verilmiş olabilir — etiketler locale'den.
function mediaLabel(contentType: number, t: (key: string) => string) {
  // MessageContentType: 0 Text, 1 Image, 2 Voice, 3 Video, 99 System
  switch (contentType) {
    case 1: return `📷 ${t('chat.messages.mediaPhoto')}`;
    case 2: return `🎙️ ${t('chat.messages.mediaVoice')}`;
    case 3: return `🎬 ${t('chat.messages.mediaVideo')}`;
    default: return '...';
  }
}
