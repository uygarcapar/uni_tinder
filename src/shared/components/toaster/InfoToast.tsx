import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

export type InfoToastProps = {
  title?: string;
  message: string;
  variant?: 'success' | 'error';
};

export default function InfoToast({ title, message, variant = 'success' }: InfoToastProps) {
  const insets = useSafeAreaInsets();
  const accent = variant === 'error' ? colors.errorDeep : '#16a34a';

  return (
    <View
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
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          backgroundColor: accent,
        }}
      />
      <View style={{ flex: 1, marginLeft: 8 }}>
        {title ? (
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Text style={{ color: '#ddd', fontSize: 13, marginTop: title ? 2 : 0 }} numberOfLines={3}>
          {message}
        </Text>
      </View>
    </View>
  );
}
