/**
 * Kaçırılan eşleşme kurtarma sözleşmesinin FE tarafı.
 *
 * İki şeyi kilitliyor:
 *   1. Gövdedeki DUMMY `swipeType` — uç `SwipeRequestDto` bind ediyor, alan
 *      `[Required]` ve `[ApiController]` validation'ı controller gövdesine
 *      GİRMEDEN çalışıyor. Alan düşerse istek `ValidationProblemDetails`
 *      biçiminde 400 döner, yani ortak zarf yolumuz o yanıtı tanımaz ve hata
 *      "kurtarılamadı" diye değil, jenerik bir çökme gibi görünür.
 *   2. Status → sonuç eşlemesi: 403 paywall (KULLANICI FREE — kurtarma
 *      2026-08-31'den beri premium ayrıcalığı), 400 ret (premium'un uygunsuz
 *      hedefi, liste bayat), geri kalan geçici. Karıştırılırsa ya aboneye satış
 *      ekranı açılır ya da free'ye dokunuş sessizce ölür.
 *   3. Kart şekli: kilidi açan sinyaller (SuperLike / not / `hasLikedMe`)
 *      taşınmazsa "Kaçırdıkların" kartları blur'un yanlış tarafında kalır.
 */

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: {
    post: (...args: any[]) => mockPost(...args),
    get: (...args: any[]) => mockGet(...args),
  },
}));

import {
  fetchMissedMatches,
  recoverMissedMatch,
} from '@/features/discover/missedMatchRecovery';

/** Recover gerçek HTTP status kullanıyor → axios reject. */
const httpError = (status: number, data: any) => {
  const err: any = new Error(`status ${status}`);
  err.response = { status, data };
  return err;
};

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
});

describe('recoverMissedMatch', () => {
  it('sends a body that both the old and the new backend DTO accept', async () => {
    mockPost.mockResolvedValue({ isSuccess: true, result: { isMatch: true } });

    await recoverMissedMatch('abc-123');

    expect(mockPost).toHaveBeenCalledWith('/api/swipe/RecoverMissedMatch', {
      targetUserId: 'abc-123',
      // Eski DTO'da `[Required]` + regex, yenisinde opsiyonel ve okunmuyor.
      // Göndermek iki sürümde de geçerli olan tek gövde — deploy'un hangi
      // tarafta olduğuna bakmadan çalışıyor.
      swipeType: 'like',
    });
  });

  it('reports a recovered match', async () => {
    mockPost.mockResolvedValue({
      isSuccess: true,
      message: 'Match recovered! 💞',
      result: { isMatch: true, matchedUser: null },
    });

    const outcome = await recoverMissedMatch('abc-123');

    expect(outcome.kind).toBe('recovered');
    expect((outcome as any).isMatch).toBe(true);
  });

  // 403 artık TEK bir şey demek: kullanıcı free. Premium'un tükenebilecek bir
  // kotası yok, yani abone bu dala hiç düşmüyor.
  it('treats 403 as the premium paywall and carries paywallType through', async () => {
    mockPost.mockRejectedValue(
      httpError(403, {
        isSuccess: false,
        message:
          "Kurtarma Premium'a özel. Seni beğenenleri görmek ve kaçırdıklarını kurtarmak için Premium'a geç.",
        result: {
          showPaywall: true,
          // ⚠️ Sözleşme metninde `MissedMatchRecoveryLimit` yazıyor ama telde
          // dönen ve bu istemcinin tanıdığı yazım SCREAMING_SNAKE. `paywallType`
          // DEĞİŞMEDİ — mevcut yönlendirme çalışmaya devam ediyor, tek fark
          // hedefin artık paket değil abonelik olması.
          paywallType: 'MISSED_MATCH_RECOVERY_LIMIT',
          message: "Kurtarma Premium'a özel.",
        },
      }),
    );

    const outcome = await recoverMissedMatch('abc-123');

    expect(outcome.kind).toBe('paywall');
    expect((outcome as any).paywallType).toBe('MISSED_MATCH_RECOVERY_LIMIT');
    expect(outcome.message).toContain("Premium'a özel");
  });

  // 400 = hedef uygun değil. Paywall'a çevirmek, kurtarma hakkı OLAN bir aboneye
  // satış ekranı açmak demek olurdu.
  it('treats 400 as a rejection, not a paywall', async () => {
    mockPost.mockRejectedValue(
      httpError(400, {
        isSuccess: false,
        message: 'Bu kullanıcıyı pas geçmemişsin. Normal Like akışını kullan.',
        result: { showPaywall: false, paywallType: null },
      }),
    );

    const outcome = await recoverMissedMatch('abc-123');

    expect(outcome.kind).toBe('rejected');
    expect(outcome.message).toContain('pas geçmemişsin');
  });

  it('folds a vanished user (404) into the same rejection path', async () => {
    mockPost.mockRejectedValue(
      httpError(404, { isSuccess: false, message: 'Kullanıcı bulunamadı' }),
    );

    expect((await recoverMissedMatch('abc-123')).kind).toBe('rejected');
  });

  it('keeps transient failures separate so the list is not thrown away', async () => {
    mockPost.mockRejectedValue(httpError(500, {}));
    expect((await recoverMissedMatch('abc-123')).kind).toBe('error');

    mockPost.mockRejectedValue(new Error('Network Error'));
    expect((await recoverMissedMatch('abc-123')).kind).toBe('error');
  });
});

