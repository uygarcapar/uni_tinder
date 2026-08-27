import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { staticGet } from "@/shared/services/staticCache";
import { PROMPT_CATALOG_MOCK } from "./promptCatalogMock";

export type CityOption = {
  id: number;
  name: string;
  enumName: string;
};

export type DistrictOption = {
  id: number;
  name: string;
  enumName: string;
};

export type DepartmentOption = {
  id: number;
  name: string;
  enumName: string;
};

// GET /api/common/universities — diğer common listelerinden farklı olarak
// `id`/`enumName` YOK: tekil anahtar da, backend'e gönderilen değer de `domain`.
export type UniversityOption = {
  domain: string;
  name: string;
};

// Backend'in çift dilli alanları (EnumLocalizer.LocalizedText) — `display` /
// `categoryDisplay` bir string DEĞİL, { tr, en } objesi. Doğrudan render edilirse
// "Objects are not valid as a React child" hatası verir; resolveLocalized ile çöz.
export type LocalizedText = { tr?: string; en?: string };

/** { tr, en } objesini aktif dile göre çözer; string gelirse aynen döner. */
export const resolveLocalized = (
  value: string | LocalizedText | null | undefined,
  language: string,
  fallback = "",
): string => {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  const lang = language?.split("-")[0];
  return (lang === "en" ? value.en : value.tr) ?? value.tr ?? value.en ?? fallback;
};

// GET /api/common/genders — kategori (Erkek/Kadın/Non-Binary) + alt cinsiyetler.
// `id` GenderType ordinal'ı, `enumName` backend'e gönderilen değer.
// `name` sunucuda Accept-Language'a göre çözülmüş string, `display` çift dilli obje.
// NOT: Transgender hem Erkek hem Kadın kategorisinde görünür (backend böyle
// döndürüyor), yani `id` kategoriler arasında tekil değil — seçim enumName ile
// takip edilmeli.
export type GenderSubOption = {
  id: number;
  name: string;
  display?: string | LocalizedText;
  enumName: string;
};

export type GenderCategoryOption = {
  categoryName: string;
  categoryEnumName: string;
  categoryDisplay?: string | LocalizedText;
  subGenders: GenderSubOption[];
};

// GET /api/common/hobbies — kategoriye gruplu hobi listesi. `enumName` backend'e
// gönderilen değer (PascalCase), `display` çift dilli obje (resolveLocalized).
// `id` yalnız profil düzenlemede kullanılıyor; filtre tarafı enumName ile çalışır.
export type HobbyOption = {
  id: number;
  name: string;
  display?: string | LocalizedText;
  enumName: string;
};

export type HobbyGroupOption = {
  category: string;
  categoryEnumName?: string;
  categoryDisplay?: string | LocalizedText;
  hobbies: HobbyOption[];
};

// GET /api/common/prompts — bio'nun yerini alan cümle başlangıçları. Hobilerle
// birebir aynı gruplu şekil; `enumName` backend'e gönderilen değer
// ("MostEnjoyInLife"), `display` çift dilli obje (resolveLocalized ile çöz).
//
// `maxLength` PROMPT BAŞINA geliyor — cevap sayacı bunu kullanmalı, sabit 150'yi
// değil (bkz. PROMPT_ANSWER_MAX_LENGTH yalnızca alan gelmediğinde fallback).
//
// `isActive: false` = katalogdan çıkarılmış ama SİLİNMEMİŞ prompt. Backend soft
// delete garantisi verdi: eski cevaplar çözülebilsin diye uçtan dönmeye devam
// ediyor. Seçim listesinde GÖSTERİLMEZ, ama kullanıcının mevcut cevabı çizilir.
export type PromptOption = {
  id: number;
  name: string;
  display?: string | LocalizedText;
  enumName: string;
  maxLength?: number;
  isActive?: boolean;
};

export type PromptGroupOption = {
  category: string;
  categoryEnumName?: string;
  categoryDisplay?: string | LocalizedText;
  prompts: PromptOption[];
};

