/**
 * Keşif'ten verilen karar, o kişinin AKIŞ SATIRLARINDAKİ not butonunu kapatıyor
 * mu — "like attım, akıştaki not butonu hâlâ duruyor" raporunun testi.
 *
 * ⚠️ İKİ AYRI KAPI VAR ve bu testin konusu İKİNCİSİ:
 *   • Yazar KARTI (gönderiye dokununca açılan modal) → `feedCardActions`,
 *     girdisi `ProfileCardDto.myLikeDate`. Bu kapı zaten kapanıyor
 *     (bkz. swipeAuthorCardFreshness.test).
 *   • Akış SATIRI (listedeki not butonu) → `postNoteButtonVisible`, girdisi
 *     `FeedPostDto.note.state`. Satır `myLikeDate`i HİÇ OKUMUYOR (kapıyı sunucu
 *     `state`e katlıyor, bkz. feedPostNote), yani kart yaması satırı
 *     kurtarmıyor.
 *
 * Satırdaki `state` sayfa çekildiğinde donmuş bir anlık görüntü ve akış listesi
 * kendiliğinden tazelenmiyor (`refetchOnMount: false`, odakta refetch yok) —
 * tek onarım yolu pull-to-refresh. Bu yüzden karar anında İYİMSER yama şart:
 * yoksa kullanıcı Keşif'ten beğendiği kişinin gönderisinde duran butona basıyor
 * ve sunucudan `UT-6404 ALREADY_SWIPED` yiyor. Tam olarak kaçındığımız ölü
 * buton.
 *
 * Değer `AlreadySwiped` — sunucunun bir sonraki çekimde göndereceği kelimenin
 * AYNISI (sözleşme: backend_feed_post_note_2026-10-30 §3.1).
 */

const mockLikeUser = jest.fn();
const mockFireUser = jest.fn();
const mockPassUser = jest.fn();
const mockSendNote = jest.fn();

jest.mock('@/shared/services/api', () => ({ __esModule: true, default: {} }));
jest.mock('@/features/discover/swipeService', () => ({
  __esModule: true,
  default: {
    likeUser: (...args: unknown[]) => mockLikeUser(...args),
    fireUser: (...args: unknown[]) => mockFireUser(...args),
    passUser: (...args: unknown[]) => mockPassUser(...args),
    sendNote: (...args: unknown[]) => mockSendNote(...args),
  },
}));

// react-redux ESM-only geliyor (bkz. swipeMode.test). Mutasyonun state'ten
// istediği tek şey mod anahtarının kullanıcı kimliği.
jest.mock('react-redux', () => ({
  useSelector: (fn: any) => fn({ auth: { user: { id: 'me-1' } } }),
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNoteMutation,
  useSwipeMutation,
} from '@/features/discover/swipeQueries';
import { photoNoteTarget } from '@/features/discover/noteTarget';
import { feedKeys } from '@/features/feed/feedKeys';
import { FEED_MODE as FEED } from '@/features/feed/feedMode';
import { postNoteButtonVisible } from '@/features/feed/feedPostNote';
import type { FeedListParams, FeedPostDto } from '@/features/feed/feedTypes';

const TARGET = 'author-1';
const OTHER = 'author-2';

const OK = { isSuccess: true, result: {} };

const PARAMS: FeedListParams = {
  university: null,
  sort: 'new',
  interest: 'all',
  kind: 'all',
  topics: [],
};

const post = (id: string, authorId: string | null): FeedPostDto =>
  ({
    id,
    body: 'g',
    createdAt: '2026-11-01T09:00:00Z',
    expiresAt: '2026-11-16T09:00:00Z',
    isAnonymous: authorId == null,
    authorCategory: null,
    author: authorId
      ? ({
          userId: authorId,
          name: 'Esra',
          age: 21,
          mainPhotoUrl: null,
          universityDisplay: null,
        } as any)
      : null,
    likeCount: 3,
    likedByMe: false,
    isMine: false,
    status: 'Published',
    replyCount: null,
    reply: { state: 'Ok', conversationId: null },
    // Satırdaki kapı AÇIK: sunucu bu çekimde "not atılabilir" demiş.
    note: { state: 'Ok', availableModes: ['Dating', 'Friends'] },
  }) as FeedPostDto;

const infinite = (items: FeedPostDto[]) => ({
  pages: [{ items, nextCursor: null, page: 1, hasMore: false }],
  pageParams: [{ mode: 'cursor', cursor: null }],
});

let qc: QueryClient;

const seedFeed = () => {
  // Hedefin İKİ gönderisi var: not kişi başına tek gittiği için ikisi de
  // kapanmalı. Üçüncü satır BAŞKA yazarın — dokunulmamalı.
  qc.setQueryData(
    feedKeys.posts(PARAMS),
    infinite([post('p1', TARGET), post('p2', TARGET), post('p3', OTHER)]),
  );
};

const rows = (): FeedPostDto[] =>
  (qc.getQueryData(feedKeys.posts(PARAMS)) as any).pages[0].items;

const renderSwipe = () =>
  renderHook(() => useSwipeMutation(), {
    wrapper: ({ children }: any) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });

const renderNote = () =>
  renderHook(() => useNoteMutation(), {
    wrapper: ({ children }: any) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });

beforeEach(() => {
  qc = new QueryClient({
    // `gcTime: Infinity` → çöp toplama timer'ı jest'in event loop'unu ayakta
    // tutmasın (feedCache.test'teki aynı gerekçe).
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false, gcTime: Infinity },
    },
  });
  mockLikeUser.mockReset().mockResolvedValue(OK);
  mockFireUser.mockReset().mockResolvedValue(OK);
  mockPassUser.mockReset().mockResolvedValue(OK);
  mockSendNote.mockReset().mockResolvedValue({ isSuccess: true, result: {} });
  seedFeed();
});

