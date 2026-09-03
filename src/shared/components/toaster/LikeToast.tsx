import { View, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { colors } from '../../theme/colors';
import ToastShell from './ToastShell';
import {
  ToastIconGlyph,
  toastIconAccent,
  toastIconBackground,
  type ToastIconKind,
} from './toastIcons';

export type LikeToastProps = {
  kind: Extract<ToastIconKind, 'like' | 'superLike' | 'note'>;
  senderName?: string | null;
  photoUrl?: string | null;
  /** Yalnız `kind: 'note'` — yorumun ilk ~60 karakteri (IncomingLike.notePreview). */
  preview?: string | null;
  onPress?: () => void;
};

export default function LikeToast({ kind, senderName, photoUrl, preview, onPress }: LikeToastProps) {
  const isSuper = kind === 'superLike';
  const isNote = kind === 'note';
  // Notta kimlik free alıcıya da AÇIK (sözleşme §6) — çağıran adı hiç
  // gizlemiyor, o yüzden başlıkta ismi kullanabiliyoruz.
  const accent = toastIconAccent(kind);
  const title = isNote
    ? senderName
      ? `${senderName} sana not gönderdi`
      : 'Sana not gönderildi'
    : isSuper
      ? 'Sana Superlike attı!'
      : 'Birisi seni beğendi';
  // Not önizlemesi başlığın altına: ürünün değeri yorumun kendisi.
  const subtitle =
    (isNote ? preview : null) || senderName || 'Likes ekranına git ve kim olduğunu gör';

  return (
    // Kabuk artık diğer üç toast'la AYNI cam kart: eskiden burası opak
    // `surface2` idi ve aynı anda düşen iki toast iki farklı malzeme gibi
    // duruyordu. Köşe yarıçapı kendi kalıyor — bu kart daha alçak.
    <ToastShell onPress={onPress} radius={16} paddingVertical={10} paddingHorizontal={12}>
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
              backgroundColor: toastIconBackground(kind),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Glif `onMedia`: dolgu markanın rengi, `text` açık modda koyuya
                dönüp renkli dairenin üstünde kayboluyordu. */}
            <ToastIconGlyph kind={kind} size={22} color={colors.onMedia} />
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
        <View style={{ marginLeft: 8 }}>
          <ToastIconGlyph kind={kind} size={18} color={accent} />
        </View>
      </View>
    </ToastShell>
  );
}
