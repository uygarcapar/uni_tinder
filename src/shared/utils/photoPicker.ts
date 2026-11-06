import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset } from 'expo-image-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { presentCropper } from '@/shared/components/cropper/cropperBridge';
import {
  presentCameraCapture,
  type CameraRequest,
} from '@/shared/components/camera/cameraBridge';
import {
  centerCropRect,
  OUTPUT_H,
  OUTPUT_QUALITY,
  OUTPUT_W,
} from '@/shared/components/cropper/cropGeometry';
import { devLog } from './devLog';
import { forgetPhoto, persistPickedPhoto } from './photoStore';

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
 * ÇEKİM: uygulama içi kamera (bkz. CameraCaptureOverlay) — sistem kamerası
 * yalnızca overlay bağlı değilse devreye giren yedek. Gerekçesi uzun uzun
 * `captureAndCropPhoto`ın başında: eski yol deklanşörden sonra ikinci bir onay
 * ekranı getiriyordu.
 *
 * ── İKİ ÇEKİM YOLU VAR, karıştırma ─────────────────────────────────────────
 *   `captureAndCropPhoto` → çek + KIRPMA EKRANI + kalıcı dosya. Profil ve
 *                           kayıt akışları: kadrajı kullanıcı seçiyor.
 *   `captureRawPhoto`     → çek ve HAM kareyi dön, kırpma ekranı YOK. Kampüs
 *                           anları (istek). Ölçekleme ayrı ve sonradan:
 *                           `fitPhotoForUpload`.
 *
 * ── İKİ ÖNİZLEME YOLU (kayıt fotoğraf adımı) ───────────────────────────────
 *   `captureAndPreviewPhoto` → çek + ÖNİZLEME (kampüsün tam penceresi) + isteğe bağlı
 *                           kırpma. Kırpıcı kendiliğinden AÇILMAZ; kullanıcı
 *                           kırp düğmesine basarsa devreye girer.
 *   `pickAndPreviewPhotos`   → galeriden seç + her fotoğraf SIRAYLA aynı
 *                           önizleme ekranında (kamerasız, `source` ile).
 *   İkisi de onayda `fitPhotoForUpload` (ham kare) ya da kırpıcının nihai
 *   çıktısını (olduğu gibi) döner. Overlay yoksa eski kırpıcı yollarına düşer.
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
    if (!size) {
      // `measure` kendi hata dalını logluyor ama BOYUTSUZ asset sessizce
      // atlanıyordu: altı fotoğraf seçilip hiçbiri eklenmezse sebebi burası
      // olabilir ve dışarıdan "galeri çalışmıyor" diye görünür.
      devLog('📷 [photoPicker] boyut yok, fotoğraf atlandı', asset.uri);
      continue;
    }

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
    if (outcome.status === 'aborted') {
      // TEK bir `aborted` TÜM partiyi düşürüyor (kırpma ekranı yok demek).
      // Kayıt akışı altı fotoğrafı buradan geçiriyor, yani bu dal "galeriden
      // seçtim ama hiçbiri eklenmedi"nin en sessiz hâli.
      devLog('📷 [photoPicker] kırpıcı yok (aborted) — parti düşürüldü');
      break;
    }
    if (outcome.status === 'failed') {
      devLog('📷 [photoPicker] kırpma başarısız, fotoğraf atlandı', outcome.error);
    }
  }

  return cropped;
};

/**
 * Galeriyi açar ve seçimi döner (iptal/boş → null). İKİ galeri yolunun
 * (`pickAndCropPhotos`, `pickAndPreviewPhotos`) ORTAK kapısı: picker
 * seçenekleri TEK yerde durur.
 */
