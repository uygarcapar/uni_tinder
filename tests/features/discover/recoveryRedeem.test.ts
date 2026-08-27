/**
 * Kurtarma paketi redeem'i — SuperLike'la AYNI motor, AYRI durum.
 *
 * Buradaki testlerin koruduğu iki şey:
 *   1. Kuyruk anahtarı SuperLike'ınkinden farklı. Aynı MMKV anahtarını
 *      paylaşsalardı bir ürünün açılış flush'ı diğerinin transaction'ını kendi
 *      ucuna yollar ve backend onu "ürün tanımsız" ile KALICI düşürürdü —
 *      parası alınmış bir satın alma yok olurdu.
 *   2. Kod ailesi UT-62xx. Yalnız 402/UT-6201 geçici; 400'ler retry edilirse
 *      sonuçsuz döngü olur.
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

const mockRecentRecovery = jest.fn(async () => [] as any[]);
const mockRecentSuperlike = jest.fn(async () => [] as any[]);
jest.mock('@/features/profile/subscriptionService', () => ({
  __esModule: true,
  getRecentRecoveryTransactions: () => mockRecentRecovery(),
  getRecentSuperlikeTransactions: () => mockRecentSuperlike(),
}));

const mockSetQueryData = jest.fn();
jest.mock('@/shared/queries/queryClient', () => ({
  __esModule: true,
  queryClient: {
    setQueryData: (...args: any[]) => mockSetQueryData(...args),
    refetchQueries: jest.fn(async () => {}),
  },
}));

import { API_ENDPOINTS } from '@/shared/constants/api';
import {
  redeemRecoveryPack,
  flushPendingRecoveryRedeems,
  readPendingRecoveryRedeems,
} from '@/features/discover/recoveryRedeem';
import {
  flushPendingSuperlikeRedeems,
  readPendingRedeems as readSuperlikeQueue,
} from '@/features/discover/superlikeRedeem';
import { isPendingRedeemError } from '@/features/discover/consumableRedeem';

const USER = 'user-1';
const TX = 'tx-rec-1';

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
  mockSetQueryData.mockReset();
  mockRecentRecovery.mockReset();
  mockRecentRecovery.mockResolvedValue([]);
  mockRecentSuperlike.mockReset();
  mockRecentSuperlike.mockResolvedValue([]);
});

describe('redeemRecoveryPack', () => {
  it('kendi ucuna gider ve kurtarma alan adlarını okur', async () => {
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 3,
        purchasedRecoveries: 3,
        recoveriesRemaining: 3,
        alreadyRedeemed: false,
      }),
    );

    const result = await redeemRecoveryPack({
      userId: USER,
      transactionId: TX,
      productId: 'recovery_3',
    });

    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.SWIPE_RECOVERY_REDEEM, {
      transactionId: TX,
      productId: 'recovery_3',
    });
    expect(result).toEqual({
      creditsAdded: 3,
      purchasedRecoveries: 3,
      recoveriesRemaining: 3,
      alreadyRedeemed: false,
    });
  });

  it('bakiyeyi /Stats cache’inde kurtarma alanlarına yazar', async () => {
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 10,
        purchasedRecoveries: 10,
        recoveriesRemaining: 12,
        alreadyRedeemed: false,
      }),
    );

    await redeemRecoveryPack({
      userId: USER,
      transactionId: TX,
      productId: 'recovery_10',
    });

    const updater = mockSetQueryData.mock.calls[0][1];
    // Toplam mevcut alanda (anlamı korunuyor), kredi ayrı alanda. SuperLike
    // alanlarına DOKUNULMAMALI.
    expect(updater({ remainingMissedMatchRecovery: 2, superLikesRemaining: 4 })).toEqual({
      remainingMissedMatchRecovery: 12,
      purchasedRecoveries: 10,
      superLikesRemaining: 4,
    });
  });

  it('UT-6201 (webhook yarışı) geçicidir — kuyrukta kalır', async () => {
    jest.useFakeTimers();
    mockPost.mockRejectedValue(
      httpError(402, 'Satın alma henüz doğrulanmadı.', 'UT-6201'),
    );

    const settled = redeemRecoveryPack({
      userId: USER,
      transactionId: TX,
      productId: 'recovery_3',
    }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(3000);
    const error = await settled;

    expect(isPendingRedeemError(error)).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(readPendingRecoveryRedeems(USER)).toHaveLength(1);
    jest.useRealTimers();
  });

  it.each([
    ['UT-6202', 'Bu paket şu an tanımlı değil'],
    ['UT-6203', 'Bu satın alma bu hesaba ait değil'],
  ])('%s kalıcıdır — retry edilmez, kuyruğa alınmaz', async (code, title) => {
    mockPost.mockRejectedValue(httpError(400, undefined, code));

    await expect(
      redeemRecoveryPack({ userId: USER, transactionId: TX, productId: 'recovery_3' }),
    ).rejects.toMatchObject({ redeemCode: 'PERMANENT', message: title });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(readPendingRecoveryRedeems(USER)).toHaveLength(0);
  });

  it('SuperLike’ın kalıcı kodu (UT-6103) buraya düşse de retry edilmez', async () => {
    // Backend yanlış aileden kod yollarsa bile 400 kalıcı: sonuçsuz döngü
    // üretmemek, doğru metni göstermekten önemli.
    mockPost.mockRejectedValue(httpError(400, undefined, 'UT-6103'));

    await expect(
      redeemRecoveryPack({ userId: USER, transactionId: TX, productId: 'recovery_1' }),
    ).rejects.toMatchObject({ redeemCode: 'PERMANENT' });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe('kuyruk izolasyonu', () => {
  it('kurtarma kuyruğu SuperLike kuyruğundan AYRI anahtarda durur', async () => {
    jest.useFakeTimers();
    mockPost.mockRejectedValue(httpError(402));

    const settled = redeemRecoveryPack({
      userId: USER,
      transactionId: TX,
      productId: 'recovery_3',
    }).catch((e) => e);
    await jest.advanceTimersByTimeAsync(3000);
    await settled;
    jest.useRealTimers();

    expect(readPendingRecoveryRedeems(USER)).toHaveLength(1);
    // Kritik: SuperLike kuyruğu BOŞ kalmalı.
    expect(readSuperlikeQueue(USER)).toHaveLength(0);
    expect(mockMemoryStore.has(`recoveryPendingRedeems:${USER}`)).toBe(true);
    expect(mockMemoryStore.has(`superlikePendingRedeems:${USER}`)).toBe(false);
  });

  it('SuperLike flush’ı kurtarma kuyruğuna dokunmaz', async () => {
    mockMemoryStore.set(
      `recoveryPendingRedeems:${USER}`,
      JSON.stringify([
        { transactionId: TX, productId: 'recovery_3', attempts: 0, firstSeenAt: Date.now() },
      ]),
    );

    await flushPendingSuperlikeRedeems(USER);

    // Kurtarma kaydı SuperLike ucuna GİTMEMELİ (gitse backend "ürün tanımsız"
    // ile kalıcı düşürür, kredi yok olur).
    expect(mockPost).not.toHaveBeenCalled();
    expect(readPendingRecoveryRedeems(USER)).toHaveLength(1);
  });

  it('flush cihaz geçmişini KENDİ ürün filtresiyle tarar', async () => {
    mockRecentRecovery.mockResolvedValue([
      { transactionId: 'tx-rc', productId: 'recovery_10', purchaseDate: null },
    ]);
    mockPost.mockResolvedValue(
      okResponse({
        creditsAdded: 10,
        purchasedRecoveries: 10,
        recoveriesRemaining: 10,
        alreadyRedeemed: false,
      }),
    );

    await flushPendingRecoveryRedeems(USER);

    expect(mockRecentSuperlike).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(API_ENDPOINTS.SWIPE_RECOVERY_REDEEM, {
      transactionId: 'tx-rc',
      productId: 'recovery_10',
    });
    expect(readPendingRecoveryRedeems(USER)).toHaveLength(0);

    // Sonuçlanmış transaction ikinci açılışta tekrar kuyruğa girmemeli.
    mockPost.mockClear();
    await flushPendingRecoveryRedeems(USER);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
