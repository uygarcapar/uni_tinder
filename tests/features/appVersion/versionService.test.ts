/**
 * Sürüm kapısının sözleşmesi. İki söz veriyor:
 *
 *   1. **FAIL-OPEN** — kontrol hangi şekilde patlarsa patlasın (ağ yok, timeout,
 *      5xx, bozuk gövde, eksik alan) kullanıcı uygulamayı AÇABİLİR. Backend'in
 *      5 dakikalık bir kesintisi, tüm kullanıcı tabanının uygulamayı hiç
 *      açamaması anlamına gelmemeli.
 *   2. **Blokaj bastırılamaz** — "Sonra" susturması yalnız `soft` içindir;
 *      `force` / `maintenance` her açılışta tekrar gösterilir.
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

import {
  checkAppVersion,
  getAppVersion,
  isSoftUpdateDismissed,
  markSoftUpdateDismissed,
} from '@/features/appVersion/versionService';

/** api.ts response interceptor'ı gövdeyi unwrap ediyor → doğrudan ResponseDto. */
const ok = (result: any) => ({ isSuccess: true, result });

beforeEach(() => {
  mockMemoryStore.clear();
  mockGet.mockReset();
  jest.restoreAllMocks();
});

describe('checkAppVersion — fail-open', () => {
  it.each([
    ['ağ yok', Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })],
    ['timeout', Object.assign(new Error('timeout of 8000ms exceeded'), { code: 'ECONNABORTED' })],
    ['5xx', Object.assign(new Error('status 500'), { response: { status: 500 } })],
  ])('%s durumunda kullanıcıyı içeri alır', async (_label, err) => {
    mockGet.mockRejectedValueOnce(err);
    const r = await checkAppVersion();
    expect(r.action).toBe('ok');
    expect(r.isBlocking).toBe(false);
  });

  it.each([
    ['boş gövde', undefined],
    ['result yok', {}],
    ['action yok', ok({ latestVersion: '2.0.0' })],
    ['result null', ok(null)],
  ])('%s durumunda kullanıcıyı içeri alır', async (_label, body) => {
    mockGet.mockResolvedValueOnce(body);
    const r = await checkAppVersion();
    expect(r.action).toBe('ok');
    expect(r.isBlocking).toBe(false);
  });
});

describe('checkAppVersion — karar', () => {
  it('platform ve sürümü query olarak gönderir', async () => {
    mockGet.mockResolvedValueOnce(ok({ action: 'ok' }));
    await checkAppVersion();

    const [url, config] = mockGet.mock.calls[0];
    expect(url).toBe('/api/app/version-check');
    expect(config.params.version).toBe(getAppVersion());
    expect(['ios', 'android']).toContain(config.params.platform);
    // Açılışı bekletmemek için api.ts'in 30sn genel limiti override edilir.
    expect(config.timeout).toBeLessThan(30000);
  });

  it('soft güncellemede blokaj kurmaz', async () => {
    mockGet.mockResolvedValueOnce(
      ok({ action: 'soft', latestVersion: '1.5.0', minSupportedVersion: '1.0.0' }),
    );
    const r = await checkAppVersion();
    expect(r.action).toBe('soft');
    expect(r.isBlocking).toBe(false);
    expect(r.latestVersion).toBe('1.5.0');
  });

  it.each(['force', 'maintenance'])(
    "%s kararında isBlocking'i sunucudan değil action'dan türetir",
    async (action) => {
      // `isBlocking` alanı hiç gelmiyor (eski/deploy edilmemiş backend).
      // Körlemesine okusaydık undefined → falsy → force kapatılabilir olurdu.
      mockGet.mockResolvedValueOnce(ok({ action, latestVersion: '1.5.0' }));
      const r = await checkAppVersion();
      expect(r.isBlocking).toBe(true);
    },
  );

  it('mesaj ve store linkini olduğu gibi taşır, uydurmaz', async () => {
    mockGet.mockResolvedValueOnce(
      ok({ action: 'force', message: 'Bu sürüm desteklenmiyor.', storeUrl: 'https://x/y' }),
    );
    const r = await checkAppVersion();
    expect(r.message).toBe('Bu sürüm desteklenmiyor.');
    expect(r.storeUrl).toBe('https://x/y');

    mockGet.mockResolvedValueOnce(ok({ action: 'force' }));
    const bare = await checkAppVersion();
    expect(bare.message).toBeNull();
    expect(bare.storeUrl).toBeNull();
  });
});

describe('soft dismiss', () => {
  it('aynı sürüm için 24 saat susar', () => {
    const t0 = 1_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(t0);
    markSoftUpdateDismissed('1.5.0');

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 23 * 60 * 60 * 1000);
    expect(isSoftUpdateDismissed('1.5.0')).toBe(true);

    jest.spyOn(Date, 'now').mockReturnValue(t0 + 25 * 60 * 60 * 1000);
    expect(isSoftUpdateDismissed('1.5.0')).toBe(false);
  });

  it('yeni bir sürüm çıktığında susturma taşınmaz', () => {
    markSoftUpdateDismissed('1.5.0');
    expect(isSoftUpdateDismissed('1.6.0')).toBe(false);
  });

  it('hiç susturulmamışken false döner', () => {
    expect(isSoftUpdateDismissed('1.5.0')).toBe(false);
  });

  it('bozuk kayıtta patlamaz, susturmayı yok sayar', () => {
    mockMemoryStore.set('versionSoftDismissed', '{bozuk');
    expect(isSoftUpdateDismissed('1.5.0')).toBe(false);
  });
});
