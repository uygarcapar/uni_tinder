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
import { swipeKeys } from "@/features/discover/swipeKeys";
import uiBus from "@/shared/services/uiBus";
import type { SwipeStats } from "@/shared/types";
import { selectIsPremium } from "@/features/profile/subscriptionSlice";
import {
  DEFAULT_AGE_RANGE,
  DISTANCE_RANGE_KM,
  MAX_PREFERRED_HOBBIES,
  MAX_SWIPE_PAGE_SIZE,
  MAX_UNIVERSITY_DOMAINS,
  UNLIMITED,
} from "@/shared/constants/limits";

// Anahtarlar ayrı modülde (swipeKeys.ts); buradan re-export ediliyor ki mevcut
// `from "@/features/discover/swipeQueries"` import'ları değişmesin.
export { swipeKeys };

/**
 * Paywall sinyalini tek noktadan yorumla ve uiBus'a emit et.
 *
 * Backend paywall'ı üç farklı kabukta dönebiliyor: 200 + `isSuccess:false`
 * (swipe akışı), 403 (filtreler / missed-match recovery), 402 (chat). Bu yüzden
 * HTTP status'e değil `paywallType` alanının varlığına bakıyoruz.
 *
 * `showPaywall:false` + `paywallType` dolu = premium kullanıcının cycle'ı doldu
 * (ör. haftalık 5 SuperLike). Bu durumda paywall AÇILMAZ, sadece bilgi verilir —
 * çağıran taraf `showPaywall`e göre karar verebilsin diye event'e geçiriyoruz.
 */
function emitPaywall(node: any, event: string): boolean {
  const paywallType = node?.paywallType;
  if (!paywallType) return false;
  uiBus.emit(event, {
    paywallType,
    showPaywall: node.showPaywall === true,
    message: node.paywallMessage || node.message || null,
  });
  return true;
}

