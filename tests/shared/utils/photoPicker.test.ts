import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';

import {
  pickAndCropPhotos,
  captureAndCropPhoto,
  recropExistingPhoto,
  captureAndPreviewPhoto,
  pickAndPreviewPhotos,
} from '@/shared/utils/photoPicker';
import { presentCropper } from '@/shared/components/cropper/cropperBridge';
import { presentCameraCapture } from '@/shared/components/camera/cameraBridge';
import type {
  CameraOutcome,
  CameraRequest,
} from '@/shared/components/camera/cameraBridge';
import { forgetPhoto } from '@/shared/utils/photoStore';

jest.mock('@/shared/components/cropper/cropperBridge', () => ({
  presentCropper: jest.fn(),
}));
jest.mock('@/shared/components/camera/cameraBridge', () => ({
  presentCameraCapture: jest.fn(),
}));
jest.mock('@/shared/utils/photoStore', () => ({
  forgetPhoto: jest.fn(),
  persistPickedPhoto: jest.fn(
    async (_uri: string, name: string) => `file:///documents/profile-photos/${name}`,
  ),
}));

const mockPresent = presentCropper as jest.MockedFunction<typeof presentCropper>;
const mockShoot = presentCameraCapture as jest.MockedFunction<
  typeof presentCameraCapture
>;
const mockForget = forgetPhoto as jest.MockedFunction<typeof forgetPhoto>;
const mockDownload = File.downloadFileAsync as jest.Mock;
const mockLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockCamera = ImagePicker.launchCameraAsync as jest.Mock;
const mockGetCameraPerm = ImagePicker.getCameraPermissionsAsync as jest.Mock;
const mockRequestCameraPerm = ImagePicker.requestCameraPermissionsAsync as jest.Mock;

const asset = (uri: string) => ({ uri, width: 3000, height: 4000 });
const done = (uri: string) => ({
  status: 'done' as const,
  photo: { uri, mime: 'image/jpeg', fileName: 'photo.jpg' },
});

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks `mockResolvedValueOnce` kuyruğunu BOŞALTMIYOR: tüketilmemiş
  // bir "once" bir sonraki teste sızıp yanlış sonuç döndürüyordu.
  mockPresent.mockReset();
  mockShoot.mockReset();
  mockLibrary.mockReset();
  mockCamera.mockReset();
  mockGetCameraPerm.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  // Varsayılan: uygulama içi kamera yok → sistem kamerası yedeği. Yeni yolu
  // sınayan testler bunu kendi içinde eziyor.
  mockShoot.mockResolvedValue({ status: 'unavailable' });
});