afterEach(() => {
  qc.clear();
});

describe('karar sonrası akış satırındaki not butonu', () => {
  it('beğeni, YAZARIN TÜM satırlarını kapatıyor; başkasınınkine dokunmuyor', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('AlreadySwiped');
    expect(rows()[1].note?.state).toBe('AlreadySwiped');
    expect(rows()[2].note?.state).toBe('Ok');
  });

  it('kapanan satırda buton ARTIK ÇİZİLMİYOR (kapının kendisi)', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Asıl sözleşme bu: yama `state` yazmakla kalmıyor, UI kapısını da kapatıyor.
    expect(postNoteButtonVisible(rows()[0])).toBe(false);
    expect(postNoteButtonVisible(rows()[2])).toBe(true);
  });

  it('Fire de kapatıyor (Fire bir beğeni)', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'up', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('AlreadySwiped');
  });

  /**
   * ⚠️ BEĞENİ KAPISI MOD KAPSAMLI (backend teyidi 2026-11-05): sunucu beğeniyi
   * `SwipeAction`a kendi modunun altına yazıyor ve `note.state`i o kapsamda
   * hesaplıyor. Flört'te verilen bir beğeniden sonra ARKADAŞ'taki satır `Ok`
   * kalıyor VE not gönderimi de geçiyor (NoteHandler'ın dup kapısı da aynı mod
   * kapsamlı çağrıyı kullanıyor, `Notes` tablosunun modsuz unique'ine hiç
   * dokunulmuyor).
   *
   * Yani koşulsuz yamak ölü buton değil ama SESSİZ KAYIP üretirdi:
   * gönderilebilir bir notun butonunu gizlerdi.
   */
  it('FLÖRT modundaki beğeni Arkadaş satırlarını KAPATMIYOR', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET, mode: 'Dating' } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('Ok');
    expect(postNoteButtonVisible(rows()[0])).toBe(true);
  });

  /**
   * Mod `variables`ta yoksa mutasyonun SUNUCUYA GÖNDERDİĞİ değere düşülüyor
   * (`loadAppMode`) — iki yerin ayrışması yanlış kapsamı yamalardı. Diskte
   * seçim yokken varsayılan bu build'in tek modu (Arkadaş), yani kapanmalı.
   */
  it('mod verilmediğinde diskteki seçime düşüyor (seçim yokken Arkadaş → kapanır)', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('AlreadySwiped');
  });

  /**
   * ⚠️ PASS KAPATMIYOR — `myLikeDate` yamasındaki ("left" hariç) kuralın
   * aynısı. Sözleşmede `AlreadySwiped`in tanımı "yazara daha önce BEĞENİ/NOT
   * gitmiş"; geçmek beğeni değil. Yanlış tarafa düşmenin bedeli asimetrik:
   * fazladan kapatmak gönderilebilir bir notu SESSİZCE saklar, eksik
   * bırakmaksa yalnız bir sonraki tazelemeye kadar sürer.
   */
  it('pass satırları KAPATMIYOR', async () => {
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'left', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('Ok');
  });

  /**
   * Reddedilen karar (hedef pasif/bloklu/mod kapalı: `isSuccess:false`) sunucuda
   * swipe satırı DOĞURMUYOR — kapatmak, hiç olmamış bir kararı kalıcıymış gibi
   * göstermek olurdu.
   */
  it('reddedilen swipe satırları kapatmıyor', async () => {
    mockLikeUser.mockResolvedValue({ isSuccess: false, code: 'UT-2305' });
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('Ok');
  });

  /**
   * ⚠️ NOT, BEĞENİDEN FARKLI: modsuz. `Notes` tablosunda modsuz
   * `UNIQUE(ActorId, TargetId)` var ve sunucu satırın kapısını da modsuz
   * okuyor (`NoteAlreadySent`) — Flört'te gönderilen bir not ARKADAŞ'taki
   * satırı da kapatıyor. Gönderim tarafı tutarlı: ikinci not unique ihlaline
   * düşüp UT-6404 dönüyor, kredi iade ediliyor. (Backend teyidi 2026-11-05.)
   *
   * Bu yüzden burada mod koşulu YOK — bilerek Flört'te gönderiyoruz.
   */
  it('Keşif’ten gönderilen NOT, modu ne olursa olsun satırları kapatıyor', async () => {
    const { result } = renderNote();
    result.current.mutate({
      userId: TARGET,
      comment: 'selam',
      target: photoNoteTarget(0),
      mode: 'Dating',
    } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('AlreadySwiped');
    expect(rows()[1].note?.state).toBe('AlreadySwiped');
    expect(rows()[2].note?.state).toBe('Ok');
  });

  /**
   * ANONİM satır yazarsız geliyor (`author: null`) — eşleşme yalnız dolu
   * `userId` üzerinden, yoksa kimliği açığa çıkaran bir yan etki doğardı.
   */
  it('anonim satıra dokunmuyor', async () => {
    qc.setQueryData(feedKeys.posts(PARAMS), infinite([post('p9', null)]));
    const { result } = renderSwipe();
    result.current.mutate({ direction: 'right', userId: TARGET, mode: FEED } as any);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rows()[0].note?.state).toBe('Ok');
  });
});
