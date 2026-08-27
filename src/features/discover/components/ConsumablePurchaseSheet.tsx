import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import AppBottomSheet from "@/shared/components/AppBottomSheet";
import { useAppSelector } from "@/shared/hooks/redux";
import {
  redeemConsumablePack,
  isPendingRedeemError,
  redeemUserKey,
  type ConsumableRedeemResult,
  type RedeemFlowConfig,
} from "@/features/discover/consumableRedeem";
import { showInfoToast } from "@/shared/services/toaster";
import type { ToastIconKind } from "@/shared/components/toaster/toastIcons";
import { analytics } from "@/shared/services/analytics";
import { colors, gradients, ink } from "../../../shared/theme/colors";
import { plainBlurTint } from "@/shared/theme/blur";

/**
 * Consumable paket satın alma sheet'i — SuperLike ve kurtarma paketleri bunu
 * PAYLAŞIYOR (SuperLikePurchaseModal / RecoveryPurchaseModal ince sarmalayıcı).
 *
 * Paketler RC'nin AYRI offering'lerinden geliyor (premium offering'i `current`,
 * bunlar `all[...]`). Kredi sayısı ürün id'sinden okunuyor (`superlike_10` → 10,
 * `recovery_3` → 3); fiyat DAİMA RC'nin locale'li `priceString`i — sabit ₺
 * yazmak App Store'un bölgesel fiyatlandırmasıyla çelişiyordu.
 *
 * Satın alma bakiyeyi TEK BAŞINA artırmaz: consumable entitlement üretmediği
 * için krediyi backend'e redeem ettirmek zorundayız (consumableRedeem.ts).
 */

// RC offering fetch'i için tavan — native promise takılırsa spinner asılı kalmasın.
const OFFERING_FETCH_TIMEOUT_MS = 20000;

interface ConsumablePack {
  pkg: PurchasesPackage;
  productId: string;
  title: string | null;
  priceString: string | null;
  price: number | null;
  /** Ürün id'sinden okunan kredi sayısı; okunamazsa null. */
  credits: number | null;
}

/**
 * `superlike_10` → 10, `recovery_3` → 3. Bulunamazsa null (kart ürünün kendi
 * başlığını gösterir).
 *
 * ⛔ Ürün id'sinde adetten BAŞKA rakam olmamalı: `2026_recovery_10` sessizce
 * 2026 kredi okur. Sözleşme bunu mağaza tarafında garanti ediyor.
 */
