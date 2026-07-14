import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useMemo } from "react";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import swipeService from "@/features/discover/swipeService";
import uiBus from "@/shared/services/uiBus";
import type { SwipeStats } from "@/shared/types";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";

export const swipeKeys = {
  matches: ["swipe", "matches"] as const,
  filters: ["swipe", "filters"] as const,
  stats: ["swipe", "stats"] as const,
};

export function usePotentialMatches(pageSize = 10) {
  return useInfiniteQuery({
    queryKey: swipeKeys.matches,
    queryFn: async ({ pageParam = 1 }: { pageParam: number }) => {
      const result = await swipeService.getPotentialMatches(null, pageParam, pageSize);
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
      const res = await api.get(API_ENDPOINTS.SWIPE_FILTERS) as any;
      if (!res.isSuccess || !res.result) throw new Error("Filters fetch failed");
      return res.result;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useSwipeStats() {
  const result = useQuery({
    queryKey: swipeKeys.stats,
    queryFn: async () => {
      const res = await api.get(API_ENDPOINTS.SWIPE_STATS) as any;
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
        swipeResetInSeconds: r.swipeResetInSeconds ?? null,
        superLikeResetInSeconds: r.superLikeResetInSeconds ?? null,
        undoResetInSeconds: r.undoResetInSeconds ?? null,
        nextSwipeResetAt: r.nextSwipeResetAt ?? null,
        nextSuperLikeResetAt: r.nextSuperLikeResetAt ?? null,
        nextUndoResetAt: r.nextUndoResetAt ?? null,
      };
    },
    // Stats sadece bir kez fetch — sonraki update'ler optimistik setQueryData ile.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const subscriptionIsPremium = useSelector(selectIsPremium);
  const data = useMemo(() => {
    if (!result.data) return result.data;
    const effectivePremium = result.data.isPremium || subscriptionIsPremium;
    if (!effectivePremium) return result.data;
    if (
      result.data.isPremium &&
      result.data.remainingSwipes === -1 &&
      result.data.remainingUndos === -1
    ) {
      return result.data;
    }
    return {
      ...result.data,
      isPremium: true,
      remainingSwipes: -1,
      remainingUndos: -1,
    };
  }, [result.data, subscriptionIsPremium]);

  return { ...result, data };
}

export function useSwipeMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ direction, userId }: { direction: string; userId: string }) => {
      if (direction === "up") return swipeService.superLikeUser(userId);
      if (direction === "left") return swipeService.passUser(userId);
      return swipeService.likeUser(userId);
    },
    onMutate: ({ direction }: { direction: string; userId: string }) => {
      qc.setQueryData(swipeKeys.stats, (prev: any) => {
        if (!prev) return prev;
        const next = { ...prev };
        const isSuperLike = direction === "up";
        if (!isSuperLike) {
          if (typeof next.remainingSwipes === "number" && next.remainingSwipes > 0) {
            next.remainingSwipes -= 1;
          }
          next.totalSwipesToday = (next.totalSwipesToday ?? 0) + 1;
        }
        if (isSuperLike) {
          if (typeof next.superLikesRemaining === "number" && next.superLikesRemaining > 0) {
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
    onSuccess: (response: any, variables: { direction: string; userId: string }) => {
      const swipeResult = response?.result;
      const isSuperLike = variables?.direction === "up";
      if (swipeResult?.showPaywall) {
        const isSuperLikePaywall =
          isSuperLike ||
          String(swipeResult?.paywallType ?? "").toLowerCase().includes("super");
        const event = isSuperLikePaywall ? "superLikePaywall" : "swipePaywall";
        uiBus.emit(event, {
          paywallType: swipeResult.paywallType,
          message: swipeResult.paywallMessage || swipeResult.message,
        });
      }
    },
  });
}

export function useSaveFilters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (localFilters: {
      ageRangeMin?: number;
      ageRangeMax?: number;
      maxDistance?: number;
      genders?: string[];
      preferredCity?: string | null;
    }) => {
      const payload = {
        ageRangeMin: localFilters.ageRangeMin || 18,
        ageRangeMax: localFilters.ageRangeMax || 30,
        maxDistance: localFilters.maxDistance || 50,
        genders: localFilters.genders,
        city: localFilters.preferredCity ?? null,
      };
      const res = await api.put(API_ENDPOINTS.SWIPE_UPDATE_FILTERS, payload) as any;
      if (!res.isSuccess) throw new Error(res.message || "Filters save failed");
      return res.result;
    },
    onSuccess: (result: any) => {
      qc.setQueryData(swipeKeys.filters, result);
      qc.invalidateQueries({ queryKey: swipeKeys.matches });
    },
  });
}

export function useUndoSwipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post(API_ENDPOINTS.SWIPE_UNDO) as any;
      if (!res.isSuccess) {
        throw new Error(res.result?.message || res.message || "Geri alınamadı");
      }
      return res.result;
    },
    onSuccess: (result: any) => {
      if (result?.remainingUndosToday != null) {
        qc.setQueryData(swipeKeys.stats, (prev: any) =>
          prev ? { ...prev, remainingUndos: result.remainingUndosToday } : prev,
        );
      }
    },
  });
}

export function useUpdateStatsCache() {
  const qc = useQueryClient();
  return (patch: Partial<SwipeStats>) => {
    qc.setQueryData(swipeKeys.stats, (prev: any) =>
      prev ? { ...prev, ...patch } : prev,
    );
  };
}
