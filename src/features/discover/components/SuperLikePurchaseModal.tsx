import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import type {
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Heart } from "lucide-react-native";
import SFIcon from "@/shared/components/SFIcon";
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { useAppSelector } from "@/shared/hooks/redux";
import {
  getSuperlikeOffering,
  purchaseSuperlikePack,
} from "@/features/profile/subscriptionService";
import {
  redeemSuperlikePack,
  isPendingRedeemError,
  redeemUserKey,
  type SuperlikeRedeemResult,
} from "@/features/discover/superlikeRedeem";
import { showInfoToast } from "@/shared/services/toaster";
import { analytics } from "@/shared/services/analytics";
import { colors, gradients } from "../../../shared/theme/colors";

/**
 * SuperLike paketi (consumable) satın alma sheet'i.
 *
 * Paketler RC'nin AYRI `superlikes` offering'inden geliyor (premium offering'i
 * `current`, bu `all["superlikes"]`). Kredi sayısı ürün id'sinden okunuyor
 * (`superlike_10` → 10); fiyat DAİMA RC'nin locale'li `priceString`i — sabit ₺
 * yazmak App Store'un bölgesel fiyatlandırmasıyla çelişiyordu.
 *
 * Satın alma bakiyeyi TEK BAŞINA artırmaz: consumable entitlement üretmediği
 * için krediyi backend'e redeem ettirmek zorundayız (superlikeRedeem.ts).
 */

interface SuperlikePack {
  pkg: PurchasesPackage;
  productId: string;
  title: string | null;
  priceString: string | null;
  price: number | null;
  /** Ürün id'sinden okunan kredi sayısı; okunamazsa null. */
  credits: number | null;
}