describe('fetchMissedMatches', () => {
  it('maps ProfileCardDto to the shared like-card shape', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: {
        profiles: [
          {
            profileId: 12,
            userId: 'abc-123',
            displayName: 'Zeynep',
            age: 21,
            photos: ['https://example.test/1.jpg'],
            universityName: 'Test Üniversitesi',
            isPremium: false,
            hasLikedMe: true,
            likedMeAt: '2026-08-10T12:00:00Z',
            isSuperLike: true,
          },
        ],
        totalProfiles: 3,
        currentPage: 1,
        hasNextPage: false,
      },
    });

    const page = await fetchMissedMatches();

    expect(mockGet).toHaveBeenCalledWith(
      '/api/swipe/MissedMatches?pageNumber=1&pageSize=20',
    );
    expect(page.profiles[0]).toEqual({
      id: 'mm_12',
      userId: 'abc-123',
      name: 'Zeynep',
      age: 21,
      universityName: 'Test Üniversitesi',
      mainPhoto: 'https://example.test/1.jpg',
      likedAt: '2026-08-10T12:00:00Z',
      isSuperLike: true,
      isPremium: false,
      isNote: false,
      note: null,
      hasLikedMe: true,
    });
    expect(page.totalProfiles).toBe(3);
  });

  /**
   * 2026-08-31 REGRESYONU — kullanıcının bildirdiği yol tam olarak buydu.
   *
   * Free kullanıcı, kendisini normal beğeniyle beğenmiş birini keşifte pas
   * geçiyor; kişi "Kaçırdıkların"a düşüyor ve orada NET görünüyordu, çünkü kart
   * kilit sinyallerini hiç taşımıyordu ve ekran ayrıca blur'u tümden kapatıyordu
   * (`alwaysClear`). Aynı kişi "Seni Beğenenler"de bulanıktı: iki ekran, iki
   * kural. Sunucu maskeleme yapmadığı için blur'un tek dayanağı bu alanlar.
   */
  it('carries the unlock signals so a plain like stays blurred for free users', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: {
        profiles: [
          {
            profileId: 7,
            userId: 'plain-like',
            displayName: 'Elif',
            age: 22,
            photos: ['https://example.test/2.jpg'],
            universityName: 'Test Üniversitesi',
            isPremium: false,
            // Free + normal beğeni → backend bu ikisini bilerek kısıyor.
            hasLikedMe: false,
            likedMeAt: null,
            isSuperLike: false,
          },
        ],
        totalProfiles: 1,
        currentPage: 1,
        hasNextPage: false,
      },
    });

    const card = (await fetchMissedMatches()).profiles[0];

    // Kilidi açacak TEK bir sinyal bile yok → kart blur'lu çizilmeli.
    expect(card.hasLikedMe).toBe(false);
    expect(card.isSuperLike).toBe(false);
    expect(card.isNote).toBe(false);
    expect(card.note).toBeNull();
  });

  // Not, SuperLike gibi ödenmiş bir görünürlük: gönderen karşı taraf kendisini
  // görebilsin diye ödedi. Alan taşınmazsa Beğenenler'de açık olan not kartı
  // burada bulanık kalır — aynı çatallanmanın aynası.
  it('carries a note through so the sender stays visible', async () => {
    mockGet.mockResolvedValue({
      isSuccess: true,
      result: {
        profiles: [
          {
            profileId: 9,
            userId: 'note-sender',
            displayName: 'Deniz',
            age: 23,
            photos: ['https://example.test/3.jpg'],
            universityName: 'Test Üniversitesi',
            isPremium: false,
            hasLikedMe: false,
            isSuperLike: false,
            isNote: true,
            note: {
              noteId: 41,
              comment: '  Bu fotoğraf harika  ',
              sentAt: '2026-08-30T09:00:00Z',
              target: { kind: 'Photo', photoUrl: 'https://example.test/3.jpg' },
            },
          },
        ],
        totalProfiles: 1,
        currentPage: 1,
        hasNextPage: false,
      },
    });

    const card = (await fetchMissedMatches()).profiles[0];

    expect(card.isNote).toBe(true);
    expect(card.note?.comment).toBe('Bu fotoğraf harika');
    expect(card.note?.target?.kind).toBe('Photo');
  });

  // Boş/eksik gövde listeyi çökertmemeli — ekran bu durumda "kaçırdığın kimse
  // yok" boş durumuna düşer, bir sonraki girişte yeniden dener.
  it('falls back to an empty page when the envelope is not successful', async () => {
    mockGet.mockResolvedValue({ isSuccess: false });

    const page = await fetchMissedMatches();

    expect(page.profiles).toEqual([]);
    expect(page.totalProfiles).toBe(0);
  });
});
