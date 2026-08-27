import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { presentCropper } from '@/shared/components/cropper/cropperBridge';
import { devLog } from './devLog';
import { forgetPhoto } from './photoStore';

export type PickedPhoto = {
  uri: string;
  mime: string;
  fileName: string;
};

/**
 * Ortak fotoğraf seçimi (RegisterStep15 ve ProfileScreen).
 *
 * SEÇİM: expo-image-picker → iOS 14+'ta `PHPickerViewController`. `allowsEditing`
 * MUTLAKA false kalmalı, PHPicker'ı seçen şey bu; true olursa eski
 * `UIImagePickerController`'a düşer. Süreç dışı çalıştığı için galeri izni HİÇ
 * sorulmuyor ve Albümler/Favoriler/Son Öğeler/arama görünüyor — eski
 * react-native-image-crop-picker'ın (QBImagePickerController) eksiği tam da
 * buydu.
 *
 * KIRPMA: uygulama içi cropper (bkz. CropperOverlay). Picker'ın kendi kırpması
 * iOS'ta her zaman KARE ve multi-select ile birlikte çalışmıyor; 3:4 (900x1200)
 * profil formatını üretemezdi. Boyut/kalite burada sabitlenir, upload'a hiçbir
 * zaman ham 48MP fotoğraf gitmez.
 *
 * İptal HATA DEĞİLDİR: iptal edilen fotoğraf atlanır, hiç seçim kalmazsa boş
 * dizi döner. Kamera izni reddi çağırana fırlar.
 */

const CAMERA_PERMISSION_ERROR = 'E_NO_CAMERA_PERMISSION';

/**
 * Kaynak boyutları — kırpma matematiğinin tek girdisi.
 *
 * `width`/`height` tip olarak `0` olabiliyor ("sistem boyutu vermediyse"); o
 * durumda RN'in `Image.getSize`'ına düşüyoruz. expo-image'in `loadAsync`'i
 * KULLANILMIYOR: tam decode edilmiş bitmap'i bellekte canlı tutuyor.
 */
const measure = async (
  uri: string,
): Promise<{ width: number; height: number } | null> => {
  try {
    return await new Promise((resolve, reject) => {
      Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
  } catch (error) {
    devLog('📷 [photoPicker] boyut okunamadı, fotoğraf atlanıyor', error);
    return null;
  }
};

const resolveDimensions = async (
  asset: ImagePickerAsset,
): Promise<{ width: number; height: number } | null> => {
  if (asset.width > 0 && asset.height > 0) {
    return { width: asset.width, height: asset.height };
  }
  return measure(asset.uri);
};

/**
 * Seçilen fotoğrafları TEK TEK kırpma ekranından geçirir.
 *
 * Aynı anda birden fazla kırpma yok — 48MP kaynaklarda paralel decode belleği
 * uçuruyor. `skipped` sıradakine geçer (kullanıcı o fotoğrafı istemedi),
 * `aborted` döngüyü kırar (kırpma ekranı yok; sonsuz beklemeyi önler).
 */
const cropSequentially = async (assets: ImagePickerAsset[]): Promise<PickedPhoto[]> => {
  const cropped: PickedPhoto[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const size = await resolveDimensions(asset);
    if (!size) continue;

    const outcome = await presentCropper({
      uri: asset.uri,
      srcWidth: size.width,
      srcHeight: size.height,
      index: i + 1,
      total: assets.length,
    });

    // Picker'ın cache kopyası her hâlükârda ölü: kırpma çıktısı ayrı bir dosya.
    forgetPhoto(asset.uri);

    if (outcome.status === 'done') {
      cropped.push(outcome.photo);
      continue;
    }
    if (outcome.status === 'aborted') break;
    if (outcome.status === 'failed') {
      devLog('📷 [photoPicker] kırpma başarısız, fotoğraf atlandı', outcome.error);
    }
  }

  return cropped;
};

export const pickAndCropPhotos = async (maxFiles: number): Promise<PickedPhoto[]> => {
  const limit = Math.max(1, maxFiles);

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    // Numaralı rozetler + asset'ler DOKUNMA sırasında döner. Kayıt akışında ilk
    // fotoğraf ana fotoğraf oluyor; bu bayrak olmadan iOS sıra garantisi vermiyor.
    orderedSelection: true,
    // PHPicker'ı seçen bayrak — DEĞİŞTİRME.
    allowsEditing: false,
    exif: false,
    base64: false,
    // "iPhone Depolamasını Optimize Et" açıkken fotoğraf yalnız iCloud'da
    // olabiliyor; bu olmadan seçim boş dönerdi.
    shouldDownloadFromNetwork: true,
    // `quality` KASITLI OLARAK GEÇİLMİYOR: native varsayılan (1 +
    // preferredAssetRepresentationMode .current) dosyayı olduğu gibi kopyalıyor.
    // 1'in altındaki her değer picker içinde tam decode + JPEG yeniden kodlama
    // tetikliyor — çıktısını zaten kırpıp atıyoruz.
  });

  if (result.canceled || !result.assets?.length) return [];
  return cropSequentially(result.assets.slice(0, limit));
};

