/**
 * Selfie uçlarının en kolay kırılan üç sözü.
 *
 *   1. `verified:false` REJECT ETMEZ. İstek `200 + isSuccess:true` dönüyor;
 *      servisin bunu hataya çevirmesi kullanıcıya "tekrar dene" yerine hata
 *      ekranı gösterirdi.
 *   2. `frames` challenge SIRASIYLA ve TAM 2 adet gider.
 *   3. Kotalı uçlarda `SKIP_429_RETRY` geçilir — 429 burada geçici throttle
 *      değil `UT-6504` kotası, otomatik retry iki kareyi boşuna tekrar yükler.
 */

const mockPost = jest.fn();
const mockGet = jest.fn();
const SKIP_429_RETRY = { __skip429Retry: true };

jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
  SKIP_429_RETRY,
}));

import {
  acceptConsent,
  fetchConsentPolicy,
  startSelfieVerification,
  submitSelfieFrames,
} from '@/features/profile/selfie/selfieService';
import { API_ENDPOINTS } from '@/shared/constants/api';

const frame = (name: string) => ({
  uri: `file:///tmp/${name}`,
  name,
  type: 'image/jpeg',
});

/**
 * Kaydeden FormData. Jest ortamındaki web FormData'sı RN'in `{uri,name,type}`
 * parçasını `"[object Object]"`e çeviriyor, yani karelerin SIRASI gerçek
 * nesneyle doğrulanamıyor — sözleşmenin en kritik maddesi de tam olarak o.
 */
class RecordingFormData {
  parts: [string, any][] = [];
  append(field: string, value: any) {
    this.parts.push([field, value]);
  }
}

const appendedTo = (formData: any): [string, any][] => formData.parts;

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  (globalThis as any).FormData = RecordingFormData;
});

describe('startSelfieVerification', () => {
  it('SKIP_429_RETRY ile çağrılır — 429 kota, throttle değil', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      result: {
        attemptId: 'a1',
        challenges: [{ code: 'Smile', instruction: 'Gülümse' }],
      },
    });

    await startSelfieVerification();

    expect(mockPost).toHaveBeenCalledWith(
      API_ENDPOINTS.SELFIE_VERIFICATION_START,
      undefined,
      SKIP_429_RETRY,
    );
  });

  it('şekil bozuksa null döner — uydurulmuş challenge ile akış başlatılmaz', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: { challenges: [] } });
    await expect(startSelfieVerification()).resolves.toBeNull();
  });
});

describe('submitSelfieFrames', () => {
  it('🔴 verified:false REJECT ETMEZ — başarısız doğrulama hata değil', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      result: {
        verified: false,
        reasonCode: 'challenge_not_met',
        canRetry: true,
        failedAtStep: 2,
      },
      message: 'İstenen hareketi algılayamadık.',
    });

    const result = await submitSelfieFrames('a1', [frame('1.jpg'), frame('2.jpg')]);

    expect(result.verified).toBe(false);
    expect(result.reasonCode).toBe('challenge_not_met');
    expect(result.failedAtStep).toBe(2);
    expect(result.message).toBe('İstenen hareketi algılayamadık.');
  });

  it('kareler challenge SIRASIYLA ve tam 2 adet eklenir', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: { verified: true } });

    await submitSelfieFrames('a1', [frame('first.jpg'), frame('second.jpg')]);

    const [, formData, config] = mockPost.mock.calls[0];
    const parts = appendedTo(formData);

    expect(parts[0][0]).toBe('attemptId');
    const frames = parts.filter(([field]) => field === 'frames');
    expect(frames).toHaveLength(2);
    expect(frames[0][1].name).toBe('first.jpg');
    expect(frames[1][1].name).toBe('second.jpg');

    // Kota + iki kare için genişletilmiş timeout birlikte geçiliyor.
    expect(config.__skip429Retry).toBe(true);
    expect(config.timeout).toBe(60_000);
  });
});

describe('rıza uçları', () => {
  it('policy version SUNUCUDAN okunur, sabit kodlanmaz', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: { version: '2.3', contentMarkdown: '## Başlık' },
    });

    const policy = await fetchConsentPolicy('BiometricVerification');

    expect(mockGet).toHaveBeenCalledWith(
      API_ENDPOINTS.PRIVACY_POLICY('BiometricVerification'),
    );
    expect(policy?.version).toBe('2.3');
  });

  it('metin şekli bozuksa null — uydurulmuş sürümle rıza kaydedilmez', async () => {
    mockGet.mockResolvedValue({ isSuccess: true, result: { version: '1.0' } });
    await expect(fetchConsentPolicy('DataTransferAbroad')).resolves.toBeNull();
  });

  it('accept-consent consentType + version + accepted gönderir', async () => {
    mockPost.mockResolvedValue({ isSuccess: true });

    await acceptConsent('DataTransferAbroad', '1.0');

    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.PRIVACY_ACCEPT_CONSENT, {
      consentType: 'DataTransferAbroad',
      version: '1.0',
      accepted: true,
    });
  });
});
