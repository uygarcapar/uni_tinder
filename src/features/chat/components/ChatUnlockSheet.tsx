import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import AppModal from "@/shared/components/AppModal";
import { MessageSquare, Lock, Infinity as InfinityIcon } from "lucide-react-native";
import SFIcon, { type SFSymbol } from "@/shared/components/SFIcon";
import { LinearGradient } from "expo-linear-gradient";
import { useAppDispatch } from "@/shared/hooks/redux";
import { useTranslation } from "react-i18next";
import {
  getChatUnlockPackage,
  purchaseChatUnlock,
} from "@/features/profile/subscriptionService";
import {
  redeemChatUnlock,
  markQuotaUnlocked,
  fetchChatQuota,
} from "@/features/chat/chatSlice";
import { colors, gradients } from "../../../shared/theme/colors";

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
  const { t } = useTranslation();
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

  const handlePurchase = async () => {
    if (!pkg) {
      Alert.alert(t('common.error'), t('chatUnlock.errors.packageNotFound'));
      return;
    }
    if (!conversationId) {
      Alert.alert(t('common.error'), t('chatUnlock.errors.chatNotSelected'));
      return;
    }
    setPurchasing(true);
    try {
      const { transactionId } = await purchaseChatUnlock(pkg);
      if (!transactionId) {
        Alert.alert(t('common.error'), t('chatUnlock.errors.verificationFailed'));
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
      dispatch(fetchChatQuota({ conversationId, force: true }));
      onClose?.();
      onSuccess?.();
    } catch (e) {
      if (!e.userCancelled) {
        Alert.alert(t('chatUnlock.errors.purchaseTitle'), e.message || t('purchase.errors.operationFailed'));
      }
    } finally {
      setPurchasing(false);
    }
  };

  const features = useMemo(
    () => [
      { sf: "infinity" as SFSymbol, lucide: InfinityIcon, label: t('chatUnlock.feature1') },
      { sf: "bubble.left.fill" as SFSymbol, lucide: MessageSquare, label: t('chatUnlock.feature2') },
      { sf: "lock.fill" as SFSymbol, lucide: Lock, label: t('chatUnlock.feature3') },
    ],
    [t]
  );

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      title={t('chatUnlock.title')}
      snapPoints={["72%"]}
    >
        {/* Hero */}
        <LinearGradient
          colors={gradients.premiumAlt}
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
          <SFIcon name="bubble.left.fill" fallback={MessageSquare} size={48} color={colors.text} strokeWidth={1.5} />
          <Text
            style={{
              marginTop: 12,
              color: colors.text,
              fontSize: 22,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            {t('chatUnlock.heroTitle')}
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
            {t('chatUnlock.heroSubtitle')}
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
          {features.map(({ sf, lucide, label }, i) => (
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
              <SFIcon name={sf} fallback={lucide} size={18} color={colors.text} strokeWidth={1.5} style={{ pointerEvents: "none" }} />
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: "500", flex: 1 }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        {loadingPkg ? (
          <ActivityIndicator color={colors.text} style={{ marginVertical: 20 }} />
        ) : !pkg ? (
          <View style={{ alignItems: "center", paddingVertical: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "center" }}>
              {t('chatUnlock.notAvailable')}
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
              backgroundColor: colors.text,
              paddingVertical: 17,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            {purchasing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                {t('chatUnlock.cta', { price: priceString })}
              </Text>
            )}
          </TouchableOpacity>
        )}

        <Text
          style={{
            color: colors.textDisabled,
            fontSize: 11,
            textAlign: "center",
            marginTop: 12,
            lineHeight: 16,
          }}
        >
          {t('chatUnlock.disclaimer')}
        </Text>
    </AppModal>
  );
}
