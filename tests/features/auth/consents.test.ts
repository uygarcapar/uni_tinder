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
  fetchSelfieConsentStates,
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

describe('fetchSelfieConsentStates', () => {
  const statusReply = (isAccepted: boolean) => ({
    isSuccess: true,
    result: { isAccepted, currentVersion: '1.0' },
  });

  it('iki iznin durumu AYRI okunur', async () => {
    mockGet
      .mockResolvedValueOnce(statusReply(true))
      .mockResolvedValueOnce(statusReply(false));

    await expect(fetchSelfieConsentStates()).resolves.toEqual({
      BiometricVerification: true,
      DataTransferAbroad: false,
    });
  });

  it('sunucu `isAccepted` vermiyorsa GEÇMİŞTEN türetilir', async () => {
    // Eski sunucu: consent-status alanı taşımıyor.
    mockGet
      .mockResolvedValueOnce({ isSuccess: true, result: { currentVersion: '1.0' } })
      .mockResolvedValueOnce({ isSuccess: true, result: { currentVersion: '1.0' } })
      // consent-history — her tipin EN SON kararı geçerli olan.
      .mockResolvedValueOnce({
        isSuccess: true,
        result: [
          { consentType: 'BiometricVerification', accepted: true, decisionAt: '2026-09-01T10:00:00Z' },
          { consentType: 'DataTransferAbroad', accepted: true, decisionAt: '2026-09-01T10:00:00Z' },
          // Sonradan geri alınmış: "kabul var" saymamalı.
          { consentType: 'DataTransferAbroad', accepted: false, decisionAt: '2026-09-02T10:00:00Z' },
        ],
      });

    await expect(fetchSelfieConsentStates()).resolves.toEqual({
      BiometricVerification: true,
      DataTransferAbroad: false,
    });
    expect(mockGet).toHaveBeenLastCalledWith(API_ENDPOINTS.PRIVACY_CONSENT_HISTORY);
  });

  it('hiçbir kaynak okunamazsa null — çağıran taraf "izin yok" sayar', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    await expect(fetchSelfieConsentStates()).resolves.toBeNull();
  });
});
