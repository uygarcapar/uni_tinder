import { Alert } from 'react-native';
import i18n from '@/shared/i18n';
import { resolveSelfieVerified } from './selfieVerification';

/**
 * Ana fotoğraf değişmeden ÖNCE sorulan onay.
 *
 * NEDEN GEREKLİ: ana fotoğraf değişince backend `isSelfieVerified`'ı `false`'a
 * çekiyor. Güvenlik gereği — yoksa "doğrulan, sonra fotoğrafı başkasınınkiyle
 * değiştir" ile rozet başkasının fotoğrafını doğrulanmış gösterirdi. Kullanıcı
 * bunu rozet kaybolduktan sonra değil, ÖNCESİNDE öğrenmeli.
 *
 * ⚠️ YAN FOTOĞRAF DEĞİŞİKLİĞİ BUNU TETİKLEMEZ. Ekleme/silme/sıralama yalnızca
 * SONUÇTAKİ ana fotoğrafı değiştiriyorsa sorulur — kural sadece ana fotoğrafa
 * bağlı, gereksiz uyarı akışı yorar.
 *
 * Doğrulanmamış (ya da alan hiç gelmemiş) kullanıcıda hiçbir şey sormadan
 * `true` döner: kaybedilecek bir rozet yok.
 */
export function confirmMainPhotoChange(profile: any): Promise<boolean> {
  if (resolveSelfieVerified(profile) !== true) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    Alert.alert(
      i18n.t('profile.selfie.mainPhotoWarning.title'),
      i18n.t('profile.selfie.mainPhotoWarning.message'),
      [
        {
          text: i18n.t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: i18n.t('profile.selfie.mainPhotoWarning.confirm'),
          onPress: () => resolve(true),
        },
      ],
      // Alert dışına dokunup kapatıldığında promise askıda kalmasın.
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
