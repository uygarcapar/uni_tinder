/**
 * Akış kararları — sunucu state'i → görünüm eşlemesi.
 *
 * Test edilen asıl şey: istemcinin sunucunun kararını YENİDEN HESAPLAMAMASI.
 * En kritik satır `AlreadyMatched` vs anonim gönderi ayrımı: backend anonim
 * gönderide eşleşmiş kullanıcıya bile `Ok` döndürüyor (kimlik koruması) ve
 * istemci "ama ben bu kişiyle eşleşmişim" diye "Sohbete git" çizerse anonim
 * yazarın kim olduğunu ifşa eder. Bu yüzden eşleme YALNIZ `reply.state`e bakar,
 * `isAnonymous`/`author`a ASLA.
 *
 * İkinci kritik nokta `unknown` kapıları: `/feed/me` henüz gelmediğinde kilit
 * ÇİZİLMEMELİ. "Bilinmiyor" ile "hakkın yok" aynı şey değil — kısa yükleme
 * penceresinde kilit göstermek kullanıcıya olmayan bir kısıt uydurur
 * (usePremiumTier().resolved kuralının aynısı).
 */

import {
  anonymousGate,
  composeGate,
  dedupeById,
  postPresentation,
  statusBadgeFor,
  universityPickerGate,
  kindFilterGate,
} from '@/features/feed/feedPolicy';
import type {
  FeedMeDto,
  FeedPostDto,
  FeedQuotaDto,
  FeedReplyState,
} from '@/features/feed/feedTypes';

const NOW = Date.parse('2026-10-01T12:00:00Z');

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
  canPostAnonymously: true,
  anonymousLockReason: null,
  canPickUniversity: true,
  canUseKindFilter: true,
  restrictedUntil: null,
  isPermanentlyRestricted: false,
  postMaxLength: 400,
  replyMaxLength: 150,
  quota: quota(),
  ...over,
});

const post = (over: Partial<FeedPostDto> = {}): FeedPostDto => ({
  id: '1',
  body: 'gövde',
  createdAt: '2026-10-01T09:00:00Z',
  expiresAt: '2026-10-16T09:00:00Z',
  isAnonymous: false,
  authorCategory: null,
  author: null,
  likeCount: 0,
  likedByMe: false,
  isMine: false,
  status: 'Published',
  replyCount: null,
  reply: { state: 'Ok', conversationId: null },
  ...over,
});


describe('postPresentation — altı durum + süre', () => {
  it('Published ve süresi dolmamış → normal', () => {
    expect(postPresentation(post(), NOW)).toBe('normal');
  });

  it('Published ama expiresAt geçmişte → expired (status DEĞİL expiresAt karar verir)', () => {
    expect(
      postPresentation(
        post({ status: 'Published', expiresAt: '2026-09-20T09:00:00Z' }),
        NOW,
      ),
    ).toBe('expired');
  });

  it('geçersiz expiresAt → normal (okunamayan damga yüzünden "doldu" demeyiz)', () => {
    expect(
      postPresentation(post({ expiresAt: 'bozuk-tarih' }), NOW),
    ).toBe('normal');
  });

  it('PendingReview → pending', () => {
    expect(postPresentation(post({ status: 'PendingReview' }), NOW)).toBe('pending');
  });

  it('SupportHold → support', () => {
    expect(postPresentation(post({ status: 'SupportHold' }), NOW)).toBe('support');
  });

  it('HiddenByReports → hidden', () => {
    expect(postPresentation(post({ status: 'HiddenByReports' }), NOW)).toBe('hidden');
  });

  it('Rejected ve RemovedByAdmin → removed', () => {
    expect(postPresentation(post({ status: 'Rejected' }), NOW)).toBe('removed');
    expect(postPresentation(post({ status: 'RemovedByAdmin' }), NOW)).toBe('removed');
  });

  it('PendingReview süresi dolmuş görünse bile pending kalır (inceleme önce gelir)', () => {
    expect(
      postPresentation(
        post({ status: 'PendingReview', expiresAt: '2026-09-01T00:00:00Z' }),
        NOW,
      ),
    ).toBe('pending');
  });
});

