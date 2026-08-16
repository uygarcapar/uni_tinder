/**
 * Satın alma teşhis kaydının sözleşmesi.
 *
 * Bu modülün tek işi kanıt bırakmak, o yüzden testler de kanıtın hayatta
 * kalmasına bakıyor: kayıt RELOAD'u atlatmalı (MMKV'ye yazılmalı), tampon
 * taşarken EN YENİ satırlar korunmalı ve rapor "alan gelmedi" ile "alan null
 * geldi"yi ayırt etmeli — teşhiste bu iki durum farklı sorunlara işaret ediyor.
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

import {
  buildIapReport,
  clearIapDiagnostics,
  iapLog,
  readIapEvents,
  readIapFacts,
  setIapFacts,
} from '@/features/profile/purchaseDiagnostics';

beforeEach(() => {
  clearIapDiagnostics();
  mockMemoryStore.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('iapLog', () => {
  it("kaydı MMKV'ye yazar — reload sonrası da okunabilsin", () => {
    iapLog('sync', { reason: 'NOT_FOUND_IN_RC' });

    const persisted = mockMemoryStore.get('iapDiagEvents');
    expect(persisted).toBeTruthy();
    expect(JSON.parse(persisted!)).toHaveLength(1);
  });

  it('nesne detayını k=v satırına çevirir, undefined alanları düşürür', () => {
    iapLog('redeem-hata', { http: 402, code: null, mesaj: undefined });

    const [event] = readIapEvents();
    expect(event.step).toBe('redeem-hata');
    // `code=null` KORUNUYOR: "backend code döndürmedi" teşhiste 402'nin
    // kendisi kadar bilgi taşıyor.
    expect(event.detail).toBe('http=402 · code=null');
  });

  it('düz metin detayını olduğu gibi taşır', () => {
    iapLog('kimlik', 'RC configure değil');
    expect(readIapEvents()[0].detail).toBe('RC configure değil');
  });

  it('tampon taşınca EN ESKİ kayıtları düşürür', () => {
    for (let i = 0; i < 205; i++) iapLog(`adım-${i}`);

    const events = readIapEvents();
    expect(events).toHaveLength(200);
    // Son satın alma turu her zaman elimizde kalmalı.
    expect(events[events.length - 1].step).toBe('adım-204');
    expect(events[0].step).toBe('adım-5');
  });
});

describe('setIapFacts', () => {
  it('kimlik bilgilerini üzerine yazar, diğerlerini korur', () => {
    setIapFacts({ backendUserId: 'u-1', rcSandbox: true });
    setIapFacts({ backendUserId: 'u-2' });

    expect(readIapFacts()).toEqual({ backendUserId: 'u-2', rcSandbox: true });
  });
});

describe('buildIapReport', () => {
  it('ortam başlığını, çağıranın verdiği canlı durumu ve olayları birleştirir', () => {
    setIapFacts({ rcAppUserId: 'u-1' });
    iapLog('sync-başarısız', { reason: 'NOT_FOUND_IN_RC' });

    const report = buildIapReport({ bekleyenRedeem: '2 kayıt' });

    expect(report).toContain('LIT satın alma teşhis raporu');
    expect(report).toContain('rcAppUserId: u-1');
    expect(report).toContain('bekleyenRedeem: 2 kayıt');
    expect(report).toContain('sync-başarısız');
    expect(report).toContain('NOT_FOUND_IN_RC');
  });

  it('kayıt yokken de rapor üretir', () => {
    expect(buildIapReport()).toContain('(kayıt yok)');
  });
});

describe('clearIapDiagnostics', () => {
  it('olayları ve kimlik bilgilerini siler', () => {
    iapLog('sync');
    setIapFacts({ backendUserId: 'u-1' });

    clearIapDiagnostics();

    expect(readIapEvents()).toEqual([]);
    expect(readIapFacts()).toEqual({});
  });
});
