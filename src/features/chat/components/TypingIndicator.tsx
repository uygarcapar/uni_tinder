import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../../shared/theme/colors';

// Balonun TAM yüksekliği: lineHeight 16 + paddingVertical 6×2. ChatTypingRow'un
// sabit satır yüksekliği bu sabitten beslenir — ikisi ayrışırsa gösterge kendi
// satırında kayar ya da kırpılır.
export const TYPING_BUBBLE_HEIGHT = 28;

/**
 * "yazıyor…" göstergesi.
 *
 * Üç noktalı animasyon 2026-08-14'te kaldırıldı: sürekli dönen üç Animated.Value
 * loop'u sohbet açık kaldığı sürece hiç durmuyordu (chat ekranı zaten commit
 * hassas) ve durumu okumak için metin yerine ikon çözmek gerekiyordu. Metin
 * MessagesScreen'deki satır alt başlığıyla da AYNI i18n anahtarından geliyor.
 */
export default function TypingIndicator({ color = colors.text }: { color?: string }) {
  const { t } = useTranslation();
  return (
    <View
      className="rounded-2xl"
      style={{
        backgroundColor: colors.surface2,
        alignSelf: 'flex-start',
        height: TYPING_BUBBLE_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ color, fontSize: 13, lineHeight: 16, fontWeight: '500' }}>
        {t('chat.messages.typing')}
      </Text>
    </View>
  );
}
