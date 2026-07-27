import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { staticGet } from "@/shared/services/staticCache";

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

export const commonKeys = {
  cities: ["common", "cities"] as const,
  districts: (cityId: number | string) =>
    ["common", "districts", cityId] as const,
  departments: ["common", "departments"] as const,
  genders: ["common", "genders"] as const,
};

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

export function useDistrictsByCity(cityId: number | null | undefined) {
  return useQuery({
    queryKey: commonKeys.districts(cityId ?? ""),
    queryFn: async (): Promise<DistrictOption[]> => {
      if (cityId == null) return [];
      const res = (await api.get(
        API_ENDPOINTS.GET_DISTRICTS_BY_CITY(cityId),
      )) as any;
      if (!res?.isSuccess || !Array.isArray(res.result)) return [];
      return res.result;
    },
    enabled: cityId != null,
    staleTime: Infinity,
  });
}

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
