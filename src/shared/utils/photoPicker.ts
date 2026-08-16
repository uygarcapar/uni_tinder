import ImageCropPicker from 'react-native-image-crop-picker';
import i18n from '../i18n';

export type PickedPhoto = {
  uri: string;
  mime: string;
  fileName: string;
};

const PICKER_CANCELLED = 'E_PICKER_CANCELLED';

/**
 * 3:4 (900x1200) kırpma — galeri ve kamera akışları ortak kullanır, böylece
 * fotoğraf hangi kaynaktan gelirse gelsin upload'a aynı boyut/kalite gider.
 * Kullanıcı kırpmayı iptal ederse hata değil, null döner.
 */
const cropTo3x4 = async (path: string): Promise<PickedPhoto | null> => {
  try {
    const result = await ImageCropPicker.openCropper({
      path,
      width: 900,
      height: 1200,
      mediaType: 'photo',
      compressImageQuality: 0.85,
      cropperToolbarTitle: i18n.t('common.cropperTitle'),
      cropperChooseText: i18n.t('common.cropperChoose'),
      cropperCancelText: i18n.t('common.cancel'),
    });
    return {
      uri: result.path,
      mime: result.mime ?? 'image/jpeg',
      fileName: result.path.split('/').pop() ?? `photo_${Date.now()}.jpg`,
    };
  } catch {
    // Bu fotoğrafın kırpılması iptal edildi.
    return null;
  }
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
    if (error?.code === PICKER_CANCELLED) return [];
    throw error;
  }

  const cropped: PickedPhoto[] = [];
  for (const image of selected.slice(0, maxFiles)) {
    const photo = await cropTo3x4(image.path);
    if (photo) cropped.push(photo);
  }
  return cropped;
};

/**
 * Kamerayla çek + aynı 3:4 kırpma. Tek fotoğraf döner; çekim ya da kırpma
 * iptal edilirse null.
 *
 * Kamera açılışını cropping:true ile değil ayrı openCropper adımıyla yapıyoruz —
 * galeri akışıyla birebir aynı cropper (aynı oran, aynı lokalize butonlar)
 * çalışsın diye.
 *
 * İzin reddi (E_NO_CAMERA_PERMISSION) galeri akışındaki gibi çağırana fırlar.
 */
export const captureAndCropPhoto = async (): Promise<PickedPhoto | null> => {
  let taken;
  try {
    taken = await ImageCropPicker.openCamera({ mediaType: 'photo' });
  } catch (error: any) {
    if (error?.code === PICKER_CANCELLED) return null;
    throw error;
  }
  return cropTo3x4(taken.path);
};
