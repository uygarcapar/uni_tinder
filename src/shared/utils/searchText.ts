/**
 * Arama karşılaştırması için metin katlama.
 *
 * `toLocaleLowerCase("tr")` tek başına YETMİYOR: Türkçe kurallarında "I" → "ı"
 * (noktasız). Liste iki dilli olduğundan İngilizce adlar da taranıyor ve
 * "Istanbul Commerce University" → "ıstanbul…" oluyor; kullanıcı "istanbul"
 * yazdığında sorgudaki "i" olduğu gibi kaldığı için HİÇBİR ŞEY eşleşmiyordu.
 *
 * Çözüm iki tarafı da aynı biçime indirmek: tr kurallarıyla küçült, sonra
 * "ı"yı "i"ye katla. Böylece "İstanbul", "Istanbul" ve "istanbul" tek bir
 * anahtara iniyor. Diğer Türkçe harfler (ğ/ü/ş/ö/ç) KATLANMIYOR — onlarda
 * büyük/küçük eşlemesi zaten tekil, aksansız yazımı da desteklemek ayrı bir
 * karar (bugün hiçbir picker desteklemiyor).
 */
export const foldForSearch = (raw: unknown): string =>
  typeof raw === "string" ? raw.toLocaleLowerCase("tr").replace(/ı/g, "i") : "";
