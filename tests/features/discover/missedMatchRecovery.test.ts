/**
 * Kaçırılan eşleşme kurtarma sözleşmesinin FE tarafı.
 *
 * İki şeyi kilitliyor:
 *   1. Gövdedeki DUMMY `swipeType` — uç `SwipeRequestDto` bind ediyor, alan
 *      `[Required]` ve `[ApiController]` validation'ı controller gövdesine
 *      GİRMEDEN çalışıyor. Alan düşerse istek `ValidationProblemDetails`
 *      biçiminde 400 döner, yani ortak zarf yolumuz o yanıtı tanımaz ve hata
 *      "kurtarılamadı" diye değil, jenerik bir çökme gibi görünür.
 *   2. Status → sonuç eşlemesi: 403 paywall (kota doldu), 400 ret (kota
 *      HARCANMADI, liste bayat), geri kalan geçici. Karıştırılırsa ya kota
 *      dolmadan paywall açılır ya da dolmuşken sessiz kalınır.
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

  it('treats 403 as the quota paywall and carries paywallType through', async () => {
    mockPost.mockRejectedValue(
      httpError(403, {
        isSuccess: false,
        message: 'Günlük kaçırılan match recovery hakkın doldu (2/gün).',
        result: {
          showPaywall: true,
          paywallType: 'MISSED_MATCH_RECOVERY_LIMIT',
          message: 'Günlük kaçırılan match recovery hakkın doldu (2/gün).',
        },
      }),
    );

    const outcome = await recoverMissedMatch('abc-123');

    expect(outcome.kind).toBe('paywall');
    expect((outcome as any).paywallType).toBe('MISSED_MATCH_RECOVERY_LIMIT');
    expect(outcome.message).toContain('hakkın doldu');
  });

  // 400 = kota harcanmadan reddedildi. Paywall'a çevirmek, hakkı DURURKEN
  // kullanıcıya satış ekranı açmak demek olurdu.
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

  // Premium kullanıcının kotası dolduğunda backend paywall AÇMIYOR
  // (showPaywall:false → 400): satacak bir şey yok, düz mesaj gösterilmeli.
  it('does not open a paywall for a premium user who ran out', async () => {
    mockPost.mockRejectedValue(
      httpError(400, {
        isSuccess: false,
        message: 'Günlük hakkın doldu.',
        result: { showPaywall: false, paywallType: null },
      }),
    );

    expect((await recoverMissedMatch('abc-123')).kind).toBe('rejected');
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
    });
    expect(page.totalProfiles).toBe(3);
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
