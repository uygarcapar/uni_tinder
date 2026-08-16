/**
 * api.ts response interceptor'ının yaptırım dalı.
 *
 * Kritik davranış: 403 + UT-100x, 401→refresh dalından ÖNCE yakalanmalı.
 * Yaptırımlı hesapta refresh de 403 döner; sıra ters olsa istemci sonsuz
 * refresh döngüsüne girer (doc senaryo 4).
 */

// jest.mock factory'leri import'ların da üstüne hoist edilir — dışarıda tanımlı
// bir nesneye yazmak (mock öneki olsa bile) TDZ'ye düşer. Mock'lar factory
// İÇİNDE kurulur, referansları import sonrası modülden alınır.
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
import { clearAllTokens } from '@/shared/utils/tokenStorage';
import {
  setCurrentAccessToken,
  getCurrentAccessToken,
  refreshAccessToken,
  setOnAuthLost,
} from '@/shared/services/api';
import {
  setOnAccountBlocked,
  resetAccountBlockLatch,
  type AccountBlockPayload,
} from '@/shared/utils/accountBlock';

// api.ts import edilirken kaydedilen rejection handler'ı — clearAllMocks
// çağrı geçmişini sildiği için referansı bir kez, modül seviyesinde alıyoruz.
const axiosPost = (axios as any).post as jest.Mock;
const instance = (axios as any).create.mock.results[0].value;
const onResponseError: (error: any) => Promise<any> =
  instance.interceptors.response.use.mock.calls[0][1];

const forbidden = (body: any) => ({
  config: { url: '/api/swipe/GetPotentialMatches', method: 'get', headers: {} },
  response: { status: 403, data: body },
});

const SUSPENDED_BODY = {
  isSuccess: false,
  errorCode: 'UT-1008',
  reason: 'suspended',
  message: 'Hesabın 18.08.2026 tarihine kadar askıya alındı. Sebep: Spam',
  action: "Destek'e Yaz",
  expiresAt: '2026-08-18T12:00:00Z',
};

let blocked: AccountBlockPayload[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  resetAccountBlockLatch();
  blocked = [];
  setOnAccountBlocked((p) => blocked.push(p));
  setCurrentAccessToken('stale-access-token');
});

describe('403 sanction handling in the response interceptor', () => {
  it('clears the session and reports the sanction without attempting a refresh', async () => {
    await expect(onResponseError(forbidden(SUSPENDED_BODY))).rejects.toBeDefined();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(getCurrentAccessToken()).toBeNull();
    // ASIL REGRESYON KORUMASI: refresh hiç denenmemeli.
    expect(axiosPost).not.toHaveBeenCalled();

    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      errorCode: 'UT-1008',
      reason: 'suspended',
      expiresAt: '2026-08-18T12:00:00Z',
    });
  });

  it('reports the sanction once when parallel boot requests all get 403', async () => {
    await Promise.all(
      [1, 2, 3, 4, 5].map((i) => onResponseError(forbidden(SUSPENDED_BODY)).catch(() => i)),
    );
    expect(blocked).toHaveLength(1);
  });

  it('leaves ordinary 403s alone', async () => {
    await expect(
      onResponseError(forbidden({ errorCode: 'UT-6005', message: 'kısıtlı' })),
    ).rejects.toBeDefined();

    expect(blocked).toHaveLength(0);
    expect(clearAllTokens).not.toHaveBeenCalled();
    expect(getCurrentAccessToken()).toBe('stale-access-token');
  });
});

describe('403 sanction during token refresh', () => {
  it('drops the session through the block path instead of the generic auth-lost path', async () => {
    const authLost = jest.fn();
    setOnAuthLost(authLost);
    axiosPost.mockRejectedValueOnce({ response: { status: 403, data: SUSPENDED_BODY } });

    await expect(refreshAccessToken()).resolves.toBeNull();

    expect(clearAllTokens).toHaveBeenCalled();
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toBe('suspended');
    // Yaptırım, "session expired" toast/logout akışına DÜŞMEMELİ — kullanıcı
    // sessizce login'e atılıp gerekçeyi hiç görmezdi.
    expect(authLost).not.toHaveBeenCalled();
  });

  it('still runs the generic auth-lost path for a plain revoked refresh token', async () => {
    const authLost = jest.fn();
    setOnAuthLost(authLost);
    axiosPost.mockRejectedValueOnce({
      response: { status: 401, data: { errorCode: 'UT-1005', reason: 'new_login_elsewhere' } },
    });

    await expect(refreshAccessToken()).resolves.toBeNull();

    expect(blocked).toHaveLength(0);
    expect(authLost).toHaveBeenCalledWith('new_login_elsewhere');
  });
});
