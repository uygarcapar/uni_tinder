/**
 * refreshAccessToken'ın GEÇİCİ hata dayanıklılığı.
 *
 * Regresyon: her catch dalı clearAllTokens + onAuthLost işletiyordu, yani
 * sunucuya ULAŞAMAYAN tek bir refresh isteği kullanıcıyı oturumdan atıyordu.
 * En sık tetikleyici arka plandan dönüş — AppState 'active' bloğu bir anda
 * ~7 istek atıyor, arka planda expire olmuş access token hepsini 401'e
 * düşürüyor ve refresh tam radyo oturmadan uçuyor.
 *
 * Kural: token'lar YALNIZCA sunucu refresh token'ı görüp reddettiğinde silinir.
 *
 * 2026-08-19 eki: backend 60 sn'lik grace penceresi açtı, yani cevabı kaybolan
 * bir refresh AYNI token'la tekrar denenebiliyor. Buradaki testler retry turunu
 * ve "sunucu konuştuysa tekrar deneme" sınırını da sabitliyor.
 */

// jest.mock factory'leri import'ların üstüne hoist edilir — referanslar import
// sonrası modülden alınır (bkz. api.accountBlock.test.ts'teki aynı kalıp).
jest.mock('axios', () => {
  const instance: any = jest.fn(() => Promise.resolve({}));
  instance.interceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  };
  const axiosMock: any = jest.fn(() => Promise.resolve({}));
  axiosMock.create = jest.fn(() => instance);
  axiosMock.post = jest.fn();
  axiosMock.get = jest.fn();
  return { __esModule: true, default: axiosMock };
});

jest.mock('@/shared/utils/tokenStorage', () => ({
  clearAllTokens: jest.fn(async () => {}),
  getRefreshToken: jest.fn(async () => 'refresh-token'),
  saveRefreshToken: jest.fn(async () => {}),
  saveAccessToken: jest.fn(async () => {}),
}));

import axios from 'axios';
import { clearAllTokens, saveRefreshToken } from '@/shared/utils/tokenStorage';
import {
  setCurrentAccessToken,
  getCurrentAccessToken,
  refreshAccessToken,
  setOnAuthLost,
} from '@/shared/services/api';
import { resetAccountBlockLatch, setOnAccountBlocked } from '@/shared/utils/accountBlock';

const axiosPost = (axios as any).post as jest.Mock;

/** api.ts'teki backoff merdiveninin toplamı (1 sn + 2 sn) + pay. */
const TOTAL_BACKOFF_MS = 4_000;

let authLost: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Retry backoff'unu gerçek zamanda beklemeyelim.
  jest.useFakeTimers();
  resetAccountBlockLatch();
  setOnAccountBlocked(() => {});
  authLost = jest.fn();
  setOnAuthLost(authLost);
  setCurrentAccessToken('stale-access-token');
});

afterEach(() => {
  jest.useRealTimers();
});

/** Retry turunu sahte zamanlayıcıyla sonuna kadar yürütür. */
const runRefresh = async (): Promise<string | null> => {
  const pending = refreshAccessToken();
  await jest.advanceTimersByTimeAsync(TOTAL_BACKOFF_MS);
  return pending;
};

/** Oturumun bozulmadan ayakta kaldığını doğrulayan ortak iddia. */
const expectSessionSurvived = () => {
  expect(clearAllTokens).not.toHaveBeenCalled();
  expect(authLost).not.toHaveBeenCalled();
  // Access token bilerek BAYAT bırakılır: sonraki istek yine 401 alıp refresh'i
  // tekrar tetikleyecek, ağ döndüğünde ilk deneme tutacak.
  expect(getCurrentAccessToken()).toBe('stale-access-token');
};

describe('transient refresh failures keep the session', () => {
  it('survives a network error with no response (radyo henüz oturmamış)', async () => {
    axiosPost.mockRejectedValue({ message: 'Network Error', code: 'ERR_NETWORK' });

    await expect(runRefresh()).resolves.toBeNull();

    expectSessionSurvived();
  });

  it('survives a request timeout (iOS uygulamayı istek uçarken askıya aldı)', async () => {
    axiosPost.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' });

    await expect(runRefresh()).resolves.toBeNull();

    expectSessionSurvived();
  });

  it('survives a 5xx — sunucu arızası token hakkında hüküm değildir', async () => {
    axiosPost.mockRejectedValue({ response: { status: 503, data: 'Service Unavailable' } });

    await expect(runRefresh()).resolves.toBeNull();

    expectSessionSurvived();
  });

  it('survives a 429 — oturum düşmez ama tur da uzatılmaz', async () => {
    // Sunucu CEVAP VERDİ ve "yavaşla" dedi; 1 sn sonra tekrar denemek tam da
    // yasakladığı şey. Geçici hata olduğu için oturum korunuyor, retry yok.
    axiosPost.mockRejectedValue({ response: { status: 429, data: {} } });

    await expect(runRefresh()).resolves.toBeNull();

    expect(axiosPost).toHaveBeenCalledTimes(1);
    expectSessionSurvived();
  });

  it('recovers on the next attempt once the network is back', async () => {
    axiosPost.mockRejectedValue({ message: 'Network Error' });
    await expect(runRefresh()).resolves.toBeNull();
    expectSessionSurvived();

    axiosPost.mockReset();
    axiosPost.mockResolvedValueOnce({
      data: { result: { token: 'fresh-access', refreshToken: 'rotated-refresh' } },
    });

    await expect(runRefresh()).resolves.toBe('fresh-access');
    expect(getCurrentAccessToken()).toBe('fresh-access');
    expect(saveRefreshToken).toHaveBeenCalledWith('rotated-refresh');
  });
});

