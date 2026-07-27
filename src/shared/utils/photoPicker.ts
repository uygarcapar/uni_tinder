import ImageCropPicker from 'react-native-image-crop-picker';
import i18n from '../i18n';

export type PickedPhoto = {
  uri: string;
  mime: string;
  fileName: string;
};

/**
 * Ortak galeri-seç + kırp akışı (RegisterStep15 ve ProfileScreen).
 *
 * NEDEN crop-picker (expo-image-picker değil): SDK 56'da expo-image-picker
 * multi-select ile crop'u aynı anda yapamıyor ve iOS'ta crop her zaman kare —
 * uygulamanın 3:4 (900x1200) profil fotoğrafı akışını üretemiyor. Boyut da
 * burada sabitlenir; upload'a hiçbir zaman ham 48MP fotoğraf gitmez.
 *
 * Kullanıcının vazgeçtiği durumlar (picker/cropper iptali) hata değildir:
 * iptal edilen fotoğraf atlanır, hiç seçim kalmazsa boş dizi döner.
 */
export const pickAndCropPhotos = async (maxFiles: number): Promise<PickedPhoto[]> => {
  let selected;
  try {
    selected = await ImageCropPicker.openPicker({
      multiple: true,
      maxFiles,
      mediaType: 'photo',
    });
  } catch (error: any) {
    if (error?.code === 'E_PICKER_CANCELLED') return [];
    throw error;
  }

  const cropped: PickedPhoto[] = [];
  for (const image of selected.slice(0, maxFiles)) {
    try {
      const result = await ImageCropPicker.openCropper({
        path: image.path,
        width: 900,
        height: 1200,
        mediaType: 'photo',
        compressImageQuality: 0.85,
        cropperToolbarTitle: i18n.t('common.cropperTitle'),
        cropperChooseText: i18n.t('common.cropperChoose'),
        cropperCancelText: i18n.t('common.cancel'),
      });
      cropped.push({
        uri: result.path,
        mime: result.mime ?? 'image/jpeg',
        fileName: result.path.split('/').pop() ?? `photo_${Date.now()}.jpg`,
      });
    } catch {
      // Bu fotoğrafın kırpılması iptal edildi — diğerlerine devam.
    }
  }
  return cropped;
};
