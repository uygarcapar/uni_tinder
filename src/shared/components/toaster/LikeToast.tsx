import { View, Text, Pressable } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, Star } from 'lucide-react-native';
import { colors } from '../../theme/colors';

export type LikeToastProps = {
  kind: 'like' | 'superLike';
  senderName?: string | null;
  photoUrl?: string | null;
  onPress?: () => void;
};

export default function LikeToast({ kind, senderName, photoUrl, onPress }: LikeToastProps) {
  const insets = useSafeAreaInsets();
  const isSuper = kind === 'superLike';
  const accent = isSuper ? colors.info : '#ec4899';
  const title = isSuper ? 'Sana Super Like attı!' : 'Birisi seni beğendi';
  const subtitle = senderName || 'Likes ekranına git ve kim olduğunu gör';
  const Icon = isSuper ? Star : Heart;

  return (
    <Pressable
      onPress={onPress}
      style={{
        marginTop: insets.top,
        marginHorizontal: 12,
        backgroundColor: colors.surface2,
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
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
          <Icon size={22} color={colors.text} fill={colors.text} />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: '#ccc', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Icon size={18} color={accent} fill={accent} style={{ marginLeft: 8 }} />
    </Pressable>
  );
}
