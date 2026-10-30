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
 * `searchMessages` SQLite'a vuran, senkron bir sorgu — hem global aramanın
 * (MessagesScreen) hem sohbet içi aramanın (ChatScreen) debounce'u bu YÜZDEN
 * var ve bu YÜZDEN aynı süre: ikisi de "SQL'e her tuş vuruşunda değil, yazı
 * duraksayınca" kuralını paylaşıyor. Review turu 1 — iki ekran bu sabiti ayrı
 * ayrı `220` olarak KOPYALAMIŞTI, "aynı gerekçe" diye yorumda yazıp aslında
 * paylaşmıyordu; biri değişip diğeri unutulsa sessizce ayrışırdı. Tek kaynak
 * burada.
 */
export const SEARCH_DEBOUNCE_MS = 220;

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

/** `highlightSegments`in döndürdüğü tek metin parçası. */
export interface SearchHighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Mesaj sonucu satırındaki içeriği, ARAMANIN KENDİSİNİN kullandığı KATLANMIŞ
 * sorguya göre parçalara ayırır — kalın basılacak parça `match: true`.
 *
 * `foldedQuery` çağıranın `prepareSearchQuery`den geçirdiği, ZATEN katlanmış
 * dize olmak ZORUNDA (MessagesScreen'in debounce'lu `messageSearchQuery`si
 * tam bu — bkz. orada "neden debounce'lu değer" yorumu). Ham, katlanmamış
 * sorguyu burada tekrar katlamıyoruz: `searchMessages`in tokenizasyonuyla AYNI
 * kaynaktan (`tokenizeFolded`) beslenmek, hangi tokenların eşleştiğini SQL'le
 * TUTARLI tutmanın tek yolu (review turu 2'nin `tokenizeFolded` ruling'i
 * burada da geçerli).
 *
 * ── Önceki sürümün HATASI: katlanmamış regex + `toLocaleLowerCase('tr')`
 *    karşılaştırması ─────────────────────────────────────────────────────────
 * Eski kod `rawQuery`yi `giu` regex'iyle ARAYIP sonra parçayı
 * `toLocaleLowerCase('tr')` ile `matchSet`e (katlanmış tokenlar) karşı
 * kontrol ediyordu. "ISIK" sorgusu "isik" içeriğinde `/ISIK/giu` ile
 * BULUNUYORDU ama `"isik".toLocaleLowerCase('tr')` → `"isik"` (TR kuralında
 * I→ı DEĞİL, zaten küçük) vs `matchSet` içindeki katlanmış token `"isik"`...
 * asıl kırılan durum ters yönde: "IŞIK" sorgusu "isik" içeriğini YAKALAYAMAZ
 * (regex `/IŞIK/` harfi harfine "IŞIK" arar, katlanmış "isik"i hiç görmez).
 * Yani eşleşen satır dönerdi (SQL katlanmış arıyor) ama VURGU hiç çizilmezdi
 * — kullanıcı sorgusuyla alakasız görünen, boş-vurgulu bir satır. Kök sebep
 * katlanmamış metni katlanmış bir sorguyla ARAMAKTI.
 *
 * ── Çözüm: pozisyon-korumalı katlama ─────────────────────────────────────────
 * `content`in HER karakteri TEK TEK `foldTr`dan geçirilip katlanmış çıktı
 * dizisi oluşturuluyor, her katlanmış karakterin HANGİ orijinal karaktere ait
 * olduğu `indexMap`te tutuluyor. Eşleşme TAMAMEN katlanmış uzayda aranıyor,
 * sonra `indexMap` ile orijinal metindeki karşılık gelen ARALIĞA geri
 * dönülüyor — "IŞIK" sorgusu "IŞIK" içeriğinde artık doğru vurgulanıyor
 * (bkz. messageSearch.test.ts > ISIK/isik testi).
 *
 * ── Aranan uzay SQL'le AYNI KURAL, ama AYNI ALAN DEĞİL ──────────────────────
 * Review turu 4, Minör 8: eski yorum "SQL'in gördüğü alanın AYNISI" diyordu ve
 * bu fazla iddiaydı. Katlama kuralı aynı (`foldTr`, tek kaynak), ALAN iki
 * noktada ayrışıyor: (1) buradaki katlama KARAKTER BAŞINA yapılıyor, yani
 * ayrıştırılmış (NFD) bir girdide `foldTr(dizinin tamamı)` ile birebir aynı
 * sonucu vermeyebilir; (2) `searchableFolded`in yaptığı `\s+ → ' '` katlaması
 * BURADA YOK. İkisi de bugün görünür bir davranış farkı üretmiyor — vurgu
 * kozmetik, en kötü ihtimalle bir aralık çizilmez — ama "aynı alan" diye
 * OKUNMASIN.
 *
 * `foldTr` tek karakter başına çoğunlukla TEK (bazen SIFIR, aksan işareti tek
 * başına nadir bir girdiyse) katlanmış karakter üretir — NFD ayrıştırması +
 * işaret temizliği aynı taban harfte toplanıyor (bkz. foldTr'nin kendi
 * yorumu). Çok karakterli bir çıktı pratikte oluşmuyor; oluşsa bile aşağıdaki
 * döngü onu da doğru indeksler (her katlanmış karakter AYRI AYRI `indexMap`e
 * ekleniyor).
 *
 * ── "Kelime başı" kuralı — `searchMessages` ile AYNI semantik ───────────────
 * Eşleşme yalnız bir TOKEN kelimenin BAŞINDA (dizinin başı ya da bir
 * alfanümerik-olmayan karakterden hemen sonra) geçtiğinde sayılıyor —
 * `toFtsMatchQuery`/`buildLikePredicate`in "kelime başı ön eki" kuralının
 * (chatRepository.ts) BİREBİR aynısı. Aksi halde "sinema" sorgusu
 * "yanlışinema" gibi bir kelimenin İÇİNDE de vurgu basardı — SQL'in ASLA
 * böyle bir satırı döndürmeyeceği bir durum.
 *
 * `MIN_SEARCH_LENGTH`in altındaki tokenlar (ör. "sinema g" yazarkenki "g")
 * vurgu ARAMASINA KATILMIYOR — SQL tarafı onu hâlâ dar bir AND terimi olarak
 * kullanıyor (bkz. prepareSearchQuery yorumu, bu DEĞİŞMEDİ), ama her tek
 * harfi ekranda kalınlaştırmak salt görsel gürültü olurdu; bu yüzden filtre
 * YALNIZ burada, kozmetik katmanda.
 */