// GET /api/common/relationship-intents — "ilişki niyeti" enum listesi.
// `enumName` backend'e gönderilen değer ("LongTerm"), `display` çift dilli obje
// (resolveLocalized ile çöz), `name` sunucuda Accept-Language'e göre çözülmüş.
export type RelationshipIntentOption = {
  id: number;
  name: string;
  display?: string | LocalizedText;
  enumName: string;
};

// GET /api/common/{zodiacs,smoking-statuses,pets,...} — hepsi aynı
// düz enum şeklinde dönüyor: `enumName` backend'e gönderilen değer ("Aries"),
// `display` çift dilli obje (resolveLocalized ile çöz), `name` sunucuda
// Accept-Language'e göre çözülmüş İngilizce sabit.
export type EnumOption = {
  id: number;
  name: string;
  display?: string | LocalizedText;
  enumName: string;
};

export const commonKeys = {
  cities: ["common", "cities"] as const,
  hobbies: ["common", "hobbies"] as const,
  prompts: ["common", "prompts"] as const,
  relationshipIntents: ["common", "relationshipIntents"] as const,
  districts: (cityId: number | string) =>
    ["common", "districts", cityId] as const,
  departments: ["common", "departments"] as const,
  genders: ["common", "genders"] as const,
  universities: ["common", "universities"] as const,
  zodiacs: ["common", "zodiacs"] as const,
  smokingStatuses: ["common", "smokingStatuses"] as const,
  pets: ["common", "pets"] as const,
  alcoholUsages: ["common", "alcoholUsages"] as const,
  religiousViews: ["common", "religiousViews"] as const,
  languages: ["common", "languages"] as const,
};

/** Domain karşılaştırmalarının tek kuralı — backend de trim + lowercase yapıyor. */
export const normalizeDomain = (raw: unknown): string =>
  typeof raw === "string" ? raw.trim().toLowerCase() : "";

