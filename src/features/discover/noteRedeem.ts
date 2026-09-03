import { API_ENDPOINTS } from "@/shared/constants/api";
import { NOTE_REDEEM_CODES } from "@/shared/constants/responseCodes";
import { getRecentNoteTransactions } from "@/features/profile/subscriptionService";
import {
  flushPendingRedeems,
  readPendingRedeems as readQueue,
  redeemConsumablePack,
  type ConsumableRedeemResult,
  type RedeemFlowConfig,
} from "@/features/discover/consumableRedeem";

/**
 * Not paketi (consumable) → kredi dönüşümü.
 *
 * SuperLike paketiyle BİREBİR aynı akış (consumableRedeem.ts); ayrıştıkları tek
 * yer bu config. İki zorunlu ayrım:
 *
 *   1. Kuyruk anahtarı AYRI. Aynı MMKV anahtarını paylaşan iki kuyruk
 *      birbirinin transaction'ını yanlış uca yollar ve backend onu "bu satın
 *      alma bu hesaba ait değil" ile kalıcı düşürür — para gider, kredi gelmez.
 *   2. Kod ailesi UT-641x. SuperLike'ın UT-6101'ini burada "geçici" saymak
 *      YANLIŞ ürünün webhook'unu beklemek olurdu.
 *
 * ⚠️ Uç ve mağaza ürünleri henüz canlı değil (öneri dokümanı Faz 2). Akış
 * yazıldı, ürünler açılınca tek satır değişmeden çalışır.
 */

export const NOTE_REDEEM_FLOW: RedeemFlowConfig = {
  kind: "note",
  endpoint: API_ENDPOINTS.SWIPE_NOTE_REDEEM,
  codes: NOTE_REDEEM_CODES,
  queuePrefix: "notePendingRedeems",
  handledPrefix: "noteHandledTx",
  remainingField: "notesRemaining",
  purchasedField: "purchasedNotes",
  statsRemainingField: "notesRemaining",
  statsPurchasedField: "purchasedNotes",
  recentStoreTransactions: getRecentNoteTransactions,
};

export interface NoteRedeemResult {
  creditsAdded: number;
  purchasedNotes: number | null;
  notesRemaining: number | null;
  alreadyRedeemed: boolean;
}

const toNoteResult = (r: ConsumableRedeemResult): NoteRedeemResult => ({
  creditsAdded: r.creditsAdded,
  purchasedNotes: r.purchasedCredits,
  notesRemaining: r.remaining,
  alreadyRedeemed: r.alreadyRedeemed,
});

export const readPendingNoteRedeems = (userId: string) =>
  readQueue(NOTE_REDEEM_FLOW, userId);

export async function redeemNotePack(args: {
  userId: string;
  transactionId: string;
  productId: string | null;
}): Promise<NoteRedeemResult> {
  return toNoteResult(await redeemConsumablePack(NOTE_REDEEM_FLOW, args));
}

export const flushPendingNoteRedeems = (userId: string | null | undefined) =>
  flushPendingRedeems(NOTE_REDEEM_FLOW, userId);
