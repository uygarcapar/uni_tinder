import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import { X, Check, Zap, Eye, RotateCcw, Ban } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useDispatch } from "react-redux";
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
} from "../services/subscriptionService";
import {
  fetchSubscriptionStatus,
  setPremium,
  syncSubscriptionWithRetry,
} from "../store/slices/subscriptionSlice";
import api from "../services/api";
import { API_ENDPOINTS } from "../constants/api";

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
        displayName: meta?.displayName ?? PERIOD_LABELS[rc.period]?.short ?? rc.period,
        highlight: meta?.highlight ?? null,
        sortOrder: meta?.sortOrder ?? 99,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// "Aylığa kıyasla %X tasarruf" hesaplaması. Monthly price referans alınır.
function computeSavings(plan, plans) {
  if (!plan?.price || plan.period === "monthly") return null;
  const monthly = plans.find((p) => p.period === "monthly");
  if (!monthly?.price) return null;

  const months = plan.period === "yearly" ? 12 : plan.period === "weekly" ? 1 / 4.345 : null;
  if (!months) return null;

  const equivalentMonthlyTotal = monthly.price * months;
  if (equivalentMonthlyTotal <= 0) return null;

  const savingsRatio = 1 - plan.price / equivalentMonthlyTotal;
  if (savingsRatio <= 0.02) return null; // %2'nin altını gösterme — round-off gürültüsü
  return Math.round(savingsRatio * 100);
}