export function useCities() {
  return useQuery({
    queryKey: commonKeys.cities,
    queryFn: async (): Promise<CityOption[]> => {
      const res = (await staticGet(API_ENDPOINTS.GET_CITIES)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      return res.result;
    },
    staleTime: Infinity,
  });
}

// useDistrictsByCity KALDIRILDI: ilçe seçiciyi kullanan tek yer onboarding'in
// eski şehir/ilçe adımıydı. İlçe artık backend'de koordinattan türetiliyor;
// Discover filtresi yalnızca şehir tercihi tutuyor. Endpoint (GET_DISTRICTS_BY_CITY)
// backend'de duruyor, tekrar ihtiyaç olursa hook geri yazılabilir.

export function useGenders() {
  return useQuery({
    queryKey: commonKeys.genders,
    queryFn: async (): Promise<GenderCategoryOption[]> => {
      const res = (await staticGet(API_ENDPOINTS.GET_GENDERS)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      return res.result;
    },
    staleTime: Infinity,
  });
}

// Üniversite listesi — filtre ekranındaki görünürlük picker'larını doldurur.
// Seçim/gönderim daima `domain` üzerinden; backend normalize edilmiş domain
// bekliyor, o yüzden listeyi okurken de normalize edip tekilleştiriyoruz
// (aynı domain iki isimle gelirse picker'da çift satır çıkmasın).
export function useUniversities() {
  return useQuery({
    queryKey: commonKeys.universities,
    queryFn: async (): Promise<UniversityOption[]> => {
      const res = (await staticGet(API_ENDPOINTS.GET_UNIVERSITIES)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      const seen = new Set<string>();
      const out: UniversityOption[] = [];
      for (const item of res.result) {
        const domain = normalizeDomain(item?.domain);
        if (!domain || seen.has(domain)) continue;
        seen.add(domain);
        out.push({ domain, name: item?.name || domain });
      }
      return out;
    },
    staleTime: Infinity,
  });
}

// Hobi listesi — filtre ekranındaki "karşımda aradığım hobiler" picker'ını
// doldurur. ProfileScreen aynı endpoint'i staticGet ile çekiyor; staticGet
// oturum-boyu tek fetch yaptığı için iki ekran tek isteği paylaşır.
export function useHobbies() {
  return useQuery({
    queryKey: commonKeys.hobbies,
    queryFn: async (): Promise<HobbyGroupOption[]> => {
      const res = (await staticGet(API_ENDPOINTS.GET_HOBBIES)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      // enumName'i olmayan kayıt filtreye gönderilemez (backend enum string
      // bekliyor) — picker'da da gösterme.
      return res.result.map((g: any) => ({
        ...g,
        hobbies: (g?.hobbies ?? []).filter((h: any) => !!h?.enumName),
      }));
    },
    staleTime: Infinity,
  });
}

// Prompt kataloğu — profil düzenleme ve kayıt adımındaki seçim listesini doldurur.
//
// Backend K2 (katalog içeriği) ürün tarafında beklerken uç BOŞ LİSTE dönüyor.
// Boş listeyle ekran geliştirilemediği için __DEV__'de mock'a düşüyoruz; release
// build'de asla devreye girmez, yani boş katalog sahada boş liste olarak görünür
// (sessizce sahte veri servis etmez). K2 dolunca PROMPT_CATALOG_MOCK silinecek.
export function usePrompts() {
  return useQuery({
    queryKey: commonKeys.prompts,
    queryFn: async (): Promise<PromptGroupOption[]> => {
      const res = (await staticGet(API_ENDPOINTS.GET_PROMPTS)) as any;
      const groups =
        res?.isSuccess && Array.isArray(res.result) ? res.result : [];
      const cleaned: PromptGroupOption[] = groups.map((g: any) => ({
        ...g,
        // enumName'siz kayıt backend'e gönderilemez (enum string bekliyor).
        prompts: (g?.prompts ?? []).filter((p: any) => !!p?.enumName),
      }));
      if (cleaned.some((g) => g.prompts.length > 0)) return cleaned;
      return __DEV__ ? PROMPT_CATALOG_MOCK : cleaned;
    },
    staleTime: Infinity,
  });
}

/** Katalogdaki tüm prompt'lar tek düzlemde — arama ve anahtar çözümü için. */
export const flattenPrompts = (
  groups: PromptGroupOption[] | undefined,
): PromptOption[] => (groups ?? []).flatMap((g) => g.prompts ?? []);

/**
 * `enumName` → katalog kaydı. Kullanıcının kayıtlı cevabının sorusunu çizmek
 * için kullanılıyor; pasife alınmış prompt'ları da bulur (soft delete sayesinde
 * katalogda duruyorlar).
 */
export const findPrompt = (
  groups: PromptGroupOption[] | undefined,
  enumName: string | null | undefined,
): PromptOption | undefined =>
  enumName
    ? flattenPrompts(groups).find((p) => p.enumName === enumName)
    : undefined;

/**
 * Seçim listesinde gösterilecekler: pasifler ve kullanıcının zaten kullandığı
 * anahtarlar elenir (aynı prompt iki kez seçilemez — backend `UT-2203`).
 */
export const selectablePrompts = (
  groups: PromptGroupOption[] | undefined,
  usedKeys: readonly string[],
): PromptGroupOption[] =>
  (groups ?? [])
    .map((g) => ({
      ...g,
      prompts: (g.prompts ?? []).filter(
        (p) => p.isActive !== false && !usedKeys.includes(p.enumName),
      ),
    }))
    .filter((g) => g.prompts.length > 0);

// İlişki niyeti listesi — keşif filtresindeki çoklu seçim pill'lerini doldurur.
// ProfileScreen aynı endpoint'i staticGet ile çekiyor; staticGet oturum-boyu tek
// fetch yaptığı için iki ekran tek isteği paylaşır.
export function useRelationshipIntents() {
  return useQuery({
    queryKey: commonKeys.relationshipIntents,
    queryFn: async (): Promise<RelationshipIntentOption[]> => {
      const res = (await staticGet(
        API_ENDPOINTS.GET_RELATIONSHIP_INTENTS,
      )) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      // enumName'i olmayan kayıt filtreye gönderilemez (backend enum string
      // bekliyor) — listede de gösterme.
      return res.result.filter((x: any) => !!x?.enumName);
    },
    staleTime: Infinity,
  });
}

// Düz enum listeleri — keşif filtresindeki premium seçim pill'lerini doldurur.
// ProfileScreen aynı endpoint'leri staticGet ile çekiyor; staticGet oturum-boyu
// tek fetch yaptığı için iki ekran tek isteği paylaşır.
// enumName'i olmayan kayıt filtreye gönderilemez (backend enum string bekliyor)
// — listede de gösterme.
function useEnumOptions(key: readonly string[], endpoint: string) {
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<EnumOption[]> => {
      const res = (await staticGet(endpoint)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      return res.result.filter((x: any) => !!x?.enumName);
    },
    staleTime: Infinity,
  });
}

export function useZodiacs() {
  return useEnumOptions(commonKeys.zodiacs, API_ENDPOINTS.GET_ZODIACS);
}

export function useSmokingStatuses() {
  return useEnumOptions(
    commonKeys.smokingStatuses,
    API_ENDPOINTS.GET_SMOKING_STATUSES,
  );
}

// Evcil hayvan türleri — artık keşif filtresi de kullanıyor (`pets` alanı,
// tür bazlı çoklu seçim). Legacy `hasPets: bool?` filtresi duruyor ama spesifik
// seçim onu eziyor (bkz. FilterModal pet bölümü).
//
// Sıralama backend'den geldiği gibi korunuyor: önce gerçek türler, sonra
// None / Allergic / Other. Bu üçü profil ekranı için anlamlı ("benim hayvanım
// yok"), filtre için değil — eleme FilterModal'da (FILTER_HIDDEN_PETS), burada
// değil: aynı hook'u profil tarafı da tüketebilsin.
export function usePets() {
  return useEnumOptions(commonKeys.pets, API_ENDPOINTS.GET_PETS);
}

// Alkol tercihi (None / Socially / Regularly) — premium filtre.
export function useAlcoholUsages() {
  return useEnumOptions(
    commonKeys.alcoholUsages,
    API_ENDPOINTS.GET_ALCOHOL_USAGES,
  );
}

// useUsagePurposes KALDIRILDI: "kullanım amacı" alanı üründen çıktı
// (endpoint boş liste dönüyor, filtre bölümü de kaldırıldı).

// Dini görüş (ReligiousViewType) — 2026-08-17 sözleşmesiyle keşif filtresine de
// girdi (`religiousViews`, premium hard filtre). ProfileScreen aynı endpoint'i
// staticGet ile çekiyor, yani iki ekran tek isteği paylaşıyor.
// `PreferNotToSay` listede DÖNÜYOR ama filtrede gösterilmiyor — eleme
// FilterModal'da (FILTER_HIDDEN_RELIGIOUS_VIEWS), burada değil: profil tarafı
// aynı hook'u tüketebilsin (pets'teki desenle aynı).
export function useReligiousViews() {
  return useEnumOptions(
    commonKeys.religiousViews,
    API_ENDPOINTS.GET_RELIGIOUS_VIEWS,
  );
}

// Konuşulan diller (LanguageType, 34 değer) — profilde kullanıcının kendi
// dilleri, filtrede "en az birini konuşsun" (OR) tercihi. Liste uzun olduğu
// için filtre tarafı pill yerine aranabilir picker kullanıyor
// (LanguagePickerModal).
export function useLanguages() {
  return useEnumOptions(commonKeys.languages, API_ENDPOINTS.GET_LANGUAGES);
}

export function useDepartments() {
  return useQuery({
    queryKey: commonKeys.departments,
    queryFn: async (): Promise<DepartmentOption[]> => {
      const res = (await api.get(API_ENDPOINTS.GET_DEPARTMENTS)) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      return res.result;
    },
    staleTime: Infinity,
  });
}