describe('pickAndCropPhotos', () => {
  it('iptal edilince boş dizi döner ve cropper hiç açılmaz', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickAndCropPhotos(6)).resolves.toEqual([]);
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('PHPicker yolunu seçen seçenekleri geçer', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });

    await pickAndCropPhotos(4);

    const options = mockLibrary.mock.calls[0][0];
    // allowsEditing:false PHPicker'ı seçen bayrak; true olsaydı eski
    // UIImagePickerController'a düşerdi.
    expect(options.allowsEditing).toBe(false);
    expect(options.allowsMultipleSelection).toBe(true);
    expect(options.selectionLimit).toBe(4);
    expect(options.orderedSelection).toBe(true);
    expect(options.shouldDownloadFromNetwork).toBe(true);
    // quality GEÇİLMEMELİ: native varsayılan dosyayı kopyalıyor, altındaki her
    // değer gereksiz bir decode + yeniden kodlama tetikliyor.
    expect(options.quality).toBeUndefined();
  });

  it('tek slot kaldığında çoklu seçimi kapatır', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });

    await pickAndCropPhotos(1);

    expect(mockLibrary.mock.calls[0][0].allowsMultipleSelection).toBe(false);
  });

  it('her fotoğrafı sırayla kırpar, iptal edileni atlar', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    mockPresent
      .mockResolvedValueOnce(done('file:///a-crop.jpg'))
      .mockResolvedValueOnce({ status: 'skipped' })
      .mockResolvedValueOnce(done('file:///c-crop.jpg'));

    const photos = await pickAndCropPhotos(6);

    expect(photos.map((p) => p.uri)).toEqual(['file:///a-crop.jpg', 'file:///c-crop.jpg']);
    expect(mockPresent).toHaveBeenCalledTimes(3);
    expect(mockPresent.mock.calls.map(([req]) => [req.index, req.total])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('aborted gelince döngüyü kırar (asılı kalmaz)', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    mockPresent
      .mockResolvedValueOnce(done('file:///a-crop.jpg'))
      .mockResolvedValueOnce({ status: 'aborted' })
      .mockResolvedValueOnce(done('file:///c-crop.jpg'));

    const photos = await pickAndCropPhotos(6);

    expect(photos).toHaveLength(1);
    expect(mockPresent).toHaveBeenCalledTimes(2);
  });

  it('kırpma teknik olarak patlarsa o fotoğrafı atlar, akışı durdurmaz', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg')],
    });
    mockPresent
      .mockResolvedValueOnce({ status: 'failed', error: new Error('decode') })
      .mockResolvedValueOnce(done('file:///b-crop.jpg'));

    const photos = await pickAndCropPhotos(6);

    expect(photos.map((p) => p.uri)).toEqual(['file:///b-crop.jpg']);
  });

  it('seçim limitin üstündeyse fazlasını keser', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    mockPresent.mockResolvedValue(done('file:///crop.jpg'));

    await pickAndCropPhotos(2);

    expect(mockPresent).toHaveBeenCalledTimes(2);
  });
});

