import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { X, MessageSquare, Lock, Infinity as InfinityIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppDispatch } from "@/shared/hooks/redux";
import {
  getChatUnlockPackage,
  purchaseChatUnlock,
} from "@/features/profile/subscriptionService";
import {
  redeemChatUnlock,
  markQuotaUnlocked,
  fetchChatQuota,
} from "@/features/chat/chatSlice";

/**
 * FAZ 6: Chat ekonomisi için consumable paywall.
 *
 * Akış:
 *   1) Component mount → getChatUnlockPackage() → RC consumable package
 *   2) Kullanıcı "Sohbeti Aç" basar → purchaseChatUnlock → transactionId
 *   3) Backend POST /unlock?transactionId=... — webhook gecikirse 402, retry
 *   4) Success → Redux markQuotaUnlocked + fetchChatQuota (authoritative)
 *
 * Premium subscription paywall'ı (PurchaseModal) ile karıştırma:
 *   - Bu component tek seferlik consumable satar, premium subscription DEĞİL.
 *   - Hedef: spesifik bir sohbetin 50-mesaj sınırını kaldırmak.
 */
export default function ChatUnlockSheet({
  visible,
  conversationId,
  onClose,
  onSuccess,
}: any) {
  const dispatch = useAppDispatch();
  const [pkg, setPkg] = useState(null);
  const [loadingPkg, setLoadingPkg] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoadingPkg(true);
    getChatUnlockPackage()
      .then((p) => setPkg(p))
      .catch(() => setPkg(null))
      .finally(() => setLoadingPkg(false));
  }, [visible]);

  const priceString = pkg?.product?.priceString ?? "—";

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
    if (!pkg) {
      Alert.alert("Hata", "Paket bulunamadı.");
      return;
    }
    if (!conversationId) {
      Alert.alert("Hata", "Sohbet seçili değil.");
      return;
    }
    setPurchasing(true);
    try {
      const { transactionId } = await purchaseChatUnlock(pkg);
      if (!transactionId) {
        Alert.alert(
          "Hata",
          "Satın alma tamamlandı ama doğrulama bilgisi alınamadı. Lütfen 'Geri Yükle' butonunu dene."
        );
        return;
      }

      // Optimistic — UI hemen unlocked görünsün; backend hâlâ doğrulama yapacak.
      dispatch(markQuotaUnlocked({ conversationId }));

      // Backend'e receipt redeem (idempotent, transactionId UNIQUE). Webhook race olabilir
      // → backend 402 dönerse birkaç saniye sonra retry yap.
      const result: any = await dispatch(
        redeemChatUnlock({ conversationId, transactionId })
      );

      if (result?.error) {
        const status = result?.payload?.status;
        if (status === 402) {
          // Webhook gecikti → 3sn sonra tekrar dene
          await new Promise((r) => setTimeout(r, 3000));
          await dispatch(redeemChatUnlock({ conversationId, transactionId }));
        }
      }

      // Authoritative refresh
      dispatch(fetchChatQuota(conversationId));
      onClose?.();
      onSuccess?.();
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert("Satın Alma Hatası", e.message || "İşlem gerçekleştirilemedi.");
      }
    } finally {
      setPurchasing(false);
    }
  };

  const features = useMemo(
    () => [
      { icon: InfinityIcon, label: "Bu sohbette sınırsız mesajlaşma" },
      { icon: MessageSquare, label: "Tek seferlik satın alma — abonelik değil" },
      { icon: Lock, label: "Diğer sohbetler etkilenmez" },
    ],
    []
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["72%"]}
      backdropComponent={renderBackdrop}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 8,
          backgroundColor: "#121212",
        }}
      >
        <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={{ width: 60 }}>
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
          Sohbeti Aç
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: "#121212" }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient
          colors={["#ff173a", "#FF4D4D", "#fc803d"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            overflow: "hidden",
            padding: 22,
            marginBottom: 20,
            alignItems: "center",
          }}
        >
          <MessageSquare size={48} color="#fff" strokeWidth={1.5} />
          <Text
            style={{
              marginTop: 12,
              color: "#fff",
              fontSize: 22,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            50 mesaj sınırına ulaştın
          </Text>
          <Text
            style={{
              marginTop: 8,
              color: "rgba(255,255,255,0.9)",
              fontSize: 13,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            Bu sohbetin kilidini bir kez aç, ikiniz de sınırsız mesajlaşın.
          </Text>
        </LinearGradient>

        {/* Features */}
        <View
          style={{
            borderRadius: 28,
            borderCurve: "continuous",
            overflow: "hidden",
            borderWidth: 0.5,
            borderColor: "rgba(255,255,255,0.1)",
            marginBottom: 24,
          }}
        >
          {features.map(({ icon: Icon, label }, i) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: i < features.length - 1 ? 0.5 : 0,
                borderBottomColor: "rgba(255,255,255,0.07)",
              }}
            >
              <Icon size={18} color="#fff" strokeWidth={1.5} pointerEvents="none" />
              <Text
                style={{ color: "#fff", fontSize: 14, fontWeight: "500", flex: 1 }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        {loadingPkg ? (
          <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
        ) : !pkg ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Text style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center" }}>
              Şu anda paket bulunamadı. Lütfen daha sonra tekrar dene.
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={purchasing}
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
                {priceString} — Sohbeti Aç
              </Text>
            )}
          </TouchableOpacity>
        )}

        <Text
          style={{
            color: "#4B5563",
            fontSize: 11,
            textAlign: "center",
            marginTop: 12,
            lineHeight: 16,
          }}
        >
          Tek seferlik satın alma. Yenileme yok, otomatik ücret alınmaz.
          İkiniz de Premium olursanız bu sohbet zaten sınırsız olur.
        </Text>
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}