const openLibrary = async (limit: number): Promise<ImagePickerAsset[] | null> => {
  // ⚠️ TEŞHİS KANCALARI (galeri "hiçbir şey yapmıyor" raporu, kayıt akışı).
  // Bu yolun HER SESSİZ ÇIKIŞI bir log bırakıyor, çünkü üçü de kullanıcıya
  // birebir aynı görünüyor: picker hiç açılmadı / açıldı ama iptal edildi /
  // seçildi ama kırpıcı devralmadı. Log'suz hâlde hangisinin olduğunu
  // ayırmanın yolu yok — çağıran `catch`i de `devLog`a yutuyor.
  devLog('📷 [photoPicker] galeri açılıyor', { limit, multi: limit > 1 });

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

  devLog('📷 [photoPicker] galeri kapandı', {
    canceled: result.canceled,
    assets: result.assets?.length ?? 0,
  });

  if (result.canceled || !result.assets?.length) return null;
  return result.assets.slice(0, limit);
};

export const pickAndCropPhotos = async (maxFiles: number): Promise<PickedPhoto[]> => {
  const limit = Math.max(1, maxFiles);
  const assets = await openLibrary(limit);
  if (!assets) return [];

  const picked = await cropSequentially(assets);
  devLog('📷 [photoPicker] kırpmadan dönen', {
    secilen: assets.length,
    kirpilan: picked.length,
  });
  return picked;
};

/**
 * Kamera izni — İKİ çekim yolunun ORTAK kapısı (kırpıcılı ve kırpıcısız).
 *
 * İzni native hata kodunu ayrıştırmak yerine AÇIKÇA soruyoruz: çağıranlar
 * `E_NO_CAMERA_PERMISSION` bekliyor ve `canAskAgain` ile "Ayarlar" butonu
 * gösterebiliyorlar. İzin ImagePicker üzerinden soruluyor, expo-camera ile
 * AYNI native izin (NSCameraUsageDescription); iki yolda da geçerli.
 */
const ensureCameraPermission = async (): Promise<void> => {
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
};

/**
 * Kamerayla çek + aynı 3:4 kırpma. Tek fotoğraf döner; çekim ya da kırpma
 * iptal edilirse null.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ÇEKİM UYGULAMA İÇİNDE — SİSTEM KAMERASI ARTIK YALNIZCA YEDEK.
 * ══════════════════════════════════════════════════════════════════════════
 * `launchCameraAsync` (UIImagePickerController) deklanşörden sonra KENDİ
 * "Tekrar Çek / Fotoğrafı Kullan" ekranını açıyordu: kullanıcı orada onaylıyor,
 * hemen ardından kırpma ekranı açılıp bir daha onaylatıyordu. Üstelik o
 * ekranda "kullan" dediği kadraj 3:4 pencereyle ilgisizdi. Artık çekim
 * CameraCaptureOverlay'de ve kare DOĞRUDAN kırpıcıya gidiyor — tek onay,
 * kırpıcının "Kaydet"i.
 *
 * KIRPICIDAKİ ✕ = YENİDEN ÇEK: kamera akışında `skipped`in "sıradaki
 * fotoğrafa geç" gibi bir anlamı yok (tek fotoğraf var), o yüzden döngü
 * kamerayı yeniden açıyor. Kullanıcı kamerada ✕'e basarsa akış biter.
 *
 * Overlay bağlı değilse (host sökülmüş, test ortamı) eski ImagePicker yoluna
 * düşüyoruz — fotoğraf eklemek hiç çalışmamasından iyi.
 *
 * ⚠️ KAMPÜS ANLARI BU YOLU KULLANMIYOR: orada kırpma ekranı da yok (bkz.
 * `captureRawPhoto`). İki yolu ayrı tutmanın sebebi ürün: profil fotoğrafının
 * kadrajını kullanıcı seçiyor, kampüs anının kadrajı ise kameranın
 * penceresinin kendisi.
 */