describe('captureAndCropPhoto', () => {
  it('izin yoksa E_NO_CAMERA_PERMISSION fırlatır ve canAskAgain taşır', async () => {
    mockGetCameraPerm.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' });

    await expect(captureAndCropPhoto()).rejects.toMatchObject({
      code: 'E_NO_CAMERA_PERMISSION',
      canAskAgain: false,
    });
    expect(mockRequestCameraPerm).not.toHaveBeenCalled();
    expect(mockCamera).not.toHaveBeenCalled();
  });

  it('sorulabiliyorsa izni ister', async () => {
    mockGetCameraPerm.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' });
    mockRequestCameraPerm.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
    mockCamera.mockResolvedValue({ canceled: false, assets: [asset('file:///shot.jpg')] });
    mockPresent.mockResolvedValue(done('file:///shot-crop.jpg'));

    await expect(captureAndCropPhoto()).resolves.toMatchObject({ uri: 'file:///shot-crop.jpg' });
    expect(mockRequestCameraPerm).toHaveBeenCalled();
  });

  it('çekim iptal edilirse null döner', async () => {
    mockCamera.mockResolvedValue({ canceled: true, assets: null });

    await expect(captureAndCropPhoto()).resolves.toBeNull();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('kırpma iptal edilirse null döner', async () => {
    mockCamera.mockResolvedValue({ canceled: false, assets: [asset('file:///shot.jpg')] });
    mockPresent.mockResolvedValue({ status: 'skipped' });

    await expect(captureAndCropPhoto()).resolves.toBeNull();
  });

  describe('uygulama içi kamera', () => {
    const shot = (uri: string, width = 3024, height = 4032) => ({
      status: 'captured' as const,
      shot: { uri, width, height },
    });

    it('kareyi SİSTEM kamerasına hiç uğramadan kırpıcıya verir', async () => {
      mockShoot.mockResolvedValue(shot('file:///cache/shot.jpg'));
      mockPresent.mockResolvedValue(done('file:///shot-crop.jpg'));

      await expect(captureAndCropPhoto()).resolves.toMatchObject({
        uri: 'file:///shot-crop.jpg',
      });
      // İkinci onay ekranının kaynağı buydu: artık hiç açılmıyor.
      expect(mockCamera).not.toHaveBeenCalled();
      expect(mockPresent.mock.calls[0][0]).toMatchObject({
        uri: 'file:///cache/shot.jpg',
        srcWidth: 3024,
        srcHeight: 4032,
      });
      // Tek fotoğraflık akış — sayaç gönderilmiyor.
      expect(mockPresent.mock.calls[0][0].index).toBeUndefined();
    });

    it('kırpıcıdaki ✕ kamerayı YENİDEN açar (yeniden çek)', async () => {
      mockShoot
        .mockResolvedValueOnce(shot('file:///cache/first.jpg'))
        .mockResolvedValueOnce(shot('file:///cache/second.jpg'));
      mockPresent
        .mockResolvedValueOnce({ status: 'skipped' })
        .mockResolvedValueOnce(done('file:///second-crop.jpg'));

      await expect(captureAndCropPhoto()).resolves.toMatchObject({
        uri: 'file:///second-crop.jpg',
      });
      expect(mockShoot).toHaveBeenCalledTimes(2);
      // İptal edilen kare diskte kalmıyor.
      expect(mockForget).toHaveBeenCalledWith('file:///cache/first.jpg');
    });

    it('kamerada iptal → null, kırpıcı hiç açılmaz', async () => {
      mockShoot.mockResolvedValue({ status: 'cancelled' });

      await expect(captureAndCropPhoto()).resolves.toBeNull();
      expect(mockPresent).not.toHaveBeenCalled();
      expect(mockCamera).not.toHaveBeenCalled();
    });

    it('çekim teknik olarak patlarsa sistem kamerasına DÜŞMEZ', async () => {
      mockShoot.mockResolvedValue({ status: 'failed', error: new Error('native') });

      await expect(captureAndCropPhoto()).resolves.toBeNull();
      expect(mockCamera).not.toHaveBeenCalled();
    });

    it('native boyut vermezse ölçüyü kendisi okur', async () => {
      mockShoot.mockResolvedValue(shot('file:///cache/shot.jpg', 0, 0));
      mockPresent.mockResolvedValue(done('file:///shot-crop.jpg'));
      jest
        .spyOn(Image, 'getSize')
        .mockImplementation(((_uri: string, success: any) => success(1200, 1600)) as any);

      await captureAndCropPhoto();

      expect(mockPresent.mock.calls[0][0]).toMatchObject({
        srcWidth: 1200,
        srcHeight: 1600,
      });
    });

    it('overlay bağlı değilse sistem kamerası yedeği çalışır', async () => {
      mockShoot.mockResolvedValue({ status: 'unavailable' });
      mockCamera.mockResolvedValue({ canceled: false, assets: [asset('file:///shot.jpg')] });
      mockPresent.mockResolvedValue(done('file:///shot-crop.jpg'));

      await expect(captureAndCropPhoto()).resolves.toMatchObject({
        uri: 'file:///shot-crop.jpg',
      });
      expect(mockCamera).toHaveBeenCalledTimes(1);
    });
  });
});

describe('recropExistingPhoto', () => {
  const REMOTE = 'https://cdn.example.com/photo.jpg?v=42';

  beforeEach(() => {
    mockDownload.mockReset();
    mockDownload.mockImplementation(async (_url: string, destination: any) => destination);
    jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, success: any) => success(900, 1200)) as any);
  });

  it('uzak fotoğrafı önce indirir, kırpıcıya YEREL kopyayı verir', async () => {
    mockPresent.mockResolvedValue(done('file:///documents/profile-photos/new.jpg'));

    const photo = await recropExistingPhoto(REMOTE);

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload.mock.calls[0][0]).toBe(REMOTE);
    // Üç ayrı yükleyicinin (getSize / expo-image / manipulator) aynı byte'ları
    // görmesi bu tek dosyaya bağlı — kırpıcıya uzak URL GİTMEMELİ.
    const request = mockPresent.mock.calls[0][0];
    expect(request.uri).not.toBe(REMOTE);
    expect(request.uri.startsWith('file:///caches/recrop/')).toBe(true);
    expect(request).toMatchObject({ srcWidth: 900, srcHeight: 1200 });
    expect(photo).toMatchObject({ uri: 'file:///documents/profile-photos/new.jpg' });
  });

  it('indirilen kaynağı her hâlükârda siler', async () => {
    mockPresent.mockResolvedValue({ status: 'skipped' });

    await expect(recropExistingPhoto(REMOTE)).resolves.toBeNull();

    const source = mockPresent.mock.calls[0][0].uri;
    expect(mockForget).toHaveBeenCalledWith(source);
  });

  it('indirme patlarsa kırpıcı hiç açılmaz', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));

    await expect(recropExistingPhoto(REMOTE)).resolves.toBeNull();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('boyut okunamazsa kırpıcı açılmaz ama kaynak temizlenir', async () => {
    jest
      .spyOn(Image, 'getSize')
      .mockImplementation(((_uri: string, _ok: any, fail: any) => fail(new Error('decode'))) as any);

    await expect(recropExistingPhoto(REMOTE)).resolves.toBeNull();
    expect(mockPresent).not.toHaveBeenCalled();
    expect(mockForget).toHaveBeenCalled();
  });

  it('çerçeveye dokunulmadıysa null döner (boşuna yeniden moderasyon yok)', async () => {
    mockPresent.mockResolvedValue({
      ...done('file:///documents/profile-photos/same.jpg'),
      adjusted: false,
    });

    await expect(recropExistingPhoto(REMOTE)).resolves.toBeNull();
    // Kırpma çıktısı da çöp: yüklenmeyecekse diskte durmasın.
    expect(mockForget).toHaveBeenCalledWith('file:///documents/profile-photos/same.jpg');
  });

  it('sayaç göndermez — tek fotoğraflık akış', async () => {
    mockPresent.mockResolvedValue(done('file:///crop.jpg'));

    await recropExistingPhoto(REMOTE);

    const request = mockPresent.mock.calls[0][0];
    expect(request.index).toBeUndefined();
    expect(request.total).toBeUndefined();
  });
});

