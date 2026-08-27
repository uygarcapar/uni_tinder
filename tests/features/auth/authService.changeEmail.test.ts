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

jest.mock('@/shared/utils/tokenStorage', () => ({
  saveAccessToken: jest.fn(),
  saveRefreshToken: jest.fn(),
  getRefreshToken: jest.fn(),
  clearAllTokens: jest.fn(),
}));

jest.mock('@/features/profile/subscriptionService', () => ({ logoutRevenueCat: jest.fn() }));

import { authService } from '@/features/auth/authService';
import { API_ENDPOINTS } from '@/shared/constants/api';
import {
  isSelfInflictedEmailChange,
  clearSelfEmailChangeMark,
} from '@/shared/utils/sessionGuard';
import { parsePasswordError } from '@/features/auth/passwordErrors';

/**
 * E-posta değiştirmenin şifre değiştirmeden AYRILDIĞI iki nokta — regresyonu en
 * pahalı olanlar bunlar:
 *
 *  1. Başarıda YENİ TOKEN SETİ DÖNMÜYOR. Şifre akışındaki gibi token yazmaya
 *     kalkan bir kod burada sessizce hiçbir şey yazmaz ve kullanıcı bir sonraki
 *     401'de gerekçesiz düşer; çıkışı çağıran ekran yönetmek zorunda.
 *  2. ForceLogout (reason: `email_changed`) işlemi YAPAN cihaza da gidiyor.
 *     Damga olmadan hub'ın jenerik toast'ı ekranın kendi mesajının önüne geçer.
 */

beforeEach(() => {
  mockPost.mockReset();
  mockPut.mockReset();
  clearSelfEmailChangeMark();
});

describe('requestEmailChangeCode (B1)', () => {
  it('şifre + yeni adresi gönderir ve 429 auto-retry’ı kapatır', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: null });

    await authService.requestEmailChangeCode('Sifre123!', 'yeni@boun.edu.tr');

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.REQUEST_EMAIL_CHANGE_CODE,
      { currentPassword: 'Sifre123!', newEmail: 'yeni@boun.edu.tr' },
      { __skip429Retry: true },
    );
  });

  // Kod bu adımda henüz gönderilmedi; damga yalnız onaya ait. Burada damgalamak
  // 20 saniye boyunca gerçek oturum düşmelerini yutardı.
  it('damga ATMAZ — oturum bu adımda düşmüyor', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: null });

    await authService.requestEmailChangeCode('Sifre123!', 'yeni@boun.edu.tr');

    expect(isSelfInflictedEmailChange()).toBe(false);
  });
});

describe('confirmEmailChange (B2)', () => {
  it('hedef adresi kodla BİRLİKTE gönderir — kod {userId, adres} çiftine bağlı', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: { newEmail: 'yeni@boun.edu.tr' } });

    await authService.confirmEmailChange('yeni@boun.edu.tr', '123456');

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.CONFIRM_EMAIL_CHANGE,
      { newEmail: 'yeni@boun.edu.tr', confirmationCode: '123456' },
      { __skip429Retry: true },
    );
  });

  it('üniversite değişimini çağırana taşır — keşif havuzu buna bağlı', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      result: {
        newEmail: 'yeni@boun.edu.tr',
        universityChanged: true,
        universityName: 'Boğaziçi Üniversitesi',
      },
    });

    const result = await authService.confirmEmailChange('yeni@boun.edu.tr', '123456');

    expect(result).toEqual({
      newEmail: 'yeni@boun.edu.tr',
      universityChanged: true,
      universityName: 'Boğaziçi Üniversitesi',
    });
  });

  it('başarıda damga bırakır — hub’ın ForceLogout’u ekranın mesajını ezmesin', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: { newEmail: 'yeni@boun.edu.tr' } });

    await authService.confirmEmailChange('yeni@boun.edu.tr', '123456');

    expect(isSelfInflictedEmailChange()).toBe(true);
  });

  // Hata yolunda damga KALIRSA, o pencerede gerçekten düşen bir oturum sessizce
  // yutulur ve kullanıcı hiçbir mesaj görmeden takılı kalır.
  it('hata durumunda damgayı geri alır', async () => {
    mockPost.mockRejectedValue({ response: { status: 400, data: { code: 'UT-1006' } } });

    await expect(
      authService.confirmEmailChange('yeni@boun.edu.tr', '000000'),
    ).rejects.toBeDefined();

    expect(isSelfInflictedEmailChange()).toBe(false);
  });
});

describe('adres redleri — parsePasswordError', () => {
  // Üçü de ADRESİ işaret ediyor, kodu değil: 2. adımda dönerlerse (kod 15 dk
  // geçerli, arada adresi başkası kapmış olabilir) girilmiş kod silinmemeli.
  it.each([
    ['UT-1017', 'kullanımda'],
    ['UT-1018', 'mevcutla aynı'],
    ['UT-1019', 'desteklenmeyen domain'],
  ])('%s → newEmail alanı, kod korunur (%s)', (code) => {
    const failure = parsePasswordError({
      response: { status: 400, data: { code, message: 'x' } },
    });

    expect(failure.field).toBe('newEmail');
    expect(failure.keepCode).toBe(true);
    expect(failure.codeAttemptSpent).toBe(false);
    expect(failure.codeBurned).toBe(false);
  });

  // Paylaşılan kodlar e-posta akışında da aynı anlamı taşımalı: şifre ekranıyla
  // ortak parser kullanmanın tek gerekçesi bu.
  it('UT-1003 mevcut şifreyi işaret eder', () => {
    const failure = parsePasswordError({
      response: { status: 400, data: { code: 'UT-1003' } },
    });
    expect(failure.field).toBe('currentPassword');
  });

  it('UT-1012 kodu yakar — yenisi istenmeli', () => {
    const failure = parsePasswordError({
      response: { status: 400, data: { code: 'UT-1012' } },
    });
    expect(failure.codeBurned).toBe(true);
  });
});
