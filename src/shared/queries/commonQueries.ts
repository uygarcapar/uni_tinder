import { useQuery } from "@tanstack/react-query";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";

export type CityOption = {
  id: number;
  name: string;
  enumName: string;
};

export const commonKeys = {
  cities: ["common", "cities"] as const,
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
