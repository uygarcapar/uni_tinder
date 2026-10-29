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
const FOLD_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  I: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
  â: 'a',
  î: 'i',
  û: 'u',
};

export const foldTr = (value: string | null | undefined): string => {
  if (!value) return '';
  let folded = '';
  for (const ch of value.normalize('NFC')) {
    folded += FOLD_MAP[ch] ?? ch;
  }
  return folded.toLowerCase();
};
