const mockPost = jest.fn();
const mockPut = jest.fn();

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
  },
  SKIP_429_RETRY: { __skip429Retry: true },
  setCurrentAccessToken: jest.fn(),
}));

const mockSaveAccessToken = jest.fn();
const mockSaveRefreshToken = jest.fn();
jest.mock('@/shared/utils/tokenStorage', () => ({
  saveAccessToken: (...a: any[]) => mockSaveAccessToken(...a),
  saveRefreshToken: (...a: any[]) => mockSaveRefreshToken(...a),
  getRefreshToken: jest.fn(),
  clearAllTokens: jest.fn(),
}));

jest.mock('@/features/profile/subscriptionService', () => ({ logoutRevenueCat: jest.fn() }));

import { authService } from '@/features/auth/authService';
import { setCurrentAccessToken } from '@/shared/services/api';
import { isSelfInflictedPasswordChange } from '@/shared/utils/sessionGuard';

/**
 * Şifre değiştirmenin iki kırılgan sözleşmesi:
 *
 *  1. Backend başarıda TÜM oturumları iptal ediyor — mevcut refresh token'ımız
 *     dahil — ve cevapta yeni bir set veriyor. Yazılmazsa bir sonraki istek 401
 *     alır, refresh de revoke edildiği için başarısız olur → beklenmedik logout.
 *  2. ForceLogout push'u şifreyi değiştiren cihaza DA gidiyor. Damga olmadan bu
 *     cihaz kendi sinyaliyle kendini dışarı atar.
 */

beforeEach(() => {
  mockPost.mockReset();
  mockPut.mockReset();
  mockSaveAccessToken.mockReset();
  mockSaveRefreshToken.mockReset();
  (setCurrentAccessToken as jest.Mock).mockReset();
});

describe('requestPasswordChangeCode (A1)', () => {
  it('yalnız mevcut şifreyi gönderir ve 429 auto-retry’ı kapatır', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: null });

    await authService.requestPasswordChangeCode('eskiSifre123!');

    expect(mockPost).toHaveBeenCalledWith(
      '/api/user/RequestPasswordChangeCode',
      { currentPassword: 'eskiSifre123!' },
      { __skip429Retry: true },
    );
  });
});

describe('changePassword (A2)', () => {
  const okResponse = {
    isSuccess: true,
    result: {
      user: { id: 'u1' },
      accessToken: 'yeni-access',
      refreshToken: 'yeni-refresh',
    },
  };

  it('PUT ile gider ve userId GÖNDERMEZ (backend token’dan alıyor)', async () => {
    mockPut.mockResolvedValue(okResponse);

    await authService.changePassword('eski!', 'yeni!', '483920');

    const [url, body] = mockPut.mock.calls[0];
    expect(url).toBe('/api/user/ChangePassword');
    expect(body).toEqual({
      currentPassword: 'eski!',
      newPassword: 'yeni!',
      confirmationCode: '483920',
    });
    expect(body).not.toHaveProperty('userId');
  });

  it('cevaptaki yeni token setini diske ve bellek içi header’a yazar', async () => {
    mockPut.mockResolvedValue(okResponse);

    await authService.changePassword('eski!', 'yeni!', '483920');

    expect(setCurrentAccessToken).toHaveBeenCalledWith('yeni-access');
    expect(mockSaveAccessToken).toHaveBeenCalledWith('yeni-access');
    expect(mockSaveRefreshToken).toHaveBeenCalledWith('yeni-refresh');
  });

  it('başarıda kendi ForceLogout sinyalimizi yok saydıracak damgayı bırakır', async () => {
    mockPut.mockResolvedValue(okResponse);

    await authService.changePassword('eski!', 'yeni!', '483920');

    expect(isSelfInflictedPasswordChange()).toBe(true);
  });

  // Hata durumunda damga kalırsa, GERÇEK bir "başka cihazdan şifre değişti"
  // sinyali 20 saniye boyunca yutulurdu.
  it('hata durumunda damgayı temizler ve token yazmaz', async () => {
    mockPut.mockRejectedValue({ response: { status: 400, data: { code: 'UT-1006' } } });

    await expect(authService.changePassword('eski!', 'yeni!', '000000')).rejects.toBeDefined();

    expect(isSelfInflictedPasswordChange()).toBe(false);
    expect(mockSaveAccessToken).not.toHaveBeenCalled();
    expect(mockSaveRefreshToken).not.toHaveBeenCalled();
  });
});
