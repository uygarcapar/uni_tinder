import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image as ExpoImage } from 'expo-image';
import { colors } from '../../theme/colors';
import ToastShell from './ToastShell';
import {
  ToastIconGlyph,
  toastIconBackground,
  type ToastIconKind,
} from './toastIcons';

export type LikeToastProps = {
  kind: Extract<ToastIconKind, 'like' | 'superLike' | 'note'>;
  senderName?: string | null;
  photoUrl?: string | null;
  /** Yalnız `kind: 'note'` — yorumun ilk ~60 karakteri (IncomingLike.notePreview). */
  preview?: string | null;
};

// Tap → Likes ekranı; kapı `showLikeToast` içinde notifier seviyesinde
// (gerekçe ToastShell'in tepesinde).
export default function LikeToast({ kind, senderName, photoUrl, preview }: LikeToastProps) {
  const isSuper = kind === 'superLike';
  const isNote = kind === 'note';
  // Notta kimlik free alıcıya da AÇIK (sözleşme §6) — çağıran adı hiç
  // gizlemiyor, o yüzden başlıkta ismi kullanabiliyoruz.
  const { t } = useTranslation();
  // İsim ARTIK BAŞLIKTA: adı bilirken bile "Birisi seni beğendi" yazıp ismi alt
  // satıra koymak jenerik duruyordu. Ad yoksa (düz beğenide premium olmayan
  // alıcı — kimlik kilidi AppNavigator'da) jenerik varyanta düşülüyor.
  const kindKey = isNote ? 'note' : isSuper ? 'superLike' : 'like';
  const title = senderName
    ? t(`likeToast.${kindKey}`, { name: senderName })
    : t(`likeToast.${kindKey}NoName`);
  // Not önizlemesi başlığın altına: ürünün değeri yorumun kendisi. Diğer
  // durumlarda alt satır ne yapılacağını söylüyor — isim yukarı taşındı.
  const subtitle = (isNote ? preview : null) || t('likeToast.cta');

  return (
    // Kabuk artık diğer üç toast'la AYNI cam kart: eskiden burası opak
    // `surface2` idi ve aynı anda düşen iki toast iki farklı malzeme gibi
    // duruyordu. Köşe yarıçapı kendi kalıyor — bu kart daha alçak.
    <ToastShell radius={16} paddingVertical={10} paddingHorizontal={12}>
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
        {/* Sağdaki aksan ikonu KALDIRILDI (ürün kararı): pembe kalp başlığın
            yanında ikinci bir kalp oluyordu — soldaki avatar zaten fotoğrafsız
            durumda kalbi gösteriyor. */}
      </View>
    </ToastShell>
  );
}
