const ZWJ = 0x200d;
const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const KEYCAP = 0x20e3;
const SKIN_MIN = 0x1f3fb;
const SKIN_MAX = 0x1f3ff;
const RI_MIN = 0x1f1e6;
const RI_MAX = 0x1f1ff;
const TAG_MIN = 0xe0020;
const TAG_MAX = 0xe007f;

// `index` konumundan bir ÖNCEKI kod noktasının başlangıcı (surrogate çiftini
// bölmez). String.prototype.codePointAt indeksle çalıştığı için gerekli.
function prevCodePointStart(text: string, index: number): number {
  let i = index - 1;
  if (i > 0) {
    const low = text.charCodeAt(i);
    const high = text.charCodeAt(i - 1);
    if (low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff) i -= 1;
  }
  return i;
}

/**
 * İmleçten önceki TEK grafem kümesini silecek kesme noktasını döndürür.
 *
 * Emoji paneli açıkken sistem klavyesi ekranda olmadığı için silme işini bu
 * yapıyor — ve `text.slice(0, caret - 1)` YETMEZ: emoji'ler surrogate çifti,
 * ten tonu modifier'ı, varyasyon seçici (FE0F), keycap, ZWJ zinciri (👨‍👩‍👧) ve
 * bayraklarda regional-indicator ÇİFTİ olabiliyor. Yarım silinen bir küme
 * ekranda tofu (□) bırakır.
 *
 * Intl.Segmenter kullanılmıyor: Hermes'te garanti değil.
 */
export function graphemeStartBefore(text: string, caret: number): number {
  if (caret <= 0) return 0;
  let i = prevCodePointStart(text, caret);

  for (;;) {
    const cp = text.codePointAt(i);
    if (cp === undefined) break;

    // Tek başına anlamı olmayan ekler: bir öncekine yapış.
    const isTrailing =
      cp === VS15 ||
      cp === VS16 ||
      cp === KEYCAP ||
      (cp >= SKIN_MIN && cp <= SKIN_MAX) ||
      (cp >= TAG_MIN && cp <= TAG_MAX);
    if (isTrailing && i > 0) {
      i = prevCodePointStart(text, i);
      continue;
    }

    if (i > 0) {
      const p = prevCodePointStart(text, i);
      const pcp = text.codePointAt(p);
      // ZWJ zinciri: birleştiricinin solundaki parçayı da yut.
      if (pcp === ZWJ && p > 0) {
        i = prevCodePointStart(text, p);
        continue;
      }
      // Bayrak = iki regional indicator; tek başına yarım bayrak kalmasın.
      if (cp >= RI_MIN && cp <= RI_MAX && pcp !== undefined && pcp >= RI_MIN && pcp <= RI_MAX) {
        i = p;
      }
    }
    break;
  }

  return i;
}
