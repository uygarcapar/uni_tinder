import { useCallback, useEffect, useState } from "react";
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
import { fetchSubscriptionStatus, setPremium } from "../store/slices/subscriptionSlice";

const FEATURES = [
  { icon: Zap, label: "Sınırsız Beğeni" },
  { icon: Eye, label: "Seni Beğenenleri Gör" },
  { icon: RotateCcw, label: "Geri Alma (Rewind)" },
  { icon: Ban, label: "Reklamsız Deneyim" },
];

export default function PurchaseModal({ bottomSheetRef, onClose, onSuccess }) {
  const dispatch = useDispatch();
  const [offering, setOffering] = useState(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getOfferings()
      .then((o) => setOffering(o))
      .catch(() => setOffering(null))
      .finally(() => setLoadingOffering(false));
  }, []);

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
    const pkg = offering?.monthly ?? offering?.availablePackages?.[0];
    if (!pkg) {
      Alert.alert("Hata", "Paket bulunamadı.");
      return;
    }
    setPurchasing(true);
    try {
      const isPremium = await purchasePackage(pkg);
      if (isPremium) {
        dispatch(setPremium({ isPremium: true }));
        dispatch(fetchSubscriptionStatus());
        onClose?.();
        onSuccess?.();
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
        dispatch(fetchSubscriptionStatus());
        onClose?.();
        onSuccess?.();
      } else {
        Alert.alert("Bulunamadı", "Aktif bir abonelik bulunamadı.");
      }
    } catch (e) {
      Alert.alert("Hata", e.message || "Geri yükleme başarısız.");
    } finally {
      setRestoring(false);
    }
  };

  const monthlyPkg = offering?.monthly ?? offering?.availablePackages?.[0];
  const priceString = monthlyPkg?.product?.priceString ?? "249,99 ₺";

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
            marginBottom: 24,
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
        </LinearGradient>

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
              disabled={purchasing || restoring}
              activeOpacity={0.85}
              style={{
                borderRadius: 999,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: "#fff",
                paddingVertical: 17,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              {purchasing ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                  {priceString} / Ay — Abone Ol
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
          Abonelik her ay otomatik yenilenir. İstediğin zaman iptal edebilirsin.
        </Text>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
