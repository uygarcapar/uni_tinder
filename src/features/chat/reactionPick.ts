/**
 * Reaction seçiminin saf (yan etkisiz) hesabı — "kullanıcı başına TEK reaction".
 *
 * Kural:
 *  - Farklı emoji seçilirse KENDİ reaction'ım değişir (eskisi silinir, yenisi eklenir).
 *  - Aynı emoji tekrar seçilirse kendi reaction'ım kalkar (toggle).
 *  - BAŞKA kullanıcıların reaction'larına dokunulmaz → farklı emoji atmışsak
 *    ikisi de listede kalır ve balonda yan yana çizilir; aynı emoji ise tek
 *    chip'te count 2 olur.
 *
 * "Benim" reaction'ım `userIds` ile bulunur (MessageReactionDto: emoji/count/userIds).
 * ChatScreen bunu optimistic state + hangi REST çağrılarının atılacağı için kullanır.
 */
export interface ReactionEntry {
  emoji: string;
  count?: number;
  userIds?: string[];
}

export interface ReactionPickResult {
  /** Optimistic olarak store'a yazılacak yeni liste. */
  next: ReactionEntry[];
  /** Varsa önce silinecek (kendi) emoji — replace'te eski, toggle'da aynısı. */
  removeEmoji: string | null;
  /** Varsa eklenecek emoji — toggle-off'ta null. */
  addEmoji: string | null;
}

export function applyReactionPick(
  prev: ReactionEntry[] | undefined | null,
  emoji: string,
  myUserId?: string,
): ReactionPickResult {
  const list = prev || [];
  const isMine = (r: ReactionEntry) =>
    !!myUserId && Array.isArray(r.userIds) && r.userIds.includes(myUserId);
  const mine = list.find(isMine);
  const isToggleOff = mine?.emoji === emoji;

  // Kendi reaction'ımı her ihtimalde çıkar; count 0'a düşen chip listeden silinir.
  // Diğer kullanıcıların girdileri olduğu gibi korunur.
  const stripped = list
    .map((r) =>
      isMine(r)
        ? {
            ...r,
            count: Math.max(0, (r.count || 1) - 1),
            userIds: (r.userIds || []).filter((id) => id !== myUserId),
          }
        : r,
    )
    .filter((r) => (r.count || 0) > 0);

  if (isToggleOff) {
    return { next: stripped, removeEmoji: emoji, addEmoji: null };
  }

  // Karşı taraf aynı emoji'yi atmışsa ayrı chip değil, aynı chip'te count artar.
  const existing = stripped.find((r) => r.emoji === emoji);
  const next = existing
    ? stripped.map((r) =>
        r.emoji === emoji
          ? {
              ...r,
              count: (r.count || 0) + 1,
              userIds: [...(r.userIds || []), ...(myUserId ? [myUserId] : [])],
            }
          : r,
      )
    : [...stripped, { emoji, count: 1, userIds: myUserId ? [myUserId] : [] }];

  return { next, removeEmoji: mine ? mine.emoji : null, addEmoji: emoji };
}
