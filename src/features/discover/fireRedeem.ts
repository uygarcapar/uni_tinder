import { API_ENDPOINTS } from "@/shared/constants/api";
import { REDEEM_CODES } from "@/shared/constants/responseCodes";
import { getRecentFireTransactions } from "@/features/profile/subscriptionService";
import {
  flushPendingRedeems,
  readPendingRedeems as readQueue,
  redeemConsumablePack,
  type ConsumableRedeemResult,
  type RedeemFlowConfig,
} from "@/features/discover/consumableRedeem";

/**
 * Fire paketi (consumable) → kredi dönüşümü.
 *
 * Kuyruk/retry/idempotans mekaniğinin TAMAMI consumableRedeem.ts'te; burada
 * yalnız bu ürünün sözleşmesi duruyor. Not paketi (noteRedeem.ts) aynı motoru
 * kullanıyor ama AYRI kuyruk anahtarı ve AYRI kod ailesiyle.
 */

export const FIRE_REDEEM_FLOW: RedeemFlowConfig = {
  kind: "fire",
  endpoint: API_ENDPOINTS.SWIPE_FIRE_REDEEM,
  codes: REDEEM_CODES,
  // ⛔ Not kuyruğununkinden FARKLI olmak zorunda — aynı anahtarı paylaşan iki
  // kuyruk birbirinin kayıtlarını yanlış uca yollar.
  queuePrefix: "superlikePendingRedeems",
  handledPrefix: "superlikeHandledTx",
  remainingField: "superLikesRemaining",
  purchasedField: "purchasedSuperLikes",
  statsRemainingField: "superLikesRemaining",
  statsPurchasedField: "purchasedSuperLikes",
  recentStoreTransactions: getRecentFireTransactions,
};

export {
  isPendingRedeemError,
  redeemUserKey,
  type PendingRedeem,
} from "@/features/discover/consumableRedeem";

/** Ürüne özel alan adlarıyla — çağıranlar (sheet, testler) bunu okuyor. */
export interface FireRedeemResult {
  creditsAdded: number;
  purchasedSuperLikes: number | null;
  superLikesRemaining: number | null;
  alreadyRedeemed: boolean;
}

const toFireResult = (r: ConsumableRedeemResult): FireRedeemResult => ({
  creditsAdded: r.creditsAdded,
  purchasedSuperLikes: r.purchasedCredits,
  superLikesRemaining: r.remaining,
  alreadyRedeemed: r.alreadyRedeemed,
});

export const readPendingRedeems = (userId: string) =>
  readQueue(FIRE_REDEEM_FLOW, userId);

export async function redeemFirePack(args: {
  userId: string;
  transactionId: string;
  productId: string | null;
}): Promise<FireRedeemResult> {
  return toFireResult(
    await redeemConsumablePack(FIRE_REDEEM_FLOW, args),
  );
}

export const flushPendingFireRedeems = (
  userId: string | null | undefined,
) => flushPendingRedeems(FIRE_REDEEM_FLOW, userId);
