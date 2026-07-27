import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  Animated,
  Easing,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PLAN_CARD_WIDTH = SCREEN_WIDTH - 40;
const PLAN_CARD_GAP = 12;
const PLAN_SNAP = PLAN_CARD_WIDTH + PLAN_CARD_GAP;

function SelectedBadge({ active }: any) {
  const { t } = useTranslation();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [active]);

  return (
    <Animated.View
      style={{
        marginTop: 14,
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 4,
        paddingVertical: 6,
        borderRadius: 999,
        opacity: progress,
      }}
    >
      <SFIcon
        name="bag.fill"
        fallback={ShoppingBag}
        size={15}
        color={colors.text}
        strokeWidth={2}
        weight="semibold"
      />
      <Text
        style={{
          color: colors.text,
          fontSize: 15,
          fontWeight: "600",
        }}
      >
        {t('purchase.cta.buy')}
      </Text>
    </Animated.View>
  );
}

function CardOpacityWrapper({ active, children }: any) {
  const opacity = useRef(new Animated.Value(active ? 1 : 0.45)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: active ? 1 : 0.45,
      duration: 320,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [active]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

function PaginationDot({ active }: any) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 280,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [active]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 20],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  return (
    <Animated.View
      style={{
        width,
        height: 6,
        borderRadius: 999,
        backgroundColor: colors.text,
        opacity,
      }}
    />
  );
}
import {
  BottomSheetScrollView,
  BottomSheetFooter,
} from "@gorhom/bottom-sheet";
import BlurBottomSheetBackdrop from "@/shared/components/BlurBottomSheetBackdrop";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import {
  X,
  Check,
  Zap,
  Eye,
  RotateCcw,
  Ban,
  ShoppingBag,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import SFIcon from "@/shared/components/SFIcon";
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/features/profile/subscriptionService";
import {
  selectIsPremium,
  setPremium,
  syncSubscriptionWithRetry,
} from "@/features/profile/subscriptionSlice";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { useQueryClient } from "@tanstack/react-query";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { UNLIMITED } from "@/shared/constants/limits";
import { colors, gradients } from "../../../shared/theme/colors";
import { analytics } from "@/shared/services/analytics";

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

  return Array.from(collected.entries()).map(([period, pkg]) => ({
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
// Sabit sıralama: yearly → monthly → weekly.
const PERIOD_ORDER = { yearly: 0, monthly: 1, weekly: 2 };
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
    .sort(
      (a, b) => (PERIOD_ORDER[a.period] ?? 99) - (PERIOD_ORDER[b.period] ?? 99),
    );
}

// "Aylığa kıyasla %X tasarruf" hesaplaması. Monthly price referans alınır.
function computeSavings(plan, plans) {
  if (!plan?.price || plan.period === "monthly") return null;
  const monthly = plans.find((p) => p.period === "monthly");
  if (!monthly?.price) return null;

  const months =
    plan.period === "yearly" ? 12 : plan.period === "weekly" ? 1 / 4.345 : null;
  if (!months) return null;

  const equivalentMonthlyTotal = monthly.price * months;
  if (equivalentMonthlyTotal <= 0) return null;

  const savingsRatio = 1 - plan.price / equivalentMonthlyTotal;
  if (savingsRatio <= 0.02) return null; // %2'nin altını gösterme — round-off gürültüsü
  return Math.round(savingsRatio * 100);
}

// displayName render: solda büyük "premium" (Duckie-regular), sağında küçük
// "/ Aylık" (veya hangi periyot ise). Backend displayName format'ı genelde
// "Aylık Premium" — period word ile premium'u ayır.
function renderPlanName(
  name,
  {
    primarySize = 44,
    secondaryColor = "#000",
    periodLabel,
  }: { primarySize?: number; secondaryColor?: string; periodLabel?: string } = {},
) {
  // Görünen periyot kelimesi: önce i18n'den gelen periodLabel (dil-güvenli).
  // Backend displayName'i tek dilli geldiği için ondan ayrıştırma yapmıyoruz —
  // aksi halde "Aylık Premium" gibi bir label İngilizce'de bile TR sızdırıyordu.
  const m = name?.match(/premium/i);
  const parsed = m
    ? name.slice(0, m.index).trim() || name.slice(m.index + m[0].length).trim()
    : "";
  const periodText = periodLabel ?? parsed;
  // periodLabel yoksa ve "premium" da eşleşmiyorsa: elimizde yalnızca ham
  // backend adı var → onu göster (legacy fallback).
  if (!periodLabel && !m) {
    if (!name) return null;
    return (
      <Text
        style={{
          color: secondaryColor,
          fontSize: 17,
          fontWeight: "600",
        }}
      >
        {name}
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      <Text
        style={{
          color: secondaryColor,
          fontFamily: "Duckie-regular",
          fontSize: primarySize,
          includeFontPadding: false,
          paddingRight: primarySize * 0.18,
        }}
      >
        lit plus
      </Text>
      {periodText ? (
        <Text
          style={{
            color: secondaryColor,
            fontSize: 14,
            fontWeight: "500",
            marginLeft: 4,
            marginBottom: 6,
          }}
        >
          / {periodText}
        </Text>
      ) : null}
    </View>
  );
}

export default function PurchaseModal({ visible, onClose, onSuccess }: any) {
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
        // SuperLike premium'da SINIRSIZ DEĞİL (weeklySuperLikeLimit / 7-gün
        // rolling), ama premium tavanını burada BİLMİYORUZ: cache'deki
        // weeklySuperLikeLimit free tier'ın değeri (lifetime kota), premium
        // değeri ancak sync sonrası fetch'te geliyor.
        //
        // Bu yüzden uydurmak yerine "henüz bilinmiyor" diyoruz: null.
        // superLikeQuotaExhausted null'da false dönüyor → premium alan
        // kullanıcıya yanlışlıkla "hakkın bitti" sheet'i açılmıyor; SwipeCard
        // rozeti de sayı gelene kadar gizleniyor. Doğru değer sync'ten
        // saniyeler sonra refetchPremiumScoped ile geliyor.
        superLikesRemaining: null,
        weeklySuperLikeLimit: null,
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
  const planListRef = useRef(null);
  const initialScrollDoneRef = useRef(false);

  // Tüm dismiss yollarında (X, backdrop, swipe down, purchase success) parent
  // state'i kapatır.
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Offerings + /plans YALNIZ modal ilk açıldığında çekilir (bir kez). ÖNCESİ:
  // mount'ta koşulsuz çekiyordu → her ekranda gömülü gizli PurchaseModal (Discover,
  // Likes, Profile) cold-boot'ta plans + RC getOfferings-retry ateşliyordu
  // (subscription/plans ×3 selinin kaynağı). visible gate + fetchedRef ile boot'ta
  // hiç atmaz, açılınca tek sefer çeker.
  const offeringsFetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || offeringsFetchedRef.current) return;
    offeringsFetchedRef.current = true;
    let cancelled = false;
    // RC SDK cold start'ta getOfferings null dönebiliyor (configure → network
    // round-trip). Retry: null gelirse 600ms ara ile 3 kez daha dene.
    const fetchOfferingWithRetry = async (attempt = 0) => {
      const o = await getOfferings().catch(() => null);
      if (o || attempt >= 3) return o;
      await new Promise((r) => setTimeout(r, 600));
      return fetchOfferingWithRetry(attempt + 1);
    };

    Promise.all([
      fetchOfferingWithRetry(),
      api
        .get(API_ENDPOINTS.SUBSCRIPTION_PLANS)
        .then((r) => r?.result?.plans ?? [])
        .catch(() => []),
    ])
      .then(([o, plans]) => {
        if (cancelled) return;
        setOffering(o);
        setBackendPlans(plans);
      })
      .finally(() => {
        if (!cancelled) setLoadingOffering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

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

  // İlk render'da default seçim — highlight'lı plan (varsa) yoksa ilk plan
  useEffect(() => {
    if (selectedPeriod || plans.length === 0) return;
    const highlighted = plans.find((p) => p.highlight);
    setSelectedPeriod(highlighted?.period ?? plans[0].period);
  }, [plans, selectedPeriod]);

  const selectedPlan =
    plans.find((p) => p.period === selectedPeriod) ?? plans[0];

  // İlk açılışta default plan'ın pozisyonuna kaydır (sadece bir kez).
  // idx 0 ise FlatList zaten 0'da, scrollToIndex çağırmıyoruz — initial render'ı
  // bozmasın ve ilk swipe snap'ini etkilemesin.
  useEffect(() => {
    if (initialScrollDoneRef.current) return;
    if (!selectedPeriod || plans.length === 0) return;
    const idx = plans.findIndex((p) => p.period === selectedPeriod);
    if (idx < 0) return;
    initialScrollDoneRef.current = true;
    if (idx === 0) return;
    requestAnimationFrame(() => {
      planListRef.current?.scrollToIndex?.({
        index: idx,
        animated: false,
      });
    });
  }, [selectedPeriod, plans.length]);

  // Modal açıldığında kart peek hint animasyonu: sağa 60px kayıp geri döner,
  // "yatay kaydırılabilir" olduğunu göstersin. Threshold PLAN_SNAP/2'nin çok
  // altında olduğu için seçim değişmez. Her açılışta çalışır — sheet slide-in
  // animasyonu bittikten sonra tetiklenmesi için gecikme uygulanır.
  useEffect(() => {
    if (!visible) return;
    if (plans.length === 0) return;

    const peekTimer = setTimeout(() => {
      const idx = Math.max(
        0,
        plans.findIndex((p) => p.period === selectedPeriod),
      );
      const baseOffset = PLAN_SNAP * idx;
      planListRef.current?.scrollToOffset?.({
        offset: baseOffset + 60,
        animated: true,
      });
      setTimeout(() => {
        planListRef.current?.scrollToOffset?.({
          offset: baseOffset,
          animated: true,
        });
      }, 350);
    }, 700);

    return () => clearTimeout(peekTimer);
  }, [visible, plans.length]);

  const renderBackdrop = useCallback(
    (props) => <BlurBottomSheetBackdrop {...props} onPress={handleClose} />,
    [handleClose],
  );

  const handlePurchase = async (planOverride?: any) => {
    const plan = planOverride ?? selectedPlan;
    const pkg = plan?.pkg;
    if (!pkg) {
      Alert.alert(t('common.error'), t('purchase.errors.packageNotFound'));
      return;
    }
    setPurchasing(true);
    analytics.capture('purchase_initiated', { productId: pkg?.product?.identifier });
    try {
      const purchased = await purchasePackage(pkg);
      if (purchased) {
        analytics.capture('purchase_completed', { productId: pkg?.product?.identifier });
        dispatch(setPremium({ isPremium: true, optimistic: true }));
        promoteSwipeStatsToPremium();
        handleClose();
        onSuccess?.();
        syncThenRefetch();
      }
    } catch (e) {
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
        dispatch(setPremium({ isPremium: true, optimistic: true }));
        promoteSwipeStatsToPremium();
        handleClose();
        onSuccess?.();
        // Restore'da da webhook gecikmesi var (RC receipt → backend). Düz
        // status fetch'i stale okuyabiliyordu; retry'lı sync + refetch.
        syncThenRefetch();
      } else {
        Alert.alert(t('purchase.errors.restoreNotFoundTitle'), t('purchase.errors.restoreNoSubscription'));
      }
    } catch (e) {
      Alert.alert(t('common.error'), e.message || t('purchase.errors.restoreFailed'));
    } finally {
      setRestoring(false);
    }
  };

  // Trial bilgisi seçili plana göre — RC her plan için ayrı intro price tanımlayabilir.
  // Gün sayısı YALNIZCA RC introPrice'tan gelir; yoksa deneme vaat etmiyoruz
  // (eskiden 3 gün'e fallback ediyordu ve RC'de trial tanımlı olmasa bile
  // "3 gün ücretsiz" yazıyordu).
  const introPrice = selectedPlan?.introPrice;
  const introUnits = introPrice?.periodNumberOfUnits;
  const trialDays =
    typeof introUnits === "number" && introUnits > 0 ? introUnits : null;
  const showTrialBadge = Boolean(introPrice) && trialDays !== null;

  const features = useMemo(() => [
    { icon: Zap, label: t('purchase.features.unlimited') },
    { icon: Eye, label: t('purchase.features.seeLikes') },
    { icon: RotateCcw, label: t('purchase.features.rewind') },
    { icon: Ban, label: t('purchase.features.noAds') },
  ], [t]);

  const selectedPriceString = selectedPlan?.priceString ?? "—";
  const selectedPeriodLabel = t(`purchase.periods.${selectedPlan?.period ?? "monthly"}Per`);

  // Sticky footer — BottomSheetFooter ile sheet'in alt kısmında sabit kalır.
  const renderFooter = useCallback(
    (props) => (
      <BottomSheetFooter {...props}>
        <BlurView
          intensity={70}
          tint="dark"
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 24,
            borderTopWidth: 0.5,
            borderTopColor: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          {loadingOffering ? (
            <ActivityIndicator color={colors.text} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <AnimatedPressable
                onPress={() => handlePurchase()}
                disabled={isPremium || purchasing || restoring || !selectedPlan}
                pressScale={0.95}
                style={{
                  borderRadius: 999,
                  borderCurve: "continuous",
                  overflow: "hidden",
                  marginBottom: 8,
                  opacity: isPremium ? 0.6 : selectedPlan ? 1 : 0.5,
                }}
              >
                <LinearGradient
                  colors={[colors.litPlus, colors.litPlus]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingVertical: 18,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: colors.text,
                      fontWeight: "700",
                      fontSize: 14,
                      opacity: purchasing ? 0 : 1,
                    }}
                  >
                    {isPremium
                      ? t('purchase.cta.alreadyPremium')
                      : showTrialBadge
                        ? t('purchase.cta.freeTrial', { days: trialDays })
                        : t('purchase.cta.subscribe', { price: selectedPriceString, period: selectedPeriodLabel })}
                  </Text>
                  {purchasing && (
                    <ActivityIndicator
                      size="small"
                      color={colors.text}
                      style={{ position: "absolute" }}
                    />
                  )}
                </LinearGradient>
              </AnimatedPressable>

              <TouchableOpacity
                onPress={handleRestore}
                disabled={purchasing || restoring}
                activeOpacity={0.8}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {t('purchase.cta.restore')}
                  </Text>
                )}
              </TouchableOpacity>

              <Text
                style={{
                  marginHorizontal: 10,
                  color: colors.textDisabled,
                  fontSize: 11,
                  textAlign: "center",
                  marginTop: 8,
                  lineHeight: 16,
                }}
              >
                {t('purchase.cta.appStoreDisclaimer')}
              </Text>
            </>
          )}
        </BlurView>
      </BottomSheetFooter>
    ),
    [
      loadingOffering,
      purchasing,
      restoring,
      selectedPlan,
      showTrialBadge,
      trialDays,
      selectedPriceString,
      selectedPeriodLabel,
      // isPremium dep listesinde YOKTU: satın alma sonrası redux premium'a
      // dönse bile footer eski closure ile render kalıyor, CTA hâlâ "abone ol"
      // (ve basılabilir) görünüyordu. `t` de dil değişiminde bayat kalıyordu.
      isPremium,
      t,
    ],
  );

  return (
    <AppBottomSheet
      visible={visible}
      snapPoints={["75%", "93%"]}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      backgroundStyle={{ backgroundColor: colors.shopSurface }}
      onClose={() => {
        setSelectedPeriod(null);
        initialScrollDoneRef.current = false;
        handleClose();
      }}
    >
      {/* Close button — sağ üst köşede absolute, BlurView arkaplanlı */}
      <TouchableOpacity
        onPress={handleClose}
        activeOpacity={0.7}
        hitSlop={12}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 10,
          width: 45,
          height: 45,
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <BlurView
          intensity={60}
          tint="dark"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View pointerEvents="none">
            <SFIcon
              name="xmark"
              fallback={X}
              size={18}
              color={colors.text}
              strokeWidth={2.5}
              weight="bold"
            />
          </View>
        </BlurView>
      </TouchableOpacity>

      {/* Yukarıdan gri → aşağıda messageOwn'a fade */}
      <LinearGradient
        pointerEvents="none"
        colors={gradients.shopBackdrop}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 700,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          overflow: "hidden",
        }}
      />

      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 300,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Card */}
        <View
          style={{
            borderRadius: 32,
            borderCurve: "continuous",
            overflow: "hidden",
            padding: 24,
            marginBottom: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 56,
              fontFamily: "Duckie-regular",
              marginBottom: 8,
              // Duckie font glyph metrics → sağ taraf clip oluyor; padding ile aç.
              paddingRight: 12,
              includeFontPadding: false,
            }}
          >
            lit shop
          </Text>
          <Text
            style={{
              color: "rgba(255,255,255,0.85)",
              fontSize: 14,
              fontWeight: "400",
              textAlign: "center",
            }}
          >
            {t('discover.premium.description')}
          </Text>
        </View>

        {/* Plan Selector — yatay paging carousel: kaydırınca o plan seçili. */}
        {!loadingOffering && plans.length > 0 && selectedPlan && (
          <View style={{ marginBottom: 20, marginHorizontal: -20 }}>
            <FlatList
              ref={planListRef}
              data={plans}
              keyExtractor={(p) => p.period}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={PLAN_SNAP}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum
              initialNumToRender={plans.length}
              windowSize={plans.length + 1}
              removeClippedSubviews={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              getItemLayout={(_, index) => ({
                length: PLAN_SNAP,
                offset: PLAN_SNAP * index,
                index,
              })}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / PLAN_SNAP,
                );
                if (plans[idx] && plans[idx].period !== selectedPeriod) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                    () => {},
                  );
                  setSelectedPeriod(plans[idx].period);
                }
              }}
              renderItem={({ item: plan }) => {
                const planIntro = plan.introPrice;
                const planTrialUnits = planIntro?.periodNumberOfUnits;
                const planTrialDays =
                  typeof planTrialUnits === "number" && planTrialUnits > 0
                    ? planTrialUnits
                    : null;
                const planShowTrial =
                  Boolean(planIntro) && planTrialDays !== null;
                const planPeriodLabel = t(`purchase.periods.${plan?.period ?? "monthly"}Per`);
                const isSelected = plan.period === selectedPlan.period;
                return (
                  <CardOpacityWrapper active={isSelected}>
                    <AnimatedPressable
                      pressScale={0.97}
                      onPress={() => {
                        if (isPremium) return;
                        if (!isSelected) setSelectedPeriod(plan.period);
                        handlePurchase(plan);
                      }}
                      disabled={
                        isPremium || purchasing || restoring || loadingOffering
                      }
                      style={{
                        width: PLAN_CARD_WIDTH,
                        borderRadius: 32,
                        borderCurve: "continuous",
                        borderWidth: 0.5,
                        borderColor: "rgba(255,255,255,0.2)",
                        overflow: "hidden",
                      }}
                    >
                      <BlurView
                        intensity={70}
                        tint="dark"
                        style={{
                          paddingHorizontal: 20,
                          paddingTop: 10,
                          paddingBottom: 22,
                        }}
                      >
                        <View style={{ marginBottom: 6 }}>
                          {renderPlanName(plan.displayName, {
                            primarySize: 55,
                            secondaryColor: colors.text,
                            periodLabel: t(`purchase.periods.${plan?.period ?? "monthly"}Short`),
                          })}
                        </View>
                        <Text
                          style={{
                            color: colors.text,
                            fontSize: 18,
                            fontWeight: "400",
                          }}
                        >
                          {plan.priceString ?? "—"}
                        </Text>
                        {planShowTrial && (
                          <Text
                            style={{
                              color: "rgba(255,255,255,0.75)",
                              fontSize: 12,
                              fontWeight: "400",
                              marginTop: 4,
                              lineHeight: 15,
                            }}
                          >
                            {t('purchase.cta.trialDisclaimer', { days: planTrialDays, price: plan.priceString ?? "—", period: planPeriodLabel })}
                          </Text>
                        )}
                        <SelectedBadge active={isSelected} />
                      </BlurView>
                    </AnimatedPressable>
                  </CardOpacityWrapper>
                );
              }}
              ItemSeparatorComponent={() => (
                <View style={{ width: PLAN_CARD_GAP }} />
              )}
            />
            {/* Pagination dots */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                marginTop: 14,
              }}
            >
              {plans.map((p) => (
                <PaginationDot
                  key={p.period}
                  active={p.period === selectedPlan.period}
                />
              ))}
            </View>
          </View>
        )}

        {/* Features — BlurView arkaplan (üstteki plan kartı ile aynı stil) */}
        <View
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.3)",
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <BlurView intensity={60} tint="dark" style={{ paddingVertical: 20 }}>
            {/* Header row */}
            <View className="flex-row items-center justify-between mb-2 px-6">
              <Text className="text-white/70 font-bold text-[12px] uppercase tracking-wider flex-1">
                {t('discover.premium.featuresLabel')}
              </Text>
              <View className="flex-row items-center gap-4">
                <Text className="text-white/70 font-bold text-[12px] uppercase w-16 text-center">
                  {t('discover.premium.standardPlan')}
                </Text>
                <Text
                  className="w-16 text-center mb-2"
                  style={{
                    color: colors.text,
                    fontSize: 25,
                    fontFamily: "Duckie-regular",
                  }}
                >
                  lit plus
                </Text>
              </View>
            </View>

            {/* Feature rows */}
            {features.map(({ label }, index) => (
              <View
                key={label}
                className={`flex-row items-center justify-between px-6 ${
                  index !== features.length - 1 ? "mb-4" : ""
                }`}
              >
                <Text className="text-white font-[500] text-[13px] flex-1 pr-2">
                  {label}
                </Text>
                <View className="flex-row items-center gap-4">
                  <View className="w-16 items-center">
                    <SFIcon
                      name="xmark"
                      fallback={X}
                      size={18}
                      color="rgba(255, 255, 255, 0.4)"
                      strokeWidth={2}
                      weight="semibold"
                    />
                  </View>
                  <View className="w-16 items-center">
                    <SFIcon
                      name="checkmark"
                      fallback={Check}
                      size={18}
                      color={colors.text}
                      strokeWidth={2}
                      weight="semibold"
                    />
                  </View>
                </View>
              </View>
            ))}
          </BlurView>
        </View>
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}
