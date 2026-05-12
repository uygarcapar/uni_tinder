import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import swipeService from "../services/swipeService";

export const swipeKeys = {
  matches: ["swipe", "matches"],
  filters: ["swipe", "filters"],
  stats: ["swipe", "stats"],
};

export function usePotentialMatches(pageSize = 10) {
  return useInfiniteQuery({
    queryKey: swipeKeys.matches,
    queryFn: async ({ pageParam = 1 }) => {
      const result = await swipeService.getPotentialMatches(
        null,
        pageParam,
        pageSize,
      );
      if (__DEV__) {
        console.log(
          `[swipeQueries] page ${pageParam} → profiles=${result.profiles?.length ?? 0} hasNextPage=${result.hasNextPage} currentPage=${result.currentPage}`,
        );
      }
      return result;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasNextPage) return undefined;
      return (lastPage.currentPage ?? lastPageParam ?? 0) + 1;
    },
    staleTime: 60 * 1000,
  });
}

export function useSwipeFilters() {
  return useQuery({
    queryKey: swipeKeys.filters,
    queryFn: async () => {
      const res = await api.get(API_ENDPOINTS.SWIPE_FILTERS);
      if (!res.isSuccess || !res.result) throw new Error("Filters fetch failed");
      return res.result;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSwipeStats() {
  return useQuery({
    queryKey: swipeKeys.stats,
    queryFn: async () => {
      const res = await api.get(API_ENDPOINTS.SWIPE_STATS);
      if (!res.isSuccess || !res.result) throw new Error("Stats fetch failed");
      const r = res.result;
      return {
        remainingSwipes: r.remainingSwipes ?? null,
        superLikesRemaining: r.superLikesRemaining ?? null,
        swipeCountResetAt: r.swipeCountResetAt ?? null,
        superLikeCountResetAt: r.superLikeCountResetAt ?? null,
        premiumExpiresAt: r.premiumExpiresAt ?? null,
        isPremium: r.isPremium ?? false,
        totalSwipesToday: r.totalSwipesToday ?? 0,
        likesToday: r.likesToday ?? 0,
        passesToday: r.passesToday ?? 0,
        superLikesToday: r.superLikesToday ?? 0,
        matchesToday: r.matchesToday ?? 0,
        remainingUndos: r.remainingUndos ?? null,
        undoCountResetAt: r.undoCountResetAt ?? null,
        remainingMissedMatchRecovery: r.remainingMissedMatchRecovery ?? null,
        missedMatchRecoveryResetAt: r.missedMatchRecoveryResetAt ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}

export function useSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ direction, userId }) => {
      if (direction === "up") return swipeService.superLikeUser(userId);
      if (direction === "left") return swipeService.passUser(userId);
      return swipeService.likeUser(userId);
    },
    // Optimistik: swipe sonrası remainingSwipes'ı hemen 1 azalt → logo dalga
    // animasyonu anlık güncellensin. SuperLike için superLikesRemaining da.
    onMutate: ({ direction }) => {
      qc.setQueryData(swipeKeys.stats, (prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (typeof next.remainingSwipes === "number" && next.remainingSwipes > 0) {
          next.remainingSwipes -= 1;
        }
        next.totalSwipesToday = (next.totalSwipesToday ?? 0) + 1;
        if (direction === "up") {
          if (
            typeof next.superLikesRemaining === "number" &&
            next.superLikesRemaining > 0
          ) {
            next.superLikesRemaining -= 1;
          }
          next.superLikesToday = (next.superLikesToday ?? 0) + 1;
        } else if (direction === "left") {
          next.passesToday = (next.passesToday ?? 0) + 1;
        } else {
          next.likesToday = (next.likesToday ?? 0) + 1;
        }
        return next;
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: swipeKeys.stats });
    },
  });
}

export function useSaveFilters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (localFilters) => {
      const payload = {
        ageRangeMin: localFilters.ageRangeMin || 18,
        ageRangeMax: localFilters.ageRangeMax || 30,
        maxDistance: localFilters.maxDistance || 50,
        genders: localFilters.genders,
      };
      const res = await api.put(API_ENDPOINTS.SWIPE_UPDATE_FILTERS, payload);
      if (!res.isSuccess) throw new Error(res.message || "Filters save failed");
      return res.result;
    },
    onSuccess: (result) => {
      qc.setQueryData(swipeKeys.filters, result);
      qc.invalidateQueries({ queryKey: swipeKeys.matches });
    },
  });
}

export function useUndoSwipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(API_ENDPOINTS.SWIPE_UNDO);
      if (!res.isSuccess) {
        throw new Error(
          res.result?.message || res.message || "Geri alınamadı",
        );
      }
      return res.result;
    },
    onSuccess: (result) => {
      if (result?.remainingUndosToday != null) {
        qc.setQueryData(swipeKeys.stats, (prev) =>
          prev ? { ...prev, remainingUndos: result.remainingUndosToday } : prev,
        );
      }
    },
  });
}

export function useUpdateStatsCache() {
  const qc = useQueryClient();
  return (patch) => {
    qc.setQueryData(swipeKeys.stats, (prev) =>
      prev ? { ...prev, ...patch } : prev,
    );
  };
}
