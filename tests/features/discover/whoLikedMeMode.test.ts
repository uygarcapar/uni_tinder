/**
 * "Beni Arkadaş modunda beğenen kişi Flört'ün beğenilerinde görünüyor."
 *
 * Rozet + liker id kümesini dolduran `fetchWhoLikedMe` thunk'ı uca MOD
 * parametresi geçmek ZORUNDA: gönderilmezse sunucu Dating sayıyor (eski
 * istemci sözleşmesi) ve iki modun beğenileri karışıyor — rozetteki sayı
 * listede bulunmuyor, Keşif de "bu kişi beni beğenmişti" sorusunu öbür modun
 * kümesinden cevaplıyor (deste mod başına).
 *
 * Mod, thunk'ın İÇİNDE çözülüyor (argüman değil): çağıranlar AppNavigator'da
 * sabit referanslı callback'lerin içinde ve modu kapanıştan okusalar bayat
 * değere tutunurlardı. Tercihin kaynağı disk (modePrefs), state'ten gereken
 * tek şey anahtarın kullanıcı kimliği.
 */

// `mock` öneki şart: jest.mock fabrikası yalnız bu önekli değişkenlere
// erişebiliyor (hoisting koruması).
const mockGetWhoLikedMe = jest.fn();

jest.mock('@/shared/services/api', () => ({ __esModule: true, default: {} }));
jest.mock('@/features/discover/swipeService', () => ({
  __esModule: true,
  default: { getWhoLikedMe: (...args: unknown[]) => mockGetWhoLikedMe(...args) },
}));

import { appPrefs } from '@/shared/utils/appPrefs';
import { fetchWhoLikedMe } from '@/features/discover/swipeSlice';
import { saveAppMode } from '@/features/discover/modePrefs';

const USER = 'user-1';

const RESULT = {
  isSuccess: true,
  result: {
    superLikes: { totalProfiles: 1, profiles: [{ userId: 'A-1' }] },
    likes: { totalProfiles: 2, profiles: [{ userId: 'B-2' }] },
  },
};

// Thunk'ı store kurmadan koşturmak: dispatch/getState'i elle veriyoruz.
const run = async (userId?: string | null) => {
  const thunk = fetchWhoLikedMe() as any;
  return thunk(
    jest.fn(),
    () => ({ auth: { user: userId ? { id: userId } : null } }),
    undefined,
  );
};

beforeEach(() => {
  appPrefs.clearAll?.();
  mockGetWhoLikedMe.mockReset();
  mockGetWhoLikedMe.mockResolvedValue(RESULT);
});

describe('fetchWhoLikedMe — mod süzgeci', () => {
  it('diskteki seçili modu uca geçirir', async () => {
    saveAppMode(USER, 'Friends');
    await run(USER);
    expect(mockGetWhoLikedMe).toHaveBeenCalledWith(1, 10, 10, 'Friends');
  });

  it('seçim yoksa varsayılan moda düşer — parametre YİNE gider', async () => {
    // Parametrenin atlanması sunucuda "Dating" demekle aynı sonucu verse de
    // sözleşmeyi örtük bırakırdı; uç her zaman açıkça çağrılıyor.
    await run(USER);
    expect(mockGetWhoLikedMe).toHaveBeenCalledWith(1, 10, 10, 'Dating');
  });

  it('kullanıcı kimliği yoksa (henüz oturum yok) varsayılan mod', async () => {
    saveAppMode(USER, 'Friends');
    await run(null);
    expect(mockGetWhoLikedMe).toHaveBeenCalledWith(1, 10, 10, 'Dating');
  });

  it('sayaç toplamdan, küme yüklenen sayfadan — mod eklenirken bozulmadı', async () => {
    saveAppMode(USER, 'Friends');
    // Thunk'ın dönüşü fulfilled AKSİYONU (payload içinde).
    const action = await run(USER);
    expect(action.payload).toMatchObject({ count: 3, ids: ['A-1', 'B-2'] });
  });
});