/**
 * Grace penceresi (backend 60 sn) sayesinde aynı token'la tekrar denemek
 * güvenli. Bu turu yapmazsak, cevabı kaybolan bir refresh'te kullanıcı bir
 * sonraki isteğe kadar bekliyor — arka plandan dönüşte o istek hiç gelmeyebilir.
 */
describe('bounded retry with the same token', () => {
  it('retries the SAME refresh token and succeeds on the second attempt', async () => {
    axiosPost
      .mockRejectedValueOnce({ message: 'Network Error' })
      .mockResolvedValueOnce({
        data: { result: { token: 'fresh-access', refreshToken: 'rotated-refresh' } },
      });

    await expect(runRefresh()).resolves.toBe('fresh-access');

    expect(axiosPost).toHaveBeenCalledTimes(2);
    // İki deneme de AYNI token'ı gönderdi — grace penceresinin dayandığı şart.
    for (const call of axiosPost.mock.calls) {
      expect(call[1]).toEqual({ refreshToken: 'refresh-token' });
    }
    expect(authLost).not.toHaveBeenCalled();
  });

  it('gives up after three attempts instead of retrying forever', async () => {
    // Pencere sunucuda kapatılabiliyor (Auth__RefreshGraceSeconds=0); sonsuz
    // retry oturumu kurtarmadığı gibi kullanıcıyı dakikalarca bekletirdi.
    axiosPost.mockRejectedValue({ message: 'Network Error' });

    await expect(runRefresh()).resolves.toBeNull();

    expect(axiosPost).toHaveBeenCalledTimes(3);
    expectSessionSurvived();
  });

  it('does not retry once the server has ruled on the token', async () => {
    axiosPost.mockRejectedValue({
      response: { status: 401, data: { code: 'UT-1015', reason: 'token_reuse' } },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(axiosPost).toHaveBeenCalledTimes(1);
  });
});

describe('authoritative rejections still drop the session', () => {
  it('clears the session when the server rejects the refresh token (401)', async () => {
    axiosPost.mockRejectedValue({
      response: { status: 401, data: { errorCode: 'UT-1005', reason: null } },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(authLost).toHaveBeenCalledWith('session_expired');
    expect(getCurrentAccessToken()).toBeNull();
  });

  it('carries new_login_elsewhere through so the UI can explain it', async () => {
    axiosPost.mockRejectedValue({
      response: { status: 401, data: { errorCode: 'UT-1005', reason: 'new_login_elsewhere' } },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(authLost).toHaveBeenCalledWith('new_login_elsewhere');
  });

  it('clears the session on a 400 malformed/expired refresh token', async () => {
    axiosPost.mockRejectedValue({
      response: { status: 400, data: { errorCode: 'UT-1005' } },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(authLost).toHaveBeenCalledWith('session_expired');
  });

  it('still ends the session on a 401 that carries no code at all', async () => {
    // Çıplak 401 = refresh token'ın 30 günü doldu (eski backend şekli).
    // Dokümandaki "yalnız bilinen kodlarda logout" kuralı burada oturumu ölü
    // token'la ayakta bırakır ve her istek üç kez denenirdi.
    axiosPost.mockRejectedValue({ response: { status: 401, data: '' } });

    await expect(runRefresh()).resolves.toBeNull();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(authLost).toHaveBeenCalledWith('session_expired');
  });
});

/**
 * Backend 2026-08-19'dan beri ayırt edici `code` gönderiyor. Kullanıcıya
 * gösterilecek metin buradan seçiliyor: "süresi doldu" ile "güvenlik için
 * sonlandırıldı" aynı şey değil.
 */
describe('UT-code → auth-lost reason', () => {
  const cases: Array<[string, string, string]> = [
    ['UT-1014', 'refresh_expired', 'refresh_expired'],
    ['UT-1015', 'token_reuse', 'token_reuse'],
    ['UT-1015', 'token_unknown', 'token_reuse'],
    ['UT-1016', 'session_logout', 'session_logout'],
    ['UT-1005', 'token_missing', 'session_expired'],
  ];

  it.each(cases)('%s (%s) → %s', async (code, reason, expected) => {
    axiosPost.mockRejectedValue({
      response: {
        status: 401,
        data: {
          isSuccess: false,
          errorCode: 'REFRESH_TOKEN_INVALID',
          reason,
          code,
          message: 'Güvenliğin için oturumun sonlandırıldı.',
          action: 'Giriş Yap',
        },
      },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(authLost).toHaveBeenCalledWith(expected);
    expect(clearAllTokens).toHaveBeenCalled();
  });

  it('lets an unknown code fall back to the silent session_expired path', async () => {
    axiosPost.mockRejectedValue({
      response: { status: 401, data: { code: 'UT-9999', reason: 'brand_new_thing' } },
    });

    await expect(runRefresh()).resolves.toBeNull();

    expect(authLost).toHaveBeenCalledWith('session_expired');
  });
});
