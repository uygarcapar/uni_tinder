import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { useCallback, useMemo } from "react";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import swipeService from "@/features/discover/swipeService";
import { swipeKeys } from "@/features/discover/swipeKeys";
import { spendRecoveryPatch } from "@/features/discover/recoveryQuota";
import { noteTargetPayload } from "@/features/discover/noteTarget";
import uiBus from "@/shared/services/uiBus";
import type { NoteTarget, SwipeStats } from "@/shared/types";
import {
  selectIsPremium,
  selectPremiumResolved,
} from "@/features/profile/subscriptionSlice";
import {
  DEFAULT_AGE_RANGE,
  DISTANCE_RANGE_KM,
  FREE_MAX_DISTANCE_KM,
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

/**
 * "Mesafe sınırı olmasın" anahtarını TEK BAŞINA yaz (2026-08-22 sözleşmesi).
 *
 * Neden `useSaveFilters` DEĞİL: o mutation tam bir filtre payload'ı kuruyor ve
 * alanların çoğu OVERWRITE semantiğinde (boş dizi = tercihi temizle). Boş bir
 * local state'le çağrılırsa kullanıcının hobilerini/üniversitelerini/görünürlük
 * listelerini sessizce siler. Burada yalnız tek alan gidiyor; gönderilmeyen
 * alan "değiştirme" demek, yani diğer filtreler olduğu gibi kalıyor.
 *
 * Free kullanıcı da açabiliyor — paywall guard'ının DIŞINDA, 403 dönmüyor.
 *
 * Anahtar değişince backend Redis aday havuzunu düşürüp sıra tohumunu
 * yeniliyor; ekstra cache-busting parametresi gerekmiyor, deste invalidate'i
 * yeterli.
 */
export function useSetIgnoreDistanceFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ignoreDistanceFilter: boolean) => {
      const res = (await api.put(API_ENDPOINTS.SWIPE_UPDATE_FILTERS, {
        ignoreDistanceFilter,
      })) as any;
      if (!res.isSuccess) throw new Error(res.message || "Filters save failed");
      return res.result;
    },
    onSuccess: (result: any) => {
      // useSaveFilters'takiyle aynı MERGE gerekçesi: PUT yanıtı GET'in tüm
      // alanlarını taşımıyor (min/maxSelectableDistanceKm düz replace'te
      // düşerdi ve slider sınırları tier sabitlerine geri kayardı).
      qc.setQueryData(swipeKeys.filters, (prev: any) =>
        prev ? { ...prev, ...result } : result,
      );
      qc.invalidateQueries({ queryKey: swipeKeys.matches });
    },
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
        // Kaçırılan eşleşme kurtarma — 2026-08-22'den beri GÜNLÜK DEĞİL:
        // free'de kota 0 (yalnız satın alınan kredi), premium'da tier başına
        // 1/2/5 ve abonelik döngüsüyle yenileniyor. Alan tier kotası + satın
        // alınan kredi TOPLAMINI taşımaya devam ediyor (SuperLike üçlüsüyle
        // birebir aynı desen) — toplam FE'de yeniden hesaplanmaz.
        remainingMissedMatchRecovery: r.remainingMissedMatchRecovery ?? null,
        quotaRecoveryRemaining: r.quotaRecoveryRemaining ?? null,
        purchasedRecoveries: r.purchasedRecoveries ?? null,
        // ⚠️ Tavan alanı ama `-1` DÖNMEZ: premium de sonlu kotaya tabi.
        // `dailySwipeLimit`/`dailyUndoLimit` için yazılan "-1 ise sınırsız"
        // dalını buraya kopyalamayın — "2/2" yerine "∞" yazardı. Bakiye tavanı
        // da DEĞİL (kredi + tier düşüşü onu aşabilir); payda tek yerden
        // çözülüyor, bkz. recoveryQuota.ts.
        dailyMissedMatchRecoveryLimit: r.dailyMissedMatchRecoveryLimit ?? null,
        // Kaçırılan eşleşme penceresi (gün). Backend config'inden geliyor, FE'de
        // sabit tutulmuyor — metinler bu değerle kuruluyor.
        missedMatchLookbackDays: r.missedMatchLookbackDays ?? null,
        // DİKKAT: bu ikisi farklı yönlere bakıyor — `missedMatchRecoveryResetAt`
        // kotanın en son ne zaman sıfırlandığı (GEÇMİŞ), ileri sayaç için
        // `nextMissedMatchRecoveryResetAt` kullanılmalı.
        missedMatchRecoveryResetAt: r.missedMatchRecoveryResetAt ?? null,
        nextMissedMatchRecoveryResetAt: r.nextMissedMatchRecoveryResetAt ?? null,
        missedMatchRecoveryResetInSeconds:
          r.missedMatchRecoveryResetInSeconds ?? null,
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
        // Not (yorumlu beğeni) bakiyesi. `null` = backend alanı HENÜZ
        // göndermiyor; 0'a düşürmüyoruz çünkü ikisi farklı: 0 "bakiyen bitti",
        // null "sözleşme daha canlı değil". Kutu ikisinde de paket sheet'ini
        // açıyor ama composer'daki bakiye rozeti yalnız sayı varken çiziliyor.
        notesRemaining: r.notesRemaining ?? null,
        purchasedNotes: r.purchasedNotes ?? null,
        quotaNotesRemaining: r.quotaNotesRemaining ?? null,
        noteMaxLength: r.noteMaxLength ?? null,
      };
    },
    // Stats sadece bir kez fetch — sonraki update'ler optimistik setQueryData ile.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const subscriptionIsPremium = useSelector(selectIsPremium);
  const premiumResolved = useSelector(selectPremiumResolved);
  const data = useMemo(() => {
    if (!result.data) return result.data;
    // `serverIsPremium` = /Stats'ın DOKUNULMAMIŞ cevabı. Aşağıdaki overlay
    // `isPremium`i redux'a göre değiştirdiği için, "backend premium'u gördü mü"
    // sorusunun tek dürüst cevabı bu alan. Satın alma ile webhook arasındaki
    // pencerede false kalır → o pencerede kota SAYILARI hâlâ free tier'ın,
    // tüketiciler sayı göstermek yerine "güncelleniyor" diyebilsin.
    const serverIsPremium = result.data.isPremium;
    // Bayrak İKİ YÖNLÜ overlay ediliyor. Öncesi `serverIsPremium || redux` idi,
    // yani yalnız yükseltiyordu: bu sorgu oturumda BİR KEZ çekildiği için
    // (`staleTime: Infinity`) premium bitince `/stats` cevabı sonsuza kadar
    // "premium" kalıyor, backtrack hakkı ve filtre kilitleri reload'a kadar
    // açık kalıyordu. Tier'ın kanonik kaynağı abonelik slice'ı (bkz.
    // features/profile/premiumTier); backend henüz konuşmadıysa (`resolved`
    // false — reload'ın ilk anı) elimizdeki son sunucu cevabına düşüyoruz.
    const effectivePremium = premiumResolved
      ? subscriptionIsPremium
      : serverIsPremium || subscriptionIsPremium;
    if (!effectivePremium) {
      return { ...result.data, serverIsPremium, isPremium: false };
    }
    if (
      serverIsPremium &&
      result.data.remainingSwipes === UNLIMITED &&
      result.data.remainingUndos === UNLIMITED
    ) {
      return { ...result.data, serverIsPremium };
    }
    // superLikesRemaining, kurtarma ve NOT bakiyelerine BİLEREK dokunmuyoruz:
    // premium'da hiçbiri sınırsız değil (tier'a bağlı sonlu kota + abonelik
    // döngüsüyle yenilenme; notta kota hiç olmayabilir), doğru bakiye ancak
    // backend'den gelir. Satın alma anındaki optimistic değeri PurchaseModal
    // yazıyor.
    return {
      ...result.data,
      serverIsPremium,
      isPremium: true,
      remainingSwipes: UNLIMITED,
      remainingUndos: UNLIMITED,
      dailySwipeLimit: UNLIMITED,
      dailyUndoLimit: UNLIMITED,
    };
  }, [result.data, subscriptionIsPremium, premiumResolved]);

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

