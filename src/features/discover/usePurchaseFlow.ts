import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Dimensions } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import {
  checkIntroEligibility,
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/features/profile/subscriptionService";
import {
  markPremiumPurchasePending,
  selectIsPremium,
  setPremium,
  syncSubscriptionWithRetry,
} from "@/features/profile/subscriptionSlice";
import {
  PREMIUM_BENEFIT_KEYS,
  premiumBenefitLabelKey,
  type PremiumBenefitKey,
} from "@/features/profile/premiumBenefits";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { UNLIMITED } from "@/shared/constants/limits";
import { analytics } from "@/shared/services/analytics";
import { showInfoToast } from "@/shared/services/toaster";

/**
 * lit plus satın alma akışının TAMAMI — katalog, seçim, satın alma, restore.
 *
 * Aynı akışın İKİ kabı var ve ikisi de aynı tasarımı gösteriyor:
 *   • PurchaseModal        → bottom sheet (uygulamanın her yerinden açılıyor)
 *   • ProfileScreen "plus" → sekme sayfası (pager'ın ikinci sayfası)
 * Mantık burada tek kopya; kaplar yalnız düzeni (scroll + footer) sağlıyor.
 * Bkz. components/PurchaseSections.tsx — ortak görsel parçalar.
 */

// Offering + /plans fetch'i için tavan. api'nin kendi timeout'u 30sn ama RC'nin
// native promise'inin bir garantisi yok; spinner'ı süresiz asılı bırakmamak için.
const OFFERING_FETCH_TIMEOUT_MS = 20000;

// Plan kartının genişliği — yalnız İSKELET için: gerçek kart artık tek ve kabına
// geriliyor. (Kartlar bir zamanlar yatay bir listeydi; kaydırma offset'i
// PLAN_SNAP ve kartlar arası PLAN_CARD_GAP onunla birlikte kaldırıldı.)
const { width: SCREEN_WIDTH } = Dimensions.get("window");
export const PLAN_CARD_WIDTH = SCREEN_WIDTH - 40;

// productId convention (backend SubscriptionProductOptions ile eşleşmeli).
const PRODUCT_ID_PERIOD_HINTS = [
  { match: /weekly|week/i, period: "weekly" },
  { match: /yearly|annual|year/i, period: "yearly" },
  { match: /monthly|month/i, period: "monthly" },
];

function detectPeriodFromProductId(productId) {
  if (!productId) return null;
  for (const hint of PRODUCT_ID_PERIOD_HINTS) {
    if (hint.match.test(productId)) return hint.period;
  }
  return null;
}

// RC offering içinden plan listesi türet. RC convention'ı:
//   offering.weekly / offering.monthly / offering.annual gibi shorthand'leri varsa kullan
//   yoksa availablePackages içinden productId'ye göre tahmin et
function extractPlansFromOffering(offering) {
  if (!offering) return [];
  const collected = new Map();

  // Shorthand alanlar
  if (offering.weekly) collected.set("weekly", offering.weekly);
  if (offering.monthly) collected.set("monthly", offering.monthly);
  if (offering.annual) collected.set("yearly", offering.annual);

  // availablePackages içinden eksikleri tamamla
  const pkgs = offering.availablePackages ?? [];
  for (const pkg of pkgs) {
    const productId = pkg?.product?.identifier;
    const detected = detectPeriodFromProductId(productId);
    if (detected && !collected.has(detected)) {
      collected.set(detected, pkg);
    }
  }

  return Array.from(collected.entries()).map(([period, pkg]: [string, any]) => ({
    period,
    pkg,
    productId: pkg?.product?.identifier ?? null,
    priceString: pkg?.product?.priceString ?? null,
    price: pkg?.product?.price ?? null, // sayısal
    currencyCode: pkg?.product?.currencyCode ?? null,
    introPrice: pkg?.product?.introPrice ?? null,
  }));
}

// Backend metadata (displayName / highlight / sortOrder) ile RC paketlerini birleştir.
//
// SIRALAMA OTORİTESİ backend `sortOrder`ı: katalog server-controlled, yani plan
// sırası build almadan değiştirilebilmeli. Önceden burada sabit bir period
// sıralaması vardı ve `sortOrder` okunup atılıyordu — backend'in sırayı
// değiştirmesinin hiçbir etkisi olmuyordu.
//
// PERIOD_ORDER yalnız TIE-BREAKER: `/plans` hiç dönmediğinde (endpoint hatası)
// ya da bir plan katalogda eşleşmediğinde tüm sortOrder'lar 99 fallback'ine
// düşer, o zaman değeri en yüksek plandan başlayan makul bir sıra kalsın.
const PERIOD_ORDER = { lifetime: 0, yearly: 1, monthly: 2, weekly: 3 };
function mergePlansWithBackend(rcPlans, backendPlans, t) {
  const backendByPeriod = new Map();
  const backendProductIds = new Set();
  for (const b of backendPlans ?? []) {
    if (b.period) backendByPeriod.set(b.period, b);
    if (b.productId) backendProductIds.add(b.productId);
  }

  return rcPlans
    // Server katalog dışı ürünü GÖSTERME: RC offering'de olup `/plans`'ta
    // olmayan bir product satın alınabilir görünüyordu (ör. RC'de test/eski
    // ürün açık kaldığında). Backend katalog boş dönerse (endpoint hatası)
    // filtreyi uygulamıyoruz — aksi halde paywall tamamen boşalırdı.
    .filter((rc) =>
      backendProductIds.size === 0 ||
      !rc.productId ||
      backendProductIds.has(rc.productId),
    )
    .map((rc) => {
      const meta = backendByPeriod.get(rc.period);
      // Backend displayName vermezse i18n'e düş — eskiden burada gömülü
      // Türkçe label'lar vardı, dil değişse bile TR sızıyordu.
      const fallbackName = t(`purchase.periods.${rc.period}Short`, {
        defaultValue: rc.period,
      });
      return {
        ...rc,
        displayName: meta?.displayName ?? fallbackName,
        highlight: meta?.highlight ?? null,
        sortOrder: meta?.sortOrder ?? 99,
      };
    })
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99);
    });
}

