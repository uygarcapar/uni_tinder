import i18n from '@/shared/i18n';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { bustStaticCache } from '@/shared/services/staticCache';

// Prompt doğrulama hataları — backend `UT-22xx` ailesi (Errors.Prompts).
//
// Sözleşme: kod HANGİ KURALIN ihlal edildiğini söyler, gövde HANGİ SLOTUN
// olduğunu. Slot bilgisi olmadan kullanıcının üç cevabından hangisinin
// reddedildiğini bilemiyoruz.
//
// GÖVDE ŞEKLİ (2026-08-24 kesinleşti — düz `result.promptIndex` bırakıldı):
//
//   { code, message, result: { prompts: [{ index, code }] } }
//
// İki kural sözleşmede yazılı:
//   · Tüm slotlar TEK TURDA doğrulanıyor — iki hatalı cevap tek yanıtta döner.
//   · Liste geneli ihlallerde (adet/tekrar) `prompts` BOŞ DİZİ gelir, bilgi
//     yalnız üst seviye `code`'da olur. O yüzden boş dizi "hata yok" demek
//     DEĞİL; üst seviye koda düşmek gerekiyor.
//
// Üst seviye `code` slotların ilki değil, EN AĞIR hata: backend
// UT-2201 > UT-2203 > UT-2202 > UT-2206 > UT-2205 > UT-2204 sırasıyla seçiyor
// (yapısal ihlaller içerik ihlallerinin önünde). Özet mesaj bu yüzden
// `promptSummaryCode` ile okunmalı, `errors[0]` ile değil.

export const PROMPT_ERROR_CODES = [
  'UT-2201', // adet 1-3 dışı
  'UT-2202', // geçersiz/pasif prompt anahtarı
  'UT-2203', // aynı prompt iki kez
  'UT-2204', // cevap boş
  'UT-2205', // cevap çok uzun
  'UT-2206', // moderasyon reddi
] as const;

export type PromptErrorCode = (typeof PROMPT_ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(PROMPT_ERROR_CODES);

export const isPromptErrorCode = (code: unknown): code is PromptErrorCode =>
  typeof code === 'string' && KNOWN_CODES.has(code);

/** Tek bir slotun reddi. `index` null = hata listeye değil isteğin tamamına ait (UT-2201). */
export interface PromptFieldError {
  index: number | null;
  code: PromptErrorCode | string;
}

const toIndex = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * 400 gövdesinden slot bazlı hataları çıkarır.
 *
 * `data` hem `postFormData` gövdesi (kayıt yolu — `validateStatus: () => true`
 * olduğu için 400 fırlatılmıyor, gövde elimizde) hem de axios
 * `error.response.data` (UpdateProfile yolu) olabilir; ikisi de aynı zarfı
 * taşıyor.
 *
 * Liste geneli ihlalde (`prompts: []`) tek elemanlı, `index: null` bir sonuç
 * döner — çağıran taraf "hata var ama slot belli değil"i ayırt edebilsin.
 */
export const extractPromptErrors = (data: any): PromptFieldError[] => {
  const topCode = data?.code ?? data?.result?.code ?? null;
  const list = data?.result?.prompts;

  if (Array.isArray(list) && list.length > 0) {
    return list
      .map((item: any) => ({
        index: toIndex(item?.index),
        code: item?.code ?? topCode,
      }))
      .filter((e) => isPromptErrorCode(e.code));
  }

  if (!isPromptErrorCode(topCode)) return [];

  return [{ index: null, code: topCode }];
};

/**
 * Toast/özet mesajı için tek kod.
 *
 * Üst seviye `code` backend'de EN AĞIR hata olarak seçiliyor; slot dizisinin
 * ilk elemanı ise yalnızca en küçük index. İkisi ayrıştığında kullanıcıya
 * gösterilmesi gereken üst seviye olan: "3'ten fazla soru seçemezsin" önce
 * gelir, "cevabın uzun" sonra.
 */
export const promptSummaryCode = (
  data: any,
  errors: readonly PromptFieldError[],
): PromptErrorCode | string | null => {
  const topCode = data?.code ?? data?.result?.code ?? null;
  if (isPromptErrorCode(topCode)) return topCode;
  return errors[0]?.code ?? null;
};

/**
 * Kullanıcıya gösterilecek metin — HER ZAMAN koddan üretilir, backend
 * `message`'ından değil (responseCodes.ts'teki kuralın aynısı).
 */
export const promptErrorText = (code: PromptErrorCode | string): string => {
  const key = `profile.prompts.errors.${code}`;
  const text = i18n.t(key);
  // i18next bilinmeyen anahtarda anahtarın kendisini döndürür.
  return text === key ? i18n.t('profile.prompts.errors.generic') : text;
};

/**
 * `UT-2202` = seçilen prompt katalogda yok ya da pasife alınmış.
 *
 * Bunun en olası sebebi kullanıcının hata yapması değil, KATALOĞUN BAYAT
 * OLMASI: `staticGet` katalogu uygulama oturumu boyunca tutuyor (TTL yok), yani
 * backend bir prompt'u `isActive:false` yaptıktan sonra uygulamayı açık tutan
 * kullanıcı onu listede görmeye devam ediyor.
 *
 * Bu yüzden kodu görünce cache'i düşürüp listeyi tazeliyoruz; çağıran taraf
 * ardından react-query'yi invalidate edip ilgili slotu boşaltmalı.
 */
export const shouldRefreshPromptCatalog = (
  errors: readonly PromptFieldError[],
): boolean => errors.some((e) => e.code === 'UT-2202');

export const refreshPromptCatalog = (): void => {
  bustStaticCache(API_ENDPOINTS.GET_PROMPTS);
};
