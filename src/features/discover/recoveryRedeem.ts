import { API_ENDPOINTS } from "@/shared/constants/api";
import { RECOVERY_REDEEM_CODES } from "@/shared/constants/responseCodes";
import { getRecentRecoveryTransactions } from "@/features/profile/subscriptionService";
import {
  flushPendingRedeems,
  readPendingRedeems as readQueue,
  redeemConsumablePack,
  type ConsumableRedeemResult,
  type RedeemFlowConfig,
} from "@/features/discover/consumableRedeem";

/**
 * Kaçırılan eşleşme kurtarma paketi (consumable) → kredi dönüşümü.
 *
 * SuperLike paketiyle BİREBİR aynı akış (consumableRedeem.ts), iki farkla:
 *
 *   1. Kuyruk anahtarı AYRI. Aynı MMKV anahtarını paylaşsalardı bir ürünün
 *      açılış flush'ı diğerinin bekleyen transaction'ını kendi ucuna yollar ve
 *      "bu satın alma bu hesaba ait değil" ile kalıcı olarak düşürürdü.
 *   2. Hata kodu ailesi UT-62xx. Backend ikisini bilerek ayırdı; UT-6101'i
 *      burada "geçici" saymak yanlış ürünün webhook'unu beklemek olurdu.
 *
 * Kredi miktarı `productId`den DEĞİL, sunucudaki webhook kaydından türüyor —
 * gövdedeki productId yalnız log/uyuşmazlık tespiti için.
 */

export const RECOVERY_REDEEM_FLOW: RedeemFlowConfig = {
  kind: "recovery",
  endpoint: API_ENDPOINTS.SWIPE_RECOVERY_REDEEM,
  codes: RECOVERY_REDEEM_CODES,
  queuePrefix: "recoveryPendingRedeems",
  handledPrefix: "recoveryHandledTx",
  remainingField: "recoveriesRemaining",
  purchasedField: "purchasedRecoveries",
  // `/Stats` tarafındaki karşılıkları: toplam bakiye mevcut alanda kalıyor
  // (anlamı korunuyor), kredi ayrı alanda.
  statsRemainingField: "remainingMissedMatchRecovery",
  statsPurchasedField: "purchasedRecoveries",
  recentStoreTransactions: getRecentRecoveryTransactions,
};

export interface RecoveryRedeemResult {
  creditsAdded: number;
  purchasedRecoveries: number | null;
  recoveriesRemaining: number | null;
  alreadyRedeemed: boolean;
}

const toRecoveryResult = (r: ConsumableRedeemResult): RecoveryRedeemResult => ({
  creditsAdded: r.creditsAdded,
  purchasedRecoveries: r.purchasedCredits,
  recoveriesRemaining: r.remaining,
  alreadyRedeemed: r.alreadyRedeemed,
});

export const readPendingRecoveryRedeems = (userId: string) =>
  readQueue(RECOVERY_REDEEM_FLOW, userId);

export async function redeemRecoveryPack(args: {
  userId: string;
  transactionId: string;
  productId: string | null;
}): Promise<RecoveryRedeemResult> {
  return toRecoveryResult(
    await redeemConsumablePack(RECOVERY_REDEEM_FLOW, args),
  );
}

export const flushPendingRecoveryRedeems = (
  userId: string | null | undefined,
) => flushPendingRedeems(RECOVERY_REDEEM_FLOW, userId);
