/**
 * Akış cache yazımları — kota merge'i, çapraz-sorgu beğeni yaması, satır düşürme.
 *
 * Test edilen asıl şey KOTA MERGE'İ. Mutation yanıtı yalnız `quota` taşıyor,
 * `/me`'nin diğer alanlarını (canPostAnonymously, postMaxLength,
 * restrictedUntil…) TAŞIMIYOR. Düz replace yapılsaydı composer kapıları ve FAB
 * sıfırlanırdı: `composeGate` `restrictedUntil: undefined` okuyup KISITLI
 * kullanıcıya açık FAB çizerdi.
 *
 * İkinci kritik nokta: isabet YOKSA referansın korunması. `setQueriesData` her
 * eşleşen sorguya dokunuyor; yeni nesne döndürmek gönderinin bulunmadığı
 * sorguları da yeniden render ettirirdi.
 */

import { QueryClient } from '@tanstack/react-query';
import { feedKeys } from '@/features/feed/feedKeys';
import {
  patchPostInCaches,
  removePostFromCaches,
  writeFeedQuota,
  writeFeedQuotaExhausted,
} from '@/features/feed/feedQueries';
import type {
  FeedListParams,
  FeedMeDto,
  FeedPostDto,
  FeedQuotaDto,
} from '@/features/feed/feedTypes';

const quota = (over: Partial<FeedQuotaDto> = {}): FeedQuotaDto => ({
  postsRemaining: 2,
  repliesRemaining: 2,
  postLimit: 2,
  replyLimit: 2,
  nextResetAt: '2026-10-01T17:30:00Z',
  ...over,
});

const me = (over: Partial<FeedMeDto> = {}): FeedMeDto => ({
  universityDomain: 'itu.edu.tr',
  canPostAnonymously: false,
  anonymousLockReason: 'requiresPlus',
  canPickUniversity: false,
  canUseKindFilter: false,
  restrictedUntil: '2026-10-09T00:00:00Z',
  isPermanentlyRestricted: false,
  postMaxLength: 400,
  replyMaxLength: 150,
  quota: quota(),
  ...over,
});

const post = (id: string, over: Partial<FeedPostDto> = {}): FeedPostDto =>
  ({
    id,
    body: 'g',
    createdAt: '2026-10-01T09:00:00Z',
    expiresAt: '2026-10-16T09:00:00Z',
    isAnonymous: false,
    authorCategory: null,
    author: null,
    likeCount: 5,
    likedByMe: false,
    isMine: false,
    status: 'Published',
    replyCount: null,
    reply: { state: 'Ok', conversationId: null },
    ...over,
  }) as FeedPostDto;

const PARAMS_NEW: FeedListParams = {
  university: null,
  sort: 'new',
  interest: 'all',
  kind: 'all',
};
const PARAMS_TOP: FeedListParams = {
  university: null,
  sort: 'top',
  interest: 'all',
  kind: 'all',
};

const infinite = (items: FeedPostDto[]) => ({
  pages: [{ items, nextCursor: null, page: 1, hasMore: false }],
  pageParams: [{ mode: 'cursor', cursor: null }],
});