// Sayfa boyu = havuzun TAMAMI (50). Backend sayfalaması bellek içi: her istek
// aday havuzunun tümünü çekip Skip/Take yapıyor, dolayısıyla 10'ar 10'ar
// istemek beş kat istek demek ama beşte bir maliyet DEĞİL. Havuzun kendisi de
// en fazla 50 (TargetPoolSize) → tek istekte deste biter, `hasNextPage` pratikte
// hep false olur ve sayfa sınırında kullanıcıyı bekleten ikinci tur kalkar.
// (Tavanın üstü 50'ye kırpılmaz, 10'a düşer — bkz. MAX_SWIPE_PAGE_SIZE.)
export function usePotentialMatches(pageSize = MAX_SWIPE_PAGE_SIZE) {
  const size = Math.min(Math.max(1, pageSize), MAX_SWIPE_PAGE_SIZE);
  return useInfiniteQuery({
    queryKey: swipeKeys.matches,
    queryFn: async ({ pageParam = 1 }: { pageParam: number }) => {
      const result = await swipeService.getPotentialMatches(null, pageParam, size);
      return result;
    },
    initialPageParam: 1,
    // Cursor OTORİTESİ lastPageParam — yani gerçekten istediğimiz sayfa numarası.
    // lastPage.currentPage'e güvenilemez: swipeService'teki emptyResult defaultu
    // `currentPage: 1` ve response'a spread ediliyor, backend alanı göndermezse
    // her sayfa 1 döner → next param sonsuza kadar 2'de çakılır, aynı sayfa
    // tekrar tekrar append edilir (dedupe hepsini eler → sonsuz fetch döngüsü).
    // Boş sayfa da terminal kabul ediliyor: hasNextPage true gelse bile profil
    // eklenmiyorsa devam etmenin anlamı yok, sadece döngü besler.
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage.hasNextPage) return undefined;
      if ((lastPage.profiles?.length ?? 0) === 0) return undefined;
      return (lastPageParam ?? lastPage.currentPage ?? 0) + 1;
    },
    staleTime: 60 * 1000,
    // Kendiliğinden refetch YOK. Infinite query'de refetch = TÜM sayfaların
    // baştan çekilmesi; backend swipe edilenleri elediği için dizi başından
    // kayıyor ve DiscoverScreen'in üst kartı değişiyor. Deste bilinçli olarak
    // tazeleniyor: filtre kaydetme / profil-dil-satın alma invalidate'i /
    // deste boşken 5sn'lik yoklama. İlk mount'ta cache boş olduğu için ilk
    // fetch bundan etkilenmez.
    refetchOnMount: false,
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
        // Tier kotası + satın alınan kredi TOPLAMI, tabanı 0 (backend garantisi).
        // `purchasedSuperLikes` süresiz krediyi, `quotaSuperLikesRemaining`
        // yalnız tier kotasından kalanı ayrıştırır — toplam FE'de yeniden
        // hesaplanmaz.
        superLikesRemaining: r.superLikesRemaining ?? null,
        purchasedSuperLikes: r.purchasedSuperLikes ?? null,
        quotaSuperLikesRemaining: r.quotaSuperLikesRemaining ?? null,
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
        // Tavanlar — backend SwipeLimitsOptions'tan tier'a göre dönüyor.
        // UNLIMITED (-1) = sınırsız. null = eski backend sürümü (alan yok);
        // tüketiciler bu durumda oran/optimistic hesaplamayı atlıyor.
        dailySwipeLimit: r.dailySwipeLimit ?? null,
        weeklySuperLikeLimit: r.weeklySuperLikeLimit ?? null,
        dailyUndoLimit: r.dailyUndoLimit ?? null,
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
    // `serverIsPremium` = /Stats'ın DOKUNULMAMIŞ cevabı. Aşağıdaki overlay
    // `isPremium`i redux'a göre true'ya çekebildiği için, "backend premium'u
    // gördü mü" sorusunun tek dürüst cevabı bu alan. Satın alma ile webhook
    // arasındaki pencerede false kalır → o pencerede kota SAYILARI hâlâ free
    // tier'ın, tüketiciler sayı göstermek yerine "güncelleniyor" diyebilsin.
    const serverIsPremium = result.data.isPremium;
    const effectivePremium = serverIsPremium || subscriptionIsPremium;
    if (!effectivePremium) return { ...result.data, serverIsPremium };
    if (
      serverIsPremium &&
      result.data.remainingSwipes === UNLIMITED &&
      result.data.remainingUndos === UNLIMITED
    ) {
      return { ...result.data, serverIsPremium };
    }
    // superLikesRemaining'e BİLEREK dokunmuyoruz: premium'da SuperLike
    // sınırsız değil (weeklySuperLikeLimit / 7-gün rolling), doğru bakiye
    // ancak backend'den gelir. Satın alma anındaki optimistic değeri
    // PurchaseModal yazıyor.
    return {
      ...result.data,
      serverIsPremium,
      isPremium: true,
      remainingSwipes: UNLIMITED,
      remainingUndos: UNLIMITED,
      dailySwipeLimit: UNLIMITED,
      dailyUndoLimit: UNLIMITED,
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

        if (direction === "up") {
          if (typeof next.superLikesRemaining === "number" && next.superLikesRemaining > 0) {
            next.superLikesRemaining -= 1;
          }
          next.superLikesToday = (next.superLikesToday ?? 0) + 1;
          return next;
        }

        next.totalSwipesToday = (next.totalSwipesToday ?? 0) + 1;

        // Pass günlük like kotasına DAHİL DEĞİL — backend DailyLimitBehavior
        // yalnızca Like/SuperLike'ı sayıyor. Burada da düşürülünce free
        // kullanıcı 30 pass'ten sonra kotası dolmuş gibi görünüyordu.
        if (direction === "left") {
          next.passesToday = (next.passesToday ?? 0) + 1;
          return next;
        }

        if (typeof next.remainingSwipes === "number" && next.remainingSwipes > 0) {
          next.remainingSwipes -= 1;
        }
        next.likesToday = (next.likesToday ?? 0) + 1;
        return next;
      });
    },
    onSuccess: (response: any, variables: { direction: string; userId: string }) => {
      const swipeResult = response?.result;
      const isSuperLike = variables?.direction === "up";

      // SuperLike yanıtı bakiyenin server-truth'unu taşıyor: `remainingSuperLikes`
      // toplam (kota + kredi), `remainingPurchasedSuperLikes` kredinin kalanı.
      // onMutate'teki optimistic decrement yalnızca toplamı düşürüyor; kota mı
      // kredi mi harcandığını backend biliyor, o yüzden gelen değerlerle
      // hizalıyoruz (aksi halde satın alınan kredi göstergesi kayıyor).
      if (isSuperLike) {
        qc.setQueryData(swipeKeys.stats, (prev: any) => {
          if (!prev) return prev;
          const next = { ...prev };
          if (typeof swipeResult?.remainingSuperLikes === "number") {
            next.superLikesRemaining = swipeResult.remainingSuperLikes;
          }
          if (typeof swipeResult?.remainingPurchasedSuperLikes === "number") {
            next.purchasedSuperLikes = swipeResult.remainingPurchasedSuperLikes;
          }
          return next;
        });
      }

      // NOT: SuperLike kotası bittiğinde `showPaywall` artık PREMIUM'da da true
      // dönüyor (premium kullanıcı da paket satın alabiliyor). Bu event'i
      // DiscoverScreen premium paywall'ına değil SuperLikePurchaseModal'a bağlı.
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
      interestedIn?: number[];
      preferredCity?: string | null;
      preferredUniversityDomains?: string[];
      visibleOnlyToUniversityDomains?: string[];
      hiddenFromUniversityDomains?: string[];
      preferredHobbies?: string[];
      relationshipIntents?: string[];
      // Dealbreaker'lı premium filtreler (boy/sınıf/burç/sigara/evcil hayvan/
      // kullanım amacı) API adlarıyla ANAHTARLANMIŞ halde geliyor. Adlar
      // FilterModal'daki FILTER_FIELD map'inde tanımlı; burada tek blok olarak
      // geçiriliyor ki ad bilgisi iki yere dağılmasın.
      premiumFilters?: Record<string, unknown>;
      // Hangi filtreler "olmazsa olmaz". Semantiği diğerlerinden FARKLI:
      // alan yok/null = değiştirme, [] = hepsini esnet, [...] = tam liste.
      dealbreakers?: string[];
    }) => {
      // `city` premium-only alan: doluyken free kullanıcıda backend TÜM isteği
      // 403 + PREMIUM_FILTERS ile reddediyor (yaş/mesafe güncellemesi de gider).
      // Free'de null gönderilmesini FilterModal garanti ediyor.
      const payload: Record<string, unknown> = {
        ageRangeMin: localFilters.ageRangeMin ?? DEFAULT_AGE_RANGE.min,
        ageRangeMax: localFilters.ageRangeMax ?? DEFAULT_AGE_RANGE.max,
        maxDistance: localFilters.maxDistance ?? DISTANCE_RANGE_KM.min,
        // NOT: `genders` artık gönderilmiyor. Cinsiyet tercihi tek kaynaktan
        // (interestedIn) yürüyor; backend HardFilterStage'deki hasGenderFilter
        // dalını kaldırdı, PreferredGendersFlags hiçbir yerde okunmuyor.
        city: localFilters.preferredCity ?? null,
        // GET ↔ PUT ad uyuşmazlığı (backend'in bilinen tuzağı): yanıt
        // `preferredUniversityDomains` döner ama PUT `universityDomains` bekler.
        // GET'ten geleni doğrudan geri gönderirsen alan SESSİZCE düşer.
        // Şehir/bölümde de aynı sapma var (preferredCity → city).
        //
        // Tekil `universityDomain` hâlâ kabul ediliyor ama DEPRECATED; ikisi
        // birden gönderilirse çoğul kazanır. Yeni kodda sadece çoğulu yolluyoruz.
        // Görünürlük listeleriyle aynı OVERWRITE semantiği: boş dizi =
        // "filtreyi temizle", "değiştirme" değil. Backend 3'ten fazlasını 400
        // ile reddediyor — FilterModal seçimi zaten sınırlıyor, burada ikinci
        // savunma hattı olarak kırpıyoruz.
        universityDomains: (localFilters.preferredUniversityDomains ?? []).slice(
          0,
          MAX_UNIVERSITY_DOMAINS,
        ),
        // Görünürlük listeleri ("beni kim görsün/görmesin") — premium-only,
        // ikisi de domain string listesi. Backend bu alanları OVERWRITE
        // ediyor: gönderilmeyen ya da boş dizi gelen liste temizlenir, o
        // yüzden FilterModal her kaydetmede güncel state'in tamamını yolluyor
        // ve burada alanı koşullu bırakmıyoruz. Boş dizi = kısıtlama yok,
        // free kullanıcıda da 403 tetiklemez.
        visibleOnlyToUniversityDomains:
          localFilters.visibleOnlyToUniversityDomains ?? [],
        hiddenFromUniversityDomains:
          localFilters.hiddenFromUniversityDomains ?? [],
        // "Karşımda görmek istediğim hobiler" (PreferredHobbies) — enumName
        // string dizisi, premium-only, HARD FİLTRE DEĞİL: backend skor boost'u
        // olarak kullanıyor. Görünürlük listeleri gibi overwrite semantiği →
        // boş dizi tercihi temizler, o yüzden koşulsuz gönderiliyor.
        // Backend max 10 kabul ediyor (fazlası 400); FilterModal seçimi zaten
        // sınırlıyor, burada ikinci savunma hattı olarak kırpıyoruz.
        preferredHobbies: (localFilters.preferredHobbies ?? []).slice(
          0,
          MAX_PREFERRED_HOBBIES,
        ),
        // "Karşımda hangi ilişki niyetleri olsun" (RelationshipIntents) —
        // enumName string dizisi, premium-only, preferredHobbies ile aynı
        // sınıf: HARD FİLTRE DEĞİL, skor boost'u (max +12). Niyetini
        // doldurmamış adaylar destede kalır. Overwrite semantiği → boş dizi
        // tercihi temizler, o yüzden koşulsuz gönderiliyor.
        relationshipIntents: localFilters.relationshipIntents ?? [],
        // Boy/sınıf/burç/sigara/evcil hayvan/kullanım amacı — API adlarıyla
        // anahtarlanmış halde geliyor, olduğu gibi payload'a giriyor. Bunlar da
        // OVERWRITE: boş dizi / null = tercihi temizle.
        ...(localFilters.premiumFilters ?? {}),
      };
      // `dealbreakers` KOŞULLU: alan yok/null = "değiştirme", boş dizi =
      // "hepsini esnet". Yani listeyi her PUT'ta göndermek zorunlu değil, ama
      // gönderilirse TAM liste olmalı (kısmi güncelleme yok). Toggle'ları hiç
      // çizmeyen bir durumda (backend dealbreakerCapableFields döndürmezse)
      // alan gelmez ve kullanıcının kayıtlı ayarı korunur — boş dizi
      // göndermek onu sessizce sıfırlardı.
      // Geçersiz ad 400 ("Geçersiz dealbreaker alanı: X"), free kullanıcı
      // 403 + ShowPaywall döner; ikisi de aşağıdaki catch'te ele alınıyor.
      if (Array.isArray(localFilters.dealbreakers)) {
        payload.dealbreakers = localFilters.dealbreakers;
      }
      // interestedIn (InterestedInType[]: Men=0, Women=1, NonBinary=2) free alan.
      // Backend semantiği: alan yok/null = değiştirme, boş dizi = 7 (herkes),
      // dolu dizi = o değere ayarla. Boş diziyi yine de göndermiyoruz: FilterModal
      // register'la aynı min-1 kuralını uyguluyor, "hiçbiri seçili değil" diye
      // belirsiz bir durum oluşmasın.
      if (
        Array.isArray(localFilters.interestedIn) &&
        localFilters.interestedIn.length > 0
      ) {
        payload.interestedIn = localFilters.interestedIn;
      }
      try {
        const res = await api.put(API_ENDPOINTS.SWIPE_UPDATE_FILTERS, payload) as any;
        if (!res.isSuccess) {
          // Backend 200 + isSuccess:false ile de paywall dönebiliyor.
          emitPaywall(res.result, "swipePaywall");
          throw new Error(res.message || "Filters save failed");
        }
        return res.result;
      } catch (e: any) {
        // Premium-only alan free kullanıcıda 403 + PREMIUM_FILTERS döner.
        // FilterModal bunu göndermemeye çalışıyor ama tek savunma hattı
        // olmamalı (downgrade sonrası kayıtlı değerler, yeni alan eklenmesi).
        emitPaywall(e?.response?.data?.result ?? e?.response?.data, "swipePaywall");
        // 400 = validation (ör. 10'dan fazla hobi). Axios'un jenerik
        // "Request failed with status code 400" mesajı yerine backend'in
        // açıklamasını yükselt — DiscoverScreen bunu Alert'te gösteriyor.
        const validationMessage =
          e?.response?.status === 400
            ? e?.response?.data?.message ?? e?.response?.data?.title
            : null;
        if (validationMessage) throw new Error(validationMessage);
        throw e;
      }
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
        // Günlük undo kotası dolduğunda backend 200 + isSuccess:false +
        // UNDO_LIMIT dönüyor; bu paywall hiç bağlı değildi, kullanıcı sadece
        // "Geri alınamadı" hatası görüyordu.
        emitPaywall(res.result, "swipePaywall");
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