/**
 * Durum rozeti — Gönderilerim kartının başlık satırı.
 *
 * ⚠️ REGRESYON: "expired" bir dönem null dönüyordu ("kalan-ömür satırında
 * zaten yazıyor" gerekçesiyle) ama o satır karttan KALDIRILMIŞTI — süresi
 * dolan gönderi hiçbir iz göstermeden akıştan kayboluyordu ve "Gönderilerim'de
 * var, akışta yok" diye bug sanılıyordu. Buradaki beklentiler o boşluğu
 * kilitliyor: rozet VAR, ton kırmızı, biçim YALNIZ İKON — kırmızı saat
 * (istek; pill ve düz metin denendi, geri alındı). `labelKey` ikonun
 * erişilebilirlik etiketi olarak yaşamaya devam ediyor.
 */
describe('statusBadgeFor', () => {
  it('süresi dolmuş gönderi → kırmızı SAAT ikonu (metinsiz)', () => {
    expect(
      statusBadgeFor(post({ expiresAt: '2026-09-20T09:00:00Z' }), NOW),
    ).toEqual({
      labelKey: 'feed.mine.expired',
      tone: 'danger',
      icon: 'clock',
    });
  });

  it('normal gönderi → rozet yok', () => {
    expect(statusBadgeFor(post(), NOW)).toBeNull();
  });

  it('PendingReview → nötr "İnceleniyor", metin (ikonsuz)', () => {
    expect(statusBadgeFor(post({ status: 'PendingReview' }), NOW)).toEqual({
      labelKey: 'feed.mine.status.PendingReview',
      tone: 'neutral',
      icon: null,
    });
  });

  it('SupportHold → nötr, HiddenByReports/Rejected/RemovedByAdmin → kırmızı', () => {
    expect(statusBadgeFor(post({ status: 'SupportHold' }), NOW)).toEqual({
      labelKey: 'feed.mine.status.SupportHold',
      tone: 'neutral',
      icon: null,
    });
    expect(statusBadgeFor(post({ status: 'HiddenByReports' }), NOW)).toEqual({
      labelKey: 'feed.mine.status.HiddenByReports',
      tone: 'danger',
      icon: null,
    });
    for (const status of ['Rejected', 'RemovedByAdmin'] as const) {
      expect(statusBadgeFor(post({ status }), NOW)).toEqual({
        labelKey: 'feed.mine.status.Rejected',
        tone: 'danger',
        icon: null,
      });
    }
  });
});

describe('composeGate', () => {
  it('me YOKSA unknown — kilit çizilmez', () => {
    expect(composeGate(undefined)).toEqual({ kind: 'unknown' });
    expect(composeGate(null)).toEqual({ kind: 'unknown' });
  });

  it('hak varsa open', () => {
    expect(composeGate(me())).toEqual({ kind: 'open' });
  });

  it('postsRemaining 0 → quotaExhausted, nextResetAt taşınır', () => {
    expect(composeGate(me({ quota: quota({ postsRemaining: 0 }) }))).toEqual({
      kind: 'quotaExhausted',
      nextResetAt: '2026-10-01T17:30:00Z',
    });
  });

  it('süreli kısıt kotadan ÖNCE gelir (yenilense de paylaşamayacak)', () => {
    const gate = composeGate(
      me({
        restrictedUntil: '2026-10-05T00:00:00Z',
        quota: quota({ postsRemaining: 0 }),
      }),
    );
    expect(gate).toEqual({
      kind: 'restricted',
      until: '2026-10-05T00:00:00Z',
      isPermanent: false,
    });
  });

  it('süresiz kısıt → until null, isPermanent true', () => {
    expect(composeGate(me({ isPermanentlyRestricted: true }))).toEqual({
      kind: 'restricted',
      until: null,
      isPermanent: true,
    });
  });

  it('süresiz kısıt, restrictedUntil dolu olsa bile süresiz kazanır', () => {
    const gate = composeGate(
      me({ isPermanentlyRestricted: true, restrictedUntil: '2026-10-05T00:00:00Z' }),
    );
    expect(gate).toEqual({ kind: 'restricted', until: null, isPermanent: true });
  });
});

