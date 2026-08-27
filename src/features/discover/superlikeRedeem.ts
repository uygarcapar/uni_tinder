import { API_ENDPOINTS } from "@/shared/constants/api";
import { REDEEM_CODES } from "@/shared/constants/responseCodes";
import { getRecentSuperlikeTransactions } from "@/features/profile/subscriptionService";
import {
  flushPendingRedeems,
  readPendingRedeems as readQueue,
  redeemConsumablePack,
  type ConsumableRedeemResult,
  type RedeemFlowConfig,
} from "@/features/discover/consumableRedeem";

/**
 * SuperLike paketi (consumable) → kredi dönüşümü.
 *
 * Kuyruk/retry/idempotans mekaniğinin TAMAMI consumableRedeem.ts'te; burada
 * yalnız bu ürünün sözleşmesi duruyor. Kurtarma paketi (recoveryRedeem.ts) aynı
 * motoru kullanıyor ama AYRI kuyruk anahtarı ve AYRI kod ailesiyle.
 */

export const SUPERLIKE_REDEEM_FLOW: RedeemFlowConfig = {
  kind: "superlike",
  endpoint: API_ENDPOINTS.SWIPE_SUPER_LIKE_REDEEM,
  codes: REDEEM_CODES,
  // ⛔ Kurtarma kuyruğununkinden FARKLI olmak zorunda — aynı anahtarı paylaşan
  // iki kuyruk birbirinin kayıtlarını yanlış uca yollar.
  queuePrefix: "superlikePendingRedeems",
  handledPrefix: "superlikeHandledTx",
  remainingField: "superLikesRemaining",
  purchasedField: "purchasedSuperLikes",
  statsRemainingField: "superLikesRemaining",
  statsPurchasedField: "purchasedSuperLikes",
  recentStoreTransactions: getRecentSuperlikeTransactions,
};

export {
  isPendingRedeemError,
  redeemUserKey,
  type PendingRedeem,
} from "@/features/discover/consumableRedeem";

/** Ürüne özel alan adlarıyla — çağıranlar (sheet, testler) bunu okuyor. */
export interface SuperlikeRedeemResult {
  creditsAdded: number;
  purchasedSuperLikes: number | null;
  superLikesRemaining: number | null;
  alreadyRedeemed: boolean;
}

const toSuperlikeResult = (r: ConsumableRedeemResult): SuperlikeRedeemResult => ({
  creditsAdded: r.creditsAdded,
  purchasedSuperLikes: r.purchasedCredits,
  superLikesRemaining: r.remaining,
  alreadyRedeemed: r.alreadyRedeemed,
});

export const readPendingRedeems = (userId: string) =>
  readQueue(SUPERLIKE_REDEEM_FLOW, userId);

export async function redeemSuperlikePack(args: {
  userId: string;
  transactionId: string;
  productId: string | null;
}): Promise<SuperlikeRedeemResult> {
  return toSuperlikeResult(
    await redeemConsumablePack(SUPERLIKE_REDEEM_FLOW, args),
  );
}

export const flushPendingSuperlikeRedeems = (
  userId: string | null | undefined,
) => flushPendingRedeems(SUPERLIKE_REDEEM_FLOW, userId);
