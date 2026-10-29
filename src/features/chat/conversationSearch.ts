import { foldTr } from "@/shared/utils/foldTr";

export type ConversationSearchable = {
  partnerDisplayName?: string | null;
  lastMessagePreview?: string | null;
};

// `query` çağıran tarafından ÖNCEDEN `foldTr` ile katlanmış gelir (bkz.
// MessagesScreen > conversationsByTab): liste uzun olabilir, katlamayı satır
// başına tekrar etmek yerine sorgu bir kez katlanıp buraya aynen geçiliyor.
// Boşluk kontrolü yine de burada: boş/yalnız boşluk sorgu katlamadan da
// değişmez (FOLD_MAP boşluğa dokunmaz), yani trim her koşulda doğru çalışır.
export const conversationMatchesQuery = (
  conversation: ConversationSearchable,
  query: string,
): boolean => {
  if (!query.trim()) return true;
  return (
    foldTr(conversation.partnerDisplayName).includes(query) ||
    foldTr(conversation.lastMessagePreview).includes(query)
  );
};