/** Overlay'i taklit eder: isteği yakalar, `run` ile kancaları çalıştırır. */
const runSession = (run: (req: CameraRequest) => Promise<CameraOutcome>) =>
  mockShoot.mockImplementation((req) => run(req));

const shot = (uri: string, width = 3000, height = 4000) => ({ uri, width, height });

describe('captureAndPreviewPhoto', () => {
  it('kampüsle aynı tam pencere (deklanşöre kadar), kırpma kancası ve commit ile açar; kırpıcı KENDİLİĞİNDEN açılmaz', async () => {
    mockShoot.mockResolvedValue({ status: 'committed' });
    await captureAndPreviewPhoto({ facing: 'front', failedMessage: 'x' });
    const req = mockShoot.mock.calls[0][0];
    expect(req.frame).toBe('fill');
    expect(req.facing).toBe('front');
    expect(typeof req.crop).toBe('function');
    expect(typeof req.commit).toBe('function');
    expect(req.commitHint).toBeUndefined(); // sol alt YAZISIZ
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it('onaylanan ham kare fitPhotoForUpload ile 3:4 çıktıya çevrilir', async () => {
    runSession(async (req) => {
      await expect(req.commit!(shot('file:///raw.jpg'))).resolves.toBeNull();
      return { status: 'committed' };
    });
    const photo = await captureAndPreviewPhoto({ failedMessage: 'x' });
    expect(photo).toEqual({
      uri: expect.stringContaining('photo_'),
      mime: 'image/jpeg',
      fileName: expect.stringContaining('.jpg'),
    });
    // Ham kare, YENİ dosya yazıldıktan SONRA unutulur.
    expect(mockForget).toHaveBeenCalledWith('file:///raw.jpg');
  });

  it('ölçekleme patlarsa satır içi metin döner, ekran kapanmaz', async () => {
    (ImageManipulator.manipulate as jest.Mock).mockImplementationOnce(() => ({
      crop: jest.fn().mockReturnThis(),
      resize: jest.fn().mockReturnThis(),
      renderAsync: jest.fn(async () => {
        throw new Error('render');
      }),
      release: jest.fn(),
    }));
    runSession(async (req) => {
      await expect(req.commit!(shot('file:///raw.jpg'))).resolves.toBe('ölçeklenemedi');
      return { status: 'cancelled' };
    });
    await expect(
      captureAndPreviewPhoto({ failedMessage: 'ölçeklenemedi' }),
    ).resolves.toBeNull();
    // Yeni dosya yazılamadı: ham kare hâlâ kullanıcının elinde, unutulmaz.
    expect(mockForget).not.toHaveBeenCalled();
  });

  it('overlay yoksa eski kırpıcı yoluna düşer', async () => {
    mockShoot.mockResolvedValue({ status: 'unavailable' });
    mockCamera.mockResolvedValue({ canceled: true, assets: null });
    await expect(captureAndPreviewPhoto({ failedMessage: 'x' })).resolves.toBeNull();
    expect(mockCamera).toHaveBeenCalled();
    // Uygulama içi kamera ikinci kez AÇILMAMALI: `unavailable` zaten onun
    // başarısızlığı (hazır-zaman aşımı / mount hatası); doğrudan sistem kamerası.
    expect(mockShoot).toHaveBeenCalledTimes(1);
  });

  it('iptal → null, hiçbir dosya burada unutulmaz (overlay unutuyor)', async () => {
    mockShoot.mockResolvedValue({ status: 'cancelled' });
    await expect(captureAndPreviewPhoto({ failedMessage: 'x' })).resolves.toBeNull();
    expect(mockForget).not.toHaveBeenCalled();
  });
});

describe('pickAndPreviewPhotos', () => {
  it('galeri seçeneklerini DEĞİŞTİRMEDEN geçer', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });
    await pickAndPreviewPhotos(4, { failedMessage: 'x' });
    const options = mockLibrary.mock.calls[0][0];
    expect(options.allowsEditing).toBe(false);
    expect(options.allowsMultipleSelection).toBe(true);
    expect(options.selectionLimit).toBe(4);
    expect(options.orderedSelection).toBe(true);
    expect(options.shouldDownloadFromNetwork).toBe(true);
    expect(options.quality).toBeUndefined();
  });

  it('her fotoğrafı SIRAYLA önizler, ✕lenen atlanır', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    runSession(async (req) => {
      if (req.source!.uri === 'file:///b.jpg') return { status: 'cancelled' };
      await req.commit!(req.source!);
      return { status: 'committed' };
    });

    const photos = await pickAndPreviewPhotos(6, { failedMessage: 'x' });

    expect(photos).toHaveLength(2);
    expect(mockShoot).toHaveBeenCalledTimes(3);
    expect(mockShoot.mock.calls.map((c) => c[0].source!.uri)).toEqual([
      'file:///a.jpg',
      'file:///b.jpg',
      'file:///c.jpg',
    ]);
    // Her oturum kampüsün tam penceresi ve kırpma kancasıyla açılıyor, sol alt yazısız.
    expect(mockShoot.mock.calls[0][0].frame).toBe('fill');
    expect(mockShoot.mock.calls[0][0].commitHint).toBeUndefined();
    // ✕lenen b'yi overlay unutuyor; burada yalnızca onaylananların ham kaynağı.
    expect(mockForget).not.toHaveBeenCalledWith('file:///b.jpg');
  });

  it('sıranın ortasında overlay sökülürse kalanlar kırpıcı yoluna düşer', async () => {
    mockLibrary.mockResolvedValue({
      canceled: false,
      assets: [asset('file:///a.jpg'), asset('file:///b.jpg'), asset('file:///c.jpg')],
    });
    runSession(async (req) => {
      if (req.source!.uri === 'file:///a.jpg') {
        await req.commit!(req.source!);
        return { status: 'committed' };
      }
      return { status: 'unavailable' };
    });
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));

    const photos = await pickAndPreviewPhotos(6, { failedMessage: 'x' });

    expect(photos).toHaveLength(3);
    // Kalan İKİSİ kırpıcıdan geçti — önizleme bir kez daha denenmedi.
    expect(mockPresent).toHaveBeenCalledTimes(2);
    expect(mockShoot).toHaveBeenCalledTimes(2);
  });
});