export function highlightSegments(
  content: string,
  foldedQuery: string,
): SearchHighlightSegment[] {
  const tokens = Array.from(new Set(tokenizeFolded(foldedQuery)))
    .filter((t) => t.length >= MIN_SEARCH_LENGTH)
    .sort((a, b) => b.length - a.length);
  if (!tokens.length || !content) return [{ text: content, match: false }];

  const chars = Array.from(content);
  const foldedChars: string[] = [];
  // foldedChars[i] → chars[indexMap[i]] (katlanmış karakterden orijinale).
  const indexMap: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    for (const fc of foldTr(chars[i])) {
      foldedChars.push(fc);
      indexMap.push(i);
    }
  }
  const folded = foldedChars.join('');

  const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);
  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const idx = folded.indexOf(token, from);
      if (idx < 0) break;
      from = idx + 1;
      if (idx === 0 || !isWordChar(foldedChars[idx - 1])) {
        ranges.push([idx, idx + token.length]);
      }
    }
  }
  if (!ranges.length) return [{ text: content, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }

  const segments: SearchHighlightSegment[] = [];
  let cursor = 0;
  for (const [foldStart, foldEnd] of merged) {
    const origStart = indexMap[foldStart];
    const origEnd = indexMap[Math.min(foldEnd, indexMap.length) - 1] + 1;
    if (origStart > cursor) {
      segments.push({ text: chars.slice(cursor, origStart).join(''), match: false });
    }
    segments.push({ text: chars.slice(origStart, origEnd).join(''), match: true });
    cursor = origEnd;
  }
  if (cursor < chars.length) {
    segments.push({ text: chars.slice(cursor).join(''), match: false });
  }
  return segments;
}
