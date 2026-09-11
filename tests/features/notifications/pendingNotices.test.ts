import {
  createPendingNotices,
  noticeToastIcon,
  parsePendingNotices,
  toBanners,
  type PendingNotice,
} from '@/features/notifications/pendingNotices';

/**
 * Uygulama içi "hakkın geldi" haberleri.
 *
 * Asıl sözleşme: her haber TEK sefer çıkar. Backend işareti tutuyor; bu suite
 * mobilin "önce göster sonra işaretle", "davet ödülleri tek banner",
 * "banner'lar üst üste binmez" ve "push'tan açıldıysa tekrar gösterme"
 * kurallarını kilitliyor.
 */

const gift = (key = '4812'): any => ({
  kind: 'PremiumGift', key, type: 'Premium',
  title: 'Lit Plus hediyen hazır', body: '30 günlük Lit Plus', occurredAt: '2026-09-11T10:00:00Z',
});
const reward = (tier: number, type = 'VisibilityFilter'): any => ({
  kind: 'ReferralReward', key: String(tier), type,
  title: 'Davet ödülün hazır', body: `${tier * 3} arkadaşın katıldı`, occurredAt: '2026-09-11T10:05:00Z',
});
const ok = (items: any[]) => ({ isSuccess: true, result: items });

const setup = (response: any) => {
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const deps = {
    fetchUnseen: jest.fn(async () => response),
    markSeen: jest.fn(async (_items: any[]) => undefined),
    show: jest.fn(),
    open: jest.fn(),
    refresh: jest.fn(),
    schedule: jest.fn((fn: () => void, ms: number) => { scheduled.push({ fn, ms }); }),
  };
  return { deps, scheduled, notices: createPendingNotices(deps, 5500) };
};

describe('parsePendingNotices', () => {
  it('başarısız ya da boş cevapta boş liste', () => {
    expect(parsePendingNotices(null)).toEqual([]);
    expect(parsePendingNotices({ isSuccess: false, result: [gift()] })).toEqual([]);
    expect(parsePendingNotices(ok([]))).toEqual([]);
  });

  it('bilinmeyen türü ve bozuk satırı atar, sağlamları korur', () => {
    const parsed = parsePendingNotices(
      ok([gift(), { ...reward(1), title: '' }, { ...reward(2), kind: 'GelecektekiTur' }, reward(3)]),
    );
    expect(parsed.map((n) => `${n.kind}:${n.key}`)).toEqual(['PremiumGift:4812', 'ReferralReward:3']);
  });
});

describe('noticeToastIcon', () => {
  it('hediye premium, ödül kendi türünün simgesi', () => {
    expect(noticeToastIcon(gift())).toBe('premium');
    expect(noticeToastIcon(reward(1))).toBe('premium');
    expect(noticeToastIcon(reward(2, 'SuperLike'))).toBe('superLike');
    expect(noticeToastIcon(reward(3, 'Note'))).toBe('note');
  });
});

describe('toBanners', () => {
  it('davet ödülleri TEK banner (en yüksek kademe), hediye ayrı ve önce', () => {
    const banners = toBanners([reward(1), gift(), reward(2, 'SuperLike')] as PendingNotice[]);

    expect(banners).toHaveLength(2);
    expect(banners[0].display.kind).toBe('PremiumGift');
    expect(banners[1].display.key).toBe('2');
    expect(banners[1].refs.map((r) => r.key)).toEqual(['1', '2']);
  });
});

describe('createPendingNotices.check', () => {
  it('bekleyen haber yoksa hiçbir şey göstermez ve işaretlemez', async () => {
    const { deps, notices } = setup(ok([]));
    await notices.check();
    expect(deps.show).not.toHaveBeenCalled();
    expect(deps.markSeen).not.toHaveBeenCalled();
  });

  it('haberi gösterir, SONRA işaretler ve tazeler', async () => {
    const { deps, notices } = setup(ok([gift()]));
    await notices.check();

    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(deps.refresh).toHaveBeenCalled();
    expect(deps.markSeen).toHaveBeenCalledWith([{ kind: 'PremiumGift', key: '4812' }]);
    expect(deps.show.mock.invocationCallOrder[0]).toBeLessThan(deps.markSeen.mock.invocationCallOrder[0]);
  });

  it('ikinci banner birincinin üstüne binmez — gecikmeyle gösterilir, o ana kadar işaretlenmez', async () => {
    const { deps, scheduled, notices } = setup(ok([gift(), reward(1)]));
    await notices.check();

    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].ms).toBe(5500);
    expect(deps.markSeen).toHaveBeenCalledTimes(1);

    scheduled[0].fn();
    expect(deps.show).toHaveBeenCalledTimes(2);
    expect(deps.show.mock.calls[1][0].kind).toBe('ReferralReward');
    expect(deps.markSeen).toHaveBeenLastCalledWith([{ kind: 'ReferralReward', key: '1' }]);
  });

  it('banner\'a dokunma o haberin hedefini açar', async () => {
    const { deps, notices } = setup(ok([gift()]));
    await notices.check();

    deps.show.mock.calls[0][1]();
    expect(deps.open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'PremiumGift' }));
  });

  it('aynı oturumda ikinci kontrol aynı haberi tekrar göstermez', async () => {
    const { deps, notices } = setup(ok([gift()]));
    await notices.check();
    await notices.check();
    expect(deps.show).toHaveBeenCalledTimes(1);
  });

  it('push\'tan açılan ödül kademesi için banner çıkmaz', async () => {
    const { deps, notices } = setup(ok([reward(1)]));
    // Push verisinde kademe string geliyor (relatedEntityId).
    notices.markSeen('ReferralReward', '1');
    await notices.check();

    expect(deps.show).not.toHaveBeenCalled();
    expect(deps.markSeen).toHaveBeenCalledWith([{ kind: 'ReferralReward', key: '1' }]);
  });

  it('boş anahtarla işaretleme istek atmaz', () => {
    const { deps, notices } = setup(ok([]));
    notices.markSeen('ReferralReward', undefined);
    notices.markSeen('ReferralReward', '  ');
    expect(deps.markSeen).not.toHaveBeenCalled();
  });

  it('eşzamanlı iki kontrol tek istek atar', async () => {
    const { deps, notices } = setup(ok([gift()]));
    await Promise.all([notices.check(), notices.check()]);
    expect(deps.fetchUnseen).toHaveBeenCalledTimes(1);
  });

  it('ağ hatası sessiz kalır', async () => {
    const { deps, notices } = setup(null);
    deps.fetchUnseen.mockRejectedValueOnce(new Error('offline'));
    await expect(notices.check()).resolves.toBeUndefined();
    expect(deps.show).not.toHaveBeenCalled();
  });
});
