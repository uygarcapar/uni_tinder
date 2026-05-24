import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useMemo } from "react";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";
import swipeService from "../services/swipeService";
import uiBus from "../services/uiBus";

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
  const result = useQuery({
    queryKey: swipeKeys.stats,
    queryFn: async () => {
      const res = await api.get(API_ENDPOINTS.SWIPE_STATS);
      if (!res.isSuccess || !res.result) throw new Error("Stats fetch failed");
      const r = res.result;
      if (__DEV__) console.log("[SwipeStats response]", r);
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
    // Stats sadece bir kez fetch — sonraki update'ler optimistik setQueryData
    // ile. Otomatik refetch yok (her swipe sonrası gereksiz GET Stats önlenir).
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Redux subscription state overlay — backend webhook geç işlerse stats
  // response'unda isPremium=false ve eski kotalar gelir. RC (veya manuel
  // setPremium) premium dediyse, response'u override edip sınırsız (-1)
  // değerleri kullan. Tüm consumer'lar (DiscoverScreen, WaveFillLogo,
  // StatsPopup, vs.) otomatik olarak doğru gösterir.
  const subscriptionIsPremium = useSelector(
    (s) => s.subscription?.isPremium ?? false,
  );
  const data = useMemo(() => {
    if (!result.data) return result.data;
    const effectivePremium = result.data.isPremium || subscriptionIsPremium;
    if (!effectivePremium) return result.data;
    // Zaten doğru ise yeni obje yaratıp ref değiştirme.
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
    mutationFn: ({ direction, userId }) => {
      if (direction === "up") return swipeService.superLikeUser(userId);
      if (direction === "left") return swipeService.passUser(userId);
      return swipeService.likeUser(userId);
    },
    // Optimistik: swipe sonrası remainingSwipes'ı hemen 1 azalt → logo dalga
    // animasyonu anlık güncellensin. SuperLike için superLikesRemaining da.
    // SuperLike (direction === "up") backend tarafında daily swipe limit'ten
    // muaf — DailySwipeCount artmıyor. remainingSwipes/totalSwipesToday'i de
    // ona göre dokunma, aksi halde refetch'te revert flicker'ı oluyor.
    onMutate: ({ direction }) => {
      qc.setQueryData(swipeKeys.stats, (prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        const isSuperLike = direction === "up";
        if (!isSuperLike) {
          if (
            typeof next.remainingSwipes === "number" &&
            next.remainingSwipes > 0
          ) {
            next.remainingSwipes -= 1;
          }
          next.totalSwipesToday = (next.totalSwipesToday ?? 0) + 1;
        }
        if (isSuperLike) {
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
    onSuccess: (response, variables) => {
      if (__DEV__) {
        console.log(
          `[Swipe response] dir=${variables?.direction}`,
          response,
        );
      }
      // Backend SwipeResultDto.IsSuccess=false + ShowPaywall=true ile geldiğinde
      // (kotaya ulaşıldı) → uiBus üzerinden Discover'a haber ver, paywall açılsın.
      // ResponseDto wrapper: response = { isSuccess, result: { showPaywall, paywallType, ... } }
      const swipeResult = response?.result;
      const isSuperLike = variables?.direction === "up";
      if (swipeResult?.showPaywall) {
        // SuperLike için ayrı modal — paywallType "superlike" olabilir veya
        // direction üzerinden de bilebiliriz.
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
    onError: (err, variables) => {
      if (__DEV__) {
        console.log(
          `[Swipe error] dir=${variables?.direction}`,
          err?.response?.data ?? err?.message,
        );
      }
    },
    // Önceden onSettled'te her swipe sonrası stats invalidation vardı —
    // gereksiz GET /swipe/stats + ~7 subscriber re-render cascade JS thread'i
    // kasıyordu. Stats sadece session başına 1 kez fetch'leniyor; sonraki tüm
    // hak azaltmaları onMutate içindeki optimistic setQueryData ile yapılıyor
    // (hem normal swipe hem superlike için). Reload edilirse cache resetlenip
    // bir sonraki useSwipeStats() çağrısı fresh fetch atar.
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
