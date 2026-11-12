/**
 * "Friends modunda beğendiğim Friends profili için 'bu kişiye ulaşılamıyor'
 * diyor."
 *
 * Swipe ucu `mode` GÖNDERİLMEZSE sunucu Dating sayıyor (eski istemci
 * sözleşmesi, bkz. SwipeVariables). Yalnız Friends profili açık bir hedefe
 * Dating'ten beğeni gidince sunucu UT-2305 (TARGET_MODE_INACTIVE) dönüyor:
 * kart düşüyor, eşleşme hiç doğmuyor ve kullanıcı nötr "ulaşılamıyor"
 * mesajını görüyor. Beğeniler ekranı tam olarak bunu yapıyordu.
 *
 * `fetchWhoLikedMe`te kapatılan boşluğun aynısı (bkz. whoLikedMeMode.test):
 * modu atlamak sessiz bir Dating varsayımı. Mutasyon artık çağıranın modunu
 * taşıyor, çağıran söylemediyse de DİSKTEKİ seçime düşüyor — sunucunun
 * varsayılanına asla bırakmıyor.
 */

const mockLikeUser = jest.fn();
const mockFireUser = jest.fn();
const mockPassUser = jest.fn();

jest.mock('@/shared/services/api', () => ({ __esModule: true, default: {} }));
jest.mock('@/features/discover/swipeService', () => ({
  __esModule: true,
  default: {
    likeUser: (...args: unknown[]) => mockLikeUser(...args),
    fireUser: (...args: unknown[]) => mockFireUser(...args),
    passUser: (...args: unknown[]) => mockPassUser(...args),
  },
}));

// react-redux ESM-only build ile geliyor (bkz. swipeStatsPremium.test). Bu
// mutasyonun state'ten istediği tek şey mod anahtarının kullanıcı kimliği.
let mockUserId: string | null = null;
jest.mock('react-redux', () => ({
  useSelector: (fn: any) =>
    fn({ auth: { user: mockUserId ? { id: mockUserId } : null } }),
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { appPrefs } from '@/shared/utils/appPrefs';
import { saveAppMode } from '@/features/discover/modePrefs';
import { useSwipeMutation } from '@/features/discover/swipeQueries';

const USER = 'me-1';
const TARGET = 'target-1';

const OK = { isSuccess: true, result: {} };

const renderSwipe = () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return renderHook(() => useSwipeMutation(), {
    wrapper: ({ children }: any) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  appPrefs.clearAll?.();
  mockUserId = USER;
  mockLikeUser.mockReset().mockResolvedValue(OK);
  mockFireUser.mockReset().mockResolvedValue(OK);
  mockPassUser.mockReset().mockResolvedValue(OK);
});

describe('useSwipeMutation — mod her aksiyonda gidiyor', () => {
  it('çağıranın verdiği modu uca geçirir', async () => {
    saveAppMode(USER, 'Dating');
    const { result } = renderSwipe();

    result.current.mutate({ direction: 'right', userId: TARGET, mode: 'Friends' });

    await waitFor(() =>
      expect(mockLikeUser).toHaveBeenCalledWith(TARGET, null, 'Friends', {
        source: undefined,
        momentId: undefined,
      }),
    );
  });

  it('çağıran modu vermediyse DİSKTEKİ seçime düşer — sunucunun Dating varsayımına DEĞİL', async () => {
    // Beğeniler ekranının vakası: kullanıcı Friends'te, cevapladığı kişinin
    // yalnız Friends profili açık. Mod atlanırsa istek Dating'e yazılır ve
    // sunucu UT-2305 ile reddeder.
    saveAppMode(USER, 'Friends');
    const { result } = renderSwipe();

    result.current.mutate({ direction: 'right', userId: TARGET });

    await waitFor(() => expect(mockLikeUser).toHaveBeenCalled());
    expect(mockLikeUser.mock.calls[0][2]).toBe('Friends');
  });

  it('pas ve Fire de aynı yoldan geçiyor', async () => {
    saveAppMode(USER, 'Friends');
    const { result } = renderSwipe();

    result.current.mutate({ direction: 'left', userId: TARGET });
    await waitFor(() => expect(mockPassUser).toHaveBeenCalled());
    expect(mockPassUser.mock.calls[0][2]).toBe('Friends');

    result.current.mutate({ direction: 'up', userId: TARGET });
    await waitFor(() => expect(mockFireUser).toHaveBeenCalled());
    expect(mockFireUser.mock.calls[0][2]).toBe('Friends');
  });

  it('oturum/seçim yokken varsayılan mod — parametre YİNE gidiyor', async () => {
    mockUserId = null;
    const { result } = renderSwipe();

    result.current.mutate({ direction: 'right', userId: TARGET });

    await waitFor(() => expect(mockLikeUser).toHaveBeenCalled());
    // Varsayılan bu build'in tek modu (modeTheme > APP_MODES).
    expect(mockLikeUser.mock.calls[0][2]).toBe('Friends');
  });
});
