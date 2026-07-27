import { View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

export type InfoToastProps = {
  title?: string;
  message: string;
  variant?: 'success' | 'error';
};

export default function InfoToast({ title, message }: InfoToastProps) {
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
          paddingVertical: 16,
          paddingHorizontal: 20,
          backgroundColor: 'rgba(20,20,20,0.35)',
        }}
      >
        {title ? (
          <Text className='mb-[2px]' style={{ color: colors.text, fontSize: 14, fontWeight: 700 }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Text
          style={{ color: '#fff',fontWeight:500, fontSize: 14, marginTop: title ? 4 : 0 }}
          numberOfLines={3}
        >
          {message}
        </Text>
      </BlurView>
    </View>
  );
}
