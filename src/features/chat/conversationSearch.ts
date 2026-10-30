import { foldTr } from "@/shared/utils/foldTr";

export type ConversationSearchable = {
  partnerDisplayName?: string | null;
  lastMessagePreview?: string | null;
};

// `query` çağıran tarafından ÖNCEDEN `foldTr` ile katlanmış gelir (bkz.
// MessagesScreen > conversationsByTab): liste uzun olabilir, katlamayı satır
// başına tekrar etmek yerine sorgu bir kez katlanıp buraya aynen geçiliyor.
//
// KIRPMA BURADA, çağıran tarafta DEĞİL. `foldTr` kırpmıyor (bilerek — gerekçesi
// orada) ve kırpmanın tek doğru yeri eşleşmeden hemen önce: iOS'ta otomatik
// düzeltme önerisini kabul etmek sorgunun sonuna bir boşluk koyuyor, yani
// kullanıcı adı yazıp öneriye dokununca `includes` hiçbir satırı tutmuyor ve
// liste bomboş görünüyordu. Kırpma `if` ile `includes`ın ikisini de besliyor;
// çağıran tarafa bırakılsaydı ikinci bir çağrı yeri (Faz 4, FTS) aynı hatayı
// baştan yapabilirdi.
export const conversationMatchesQuery = (
  conversation: ConversationSearchable,
  query: string,
): boolean => {
  const q = query.trim();
  if (!q) return true;
  return (
    foldTr(conversation.partnerDisplayName).includes(q) ||
    foldTr(conversation.lastMessagePreview).includes(q)
  );
};
