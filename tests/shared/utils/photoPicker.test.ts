import { Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';

import {
  pickAndCropPhotos,
  captureAndCropPhoto,
  recropExistingPhoto,
} from '@/shared/utils/photoPicker';
import { presentCropper } from '@/shared/components/cropper/cropperBridge';
import { forgetPhoto } from '@/shared/utils/photoStore';

jest.mock('@/shared/components/cropper/cropperBridge', () => ({
  presentCropper: jest.fn(),
}));
jest.mock('@/shared/utils/photoStore', () => ({
  forgetPhoto: jest.fn(),
}));

const mockPresent = presentCropper as jest.MockedFunction<typeof presentCropper>;
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
  mockLibrary.mockReset();
  mockCamera.mockReset();
  mockGetCameraPerm.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
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