/**
 * Kamerayla çek + aynı 3:4 kırpma. Tek fotoğraf döner; çekim ya da kırpma
 * iptal edilirse null.
 *
 * İzni native hata kodunu ayrıştırmak yerine AÇIKÇA soruyoruz — çağıranlar
 * `E_NO_CAMERA_PERMISSION` bekliyor ve `canAskAgain` ile "Ayarlar" butonu
 * gösterebiliyorlar.
 */
export const captureAndCropPhoto = async (): Promise<PickedPhoto | null> => {
  let permission = await ImagePicker.getCameraPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await ImagePicker.requestCameraPermissionsAsync();
  }
  if (!permission.granted) {
    const error: any = new Error('camera permission denied');
    error.code = CAMERA_PERMISSION_ERROR;
    error.canAskAgain = permission.canAskAgain;
    throw error;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    exif: false,
    base64: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  const [photo] = await cropSequentially(result.assets.slice(0, 1));
  return photo ?? null;
};

/**
 * Sunucuda DURAN bir fotoğrafı yeniden kırpar (profil düzenlemedeki "Düzenle").
 *
 * Kaynak neden indiriliyor: ölçüyü okuyan `Image.getSize`, önizlemeyi çizen
 * expo-image ve kırpmayı yapan image-manipulator ÜÇ AYRI yükleyici. Uzak URL
 * doğrudan verilseydi üçü de kendi cache'inden farklı bir kopyayı çözebilir,
 * kırpma matematiği de başka bir piksel uzayında çalışabilirdi. Tek dosyaya
 * indirip üçüne de onu veriyoruz.
 *
 * ⚠️ Kaynak, kullanıcının GALERİDEKİ ham fotoğrafı değil — daha önce yüklenmiş
 * 3:4 çıktının kendisi. Yani yeniden kırpma ancak DAHA DAR bir çerçeve
 * seçebilir; büyütülen alan ilk yüklemedeki çözünürlükten üretilir.
 *
 * İptal / indirme hatası → `null` (akış sessizce durur, çağıran hata göstermez).
 */
export const recropExistingPhoto = async (
  remoteUri: string,
): Promise<PickedPhoto | null> => {
  let source: string | null = null;
  try {
    const dir = new Directory(Paths.cache, 'recrop');
    dir.create({ intermediates: true, idempotent: true });
    // Hedef dosya AÇIKÇA veriliyor: dizin verilseydi ad yanıt başlıklarından
    // türerdi ve foto URL'indeki `?v=` sürüm parametresi ada sızabilirdi.
    const target = new File(dir, `recrop_${Date.now()}.jpg`);
    const file = await File.downloadFileAsync(remoteUri, target, {
      idempotent: true,
    });
    source = file.uri;
  } catch (error) {
    devLog('📷 [photoPicker] yeniden kırpma için fotoğraf indirilemedi', error);
    return null;
  }

  try {
    const size = await measure(source);
    if (!size) return null;

    const outcome = await presentCropper({
      uri: source,
      srcWidth: size.width,
      srcHeight: size.height,
    });

    if (outcome.status === 'done') {
      // Çerçeveye dokunulmadıysa yükleyecek YENİ bir şey yok. Aynı kırpmayı
      // geri göndermek, onaylanmış fotoğrafı sebepsiz yere yeniden moderasyona
      // sokar (yeni kayıt = yeni inceleme) — sessizce çıkıyoruz.
      if (outcome.adjusted === false) {
        forgetPhoto(outcome.photo.uri);
        return null;
      }
      return outcome.photo;
    }
    if (outcome.status === 'failed') {
      devLog('📷 [photoPicker] yeniden kırpma başarısız', outcome.error);
    }
    return null;
  } finally {
    // Kırpma çıktısı AYRI bir dosya (bkz. persistPickedPhoto) — indirilen
    // kaynak bu noktadan sonra ölü ağırlık. presentCropper ancak çıktı diske
    // yazıldıktan sonra çözülüyor, silme erken değil.
    forgetPhoto(source);
  }
};
