import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeartCrack } from 'lucide-react-native';
import SFIcon from '../SFIcon';
import { colors } from '../../theme/colors';

export type MissedMatchToastProps = {
  /** Geçilen kişinin adı — yoksa gövde metni isimsiz varyanta düşer. */
  name?: string | null;
  photoUrl?: string | null;
  title: string;
  body: string;
};

/**
 * "Bir eşleşmeyi kaçırdın" — seni beğenmiş birini pass'ledikten sonra üstten düşer.
 * Bilgi amaçlı: dokunulabilir değil (o kişi artık Likes listesinde de yok).
 * Kabuk InfoToast ile aynı cam kart; solda geçilen kişinin avatarı var.
 */
export default function MissedMatchToast({ photoUrl, title, body }: MissedMatchToastProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        marginTop: insets.top,
        marginHorizontal: 12,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <BlurView
        intensity={60}
        tint="dark"
        style={{
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: 'rgba(20,20,20,0.35)',
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
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SFIcon
              name="heart.slash.fill"
              fallback={HeartCrack}
              size={20}
              color={colors.text}
              strokeWidth={2}
            />
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={{ color: '#fff', fontSize: 13, fontWeight: '500', marginTop: 2 }}
            numberOfLines={2}
          >
            {body}
          </Text>
        </View>
      </BlurView>
    </View>
  );
}
