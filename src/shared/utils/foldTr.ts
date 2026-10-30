// Arama için AGRESİF Türkçe katlama.
//
// `toLocaleLowerCase("tr")` (bkz. CityPickerModal, FeedUniversitySheet)
// GÖSTERİM için doğru ama arama için YANLIŞ: tr kurallarında "I" → "ı"
// (noktasız), yani klavyesinde Türkçe karakter olmayan kullanıcı "ELIF" yazsa
// sonuç "elıf" olur ve "elif" sorgusuyla eşleşmez. Burada tam tersi gerekiyor:
// ı/İ/I/i TEK harfe inmeli, aksanlı sesli harfler de düşmeli — hem Türkçe
// klavyeyle doğru yazan hem yazmayan kullanıcı aynı anahtara düşsün diye.
//
// `normalize("NFC")` önce gelir: birleşen aksan karakterleriyle (örn. "i" +
// U+0307) yazılmış adları da tek code point'e indirger, yoksa aşağıdaki harf
// haritası onları atlar.
//
// Harita AKSANLARI KAPSAMIYOR, kapsamamalı: aksan düşürmeyi sonundaki
// birleşen-işaret süzgeci yapıyor (NFD ayrıştırıyor, U+0300–U+036F aralığı
// siliniyor) ve o sınıfın tamamını tek seferde kapatıyor. Harita yalnız
// aksanla ÇÖZÜLEMEYEN katlamaları taşıyor: `ı/İ/I/i → i` ayrı bir harf
// meselesi (I'nın noktası diyakritik değil, harfin kendisi), `ş/ğ/ç`nin
// kuyruğu/şapkası da NFD'de ayrışıyor ama onları haritada TUTMAK gerekiyor
// çünkü `Ş → S` istiyoruz ve `s` + U+0327 ayrıştırması aynı sonucu
// kendiliğinden vermiyor (tek code point'li ş NFD'de ayrışır, ama niyeti
// burada açıkça göstermek bir sonraki okuyanı koruyor).
const FOLD_MAP: Record<string, string> = {
  ı: "i",
  İ: "i",
  I: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  ç: "c",
  Ç: "c",
  â: "a",
  î: "i",
  û: "u",
};

/** NFD'de harften ayrılan birleşen aksan işaretleri. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * KIRPMAZ. Boşluk katlamanın değil çağıranın meselesi: tek tüketici
 * `conversationMatchesQuery` kırpmayı kendisi yapıyor (gerekçesi orada) ve
 * Faz 4'te FTS'in normalize kolonunu besleyecek olan bu fonksiyonun bir
 * değerin kenar boşluklarını sessizce yemesi istenmez.
 */
export const foldTr = (value: string | null | undefined): string => {
  if (!value) return "";
  let folded = "";
  for (const ch of value.normalize("NFC")) {
    folded += FOLD_MAP[ch] ?? ch;
  }
  // Haritadan geçmeyen aksanlı harfler (örn. BÜYÜK `Â/Î/Û` — haritada yalnız
  // küçükleri vardı, `ÂDEM` aksanıyla çıkıyor ve `adem` sorgusu kaçırıyordu)
  // burada düşüyor. `toLowerCase()`tan SONRA: aksan, büyük/küçük hâlinden
  // bağımsız olarak ayrışıyor, yani iki geçiş yerine bir tane yetiyor.
  return folded.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "");
};
