import { foldTr } from '@/shared/utils/foldTr';

/**
 * Arama KARARLARI — saf fonksiyon, yan etki YOK.
 *
 * `backfillPolicy.ts`/`pendingMutationPolicy.ts` ile aynı ayrım: bu dosya
 * store, ağ, timer ve SQL'e DOKUNMUYOR. Sorguyu "aranabilir mi" diye süzen
 * karar burada, SQL'i çalıştıran yol (`chatRepository.searchMessages`) orada.
 */

/**
 * Katlanmış bir TOKEN'ın arama için anlamlı sayılacağı en kısa uzunluk.
 *
 * `conversationMatchesQuery` (sohbet listesi süzgeci) boş sorguda `true`
 * döner — orada doğru, çünkü boş filtre "hepsini göster" demek. ARAMADA bu
 * YANLIŞ: boş ya da çok kısa bir sorgu hiçbir sonuç döndürmemeli, hepsini
 * değil. İki tüketicinin aynı `foldTr`ı paylaşması bu farkı ortadan
 * kaldırmıyor — kısa devre burada, `conversationMatchesQuery`de DEĞİL.
 */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Katlanmış sorguyu FTS5'in `unicode61` tokenizer'ıyla AYNI sınırda böler:
 * harf/rakam (`\p{L}\p{N}`) TOKEN, geri kalan HER ŞEY (boşluk, noktalama,
 * sembol: `%`, `_`, `&`, `'`, …) AYRAÇ ve ATILIR. Boş/yalnız-ayraç girişte
 * `[]`.
 *
 * ── Burada yaşıyor, `chatRepository.ts`de DEĞİL (review turu 3) ────────────
 * Bu fonksiyon İKİ farklı tüketici için TEK kaynak olmak zorunda:
 * `chatRepository.searchMessages`in `toFtsMatchQuery`/`buildLikePredicate`
 * SQL üretimi (SORGU iki yolda da AYNI tokenlara bölünsün diye, review turu
 * 2'nin ruling'i) VE bu dosyadaki `prepareSearchQuery`nin uzunluk kapısı
 * (aşağıda — bir token kısa diye SQL'e hiç gitmeden reddedilsin diye). İki
 * yerde AYRI AYRI tanımlansaydı biri değişip diğeri unutulduğunda sessizce
 * ayrışırdı; `messageSearch.ts` saf olduğu için (store/ağ/DB YOK)
 * `chatRepository.ts` ona bağımlı olabiliyor, tersi DEĞİL.
 */
export function tokenizeFolded(folded: string): string[] {
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Kullanıcının yazdığı ham sorguyu arama için hazırlar: katlar, kırpar.
 *
 * `null`, TOKENLARIN HİÇBİRİ `MIN_SEARCH_LENGTH`'e ulaşmıyorsa döner — tek
 * kontrol bu, ve üç eski ayrı durumu da KAPSIYOR:
 *  • Boş/yalnız-boşluk sorgu → `tokenizeFolded([])` boş dizi → kontrol
 *    otomatik `false`.
 *  • Yalnız noktalama/sembol ("...", "???") → aynı sebepten `[]`.
 *  • Tek, kısa kelime ("a") → tek token, `MIN_SEARCH_LENGTH`in altında.
 *
 * ── Karar: HERHANGİ BİR token eşiği geçerse yeterli, HEPSİNİN geçmesi
 *    GEREKMEZ (review turu 3) ─────────────────────────────────────────────
 * "ali v" kullanıcının YAZARKEN geçtiği GERÇEKÇİ bir ara durum — ikinci
 * kelimeye yeni başlamış. Tüm tokenların eşiği geçmesini şart koşsaydık bu
 * dizi `v` tokeni yüzünden TAMAMEN reddedilir ve kullanıcı "ali" ile zaten
 * gördüğü sonuçların ekrandan birden KAYBOLDUĞUNU görürdü — yazarken arama
 * kutusunun "bozulması" hissi. "En az bir token" kuralı bunu önlüyor: "ali"
 * token'ı eşiği geçtiği için sorgu GEÇERLİ sayılır, SQL katmanına gider
 * (kısa `v` tokeni orada zararsız bir AND terimi — dar bir ön ek, en kötü
 * ihtimalle sonuçları biraz daraltır, YANLIŞ sonuç ÜRETMEZ).
 *
 * Bunun KÖTÜYE KULLANIMI ENGELLEMESİ gerekiyordu: `prepareSearchQuery('a%')`
 * önceden `'a%'`yi (2 karakter, bir harf taşıyor) GEÇERLİ sayıp
 * döndürüyordu — ki bu `tokenizeFolded`den geçince TEK harfli `'a'` tokenine
 * inip ARŞİVİN TAMAMI üzerinde bir harflik bir ön ek taraması başlatıyordu
 * (Task 4'ün debouncesız `onChangeText`ine bağlı bir arama kutusunda).
 * Kontrolü HAM dize uzunluğu yerine TOKEN uzunluğuna taşımak bunu kapatıyor:
 * `'a%'` → tek token `'a'` (`%` ayraç, atıldı) → `MIN_SEARCH_LENGTH`in altında
 * → `null`.
 */
export function prepareSearchQuery(raw: string): string | null {
  const folded = foldTr(raw).trim();
  const tokens = tokenizeFolded(folded);
  if (!tokens.some((t) => t.length >= MIN_SEARCH_LENGTH)) return null;
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