let qc: QueryClient;
beforeEach(() => {
  qc = new QueryClient({
    // `gcTime: Infinity` → QueryClient çöp toplama setTimeout'u kurmasın.
    // Varsayılan 5 dk'lık timer jest'in event loop'unu ayakta tutuyor ve
    // koşu "Force exiting" olmadan bitmiyor.
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

afterEach(() => {
  qc.clear();
});

describe('writeFeedQuota — MERGE, replace değil', () => {
  it('kotayı yazar, /me\'nin DİĞER alanlarını korur', () => {
    qc.setQueryData(feedKeys.me, me());
    writeFeedQuota(qc, quota({ postsRemaining: 1 }));

    const next = qc.getQueryData<FeedMeDto>(feedKeys.me)!;
    expect(next.quota.postsRemaining).toBe(1);
    // Düz replace bu alanları undefined bırakırdı → kısıtlı kullanıcıya açık FAB.
    expect(next.restrictedUntil).toBe('2026-10-09T00:00:00Z');
    expect(next.canPostAnonymously).toBe(false);
    expect(next.anonymousLockReason).toBe('requiresPlus');
    expect(next.postMaxLength).toBe(400);
    expect(next.canPickUniversity).toBe(false);
  });

  it('quota undefined/null → no-op', () => {
    const original = me();
    qc.setQueryData(feedKeys.me, original);
    writeFeedQuota(qc, undefined);
    writeFeedQuota(qc, null);
    expect(qc.getQueryData(feedKeys.me)).toBe(original);
  });

  it('/me cache\'i YOKSA yarım nesne SENTEZLEMEZ', () => {
    // Kotadan FeedMeDto uydurmak composeGate'e eksik alan okutur.
    writeFeedQuota(qc, quota());
    expect(qc.getQueryData(feedKeys.me)).toBeUndefined();
  });
});

describe('writeFeedQuotaExhausted — UT-7304/7322 (hata gövdesinden yazılan tek yer)', () => {
  it('gönderi kotası 0\'lanır, YANIT kotasına dokunulmaz', () => {
    qc.setQueryData(feedKeys.me, me({ quota: quota() }));
    writeFeedQuotaExhausted(qc, 'post', '2026-10-02T17:30:00Z');

    const next = qc.getQueryData<FeedMeDto>(feedKeys.me)!;
    expect(next.quota.postsRemaining).toBe(0);
    expect(next.quota.repliesRemaining).toBe(2);
    expect(next.quota.nextResetAt).toBe('2026-10-02T17:30:00Z');
    // Tavanlar bozulmasın — sayaç "0/2" göstermeye devam etsin.
    expect(next.quota.postLimit).toBe(2);
  });

  it('yanıt kotası 0\'lanır, GÖNDERİ kotasına dokunulmaz', () => {
    qc.setQueryData(feedKeys.me, me({ quota: quota() }));
    writeFeedQuotaExhausted(qc, 'reply', null);

    const next = qc.getQueryData<FeedMeDto>(feedKeys.me)!;
    expect(next.quota.repliesRemaining).toBe(0);
    expect(next.quota.postsRemaining).toBe(2);
  });

  it('nextResetAt gelmezse eldeki değer korunur (saat uydurulmaz)', () => {
    qc.setQueryData(feedKeys.me, me({ quota: quota({ nextResetAt: '2026-10-01T17:30:00Z' }) }));
    writeFeedQuotaExhausted(qc, 'post', null);
    expect(qc.getQueryData<FeedMeDto>(feedKeys.me)!.quota.nextResetAt).toBe(
      '2026-10-01T17:30:00Z',
    );
  });

  it('/me yoksa no-op', () => {
    writeFeedQuotaExhausted(qc, 'post', null);
    expect(qc.getQueryData(feedKeys.me)).toBeUndefined();
  });
});

describe('patchPostInCaches — çapraz sorgu yaması', () => {
  it('aynı gönderiyi İKİ ayrı filtre sorgusunda ve Gönderilerim\'de birden yamalar', () => {
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), infinite([post('1'), post('2')]));
    qc.setQueryData(feedKeys.posts(PARAMS_TOP), infinite([post('1')]));
    qc.setQueryData(feedKeys.mine, infinite([post('1')]));

    patchPostInCaches(qc, '1', (p) => ({ ...p, likedByMe: true, likeCount: 6 }));

    const read = (key: any) =>
      (qc.getQueryData(key) as any).pages[0].items.find((i: any) => i.id === '1');
    expect(read(feedKeys.posts(PARAMS_NEW)).likeCount).toBe(6);
    expect(read(feedKeys.posts(PARAMS_TOP)).likeCount).toBe(6);
    expect(read(feedKeys.mine).likeCount).toBe(6);
  });

  it('yamalanmayan gönderi AYNI referansta kalır', () => {
    const untouched = post('2');
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), infinite([post('1'), untouched]));
    patchPostInCaches(qc, '1', (p) => ({ ...p, likedByMe: true }));

    const items = (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items;
    expect(items[1]).toBe(untouched);
  });

  it('isabet YOKSA sorgunun referansı korunur (gereksiz render yok)', () => {
    const data = infinite([post('1')]);
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), data);
    patchPostInCaches(qc, 'yok-böyle-id', (p) => ({ ...p, likedByMe: true }));
    expect(qc.getQueryData(feedKeys.posts(PARAMS_NEW))).toBe(data);
  });

  it('infinite olmayan / bozuk cache şeklinde patlamaz', () => {
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), { nope: true } as any);
    expect(() =>
      patchPostInCaches(qc, '1', (p) => ({ ...p, likedByMe: true })),
    ).not.toThrow();
  });
});