/**
 * Not gönderimi — yorumlu, hedefli beğeni.
 *
 * `useSwipeMutation`den AYRI tutuldu: yön (`left`/`right`/`up`) semantiği yok,
 * kotası günlük like kotası değil (ayrı consumable) ve hata yolu tamamen farklı
 * — composer açık kalıp inline hata göstermek zorunda, oysa swipe mutasyonunda
 * kart zaten uçmuş oluyor.
 *
 * ⚠️ Optimistic decrement YOK. SuperLike'ta var çünkü orada kart anında uçuyor
 * ve sayacın gecikmesi görünür oluyordu; notta kullanıcı yanıtı bekleyen bir
 * sheet'in içinde duruyor. Bakiye yalnız sunucu cevabıyla yazılıyor, böylece
 * kredi harcanmayan hatalar (UT-6404/6405/6407) bakiyeyi hiç kıpırdatmıyor.
 */
export function useNoteMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      comment,
      target,
    }: {
      userId: string;
      comment: string;
      target: NoteTarget;
    }) => swipeService.sendNote(userId, comment, noteTargetPayload(target)),
    onSuccess: (response: any) => {
      const result = response?.result;

      // Bakiyenin server-truth'u: `remainingNotes` toplam (kota + kredi),
      // `remainingPurchasedNotes` kredinin kalanı. Kota mı kredi mi harcandığını
      // yalnız backend biliyor.
      qc.setQueryData(swipeKeys.stats, (prev: any) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (typeof result?.remainingNotes === "number") {
          next.notesRemaining = result.remainingNotes;
        }
        if (typeof result?.remainingPurchasedNotes === "number") {
          next.purchasedNotes = result.remainingPurchasedNotes;
        }
        // Not günlük like kotasından DÜŞMÜYOR (öneri dokümanı D2) →
        // `remainingSwipes`/`likesToday` bilerek elle sürülmüyor.
        return next;
      });

      // ⚠️ `result.isMatch` OKUNMUYOR: bu uçta karşılıklı beğenide bile hep
      // `false` dönüyor (Like/SuperLike de öyle) ve `matchId` DTO'da hiç yok.
      // Eşleşme SignalR `MatchNotification` ile geliyor.

      // Bakiye biterken gelen paywall. Normal yolda buraya HİÇ girilmez: bakiye
      // bittiğinde uç 402 + UT-6401 atıyor, yani mutation reject oluyor ve sheet
      // DiscoverScreen'in catch'inden açılıyor. Bu dal yalnız sunucu bir gün
      // 200 + showPaywall dönerse diye duruyor.
      if (result?.showPaywall) {
        uiBus.emit("notePaywall", {
          paywallType: result.paywallType ?? "NOTE_BALANCE",
          message: result.paywallMessage || result.message,
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
      // Dealbreaker'lı premium filtreler (boy/sınıf/burç/sigara/alkol/dil/
      // dini görüş/evcil hayvan/kullanım amacı) API adlarıyla ANAHTARLANMIŞ
      // halde geliyor. Adlar
      // FilterModal'daki FILTER_FIELD map'inde tanımlı; burada tek blok olarak
      // geçiriliyor ki ad bilgisi iki yere dağılmasın.
      premiumFilters?: Record<string, unknown>;
      // Hangi filtreler "olmazsa olmaz". Semantiği diğerlerinden FARKLI:
      // alan yok/null = değiştirme, [] = hepsini esnet, [...] = tam liste.
      dealbreakers?: string[];
      // "Mesafe sınırı olmasın" anahtarı. `maxDistance`tan BAĞIMSIZ alan:
      // ikisi birlikte gönderilebilir, çakışmaz. Anahtar açıkken de kullanıcının
      // seçtiği yarıçap saklanır ve kapatınca geri yüklenir.
      ignoreDistanceFilter?: boolean;
    }) => {
      // `city` premium-only alan: doluyken free kullanıcıda backend TÜM isteği
      // 403 + PREMIUM_FILTERS ile reddediyor (yaş/mesafe güncellemesi de gider).
      // Free'de null gönderilmesini FilterModal garanti ediyor.
      const payload: Record<string, unknown> = {
        ageRangeMin: localFilters.ageRangeMin ?? DEFAULT_AGE_RANGE.min,
        ageRangeMax: localFilters.ageRangeMax ?? DEFAULT_AGE_RANGE.max,
        // Backend doğrulaması artık Range(5, 150) — eski Range(1, 100) yok.
        // Aralık dışı bir değer (bayat cache'ten gelen 300 km, eski "sınırsız"
        // sentinel'i 20000) İSTEĞİN TAMAMINI 400'e düşürür, yani cinsiyet/şehir
        // güncellemesi de kaybolur. FilterModal zaten tier tavanına clamp'liyor;
        // bu ikinci savunma hattı (universityDomains/preferredHobbies'teki
        // desenle aynı). Tier tavanını burada UYGULAMIYORUZ — premium bilgisi
        // bu katmanda yok, tier clamp'ini backend zaten sessizce yapıyor.
        maxDistance: Math.min(
          DISTANCE_RANGE_KM.max,
          Math.max(
            DISTANCE_RANGE_KM.min,
            // Alan hiç gelmezse free tavanı: DISTANCE_RANGE_KM.min (5 km)
            // fiilen "kimseyi gösterme" demek olurdu — mesafe artık KATI filtre.
            localFilters.maxDistance ?? FREE_MAX_DISTANCE_KM,
          ),
        ),
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
        // Boy/sınıf/burç/sigara/alkol/dil/dini görüş/evcil hayvan/kullanım
        // amacı — API adlarıyla anahtarlanmış halde geliyor, olduğu gibi
        // payload'a giriyor.
        // Bunlar da OVERWRITE: boş dizi / null = tercihi temizle.
        // Evcil hayvan İKİ alan gönderiyor (`pets` tür listesi + legacy
        // `hasPets`); ikisinin birbirini ezme kuralı FilterModal'da çözülüyor,
        // buraya çelişkili çift hiç gelmiyor.
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
      // `ignoreDistanceFilter` de KOŞULLU: alan yok/null = "değiştirme". Free
      // kullanıcıda da gönderiliyor — premium guard'ının dışında bir alan,
      // 403 üretmez (sözleşme §0). Anahtarı çizmeyen eski bir çağıran (ya da
      // alanı hiç taşımayan bayat local state) kullanıcının kayıtlı tercihini
      // sessizce kapatmasın diye `false`ı da ancak açıkça geldiğinde yolluyoruz.
      if (typeof localFilters.ignoreDistanceFilter === "boolean") {
        payload.ignoreDistanceFilter = localFilters.ignoreDistanceFilter;
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
      // MERGE, replace değil. Kaydettikten sonra yanıttaki `maxDistance` geri
      // yazılmalı (aralık dışı değer 400 DEĞİL sessiz clamp alıyor — kullanıcı
      // 150 seçip 75 kaydedildiyse slider gerçeği göstermeli). Ama PUT yanıtı
      // GET'in tüm alanlarını taşımıyor: `minSelectableDistanceKm` /
      // `maxSelectableDistanceKm` düz replace'te düşerdi ve slider sınırları
      // backend yerine tier sabitlerine geri kayardı.
      qc.setQueryData(swipeKeys.filters, (prev: any) =>
        prev ? { ...prev, ...result } : result,
      );
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

/**
 * Kurtarma harcandıktan SONRA bakiyeyi hizala: iyimser düşüş + kanonik tazeleme.
 *
 * İkisi birlikte olmak ZORUNDA. Bu sorgu `staleTime: Infinity` +
 * `refetchOnMount: false` ile oturumda BİR KEZ çekiliyor; yalnızca
 * `setQueryData` yazan bir çağıran, ekrandaki sayıyı oturum başındaki değerin
 * yerel bir türevi hâlinde bırakıyor. "/Stats bir sonraki tazelemede doğrusunu
 * getirir" varsayımı yanlıştı — o tazeleme hiç gelmiyordu (2026-08-24 bug'ı:
 * kota satırı kurtarma yapılmasına rağmen 5/5'te takılı kalıyordu).
 *
 * İyimser düşüş yine de duruyor: refetch bir ağ turu, kullanıcı butona bastığı
 * anda sayının hareket etmesi gerekiyor.
 *
 * Yama cache'in O ANKİ hâlinden hesaplanıyor, çağıranın render closure'ından
 * DEĞİL: bayat bir `stats.remaining` üzerinden guard'lamak (`rem > 0`) düşüşü
 * sessizce atlatabiliyordu.
 *
 * `refetchQueries` (invalidate değil): invalidate yalnız "bayat" işaretler ve
 * `staleTime: Infinity` altında da observer'ı olan sorgu tazelenir — ama
 * `type: "all"` ile ekran mount değilken de doğru değeri yazmak istiyoruz.
 */
export function useSyncRecoverySpend() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.setQueryData(swipeKeys.stats, (prev: any) =>
      prev ? { ...prev, ...spendRecoveryPatch(prev) } : prev,
    );
    return qc
      .refetchQueries({ queryKey: swipeKeys.stats, type: "all" })
      .catch(() => {});
  }, [qc]);
}
