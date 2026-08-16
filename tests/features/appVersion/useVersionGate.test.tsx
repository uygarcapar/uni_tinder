/**
 * Kapıyı ne AÇAR ne KAPATIR sorusunun sözleşmesi.
 *
 * Kritik ayrım: "Sonra" susturması **yalnız soft içindir**. Blokaj aynı
 * susturmaya takılsaydı, kullanıcı bir kez "Sonra" dedikten sonra force-update
 * onu 24 saat boyunca hiç bulamaz — kırıcı değişikliği durdurmak için var olan
 * mekanizma tam da işe yarayacağı anda sessizce devre dışı kalırdı.
 */

const mockMemoryStore = new Map<string, string>();

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockMemoryStore.get(k),
    set: (k: string, v: string) => mockMemoryStore.set(k, v),
    remove: (k: string) => mockMemoryStore.delete(k),
    getBoolean: () => undefined,
    getNumber: () => undefined,
    clearAll: () => mockMemoryStore.clear(),
  }),
}));

const mockGet = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { get: (...args: any[]) => mockGet(...args) },
}));

import { AppState } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useVersionGate } from '@/features/appVersion/useVersionGate';

const ok = (result: any) => ({ isSuccess: true, result });
const soft = ok({ action: 'soft', latestVersion: '1.5.0', minSupportedVersion: '1.0.0' });
const force = ok({ action: 'force', latestVersion: '1.5.0', minSupportedVersion: '1.5.0' });

/** AppState listener'ını yakalayıp foreground dönüşünü elle tetiklemek için. */
let appStateListener: ((s: string) => void) | null = null;

beforeEach(() => {
  mockMemoryStore.clear();
  mockGet.mockReset();
  appStateListener = null;
  jest.restoreAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: any, cb: any) => {
    appStateListener = cb;
    return { remove: jest.fn() };
  }) as any);
});

describe('useVersionGate', () => {
  it('ok cevabında hiçbir şey açmaz', async () => {
    mockGet.mockResolvedValue(ok({ action: 'ok' }));
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current.open).toBe(false);
    expect(result.current.result).toBeNull();
  });

  it('soft kararını açar, "Sonra" kapatır ve aynı sürüm bir daha açılmaz', async () => {
    mockGet.mockResolvedValue(soft);
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);
    // Payload duruyor: sheet unmount olmuyor, gorhom kapanış animasyonu oynuyor.
    expect(result.current.result?.action).toBe('soft');

    // Foreground dönüşü aynı soft'u tekrar getirir — susturma tutmalı.
    await act(async () => {
      appStateListener?.('active');
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(result.current.open).toBe(false);
  });

  it('"Sonra" susturması blokajı GİZLEMEZ', async () => {
    mockGet.mockResolvedValue(soft);
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => result.current.dismiss());
    expect(result.current.open).toBe(false);

    // Admin eşiği yükseltti: aynı latestVersion, artık force.
    mockGet.mockResolvedValue(force);
    await act(async () => {
      appStateListener?.('active');
    });

    await waitFor(() => expect(result.current.open).toBe(true));
    expect(result.current.result?.action).toBe('force');
    expect(result.current.result?.isBlocking).toBe(true);
  });

  it('blokaj dismiss ile kapatılamaz', async () => {
    mockGet.mockResolvedValue(force);
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(result.current.open).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.open).toBe(true);
  });

  it('bakım bitince kapı kendiliğinden kapanır', async () => {
    mockGet.mockResolvedValue(ok({ action: 'maintenance', latestVersion: '1.5.0' }));
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(result.current.open).toBe(true));

    mockGet.mockResolvedValue(ok({ action: 'ok' }));
    await act(async () => {
      await result.current.recheck();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.rechecking).toBe(false);
  });

  it('ağ patlarsa kapı hiç açılmaz (fail-open)', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useVersionGate());
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current.open).toBe(false);
  });
});