export const captureAndCropPhoto = async (
  options: CameraRequest = {},
): Promise<PickedPhoto | null> => {
  await ensureCameraPermission();

  // Sonsuz döngü yok: her tur kullanıcıdan YENİ bir deklanşör basışı istiyor,
  // kamerada iptal (ya da teknik hata) anında çıkıyor.
  for (;;) {
    const outcome = await presentCameraCapture(options);

    if (outcome.status === 'unavailable') return captureWithSystemCamera();
    if (outcome.status === 'cancelled') return null;
    if (outcome.status === 'failed') {
      devLog('📷 [photoPicker] çekim başarısız', outcome.error);
      return null;
    }
    // ⚠️ `committed` BU YOLDA İMKÂNSIZ: yerinde onay yalnız `commit` verildiğinde
    // açılıyor ve bu çağrı onu geçmiyor (kadrajı kullanıcı kırpıcıda seçiyor).
    // Kontrol tip daraltması için duruyor, bir dal olarak değil.
    if (outcome.status === 'committed') return null;

    const { shot } = outcome;
    // Boyut native'den gelmezse (0) ölçüyü kendimiz okuyoruz — kırpma
    // geometrisinin tek girdisi bu.
    const size =
      shot.width > 0 && shot.height > 0
        ? { width: shot.width, height: shot.height }
        : await measure(shot.uri);
    if (!size) {
      forgetPhoto(shot.uri);
      return null;
    }

    const cropped = await presentCropper({
      uri: shot.uri,
      srcWidth: size.width,
      srcHeight: size.height,
    });

    // Kameranın cache kopyası her hâlükârda ölü: kırpma çıktısı ayrı bir dosya.
    forgetPhoto(shot.uri);

    if (cropped.status === 'done') return cropped.photo;
    if (cropped.status === 'skipped') continue; // ✕ → kameraya dön
    if (cropped.status === 'failed') {
      devLog('📷 [photoPicker] kırpma başarısız', cropped.error);
    }
    // `aborted` (kırpma ekranı söküldü) ve `failed` → akış sessizce biter.
    return null;
  }
};