/** `superlike_10` → 10. Bulunamazsa null (kart ürünün kendi başlığını gösterir). */
function creditsFromProductId(productId: string | null): number | null {
  const m = String(productId ?? "").match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractPacks(offering: PurchasesOffering | null): SuperlikePack[] {
  return (offering?.availablePackages ?? [])
    .map((pkg) => ({
      pkg,
      productId: pkg?.product?.identifier ?? "",
      title: pkg?.product?.title ?? null,
      priceString: pkg?.product?.priceString ?? null,
      price: typeof pkg?.product?.price === "number" ? pkg.product.price : null,
      credits: creditsFromProductId(pkg?.product?.identifier ?? null),
    }))
    .filter((p) => !!p.productId)
    .sort((a, b) => {
      // Kredi sayısına göre artan; id'den sayı çıkmayan ürün (beklenmedik
      // adlandırma) fiyatına göre sona düşer, grid'i bozmasın.
      const ac = a.credits ?? Number.MAX_SAFE_INTEGER;
      const bc = b.credits ?? Number.MAX_SAFE_INTEGER;
      if (ac !== bc) return ac - bc;
      return (a.price ?? 0) - (b.price ?? 0);
    });
}

export default function SuperLikePurchaseModal({
  visible,
  onClose,
  onPurchased,
}: any) {
  const { t } = useTranslation();
  const authUser = useAppSelector((s) => s.auth.user);
  const userId = redeemUserKey(authUser);

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [purchasing, setPurchasing] = useState(false);

  // Offering YALNIZ sheet ilk açıldığında çekilir — PurchaseModal'daki desenin
  // aynısı: bu bileşen Discover'da gömülü duruyor, mount'ta koşulsuz çekmek
  // cold-boot'ta gereksiz RC round-trip'i demekti.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!visible || fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    // RC SDK cold start'ta offering'i null dönebiliyor (configure → network).
    const fetchWithRetry = async (
      attempt = 0,
    ): Promise<PurchasesOffering | null> => {
      const o = await getSuperlikeOffering().catch(() => null);
      if (o || attempt >= 3) return o;
      await new Promise((r) => setTimeout(r, 600));
      return fetchWithRetry(attempt + 1);
    };
    fetchWithRetry()
      .then((o) => {
        if (cancelled) return;
        setOffering(o);
        // Boş döndüyse latch'i AÇ: fetchedRef kalıcı olduğu için ilk deneme
        // ağ/SDK-cold-start yüzünden boş dönünce sheet'i kapatıp açmak bir daha
        // hiç denemiyordu — "paketler yüklenemedi" app yeniden başlayana kadar
        // yapışıp kalıyordu. Bir sonraki açılış tekrar denesin.
        if ((o?.availablePackages?.length ?? 0) === 0) fetchedRef.current = false;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const packs = useMemo(() => extractPacks(offering), [offering]);

  useEffect(() => {
    if (!visible) setSelectedProductId(null);
  }, [visible]);

  const selectedPack = packs.find((p) => p.productId === selectedProductId);
  const hasSelection = !!selectedPack;

  const handleBuy = useCallback(async () => {
    if (!selectedPack || purchasing) return;
    if (!userId) {
      Alert.alert(t("common.error"), t("errors.operationFailed"));
      return;
    }
    setPurchasing(true);
    analytics.capture("superlike_pack_purchase_initiated", {
      productId: selectedPack.productId,
    });
    try {
      const { transactionId, productId } = await purchaseSuperlikePack(
        selectedPack.pkg,
      );
      analytics.capture("superlike_pack_purchase_completed", { productId });

      if (!transactionId) {
        // RC transaction id'yi ne sonuçta ne de customerInfo'da verdi. Satın
        // alma yine de gerçekleşti — açılıştaki flush RC geçmişinden yakalar.
        onClose?.();
        showInfoToast({
          title: t("superLikePurchase.pendingTitle"),
          message: t("superLikePurchase.pendingMessage"),
        });
        return;
      }

      const result: SuperlikeRedeemResult = await redeemSuperlikePack({
        userId,
        transactionId,
        productId,
      });
      onClose?.();
      // `creditsAdded: 0` + `alreadyRedeemed` hata değil (çift tık / retry);
      // bakiye yine güncel, kullanıcıya "zaten işlenmişti" denir.
      if (result.creditsAdded > 0) {
        showInfoToast({
          title: t("superLikePurchase.successTitle"),
          message: t("superLikePurchase.successMessage", {
            count: result.creditsAdded,
          }),
        });
      } else {
        showInfoToast({
          title: t("superLikePurchase.syncedTitle"),
          message: t("superLikePurchase.syncedMessage"),
        });
      }
      onPurchased?.(result);
    } catch (e: any) {
      if (e?.userCancelled) return;
      if (isPendingRedeemError(e)) {
        // Kuyruğa alındı — para alındı, kredi bir sonraki açılışta yazılacak.
        onClose?.();
        showInfoToast({
          title: t("superLikePurchase.pendingTitle"),
          message: t("superLikePurchase.pendingMessage"),
        });
        return;
      }
      Alert.alert(
        t("superLikePurchase.errorTitle"),
        e?.message || t("errors.operationFailed"),
      );
    } finally {
      setPurchasing(false);
    }
  }, [selectedPack, purchasing, userId, t, onClose, onPurchased]);

  const ctaLabel = purchasing
    ? ""
    : selectedPack?.priceString
      ? t("superLikePurchase.ctaWithPrice", {
          price: selectedPack.priceString,
        })
      : t("superLikePurchase.cta");

  const footer = (
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
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleBuy}
        disabled={!hasSelection || purchasing}
        style={{
          width: "100%",
          borderRadius: 999,
          borderCurve: "continuous",
          overflow: "hidden",
          backgroundColor:
            hasSelection && !purchasing
              ? colors.litPlus
              : "rgba(255,255,255,0.15)",
          paddingVertical: 18,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: hasSelection ? colors.text : "rgba(255,255,255,0.5)",
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {ctaLabel}
        </Text>
        {purchasing && (
          <ActivityIndicator
            size="small"
            color={colors.text}
            style={{ position: "absolute" }}
          />
        )}
      </TouchableOpacity>
      <Text
        style={{
          marginTop: 10,
          marginHorizontal: 10,
          color: "rgba(255,255,255,0.5)",
          fontSize: 11,
          textAlign: "center",
          lineHeight: 15,
        }}
      >
        {t("superLikePurchase.disclaimer")}
      </Text>
    </BlurView>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={["55%", "70%"]}
      backgroundStyle={{ backgroundColor: colors.shopSurface }}
      handleComponent={null}
      footer={footer}
    >
      {/* Yukarıdan gri → aşağıda messageOwn'a fade — PurchaseModal ile aynı */}
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

      <View
        style={{
          flex: 1,
          paddingTop: 35,
          paddingHorizontal: 24,
          paddingBottom: 20,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 24,
            fontWeight: "700",
            textAlign: "center",
            marginBottom: 10,
            marginTop: 8,
          }}
        >
          {t("superLikePurchase.title")}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {t("superLikePurchase.description")}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
        ) : packs.length === 0 ? (
          // RC offering'i yok/boş (config eksik ya da ağ). Sabit paket listesine
          // DÜŞMÜYORUZ: fiyatı ve ürünü uyduramayız, satın alma da yapılamaz.
          <Text
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              textAlign: "center",
              lineHeight: 19,
              marginTop: 30,
              paddingHorizontal: 12,
            }}
          >
            {t("superLikePurchase.unavailableMessage")}
          </Text>
        ) : (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              width: "100%",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {packs.map((pack) => {
              const isSelected = pack.productId === selectedProductId;
              return (
                <TouchableOpacity
                  key={pack.productId}
                  activeOpacity={0.85}
                  disabled={purchasing}
                  onPress={() => setSelectedProductId(pack.productId)}
                  style={{
                    width: "48%",
                    aspectRatio: 1.25,
                    borderRadius: 36,
                    borderCurve: "continuous",
                    borderWidth: 0.5,
                    borderColor: isSelected
                      ? colors.text
                      : "rgba(255,255,255,0.2)",
                    overflow: "hidden",
                    opacity: !hasSelection || isSelected ? 1 : 0.45,
                  }}
                >
                  <BlurView
                    intensity={70}
                    tint="dark"
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 22,
                    }}
                  >
                    <SFIcon
                      name="heart.fill"
                      fallback={Heart}
                      size={50}
                      color={colors.text}
                      strokeWidth={1.5}
                    />
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.9)",
                        fontSize: 14,
                        fontWeight: "700",
                        marginTop: 8,
                      }}
                      numberOfLines={1}
                    >
                      {pack.credits != null
                        ? t("superLikePurchase.packLabel", {
                            count: pack.credits,
                          })
                        : (pack.title ?? pack.productId)}
                    </Text>
                    <Text
                      style={{
                        color: "rgba(255,255,255,0.75)",
                        fontSize: 15,
                        fontWeight: "300",
                        marginTop: 4,
                      }}
                      numberOfLines={1}
                    >
                      {pack.priceString ?? "—"}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </AppBottomSheet>
  );
}
