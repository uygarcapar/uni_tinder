import i18n from "./index";

/**
 * i18n dilini Intl'in beklediği BCP47 locale'e çevirir.
 * toLocaleDateString/-TimeString çağrılarında "tr-TR" hardcode etmek yerine
 * bunu kullan — aksi halde İngilizce'de gün adları Türkçe basılıyor.
 */
const LOCALE_MAP: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
};

export function getDateLocale() {
  const lng = (i18n.language || i18n.options?.fallbackLng || "tr") as string;
  const base = lng.split("-")[0];
  return LOCALE_MAP[base] ?? lng;
}
