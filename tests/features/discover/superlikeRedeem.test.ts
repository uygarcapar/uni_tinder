/**
 * Redeem sözleşmesinin FE tarafı: 402 = "webhook henüz inmedi, tekrar dene",
 * 400 = kalıcı, geri kalan her şey kuyrukta kalır. Buradaki testlerin ortak
 * sözü şu: **parası alınmış bir satın alma sessizce düşmez.**
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

const mockPost = jest.fn();
jest.mock('@/shared/services/api', () => ({
  __esModule: true,
  default: { post: (...args: any[]) => mockPost(...args) },
}));

const mockRecentTransactions = jest.fn(async () => [] as any[]);
jest.mock('@/features/profile/subscriptionService', () => ({
  __esModule: true,
  getRecentSuperlikeTransactions: () => mockRecentTransactions(),
}));

import {
  redeemSuperlikePack,
  flushPendingSuperlikeRedeems,
  readPendingRedeems,
  isPendingRedeemError,
  redeemUserKey,
} from '@/features/discover/superlikeRedeem';

const USER = 'user-1';
const TX = 'tx-1';

/** Backend gerçek HTTP status kullanıyor → axios reject, `response.status`. */
const httpError = (status: number, message?: string, code?: string) => {
  const err: any = new Error(`status ${status}`);
  err.response = {
    status,
    data: { ...(message ? { message } : {}), ...(code ? { code } : {}) },
  };
  return err;
};

const okResponse = (result: Record<string, unknown>) => ({
  isSuccess: true,
  result,
});

beforeEach(() => {
  mockMemoryStore.clear();
  mockPost.mockReset();
  mockRecentTransactions.mockReset();
  mockRecentTransactions.mockResolvedValue([]);
});

describe('redeemSuperlikePack', () => {
  it('402 sonrası 3 sn bekleyip tekrar dener ve krediyi döner', async () => {
    jest.useFakeTimers();
    mockPost
      .mockRejectedValueOnce(httpError(402))
      .mockResolvedValueOnce(
        okResponse({
          creditsAdded: 10,
          purchasedSuperLikes: 12,
          superLikesRemaining: 15,
          alreadyRedeemed: false,
        }),
      );

    const promise = redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'superlike_10',
    });
    await jest.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(result.creditsAdded).toBe(10);
    expect(result.superLikesRemaining).toBe(15);
    expect(readPendingRedeems(USER)).toHaveLength(0);
    jest.useRealTimers();
  });

  it('ikinci 402 sonrası transaction kuyruğa alınır ve pending hatası atar', async () => {
    jest.useFakeTimers();
    mockPost.mockRejectedValue(httpError(402));

    // catch'i timer'ları ilerletmeden ÖNCE bağla: reject fake timer tick'inde
    // düşüyor, handler sonra bağlanırsa unhandled rejection uyarısı çıkar.
    const settled = redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'superlike_10',
    }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(3000);
    const error = await settled;

    expect(isPendingRedeemError(error)).toBe(true);
    expect(readPendingRedeems(USER)).toEqual([
      {
        transactionId: TX,
        productId: 'superlike_10',
        attempts: 0,
        // Yaş sınırı bu damgadan işliyor (bkz. MAX_AGE_MS).
        firstSeenAt: expect.any(Number),
      },
    ]);
    jest.useRealTimers();
  });

  it('400 kalıcı hatadır: retry edilmez, kuyruğa da alınmaz', async () => {
    mockPost.mockRejectedValue(httpError(400, 'Geçersiz ürün'));

    const error = await redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'bozuk_urun',
    }).catch((e) => e);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(isPendingRedeemError(error)).toBe(false);
    expect(error.message).toBe('Geçersiz ürün');
    expect(readPendingRedeems(USER)).toHaveLength(0);
  });

  it('aynı transaction ikinci kez redeem edilirse hata değil, güncel bakiye döner', async () => {
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 0,
        purchasedSuperLikes: 12,
        superLikesRemaining: 15,
        alreadyRedeemed: true,
      }),
    );

    const result = await redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'superlike_10',
    });

    expect(result.alreadyRedeemed).toBe(true);
    expect(result.creditsAdded).toBe(0);
    expect(result.superLikesRemaining).toBe(15);
  });

  it('404 (endpoint henüz deploy edilmedi) kalıcı sayılmaz, kuyrukta kalır', async () => {
    jest.useFakeTimers();
    mockPost.mockRejectedValue(httpError(404));

    const settled = redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'superlike_5',
    }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(3000);
    const error = await settled;

    expect(isPendingRedeemError(error)).toBe(true);
    expect(readPendingRedeems(USER)).toHaveLength(1);
    jest.useRealTimers();
  });
});

