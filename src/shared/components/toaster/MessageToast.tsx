import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { UserRound } from 'lucide-react-native';
import SFIcon from '../SFIcon';
import { colors, ink } from '../../theme/colors';
import { plainBlurTint } from '@/shared/theme/blur';
import ToastShell, { toastFill, TOAST_BLUR_INTENSITY } from './ToastShell';

export type MessageToastProps = {
  senderName: string;
  photoUrl?: string | null;
  preview: string;
  onPress?: () => void;
};

/**
 * Yeni mesaj toast'ı — kabuk InfoToast ile aynı cam kart, iki farkla:
 * solda gönderenin yuvarlak avatarı var ve basılabilir (tap → ilgili sohbet).
 */
export default function MessageToast({ senderName, photoUrl, preview, onPress }: MessageToastProps) {
  return (
    <ToastShell onPress={onPress}>
      <BlurView
        intensity={TOAST_BLUR_INTENSITY}
        tint={plainBlurTint()}
        style={{
          paddingVertical: 14,
          paddingHorizontal: 16,
          backgroundColor: toastFill(),
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
              backgroundColor: ink(0.12),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SFIcon
              name="person.fill"
              fallback={UserRound}
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
            {senderName}
          </Text>
          <Text
            style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: 1 }}
            numberOfLines={2}
          >
            {preview}
          </Text>
        </View>
      </BlurView>
    </ToastShell>
  );
}
