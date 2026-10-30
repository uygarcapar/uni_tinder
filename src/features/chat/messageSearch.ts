import { foldTr } from "@/shared/utils/foldTr";

/**
 * Arama KARARLARI — saf fonksiyon, yan etki YOK.
 *
 * `backfillPolicy.ts`/`pendingMutationPolicy.ts` ile aynı ayrım: bu dosya
 * store, ağ, timer ve SQL'e DOKUNMUYOR. Sorguyu "aranabilir mi" diye süzen
 * karar burada, SQL'i çalıştıran yol (`chatRepository.searchMessages`) orada.
 */

/**
 * Katlanmış sorgunun arama için anlamlı sayılacağı en kısa uzunluk.
 *
 * `conversationMatchesQuery` (sohbet listesi süzgeci) boş sorguda `true`
 * döner — orada doğru, çünkü boş filtre "hepsini göster" demek. ARAMADA bu
 * YANLIŞ: boş ya da çok kısa bir sorgu hiçbir sonuç döndürmemeli, hepsini
 * değil. İki tüketicinin aynı `foldTr`ı paylaşması bu farkı ortadan
 * kaldırmıyor — kısa devre burada, `conversationMatchesQuery`de DEĞİL.
 */
export const MIN_SEARCH_LENGTH = 2;

/** Katlanmış sonuçta en az bir harf/rakam var mı — yalnız noktalama elenir. */
const HAS_SEARCHABLE_CHAR = /[\p{L}\p{N}]/u;

/**
 * Kullanıcının yazdığı ham sorguyu arama için hazırlar: katlar, kırpar.
 *
 * `null` iki durumda döner:
 *  1. Katlanmış+kırpılmış uzunluk `MIN_SEARCH_LENGTH`'in altında (boş sorgu
 *     dahil — `foldTr` kırpmıyor, kırpma burada).
 *  2. Sonuç yalnız noktalama/sembolden oluşuyor ("...", "???"): uzunluk
 *     eşiğini geçse bile hiçbir harf/rakam taşımıyorsa FTS5 MATCH'e boş bir
 *     sorgu gibi davranır ve pratikte hiçbir şeyi ELEMEZ — bu da "tüm
 *     mesajları getir"e dönüşür, ki bu modülün var olma sebebine (aranamayan
 *     sorgu sonuç ÜRETMEMELİ) aykırı.
 */
export function prepareSearchQuery(raw: string): string | null {
  const folded = foldTr(raw).trim();
  if (folded.length < MIN_SEARCH_LENGTH) return null;
  if (!HAS_SEARCHABLE_CHAR.test(folded)) return null;
  return folded;
}

/** `chatRepository.searchMessages`in döndürdüğü tek sonuç satırı. */
export interface MessageSearchHit {
  messageId: string;
  conversationId: string;
  sentAtMs: number;
  content: string;
  /** `conversations.partner_display_name` — sunucu hiç göndermediyse null. */
  partnerDisplayName: string | null;
}