/** Bir planın kaç HAFTA sürdüğü — tasarruf hesabının ortak birimi. */
const WEEKS_IN_PERIOD = { weekly: 1, monthly: 4.345, yearly: 52.14 };

/**
 * Plana özel tasarruf yüzdesi. TABAN HAFTALIK plan: katalogdaki en pahalı
 * birim o, dolayısıyla hem aylık hem yıllık "%X off" gösterebiliyor. (Önce
 * taban aylıktı; o zaman aylığın kendisi taban olduğu için hiçbir zaman
 * indirim yazamıyordu, haftalık da negatif çıkıp gizleniyordu — yani rozet
 * yalnız yıllıkta görünürdü.)
 *
 * Haftalık plan katalogda yoksa AYLIĞA düşüyor: küçük katalogda yıllık yine
 * bir oran gösterebilsin.
 *
 * Backend fiyat dönmediği için (bkz. /plans sözleşmesi) hesap RC'nin sayısal
 * `price`ı ile yapılıyor; para birimleri aynı offering içinde ortak olduğu için
 * oran güvenli.
 */
export function computeSavings(plan, plans) {
  if (!plan?.price) return null;
  const weeks = WEEKS_IN_PERIOD[plan.period];
  if (!weeks) return null;

  const base =
    plans.find((p) => p.period === "weekly" && p.price) ??
    plans.find((p) => p.period === "monthly" && p.price);
  if (!base?.price || base.period === plan.period) return null;
  const baseWeeks = WEEKS_IN_PERIOD[base.period];
  if (!baseWeeks) return null;

  // Tabanın haftalık birim fiyatıyla bu planın süresi kadar ödenecek tutar.
  const equivalentTotal = (base.price / baseWeeks) * weeks;
  if (equivalentTotal <= 0) return null;

  const savingsRatio = 1 - plan.price / equivalentTotal;
  if (savingsRatio <= 0.02) return null; // %2'nin altını gösterme — round-off gürültüsü
  return Math.round(savingsRatio * 100);
}

