/**
 * Akış sayfalaması — TEK infinite query, İKİ mod.
 *
 * Test edilen asıl şey: cursor otoritesinin `lastPageParam` olması. `lastPage`in
 * kendi sayfa numarasına güvenmek swipeQueries'te somut bir kaza üretmişti:
 * backend alanı göndermediğinde her sayfa aynı numarada çakılıyor, aynı sayfa
 * tekrar append ediliyor, dedupe hepsini eliyor ve sonsuz fetch döngüsü doğuyor.
 *
 * İkinci kritik kural: BOŞ SAYFA TERMİNAL — `hasMore:true` gelse bile. Öğe
 * eklenmiyorsa devam etmek sadece döngü besler.
 *
 * `getNextPageParam` hook'un içinde tanımlı olduğu için burada aynı sözleşmeyi
 * taşıyan saf bir kopyası test ediliyor; hook'un kendisini render etmek
 * (QueryClientProvider + mock transport) bu kuralları DAHA AZ net gösterirdi.
 * Kopyanın kaymaması için `useFeedPosts`un gövdesiyle birlikte güncellenmeli.
 */

import { dedupeById } from '@/features/feed/feedPolicy';
import type { FeedPageParam } from '@/features/feed/feedQueries';
import type { FeedPostPageDto } from '@/features/feed/feedTypes';

/** feedQueries > useFeedPosts > getNextPageParam ile AYNI mantık. */
function nextPageParam(
  usesCursor: boolean,
  lastPage: FeedPostPageDto,
  lastPageParam: FeedPageParam,
): FeedPageParam | undefined {
  if (!lastPage?.hasMore) return undefined;
  if ((lastPage.items?.length ?? 0) === 0) return undefined;
  if (usesCursor) {
    if (!lastPage.nextCursor) return undefined;
    return { mode: 'cursor', cursor: lastPage.nextCursor };
  }
  const prev = lastPageParam?.mode === 'page' ? lastPageParam.page : 0;
  return { mode: 'page', page: prev + 1 };
}

const page = (over: Partial<FeedPostPageDto> = {}): FeedPostPageDto => ({
  items: [{ id: 'a' } as any],
  nextCursor: 'MTc1OTEz',
  page: 1,
  hasMore: true,
  ...over,
});

describe('cursor modu (sort=new)', () => {
  const CURSOR: FeedPageParam = { mode: 'cursor', cursor: null };

  it('nextCursor varsa onu taşır', () => {
    expect(nextPageParam(true, page({ nextCursor: 'abc' }), CURSOR)).toEqual({
      mode: 'cursor',
      cursor: 'abc',
    });
  });

  it('hasMore false → durur', () => {
    expect(nextPageParam(true, page({ hasMore: false }), CURSOR)).toBeUndefined();
  });

  it('nextCursor null → durur (hasMore true olsa bile)', () => {
    expect(
      nextPageParam(true, page({ nextCursor: null, hasMore: true }), CURSOR),
    ).toBeUndefined();
  });

  it('BOŞ SAYFA TERMİNAL — hasMore true ve cursor dolu olsa bile', () => {
    expect(
      nextPageParam(
        true,
        page({ items: [], hasMore: true, nextCursor: 'abc' }),
        CURSOR,
      ),
    ).toBeUndefined();
  });

  it('cursor modunda page numarası HİÇ kullanılmaz', () => {
    const out = nextPageParam(true, page({ page: 99, nextCursor: 'abc' }), CURSOR);
    expect(out).toEqual({ mode: 'cursor', cursor: 'abc' });
  });
});

describe('page modu (sort=popular|top)', () => {
  it('lastPageParam+1 kullanır', () => {
    expect(nextPageParam(false, page(), { mode: 'page', page: 3 })).toEqual({
      mode: 'page',
      page: 4,
    });
  });

  it('⚠️ lastPage.page\'e ASLA güvenmez — sonsuz döngünün kaynağı', () => {
    // Backend alanı göndermezse (page: null) lastPage'e bakan bir kod her
    // seferinde aynı numarayı üretir ve döngü doğar.
    const out = nextPageParam(false, page({ page: null }), { mode: 'page', page: 5 });
    expect(out).toEqual({ mode: 'page', page: 6 });

    // Backend yanlış/bayat bir numara gönderse de param kazanır.
    const out2 = nextPageParam(false, page({ page: 1 }), { mode: 'page', page: 7 });
    expect(out2).toEqual({ mode: 'page', page: 8 });
  });

  it('hasMore false → durur', () => {
    expect(
      nextPageParam(false, page({ hasMore: false }), { mode: 'page', page: 2 }),
    ).toBeUndefined();
  });

  it('BOŞ SAYFA TERMİNAL', () => {
    expect(
      nextPageParam(false, page({ items: [], hasMore: true }), {
        mode: 'page',
        page: 2,
      }),
    ).toBeUndefined();
  });

  it('page modunda nextCursor yokluğu sayfalamayı DURDURMAZ', () => {
    // popular/top'ta backend nextCursor göndermiyor; cursor kuralını buraya
    // uygulamak ikinci sayfayı hiç çekmemek olurdu.
    expect(
      nextPageParam(false, page({ nextCursor: null }), { mode: 'page', page: 1 }),
    ).toEqual({ mode: 'page', page: 2 });
  });

  it('param modu bozuk gelirse 1\'den başlar (0+1)', () => {
    expect(
      nextPageParam(false, page(), { mode: 'cursor', cursor: 'x' } as FeedPageParam),
    ).toEqual({ mode: 'page', page: 1 });
  });
});

describe('select tekilleştirmesi — sayfalar arası tekrar', () => {
  it('popular/top\'ta aynı gönderi iki sayfada dönerse bir kez görünür', () => {
    const pages: FeedPostPageDto[] = [
      page({ items: [{ id: 'a' }, { id: 'b' }] as any }),
      page({ items: [{ id: 'b' }, { id: 'c' }] as any }),
    ];
    const items = dedupeById(pages.flatMap((p) => p.items));
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('İLK görülen kazanır — satır listede yukarı zıplamasın', () => {
    const stale = { id: 'b', likeCount: 10 };
    const fresh = { id: 'b', likeCount: 42 };
    const pages: FeedPostPageDto[] = [
      page({ items: [{ id: 'a' }, stale] as any }),
      page({ items: [fresh] as any }),
    ];
    const items = dedupeById(pages.flatMap((p) => p.items)) as any[];
    expect(items[1]).toBe(stale);
    expect(items[1].likeCount).toBe(10);
  });

  it('items alanı eksik gelen sayfa patlatmaz', () => {
    const pages = [page(), { ...page(), items: undefined as any }];
    const items = dedupeById(pages.flatMap((p) => p.items ?? []));
    expect(items).toHaveLength(1);
  });
});
