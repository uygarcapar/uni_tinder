import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      <ShoppingBag size={15} color="#000" strokeWidth={2} />
      <Text
        style={{
          color: "#000",
          fontSize: 15,
          fontWeight: "600",
        }}
      >
        Satın Al
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
import AnimatedPressable from "@/shared/components/AnimatedPressable";
import { useAppDispatch, useAppSelector } from "@/shared/hooks/redux";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "@/features/profile/subscriptionService";
import {
  fetchSubscriptionStatus,
  selectIsPremium,
  setPremium,
  syncSubscriptionWithRetry,
} from "@/features/profile/subscriptionSlice";
import api from "@/shared/services/api";
import { API_ENDPOINTS } from "@/shared/constants/api";
import { useQueryClient } from "@tanstack/react-query";
import { swipeKeys } from "@/features/discover/swipeQueries";
import { colors, gradients } from "../../../shared/theme/colors";

const FEATURES = [
  { icon: Zap, label: "Sınırsız Beğeni" },
  { icon: Eye, label: "Seni Beğenenleri Gör" },
  { icon: RotateCcw, label: "Geri Alma (Rewind)" },
  { icon: Ban, label: "Reklamsız Deneyim" },
];

// RC offering field'ları period bazında. Backend /plans endpoint'i ile bu key'leri
// eşleştiriyoruz — RC offering bu key'leri otomatik üretmez ama RC default convention
// monthly/annual/weekly. availablePackages içinde de bulunabilir, fallback olarak
// productId pattern üzerinden eşleştiriyoruz.
const PERIOD_LABELS = {
  weekly: { short: "Haftalık", per: "hafta" },
  monthly: { short: "Aylık", per: "ay" },
  yearly: { short: "Yıllık", per: "yıl" },
};

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
function mergePlansWithBackend(rcPlans, backendPlans) {
  const backendByPeriod = new Map();
  for (const b of backendPlans ?? []) {
    if (b.period) backendByPeriod.set(b.period, b);
  }

  return rcPlans
    .map((rc) => {
      const meta = backendByPeriod.get(rc.period);
      return {
        ...rc,
        displayName:
          meta?.displayName ?? PERIOD_LABELS[rc.period]?.short ?? rc.period,
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
  { primarySize = 44, secondaryColor = "#000" } = {},
) {
  if (!name) return null;
  const m = name.match(/premium/i);
  if (!m) {
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
  const before = name.slice(0, m.index).trim();
  const after = name.slice(m.index + m[0].length).trim();
  const periodText = before || after;
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

  // Premium satın alma/restore sonrası swipe stats cache'ini güncelle —
  // backend sınırsız için -1 dönüyor. Local cache eski limitli değerlerle
  // kaldığı için UI swipe sayacını "kalan" gösteriyor. setQueryData ile
  // anında remainingSwipes=-1, remainingUndos=-1, isPremium=true yap +
  // arka planda invalidate et (backend sync olduktan sonra fresh data
  // gelir).
  const promoteSwipeStatsToPremium = () => {
    queryClient.setQueryData(swipeKeys.stats, (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        isPremium: true,
        remainingSwipes: -1,
        remainingUndos: -1,
        superLikesRemaining:
          prev.superLikesRemaining === 0 ? -1 : prev.superLikesRemaining,
      };
    });
    queryClient.invalidateQueries({ queryKey: swipeKeys.stats });
  };
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

  useEffect(() => {
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
  }, []);

  // RC + backend birleştirilmiş plan listesi
  const plans = useMemo(
    () =>
      mergePlansWithBackend(
        extractPlansFromOffering(offering),
        backendPlans ?? [],
      ),
    [offering, backendPlans],
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

  const renderBackdrop = useCallback(
    (props) => <BlurBottomSheetBackdrop {...props} onPress={handleClose} />,
    [handleClose],
  );

  const handlePurchase = async (planOverride?: any) => {
    const plan = planOverride ?? selectedPlan;
    const pkg = plan?.pkg;
    if (!pkg) {
      Alert.alert("Hata", "Paket bulunamadı.");
      return;
    }
    setPurchasing(true);
    try {
      const isPremium = await purchasePackage(pkg);
      if (isPremium) {
        dispatch(setPremium({ isPremium: true }));
        promoteSwipeStatsToPremium();
        handleClose();
        onSuccess?.();
        dispatch(syncSubscriptionWithRetry({ maxAttempts: 4, delayMs: 1500 }));
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert(
          "Satın Alma Hatası",
          e.message || "İşlem gerçekleştirilemedi.",
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const isPremium = await restorePurchases();
      if (isPremium) {
        dispatch(setPremium({ isPremium: true }));
        promoteSwipeStatsToPremium();
        handleClose();
        onSuccess?.();
        dispatch(fetchSubscriptionStatus());
      } else {
        Alert.alert("Bulunamadı", "Aktif bir abonelik bulunamadı.");
      }
    } catch (e) {
      Alert.alert("Hata", e.message || "Geri yükleme başarısız.");
    } finally {
      setRestoring(false);
    }
  };

  // Trial bilgisi seçili plana göre — RC her plan için ayrı intro price tanımlayabilir.
  const introPrice = selectedPlan?.introPrice;
  const introUnits = introPrice?.periodNumberOfUnits;
  const trialDays =
    typeof introUnits === "number" && introUnits > 0 ? introUnits : 3;
  const showTrialBadge = Boolean(introPrice) || (selectedPlan && trialDays > 0);

  const selectedPriceString = selectedPlan?.priceString ?? "—";
  const selectedPeriodLabel =
    PERIOD_LABELS[selectedPlan?.period ?? "monthly"]?.per ?? "ay";

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
                  colors={gradients.neutralFade}
                  locations={[0, 0.35, 0.85]}
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
                      color: "#000",
                      fontWeight: "700",
                      fontSize: 14,
                      opacity: purchasing ? 0 : 1,
                    }}
                  >
                    {isPremium
                      ? "Hesap Zaten Lit Plus"
                      : showTrialBadge
                        ? `${trialDays} Gün Ücretsiz Dene`
                        : `${selectedPriceString} / ${selectedPeriodLabel} — Abone Ol`}
                  </Text>
                  {purchasing && (
                    <ActivityIndicator
                      size="small"
                      color="#000"
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
                    Satın alımları geri yükle
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
                Lit Plus aboneliği, App Store üzerinden otomatik olarak
                yenilenen bir aboneliktir. Aboneliğiniz, satın alma işleminin
                onaylanmasından sonra App Store hesabınızdan ücretlendirilir.
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
    ],
  );

  return (
    <AppBottomSheet
      visible={visible}
      snapPoints={["75%", "93%"]}
      handleComponent={null}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
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
          <X size={18} color={colors.text} strokeWidth={2.5} pointerEvents="none" />
        </BlurView>
      </TouchableOpacity>

      {/* Üstte hafif gradient accent — solid bg üzerinde sabit overlay, full-screen
          gradient'in GPU yüküne karşı küçük bir alan kapsar, modal animasyonunu
          etkilemez. */}
      <LinearGradient
        pointerEvents="none"
        colors={["#3a3a3e", colors.bg]}
        locations={[0, 1]}
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
          paddingBottom: 40,
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
            Eşleşmelerini hızlandır, seni beğenenleri gör ve daha fazlasını
            keşfet!
          </Text>

          {!showTrialBadge && (
            <View
              style={{
                marginTop: 14,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: "rgba(255,255,255,0.18)",
              }}
            >
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
                İlk {trialDays} gün ücretsiz
              </Text>
            </View>
          )}
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
                    : 3;
                const planShowTrial =
                  Boolean(planIntro) || (plan && planTrialDays > 0);
                const planPeriodLabel =
                  PERIOD_LABELS[plan?.period ?? "monthly"]?.per ?? "ay";
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
                      <LinearGradient
                        colors={gradients.neutralFade}
                        locations={[0, 0.5, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          paddingHorizontal: 20,
                          paddingTop: 10,
                          paddingBottom: 22,
                        }}
                      >
                        <View style={{ marginBottom: 6 }}>
                          {renderPlanName(plan.displayName, {
                            primarySize: 55,
                            secondaryColor: "#000",
                          })}
                        </View>
                        <Text
                          style={{
                            color: "#000",
                            fontSize: 18,
                            fontWeight: "400",
                          }}
                        >
                          {plan.priceString ?? "—"}
                        </Text>
                        {planShowTrial && (
                          <Text
                            style={{
                              color: colors.textDisabled,
                              fontSize: 12,
                              fontWeight: "400",
                              marginTop: 4,
                              lineHeight: 15,
                            }}
                          >
                            İlk {planTrialDays} gün ücretsiz kullanabilirsin,
                            ardından {plan.priceString ?? "—"}/{planPeriodLabel}{" "}
                            olarak otomatik yenilenir.
                          </Text>
                        )}
                        <SelectedBadge active={isSelected} />
                      </LinearGradient>
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
                Özellikler
              </Text>
              <View className="flex-row items-center gap-4">
                <Text className="text-white/70 font-bold text-[12px] uppercase w-16 text-center">
                  Standart
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
            {FEATURES.map(({ label }, index) => (
              <View
                key={label}
                className={`flex-row items-center justify-between px-6 ${
                  index !== FEATURES.length - 1 ? "mb-4" : ""
                }`}
              >
                <Text className="text-white font-[500] text-[13px] flex-1 pr-2">
                  {label}
                </Text>
                <View className="flex-row items-center gap-4">
                  <View className="w-16 items-center">
                    <X
                      size={18}
                      color="rgba(255, 255, 255, 0.4)"
                      strokeWidth={2}
                    />
                  </View>
                  <View className="w-16 items-center">
                    <Check size={18} color={colors.text} strokeWidth={2} />
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
