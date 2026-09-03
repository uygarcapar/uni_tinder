import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import type { CameraView } from 'expo-camera';
import { devLog } from '@/shared/utils/devLog';
import type { SelfieFrame } from './selfieService';

/**
 * Doğrulama karesini üretir.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 AYNA DÜZELTMESİ YAPILMAZ — buraya flip EKLEMEYİN.
 * ══════════════════════════════════════════════════════════════════════════
 * Ön kamera çoğu cihazda önizlemeyi aynalıyor (kullanıcı kendini aynadaki gibi
 * görsün diye). Kaydedilen DOSYANIN aynalanıp aynalanmadığı ise platform ve
 * cihaza göre değişiyor, üstelik AWS'nin `Yaw` işaret konvansiyonu da
 * dokümante değil. Yani "+25 sağ mı sol mu" iki bilinmeyenli bir soru ve
 * istemcide tahmine dayalı bir düzeltme yapmak onu ÇÖZMÜYOR, gizliyor.
 *
 * Sözleşme kalibrasyona kadar şu: kameranın ürettiği dosya HAM gider.
 * `CameraView` de `mirror={false}` ile kuruluyor — böylece önizleme ile dosya
 * aynı yönde, "sağa çevir" talimatı ikisinde de aynı şeye karşılık geliyor.
 * Kalibrasyon Yaw'ın işaretini ölçüp sözleşmeyi yazdıktan sonra (ve ancak o
 * zaman) burası değişebilir.
 *
 * Yeniden boyutlandırma güvenli: ölçek poz açısını değiştirmiyor, yalnızca
 * yükleme süresini kısaltıyor (UX'i doğrudan etkiliyor, kare başına ≤5 MB
 * sınırı da var).
 */

// 1080p yeterli — yüksek çözünürlük doğruluğu artırmıyor, yüklemeyi uzatıyor.
const MAX_WIDTH = 1080;
const QUALITY = 0.7;
/** Backend sınırı 5 MB; buraya çarpmamamız gerekiyor, çarparsak logla. */
const MAX_BYTES = 5 * 1024 * 1024;

export class SelfieCaptureError extends Error {
  constructor(cause?: unknown) {
    super('selfie_capture_failed');
    this.name = 'SelfieCaptureError';
    (this as any).cause = cause;
  }
}

/**
 * Tek kare çeker, 1080p'ye indirip JPEG olarak kaydeder.
 *
 * `skipProcessing` KULLANILMIYOR: Android'de kareyi ham sensör oryantasyonunda
 * döndürüyor (EXIF'e uyulmuyor), yüz 90° yatık gelirse poz analizi anlamsız
 * olur. İşleme hattının maliyeti burada doğru sonuçtan daha ucuz.
 */
export async function captureSelfieFrame(
  camera: CameraView,
  index: number,
): Promise<SelfieFrame> {
  const shot = await camera.takePictureAsync({
    quality: QUALITY,
    // Base64/EXIF gerekmiyor — ikisi de yalnızca bellek ve süre.
    base64: false,
    exif: false,
  });

  if (!shot?.uri) throw new SelfieCaptureError('empty picture');

  const context = ImageManipulator.manipulate(shot.uri);
  let ref: Awaited<ReturnType<typeof context.renderAsync>> | null = null;
  try {
    if (shot.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
    ref = await context.renderAsync();
    const result = await ref.saveAsync({
      compress: QUALITY,
      format: SaveFormat.JPEG,
    });

    const fileName = `selfie_${index}_${Date.now()}.jpg`;
    logFrame(fileName, result.uri, shot.width, shot.height);
    return { uri: result.uri, name: fileName, type: 'image/jpeg' };
  } catch (error) {
    devLog('🪪 [selfie] kare işlenemedi', error);
    throw new SelfieCaptureError(error);
  } finally {
    // CropperOverlay ile aynı gerekçe: sızdırılan tek ImageRef yüzlerce MB.
    ref?.release?.();
    context.release?.();
  }
}

/**
 * Kalibrasyon için cihaz + kare bilgisi. Rehber §6.2 hangi cihazda test
 * edildiğinin bildirilmesini istiyor; sunucuya EK VERİ göndermiyoruz, bilgi
 * geliştirici log'unda kalıyor.
 */
function logFrame(fileName: string, uri: string, srcW: number, srcH: number) {
  let bytes: number | null = null;
  try {
    bytes = new File(uri).size;
  } catch {
    // Boyut okunamadıysa log eksik kalsın, akış durmasın.
  }
  if (bytes != null && bytes > MAX_BYTES) {
    devLog(`🪪 [selfie] ⚠️ kare 5 MB sınırını aştı: ${bytes} bayt`);
  }
  devLog(
    `🪪 [selfie] ${fileName} | ${Platform.OS} ${String(Platform.Version)} | ` +
      `kaynak ${srcW}x${srcH} | ${bytes ?? '?'} bayt | ayna düzeltmesi YOK`,
  );
}
