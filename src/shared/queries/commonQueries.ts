import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";

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

export const commonKeys = {
  cities: ["common", "cities"] as const,
  districts: (cityId: number | string) =>
    ["common", "districts", cityId] as const,
  departments: ["common", "departments"] as const,
};

export function useCities() {
  return useQuery({
    queryKey: commonKeys.cities,
    queryFn: async (): Promise<CityOption[]> => {
      const res = (await api.get(API_ENDPOINTS.GET_CITIES)) as any;
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
