/**
 * `updateProfile`'ın FormData serileştiricisi ANAHTAR-ÖZEL: dosya dizileri ve
 * indeksli desenler (PhotoOrders) kendi dallarını ister. Mod başına fotoğraf
 * `Friends*` kardeş anahtarlarını getirdi — dallar onları da tanımak ZORUNDA,
 * yoksa jenerik dizi dalı her öğeyi String(item) ile "[object Object]"e ezer
 * ve Friends modunda foto ekleme/sıralama sunucuya hiç ulaşmaz (final review
 * Critical #1/#2).
 *
 * FakeFormData kalıbı openProfileMode.test'ten: jest'in undici FormData'sı
 * dosya objesini kendisi ezdiği için append çağrıları ham kaydediliyor —
 * test gövdenin KURULUŞUNU doğruluyor, taşıma katmanını değil.
 */

const mockPut = jest.fn().mockResolvedValue({ result: { profile: {}, photos: [] } });

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    put: (...args: unknown[]) => mockPut(...args),
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import profileService from '@/features/profile/profileService';

class FakeFormData {
  parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}
const realFormData = (global as any).FormData;
beforeAll(() => {
  (global as any).FormData = FakeFormData;
});
afterAll(() => {
  (global as any).FormData = realFormData;
});
beforeEach(() => mockPut.mockClear());

const partsOf = (): Array<[string, unknown]> => {
  const fd = mockPut.mock.calls[0][1] as any;
  expect(fd).toBeInstanceOf(FakeFormData);
  return fd.parts;
};
const valueOf = (name: string) =>
  partsOf().find(([n]) => n === name)?.[1];

const FILE = { uri: 'file:///a.jpg', name: 'a.jpg', type: 'image/jpeg' };

describe('updateProfile — Friends foto anahtarları', () => {
  it('FriendsNewPhotos dosyaları DOSYA olarak append edilir (stringlenmez)', async () => {
    await profileService.updateProfile({ FriendsNewPhotos: [FILE] });

    expect(valueOf('FriendsNewPhotos')).toBe(FILE);
  });

  it('FriendsPhotoOrders indeksli desenle gider', async () => {
    await profileService.updateProfile({
      FriendsPhotoOrders: [{ photoId: 'p1', newOrder: 1 }],
    });

    expect(valueOf('FriendsPhotoOrders[0].PhotoId')).toBe('p1');
    expect(valueOf('FriendsPhotoOrders[0].NewOrder')).toBe('1');
  });

  it('Dating anahtarları değişmedi', async () => {
    await profileService.updateProfile({
      NewPhotos: [FILE],
      PhotoOrders: [{ photoId: 'p2', newOrder: 2 }],
    });

    expect(valueOf('NewPhotos')).toBe(FILE);
    expect(valueOf('PhotoOrders[0].PhotoId')).toBe('p2');
  });
});