// Varsayılan seçim HER AÇILIŞTA `weekly`: paywall haftalıkla açılsın istiyoruz,
// backend `highlight`ı ya da `sortOrder` sırası ne olursa olsun. Katalogda
// haftalık yoksa eski davranışa düşeriz (highlight → ilk plan).
function resolveDefaultPeriod(list) {
  if (!list || list.length === 0) return null;
  if (list.some((p) => p.period === "weekly")) return "weekly";
  return list.find((p) => p.highlight)?.period ?? list[0].period;
}

type Options = {
  /**
   * Katalog çekimi bu bayrağa bağlı. Sheet'te "modal açık", sayfada "kullanıcı
   * plus sekmesine bir kez geçti" anlamına geliyor — boot'ta koşulsuz fetch
   * yapmamanın tek kapısı bu (bileşen her ekranda gömülü duruyor).
   */
  active: boolean;
  /** Satın alma/restore başarıyla bittiğinde — sheet kendini kapatıyor. */
  onCompleted?: () => void;
  onSuccess?: () => void;
};

export type PurchaseFlow = ReturnType<typeof usePurchaseFlow>;

export function usePurchaseFlow({ active, onCompleted, onSuccess }: Options) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const isPremium = useAppSelector(selectIsPremium);
  const { t } = useTranslation();

  // Premium satın alma/restore sonrası swipe stats cache'ini güncelle —
  // backend sınırsız için -1 dönüyor. Local cache eski limitli değerlerle
  // kaldığı için UI swipe sayacını "kalan" gösteriyor.
  //
  // Burada invalidate YOK: RC purchase bittiğinde webhook henüz inmemiş
  // oluyor, hemen atılan refetch backend'den free stats çekip bu patch'i
  // eziyordu (stats staleTime: Infinity olduğu için de bir daha düzelmiyordu).
  // Gerçek refetch `sync` başarılı döndüğünde yapılıyor → refetchPremiumScoped.
  const promoteSwipeStatsToPremium = () => {
    queryClient.setQueryData(swipeKeys.stats, (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        isPremium: true,
        remainingSwipes: UNLIMITED,
        remainingUndos: UNLIMITED,
        dailySwipeLimit: UNLIMITED,
        dailyUndoLimit: UNLIMITED,
        // SuperLike premium'da SINIRSIZ DEĞİL (weeklySuperLikeLimit, tier'a
        // bağlı 1/2/5), ama premium tavanını burada BİLMİYORUZ: cache'deki
        // weeklySuperLikeLimit free tier'ın değeri (lifetime kota), premium
        // değeri ancak sync sonrası fetch'te geliyor — üstelik hangi tier
        // alındığına göre değişiyor.
        //
        // Bu yüzden uydurmak yerine "henüz bilinmiyor" diyoruz: null.
        // superLikeQuotaExhausted null'da false dönüyor → premium alan
        // kullanıcıya yanlışlıkla "hakkın bitti" sheet'i açılmıyor; SwipeCard
        // rozeti de sayı gelene kadar gizleniyor. Doğru değer sync'ten
        // saniyeler sonra refetchPremiumScoped ile geliyor.
        superLikesRemaining: null,
        weeklySuperLikeLimit: null,
        // Kurtarma SuperLike'ın aksine tahmin gerektirmiyor: 2026-08-31'den
        // beri tier'a bağlı bir kota değil, premium'da düpedüz SINIRSIZ. Yani
        // doğru değer burada zaten biliniyor, "bilinmiyor" demeye gerek yok.
        // Cache'teki free değerini (0) bırakmak abone olan kullanıcıyı kendi
        // ödediği ekranda paywall'a çarptırırdı.
        remainingMissedMatchRecovery: UNLIMITED,
      };
    });
  };

  // Sync gerçekten oturduktan sonra premium'a bağlı tüm server state'i tazele.
  // Backend premium flip'inde deck cache'ini invalidate ediyor; filtreler de
  // artık premium kurallarıyla dönüyor.
  const refetchPremiumScoped = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: swipeKeys.stats });
    queryClient.invalidateQueries({ queryKey: swipeKeys.filters });
    queryClient.invalidateQueries({ queryKey: swipeKeys.matches });
  }, [queryClient]);

  // syncSubscriptionWithRetry fulfilled olsa bile `synced: false` dönebilir
  // (webhook hâlâ inmedi ve RC REST fallback da bulamadı). O durumda invalidate
  // etmiyoruz — optimistic patch korunsun, bir sonraki foreground/mount fetch'i
  // düzeltir. Slice `syncPending`i set eder, ProfileScreen "aktivasyon sürüyor"
  // kartını gösterir.
  //
  // Backoff ve `reason` yorumu slice'ta (RC negative cache 10sn + 60/dk limit).
  const syncThenRefetch = useCallback(() => {
    dispatch(syncSubscriptionWithRetry())
      .unwrap()
      .then((res: any) => {
        if (res?.synced) refetchPremiumScoped();
      })
      .catch(() => {});
  }, [dispatch, refetchPremiumScoped]);

  const [offering, setOffering] = useState(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [backendPlans, setBackendPlans] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  // productId → kullanıcı bu ürünün denemesine hak kazanıyor mu.
  // null = henüz sorulmadı; {} = sorulamadı/hiçbiri uygun değil.
  const [introEligibility, setIntroEligibility] = useState<Record<
    string,
    boolean
  > | null>(null);
  // Açıklaması okunmakta olan özellik satırı (null = sheet kapalı).
  const [infoBenefit, setInfoBenefit] = useState<PremiumBenefitKey | null>(null);

  const openBenefitInfo = useCallback((key: PremiumBenefitKey) => {
    Haptics.selectionAsync().catch(() => {});
    setInfoBenefit(key);
  }, []);
  const closeBenefitInfo = useCallback(() => setInfoBenefit(null), []);

  // Offerings + /plans YALNIZ akış görünürken çekilir. Boot'ta atılmaz: sheet
  // her ekranda (Discover, Likes, Profile, Chat) gömülü duruyor, mount'ta
  // koşulsuz çekmek cold-boot'ta plans + RC getOfferings-retry seli demekti
  // (subscription/plans ×3'ün kaynağı).
  //
  // Latch "bir kez çektik" DEĞİL "elimizde veri var" kuralına bağlı. Öncesi
  // tek-atışlık ref + kapanışta cancel idi; sheet fetch bitmeden kapanırsa
  // (yavaş ağ + sabırsız kullanıcı) `loadingOffering` true'da kilitleniyor ve
  // ref yandığı için o ekran mount'u boyunca bir daha HİÇ denenmiyordu →
  // paywall sonsuza kadar spinner. Şimdi veri gelmediyse her açılış yeniden
  // dener; gelen veri cache'lenir, ikinci açılışta anında görünür.
  const offeringsInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const hasOfferingData = offering !== null || (backendPlans?.length ?? 0) > 0;
  useEffect(() => {
    if (!active || hasOfferingData || offeringsInFlightRef.current) return;
    offeringsInFlightRef.current = true;
    setLoadingOffering(true);
    // RC SDK cold start'ta getOfferings null dönebiliyor (configure → network
    // round-trip). Retry: null gelirse 600ms ara ile 3 kez daha dene.
    const fetchOfferingWithRetry = async (attempt = 0) => {
      const o = await getOfferings().catch(() => null);
      if (o || attempt >= 3) return o;
      await new Promise((r) => setTimeout(r, 600));
      return fetchOfferingWithRetry(attempt + 1);
    };

    // Native RC promise'i takılırsa (SDK cold start + kötü ağ) spinner'ın
    // süresiz asılı kalmaması için tavan. Timeout'ta boş sonuca düşeriz →
    // hasOfferingData false kalır, bir sonraki açılış tekrar dener.
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutFallback = new Promise<[null, never[]]>((resolve) => {
      timeoutId = setTimeout(() => resolve([null, []]), OFFERING_FETCH_TIMEOUT_MS);
    });

    Promise.race([
      Promise.all([
        fetchOfferingWithRetry(),
        api
          .get(API_ENDPOINTS.SUBSCRIPTION_PLANS)
          .then((r) => r?.result?.plans ?? [])
          .catch(() => []),
      ]),
      timeoutFallback,
    ])
      .then(([o, plans]: any) => {
        // Kapanmış sheet'te de yazıyoruz (yalnız unmount'ta durur): bir sonraki
        // açılışın anında dolu gelmesi için sonucu atmıyoruz.
        if (!mountedRef.current) return;
        setOffering(o);
        setBackendPlans(plans);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        offeringsInFlightRef.current = false;
        if (mountedRef.current) setLoadingOffering(false);
      });
  }, [active, hasOfferingData]);

  // RC + backend birleştirilmiş plan listesi
  const plans = useMemo(
    () =>
      mergePlansWithBackend(
        extractPlansFromOffering(offering),
        backendPlans ?? [],
        t,
      ),
    [offering, backendPlans, t],
  );

  // Deneme HAK KAZANMAYA bağlı: `introPrice` ürünün statik alanı olduğu için
  // tek başına "bu kullanıcı deneme alacak" anlamına gelmiyor (ayrıntı:
  // subscriptionService.checkIntroEligibility). Cevap gelene kadar deneme
  // metnini göstermiyoruz — aksi halde ineligible kullanıcıda bir an "3 gün
  // ücretsiz" yanıp sönerdi.
  const introProductKey = useMemo(
    () => plans.map((p) => p.productId).filter(Boolean).join("|"),
    [plans],
  );
  useEffect(() => {
    if (!active || !introProductKey) return;
    let cancelled = false;
    checkIntroEligibility(introProductKey.split("|")).then((map) => {
      if (!cancelled && mountedRef.current) setIntroEligibility(map);
    });
    return () => {
      cancelled = true;
    };
  }, [active, introProductKey]);
  const isTrialEligible = useCallback(
    (productId) => Boolean(productId && introEligibility?.[productId]),
    [introEligibility],
  );

  // Seçim boşsa default'a düş (plan listesi geç geldiğinde de burası doldurur).
  useEffect(() => {
    if (selectedPeriod || plans.length === 0) return;
    setSelectedPeriod(resolveDefaultPeriod(plans));
  }, [plans, selectedPeriod]);

  // HER AÇILIŞTA seçimi default'a (weekly) çek. `onClose` de sıfırlıyor ama tek
  // başına yetmiyor: sheet parent state'iyle kapatıldığında (ör. başka bir
  // ekrana geçiş) gorhom dismiss callback'i gelmeyebiliyor ve modal bir önceki
  // seçimle açılıyordu.
  useEffect(() => {
    if (!active) return;
    setSelectedPeriod(resolveDefaultPeriod(plans));
    // `plans` bilerek dep DEĞİL: liste sonradan gelirse yukarıdaki effect
    // dolduruyor, burada dinlemek kullanıcının seçimini ezme riski taşır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const selectedPlan =
    plans.find((p) => p.period === selectedPeriod) ?? plans[0];

  // NOT: burada bir "açılışta doğru karta kaydır" effect'i vardı. Kartlar yatay
  // bir listeydi ve seçim listenin offset'iyle birlikte tutuluyordu; liste
  // kalkınca (tek kart + şeritten seçim) kaydıracak bir şey de kalmadı.
  // Aynı sebeple açılıştaki "sağa 60px kayıp geri dön" peek hint'i de yok.

  const handlePurchase = async (planOverride?: any) => {
    const plan = planOverride ?? selectedPlan;
    const pkg = plan?.pkg;
    if (!pkg) {
      Alert.alert(t('common.error'), t('purchase.errors.packageNotFound'));
      return;
    }
    setPurchasing(true);
    const productId = pkg?.product?.identifier ?? null;
    analytics.capture('purchase_initiated', { productId });
    try {
      // throw etmediyse mağaza ödemeyi ALDI. `hasEntitlement` yalnız teşhis:
      // RC customerInfo'yu geç güncellediğinde eskiden bu dal hiç çalışmıyor,
      // kullanıcı parayı ödeyip hiçbir geri bildirim alamıyordu.
      const { hasEntitlement } = await purchasePackage(pkg);
      analytics.capture('purchase_completed', { productId, hasEntitlement });
      // Kurtarma kaydı ÖNCE yazılır: sync'ten önce app öldürülse bile satın alma
      // kaybolmasın, bir sonraki açılış tekrar denesin.
      dispatch(markPremiumPurchasePending({ productId }));
      dispatch(setPremium({ isPremium: true, optimistic: true }));
      promoteSwipeStatsToPremium();
      onCompleted?.();
      onSuccess?.();
      // Sheet kapanıyor ve kullanıcı bir anda paywall'sız ekrana düşüyor:
      // ödemenin karşılığının geldiğini söyleyen tek geri bildirim bu toast.
      // Hub'ın `SubscriptionChanged` toast'ı burayı KAPSAMIYOR — orası mağaza
      // kaynaklı değişimde (`store_purchase`) bilerek sessiz (bkz.
      // AppNavigator). Kapanışın ardından gösteriliyor ki banner sheet'in
      // altında kalmasın.
      showInfoToast({
        title: t("purchase.purchasedTitle"),
        message: t("purchase.purchasedMessage"),
        icon: "premium",
      });
      syncThenRefetch();
    } catch (e: any) {
      if (!e.userCancelled) {
        Alert.alert(t('purchase.errors.purchaseTitle'), e.message || t('purchase.errors.operationFailed'));
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        // Restore'da `false` gerçekten "geri yüklenecek bir şey yok" demek
        // (entitlement geçmişten okunuyor, satın alma anındaki propagasyon
        // yarışı yok) — bu yüzden burada boolean sözleşmesi korunuyor.
        dispatch(markPremiumPurchasePending({ productId: null }));
        dispatch(setPremium({ isPremium: true, optimistic: true }));
        promoteSwipeStatsToPremium();
        onCompleted?.();
        onSuccess?.();
        // Restore'da da webhook gecikmesi var (RC receipt → backend). Düz
        // status fetch'i stale okuyabiliyordu; retry'lı sync + refetch.
        syncThenRefetch();
      } else {
        Alert.alert(t('purchase.errors.restoreNotFoundTitle'), t('purchase.errors.restoreNoSubscription'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('purchase.errors.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  // NOT: seçili plana göre hesaplanan deneme/fiyat metinleri (showTrialBadge,
  // trialDays, selectedPriceString, selectedPeriodLabel) BURADAN KALKTI —
  // tek tüketicileri alttaki büyük "abone ol" CTA'sıydı. Deneme cümlesi artık
  // her plan kartının kendi metni (bkz. PurchasePlanCarousel'daki planShowTrial);
  // orada da aynı iki koşula bağlı: RC `introPrice` VE eligibility.

  // Paywall listenin TAMAMINI gösterir; upsell kartı ilk dördünü gösterip
  // "+N özellik daha" der. Kullanıcı bu ekrana o satır için geliyor — burada
  // kırpmak, kartın vaat ettiği "daha fazlası"nı hiç göstermemek olurdu.
  const features = useMemo(
    () =>
      PREMIUM_BENEFIT_KEYS.map((key) => ({
        key,
        label: t(premiumBenefitLabelKey(key)),
      })),
    [t],
  );

  /** Sheet kapanışında seçimi sıfırlar — kap tarafından çağrılıyor. */
  const resetSelection = useCallback(() => {
    setSelectedPeriod(null);
  }, []);

  return {
    t,
    isPremium,
    plans,
    loadingOffering,
    selectedPlan,
    selectedPeriod,
    setSelectedPeriod,
    purchasing,
    restoring,
    handlePurchase,
    handleRestore,
    isTrialEligible,
    features,
    infoBenefit,
    openBenefitInfo,
    closeBenefitInfo,
    resetSelection,
  };
}
