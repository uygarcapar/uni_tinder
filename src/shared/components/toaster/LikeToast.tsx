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
  kind: Extract<ToastIconKind, 'like' | 'fire' | 'note'>;
  senderName?: string | null;
  photoUrl?: string | null;
  /** Yalnız `kind: 'note'` — yorumun ilk ~60 karakteri (IncomingLike.notePreview). */
  preview?: string | null;
};

// Tap → Likes ekranı; kapı `showLikeToast` içinde notifier seviyesinde
// (gerekçe ToastShell'in tepesinde).
export default function LikeToast({ kind, senderName, photoUrl, preview }: LikeToastProps) {
  const isSuper = kind === 'fire';
  const isNote = kind === 'note';
  // Notta kimlik free alıcıya da AÇIK (sözleşme §6) — çağıran adı hiç
  // gizlemiyor, o yüzden başlıkta ismi kullanabiliyoruz.
  const { t } = useTranslation();
  // İsim ARTIK BAŞLIKTA: adı bilirken bile "Birisi seni beğendi" yazıp ismi alt
  // satıra koymak jenerik duruyordu. Ad yoksa (düz beğenide premium olmayan
  // alıcı — kimlik kilidi AppNavigator'da) jenerik varyanta düşülüyor.
  const kindKey = isNote ? 'note' : isSuper ? 'fire' : 'like';
  const title = senderName
    ? t(`likeToast.${kindKey}`, { name: senderName })
    : t(`likeToast.${kindKey}NoName`);
  // Not önizlemesi başlığın altına: ürünün değeri yorumun kendisi. Diğer
  // durumlarda alt satır ne yapılacağını söylüyor — isim yukarı taşındı.
  const subtitle = (isNote ? preview : null) || t('likeToast.cta');

  return (
    // Bu kart MessageToast'ın BİREBİR AYNISI: aynı cam kabuk, aynı kenar
    // boşluğu (ToastShell PADDING_*), aynı 24pt köşe, aynı 40pt daire, aynı
    // tipografi. İkisi de "solda yuvarlak, sağda iki satır" — ayrı ölçüler
    // taşıdıklarında arka arkaya düşen iki banner iki ayrı bileşen gibi
    // duruyordu (burası 16pt köşe + 10/12 boşluk + 13pt soluk alt satırdı).
    //
    // Aralarındaki tek fark İÇERİK: fotoğrafsız durumda buradaki daire ürünün
    // glif'ini ve rengini taşıyor, MessageToast'ta nötr bir kişi ikonu var.
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
              backgroundColor: toastIconBackground(kind),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Glif `onMedia`: dolgu markanın rengi, `text` açık modda koyuya
                dönüp renkli dairenin üstünde kayboluyordu. Boy MessageToast'ın
                kişi ikonuyla aynı (20) — aynı daire, aynı ölçü. */}
            <ToastIconGlyph kind={kind} size={20} color={colors.onMedia} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {title}
          </Text>
          {/* Alt satır MessageToast'ın önizleme satırıyla aynı: 14pt, `text`
              (soluk `neutral200` değil), iki satıra kadar. Not önizlemesi de
              bundan kazanıyor — ürünün değeri yazılan cümlenin kendisi. */}
          <Text
            style={{ color: colors.text, fontSize: 14, fontWeight: '500', marginTop: 1 }}
            numberOfLines={2}
          >
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
