import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Heart, Star } from 'lucide-react-native';
import SFIcon from '../SFIcon';
import { colors } from '../../theme/colors';
import ToastShell from './ToastShell';

export type LikeToastProps = {
  kind: 'like' | 'superLike';
  senderName?: string | null;
  photoUrl?: string | null;
  onPress?: () => void;
};

export default function LikeToast({ kind, senderName, photoUrl, onPress }: LikeToastProps) {
  const isSuper = kind === 'superLike';
  const accent = isSuper ? colors.info : colors.likePink;
  const title = isSuper ? 'Sana Super Like attı!' : 'Birisi seni beğendi';
  const subtitle = senderName || 'Likes ekranına git ve kim olduğunu gör';
  const iconName = isSuper ? 'star.fill' : 'heart.fill';
  const IconFallback = isSuper ? Star : Heart;

  return (
    <ToastShell onPress={onPress} radius={16}>
      <View
        style={{
          backgroundColor: colors.surface2,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {photoUrl ? (
          <ExpoImage
            source={{ uri: photoUrl }}
            style={{ width: 40, height: 40, borderRadius: 20 }}
            cachePolicy="memory-disk"
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SFIcon name={iconName} fallback={IconFallback} size={22} color={colors.text} strokeWidth={2} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {title}
          </Text>
          <Text style={{ color: colors.neutral200, fontSize: 13, fontWeight: '500', marginTop: 1 }} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <SFIcon name={iconName} fallback={IconFallback} size={18} color={accent} strokeWidth={2} style={{ marginLeft: 8 }} />
      </View>
    </ToastShell>
  );
}
