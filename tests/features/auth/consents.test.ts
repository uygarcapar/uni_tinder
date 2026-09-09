/**
 * Rıza kayıtlarının iki sözü.
 *
 *   1. Her rıza AYRI kayıt: tek istekle birkaç tipi birden vermenin yolu yok,
 *      KVKK her biri için ayrı ve bilinçli onay istiyor.
 *   2. `isAccepted` EN SON karardan gelir — geri alınmış bir rıza "kabul"
 *      görünmemeli. Doğrulama akışının kapıdaki kontrolü de aynı soruyu
 *      soruyor; ikisi ayrışırsa kullanıcı "rızam var ama çalışmıyor" durumuna
 *      düşer.
 */

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
  SKIP_429_RETRY: {},
}));

import {
  fetchConsentStatus,
  recordConsent,
  SELFIE_CONSENT_TYPES,
} from '@/features/auth/consents';
import { API_ENDPOINTS } from '@/shared/constants/api';

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
});

describe('recordConsent', () => {
  it('consentType + version + accepted gönderir', async () => {
    mockPost.mockResolvedValue({ isSuccess: true });

    await recordConsent('BiometricVerification', '1.0');

    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT, {
      consentType: 'BiometricVerification',
      version: '1.0',
      accepted: true,
    });
  });

  it('geri alma da bir KAYITTIR: accepted=false gider', async () => {
    mockPost.mockResolvedValue({ isSuccess: true });

    await recordConsent('DataTransferAbroad', '1.0', false);

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT,
      expect.objectContaining({ accepted: false }),
    );
  });

  it('fotoğraf doğrulama İKİ ayrı tip — biri diğerini kapsamıyor', () => {
    expect([...SELFIE_CONSENT_TYPES]).toEqual([
      'BiometricVerification',
      'DataTransferAbroad',
    ]);
  });
});

describe('fetchConsentStatus', () => {
  it('isAccepted sunucudan okunur', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: { isAccepted: true, currentVersion: '1.0' },
    });

    const status = await fetchConsentStatus('BiometricVerification');

    expect(mockGet).toHaveBeenCalledWith(
      API_ENDPOINTS.PRIVACY_CONSENT_STATUS('BiometricVerification'),
    );
    expect(status).toEqual({ isAccepted: true, currentVersion: '1.0' });
  });

  it('geri alınmış rıza false döner', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: { isAccepted: false, currentVersion: '1.0' },
    });

    await expect(fetchConsentStatus('DataTransferAbroad')).resolves.toEqual({
      isAccepted: false,
      currentVersion: '1.0',
    });
  });

  it('alan yoksa (eski sunucu) null — anahtar çizilmez', async () => {
    mockGet.mockResolvedValue({ isSuccess: true, result: { currentVersion: '1.0' } });
    await expect(fetchConsentStatus('BiometricVerification')).resolves.toBeNull();
  });
});
