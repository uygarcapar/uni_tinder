import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { HeartCrack } from '@/shared/icons';
import SFIcon from '../SFIcon';
import { colors, ink } from "../../theme/colors";
import ToastShell from "./ToastShell";

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
  return (
    <ToastShell paddingVertical={14} paddingHorizontal={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
              backgroundColor: ink(0.12),
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
            style={{ color: colors.text, fontSize: 13, fontWeight: '500', marginTop: 1 }}
            numberOfLines={2}
          >
            {body}
          </Text>
        </View>
      </View>
    </ToastShell>
  );
}
