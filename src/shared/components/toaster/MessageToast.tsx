import { View, Text, type TextStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Mic, UserRound } from '@/shared/icons';
import SFIcon from '../SFIcon';
import { colors, ink } from '../../theme/colors';
import ToastShell from './ToastShell';

export type MessageToastProps = {
  senderName: string;
  photoUrl?: string | null;
  preview: string;
  /**
   * Sesli mesajda süre (`0:12` — biçim çağıranın işi, bkz. formatVoiceDuration).
   * Doluysa önizleme metni yerine mikrofon + süre çizilir; sesli mesajın
   * içeriği hakkında söylenebilecek tek şey ne kadar sürdüğü.
   */
  voiceDuration?: string | null;
};

/**
 * Yeni mesaj toast'ı — kabuk InfoToast ile aynı cam kart, tek farkla: solda
 * gönderenin yuvarlak avatarı var.
 *
 * Tap → ilgili sohbet, ama o kapı BURADA DEĞİL: notifier'ın kendi dokunma
 * katmanı içteki `Pressable`'ı yutuyor (gerekçe ToastShell'in tepesinde),
 * bu yüzden `onPress` `showMessageToast` içinde notifier'a veriliyor.
 */
/**
 * Önizleme satırı — metin de süre de aynı ölçüyü taşıyor.
 *
 * ⚠️ RENK BURADA YOK, bilerek: palet tema değişiminde mutasyona uğruyor
 * (colors.ts §1), modül seviyesinde sabitlenen bir `colors.text` ilk moda
 * çakılı kalırdı. Renk render anında veriliyor.
 */
const PREVIEW_TEXT: TextStyle = {
  fontSize: 14,
  fontWeight: '500',
};

export default function MessageToast({
  senderName,
  photoUrl,
  preview,
  voiceDuration,
}: MessageToastProps) {
  return (
    <ToastShell>
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
          {voiceDuration ? (
            // Sesli mesaj — Mesajlar listesindeki satırın AYNI dili: dolgusuz
            // `mic` + süre (aynı 14pt, aynı 4pt aralık). Orada simgenin yanında
            // "Sesli mesaj" etiketi de var, burada YOK: mikrofon zaten onu
            // söylüyor ve toast'ın tek satırlık yerinde tekrar olurdu.
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
              <SFIcon
                name="mic"
                fallback={Mic}
                size={14}
                color={colors.text}
                strokeWidth={2}
                weight="semibold"
              />
              {/* tabular-nums: art arda düşen iki bildirimde rakamlar
                  zıplamasın (0:09 → 0:11 aynı genişlikte). */}
              <Text
                style={{ ...PREVIEW_TEXT, color: colors.text, fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
              >
                ({voiceDuration})
              </Text>
            </View>
          ) : (
            <Text
              style={{ ...PREVIEW_TEXT, color: colors.text, marginTop: 1 }}
              numberOfLines={2}
            >
              {preview}
            </Text>
          )}
        </View>
      </View>
    </ToastShell>
  );
}
