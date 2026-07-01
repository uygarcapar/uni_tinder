import { View, Text, Pressable } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

export type MessageToastProps = {
  senderName: string;
  photoUrl?: string | null;
  preview: string;
  onPress?: () => void;
};

export default function MessageToast({ senderName, photoUrl, preview, onPress }: MessageToastProps) {
  const insets = useSafeAreaInsets();
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
            backgroundColor: '#333',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            {(senderName || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
          {senderName}
        </Text>
        <Text style={{ color: '#ccc', fontSize: 13, marginTop: 2 }} numberOfLines={1}>
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}