describe('anonymousGate', () => {
  it('me yoksa unknown', () => {
    expect(anonymousGate(undefined)).toEqual({ kind: 'unknown' });
  });

  it('canPostAnonymously true → allowed (premium durumuna BAKILMAZ)', () => {
    // Kadın kullanıcı free olduğu halde anonim paylaşabiliyor; bu kapının
    // cevabı premium değil, sunucunun bayrağı.
    expect(anonymousGate(me({ canPostAnonymously: true }))).toEqual({
      kind: 'allowed',
    });
  });

  it('requiresPlus → FEED_ANONYMOUS paywall\'ı', () => {
    expect(
      anonymousGate(
        me({ canPostAnonymously: false, anonymousLockReason: 'requiresPlus' }),
      ),
    ).toEqual({ kind: 'paywall', paywallType: 'FEED_ANONYMOUS' });
  });

  it('restricted → pasif', () => {
    expect(
      anonymousGate(
        me({ canPostAnonymously: false, anonymousLockReason: 'restricted' }),
      ),
    ).toEqual({ kind: 'restricted' });
  });

  it('hak yok ama sebep de yok → restricted (olmayan satın almayı teklif etmeyiz)', () => {
    expect(
      anonymousGate(me({ canPostAnonymously: false, anonymousLockReason: null })),
    ).toEqual({ kind: 'restricted' });
  });

  it('canPostAnonymously true iken lockReason dolu gelse bile allowed (bayrak otorite)', () => {
    expect(
      anonymousGate(
        me({ canPostAnonymously: true, anonymousLockReason: 'requiresPlus' }),
      ),
    ).toEqual({ kind: 'allowed' });
  });
});

describe('filtre kapıları', () => {
  it('üniversite seçici: me yok → unknown, false → paywall, true → allowed', () => {
    expect(universityPickerGate(undefined)).toBe('unknown');
    expect(universityPickerGate(me({ canPickUniversity: false }))).toBe('paywall');
    expect(universityPickerGate(me({ canPickUniversity: true }))).toBe('allowed');
  });

  it('tip filtresi: me yok → unknown, false → paywall, true → allowed', () => {
    expect(kindFilterGate(null)).toBe('unknown');
    expect(kindFilterGate(me({ canUseKindFilter: false }))).toBe('paywall');
    expect(kindFilterGate(me({ canUseKindFilter: true }))).toBe('allowed');
  });
});

// `anonymousLabelKey` KALDIRILDI (istek): anonim etiketi artık sabit "Anonim".
// Kartın cinsiyet yazmadığı FeedPostCard.test.tsx'te kilitli — burada eşleniği
// yok çünkü geriye saf bir karar kalmadı.

describe('dedupeById — İLK görülen kazanır', () => {
  it('tekrar eden id ikinci kez eklenmez', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'a' }];
    expect(dedupeById(items)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('SONRADAN gelen kopya ÖNCEKİNİ EZMEZ — satır listede zıplamasın', () => {
    // popular/top'ta aynı gönderi ikinci sayfada güncel likeCount'la dönüyor.
    // Sonrakini tercih etsek satır yukarı kayar ve itemLayoutAnimation bunu
    // animasyonlayıp glitch gibi gösterir.
    const first = { id: 'a', likeCount: 10 };
    const second = { id: 'a', likeCount: 11 };
    expect(dedupeById([first, second])[0]).toBe(first);
  });

  it('sıra korunur', () => {
    const items = [{ id: 'c' }, { id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(dedupeById(items).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('boş dizi ve null öğeler patlatmaz', () => {
    expect(dedupeById([])).toEqual([]);
    expect(dedupeById([null as any, { id: 'a' }])).toEqual([{ id: 'a' }]);
  });
});