describe('flushPendingSuperlikeRedeems', () => {
  const queue = (entries: unknown[]) =>
    mockMemoryStore.set(`superlikePendingRedeems:${USER}`, JSON.stringify(entries));

  it('kuyruktaki kayıt başarılı olunca kuyruktan düşer', async () => {
    queue([{ transactionId: TX, productId: 'superlike_10', attempts: 1 }]);
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 10,
        purchasedSuperLikes: 10,
        superLikesRemaining: 11,
        alreadyRedeemed: false,
      }),
    );

    await flushPendingSuperlikeRedeems(USER);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(readPendingRedeems(USER)).toHaveLength(0);
  });

  it('402 devam ederse kayıt kalır, deneme sayacı artar (açılışta beklemez)', async () => {
    const firstSeenAt = Date.now() - 60_000;
    queue([{ transactionId: TX, productId: 'superlike_10', attempts: 1, firstSeenAt }]);
    mockPost.mockRejectedValue(httpError(402));

    await flushPendingSuperlikeRedeems(USER);

    // Satın alma anındaki 3 sn'lik retry burada YOK — tek deneme.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(readPendingRedeems(USER)).toEqual([
      { transactionId: TX, productId: 'superlike_10', attempts: 2, firstSeenAt },
    ]);
  });

  // Sözleşmenin kalbi: sınır AÇILIŞ SAYISI değil SÜRE. Backend arızasında
  // kullanıcı uygulamayı 50 kez açsa da parası alınmış satın alma düşmez.
  it('çok denenmiş ama taze kayıt düşürülmez', async () => {
    queue([
      {
        transactionId: TX,
        productId: 'superlike_10',
        attempts: 40,
        firstSeenAt: Date.now() - 6 * 24 * 60 * 60 * 1000,
      },
    ]);
    mockPost.mockRejectedValue(httpError(402));

    await flushPendingSuperlikeRedeems(USER);

    expect(readPendingRedeems(USER)).toHaveLength(1);
  });

  it('bir haftayı geçen kayıt düşürülür (retry artık çözmüyor)', async () => {
    queue([
      {
        transactionId: TX,
        productId: 'superlike_10',
        attempts: 2,
        firstSeenAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      },
    ]);
    mockPost.mockRejectedValue(httpError(402));

    await flushPendingSuperlikeRedeems(USER);

    expect(readPendingRedeems(USER)).toHaveLength(0);
  });

  it('damgasız eski kayıt düşürülmez, o turda damgalanır', async () => {
    queue([{ transactionId: TX, productId: 'superlike_10', attempts: 7 }]);
    mockPost.mockRejectedValue(httpError(402));

    await flushPendingSuperlikeRedeems(USER);

    const [entry] = readPendingRedeems(USER);
    expect(entry).toBeDefined();
    expect(entry.firstSeenAt).toEqual(expect.any(Number));
  });

  it('kuyruk boşken ve RC geçmişi boşken hiç istek atmaz', async () => {
    await flushPendingSuperlikeRedeems(USER);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('RC cihaz geçmişindeki satın alma kuyruğa alınıp redeem edilir', async () => {
    // Uygulama satın alma ile kuyruğa yazma arasında öldürülmüş senaryo.
    mockRecentTransactions.mockResolvedValue([
      { transactionId: 'tx-rc', productId: 'superlike_20', purchaseDate: null },
    ]);
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 20,
        purchasedSuperLikes: 20,
        superLikesRemaining: 21,
        alreadyRedeemed: false,
      }),
    );

    await flushPendingSuperlikeRedeems(USER);

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      transactionId: 'tx-rc',
      productId: 'superlike_20',
    });
    expect(readPendingRedeems(USER)).toHaveLength(0);

    // Sonuçlanmış transaction ikinci açılışta tekrar kuyruğa girmemeli.
    mockPost.mockClear();
    await flushPendingSuperlikeRedeems(USER);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('userId yoksa hiçbir şey yapmaz', async () => {
    await flushPendingSuperlikeRedeems(null);
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// Backend 2026-08-11'de "başka hesaba ait" durumunu 402'den 400 + UT-6103'e
// taşıdı. Karar artık `code`'dan veriliyor; status yalnız kod gelmediğinde
// (eski backend sürümü) fallback.
describe('redeem hata kodları (UT-61xx)', () => {
  it('UT-6103 (başka hesaba ait) kalıcıdır — kuyruğa alınmaz', async () => {
    mockPost.mockRejectedValue(
      httpError(400, 'Bu satın alma bu hesaba ait değil.', 'UT-6103'),
    );

    await expect(
      redeemSuperlikePack({ userId: USER, transactionId: TX, productId: 'superlike_10' }),
    ).rejects.toMatchObject({ redeemCode: 'PERMANENT' });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(readPendingRedeems(USER)).toHaveLength(0);
  });

  it('UT-6102 (ürün tanımsız) kalıcıdır ve mesajı koddan gelir', async () => {
    mockPost.mockRejectedValue(httpError(400, undefined, 'UT-6102'));

    await expect(
      redeemSuperlikePack({ userId: USER, transactionId: TX, productId: 'superlike_99' }),
    ).rejects.toMatchObject({
      redeemCode: 'PERMANENT',
      message: 'Bu paket şu an tanımlı değil',
    });
    expect(readPendingRedeems(USER)).toHaveLength(0);
  });

  it('UT-6101 tek geçici durumdur — kuyrukta kalır', async () => {
    jest.useFakeTimers();
    mockPost.mockRejectedValue(
      httpError(402, 'Satın alma henüz doğrulanmadı.', 'UT-6101'),
    );

    const promise = redeemSuperlikePack({
      userId: USER,
      transactionId: TX,
      productId: 'superlike_10',
    });
    const assertion = expect(promise).rejects.toMatchObject({
      redeemCode: 'PENDING_WEBHOOK',
    });
    await jest.advanceTimersByTimeAsync(3000);
    await assertion;

    expect(readPendingRedeems(USER)).toHaveLength(1);
    jest.useRealTimers();
  });

  it('kod göndermeyen eski backend sürümünde status ile karar verilir', async () => {
    mockPost.mockRejectedValue(httpError(400));

    await expect(
      redeemSuperlikePack({ userId: USER, transactionId: TX, productId: null }),
    ).rejects.toMatchObject({ redeemCode: 'PERMANENT' });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe('redeemUserKey', () => {
  it('backend `userId` ya da `id` döndürse de aynı anahtarı üretir', () => {
    expect(redeemUserKey({ userId: '42' })).toBe('42');
    expect(redeemUserKey({ id: '42' })).toBe('42');
    expect(redeemUserKey(null)).toBeNull();
  });
});
