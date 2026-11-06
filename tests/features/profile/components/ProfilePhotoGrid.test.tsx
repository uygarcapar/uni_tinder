/**
 * Profil fotoğraf ızgarası.
 *
 * ⚠️ VARLIK SEBEBİ: bu ızgara `EditProfileForm`ın (3500 satır, SIFIR test)
 * içinde satır içi yaşıyordu. Mod başına fotoğrafla birlikte ikinci bir çağıran
 * geliyor (mod kurulum sheet'i), yani slot mantığı paylaşılacak — test edilmeyen
 * paylaşılan mantık, iki yüzeyin sessizce ayrışması demek.
 *
 * Test edilen şey SLOT MANTIĞI: ekle karosunun nereye düştüğü, tavanda kaybolması
 * ve tavanın çağırandan gelebilmesi. Sürükleme (reanimated + gesture) jest'te
 * anlamlı koşmuyor; onun matematiği `photoGridGeometry.test` içinde ayrıca
 * kilitli.
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import ProfilePhotoGrid from '@/features/profile/components/ProfilePhotoGrid';

const photo = (id: number) => ({
  photoId: id,
  photoImageUrl: `https://cdn/${id}.jpg`,
  order: id,
  isMainPhoto: id === 1,
  moderation: {
    status: 'Approved',
    isVisibleToOthers: true,
    severity: 'Informational',
    appealState: 'None',
    isAppealable: false,
  },
});

const positions = { value: {} as Record<string, number> };

const renderGrid = (over: Partial<React.ComponentProps<typeof ProfilePhotoGrid>> = {}) =>
  render(
    <ProfilePhotoGrid
      photos={[photo(1), photo(2)]}
      positions={positions as any}
      onDragEnd={jest.fn()}
      onAddPhoto={jest.fn()}
      onPhotoPress={jest.fn()}
      {...(over as any)}
    />,
  );

describe('slot yerleşimi', () => {
  it('her fotoğrafı çiziyor', () => {
    renderGrid({ photos: [photo(1), photo(2), photo(3)] });
    expect(screen.getByTestId('profile-photo-1')).toBeTruthy();
    expect(screen.getByTestId('profile-photo-2')).toBeTruthy();
    expect(screen.getByTestId('profile-photo-3')).toBeTruthy();
  });

  it('ekle karosu SON fotoğraftan hemen sonraki slotta', () => {
    renderGrid({ photos: [photo(1)] });
    expect(screen.getByTestId('profile-btn-add-photo')).toBeTruthy();
  });

  it('hiç fotoğraf yokken de ekle karosu var', () => {
    // Mod kurulumunda ilk hâl tam olarak bu: boş ızgara + ekle.
    renderGrid({ photos: [] });
    expect(screen.getByTestId('profile-btn-add-photo')).toBeTruthy();
  });

  /**
   * ⚠️ TAVANDA EKLE KAROSU YOK. Çizilseydi basan kullanıcı sunucudan
   * `UT-6303` yerdi — kaçındığımız ölü buton.
   */
  it('tavan dolduğunda ekle karosu ÇİZİLMİYOR', () => {
    renderGrid({ photos: [1, 2, 3, 4, 5, 6].map(photo) });
    expect(screen.queryByTestId('profile-btn-add-photo')).toBeNull();
  });

  /**
   * Tavan ÇAĞIRANDAN gelebiliyor: mod başına fotoğrafta sınır o modun slot
   * tavanı (sözleşme §3.4). Sabit 6 varsayan bir ızgara ikinci yüzeyde yanlış
   * olurdu.
   */
  it('tavan prop ile daraltılabiliyor', () => {
    renderGrid({ photos: [photo(1), photo(2)], maxPhotos: 2 });
    expect(screen.queryByTestId('profile-btn-add-photo')).toBeNull();
  });

  it('daraltılmış tavanın ALTINDA ekle karosu geri geliyor', () => {
    renderGrid({ photos: [photo(1)], maxPhotos: 2 });
    expect(screen.getByTestId('profile-btn-add-photo')).toBeTruthy();
  });
});

describe('jestler', () => {
  it('ekle karosu onAddPhoto çağırıyor', () => {
    const onAddPhoto = jest.fn();
    renderGrid({ photos: [photo(1)], onAddPhoto });
    fireEvent.press(screen.getByTestId('profile-btn-add-photo'));
    expect(onAddPhoto).toHaveBeenCalledTimes(1);
  });

  it('foto aksiyonu O FOTOĞRAFLA çağrılıyor', () => {
    // Yanlış fotoğrafı geçirmek, kullanıcının başka bir karesini silmesi demek.
    const onPhotoPress = jest.fn();
    renderGrid({ photos: [photo(1), photo(2)], onPhotoPress });
    fireEvent.press(screen.getByTestId('profile-photo-action-2'));
    expect(onPhotoPress).toHaveBeenCalledWith(
      expect.objectContaining({ photoId: 2 }),
    );
  });

  /**
   * Kaydetme uçuştayken dokunuşlar kapanıyor: ikinci bir ekleme/silme isteği
   * sunucudaki sırayla yarışır (ızgara `NewPhotos`/`PhotoIdsToDelete` üretiyor).
   */
  it('saving iken ekleme dokunuşu YUTULUYOR', () => {
    const onAddPhoto = jest.fn();
    renderGrid({ photos: [photo(1)], onAddPhoto, saving: true });
    fireEvent.press(screen.getByTestId('profile-btn-add-photo'));
    expect(onAddPhoto).not.toHaveBeenCalled();
  });

  it('saving iken foto aksiyonu da YUTULUYOR', () => {
    const onPhotoPress = jest.fn();
    renderGrid({ photos: [photo(1)], onPhotoPress, saving: true });
    fireEvent.press(screen.getByTestId('profile-photo-action-1'));
    expect(onPhotoPress).not.toHaveBeenCalled();
  });
});