function creditsFromProductId(productId: string | null): number | null {
  const m = String(productId ?? "").match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractPacks(offering: PurchasesOffering | null): ConsumablePack[] {
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

export interface ConsumablePurchaseSheetProps {
  visible: boolean;
  onClose?: () => void;
  onPurchased?: (result: ConsumableRedeemResult) => void;
  /** Redeem sözleşmesi (uç, kod ailesi, kuyruk anahtarı). */
  flow: RedeemFlowConfig;
  fetchOffering: () => Promise<PurchasesOffering | null>;
  purchasePack: (
    pkg: PurchasesPackage,
  ) => Promise<{ transactionId: string | null; productId: string | null }>;
  /** i18n anahtar öneki — `superLikePurchase` / `recoveryPurchase`. */
  i18nPrefix: string;
  /** Analytics olay öneki — `superlike_pack` / `recovery_pack`. */
  analyticsKind: string;
  /** Paket kartındaki simge. */
  renderGlyph: (size: number, color: string) => ReactNode;
  /**
   * Satın alma sonrası toast'ının solundaki ürün simgesi. Kabuk paylaşıldığı
   * için metinler ("kredin yüklendi") tek başına hangi ürün olduğunu
   * söylemiyor — simge o boşluğu kapatıyor.
   */
  toastIcon?: ToastIconKind;
  /**
   * İkincil çıkış — kurtarma sheet'inde free kullanıcıya gösterilen "abonelik
   * de bu hakkı veriyor" bağlantısı. Premium'da geçilmiyor (§3: premium'a
   * abonelik teklifi gösterilmemeli).
   */
  secondaryAction?: { label: string; onPress: () => void } | null;
  /**
   * Açılışta en küçük kademeyi (listedeki ilk paket) seçili getirir — not ve
   * SuperLike sheet'lerinde açık: boş seçimle açılıp CTA'yı ölü göstermek
   * fazladan bir dokunuş istiyordu, seçim zaten tek dokunuşla değişiyor.
   * Varsayılan KAPALI — kurtarma sheet'i seçimsiz açılmaya devam ediyor.
   */
  autoSelectFirstPack?: boolean;
  snapPoints?: string[];
}

export default function ConsumablePurchaseSheet({
  visible,
  onClose,
  onPurchased,
  flow,
  fetchOffering,
  purchasePack,
  i18nPrefix,
  analyticsKind,
  renderGlyph,
  toastIcon,
  secondaryAction = null,
  autoSelectFirstPack = false,
  snapPoints = ["55%", "70%"],
}: ConsumablePurchaseSheetProps) {
  const { t } = useTranslation();
  const authUser = useAppSelector((s) => s.auth.user);
  const userId = redeemUserKey(authUser);
  const key = (suffix: string) => `${i18nPrefix}.${suffix}`;

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [purchasing, setPurchasing] = useState(false);

  // Offering sheet açıldığında çekilir — PurchaseModal'daki desenin aynısı: bu
  // bileşen Discover/Profile/Likes'ta gömülü duruyor, mount'ta koşulsuz çekmek
  // cold-boot'ta gereksiz RC round-trip'i demekti.
  //
  // Latch "elimizde paket var" kuralına bağlı. Tek-atışlık ref + kapanışta
  // cancel ikilisi, sheet fetch bitmeden kapandığında `loading`i true'da
  // kilitliyor ve ref yandığı için bir daha hiç denemiyordu → o ekran mount'u
  // boyunca sonsuz spinner. Boş/başarısız sonuç bir sonraki açılışta yeniden
  // denenir, dolu sonuç cache'lenir.
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );
  const hasPacks = (offering?.availablePackages?.length ?? 0) > 0;
  // Fetch'i deps'ten okumuyoruz: çağıran her render'da yeni bir closure
  // geçirirse effect kendini yeniden tetikler ve RC'ye tur üstüne tur atardı.
  const fetchOfferingRef = useRef(fetchOffering);
  fetchOfferingRef.current = fetchOffering;
  useEffect(() => {
    if (!visible || hasPacks || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    // RC SDK cold start'ta offering'i null dönebiliyor (configure → network).
    const fetchWithRetry = async (
      attempt = 0,
    ): Promise<PurchasesOffering | null> => {
      const o = await fetchOfferingRef.current().catch(() => null);
      if (o || attempt >= 3) return o;
      await new Promise((r) => setTimeout(r, 600));
      return fetchWithRetry(attempt + 1);
    };
    // Native RC promise'i takılırsa spinner süresiz asılı kalmasın.
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutFallback = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => resolve(null), OFFERING_FETCH_TIMEOUT_MS);
    });
    Promise.race([fetchWithRetry(), timeoutFallback])
      .then((o) => {
        // Kapanmış sheet'te de yazarız (yalnız unmount'ta durur) — bir sonraki
        // açılış hazır veriyle gelsin.
        if (!mountedRef.current) return;
        setOffering(o);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        inFlightRef.current = false;
        if (mountedRef.current) setLoading(false);
      });
  }, [visible, hasPacks]);

  const packs = useMemo(() => extractPacks(offering), [offering]);

  useEffect(() => {
    if (!visible) setSelectedProductId(null);
  }, [visible]);

  // Hazır seçim (opt-in): paketler `extractPacks` içinde krediye göre ARTAN
  // sıralı, yani ilk eleman daima en küçük kademe. Paketler sheet açıldıktan
  // sonra geldiği için `visible`a değil `packs`e bakıyoruz. Kullanıcı seçimini
  // ezmiyor: yalnız seçim boşken yazıyor, kapanışta yukarıdaki effect sıfırlar.
  useEffect(() => {
    if (!autoSelectFirstPack || !visible || packs.length === 0) return;
    setSelectedProductId((prev) => prev ?? packs[0].productId);
  }, [autoSelectFirstPack, visible, packs]);

  const selectedPack = packs.find((p) => p.productId === selectedProductId);
  const hasSelection = !!selectedPack;

  const handleBuy = useCallback(async () => {
    if (!selectedPack || purchasing) return;
    if (!userId) {
      Alert.alert(t("common.error"), t("errors.operationFailed"));
      return;
    }
    setPurchasing(true);
    analytics.capture(`${analyticsKind}_purchase_initiated`, {
      productId: selectedPack.productId,
    });
    try {
      const { transactionId, productId } = await purchasePack(selectedPack.pkg);
      analytics.capture(`${analyticsKind}_purchase_completed`, { productId });

      if (!transactionId) {
        // RC transaction id'yi ne sonuçta ne de customerInfo'da verdi. Satın
        // alma yine de gerçekleşti — açılıştaki flush RC geçmişinden yakalar.
        onClose?.();
        showInfoToast({
          title: t(key("pendingTitle")),
          message: t(key("pendingMessage")),
          icon: toastIcon,
        });
        return;
      }

      const result = await redeemConsumablePack(flow, {
        userId,
        transactionId,
        productId,
      });
      onClose?.();
      // `creditsAdded: 0` + `alreadyRedeemed` hata değil (çift tık / retry);
      // bakiye yine güncel, kullanıcıya "zaten işlenmişti" denir.
      if (result.creditsAdded > 0) {
        showInfoToast({
          title: t(key("successTitle")),
          message: t(key("successMessage"), { count: result.creditsAdded }),
          icon: toastIcon,
        });
      } else {
        showInfoToast({
          title: t(key("syncedTitle")),
          message: t(key("syncedMessage")),
          icon: toastIcon,
        });
      }
      onPurchased?.(result);
    } catch (e: any) {
      if (e?.userCancelled) return;
      if (isPendingRedeemError(e)) {
        // Kuyruğa alındı — para alındı, kredi bir sonraki açılışta yazılacak.
        onClose?.();
        showInfoToast({
          title: t(key("pendingTitle")),
          message: t(key("pendingMessage")),
          icon: toastIcon,
        });
        return;
      }
      Alert.alert(t(key("errorTitle")), e?.message || t("errors.operationFailed"));
    } finally {
      setPurchasing(false);
    }
    // `key` her render'da yeniden üretiliyor ama yalnız `i18nPrefix`e bağlı;
    // bağımlılığa eklemek callback'i her karede tazelerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedPack,
    purchasing,
    userId,
    t,
    onClose,
    onPurchased,
    flow,
    purchasePack,
    analyticsKind,
    i18nPrefix,
    toastIcon,
  ]);

  const ctaLabel = purchasing
    ? ""
    : selectedPack?.priceString
      ? t(key("ctaWithPrice"), { price: selectedPack.priceString })
      : t(key("cta"));

  const footer = (
    <BlurView
      intensity={70}
      tint={plainBlurTint()}
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 24,
        borderTopWidth: 0.5,
        borderTopColor: colors.hairlineSoft,
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
            hasSelection && !purchasing ? colors.litPlus : ink(0.15),
          paddingVertical: 18,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            // Seçim varken zemin litPlus dolgusu → yazı `onMedia` (açık modda
            // da beyaz). Seçim yokken zemin nötr → moda uyan soluk mürekkep.
            color: hasSelection ? colors.onMedia : ink(0.5),
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {ctaLabel}
        </Text>
        {purchasing && (
          <ActivityIndicator
            size="small"
            color={colors.onMedia}
            style={{ position: "absolute" }}
          />
        )}
      </TouchableOpacity>
      {/* İkincil çıkış — yalnız kurtarma sheet'inde ve yalnız free'de dolu.
          Butonu değil bağlantı görünümünü seçiyoruz: burada satılan ürün paket,
          abonelik ikinci bir seçenek. */}
      {secondaryAction && !purchasing && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={secondaryAction.onPress}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          style={{ marginTop: 12, alignSelf: "center" }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              fontWeight: "600",
              textDecorationLine: "underline",
            }}
          >
            {secondaryAction.label}
          </Text>
        </TouchableOpacity>
      )}
      <Text
        style={{
          marginTop: 10,
          marginHorizontal: 10,
          color: colors.textMuted,
          fontSize: 11,
          textAlign: "center",
          lineHeight: 15,
        }}
      >
        {t(key("disclaimer"))}
      </Text>
    </BlurView>
  );

  return (
    <AppBottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={snapPoints}
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
          {t(key("title"))}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {t(key("description"))}
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.text} style={{ marginTop: 40 }} />
        ) : packs.length === 0 ? (
          // RC offering'i yok/boş (config eksik ya da ağ). Sabit paket listesine
          // DÜŞMÜYORUZ: fiyatı ve ürünü uyduramayız, satın alma da yapılamaz.
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              textAlign: "center",
              lineHeight: 19,
              marginTop: 30,
              paddingHorizontal: 12,
            }}
          >
            {t(key("unavailableMessage"))}
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
                    borderColor: isSelected ? colors.text : ink(0.2),
                    overflow: "hidden",
                    opacity: !hasSelection || isSelected ? 1 : 0.45,
                  }}
                >
                  <BlurView
                    intensity={70}
                    tint={plainBlurTint()}
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingVertical: 22,
                    }}
                  >
                    {renderGlyph(50, colors.text)}
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: "700",
                        marginTop: 8,
                      }}
                      numberOfLines={1}
                    >
                      {pack.credits != null
                        ? t(key("packLabel"), { count: pack.credits })
                        : (pack.title ?? pack.productId)}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
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
