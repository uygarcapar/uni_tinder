/**
 * Mod kurulumunun FOTOĞRAF bölümü — iki alternatif yol:
 *
 *  • "Mevcut fotoğraflarımı kullan" (varsayılan) — yalnız kaynak modun
 *    GÖRÜNÜR foto sayısı ≥ 2 iken çizilir (sunucu görünürlük eşiği
 *    MinimumVisiblePhotos = 2; daha azını devralmak yeni modu gizli açardı).
 *  • Yeni kare — kamera/galeri, yerel kalır (upload submit'te, kayıt akışı
 *    kalıbı), ilk kare ana.
 *
 * Bileşen veriye sahip değil: seçim `value`/`onChange` ile çağıranda
 * (ModeSetupSheet), doğrulama ve gönderim de orada.
 */

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: any) => (o?.mode ? `${k}:${o.mode}` : k),
  }),
}));

const mockPick = jest.fn();
const mockCapture = jest.fn();
jest.mock('@/shared/utils/photoPicker', () => ({
  pickAndCropPhotos: (...a: unknown[]) => mockPick(...a),
  captureAndCropPhoto: (...a: unknown[]) => mockCapture(...a),
}));

// Gerçeği gorhom sheet'i — burada yalnız kablolama sınanıyor: görünürlük
// state'i + kaynak seçiminin doğru handler'a düşmesi.
jest.mock('@/shared/components/PhotoSourceSheet', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ visible, onCamera, onGallery }: any) =>
      visible ? (
        <>
          <Pressable testID="source-camera" onPress={onCamera}>
            <Text>camera</Text>
          </Pressable>
          <Pressable testID="source-gallery" onPress={onGallery}>
            <Text>gallery</Text>
          </Pressable>
        </>
      ) : null,
  };
});

import { render, fireEvent, screen, waitFor } from '@testing-library/react-native';
import ModeSetupPhotoSection, {
  type SetupPhotoChoice,
} from '@/features/discover/components/ModeSetupPhotoSection';
import { MAX_PROFILE_PHOTOS } from '@/shared/constants/limits';

const SOURCE = [
  { photoId: 'p1', photoImageUrl: 'https://x/p1.jpg' },
  { photoId: 'p2', photoImageUrl: 'https://x/p2.jpg' },
];

const picked = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    uri: `file:///new-${i}.jpg`,
    fileName: `new-${i}.jpg`,
    mime: 'image/jpeg',
  }));

const setup = (props: {
  sourcePhotos?: typeof SOURCE;
  value?: SetupPhotoChoice;
}) => {
  const onChange = jest.fn();
  render(
    <ModeSetupPhotoSection
      sourcePhotos={props.sourcePhotos ?? SOURCE}
      sourceModeLabel="Flört"
      value={props.value ?? { kind: 'existing' }}
      onChange={onChange}
    />,
  );
  return { onChange };
};

const USE_EXISTING = 'discover.mode.photos.useExisting:Flört';

beforeEach(() => {
  mockPick.mockReset();
  mockCapture.mockReset();
});

describe('mevcut fotoğraflar yolu', () => {
  it('kaynakta ≥2 görünür foto varken seçenek satırı çizilir ve önizleme basılır', () => {
    setup({ value: { kind: 'existing' } });

    expect(screen.queryByText(USE_EXISTING)).not.toBeNull();
    expect(screen.queryByTestId('setup-photo-preview-p1')).not.toBeNull();
    expect(screen.queryByTestId('setup-photo-preview-p2')).not.toBeNull();
  });

  it('kaynakta 2\'den az foto varken seçenek satırı YOK, ekle karosu var', () => {
    setup({
      sourcePhotos: [SOURCE[0]],
      value: { kind: 'new', photos: [] },
    });

    expect(screen.queryByText(USE_EXISTING)).toBeNull();
    expect(screen.queryByTestId('setup-photo-add')).not.toBeNull();
  });

  it('işaret kaldırılınca yeni-kare hâline geçilir', () => {
    const { onChange } = setup({ value: { kind: 'existing' } });

    fireEvent.press(screen.getByText(USE_EXISTING));

    expect(onChange).toHaveBeenCalledWith({ kind: 'new', photos: [] });
  });

  it('yeni-kare hâlindeyken satıra basmak mevcutları geri seçer', () => {
    const { onChange } = setup({ value: { kind: 'new', photos: [] } });

    fireEvent.press(screen.getByText(USE_EXISTING));

    expect(onChange).toHaveBeenCalledWith({ kind: 'existing' });
  });
});

describe('yeni kare yolu', () => {
  it('ekle karosu kaynak sheet\'ini açar; galeri seçimi onChange\'e düşer', async () => {
    mockPick.mockResolvedValue(picked(2));
    const { onChange } = setup({ value: { kind: 'new', photos: [] } });

    fireEvent.press(screen.getByTestId('setup-photo-add'));
    fireEvent.press(screen.getByTestId('source-gallery'));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        kind: 'new',
        photos: picked(2),
      }),
    );
    // Kalan slot kadar isteniyor (tavan MAX_PROFILE_PHOTOS).
    expect(mockPick).toHaveBeenCalledWith(MAX_PROFILE_PHOTOS);
  });

  it('kamera dönüşü mevcut seçimin SONUNA eklenir', async () => {
    const existing = picked(1);
    mockCapture.mockResolvedValue(picked(2)[1]);
    const { onChange } = setup({ value: { kind: 'new', photos: existing } });

    fireEvent.press(screen.getByTestId('setup-photo-add'));
    fireEvent.press(screen.getByTestId('source-camera'));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        kind: 'new',
        photos: [...existing, picked(2)[1]],
      }),
    );
  });

  it('✕ kareyi listeden düşürür', () => {
    const { onChange } = setup({ value: { kind: 'new', photos: picked(2) } });

    fireEvent.press(screen.getByTestId('setup-photo-remove-0'));

    expect(onChange).toHaveBeenCalledWith({
      kind: 'new',
      photos: [picked(2)[1]],
    });
  });

  it('ilk karede ana rozeti var, ikincide yok', () => {
    setup({ value: { kind: 'new', photos: picked(2) } });

    expect(screen.queryByTestId('setup-photo-main-0')).not.toBeNull();
    expect(screen.queryByTestId('setup-photo-main-1')).toBeNull();
  });

  it('tavan dolunca ekle karosu çizilmez', () => {
    setup({ value: { kind: 'new', photos: picked(MAX_PROFILE_PHOTOS) } });

    expect(screen.queryByTestId('setup-photo-add')).toBeNull();
  });
});