/** Kırpıcıdan GEÇMEYEN çekimin çıktısı — ham kamera karesi. */
export type RawShot = {
  uri: string;
  /** `0` gelebilir (native vermediyse); `fitPhotoForUpload` o zaman ölçüyor. */
  width: number;
  height: number;
};

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ŞİŞMİŞ KARE = expo-camera PATCH'İ BU BİNARY'DE YOK (teşhis kancası).
 * ══════════════════════════════════════════════════════════════════════════
 * `patches/expo-camera+56.0.8.patch` olmadan `ExpoCameraUtils
 * .normalizeOrientation` `UIGraphicsImageRenderer`a format VERMİYOR ve bitmap
 * EKRAN ölçeğiyle (iPhone'da 3.0) doğuyor: kare her kenarda 3 kat, piksel
 * sayısında 9 KAT. Belirtisi uygulamanın deklanşörden ~5sn sonra SESSİZCE
 * ölmesi (jetsam; natif istisna JS'e gelmiyor, `catch` hiç çalışmıyor) —
 * cihaz log'unda `JetsamEvent … largestProcess: Lit … reason:
 * "per-process-limit"`.
 *
 * Teşhisi 5 saniyeye indiren tek şey bu satır: patch yüklüyse 12MP bir
 * telefonun karesi ~3000×4000 gelir, patch düşmüşse ~9000×12000. Yani bu
 * uyarıyı gören kişinin yapacağı şey kodu kurcalamak DEĞİL, NATIVE REBUILD
 * (`npx expo run:ios --device`) — Metro reload yetmez, patch Swift tarafında.
 *
 * ⚠️ Eşik 5000: 48MP telefonların ham karesi 8064 ve o YASAL (patch tavanı
 * 12MP ama tavanın üstündeki tek ölçü varsa ona düşüyor). 5000 ile 9072
 * arasında bir kare üretebilecek bir cihaz bilmiyoruz; yanlış pozitif olsa da
 * bedeli bir log satırı.
 */
const INFLATED_LONG_EDGE = 5000;

const warnIfFrameInflated = (width: number, height: number): void => {
  const longEdge = Math.max(width, height);
  if (longEdge <= INFLATED_LONG_EDGE) return;
  devLog(
    '📷 [photoPicker] 🔴 KARE ŞİŞMİŞ — expo-camera patch\'i bu BINARY\'de yok gibi. ' +
      'NATIVE REBUILD gerekiyor (npx expo run:ios --device); Metro reload yetmez.',
    { width, height },
  );
};

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÇEK VE DOĞRUDAN DÖN — KIRPMA EKRANI YOK (kampüs anları, istek).
 * ══════════════════════════════════════════════════════════════════════════
 * `captureAndCropPhoto`ın kırpıcısız kardeşi. İstek birebir şuydu: "artıya
 * basınca galeri filan sunmasın direkt kamerayı açsın, çekince de preview
 * olarak dursun ekranda, loading'e girmesin, sonra da yollayayım".
 *
 * Yani akış: deklanşör → ÖNİZLEME (paylaşım onayı) → paylaş. Arada kırpma
 * ekranı yok ve olmasına gerek de yok: kamera 3:4 çekiyor ve kullanıcının
 * deklanşöre basarken gördüğü pencere TAM OLARAK o kare (bkz.
 * CameraCaptureOverlay > `pictureSize`/`frameWindow`). Kırpıcı o kareyi
 * yeniden onaylatmaktan başka bir şey yapmıyordu.
 *
 * ⚠️ BU YOL AYRICA DAHA AZ BELLEK: kırpıcı 12MP kareyi JS tarafında bir kez
 * daha decode + render ediyor (`ImageManipulator`) ve o adım kampüs akışında
 * çekimden sonra uygulamanın ölmesinin en olası ikinci sebebiydi (ilki native
 * çekimin kendisi, bkz. `patches/expo-camera+56.0.8.patch`). Ölçekleme artık
 * paylaşma anında, TEK seferde yapılıyor (`fitPhotoForUpload`).
 *
 * ⚠️ DOSYA HAM VE BÜYÜK: döndürülen URI kameranın cache kopyası, 12MP'e kadar.
 * Yüklemeye GİTMEZ — çağıran paylaşırken `fitPhotoForUpload`dan geçirmek
 * zorunda. Önizlemede sorun değil: expo-image dosyayı gösterim ölçeğinde
 * çözüyor.
 *
 * Overlay bağlı değilse (simülatör, test) sistem kamerasına düşüyor; orada
 * ikinci onay ekranı var ama fotoğraf eklemek hiç çalışmamasından iyi.
 */
export const captureRawPhoto = async (
  options: CameraRequest = {},
): Promise<RawShot | null> => {
  await ensureCameraPermission();

  const outcome = await presentCameraCapture(options);

  if (outcome.status === 'captured') {
    const { shot } = outcome;
    warnIfFrameInflated(shot.width, shot.height);
    return { uri: shot.uri, width: shot.width, height: shot.height };
  }
  // Yerinde onay bu çağrıda açılmıyor (`commit` geçilmiyor) — tip daraltması.
  if (outcome.status === 'committed') return null;
  if (outcome.status === 'cancelled') return null;
  if (outcome.status === 'failed') {
    devLog('📷 [photoPicker] çekim başarısız', outcome.error);
    return null;
  }

  // `unavailable` → sistem kamerası. Burada kırpma YOK (bu yolun tamamı
  // kırpıcısız); gelen asset'i ham kare gibi geçiriyoruz.
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      exif: false,
      base64: false,
      cameraType: options.facing === 'front'
        ? ImagePicker.CameraType.front
        : ImagePicker.CameraType.back,
    });
  } catch (error) {
    devLog('📷 [photoPicker] sistem kamerası açılamadı', error);
    return null;
  }
  if (result.canceled || !result.assets?.length) return null;
  const [asset] = result.assets;
  return { uri: asset.uri, width: asset.width ?? 0, height: asset.height ?? 0 };
};

/**
 * `captureAndSendPhoto`ın sonucu.
 *
 * `error` YALNIZ YEDEK YOLDA dolu: uygulama içi kamera ekranı açıldıysa hata
 * metni ORADA satır içinde gösterildi ve kullanıcı aynı kareyle tekrar
 * deneyebildi — çağıranın ikinci bir yerde aynı şeyi söylemesi gürültü. Sistem
 * kamerasına düşülen dalda (simülatör, overlay söküldü) gösterecek bir yüzey
 * yok, o yüzden metin çağırana veriliyor.
 */
export type SendShotResult = { sent: boolean; error: string | null };

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÇEK → KARE EKRANDA DONSUN → AYNI EKRANDAN GÖNDER (istek).
 * ══════════════════════════════════════════════════════════════════════════
 * İstek birebir: "fotoyu çektikten sonra loader geliyor hâlâ kamera
 * çalışırken, çok uzun sürüyor; direkt çektiğim ekranda foto static kalsın,
 * oradan göndere basınca göndereyim, ekstra modal filan açma".
 *
 * `captureRawPhoto`dan farkı TEK ŞEY: kare çekildikten sonra ekran KAPANMIYOR.
 * Önizleme ve onay kameranın kendi penceresinde oluyor, gönderme işini de
 * `commit` orada koşturuyor (gösterge gönder düğmesinde, hata satır içinde).
 * Yani akış tek ekran: deklanşör → donmuş kare → gönder.
 *
 * KALDIRDIĞI ADIM: çekimden sonra açılan onay sheet'i (`CampusMomentComposer`).
 * O sheet önizleme + paylaş düğmesi + satır içi hatadan oluşuyordu; üçü de
 * buraya taşındı, yani kaybolan bir yetenek yok — kaybolan şey bir modal.
 *
 * ⚠️ `commit` SANİYELER SÜRER ve ekran o boyunca açık kalır: sözleşme
 * `cameraBridge > commit`te (null = başarılı, string = satır içi hata).
 *
 * ⚠️ HAM DOSYANIN SAHİBİ `commit`: başarıda da hatada da silme/saklama kararı
 * onun (kampüs yolunda `fitPhotoForUpload` ayrı bir dosya üretiyor ve ham kare
 * yalnız başarıdan sonra unutuluyor).
 */
export const captureAndSendPhoto = async (options: {
  facing?: 'front' | 'back';
  /** Gönder düğmesinin erişilebilir adı — kampüste "Paylaş". */
  commitLabel?: string;
  /** Düğmenin solundaki gri açıklama — kampüste "… gönder" (bkz. köprü). */
  commitHint?: string;
  commit: (shot: RawShot) => Promise<string | null>;
}): Promise<SendShotResult> => {
  await ensureCameraPermission();

  const outcome = await presentCameraCapture({
    facing: options.facing,
    commitLabel: options.commitLabel,
    commitHint: options.commitHint,
    commit: (shot) => {
      warnIfFrameInflated(shot.width, shot.height);
      return options.commit({
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
      });
    },
  });

  if (outcome.status === 'committed') return { sent: true, error: null };
  if (outcome.status === 'failed') {
    devLog('📷 [photoPicker] çekim başarısız', outcome.error);
    return { sent: false, error: null };
  }
  // ⚠️ `captured` BU YOLDA GELMEZ: `commit` verildiği için ekran kareyi kendi
  // içinde tutuyor. Yine de yutulmuyor — gelirse kare kaybolmuş olur.
  if (outcome.status === 'captured') {
    devLog('📷 [photoPicker] 🔴 yerinde onay yolunda `captured` döndü');
    forgetPhoto(outcome.shot.uri);
    return { sent: false, error: null };
  }
  if (outcome.status === 'cancelled') return { sent: false, error: null };

  /**
   * `unavailable` → SİSTEM KAMERASI. Orada ikinci onay ekranı sistemin
   * kendisinde ("Tekrar Çek / Fotoğrafı Kullan"), yani önizleme yine var;
   * gönderme işi buradan tetikleniyor ve hata metni ÇAĞIRANA dönüyor (gerekçe
   * `SendShotResult`ta).
   */
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      exif: false,
      base64: false,
      cameraType:
        options.facing === 'front'
          ? ImagePicker.CameraType.front
          : ImagePicker.CameraType.back,
    });
  } catch (error) {
    devLog('📷 [photoPicker] sistem kamerası açılamadı', error);
    return { sent: false, error: null };
  }
  if (result.canceled || !result.assets?.length) {
    return { sent: false, error: null };
  }
  const [asset] = result.assets;
  const failure = await options.commit({
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  });
  return { sent: !failure, error: failure ?? null };
};

/**
 * HAM KAREYİ YÜKLEME ÇIKTISINA ÇEVİRİR — sessiz, arayüzsüz.
 *
 * Kırpıcının son adımının (`handleConfirm`) kullanıcı kadrajı olmayan hâli:
 * ortadan 3:4 kes, `OUTPUT_W×OUTPUT_H`ye ölçekle, `OUTPUT_QUALITY` ile JPEG
 * kaydet ve kalıcı dizine taşı. Kaynak zaten 3:4 ise kesilen tek bir piksel
 * bile yok (bkz. `centerCropRect`).
 *
 * ⚠️ NEDEN PAYLAŞMA ANINDA, ÇEKİMDEN HEMEN SONRA DEĞİL: istek "çekince
 * loading'e girmesin"di. Ölçekleme 12MP bir karede yüz milisaniyeleri alıyor
 * ve deklanşörle önizleme arasına girerse kullanıcı tam o anda bir yükleme
 * görüyor. Paylaşma anında ise zaten bir yükleme durumu var (S3 PUT).
 *
 * ⚠️ `release()` İHMAL EDİLEMEZ: 12MP bir kaynakta sızdırılan tek bir ImageRef
 * ~50 MB ve bu yol her paylaşımda koşuyor.
 */
export const fitPhotoForUpload = async (
  shot: RawShot,
): Promise<PickedPhoto | null> => {
  const size =
    shot.width > 0 && shot.height > 0
      ? { width: shot.width, height: shot.height }
      : await measure(shot.uri);
  if (!size) return null;

  const rect = centerCropRect({
    srcW: size.width,
    srcH: size.height,
    aspectW: 3,
    aspectH: 4,
  });

  const context = ImageManipulator.manipulate(shot.uri);
  let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
  try {
    context.crop(rect).resize({ width: OUTPUT_W, height: OUTPUT_H });
    ref = await context.renderAsync();
    const result = await ref.saveAsync({
      compress: OUTPUT_QUALITY,
      format: SaveFormat.JPEG,
    });
    const fileName = `photo_${Date.now()}.jpg`;
    const uri = await persistPickedPhoto(result.uri, fileName);
    return { uri, mime: 'image/jpeg', fileName };
  } catch (error) {
    devLog('📷 [photoPicker] yükleme ölçeklemesi başarısız', error);
    return null;
  } finally {
    ref?.release?.();
    context.release?.();
  }
};

/**
 * Önizleme oturumunun `crop` + `commit` kancaları ve sonucu.
 *
 * DOSYA SAHİPLİĞİ (overlay ile pazarlık, testler sabitliyor):
 *  - ✕ (cancelled): overlay ekrandaki karenin dosyasını KENDİSİ unutuyor —
 *    kamerasız modda galeri cache kopyası, kırpmadan sonra ise BİZİM son kırpma
 *    çıktımız. Bu yüzden `cancelled`da burada HİÇBİR ŞEY unutulmaz.
 *  - Kırpma başarılıysa ekrandan düşen ÖNCEKİ kare (ham kaynak ya da bir önceki
 *    kırpma) burada unutulur; overlay kırpma etrafında `forgetPhoto` çağırmaz.
 *  - Onayda ham kare, `fitPhotoForUpload` YENİ dosyayı yazdıktan SONRA unutulur
 *    (önce unutursak ölçekleme patladığında kullanıcı yeniden denemek için
 *    elinde dosya bulamaz). Kırpma çıktısı ise NİHAİ dosyadır — asla unutulmaz.
 */
const createPreviewSession = (failedMessage: string) => {
  // Kırpıcıdan çıkmış, ekranda hâlâ duran nihai fotoğraflar (uri → foto).
  const cropped = new Map<string, PickedPhoto>();
  let collected: PickedPhoto | null = null;

  const crop: NonNullable<CameraRequest['crop']> = async (shot) => {
    // Boyut native'den gelmezse (0) ölçüyü kendimiz okuyoruz — kırpma
    // geometrisinin tek girdisi bu.
    const size =
      shot.width > 0 && shot.height > 0
        ? { width: shot.width, height: shot.height }
        : await measure(shot.uri);
    if (!size) return null;

    const outcome = await presentCropper({
      uri: shot.uri,
      srcWidth: size.width,
      srcHeight: size.height,
    });
    // `skipped`/`aborted`/`failed` → ekrandaki kare olduğu gibi kalıyor.
    if (outcome.status !== 'done') {
      if (outcome.status === 'failed') {
        devLog('📷 [photoPicker] önizleme kırpması başarısız', outcome.error);
      }
      return null;
    }

    cropped.delete(shot.uri);
    forgetPhoto(shot.uri);
    cropped.set(outcome.photo.uri, outcome.photo);
    return { uri: outcome.photo.uri, width: OUTPUT_W, height: OUTPUT_H };
  };

  const commit: NonNullable<CameraRequest['commit']> = async (shot) => {
    const final = cropped.get(shot.uri);
    if (final) {
      // Zaten 900x1200 ve kalıcı dizinde — yeniden ölçeklemek kalite kaybı.
      collected = final;
      return null;
    }

    const fitted = await fitPhotoForUpload(shot);
    if (!fitted) return failedMessage;
    forgetPhoto(shot.uri);
    collected = fitted;
    return null;
  };

  return { crop, commit, result: () => collected };
};

/**
 * Kamerayla çek, aynı ekranda önizle (kampüsün tam penceresi), istenirse kırp, onayla.
 * Kırpıcı KENDİLİĞİNDEN açılmaz — `captureAndCropPhoto`dan farkı bu.
 *
 * `commitHint` bilerek GEÇİLMİYOR: sol alttaki yazı bu yüzden çizilmiyor.
 * Overlay bağlı değilse sistem kamerası + kırpıcı yedeğine düşer.
 */
export const captureAndPreviewPhoto = async (options: {
  facing?: 'front' | 'back';
  /** Ölçekleme patlarsa satır içinde gösterilecek metin (çağıranın `t`si). */
  failedMessage: string;
  /** Onay okunun erişilebilir adı. */
  commitLabel?: string;
}): Promise<PickedPhoto | null> => {
  await ensureCameraPermission();

  const session = createPreviewSession(options.failedMessage);
  const outcome = await presentCameraCapture({
    facing: options.facing,
    // KAMPÜSÜN TAM PENCERESİ (deklanşöre kadar) — 3:4 kutu DEĞİL. İstek
    // birebir: "çok kare gibi oluyor, görüntü çekme tuşuna kadar uzansın".
    // Bedeli bilerek kabul edildi: pencere ekran oranında, kare 3:4; önizleme
    // iki yandan dar, yüklenen kare (`fitPhotoForUpload` / kırpıcı çıktısı)
    // görülenden yanlarda biraz GENİŞ — kampüs anlarıyla aynı tolerans.
    frame: 'fill',
    commitLabel: options.commitLabel,
    crop: session.crop,
    commit: session.commit,
  });

  if (outcome.status === 'unavailable') {
    // Doğrudan sistem kamerası — `captureAndCropPhoto`ya DEVRETMİYORUZ: o,
    // izni ve `presentCameraCapture()`ı bir kez daha çalıştırır; `unavailable`
    // overlay'in hazır-zaman aşımından / mount hatasından geliyorsa (overlay
    // hâlâ bağlı) kullanıcı uygulama içi kamerayı ikinci kez yukarı kayıp 3,5
    // sn karanlıkta kalıp inerken görürdü. `captureWithSystemCamera` kırpmayı
    // (`cropSequentially`) zaten kendisi yapıyor.
    return captureWithSystemCamera();
  }
  if (outcome.status === 'cancelled') return null;
  if (outcome.status === 'failed') {
    devLog('📷 [photoPicker] çekim başarısız', outcome.error);
    return null;
  }
  if (outcome.status === 'captured') {
    // `commit` verildiği için imkânsız; gelirse kare sahipsiz kalmasın.
    devLog('📷 [photoPicker] önizleme yolunda beklenmeyen captured');
    forgetPhoto(outcome.shot.uri);
    return null;
  }

  const photo = session.result();
  if (!photo) devLog('📷 [photoPicker] committed ama fotoğraf toplanmadı');
  return photo;
};

/**
 * Galeriden seç, her fotoğrafı SIRAYLA önizleme ekranından geçir.
 *
 * Aynı anda tek ekran (48MP kaynaklarda paralel decode belleği uçuruyor).
 * ✕ o fotoğrafı atlar, sıradakine geçer. Overlay söküldüyse (`unavailable`)
 * döngü kırılır ve KALANLAR eski kırpıcı yoluna (`cropSequentially`) verilir;
 * önizleme bir daha denenmez.
 */
export const pickAndPreviewPhotos = async (
  maxFiles: number,
  options: { failedMessage: string; commitLabel?: string },
): Promise<PickedPhoto[]> => {
  const limit = Math.max(1, maxFiles);
  const assets = await openLibrary(limit);
  if (!assets) return [];

  const photos: PickedPhoto[] = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const size = await resolveDimensions(asset);
    if (!size) {
      devLog('📷 [photoPicker] boyut yok, fotoğraf atlandı', asset.uri);
      continue;
    }

    const session = createPreviewSession(options.failedMessage);
    const outcome = await presentCameraCapture({
      // Kamerayla AYNI pencere (gerekçe `captureAndPreviewPhoto`da) — iki yol
      // aynı ekran, fotoğraf aynı yerde.
      frame: 'fill',
      source: { uri: asset.uri, width: size.width, height: size.height },
      commitLabel: options.commitLabel,
      crop: session.crop,
      commit: session.commit,
    });

    if (outcome.status === 'unavailable') {
      photos.push(...(await cropSequentially(assets.slice(i))));
      break;
    }
    if (outcome.status === 'committed') {
      const photo = session.result();
      if (photo) photos.push(photo);
      else devLog('📷 [photoPicker] committed ama fotoğraf toplanmadı');
      continue;
    }
    if (outcome.status === 'failed') {
      devLog('📷 [photoPicker] önizleme başarısız, fotoğraf atlandı', outcome.error);
    }
    // `cancelled`: overlay o anki `shot`ı (galeri `source` kopyası ya da
    // çağıranın son kırpma çıktısı) kendisi unuttu, burada unutulacak bir şey
    // yok. `failed` ise overlay'den HİÇ gelmiyor (overlay `failed` üretmez);
    // bu dal savunmacı — gelseydi dosyayı kimsenin unutmayacağını bilerek
    // yalnızca atlıyoruz.
  }

  devLog('📷 [photoPicker] önizlemeden dönen', {
    secilen: assets.length,
    donen: photos.length,
  });
  return photos;
};

/**
 * Uygulama içi kamera yoksa eski yol. Çift onay burada KALIYOR — bilerek.
 *
 * FAIL-SOFT: bu yola düşmenin en sık sebebi kamera DONANIMININ olmaması
 * (simülatör) ve `launchCameraAsync` orada fırlatıyor. Çağıranların üçü de
 * hatayı yutup logluyor; yine de null'a çevirip tek bir davranış bırakıyoruz.
 */
const captureWithSystemCamera = async (): Promise<PickedPhoto | null> => {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      exif: false,
      base64: false,
    });
  } catch (error) {
    devLog('📷 [photoPicker] sistem kamerası açılamadı', error);
    return null;
  }

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
