/**
 * Akış bayrağı AÇILMA yönü probe'u (feedProbe.ts).
 *
 * Test edilen üç sözleşme:
 *  1. Pencere yakma: 6 saatlik throttle penceresi YALNIZ bilgi taşıyan bir
 *     cevapta yakılır. Ağ/5xx/401 gibi bilgisiz hatalar pencereyi yakmaz —
 *     bir sonraki foreground yeniden dener. (Eski bug: markFeedFlagProbed
 *     fetch'ten ÖNCE çağrılıyordu, başarısız probe 6 saati gömüyordu.)
 *  2. 403 kod ayrımı: UT-7315 / UT-7308 / UT-7310 "akış AÇIK ama bu kullanıcı
 *     kapıda" demek → latch'e "on" yazılır. Yalnız UT-7301 gerçekten kapalı.
 *  3. Kararlı durum: sekme zaten açıksa ya da pencere doluysa hiç fetch yok;
 *     eşzamanlı çağrılar tek fetch'e iner.
 */

jest.mock('@/features/feed/feedDevFlag', () => ({
  devForceFeedEnabled: jest.fn(() => false),
}));

const mockGetMe = jest.fn();
jest.mock('@/features/feed/feedService', () => ({
  __esModule: true,
  default: { getMe: (...a: any[]) => mockGetMe(...a) },
}));

// Gerçek queryClient react-query'yi (ve cache ömrünü) suite'e sokar; probe'un
// ondan kullandığı tek şey fetchQuery'nin queryFn'i koşturması.
jest.mock('@/shared/queries/queryClient', () => ({
  queryClient: {
    fetchQuery: jest.fn(({ queryFn }: any) => queryFn()),
  },
}));

import { appPrefs } from '@/shared/utils/appPrefs';
import {
  feedEnabledForSession,
  initFeedFlag,
  readFeedFlag,
  resetFeedFlagSession,
  shouldProbeFeedFlag,
} from '@/features/feed/feedFlag';
import { probeFeedFlagIfDue } from '@/features/feed/feedProbe';

const USER = 'user-1';

/** feedService > guard'ın fırlattığı şekil: zarf `response.data`da, kod içinde. */
const codedError = (code: string) => {
  const err: any = new Error(code);
  err.response = { data: { code }, status: 403 };
  return err;
};

beforeEach(() => {
  appPrefs.clearAll?.();
  resetFeedFlagSession();
  mockGetMe.mockReset();
  initFeedFlag(USER); // unknown → oturum kapalı, probe adayı
});

describe('probeFeedFlagIfDue — başarı yolu', () => {
  it('/me cevap verdi → latch "on", sekme oturumda açılır, pencere yakılır', async () => {
    mockGetMe.mockResolvedValue({ feedEnabled: true });
    await probeFeedFlagIfDue();
    expect(readFeedFlag(USER)).toBe('on');
    expect(feedEnabledForSession()).toBe(true);
    expect(shouldProbeFeedFlag()).toBe(false); // pencere yandı (sekme açık olmasa da)
  });
});

describe('probeFeedFlagIfDue — 403 kod ayrımı', () => {
  // UT-2304: akış Arkadaş'a özel (2026-11-06) — Arkadaş profili açılmamış
  // kullanıcıya uçlar 403 UT-2304 dönüyor. Bu da "özellik AÇIK ki mod kapısı
  // çalışıyor" kanıtı; UT-7301 ("özellik kapalı") ile karıştırılmamalı.
  it.each(['UT-7315', 'UT-7308', 'UT-7310', 'UT-2304'])(
    '%s = akış açık ama kullanıcı kapıda → latch "on" + pencere yakılır',
    async (code) => {
      mockGetMe.mockRejectedValue(codedError(code));
      await probeFeedFlagIfDue();
      expect(readFeedFlag(USER)).toBe('on');
      expect(feedEnabledForSession()).toBe(true);
      expect(shouldProbeFeedFlag()).toBe(false);
    },
  );

  it('UT-7301 = gerçekten kapalı → latch "on" OLMAZ, pencere yakılır', async () => {
    mockGetMe.mockRejectedValue(codedError('UT-7301'));
    await probeFeedFlagIfDue();
    expect(readFeedFlag(USER)).not.toBe('on');
    expect(feedEnabledForSession()).toBe(false);
    expect(shouldProbeFeedFlag()).toBe(false);
  });

  it('tanınmayan UT kodu bilgi SAYILMAZ → latch dokunulmaz, pencere yanmaz', async () => {
    mockGetMe.mockRejectedValue(codedError('UT-9999'));
    await probeFeedFlagIfDue();
    expect(readFeedFlag(USER)).toBe('unknown');
    expect(shouldProbeFeedFlag()).toBe(true);
  });
});

describe('probeFeedFlagIfDue — bilgisiz hata pencereyi yakmaz', () => {
  it('ağ hatası → latch dokunulmaz, bir sonraki foreground yeniden dener', async () => {
    const netErr: any = new Error('Network Error');
    netErr.code = 'ERR_NETWORK';
    mockGetMe.mockRejectedValue(netErr);
    await probeFeedFlagIfDue();
    expect(readFeedFlag(USER)).toBe('unknown');
    expect(feedEnabledForSession()).toBe(false);
    expect(shouldProbeFeedFlag()).toBe(true); // pencere YANMADI

    // Yeniden deneme mümkün ve bu kez başarılı.
    mockGetMe.mockResolvedValue({});
    await probeFeedFlagIfDue();
    expect(readFeedFlag(USER)).toBe('on');
  });
});

describe('probeFeedFlagIfDue — kararlı durum ve tekilleştirme', () => {
  it('sekme zaten açıksa hiç fetch atılmaz', async () => {
    mockGetMe.mockResolvedValue({});
    await probeFeedFlagIfDue(); // açtı
    mockGetMe.mockClear();
    await probeFeedFlagIfDue();
    expect(mockGetMe).not.toHaveBeenCalled();
  });

  it('pencere doluyken (başarılı probe sonrası kapalı latch) fetch atılmaz', async () => {
    mockGetMe.mockRejectedValue(codedError('UT-7301'));
    await probeFeedFlagIfDue();
    mockGetMe.mockClear();
    await probeFeedFlagIfDue();
    expect(mockGetMe).not.toHaveBeenCalled();
  });

  it('eşzamanlı çağrılar (boot + foreground yarışı) tek fetch\'e iner', async () => {
    let release!: () => void;
    mockGetMe.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const first = probeFeedFlagIfDue();
    const second = probeFeedFlagIfDue();
    release();
    await Promise.all([first, second]);
    expect(mockGetMe).toHaveBeenCalledTimes(1);
  });
});