export default function PurchaseModal({ bottomSheetRef, onClose, onSuccess }) {
  const dispatch = useDispatch();
  const [offering, setOffering] = useState(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [backendPlans, setBackendPlans] = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  useEffect(() => {
    Promise.all([
      getOfferings().catch(() => null),
      api.get(API_ENDPOINTS.SUBSCRIPTION_PLANS).then((r) => r?.result?.plans ?? []).catch(() => []),
    ])
      .then(([o, plans]) => {
        setOffering(o);
        setBackendPlans(plans);
      })
      .finally(() => setLoadingOffering(false));
  }, []);

  // RC + backend birleştirilmiş plan listesi
  const plans = useMemo(
    () => mergePlansWithBackend(extractPlansFromOffering(offering), backendPlans ?? []),
    [offering, backendPlans]
  );

  // İlk render'da default seçim — highlight olan veya monthly
  useEffect(() => {
    if (selectedPeriod || plans.length === 0) return;
    const highlighted = plans.find((p) => p.highlight);
    setSelectedPeriod(highlighted?.period ?? plans.find((p) => p.period === "monthly")?.period ?? plans[0].period);
  }, [plans, selectedPeriod]);

  const selectedPlan = plans.find((p) => p.period === selectedPeriod) ?? plans[0];

  const renderBackdrop = useCallback(
    (props) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
      />
    ),
    []
  );

  const handlePurchase = async () => {
    const pkg = selectedPlan?.pkg;
    if (!pkg) {
      Alert.alert("Hata", "Paket bulunamadı.");
      return;
    }
    setPurchasing(true);
    try {
      const isPremium = await purchasePackage(pkg);
      if (isPremium) {
        dispatch(setPremium({ isPremium: true }));
        onClose?.();
        onSuccess?.();
        dispatch(syncSubscriptionWithRetry({ maxAttempts: 4, delayMs: 1500 }));
      }
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert("Satın Alma Hatası", e.message || "İşlem gerçekleştirilemedi.");
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
        onClose?.();
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
  const trialDays = typeof introUnits === "number" && introUnits > 0 ? introUnits : 3;
  const showTrialBadge = Boolean(introPrice) || (selectedPlan && trialDays > 0);

  const selectedPriceString = selectedPlan?.priceString ?? "—";
  const selectedPeriodLabel = PERIOD_LABELS[selectedPlan?.period ?? "monthly"]?.per ?? "ay";

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={["90%"]}
      enablePanDownToClose
      enableOverDrag={false}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: "#121212",
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
      }}
      handleIndicatorStyle={{ backgroundColor: "rgba(255,255,255,0.3)" }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 12,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{ width: 60 }}
        >
          <X size={22} color="#9CA3AF" strokeWidth={2} pointerEvents="none" />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: "#fff",
            fontSize: 15,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          lit gold
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Card */}
        <LinearGradient
          colors={["#ff173a", "#FF4D4D", "#fc803d"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
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
              color: "#fff",
              fontSize: 56,
              fontFamily: "Duckie-regular",
              marginBottom: 8,
            }}
          >
            lit gold
          </Text>
          <Text
            style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, textAlign: "center" }}
          >
            Eşleşmelerini hızlandır, seni beğenenleri gör ve daha fazlasını keşfet!
          </Text>

          {showTrialBadge && (
            <View
              style={{
                marginTop: 14,
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 999,
                borderCurve: "continuous",
                backgroundColor: "rgba(255,255,255,0.18)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                İlk {trialDays} gün ücretsiz
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* Plan Selector (FAZ 5) */}
        {!loadingOffering && plans.length > 1 && (
          <View style={{ marginBottom: 20 }}>
            {plans.map((plan) => {
              const isSelected = plan.period === selectedPeriod;
              const savings = computeSavings(plan, plans);
              return (
                <TouchableOpacity
                  key={plan.period}
                  onPress={() => setSelectedPeriod(plan.period)}
                  activeOpacity={0.85}
                  style={{
                    borderRadius: 20,
                    borderCurve: "continuous",
                    borderWidth: isSelected ? 1.5 : 0.5,
                    borderColor: isSelected ? "#fc4526" : "rgba(255,255,255,0.12)",
                    backgroundColor: isSelected ? "rgba(252,69,38,0.08)" : "rgba(255,255,255,0.02)",
                    paddingHorizontal: 18,
                    paddingVertical: 16,
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                        {plan.displayName}
                      </Text>
                      {plan.highlight && (
                        <View
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 999,
                            backgroundColor: "#fc4526",
                          }}
                        >
                          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                            {plan.highlight}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: "#9CA3AF", fontSize: 13 }}>
                      {plan.priceString ?? "—"}
                      {savings ? `  ·  %${savings} tasarruf` : ""}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      borderWidth: 1.5,
                      borderColor: isSelected ? "#fc4526" : "rgba(255,255,255,0.3)",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isSelected ? "#fc4526" : "transparent",
                    }}
                  >
                    {isSelected && <Check size={12} color="#fff" strokeWidth={3} pointerEvents="none" />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Features */}
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 13,
            fontWeight: "700",
            marginBottom: 12,
            marginLeft: 4,
          }}
        >
          Özellikler
        </Text>
        <View
          style={{
            borderRadius: 32,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            marginBottom: 24,
          }}
        >
          {FEATURES.map(({ icon: Icon, label }, i) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderBottomWidth: i < FEATURES.length - 1 ? 0.5 : 0,
                borderBottomColor: "rgba(255,255,255,0.07)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Icon size={18} color="#fff" strokeWidth={1.5} pointerEvents="none" />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
                  {label}
                </Text>
              </View>
              <Check size={16} color="#fff" strokeWidth={2.5} pointerEvents="none" />
            </View>
          ))}
        </View>

        {/* Price + CTA */}
        {loadingOffering ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
        ) : (
          <>
            <TouchableOpacity
              onPress={handlePurchase}
              disabled={purchasing || restoring || !selectedPlan}
              activeOpacity={0.85}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: "#fff",
                paddingVertical: 17,
                alignItems: "center",
                marginBottom: 12,
                opacity: selectedPlan ? 1 : 0.5,
              }}
            >
              {purchasing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                  {showTrialBadge
                    ? `${trialDays} Gün Ücretsiz Dene`
                    : `${selectedPriceString} / ${selectedPeriodLabel} — Abone Ol`}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRestore}
              disabled={purchasing || restoring}
              activeOpacity={0.7}
              style={{ alignItems: "center", paddingVertical: 10 }}
            >
              {restoring ? (
                <ActivityIndicator size="small" color="#9CA3AF" />
              ) : (
                <Text style={{ color: "#6B7280", fontSize: 13 }}>
                  Satın alımları geri yükle
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <Text
          style={{
            color: "#4B5563",
            fontSize: 11,
            textAlign: "center",
            marginTop: 16,
            lineHeight: 16,
          }}
        >
          {showTrialBadge
            ? `İlk ${trialDays} gün ücretsiz, ardından ${selectedPriceString}/${selectedPeriodLabel} olarak otomatik yenilenir. İstediğin zaman iptal edebilirsin — deneme süresi dolmadan iptal edersen ücret alınmaz.`
            : `Abonelik her ${selectedPeriodLabel} otomatik yenilenir. İstediğin zaman iptal edebilirsin.`}
        </Text>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
