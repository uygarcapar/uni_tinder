/**
 * GÖSTERİM için küçük harfe çevirme (arama katlaması DEĞİL — o `searchText.ts`).
 *
 * ⚠️ `textTransform: "lowercase"` KULLANMA, TÜRKÇEDE BOZUK ÇİZİYOR. RN'in iOS
 * uygulaması `[NSString lowercaseString]` (bkz. RCTTextAttributes.mm >
 * applyTextAttributesToText) ve o locale'den bağımsız: Unicode'un varsayılan
 * kuralı "İ" (U+0130) için "i" + U+0307 BİRLEŞEN NOKTA üretiyor, yani ekranda
 * İKİ NOKTALI bir i çıkıyor. "İrem" → "i̇rem", "İlker" → "i̇lker". Düz
 * `toLowerCase()` de aynı sonucu veriyor — ikisi de aynı varsayılan eşleme.
 *
 * `toLocaleLowerCase("tr")` Türkçe kurallarını uyguluyor: "İ" → "i" (tek
 * nokta), "I" → "ı" (noktasız). Kullanıcı tabanı `.edu.tr` kapılı, yani
 * görüntülenen adlar Türkçe; arayüz dili İngilizce olsa bile ADIN kendisi
 * Türkçe veri, o yüzden dil tercihine DEĞİL sabit "tr"ye bağlı.
 *
 * ⚠️ `foldForSearch` ile karıştırma: o "ı"yı "i"ye katlıyor (iki yazımı tek
 * arama anahtarına indirmek için). Burada katlama OLMAZ — "ırmak"ı "irmak"
 * yazmak kullanıcının adını yanlış yazmak olur.
 */
export const toDisplayLowercase = (raw: unknown): string =>
  typeof raw === "string" ? raw.toLocaleLowerCase("tr") : "";

export default toDisplayLowercase;