describe('removePostFromCaches', () => {
  it('gönderiyi tüm liste cache\'lerinden düşürür', () => {
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), infinite([post('1'), post('2')]));
    qc.setQueryData(feedKeys.mine, infinite([post('1')]));

    removePostFromCaches(qc, '1');

    const feedItems = (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items;
    const mineItems = (qc.getQueryData(feedKeys.mine) as any).pages[0].items;
    expect(feedItems.map((i: any) => i.id)).toEqual(['2']);
    expect(mineItems).toEqual([]);
  });

  it('bulunmayan id referansı değiştirmez', () => {
    const data = infinite([post('1')]);
    qc.setQueryData(feedKeys.mine, data);
    removePostFromCaches(qc, '9');
    expect(qc.getQueryData(feedKeys.mine)).toBe(data);
  });
});

describe('optimistic beğeni — anlık yazım + sunucu düzeltmesi', () => {
  it('iyimser artış, sonra sunucu değeri EZER', () => {
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), infinite([post('1', { likeCount: 5 })]));

    // onMutate
    patchPostInCaches(qc, '1', (p) => ({
      ...p,
      likedByMe: true,
      likeCount: Math.max(0, p.likeCount + 1),
    }));
    let item = (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items[0];
    expect(item.likeCount).toBe(6);

    // onSuccess — PUT idempotent, iki hızlı basışta tahmin sapabilir.
    patchPostInCaches(qc, '1', (p) => ({ ...p, likeCount: 13, likedByMe: true }));
    item = (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items[0];
    expect(item.likeCount).toBe(13);
  });

  it('beğeni geri alımında sayı 0\'ın altına inmez', () => {
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), infinite([post('1', { likeCount: 0 })]));
    patchPostInCaches(qc, '1', (p) => ({
      ...p,
      likedByMe: false,
      likeCount: Math.max(0, p.likeCount - 1),
    }));
    const item = (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items[0];
    expect(item.likeCount).toBe(0);
  });

  it('rollback snapshot\'taki DEĞERİ birebir geri getirir', () => {
    const original = infinite([post('1', { likeCount: 5 })]);
    qc.setQueryData(feedKeys.posts(PARAMS_NEW), original);

    // onMutate'in snapshot'ı: iki key ailesi birden (postsRoot + mine).
    const snapshot = qc.getQueriesData({ queryKey: feedKeys.postsRoot });
    patchPostInCaches(qc, '1', (p) => ({ ...p, likedByMe: true, likeCount: 6 }));
    expect(
      (qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any).pages[0].items[0].likeCount,
    ).toBe(6);

    // onError
    snapshot.forEach(([k, d]) => qc.setQueryData(k, d));

    // ⚠️ `toBe` DEĞİL `toEqual`: React Query'nin structural sharing'i geri
    // yazımda yeni bir üst nesne üretiyor. Önemli olan DEĞERİN dönmesi.
    const restored = qc.getQueryData(feedKeys.posts(PARAMS_NEW)) as any;
    expect(restored).toEqual(original);
    expect(restored.pages[0].items[0].likeCount).toBe(5);
    expect(restored.pages[0].items[0].likedByMe).toBe(false);
  });
});
