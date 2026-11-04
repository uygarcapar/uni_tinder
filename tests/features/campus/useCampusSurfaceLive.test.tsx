/**
 * YÜZEYİN CANLI PRESENCE ABONELİĞİ — "+" ve ipucu sayfa yenilenmeden.
 *
 * Sözleşmenin üç bacağı:
 *   1. bus dirty → ipucu HER ZAMAN, `inside` YALNIZ harita açıkken (force).
 *   2. harita kapalıyken dirty GPS OKUTMAZ (pil kuralı — resolveCampusPresence
 *      yüksek doğruluklu 12sn'lik okuma).
 *   3. AppState 'active' dönüşü yalnız UCUZ ipucunu tazeler.
 *
 * Kanca ağır (sorgular, mutasyonlar, kamera) — konum katmanı ve sorgular
 * modül sınırından mock'lanıyor; bus GERÇEK (sözleşmenin kendisi o).
 */
const mockResolvePresence = jest.fn();
const mockResolveHint = jest.fn();
jest.mock('@/features/campus/campusPresence', () => ({
  resolveCampusPresence: (...a: any[]) => mockResolvePresence(...a),
  resolveCampusPresenceHint: (...a: any[]) => mockResolveHint(...a),
}));
jest.mock('@/features/campus/campusGeofence', () => ({
  syncCampusGeofence: jest.fn(async () => {}),
}));
jest.mock('@/features/campus/campusService', () => ({
  campusCodeOf: () => null,
  campusMessageOf: () => null,
}));
jest.mock('@/features/campus/campusQueries', () => ({
  removeMomentFromCaches: jest.fn(),
  useCampusMe: () => ({ data: { enabled: true, postedToday: false } }),
  useCampusBoundary: () => ({ data: { domain: 'bilgiedu.net' } }),
  useCampusMoments: () => ({ data: undefined, isLoading: false }),
  useCreateCampusMoment: () => ({ mutateAsync: jest.fn() }),
  useDeleteCampusMoment: () => ({ mutate: jest.fn() }),
  usePassCampusMoment: () => ({ mutate: jest.fn() }),
  useRefreshCampus: () => jest.fn(),
  dedupeMomentsByUser: (x: any[]) => x,
  mergeKeptMoments: (x: any[]) => x,
}));
jest.mock('@/features/discover/swipeQueries', () => ({
  useSwipeMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/shared/utils/photoPicker', () => ({
  captureAndSendPhoto: jest.fn(),
  fitPhotoForUpload: jest.fn(),
}));
jest.mock('@/shared/hooks/redux', () => ({
  useAppSelector: (fn: any) => fn({ auth: { user: { id: 'u1' } } }),
}));
// ⚠️ `i18n` DE DÖNMEK ZORUNDA: kanca okulun görünen adını `resolveLocalized`
// ile çözerken `i18n.language` okuyor (bkz. `universityName`).
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'tr' } }),
}));
// Üniversite listesi ağdan geliyor (staticGet) — kancanın konusu değil, yalnız
// "… gönder" satırının adı. Diğer export'lar GERÇEK: `normalizeDomain` ve
// `resolveLocalized` saf fonksiyonlar ve kanca ikisini de kullanıyor.
jest.mock('@/shared/queries/commonQueries', () => ({
  ...jest.requireActual('@/shared/queries/commonQueries'),
  useUniversities: () => ({ data: [] }),
}));

import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCampusSurface } from '@/features/campus/useCampusSurface';
import { emitCampusPresenceDirty } from '@/features/campus/campusPresenceBus';

let appStateListener: ((s: string) => void) | null = null;

const wrapper = ({ children }: any) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const renderSurface = (enabled: boolean, prewarm = false) =>
  renderHook(
    () =>
      useCampusSurface({
        enabled,
        prewarm,
        mode: 'Dating',
        domain: 'bilgiedu.net',
        onPaywall: jest.fn(),
      }),
    { wrapper },
  );

beforeEach(() => {
  mockResolvePresence.mockReset().mockResolvedValue({
    inside: true,
    insideRaw: true,
    fix: null,
    permissionDenied: false,
  });
  mockResolveHint.mockReset().mockResolvedValue(true);
  appStateListener = null;
  jest.restoreAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _e: any,
    cb: any,
  ) => {
    appStateListener = cb;
    return { remove: jest.fn() };
  }) as any);
});

it('bus dirty → ipucu yeniden hesaplanıyor; harita açıkken inside force ile', async () => {
  renderSurface(true);
  await waitFor(() => expect(mockResolveHint).toHaveBeenCalled());
  mockResolvePresence.mockClear();
  mockResolveHint.mockClear();

  await act(async () => {
    emitCampusPresenceDirty();
  });

  expect(mockResolveHint).toHaveBeenCalled();
  expect(mockResolvePresence).toHaveBeenCalledWith(
    expect.objectContaining({ force: true }),
  );
});

it('harita KAPALIYKEN bus dirty GPS okutmuyor (pil kuralı) — yalnız ipucu', async () => {
  renderSurface(false, true);
  await waitFor(() => expect(mockResolveHint).toHaveBeenCalled());
  mockResolvePresence.mockClear();
  mockResolveHint.mockClear();

  await act(async () => {
    emitCampusPresenceDirty();
  });

  expect(mockResolveHint).toHaveBeenCalled();
  expect(mockResolvePresence).not.toHaveBeenCalled();
});

it("AppState 'active' dönüşünde yalnız ipucu tazeleniyor", async () => {
  renderSurface(false, true);
  await waitFor(() => expect(appStateListener).not.toBeNull());
  mockResolvePresence.mockClear();
  mockResolveHint.mockClear();

  await act(async () => {
    appStateListener!('active');
  });

  expect(mockResolveHint).toHaveBeenCalled();
  expect(mockResolvePresence).not.toHaveBeenCalled();
});

it('unmount abonelikleri bırakıyor', async () => {
  const { unmount } = renderSurface(true);
  await waitFor(() => expect(mockResolveHint).toHaveBeenCalled());
  unmount();
  mockResolvePresence.mockClear();
  mockResolveHint.mockClear();

  await act(async () => {
    emitCampusPresenceDirty();
  });

  expect(mockResolveHint).not.toHaveBeenCalled();
  expect(mockResolvePresence).not.toHaveBeenCalled();
});
