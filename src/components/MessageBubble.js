import { memo, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, Pressable } from 'react-native';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react-native';
import ReplyPreview from './ReplyPreview';
import VoicePlayer from './VoicePlayer';

/**
 * Tek mesaj baloncuğu. Tüm content type'ları render eder:
 *   text, image, voice (audio), video, system
 *
 * Props:
 *   message: MessageDto
 *   isOwn: boolean (sender == self)
 *   onLongPress: () => void  — reaction picker / context menu açar
 *   onReplyTap: (replyMsg) => void  — reply preview'e basınca orijinale scroll
 *   onMediaTap: (url, contentType) => void
 *
 * Layout:
 *   - System: ortada gri kapsül
 *   - Own: sağa hizalı, accent renk (#f57656)
 *   - Other: sola hizalı, koyu gri
 */
function MessageBubble({ message, isOwn, onLongPress, onReplyTap, onMediaTap, onRetryTap, i18nResolver }) {
  // System mesajı
  if (message.isSystemMessage) {
    const text = (i18nResolver && message.localizationKey
      ? i18nResolver(message.localizationKey, message.content)
      : message.content) || '';
    return (
      <View className="items-center my-2 px-4">
        <View className="px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#262626]">
          <Text className="text-gray-400 text-xs">{text}</Text>
        </View>
      </View>
    );
  }

  const isPending = message._pending;
  const isFailed = message._failed;
  const isDeletedForEveryone = message.deletedAt && message.deletedForEveryone;
  const isDeletedSelf = message.deletedAt && !message.deletedForEveryone;

  // Self-side delete: göndericinin diğer cihazlarında "sen sildin" göster.
  if (isDeletedSelf && isOwn) {
    return renderDeletedBubble(isOwn);
  }

  // Diğer taraftaysa "DeletedForEveryone": "Bu mesaj silindi" göster.
  if (isDeletedForEveryone) {
    return renderDeletedBubble(isOwn);
  }

  const bubbleBgClass = isOwn ? 'bg-[#f57656]' : 'bg-[#1f1f1f]';
  const textColorClass = isOwn ? 'text-white' : 'text-gray-100';

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginVertical: 2,
        paddingHorizontal: 12,
      }}
    >
      <View style={{ maxWidth: '78%' }}>
        <Pressable
          onLongPress={onLongPress}
          onPress={isFailed ? () => onRetryTap?.(message) : undefined}
          delayLongPress={350}
          className={`${bubbleBgClass} rounded-2xl px-3 py-2`}
          style={{
            borderTopLeftRadius: !isOwn ? 4 : 16,
            borderTopRightRadius: isOwn ? 4 : 16,
            opacity: isFailed ? 0.7 : 1,
          }}
        >
          {/* Reply preview kapsülü */}
          {message.replyTo && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => onReplyTap?.(message.replyTo)}
            >
              <ReplyPreview reply={message.replyTo} mode="bubble" isOwn={isOwn} />
            </TouchableOpacity>
          )}

          {/* Media (image/video preview/voice placeholder) */}
          {message.mediaUrl && message.contentType === 1 && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => onMediaTap?.(message.mediaUrl, 1)}
              className="rounded-xl overflow-hidden mb-1"
            >
              <Image
                source={{ uri: message.mediaUrl }}
                style={{ width: 220, height: 220, borderRadius: 12 }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          )}
          {message.mediaUrl && message.contentType === 2 && (
            <VoicePlayer uri={message.mediaUrl} isOwn={isOwn} />
          )}
          {message.mediaUrl && message.contentType === 3 && (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => onMediaTap?.(message.mediaUrl, 3)}
              className="rounded-xl overflow-hidden mb-1"
              style={{ width: 220, height: 220, backgroundColor: '#00000080' }}
            >
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>▶️</Text>
                <Text className="text-white text-xs mt-1">Video</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Text content */}
          {!!message.content && (
            <Text className={`${textColorClass} text-base`}>
              {message.content}
              {message.editedAt && (
                <Text className={`${isOwn ? 'text-white/70' : 'text-gray-400'} text-xs`}>
                  {'  '}(düzenlendi)
                </Text>
              )}
            </Text>
          )}

          {/* Footer: time + status */}
          <View
            className="flex-row items-center mt-1"
            style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start' }}
          >
            {isFailed && (
              <Text className="text-red-300 text-[10px] mr-2">Tekrar göndermek için dokun</Text>
            )}
            <Text className={`${isOwn ? 'text-white/70' : 'text-gray-400'} text-[10px] mr-1`}>
              {formatTime(message.sentAt)}
            </Text>
            {isOwn && renderStatus(message, isPending, isFailed)}
          </View>
        </Pressable>

        {/* Reactions row */}
        {message.reactions?.length > 0 && (
          <View
            className="flex-row mt-1"
            style={{ alignSelf: isOwn ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}
          >
            {message.reactions.map((r) => (
              <View
                key={r.emoji}
                className="bg-[#262626] rounded-full px-2 py-0.5 mr-1 flex-row items-center"
              >
                <Text style={{ fontSize: 12 }}>{r.emoji}</Text>
                {r.count > 1 && (
                  <Text className="text-gray-300 text-[10px] ml-1">{r.count}</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function renderDeletedBubble(isOwn) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginVertical: 2,
        paddingHorizontal: 12,
      }}
    >
      <View
        className="bg-[#1a1a1a] rounded-2xl px-3 py-2 border border-[#262626]"
        style={{ maxWidth: '78%' }}
      >
        <Text className="text-gray-500 italic text-sm">Bu mesaj silindi</Text>
      </View>
    </View>
  );
}

function renderStatus(message, isPending, isFailed) {
  if (isFailed) return <AlertCircle size={12} color="#fca5a5" />;
  if (isPending) return <Clock size={12} color="rgba(255,255,255,0.7)" />;
  if (message.readAt) return <CheckCheck size={14} color="#34d399" />;
  if (message.deliveredAt) return <CheckCheck size={14} color="rgba(255,255,255,0.85)" />;
  return <Check size={14} color="rgba(255,255,255,0.7)" />;
}

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default memo(MessageBubble, (prev, next) => {
  // Sadece kritik alanlar değişince yeniden render — long list perf.
  const a = prev.message, b = next.message;
  return a.id === b.id
    && a.content === b.content
    && a.readAt === b.readAt
    && a.deliveredAt === b.deliveredAt
    && a.editedAt === b.editedAt
    && a.deletedAt === b.deletedAt
    && a._pending === b._pending
    && a._failed === b._failed
    && (a.reactions?.length || 0) === (b.reactions?.length || 0)
    && JSON.stringify(a.reactions) === JSON.stringify(b.reactions)
    && prev.isOwn === next.isOwn;
});