describe('önizleme kırpma kancası', () => {
  // Kancayı eline almanın yolu: bir oturum açıp `req.crop`u çağırmak.
  const withHooks = async (run: (req: CameraRequest) => Promise<void>): Promise<void> => {
    runSession(async (req) => {
      await run(req);
      return { status: 'cancelled' };
    });
    await captureAndPreviewPhoto({ failedMessage: 'x' });
  };

  it('kırpılan kareyi OUTPUT ölçüleriyle döner', async () => {
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    await withHooks(async (req) => {
      await expect(req.crop!(shot('file:///raw.jpg'))).resolves.toEqual({
        uri: 'file:///cropped.jpg',
        width: 900,
        height: 1200,
      });
    });
  });

  it('native boyut 0 ise ölçüyü kendisi okur', async () => {
    (Image.getSize as jest.Mock).mockImplementation((_uri, ok) => ok(1200, 1600));
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    await withHooks(async (req) => {
      await req.crop!(shot('file:///raw.jpg', 0, 0));
    });
    expect(mockPresent).toHaveBeenCalledWith(
      expect.objectContaining({ srcWidth: 1200, srcHeight: 1600 }),
    );
  });

  it('kırpma iptal edilirse null döner ve HİÇBİR dosya unutulmaz', async () => {
    mockPresent.mockResolvedValue({ status: 'skipped' });
    await withHooks(async (req) => {
      await expect(req.crop!(shot('file:///raw.jpg'))).resolves.toBeNull();
    });
    expect(mockForget).not.toHaveBeenCalled();
  });

  it('üst üste iki kırpmada bir öncekinin dosyası unutulur', async () => {
    mockPresent
      .mockResolvedValueOnce(done('file:///crop1.jpg'))
      .mockResolvedValueOnce(done('file:///crop2.jpg'));
    await withHooks(async (req) => {
      const first = await req.crop!(shot('file:///raw.jpg'));
      await req.crop!(first!);
    });
    expect(mockForget).toHaveBeenCalledWith('file:///raw.jpg');
    expect(mockForget).toHaveBeenCalledWith('file:///crop1.jpg');
    expect(mockForget).not.toHaveBeenCalledWith('file:///crop2.jpg');
    // Oturum `cancelled` bitti: başka hiçbir şey unutulmaz (crop2'yi overlay unutur).
    expect(mockForget).toHaveBeenCalledTimes(2);
  });

  it('kırpılmış kare onaylanırsa fitPhotoForUpload ÇALIŞMAZ', async () => {
    mockPresent.mockResolvedValue(done('file:///cropped.jpg'));
    runSession(async (req) => {
      const cropped = await req.crop!(shot('file:///raw.jpg'));
      await expect(req.commit!(cropped!)).resolves.toBeNull();
      return { status: 'committed' };
    });
    const photo = await captureAndPreviewPhoto({ failedMessage: 'x' });
    // Kırpıcının çıktısı OLDUĞU GİBİ dönüyor — yeni bir photo_*.jpg yazılmadı.
    expect(photo).toEqual({
      uri: 'file:///cropped.jpg',
      mime: 'image/jpeg',
      fileName: 'photo.jpg',
    });
    // Manipülatör mock'u da aynı uri'yi döner; uri tek başına ayırt etmez.
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
    // Nihai dosya asla unutulmaz.
    expect(mockForget).not.toHaveBeenCalledWith('file:///cropped.jpg');
  });
});
